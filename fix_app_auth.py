import re

with open('static/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Update logMeal error handling
log_meal_pattern = r"    } else \{\n      showToast\('Error: ' \+ \(data\.error \|\| 'Unknown error'\), true\);\n    \}"
log_meal_repl = """    } else {
      if (res.status === 401 || data.error === 'REAUTH_REQUIRED') {
          window.location.href = '/oauth/login';
          return;
      }
      showToast('Error: ' + (data.error || 'Unknown error'), true);
    }"""
content = re.sub(log_meal_pattern, log_meal_repl, content)

# Update deleteEntry error handling
del_entry_pattern = r"        \} else \{\n            const data = await res\.json\(\);\n            showToast\('Failed: ' \+ data\.error, true\);"
del_entry_repl = """        } else {
            if (res.status === 401) {
                window.location.href = '/oauth/login';
                return;
            }
            const data = await res.json();
            if (data.error === 'REAUTH_REQUIRED') {
                window.location.href = '/oauth/login';
                return;
            }
            showToast('Failed: ' + data.error, true);"""
content = re.sub(del_entry_pattern, del_entry_repl, content)

with open('static/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
