import re

with open('static/index.html', 'r', encoding='utf-8') as f:
    c = f.read()
c = re.sub(r'app\.js\?v=\d+', 'app.js?v=21', c)
c = re.sub(r'style\.css\?v=\d+', 'style.css?v=21', c)
with open('static/index.html', 'w', encoding='utf-8') as f:
    f.write(c)

with open('static/sw.js', 'r', encoding='utf-8') as f:
    c2 = f.read()
c2 = re.sub(r"const CACHE = 'diet-logger-v\d+'", "const CACHE = 'diet-logger-v21'", c2)
with open('static/sw.js', 'w', encoding='utf-8') as f:
    f.write(c2)
