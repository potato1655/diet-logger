import re

with open('tests.py', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """def test_csrf_protection(client):
    # Without token
    rv = client.post('/log', json={'foods': []})
    assert rv.status_code == 403
    
    # With wrong token
    rv = client.post('/log', json={'foods': []}, headers={'X-CSRFToken': 'wrong-token'})
    assert rv.status_code == 403
    
    # With correct token
    with patch('routes.log_to_google_health', return_value=(True, 'OK', ['ds-1'])):
        rv = client.post('/log', json={'foods': []}, headers={'X-CSRFToken': 'test-token'})
        assert rv.status_code == 200"""

pattern = re.compile(r"def test_csrf_protection\(client\):.*?assert rv\.status_code == 200", re.DOTALL)
content = pattern.sub(replacement, content)

with open('tests.py', 'w', encoding='utf-8') as f:
    f.write(content)
