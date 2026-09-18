import json
import base64
from io import BytesIO
from PIL import Image
from flask import request, jsonify, send_from_directory, current_app
from datetime import datetime, timezone
import requests as http_requests

from auth import load_credentials
from fit import log_to_google_fit, ensure_data_source, ns_now
from gemini_client import call_gemini_with_retry

def init_routes(app):
    @app.route('/')
    def index():
        return send_from_directory('static', 'index.html')

    @app.route('/<path:path>')
    def static_files(path):
        return send_from_directory('static', path)

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
      "micros": {
         "sugar_g": 0,
         "cholesterol_mg": 0,
         "sodium_mg": 0,
         "potassium_mg": 0,
         "vitamin_a_iu": 0,
         "vitamin_c_mg": 0,
         "vitamin_d_iu": 0,
         "vitamin_e_mg": 0,
         "vitamin_k_mcg": 0,
         "thiamin_mg": 0,
         "riboflavin_mg": 0,
         "niacin_mg": 0,
         "vitamin_b6_mg": 0,
         "folate_mcg": 0,
         "vitamin_b12_mcg": 0,
         "biotin_mcg": 0,
         "pantothenic_mg": 0,
         "choline_mg": 0,
         "calcium_mg": 0,
         "iron_mg": 0,
         "magnesium_mg": 0,
         "phosphorus_mg": 0,
         "zinc_mg": 0,
         "selenium_mcg": 0,
         "copper_mcg": 0,
         "manganese_mg": 0,
         "chromium_mcg": 0,
         "iodine_mcg": 0,
         "molybdenum_mcg": 0,
         "fluoride_mg": 0,
         "omega_3_g": 0,
         "omega_6_g": 0,
         "epa_dha_mg": 0
      }
    }
  ],
  "questions": [
    "Is that ghee on the roti?"
  ]
}
Include any of the micronutrient fields in the `micros` dictionary if they are present or can be reasonably estimated. If unknown, they can be 0.
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
            return jsonify({'success': False, 'error': f'AI returned invalid JSON: {e}'}), 500
        except Exception as e:
            current_app.logger.error(f"Analyze error: {e}", exc_info=True)
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
            current_app.logger.error(f"Refine error: {e}", exc_info=True)
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

        time_str = data.get('time')
        health_ok, health_msg, fit_dataset_ids = log_to_google_fit(foods, meal_type, time_str)
        
        base_time = datetime.now(timezone.utc)
        if time_str:
            try:
                h, m = map(int, time_str.split(':'))
                local_now = datetime.now()
                local_meal_time = local_now.replace(hour=h, minute=m, second=0, microsecond=0)
                base_time = local_meal_time.astimezone(timezone.utc)
            except Exception:
                pass
                
        entry = {
            'id':        base_time.isoformat(),
            'date':      datetime.now().strftime('%Y-%m-%d'),
            'time':      time_str or datetime.now().strftime('%H:%M'),
            'meal_type': meal_type,
            'foods':     foods,
            'totals':    totals,
            'fit_dataset_ids': fit_dataset_ids,
        }

        return jsonify({
            'success':      True,
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
            current_app.logger.error(f"Error fetching history from Google Fit: {r.status_code} - {r.text}")
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
                else:
                    if 'micros' not in food_obj:
                        food_obj['micros'] = {}
                    food_obj['micros'][k] = v
                
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
        
        try:
            ds_id = ensure_data_source(headers)
        except Exception as e:
            return jsonify({'success': False, 'error': f"Failed to get app data source: {e}"}), 500
            
        for f in foods_to_delete:
            dset = f.get('_delete_dataset')
            
            if dset:
                start_ns = dset.split('-')[0]
                surgical_dset = f"{start_ns}-{int(start_ns) + 1}"
                
                url = f'https://www.googleapis.com/fitness/v1/users/me/dataSources/{ds_id}/datasets/{surgical_dset}'
                r = http_requests.delete(url, headers=headers)
                if r.status_code not in (200, 204):
                    errors.append(f"Could not delete: {r.text}")
                    
        if errors:
            return jsonify({'success': False, 'error': '; '.join(errors)}), 500
            
        return jsonify({'success': True})
