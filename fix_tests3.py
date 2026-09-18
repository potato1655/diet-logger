import re

with open('tests.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "with patch('routes.call_gemini_with_retry', return_value=DummyResponse()), patch('routes.Image.open'):",
    "with patch('routes.call_gemini_with_retry', return_value=DummyResponse()), patch('routes.Image.open') as mock_open:\n        mock_open.return_value.convert.return_value.size = (100, 100)"
)

with open('tests.py', 'w', encoding='utf-8') as f:
    f.write(content)
