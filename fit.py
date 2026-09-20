import requests as http_requests
from datetime import datetime, timezone, timedelta
from auth import load_credentials

def log_to_google_health(foods, meal_type, time_str=None, timestamp=None):
    creds = load_credentials()
    if not creds:
        return False, 'Not authenticated: credentials missing.', []
    if not creds.valid:
        if creds.expired and not creds.refresh_token:
            return False, 'Not authenticated: token expired and no refresh token available.', []
        return False, f'Not authenticated: creds.valid={creds.valid}, expired={creds.expired}', []

    headers = {
        'Authorization': f'Bearer {creds.token}',
        'Content-Type': 'application/json',
    }

    meal_type_upper = meal_type.upper()
    if meal_type_upper not in ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'):
        meal_type_upper = 'SNACK'

    errors = []
    dataset_ids = []
    
    # We MUST use the explicit UTC timestamp per constraints.
    # If the frontend didn't pass timestamp but passed time_str, we fallback to today.
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

    for i, food in enumerate(foods):
        end_time = base_time + timedelta(milliseconds=i)
        start_time = end_time - timedelta(minutes=15)
        
        # Build nutrition log payload
        # Nutrient mappings from UI fields (mg, mcg, g) to Google Health Enums (grams)
        nutrients_list = [
            { "nutrient": "PROTEIN", "quantity": { "grams": float(food.get('protein_g', 0)) } },
            { "nutrient": "DIETARY_FIBER", "quantity": { "grams": float(food.get('fiber_g', 0)) } }
        ]
        
        micros_map = {
            'sugar_g': ('SUGAR', 1.0),
            'cholesterol_mg': ('CHOLESTEROL', 1e-3),
            'sodium_mg': ('SODIUM', 1e-3),
            'potassium_mg': ('POTASSIUM', 1e-3),
            'calcium_mg': ('CALCIUM', 1e-3),
            'iron_mg': ('IRON', 1e-3),
            'magnesium_mg': ('MAGNESIUM', 1e-3),
            'phosphorus_mg': ('PHOSPHORUS', 1e-3),
            'zinc_mg': ('ZINC', 1e-3),
            'selenium_mcg': ('SELENIUM', 1e-6),
            'copper_mcg': ('COPPER', 1e-6),
            'manganese_mg': ('MANGANESE', 1e-3),
            'chromium_mcg': ('CHROMIUM', 1e-6),
            'iodine_mcg': ('IODINE', 1e-6),
            'molybdenum_mcg': ('MOLYBDENUM', 1e-6),
            'biotin_mcg': ('BIOTIN', 1e-6),
            'thiamin_mg': ('THIAMIN', 1e-3),
            'riboflavin_mg': ('RIBOFLAVIN', 1e-3),
            'niacin_mg': ('NIACIN', 1e-3),
            'pantothenic_mg': ('PANTOTHENIC_ACID', 1e-3),
            'vitamin_b6_mg': ('VITAMIN_B6', 1e-3),
            'vitamin_b12_mcg': ('VITAMIN_B12', 1e-6),
            'vitamin_c_mg': ('VITAMIN_C', 1e-3),
            'vitamin_e_mg': ('VITAMIN_E', 1e-3),
            'vitamin_k_mcg': ('VITAMIN_K', 1e-6),
            'folate_mcg': ('FOLATE', 1e-6),
            'saturated_fat_g': ('SATURATED_FAT', 1.0),
            'trans_fat_g': ('TRANS_FAT', 1.0)
        }
        
        for micro_key, val in food.get('micros', {}).items():
            if micro_key in micros_map:
                enum_name, multiplier = micros_map[micro_key]
                try:
                    grams = float(val) * multiplier
                    nutrients_list.append({"nutrient": enum_name, "quantity": {"grams": grams}})
                except (ValueError, TypeError):
                    pass
                    
        body = {
            "nutritionLog": {
                "interval": {
                    "startTime": start_time.isoformat(),
                    "endTime": end_time.isoformat()
                },
                "foodDisplayName": food.get('name', 'Unknown'),
                "mealType": meal_type_upper,
                "energy": { "kcal": float(food.get('calories', 0)) },
                "totalCarbohydrate": { "grams": float(food.get('carbs_g', 0)) },
                "totalFat": { "grams": float(food.get('fat_g', 0)) },
                "nutrients": nutrients_list,
                "serving": { "amount": 1.0 }
            }
        }
        
        url = 'https://health.googleapis.com/v4/users/me/dataTypes/nutrition-log/dataPoints'
        r = http_requests.post(url, headers=headers, json=body)
        
        if r.status_code == 403 or r.status_code == 401:
            return False, 'REAUTH_REQUIRED', []
            
        if r.status_code not in (200, 201):
            errors.append(f"{food.get('name')}: {r.status_code} {r.text}")
        else:
            # The API returns the created data point which includes its full 'name' (the resource name)
            # e.g., 'users/me/dataTypes/nutrition-log/dataPoints/12345'
            created_point = r.json()
            resource_name = created_point.get('name', '')
            dataset_ids.append(resource_name)

    if errors:
        return False, '; '.join(errors), dataset_ids
    return True, 'Logged to Google Health successfully', dataset_ids
