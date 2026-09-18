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

def test_log_meal_bad_numeric_values(client, mocker):
    mocker.patch('routes.log_to_google_fit', return_value=(True, 'OK', ['ds-1']))
    # Include an invalid food object and bad numeric values
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
