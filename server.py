import os
import json
import base64
import socket
from datetime import datetime, timezone
from io import BytesIO

from flask import Flask, request, jsonify, redirect, session, send_from_directory
from flask_cors import CORS
from PIL import Image
from google import genai
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from google_auth_oauthlib.flow import Flow
import requests as http_requests

from config import GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI, PORT

# ── App setup ────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'default-dev-key-12345')
CORS(app, supports_credentials=True)

# ── Gemini setup ─────────────────────────────────────────────────────────────
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# ── File paths ───────────────────────────────────────────────────────────────
os.makedirs('data', exist_ok=True)
TOKEN_FILE = os.path.join('data', 'token.json')
LOG_FILE   = os.path.join('data', 'diet_log.json')

# ── Google OAuth scopes ───────────────────────────────────────────────────────
# Using Google Fitness API for nutrition (feeds into Google Health)
SCOPES = [
    'https://www.googleapis.com/auth/fitness.nutrition.write',
    'https://www.googleapis.com/auth/fitness.nutrition.read',
    'openid',
    'email',
]

MEAL_TYPE_MAP = {'Breakfast': 1, 'Lunch': 2, 'Dinner': 3, 'Snack': 4, 'Other': 5}

# ── Helpers ──────────────────────────────────────────────────────────────────

def get_client_config():
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [REDIRECT_URI],
        }
    }


def load_credentials():
    """Load stored OAuth credentials, refresh if expired."""
    if not os.path.exists(TOKEN_FILE):
        return None
    with open(TOKEN_FILE) as f:
        data = json.load(f)
    creds = Credentials(
        token=data.get('token'),
        refresh_token=data.get('refresh_token'),
        token_uri='https://oauth2.googleapis.com/token',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            save_token(creds)
        except Exception:
            return None
    return creds


def save_token(creds):
    with open(TOKEN_FILE, 'w') as f:
        json.dump({'token': creds.token, 'refresh_token': creds.refresh_token}, f)


def load_log():
    if not os.path.exists(LOG_FILE):
        return []
    with open(LOG_FILE) as f:
        return json.load(f)


def save_log(log):
    with open(LOG_FILE, 'w') as f:
        json.dump(log, f, indent=2)


def ns_now():
    """Current UTC time in nanoseconds (required by Google Fitness API)."""
    return int(datetime.now(timezone.utc).timestamp() * 1e9)


def ensure_data_source(headers):
    """
    Create the custom nutrition data source in Google Fit if it doesn't exist yet.
    Returns the data source ID.
    """
    ds_id = 'raw:com.google.nutrition:diet_logger'
    url = f'https://www.googleapis.com/fitness/v1/users/me/dataSources/{ds_id}'
    r = http_requests.get(url, headers=headers)
    if r.status_code == 200:
        return ds_id  # already exists

    # Create it
    body = {
        'dataStreamName': 'diet_logger',
        'type': 'raw',
        'application': {'name': 'Diet Logger', 'version': '1'},
        'dataType': {
            'name': 'com.google.nutrition',
            'field': [
                {'name': 'nutrients', 'format': 'map'},
                {'name': 'meal_type', 'format': 'integer'},
                {'name': 'food_item', 'format': 'string'},
            ],
        },
    }
    r = http_requests.post(
        'https://www.googleapis.com/fitness/v1/users/me/dataSources',
        headers=headers,
        json=body,
    )
    if r.status_code in (200, 201):
        return r.json().get('dataStreamId', ds_id)
    raise RuntimeError(f'Could not create data source: {r.text}')


def log_to_google_fit(foods, meal_type):
    """Push each food item as a nutrition data point to Google Fit."""
    creds = load_credentials()
    if not creds or not creds.valid:
        return False, 'Not authenticated with Google. Please sign in first.'

    headers = {
        'Authorization': f'Bearer {creds.token}',
        'Content-Type': 'application/json',
    }

    try:
        ds_id = ensure_data_source(headers)
    except RuntimeError as e:
        return False, str(e)

    meal_int = MEAL_TYPE_MAP.get(meal_type, 2)
    errors = []

    for food in foods:
        start_ns = ns_now()
        end_ns = start_ns + 1  # instant point

        point = {
            'dataTypeName': 'com.google.nutrition',
            'startTimeNanos': str(start_ns),
            'endTimeNanos': str(end_ns),
            'value': [
                {
                    'mapVal': [
                        {'key': 'calories',        'value': {'fpVal': float(food.get('calories', 0))}},
                        {'key': 'protein',         'value': {'fpVal': float(food.get('protein_g', 0))}},
                        {'key': 'fat.total',       'value': {'fpVal': float(food.get('fat_g', 0))}},
                        {'key': 'carbs.total',     'value': {'fpVal': float(food.get('carbs_g', 0))}},
                        {'key': 'dietary_fiber',   'value': {'fpVal': float(food.get('fiber_g', 0))}},
                    ]
                },
                {'intVal': meal_int},
                {'stringVal': food.get('name', 'Unknown')},
            ],
        }

        dataset_id = f'{start_ns}-{end_ns}'
        url = (
            f'https://www.googleapis.com/fitness/v1/users/me'
            f'/dataSources/{ds_id}/datasets/{dataset_id}'
        )
        body = {
            'dataSourceId': ds_id,
            'minStartTimeNs': str(start_ns),
            'maxEndTimeNs': str(end_ns),
            'point': [point],
        }
        r = http_requests.patch(url, headers=headers, json=body)
        if r.status_code not in (200, 201):
            errors.append(f"{food.get('name')}: {r.text}")

    if errors:
        return False, '; '.join(errors)
    return True, 'Logged to Google Health successfully'


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('static', path)


@app.route('/oauth/login')
def oauth_login():
    flow = Flow.from_client_config(get_client_config(), scopes=SCOPES, redirect_uri=REDIRECT_URI)
    auth_url, state = flow.authorization_url(access_type='offline', prompt='consent')
    session['oauth_state'] = state
    # Save the PKCE code verifier generated by the flow
    if hasattr(flow, 'code_verifier'):
        session['code_verifier'] = flow.code_verifier
    return redirect(auth_url)


@app.route('/oauth/callback')
def oauth_callback():
    try:
        kwargs = {}
        if 'code_verifier' in session:
            kwargs['code_verifier'] = session['code_verifier']
            
        flow = Flow.from_client_config(
            get_client_config(),
            scopes=SCOPES,
            redirect_uri=REDIRECT_URI,
            state=session.get('oauth_state'),
            **kwargs
        )
        
        # Railway proxy terminates SSL, so request.url might be http://
        # Force it to https:// if our REDIRECT_URI is https
        auth_response = request.url
        if REDIRECT_URI.startswith('https') and auth_response.startswith('http:'):
            auth_response = auth_response.replace('http:', 'https:', 1)
            
        flow.fetch_token(authorization_response=auth_response)
        save_token(flow.credentials)
        return redirect('/?auth=success')
    except Exception as e:
        import traceback
        return f"OAuth Error: {str(e)}<br><pre>{traceback.format_exc()}</pre>", 500


@app.route('/oauth/logout', methods=['POST'])
def oauth_logout():
    if os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)
    return jsonify({'success': True})


