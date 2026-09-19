import re

with open('routes.py', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """        if names_to_delete:
            url = 'https://health.googleapis.com/v4/users/me/dataTypes/nutrition-log/dataPoints:batchDelete'
            r = http_requests.post(url, headers=headers, json={"names": names_to_delete})
            
            if r.status_code == 401 or r.status_code == 403:
                return jsonify({'success': False, 'error': 'REAUTH_REQUIRED'}), 401
                
            if r.status_code not in (200, 204):
                return jsonify({'success': False, 'error': f"Could not delete: {r.text}"}), 500"""

pattern = re.compile(r"        if names_to_delete:\n            url = 'https://health\.googleapis\.com/v4/users/me/dataTypes/nutrition-log/dataPoints:batchDelete'\n            r = http_requests\.post\(url, headers=headers, json={\"names\": names_to_delete}\)\n            if r\.status_code not in \(200, 204\):\n                return jsonify\(\{'success': False, 'error': f\"Could not delete: \{r\.text\}\"\}\), 500", re.DOTALL)

content = pattern.sub(replacement, content)

with open('routes.py', 'w', encoding='utf-8') as f:
    f.write(content)
