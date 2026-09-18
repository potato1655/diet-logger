import requests as http_requests
from datetime import datetime, timezone, timedelta
from auth import load_credentials

MEAL_TYPE_MAP = {'Breakfast': 1, 'Lunch': 2, 'Dinner': 3, 'Snack': 4, 'Other': 5}

def ns_now():
    return int(datetime.now(timezone.utc).timestamp() * 1e9)

def ensure_data_source(headers):
    ds_resp = http_requests.get('https://www.googleapis.com/fitness/v1/users/me/dataSources', headers=headers)
    if ds_resp.status_code == 200:
        for d in ds_resp.json().get('dataSource', []):
            if 'diet_logger' in d.get('dataStreamId', ''):
                return d.get('dataStreamId')

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
    
    if r.status_code == 409:
        err_msg = r.json().get('error', {}).get('message', '')
        if 'already exists' in err_msg:
            parts = err_msg.split('Data Source: ')
            if len(parts) > 1:
                return parts[1].split(' already exists')[0].strip()
            
    raise RuntimeError(f'Could not create data source: {r.text}')

def log_to_google_fit(foods, meal_type, time_str=None, timestamp=None):
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

    try:
        ds_id = ensure_data_source(headers)
    except RuntimeError as e:
        return False, str(e), []

    meal_int = MEAL_TYPE_MAP.get(meal_type, 2)
    errors = []
    dataset_ids = []
    
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
        start_time = base_time + timedelta(milliseconds=i)
        start_ns = int(start_time.timestamp() * 1e9)
        end_ns = start_ns + 1

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
        
        micros = food.get('micros', {})
        for k, v in micros.items():
            if float(v) > 0:
                point['value'][0]['mapVal'].append({'key': k, 'value': {'fpVal': float(v)}})
                
        dataset_id = f'{start_ns}-{end_ns}'
        dataset_ids.append(dataset_id)
        
        url = f'https://www.googleapis.com/fitness/v1/users/me/dataSources/{ds_id}/datasets/{dataset_id}'
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
