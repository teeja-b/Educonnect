import re

with open("app.py", "r", encoding="utf-8") as f:
    code = f.read()

# Match all function definitions
func_names = re.findall(r"def (\w+)\s*\(", code)

# Count duplicates
from collections import Counter
counts = Counter(func_names)

duplicates = [name for name, count in counts.items() if count > 1]

if duplicates:
    print("Duplicate function names found:")
    for name in duplicates:
        print(f"- {name}")
else:
    print("No duplicate function names found!")