@app.route('/auth/status')
def auth_status():
    creds = load_credentials()
    if creds and creds.valid:
        return jsonify({'authenticated': True})
    return jsonify({'authenticated': False})


@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.get_json()
    image_b64 = data.get('image', '')
    extra_text = data.get('text', '').strip()

    prompt = """You are a nutrition expert. Analyze this food image carefully.

List EVERY visible food item with realistic portion estimates and nutritional values.
For Indian food (dal, rice, roti, sabzi, curry, etc.), use standard home-cooked portions.

Return ONLY a valid JSON array — no explanation, no markdown, just the array:
[
  {
    "name": "Food name (be specific, e.g. 'Basmati Rice' not just 'Rice')",
    "quantity": "Estimated amount (e.g. 1 medium bowl, 2 rotis, 150g)",
    "calories": 300,
    "protein_g": 8.0,
    "carbs_g": 55.0,
    "fat_g": 5.0,
    "fiber_g": 2.0
  }
]

If multiple food items are on the plate, list each separately."""

    if extra_text:
        prompt += f'\n\nUser note: {extra_text}'

    try:
        img_bytes = base64.b64decode(image_b64)
        img = Image.open(BytesIO(img_bytes)).convert('RGB')
        # Resize if too large (Gemini limit)
        if max(img.size) > 1024:
            img.thumbnail((1024, 1024))
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=85)
        img_bytes = buf.getvalue()

        response = gemini_client.models.generate_content(
            model='gemini-3.6-flash',
            contents=[
                prompt,
                genai.types.Part.from_bytes(data=img_bytes, mime_type='image/jpeg'),
            ],
        )

        raw = response.text.strip()
        # Strip code fences if present
        for fence in ('```json', '```'):
            if fence in raw:
                raw = raw.split(fence, 1)[1].rsplit('```', 1)[0].strip()
                break

        foods = json.loads(raw)
        return jsonify({'success': True, 'foods': foods})

    except json.JSONDecodeError as e:
        return jsonify({'success': False, 'error': f'AI returned invalid JSON: {e}', 'raw': response.text}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/log', methods=['POST'])
def log_meal():
    data = request.get_json()
    meal_type = data.get('meal_type', 'Lunch')
    foods = data.get('foods', [])

    totals = {
        'calories':  round(sum(f.get('calories',  0) for f in foods), 1),
        'protein_g': round(sum(f.get('protein_g', 0) for f in foods), 1),
        'carbs_g':   round(sum(f.get('carbs_g',   0) for f in foods), 1),
        'fat_g':     round(sum(f.get('fat_g',      0) for f in foods), 1),
        'fiber_g':   round(sum(f.get('fiber_g',    0) for f in foods), 1),
    }

    entry = {
        'id':        datetime.now(timezone.utc).isoformat(),
        'date':      datetime.now().strftime('%Y-%m-%d'),
        'time':      datetime.now().strftime('%H:%M'),
        'meal_type': meal_type,
        'foods':     foods,
        'totals':    totals,
    }

    log = load_log()
    log.append(entry)
    save_log(log)

    health_ok, health_msg = log_to_google_fit(foods, meal_type)

    return jsonify({
        'success':      True,
        'local_saved':  True,
        'health_logged': health_ok,
        'health_message': health_msg,
        'entry':        entry,
    })


@app.route('/history')
def history():
    log = load_log()
    return jsonify(list(reversed(log)))


# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    try:
        local_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        local_ip = '127.0.0.1'

    print('\n' + '='*55)
    print('  🥗  Diet Logger is running!')
    print('='*55)
    print(f'  💻  On this PC    : http://localhost:{PORT}')
    print(f'  📱  On your phone : http://{local_ip}:{PORT}')
    print('      (phone must be on the same WiFi)')
    print('='*55)
    print('  Press Ctrl+C to stop.\n')

    # Relax scope checking (Google sometimes changes scope order/names in the response)
    os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'

    # Allow OAuth redirect on http for local dev only
    if REDIRECT_URI.startswith('http://localhost'):
        os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    app.run(debug=False, host='0.0.0.0', port=PORT)

