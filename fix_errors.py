import re

with open('routes.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "return jsonify({'success': False, 'error': str(e)}), 500",
    "return jsonify({'success': False, 'error': 'An internal server error occurred.'}), 500"
)

content = content.replace(
    "return jsonify({'success': False, 'error': f'AI returned invalid JSON: {e}'}), 500",
    "return jsonify({'success': False, 'error': 'AI returned an invalid response.'}), 500"
)

content = content.replace(
    "return jsonify({'success': False, 'error': f\"Failed to get app data source: {e}\"}), 500",
    "return jsonify({'success': False, 'error': 'Failed to get app data source.'}), 500"
)

with open('routes.py', 'w', encoding='utf-8') as f:
    f.write(content)
