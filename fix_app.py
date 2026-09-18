import re

with open('static/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'value="\$\{food\.([a-zA-Z_]+)\}"', r'value="${escHtml(food.\1)}"', content)

with open('static/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
