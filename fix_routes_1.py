import re

with open('routes.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace imports
content = content.replace("from fit import log_to_google_fit, ensure_data_source, ns_now", "from fit import log_to_google_health")
content = content.replace("log_to_google_fit(", "log_to_google_health(")

# Change /log route success checking
# We need to find: 
# return jsonify({
#     'success':      True,
#     'health_logged': health_ok,
#     'health_message': health_msg,
#     'entry':        entry,
# })
log_success_pattern = r"return jsonify\(\{\s*'success':\s*True,\s*'health_logged':\s*health_ok,\s*'health_message':\s*health_msg,\s*'entry':\s*entry,\s*\}\)"
new_log_success = """return jsonify({
            'success':      health_ok,  # Strict error handling
            'health_logged': health_ok,
            'health_message': health_msg,
            'entry':        entry,
        })"""
content = re.sub(log_success_pattern, new_log_success, content)

with open('routes.py', 'w', encoding='utf-8') as f:
    f.write(content)
