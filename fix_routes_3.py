import re

with open('routes.py', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r"    @app\.route\('/nuke18', methods=\['GET', 'POST'\]\)\n    def nuke18\(\):.*?return jsonify\(\{'success': True, 'nuked': len\(_nuked\)\}\)", re.DOTALL)
content = pattern.sub("", content)

with open('routes.py', 'w', encoding='utf-8') as f:
    f.write(content)
