import os
import re

with open('routes.py', 'r', encoding='utf-8') as f:
    content = f.read()

safe_float_code = '''
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
'''

content = content.replace('from auth import load_credentials', safe_float_code + '\nfrom auth import load_credentials')

def replace_json_validation(endpoint_search, new_content):
    global content
    content = content.replace(endpoint_search, new_content)

replace_json_validation(
    "data = request.get_json()\n        image_b64 = data.get('image')",
    """data = request.get_json(silent=True)
        if not validate_json_dict(data):
            return jsonify({'success': False, 'error': 'Invalid JSON body'}), 400
        image_b64 = data.get('image')"""
)

replace_json_validation(
    "data = request.get_json()\n        original_foods = data.get('foods', [])",
    """data = request.get_json(silent=True)
        if not validate_json_dict(data):
            return jsonify({'success': False, 'error': 'Invalid JSON body'}), 400
        original_foods = data.get('foods', [])"""
)

replace_json_validation(
    "data = request.get_json()\n        meal = data.get('meal', {})",
    """data = request.get_json(silent=True)
        if not validate_json_dict(data):
            return jsonify({'success': False, 'error': 'Invalid JSON body'}), 400
        meal = data.get('meal', {})"""
)

replace_json_validation(
    "data = request.get_json()\n        foods_to_delete = data.get('foods', [])",
    """data = request.get_json(silent=True)
        if not validate_json_dict(data):
            return jsonify({'success': False, 'error': 'Invalid JSON body'}), 400
        foods_to_delete = data.get('foods')
        if not isinstance(foods_to_delete, list):
            return jsonify({'success': False, 'error': 'foods must be a list'}), 400"""
)

replace_json_validation(
    "data = request.get_json()\n        confirm = data.get('confirm')",
    """data = request.get_json(silent=True)
        if not validate_json_dict(data):
            return jsonify({'success': False, 'error': 'Invalid JSON body'}), 400
        confirm = data.get('confirm')"""
)

old_log = """    def log_meal():
        data = request.get_json()
        meal_type = data.get('meal_type', 'Lunch')
        foods = data.get('foods', [])

        totals = {
            'calories':  round(sum(f.get('calories',  0) for f in foods), 1),
            'protein_g': round(sum(f.get('protein_g', 0) for f in foods), 1),
            'carbs_g':   round(sum(f.get('carbs_g',   0) for f in foods), 1),
            'fat_g':     round(sum(f.get('fat_g',      0) for f in foods), 1),
            'fiber_g':   round(sum(f.get('fiber_g',    0) for f in foods), 1),
        }"""

new_log = """    def log_meal():
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
            valid_foods.append({
                'name': str(f.get('name', 'Unknown')),
                'quantity': str(f.get('quantity', '1 serving')),
                'calories': safe_float(f.get('calories')),
                'protein_g': safe_float(f.get('protein_g')),
                'carbs_g': safe_float(f.get('carbs_g')),
                'fat_g': safe_float(f.get('fat_g')),
                'fiber_g': safe_float(f.get('fiber_g'))
            })
        foods = valid_foods

        totals = {
            'calories':  round(sum(f['calories'] for f in foods), 1),
            'protein_g': round(sum(f['protein_g'] for f in foods), 1),
            'carbs_g':   round(sum(f['carbs_g'] for f in foods), 1),
            'fat_g':     round(sum(f['fat_g'] for f in foods), 1),
            'fiber_g':   round(sum(f['fiber_g'] for f in foods), 1),
        }"""

content = content.replace(old_log, new_log)

with open('routes.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("done")
