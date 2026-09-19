import re

with open('routes.py', 'r', encoding='utf-8') as f:
    content = f.read()

history_code = """    @app.route('/history')
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
            if r.status_code not in (200, 204):
                return jsonify({'success': False, 'error': f"Could not delete: {r.text}"}), 500
                    
        return jsonify({'success': True})"""

pattern = re.compile(r"    @app\.route\('/history'\)\n    def history\(\):.*?return jsonify\(\{'success': True\}\)", re.DOTALL)
content = pattern.sub(history_code, content)

with open('routes.py', 'w', encoding='utf-8') as f:
    f.write(content)
