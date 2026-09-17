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

from config import GEMINI_API_KEYS, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI, PORT

# ── App setup ────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'default-dev-key-12345')
CORS(app, supports_credentials=True)

@app.errorhandler(Exception)
def handle_exception(e):
    # Log the exception for debugging
    print(f"Unhandled Exception: {e}")
    # Return JSON instead of HTML for all unhandled errors
    return jsonify({
        "success": False,
        "error": str(e),
        "type": type(e).__name__
    }), 500


# ── Gemini setup ─────────────────────────────────────────────────────────────
import random
gemini_clients = [genai.Client(api_key=key) for key in GEMINI_API_KEYS]

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
    data = session.get('google_token')
    if not data:
        # Fallback to local file just in case for older sessions
        if os.path.exists(TOKEN_FILE):
            with open(TOKEN_FILE) as f:
                data = json.load(f)
        else:
            return None
            
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
        except Exception as e:
            print(f"Token refresh failed: {e}")
            return None
    return creds


def save_token(creds):
    data = {'token': creds.token, 'refresh_token': creds.refresh_token}
    session['google_token'] = data
    # Also save to file as backup for development
    try:
        with open(TOKEN_FILE, 'w') as f:
            json.dump(data, f)
    except Exception:
        pass


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
    # First, list data sources to see if it already exists with a project ID suffix
    ds_resp = http_requests.get('https://www.googleapis.com/fitness/v1/users/me/dataSources', headers=headers)
    if ds_resp.status_code == 200:
        for d in ds_resp.json().get('dataSource', []):
            if 'diet_logger' in d.get('dataStreamId', ''):
                return d.get('dataStreamId')

    # If not found, attempt to create it
    ds_id = 'raw:com.google.nutrition:diet_logger'
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
    
    # If we get a 409 Conflict, it exists but we missed it in the list (or it was just created)
    # The error message looks like: "Data Source: raw:com.google.nutrition:1234:diet_logger already exists"
    if r.status_code == 409:
        err_msg = r.json().get('error', {}).get('message', '')
        if 'already exists' in err_msg:
            # Extract the raw ID from the error message
            parts = err_msg.split('Data Source: ')
            if len(parts) > 1:
                return parts[1].split(' already exists')[0].strip()
            
    raise RuntimeError(f'Could not create data source: {r.text}')


def log_to_google_fit(foods, meal_type):
    """Push each food item as a nutrition data point to Google Fit."""
    creds = load_credentials()
    if not creds:
        return False, 'Not authenticated: credentials file missing.'
    if not creds.valid:
        if creds.expired and not creds.refresh_token:
            return False, 'Not authenticated: token expired and no refresh token available. Please sign in again.'
        return False, f'Not authenticated: creds.valid={creds.valid}, expired={creds.expired}, has_refresh={bool(creds.refresh_token)}'

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

    dataset_ids = []
    
    for food in foods:
        end_ns = ns_now()
        start_ns = end_ns - int(15 * 60 * 1e9)  # 15 minutes prior

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
        
        # Dynamically add micronutrients if present and > 0
        if float(food.get('sugar_g', 0)) > 0:
            point['value'][0]['mapVal'].append({'key': 'sugar', 'value': {'fpVal': float(food['sugar_g'])}})
        if float(food.get('cholesterol_mg', 0)) > 0:
            point['value'][0]['mapVal'].append({'key': 'cholesterol', 'value': {'fpVal': float(food['cholesterol_mg'])}})
        if float(food.get('sodium_mg', 0)) > 0:
            point['value'][0]['mapVal'].append({'key': 'sodium', 'value': {'fpVal': float(food['sodium_mg'])}})
        if float(food.get('potassium_mg', 0)) > 0:
            point['value'][0]['mapVal'].append({'key': 'potassium', 'value': {'fpVal': float(food['potassium_mg'])}})
        if float(food.get('vitamin_a_iu', 0)) > 0:
            point['value'][0]['mapVal'].append({'key': 'vitamin_a', 'value': {'fpVal': float(food['vitamin_a_iu'])}})
        if float(food.get('vitamin_c_mg', 0)) > 0:
            point['value'][0]['mapVal'].append({'key': 'vitamin_c', 'value': {'fpVal': float(food['vitamin_c_mg'])}})
        if float(food.get('calcium_mg', 0)) > 0:
            point['value'][0]['mapVal'].append({'key': 'calcium', 'value': {'fpVal': float(food['calcium_mg'])}})
        if float(food.get('iron_mg', 0)) > 0:
            point['value'][0]['mapVal'].append({'key': 'iron', 'value': {'fpVal': float(food['iron_mg'])}})

        dataset_id = f'{start_ns}-{end_ns}'
        dataset_ids.append(dataset_id)
        
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
        return False, '; '.join(errors), []
    return True, 'Logged to Google Health successfully', dataset_ids


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
    session.pop('google_token', None)
    if os.path.exists(TOKEN_FILE):
        try:
            os.remove(TOKEN_FILE)
        except OSError:
            pass
    return jsonify({'success': True})


