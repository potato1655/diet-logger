import pytest
from server import app
import json

@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    
    # Mock authentication for testing
    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess['_csrf_token'] = 'test-token'
        yield client

def test_log_meal_no_json(client):
    rv = client.post('/log', data='not json', headers={'X-CSRFToken': 'test-token'})
    assert rv.status_code == 400
    assert rv.json['success'] is False
    assert rv.json['error'] == 'Invalid JSON body'

def test_log_meal_empty_json(client):
    rv = client.post('/log', json={}, headers={'X-CSRFToken': 'test-token'})
    assert rv.status_code == 400

def test_log_meal_foods_not_list(client):
    rv = client.post('/log', json={'foods': 'not a list'}, headers={'X-CSRFToken': 'test-token'})
    assert rv.status_code == 400
    assert 'must be a list' in rv.json['error']

from unittest.mock import patch

def test_log_meal_bad_numeric_values(client):
    with patch('routes.log_to_google_health', return_value=(True, 'OK', ['ds-1'])):
        payload = {
            'foods': [
                {'name': 'Apple', 'calories': 'N/A', 'protein_g': None, 'carbs_g': '10.5', 'fat_g': float('inf')},
                "invalid string food"
            ]
        }
        rv = client.post('/log', json=payload, headers={'X-CSRFToken': 'test-token'})
        assert rv.status_code == 200
        data = rv.json
        assert data['success'] is True
        assert data['entry']['totals']['calories'] == 0.0
        assert data['entry']['totals']['protein_g'] == 0.0
        assert data['entry']['totals']['carbs_g'] == 10.5
        assert data['entry']['totals']['fat_g'] == 0.0
        assert len(data['entry']['foods']) == 1

def test_delete_log_invalid_json(client):
    rv = client.post('/log/delete', json={'foods': 'not a list'}, headers={'X-CSRFToken': 'test-token'})
    assert rv.status_code == 400

def test_csrf_protection(client):
    # Without token
    rv = client.post('/log', json={'foods': []})
    assert rv.status_code == 403
    
    # With wrong token
    rv = client.post('/log', json={'foods': []}, headers={'X-CSRFToken': 'wrong-token'})
    assert rv.status_code == 403
    
    # With correct token
    with patch('routes.log_to_google_health', return_value=(True, 'OK', ['ds-1'])):
        rv = client.post('/log', json={'foods': []}, headers={'X-CSRFToken': 'test-token'})
        assert rv.status_code == 200

def test_get_endpoints_work_without_csrf(client):
    rv = client.get('/auth/status')
    assert rv.status_code == 200
    assert 'csrf_token' in rv.json

def test_analyze_endpoints_with_csrf(client):
    class DummyResponse:
        text = '''{"foods": [{"name": "Apple", "quantity": "1", "calories": 50, "protein_g": 0, "carbs_g": 10, "fat_g": 0, "fiber_g": 2}], "questions": []}'''
    with patch('routes.call_gemini_with_retry', return_value=DummyResponse()), patch('routes.Image.open') as mock_open:
        mock_open.return_value.convert.return_value.size = (100, 100)
        rv = client.post('/analyze', json={'image': 'fake'}, headers={'X-CSRFToken': 'test-token'})
        assert rv.status_code == 200
        assert rv.json['success'] is True
        assert len(rv.json['foods']) == 1
        assert rv.json['foods'][0]['name'] == "Apple"

def test_refine_endpoint_with_csrf(client):
    class DummyResponse:
        text = '''{"name": "Apple", "quantity": "2", "calories": 100, "protein_g": 0, "carbs_g": 20, "fat_g": 0, "fiber_g": 4}'''
    with patch('routes.call_gemini_with_retry', return_value=DummyResponse()), patch('routes.Image.open') as mock_open:
        mock_open.return_value.convert.return_value.size = (100, 100)
        rv = client.post('/refine', json={'food': {'name': 'Apple'}, 'text': 'I ate two'}, headers={'X-CSRFToken': 'test-token'})
        assert rv.status_code == 200
        assert rv.json['success'] is True
        assert rv.json['food']['quantity'] == "2"

def test_analyze_meal_summary_with_csrf(client):
    with patch('routes.call_groq_summary', return_value="Great meal!"):
        rv = client.post('/analyze/meal-summary', json={'meal': {'name': 'Breakfast'}}, headers={'X-CSRFToken': 'test-token'})
        assert rv.status_code == 200
        assert rv.json['success'] is True
        assert rv.json['summary'] == "Great meal!"

def test_analyze_week_summary_with_csrf(client):
    with patch('routes.call_groq_summary', return_value="Great week!"):
        rv = client.post('/analyze/week-summary', json={'meals': [{'date': '2023-10-10'}]}, headers={'X-CSRFToken': 'test-token'})
        assert rv.status_code == 200
        assert rv.json['success'] is True
        assert rv.json['summary'] == "Great week!"

