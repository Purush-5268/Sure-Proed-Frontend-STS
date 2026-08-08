import os
import re

base_dir = '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages'

replacements = [
    (r'\{styles\.tableWrapper\}', '"premium-table-container"'),
    (r'\{styles\.table\}', '"premium-table"'),
    (r'\{styles\.card\}', '"premium-card"'),
    (r'\{styles\.addButton\}', '"premium-btn premium-btn-primary"'),
    (r'\{styles\.active\}', '"premium-badge premium-badge-active"'),
    (r'\{styles\.inactive\}', '"premium-badge premium-badge-inactive"'),
    (r'\{styles\.pending\}', '"premium-badge premium-badge-pending"'),
    (r'className=\{styles\.actions\}', 'className="actions" style={{display: "flex", gap: "8px"}}'),
    # for buttons inside actions
    (r'className=\{styles\.btn\}', 'className="premium-btn premium-btn-secondary"'),
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
            
            # also replace inline action buttons that use styles
            new_content = re.sub(r'<Link\s+to=\{`([^`]+)`\}\s+className=\{styles\.actions\}\s*>', r'<Link to={`\1`} className="premium-btn premium-btn-secondary">', new_content)
            
            if new_content != content:
                with open(file_path, 'w') as f:
                    f.write(new_content)
                print(f"Updated {file_path}")

print("Refactoring complete.")
