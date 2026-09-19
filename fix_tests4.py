import re

with open('tests.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("routes.log_to_google_fit", "routes.log_to_google_health")

with open('tests.py', 'w', encoding='utf-8') as f:
    f.write(content)
