import re

with open('static/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """  const now = new Date();
  const dateStr = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0') + '-' + now.getDate().toString().padStart(2, '0');
  document.getElementById('meal-date').value = dateStr;"""

content = content.replace("  const now = new Date();", replacement)

# Add logic to automatically adjust to yesterday if time is in the future
replacement2 = """  let timestamp = null;
  const nowForLog = new Date();
  if (dateVal || timeVal) {
    const d = new Date(nowForLog.getTime());
    if (dateVal) {
      const [year, month, day] = dateVal.split('-');
      d.setFullYear(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    }
    if (timeVal) {
      const [h, m] = timeVal.split(':');
      d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    }
    
    // If the selected datetime is in the future (e.g. they typed 20:00 but it's 12:00 now),
    // and they left the date as today (or didn't set it), they almost certainly meant yesterday.
    if (d.getTime() > nowForLog.getTime()) {
      d.setDate(d.getDate() - 1);
    }
    
    timestamp = d.getTime();
  }"""

# Using regex to replace the old timestamp logic
pattern = re.compile(r"  let timestamp = null;\n.*?timestamp = d\.getTime\(\);\n  }", re.DOTALL)
content = pattern.sub(replacement2, content)

with open('static/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
