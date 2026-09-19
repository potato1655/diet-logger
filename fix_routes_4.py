import re

with open('routes.py', 'r', encoding='utf-8') as f:
    content = f.read()

log_success_pattern = r"return jsonify\(\{\s*'success':\s*health_ok,\s*# Strict error handling\n\s*'health_logged':\s*health_ok,\s*'health_message':\s*health_msg,\s*'entry':\s*entry,\s*\}\)"
new_log_success = """if not health_ok:
            return jsonify({
                'success': False,
                'error': health_msg
            }), 500

        return jsonify({
            'success': True,
            'health_logged': True,
            'entry': entry,
        })"""
content = re.sub(log_success_pattern, new_log_success, content)

with open('routes.py', 'w', encoding='utf-8') as f:
    f.write(content)