def test_oauth_missing_state(client):
    rv = client.get('/oauth/callback')
    assert rv.status_code == 400
    assert b'Missing state' in rv.data

def test_oauth_logout_clears_session(client):
    rv = client.post('/oauth/logout', headers={'X-CSRFToken': 'test-token'})
    assert rv.status_code == 200

import pytest
from unittest.mock import patch, MagicMock
from server import app
import json
import os
from datetime import datetime, timezone

def test_history_filter_and_pagination(client):
    # Mock creds
    class MockCreds:
        valid = True
        token = 'fake_token'
        
    with patch('routes.load_credentials', return_value=MockCreds()):
        with patch('routes.http_requests.get') as mock_get:
            # First page
            resp1 = MagicMock()
            resp1.status_code = 200
            resp1.json.return_value = {
                'dataPoints': [{'name': 'pt1', 'nutritionLog': {'mealType': 'LUNCH'}}],
                'nextPageToken': 'token123'
            }
            # Second page
            resp2 = MagicMock()
            resp2.status_code = 200
            resp2.json.return_value = {
                'dataPoints': [{'name': 'pt2', 'nutritionLog': {'mealType': 'SNACK'}}],
                'nextPageToken': None
            }
            
            mock_get.side_effect = [resp1, resp2]
            
            rv = client.get('/history')
            assert rv.status_code == 200
            assert mock_get.call_count == 2
            
            # Check filter in first call
            call1_kwargs = mock_get.call_args_list[0][1]
            assert 'params' in call1_kwargs
            assert 'filter' in call1_kwargs['params']
            assert 'nutrition_log.interval.start_time' in call1_kwargs['params']['filter']
            assert 'pageToken' not in call1_kwargs['params']
            
            # Check filter and token in second call
            call2_kwargs = mock_get.call_args_list[1][1]
            assert 'filter' in call2_kwargs['params']
            assert call2_kwargs['params']['pageToken'] == 'token123'

