import os
import re

base_dir = '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages/admin'

replacements = [
    # Background pastels to bg-nested
    (r'backgroundColor:\s*["\']#(faf5ff|e0e7ff|eff6ff|fef2f2|dcfce7)["\']', 'backgroundColor: "var(--bg-nested)"'),
    # Border pastels to border-color
    (r'border:\s*["\']1px solid #(e9d5ff|d8b4fe|c7d2fe|a5b4fc|bfdbfe|93c5fd)["\']', 'border: "1px solid var(--border-color)"'),
    # Dark text colors on pastels to primary/secondary
    (r'color:\s*["\']#(581c87|312e81|1e3a8a|1d4ed8|1e40af)["\']', 'color: "var(--text-primary)"'),
]

modified_count = 0

for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith('.jsx'):
            file_path = os.path.join(root, file)
            with open(file_path, 'r') as f:
                content = f.read()
            
            new_content = content
            for old, new in replacements:
                new_content = re.sub(old, new, new_content, flags=re.IGNORECASE)
            
            if new_content != content:
                with open(file_path, 'w') as f:
                    f.write(new_content)
                print(f"Updated JSX Pastel Inline Styles: {file_path}")
                modified_count += 1

print(f"JSX Pastel Refactoring complete. Modified {modified_count} files.")