@app.route('/auth/status')
def auth_status():
    creds = load_credentials()
    if creds and creds.valid:
        return jsonify({'authenticated': True})
    return jsonify({'authenticated': False})


@app.route('/debug/fit')
def debug_fit():
    creds = load_credentials()
    if not creds or not creds.valid:
        return jsonify({'error': 'Not authenticated'})
    
    headers = {'Authorization': f'Bearer {creds.token}'}
    # List all data sources
    ds_resp = http_requests.get('https://www.googleapis.com/fitness/v1/users/me/dataSources', headers=headers)
    
    # Try fetching the last 30 days of nutrition data
    end_ns = ns_now()
    start_ns = end_ns - (30 * 24 * 60 * 60 * 1000000000)
    
    ds_list = ds_resp.json().get('dataSource', [])
    datasets = []
    for d in ds_list:
        if d.get('dataType', {}).get('name') == 'com.google.nutrition':
            ds_id = d.get('dataStreamId')
            dataset_url = f'https://www.googleapis.com/fitness/v1/users/me/dataSources/{ds_id}/datasets/{start_ns}-{end_ns}'
            dataset_resp = http_requests.get(dataset_url, headers=headers)
            if dataset_resp.status_code == 200:
                pts = dataset_resp.json().get('point', [])
                if pts:
                    datasets.append({
                        'dataSourceId': ds_id,
                        'point_count': len(pts),
                        'points': pts
                    })
        
    # Also fetch aggregated nutrition to see if Google Fit recognized it
    agg_body = {
      "aggregateBy": [{ "dataTypeName": "com.google.nutrition" }],
      "bucketByTime": { "durationMillis": 86400000 },
      "startTimeMillis": int(start_ns / 1e6),
      "endTimeMillis": int(end_ns / 1e6)
    }
    agg_resp = http_requests.post('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', headers=headers, json=agg_body)

    return jsonify({
        'dataSources_count': len(ds_list),
        'datasets_with_data': datasets,
        'aggregated': agg_resp.json()
    })


import time

def call_gemini_with_retry(prompt, img_bytes=None):
    clients_to_try = list(gemini_clients)
    random.shuffle(clients_to_try)
    
    last_exception = None
    for attempt, client in enumerate(clients_to_try):
        try:
            if img_bytes:
                contents = [
                    prompt,
                    genai.types.Part.from_bytes(data=img_bytes, mime_type='image/jpeg'),
                ]
            else:
                contents = [prompt]
                
            return client.models.generate_content(
                model='gemini-3.6-flash',
                contents=contents,
            )
        except Exception as e:
            last_exception = e
            if '429' in str(e) or 'RESOURCE_EXHAUSTED' in str(e) or '503' in str(e):
                # If we have more keys to try, sleep briefly and continue
                if attempt < len(clients_to_try) - 1:
                    time.sleep(1)
                    continue
                else:
                    raise
            else:
                raise
    
    if last_exception:
        raise last_exception


