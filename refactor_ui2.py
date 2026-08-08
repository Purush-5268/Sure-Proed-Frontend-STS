import os
import re

base_dir = '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages'

replacements = [
    (r'className=\{styles\.tableWrapper\}', 'className="premium-table-container"'),
    (r'className=\{styles\.table\}', 'className="premium-table"'),
    (r'className=\{styles\.card\}', 'className="premium-card"'),
    (r'className=\{styles\.addButton\}', 'className="premium-btn premium-btn-primary"'),
    (r'className=\{styles\.active\}', 'className="premium-badge premium-badge-active"'),
    (r'className=\{styles\.inactive\}', 'className="premium-badge premium-badge-inactive"'),
    (r'className=\{styles\.pending\}', 'className="premium-badge premium-badge-pending"'),
    (r'className=\{styles\.approved\}', 'className="premium-badge premium-badge-active"'),
    (r'className=\{styles\.rejected\}', 'className="premium-badge premium-badge-inactive"'),
    (r'className=\{styles\.btn\}', 'className="premium-btn premium-btn-secondary"'),
    (r'className=\{styles\.searchBox\}', 'className="premium-form-group"'),
    (r'type="text"\s+placeholder="([^"]+)"', r'type="text" className="premium-input" placeholder="\1"'),
]

for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith('.jsx'):
            file_path = os.path.join(root, file)
            with open(file_path, 'r') as f:
                content = f.read()
            
            new_content = content
            for old, new in replacements:
                new_content = re.sub(old, new, new_content)
            
            if new_content != content:
                with open(file_path, 'w') as f:
                    f.write(new_content)
                print(f"Updated {file_path}")

print("Refactoring complete.")
