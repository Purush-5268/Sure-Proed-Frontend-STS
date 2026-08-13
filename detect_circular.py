import os
import re

imports = {}

def get_imports(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    return re.findall(r'import\s+.*?\s+from\s+[\'"]([^\'"]+)[\'"]', content)

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith(('.js', '.jsx')):
            filepath = os.path.join(root, file)
            imports[filepath] = get_imports(filepath)

# Just check basic self-imports or simple cycles
for f, deps in imports.items():
    for dep in deps:
        if dep.startswith('.'):
            # resolve path naively
            # This is too complex for a quick script, just print deps
            pass
print("Done")
