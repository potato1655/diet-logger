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
    with patch('routes.log_to_google_fit', return_value=(True, 'OK', ['ds-1'])):
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