def test_micronutrient_mapping(client):
    # This tests the payload that log_to_google_health generates
    from fit import log_to_google_health
    
    class MockCreds:
        valid = True
        token = 'fake_token'
        expired = False
    
    with patch('fit.load_credentials', return_value=MockCreds()):
        with patch('fit.http_requests.post') as mock_post:
            resp = MagicMock()
            resp.status_code = 200
            resp.json.return_value = {'name': 'resource1'}
            mock_post.return_value = resp
            
            foods = [{
                'name': 'Test Food',
                'calories': 100,
                'protein_g': 10,
                'carbs_g': 20,
                'fat_g': 5,
                'fiber_g': 2,
                'micros': {
                    'sugar_g': 15,
                    'cholesterol_mg': 50,
                    'sodium_mg': 500,
                    'potassium_mg': 300,
                    'calcium_mg': 200,
                    'iron_mg': 1.5,
                    'magnesium_mg': 40,
                    'phosphorus_mg': 100,
                    'zinc_mg': 2.5,
                    'selenium_mcg': 15.0,
                    'copper_mcg': 500,
                    'manganese_mg': 0.5,
                    'chromium_mcg': 20,
                    'iodine_mcg': 50,
                    'molybdenum_mcg': 10,
                    'biotin_mcg': 15,
                    'thiamin_mg': 0.5,
                    'riboflavin_mg': 0.6,
                    'niacin_mg': 5.0,
                    'pantothenic_mg': 2.0,
                    'vitamin_b6_mg': 1.0,
                    'vitamin_b12_mcg': 2.4,
                    'vitamin_c_mg': 60,
                    'vitamin_e_mg': 5.0,
                    'vitamin_k_mcg': 40,
                    'folate_mcg': 200,
                    'saturated_fat_g': 2,
                    'trans_fat_g': 0.5,
                    
                    # Unsupported / Ignored
                    'vitamin_a_iu': 1000,
                    'vitamin_d_iu': 400,
                    'omega_3_g': 1.5,
                    'omega_6_g': 2.0,
                    'epa_dha_mg': 250,
                    'unknown_nutrient': 10,
                    'choline_mg': 100,
                    'fluoride_mg': 1.0
                }
            }]
            
            res, msg, ids = log_to_google_health(foods, 'LUNCH')
            assert res is True
            
            # Verify payload
            payload = mock_post.call_args[1]['json']
            nutrients = payload['nutritionLog']['nutrients']
            
            # Expected mappings
            nutrient_dict = {n['nutrient']: n['quantity']['grams'] for n in nutrients}
            
            # Core macros
            assert nutrient_dict['PROTEIN'] == 10.0
            assert nutrient_dict['DIETARY_FIBER'] == 2.0
            
            # 1 to 1 mapping (grams)
            assert nutrient_dict['SUGAR'] == 15.0
            assert nutrient_dict['SATURATED_FAT'] == 2.0
            assert nutrient_dict['TRANS_FAT'] == 0.5
            
            # 1e-3 mapping (mg)
            assert nutrient_dict['CHOLESTEROL'] == 0.05
            assert nutrient_dict['SODIUM'] == 0.5
            assert nutrient_dict['POTASSIUM'] == 0.3
            assert nutrient_dict['CALCIUM'] == 0.2
            assert nutrient_dict['IRON'] == 0.0015
            assert nutrient_dict['MAGNESIUM'] == 0.04
            assert nutrient_dict['PHOSPHORUS'] == 0.1
            assert nutrient_dict['ZINC'] == 0.0025
            assert nutrient_dict['MANGANESE'] == 0.0005
            assert nutrient_dict['THIAMIN'] == 0.0005
            assert nutrient_dict['RIBOFLAVIN'] == 0.0006
            assert nutrient_dict['NIACIN'] == 0.005
            assert nutrient_dict['PANTOTHENIC_ACID'] == 0.002
            assert nutrient_dict['VITAMIN_B6'] == 0.001
            assert nutrient_dict['VITAMIN_C'] == 0.06
            assert nutrient_dict['VITAMIN_E'] == 0.005
            
            # 1e-6 mapping (mcg)
            assert nutrient_dict['SELENIUM'] == pytest.approx(0.000015)
            assert nutrient_dict['COPPER'] == pytest.approx(0.0005)
            assert nutrient_dict['CHROMIUM'] == pytest.approx(0.00002)
            assert nutrient_dict['IODINE'] == pytest.approx(0.00005)
            assert nutrient_dict['MOLYBDENUM'] == pytest.approx(0.00001)
            assert nutrient_dict['BIOTIN'] == pytest.approx(0.000015)
            assert nutrient_dict['VITAMIN_B12'] == pytest.approx(0.0000024)
            assert nutrient_dict['VITAMIN_K'] == pytest.approx(0.00004)
            assert nutrient_dict['FOLATE'] == pytest.approx(0.0002)
            
            # Ensure incorrect enums are absent
            assert 'VITAMIN_B1' not in nutrient_dict
            assert 'VITAMIN_B2' not in nutrient_dict
            assert 'VITAMIN_B3' not in nutrient_dict
            assert 'VITAMIN_B5' not in nutrient_dict
            assert 'FOLIC_ACID' not in nutrient_dict
            
            # Ensure unsupported fields are absent
            assert 'VITAMIN_A' not in nutrient_dict
            assert 'VITAMIN_D' not in nutrient_dict
            assert 'UNKNOWN_NUTRIENT' not in nutrient_dict
            
def test_groq_model_default(monkeypatch):
    import groq_client
    monkeypatch.delenv("GROQ_MODEL", raising=False)
    monkeypatch.setattr(groq_client, "GROQ_API_KEY", "fake_key")
    
    with patch('groq_client.requests.post') as mock_post:
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"choices": [{"message": {"content": "summary"}}]}
        mock_post.return_value = resp
        
        groq_client.call_groq_summary("hello")
        
        payload = mock_post.call_args[1]['json']
        assert payload['model'] == 'openai/gpt-oss-20b'
        assert payload['messages'][0]['content'] == 'hello'
        assert payload['temperature'] == 0.7
        assert payload['max_tokens'] == 512
        assert mock_post.call_args[1]['headers']['Authorization'] == 'Bearer fake_key'

def test_groq_model_override(monkeypatch):
    import groq_client
    monkeypatch.setenv("GROQ_MODEL", "custom-model-id")
    monkeypatch.setattr(groq_client, "GROQ_API_KEY", "fake_key")
    
    with patch('groq_client.requests.post') as mock_post:
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"choices": [{"message": {"content": "summary"}}]}
        mock_post.return_value = resp
        
        groq_client.call_groq_summary("hello")
        
        payload = mock_post.call_args[1]['json']
        assert payload['model'] == 'custom-model-id'


def test_secret_key_production(monkeypatch):
    # Remove SECRET_KEY and set production
    monkeypatch.delenv('FLASK_SECRET_KEY', raising=False)
    monkeypatch.setenv('APP_ENV', 'production')
    
    # We must import server in a way that executes the initialization
    import importlib
    import server
    
    with pytest.raises(ValueError, match="FLASK_SECRET_KEY is required in production environment."):
        importlib.reload(server)

def test_secret_key_local(monkeypatch):
    monkeypatch.delenv('FLASK_SECRET_KEY', raising=False)
    monkeypatch.setenv('APP_ENV', 'development')
    
    import importlib
    import server
    importlib.reload(server)
    assert server.app.secret_key is not None
