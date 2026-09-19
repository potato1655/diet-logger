import json
import base64
from io import BytesIO
from PIL import Image
from flask import request, jsonify, send_from_directory, current_app
from datetime import datetime, timezone
import requests as http_requests


import math

def safe_float(value, default=0.0):
    try:
        if value is None:
            return default
        number = float(value)
        if not math.isfinite(number):
            return default
        return number
    except (TypeError, ValueError):
        return default

def validate_json_dict(data):
    if not isinstance(data, dict):
        return False
    return True

from auth import load_credentials
from fit import log_to_google_health
from gemini_client import call_gemini_with_retry
from groq_client import call_groq_summary

def init_routes(app):
    @app.route('/')
    def index():
        return send_from_directory('static', 'index.html')

    @app.route('/<path:path>')
    def static_files(path):
        return send_from_directory('static', path)

    @app.route('/analyze', methods=['POST'])
    def analyze():
        data = request.get_json(silent=True)
        if not validate_json_dict(data):
            return jsonify({'success': False, 'error': 'Invalid JSON body'}), 400
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
            return jsonify({'success': False, 'error': 'AI returned an invalid response.'}), 500
        except Exception as e:
            current_app.logger.error(f"Analyze error: {e}", exc_info=True)
            return jsonify({'success': False, 'error': 'An internal server error occurred.'}), 500

    @app.route('/refine', methods=['POST'])
    def refine():
        data = request.get_json(silent=True)
        if not validate_json_dict(data):
            return jsonify({'success': False, 'error': 'Invalid JSON body'}), 400
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
            return jsonify({'success': False, 'error': 'An internal server error occurred.'}), 500

    @app.route('/analyze/meal-summary', methods=['POST'])
    def analyze_meal_summary():
        data = request.get_json(silent=True)
        if not validate_json_dict(data):
            return jsonify({'success': False, 'error': 'Invalid JSON body'}), 400
        if 'meal' not in data:
            return jsonify({'success': False, 'error': 'No meal data provided'}), 400
        meal = data.get('meal')
        prompt = f"""You are a helpful and encouraging nutrition AI.
I just ate this meal:
{json.dumps(meal, indent=2)}

Give a very brief (1-3 sentences) insight into this meal. Mention if it's well-balanced, what macros/micros stand out, or what I could pair it with next time to improve it. Keep it conversational, friendly, and short. Do not use markdown headers, just plain text or simple bolding."""
        try:
            summary = call_groq_summary(prompt)
            return jsonify({'success': True, 'summary': summary.strip()})
        except Exception as e:
            current_app.logger.error(f"Meal summary error: {e}", exc_info=True)
            return jsonify({'success': False, 'error': 'An internal server error occurred.'}), 500

    @app.route('/analyze/week-summary', methods=['POST'])
    def analyze_week_summary():
        data = request.get_json(silent=True)
        if not validate_json_dict(data):
            return jsonify({'success': False, 'error': 'Invalid JSON body'}), 400
        if 'meals' not in data:
            return jsonify({'success': False, 'error': 'No meals provided'}), 400
            
        meals = data.get('meals')
        
        # Summarize by day to keep the prompt size reasonable
        summary_data = []
        for m in meals:
            summary_data.append({
                'date': m.get('id', '')[:10],
                'type': m.get('meal_type'),
                'calories': m.get('totals', {}).get('calories', 0),
                'protein': m.get('totals', {}).get('protein_g', 0),
                'carbs': m.get('totals', {}).get('carbs_g', 0),
                'fat': m.get('totals', {}).get('fat_g', 0),
                'fiber': m.get('totals', {}).get('fiber_g', 0),
            })
            
        prompt = f"""You are a helpful and encouraging nutrition AI.
Here is a summary of my logged meals over the past few days (up to 7 days):
{json.dumps(summary_data, indent=2)}

Give me a high-level summary of my eating habits. Highlight what I am doing well, what I might be missing out on (e.g., low protein, low fiber), and general suggestions for improvement. Keep it to 2-3 short paragraphs. Be motivating!"""
        try:
            summary = call_groq_summary(prompt)
            return jsonify({'success': True, 'summary': summary.strip()})
        except Exception as e:
            current_app.logger.error(f"Week summary error: {e}", exc_info=True)
            return jsonify({'success': False, 'error': 'An internal server error occurred.'}), 500

    @app.route('/log', methods=['POST'])
    def log_meal():
        data = request.get_json(silent=True)
        if not validate_json_dict(data):
            return jsonify({'success': False, 'error': 'Invalid JSON body'}), 400
            
        meal_type = str(data.get('meal_type', 'Lunch'))
        foods = data.get('foods')
        if not isinstance(foods, list):
            return jsonify({'success': False, 'error': 'foods must be a list'}), 400
            
        valid_foods = []
        for f in foods:
            if not isinstance(f, dict):
                continue
            micros_dict = f.get('micros', {})
            valid_micros = {}
            if isinstance(micros_dict, dict):
                for k, v in micros_dict.items():
                    valid_micros[str(k)] = safe_float(v)

            valid_foods.append({
                'name': str(f.get('name', 'Unknown')),
                'quantity': str(f.get('quantity', '1 serving')),
                'calories': safe_float(f.get('calories')),
                'protein_g': safe_float(f.get('protein_g')),
                'carbs_g': safe_float(f.get('carbs_g')),
                'fat_g': safe_float(f.get('fat_g')),
                'fiber_g': safe_float(f.get('fiber_g')),
                'micros': valid_micros
            })
        foods = valid_foods

        totals = {
            'calories':  round(sum(f['calories'] for f in foods), 1),
            'protein_g': round(sum(f['protein_g'] for f in foods), 1),
            'carbs_g':   round(sum(f['carbs_g'] for f in foods), 1),
            'fat_g':     round(sum(f['fat_g'] for f in foods), 1),
            'fiber_g':   round(sum(f['fiber_g'] for f in foods), 1),
        }

        time_str = data.get('time')
        timestamp = data.get('timestamp')
        health_ok, health_msg, fit_dataset_ids = log_to_google_health(foods, meal_type, time_str, timestamp)
        
        base_time = datetime.now(timezone.utc)
        if timestamp:
            base_time = datetime.fromtimestamp(timestamp / 1000.0, timezone.utc)
        elif time_str:
            try:
                h, m = map(int, time_str.split(':'))
                local_now = datetime.now()
                local_meal_time = local_now.replace(hour=h, minute=m, second=0, microsecond=0)
                base_time = local_meal_time.astimezone(timezone.utc)
            except Exception:
                pass
        if fit_dataset_ids:
            for idx, f in enumerate(foods):
                if idx < len(fit_dataset_ids):
                    f['_delete_dataset'] = fit_dataset_ids[idx]
                    
        entry = {
            'id':        base_time.isoformat(),
            'date':      base_time.strftime('%Y-%m-%d'),
            'time':      base_time.strftime('%H:%M'),
            'meal_type': meal_type,
            'foods':     foods,
            'totals':    totals,
            'fit_dataset_ids': fit_dataset_ids,
        }

        if not health_ok:
            return jsonify({
                'success': False,
                'error': health_msg
            }), 500

        return jsonify({
            'success': True,
            'health_logged': True,
            'entry': entry,
        })

    @app.route('/history')
    def history():
        creds = load_credentials()
        if not creds or not creds.valid:
            return jsonify([])
        
        headers = {'Authorization': f'Bearer {creds.token}'}
        url = 'https://health.googleapis.com/v4/users/me/dataTypes/nutrition-log/dataPoints'
        
        r = http_requests.get(url, headers=headers)
        if r.status_code == 403 or r.status_code == 401:
            return jsonify([])
            
        if r.status_code != 200:
            current_app.logger.error(f"Error fetching history from Google Health: {r.status_code} - {r.text}")
            return jsonify([])
            
        points = r.json().get('dataPoints', [])
        meals = []
        
        for p in points:
            log = p.get('nutritionLog', {})
            interval = log.get('interval', {})
            start_str = interval.get('startTime')
            if not start_str: continue
            
            try:
                # startTime is ISO 8601 like 2026-09-18T20:00:00Z
                dt = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
                p_start = int(dt.timestamp() * 1e9)
            except Exception:
                continue
                
            food_name = log.get('foodDisplayName', 'Unknown Food')
            meal_type_str = log.get('mealType', 'SNACK')
            # Normalize meal type for frontend ('BREAKFAST' -> 'Breakfast')
            meal_type_str = meal_type_str.capitalize()
            
            food_obj = {'name': food_name}
            food_obj['calories'] = log.get('energy', {}).get('kcal', 0)
            food_obj['carbs_g'] = log.get('totalCarbohydrate', {}).get('grams', 0)
            food_obj['fat_g'] = log.get('totalFat', {}).get('grams', 0)
            
            nutrients = log.get('nutrients', [])
            for n in nutrients:
                nut = n.get('nutrient')
                q = n.get('quantity', {}).get('grams', 0)
                if nut == 'PROTEIN': food_obj['protein_g'] = q
                elif nut == 'DIETARY_FIBER': food_obj['fiber_g'] = q
                else:
                    if 'micros' not in food_obj: food_obj['micros'] = {}
                    food_obj['micros'][nut] = q
            
            food_obj['_delete_dataset'] = p.get('name')
            
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
        data = request.get_json(silent=True)
        if not validate_json_dict(data):
            return jsonify({'success': False, 'error': 'Invalid JSON body'}), 400
        foods_to_delete = data.get('foods')
        if not isinstance(foods_to_delete, list):
            return jsonify({'success': False, 'error': 'foods must be a list'}), 400
        
        creds = load_credentials()
        if not creds or not creds.valid:
            return jsonify({'success': False, 'error': 'Not authenticated'}), 401
            
        headers = {'Authorization': f'Bearer {creds.token}', 'Content-Type': 'application/json'}
        errors = []
        
        names_to_delete = []
        for f in foods_to_delete:
            name = f.get('_delete_dataset')
            if name:
                names_to_delete.append(name)
                
        if names_to_delete:
            url = 'https://health.googleapis.com/v4/users/me/dataTypes/nutrition-log/dataPoints:batchDelete'
            r = http_requests.post(url, headers=headers, json={"names": names_to_delete})
            
            if r.status_code == 401 or r.status_code == 403:
                return jsonify({'success': False, 'error': 'REAUTH_REQUIRED'}), 401
                
            if r.status_code not in (200, 204):
                return jsonify({'success': False, 'error': f"Could not delete: {r.text}"}), 500
                    
        return jsonify({'success': True})