@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No JSON payload received'}), 400
    image_b64 = data.get('image', '')
    extra_text = data.get('text', '').strip()

    prompt = """You are a nutrition expert. Analyze this image carefully.
It may be a photo of food, a nutrition label, a multivitamin packet, or a screenshot of a food delivery receipt/order.

1. If it's a food photo, list EVERY visible food item with realistic portion estimates.
2. If it's a receipt or order, list every food item ordered and estimate its macros based on standard restaurant portions.
3. If it's a multivitamin or nutrition label, extract the exact vitamins and minerals listed.

Return ONLY a valid JSON object matching this exact structure — no explanation, no markdown:
{
  "foods": [
    {
      "name": "Food/Pill name",
      "quantity": "Estimated amount",
      "calories": 300,
      "protein_g": 8.0,
      "carbs_g": 55.0,
      "fat_g": 5.0,
      "fiber_g": 2.0,
      "sugar_g": 0,
      "cholesterol_mg": 0,
      "sodium_mg": 0,
      "potassium_mg": 0,
      "vitamin_a_iu": 0,
      "vitamin_c_mg": 0,
      "calcium_mg": 0,
      "iron_mg": 0
    }
  ],
  "questions": [
    "Is that ghee on the roti?"
  ]
}
Include the micronutrient fields (sugar, cholesterol, vitamins, etc.) even if they are 0.
"""

    if extra_text:
        prompt += f'\n\nUser note: {extra_text}'

    try:
        img_bytes = base64.b64decode(image_b64)
        img = Image.open(BytesIO(img_bytes)).convert('RGB')
        if max(img.size) > 1024:
            img.thumbnail((1024, 1024))
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=85)
        img_bytes = buf.getvalue()

        response = call_gemini_with_retry(prompt, img_bytes)

        raw = response.text.strip()
        for fence in ('```json', '```'):
            if fence in raw:
                raw = raw.split(fence, 1)[1].rsplit('```', 1)[0].strip()
                break

        parsed = json.loads(raw)
        if isinstance(parsed, list):
            foods = parsed
            questions = []
        else:
            foods = parsed.get('foods', [])
            questions = parsed.get('questions', [])

        return jsonify({'success': True, 'foods': foods, 'questions': questions})

    except json.JSONDecodeError as e:
        return jsonify({'success': False, 'error': f'AI returned invalid JSON: {e}', 'raw': response.text}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/refine', methods=['POST'])
def refine():
    data = request.get_json()
    food = data.get('food', {})
    text = data.get('text', '').strip()
    
    prompt = f"""You are a nutrition expert.
I have this food item and its current macros:
{json.dumps(food, indent=2)}

The user says: "{text}"

Update the portion and macros based on the user's feedback.
Return ONLY a valid JSON object matching the exact structure above. No explanation, no markdown.
"""
    try:
        response = call_gemini_with_retry(prompt)
        raw = response.text.strip()
        for fence in ('```json', '```'):
            if fence in raw:
                raw = raw.split(fence, 1)[1].rsplit('```', 1)[0].strip()
                break
        updated_food = json.loads(raw)
        return jsonify({'success': True, 'food': updated_food})
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

    health_ok, health_msg, fit_dataset_ids = log_to_google_fit(foods, meal_type)
    
    entry = {
        'id':        datetime.now(timezone.utc).isoformat(),
        'date':      datetime.now().strftime('%Y-%m-%d'),
        'time':      datetime.now().strftime('%H:%M'),
        'meal_type': meal_type,
        'foods':     foods,
        'totals':    totals,
        'fit_dataset_ids': fit_dataset_ids,
    }

    return jsonify({
        'success':      True,
        'local_saved':  True,
        'health_logged': health_ok,
        'health_message': health_msg,
        'entry':        entry,
    })


@app.route('/history')
def history():
    creds = load_credentials()
    if not creds or not creds.valid:
        return jsonify([])
    
    headers = {'Authorization': f'Bearer {creds.token}'}
    
    end_ns = ns_now()
    start_ns = end_ns - int(7 * 24 * 60 * 60 * 1000000000)
    
    merged_ds = "derived:com.google.nutrition:com.google.android.gms:merged"
    url = f'https://www.googleapis.com/fitness/v1/users/me/dataSources/{merged_ds}/datasets/{start_ns}-{end_ns}'
    
    r = http_requests.get(url, headers=headers)
    if r.status_code != 200:
        return jsonify([])
        
    points = r.json().get('point', [])
    meals = []
    
    for p in points:
        p_start = int(p.get('startTimeNanos', 0))
        p_end = int(p.get('endTimeNanos', 0))
        
        vals = p.get('value', [])
        if len(vals) < 3:
            continue
            
        nutrients = vals[0].get('mapVal', [])
        meal_type_int = vals[1].get('intVal', 2)
        food_name = vals[2].get('stringVal', 'Unknown Food')
        
        rev_meal_map = {1: 'Breakfast', 2: 'Lunch', 3: 'Dinner', 4: 'Snack', 5: 'Other'}
        meal_type_str = rev_meal_map.get(meal_type_int, 'Other')
        
        food_obj = {'name': food_name}
        for n in nutrients:
            k = n.get('key')
            v = n.get('value', {}).get('fpVal', 0)
            if k == 'calories': food_obj['calories'] = v
            elif k == 'protein': food_obj['protein_g'] = v
            elif k == 'fat.total': food_obj['fat_g'] = v
            elif k == 'carbs.total': food_obj['carbs_g'] = v
            elif k == 'dietary_fiber': food_obj['fiber_g'] = v
            elif k == 'sugar': food_obj['sugar_g'] = v
            elif k == 'cholesterol': food_obj['cholesterol_mg'] = v
            elif k == 'sodium': food_obj['sodium_mg'] = v
            elif k == 'potassium': food_obj['potassium_mg'] = v
            elif k == 'vitamin_a': food_obj['vitamin_a_iu'] = v
            elif k == 'vitamin_c': food_obj['vitamin_c_mg'] = v
            elif k == 'calcium': food_obj['calcium_mg'] = v
            elif k == 'iron': food_obj['iron_mg'] = v
            
        food_obj['_delete_ds'] = p.get('originDataSourceId')
        food_obj['_delete_dataset'] = f"{p_start}-{p_end}"
        
        matched_meal = None
        for m in meals:
            if m['meal_type'] == meal_type_str and abs(m['_base_ns'] - p_start) < (300 * 1e9):
                matched_meal = m
                break
                
        if matched_meal:
            matched_meal['foods'].append(food_obj)
        else:
            iso_time = datetime.fromtimestamp(p_start / 1e9, timezone.utc).isoformat()
            meals.append({
                'id': iso_time,
                '_base_ns': p_start,
                'meal_type': meal_type_str,
                'foods': [food_obj],
            })

    meals.sort(key=lambda x: x['_base_ns'], reverse=True)
    
    for m in meals:
        totals = {'calories': 0, 'protein_g': 0, 'carbs_g': 0, 'fat_g': 0, 'fiber_g': 0}
        for f in m['foods']:
            totals['calories'] += f.get('calories', 0)
            totals['protein_g'] += f.get('protein_g', 0)
            totals['carbs_g'] += f.get('carbs_g', 0)
            totals['fat_g'] += f.get('fat_g', 0)
            totals['fiber_g'] += f.get('fiber_g', 0)
        
        for k in totals:
            totals[k] = round(totals[k], 1)
        m['totals'] = totals

    return jsonify(meals)


@app.route('/log/delete', methods=['POST'])
def delete_log():
    data = request.get_json()
    foods_to_delete = data.get('foods', [])
    
    creds = load_credentials()
    if not creds or not creds.valid:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
        
    headers = {'Authorization': f'Bearer {creds.token}'}
    errors = []
    
    for f in foods_to_delete:
        ds = f.get('_delete_ds')
        dset = f.get('_delete_dataset')
        if ds and dset:
            url = f'https://www.googleapis.com/fitness/v1/users/me/dataSources/{ds}/datasets/{dset}'
            r = http_requests.delete(url, headers=headers)
            if r.status_code not in (200, 204):
                errors.append(f"Failed to delete: {r.text}")
                
    if errors:
        return jsonify({'success': False, 'error': '; '.join(errors)}), 500
        
    return jsonify({'success': True})


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

