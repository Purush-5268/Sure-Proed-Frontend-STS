import os
import re

base_dirs = [
    '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages/admin',
    '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages/student',
    '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages/mentor',
    '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages/trustee'
]

replacements = [
    # Background colors
    (r'backgroundColor:\s*["\']white["\']', 'backgroundColor: "var(--bg-surface)"'),
    (r'backgroundColor:\s*["\']#ffffff["\']', 'backgroundColor: "var(--bg-surface)"'),
    (r'backgroundColor:\s*["\']#f8fafc["\']', 'backgroundColor: "var(--bg-main)"'),
    (r'backgroundColor:\s*["\']#f9fafb["\']', 'backgroundColor: "var(--bg-main)"'),
    (r'backgroundColor:\s*["\']#f3f4f6["\']', 'backgroundColor: "var(--bg-nested)"'),
    (r'background:\s*["\']white["\']', 'background: "var(--bg-surface)"'),
    (r'background:\s*["\']#ffffff["\']', 'background: "var(--bg-surface)"'),
    (r'background:\s*["\']#f8fafc["\']', 'background: "var(--bg-main)"'),
    (r'background:\s*["\']#f9fafb["\']', 'background: "var(--bg-main)"'),
    
    # Text colors
    (r'color:\s*["\']#000000["\']', 'color: "var(--text-primary)"'),
    (r'color:\s*["\']#111827["\']', 'color: "var(--text-primary)"'),
    (r'color:\s*["\']#1f2937["\']', 'color: "var(--text-primary)"'),
    (r'color:\s*["\']#0f172a["\']', 'color: "var(--text-primary)"'),
    (r'color:\s*["\']#1e293b["\']', 'color: "var(--text-primary)"'),
    
    (r'color:\s*["\']#374151["\']', 'color: "var(--text-secondary)"'),
    (r'color:\s*["\']#4b5563["\']', 'color: "var(--text-secondary)"'),
    (r'color:\s*["\']#64748b["\']', 'color: "var(--text-secondary)"'),
    
    (r'color:\s*["\']#6b7280["\']', 'color: "var(--text-muted)"'),
    (r'color:\s*["\']#9ca3af["\']', 'color: "var(--text-muted)"'),
    (r'color:\s*["\']#94a3b8["\']', 'color: "var(--text-muted)"'),

    # Borders
    (r'border:\s*["\']1px solid #e2e8f0["\']', 'border: "1px solid var(--border-color)"'),
    (r'border:\s*["\']1px solid #d1d5db["\']', 'border: "1px solid var(--border-color)"'),
    (r'border:\s*["\']1px solid #e5e7eb["\']', 'border: "1px solid var(--border-color)"'),
    (r'borderTop:\s*["\']1px solid #f3f4f6["\']', 'borderTop: "1px solid var(--border-color)"'),
    (r'borderBottom:\s*["\']1px solid #e5e7eb["\']', 'borderBottom: "1px solid var(--border-color)"'),

    # Pastels
    (r'backgroundColor:\s*["\']#(faf5ff|e0e7ff|eff6ff|fef2f2|dcfce7)["\']', 'backgroundColor: "var(--bg-nested)"'),
    (r'border:\s*["\']1px solid #(e9d5ff|d8b4fe|c7d2fe|a5b4fc|bfdbfe|93c5fd)["\']', 'border: "1px solid var(--border-color)"'),
    (r'color:\s*["\']#(581c87|312e81|1e3a8a|1d4ed8|1e40af)["\']', 'color: "var(--text-primary)"'),
]

modified_count = 0

for base_dir in base_dirs:
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
                    print(f"Updated JSX Styles: {file_path}")
                    modified_count += 1

print(f"Global JSX Refactoring complete. Modified {modified_count} files.")
