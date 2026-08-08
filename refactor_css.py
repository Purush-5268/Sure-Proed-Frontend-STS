import os
import re

base_dirs = [
    '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages/admin',
    '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages/student',
    '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages/mentor',
    '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages/trustee'
]

replacements = [
    # Full Width Layout Refactoring
    (r'max-width:\s*\d+px;', 'max-width: 100%;'),
    (r'width:\s*80%;', 'width: 100%;'),
    (r'width:\s*90%;', 'width: 100%;'),
    (r'margin:\s*0\s+auto;', ''), # Removes centering limits

    # Background Colors
    (r'background:\s*white;?', 'background: var(--bg-surface);'),
    (r'background:\s*#ffffff;?', 'background: var(--bg-surface);'),
    (r'background:\s*#fff;?', 'background: var(--bg-surface);'),
    (r'background-color:\s*white;?', 'background-color: var(--bg-surface);'),
    (r'background-color:\s*#ffffff;?', 'background-color: var(--bg-surface);'),
    (r'background-color:\s*#fff;?', 'background-color: var(--bg-surface);'),

    # Background Nested/Main
    (r'background:\s*#f8fafc;?', 'background: var(--bg-main);'),
    (r'background:\s*#f9fafb;?', 'background: var(--bg-main);'),
    (r'background:\s*#f3f4f6;?', 'background: var(--bg-nested);'),
    (r'background-color:\s*#f9fafb;?', 'background-color: var(--bg-main);'),

    # Text Colors - Primary
    (r'color:\s*#333333;?', 'color: var(--text-primary);'),
    (r'color:\s*#333;?', 'color: var(--text-primary);'),
    (r'color:\s*#000000;?', 'color: var(--text-primary);'),
    (r'color:\s*#000;?', 'color: var(--text-primary);'),
    (r'color:\s*#111827;?', 'color: var(--text-primary);'),
    (r'color:\s*#1f2937;?', 'color: var(--text-primary);'),

    # Text Colors - Secondary
    (r'color:\s*#666666;?', 'color: var(--text-secondary);'),
    (r'color:\s*#666;?', 'color: var(--text-secondary);'),
    (r'color:\s*#4b5563;?', 'color: var(--text-secondary);'),
    (r'color:\s*#6b7280;?', 'color: var(--text-secondary);'),

    # Text Colors - Muted
    (r'color:\s*#999999;?', 'color: var(--text-muted);'),
    (r'color:\s*#999;?', 'color: var(--text-muted);'),
    (r'color:\s*#9ca3af;?', 'color: var(--text-muted);'),

    # Borders
    (r'border:\s*1px\s+solid\s+#e5e7eb;?', 'border: 1px solid var(--border-color);'),
    (r'border:\s*1px\s+solid\s+#d1d5db;?', 'border: 1px solid var(--border-color);'),
    (r'border:\s*1px\s+solid\s+#ddd;?', 'border: 1px solid var(--border-color);'),
    (r'border-bottom:\s*1px\s+solid\s+#e5e7eb;?', 'border-bottom: 1px solid var(--border-color);'),
    (r'border-bottom:\s*1px\s+solid\s+#d1d5db;?', 'border-bottom: 1px solid var(--border-color);'),
    (r'border-bottom:\s*1px\s+solid\s+#ddd;?', 'border-bottom: 1px solid var(--border-color);'),
    (r'border-top:\s*1px\s+solid\s+#e5e7eb;?', 'border-top: 1px solid var(--border-color);'),
    (r'border-color:\s*#e5e7eb;?', 'border-color: var(--border-color);'),
    
    # Forms and Inputs Specifics
    (r'border:\s*1px\s+solid\s+#ccc;?', 'border: 1px solid var(--border-color);'),
]

modified_count = 0

for base_dir in base_dirs:
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file.endswith('.module.css'):
                file_path = os.path.join(root, file)
                with open(file_path, 'r') as f:
                    content = f.read()
                
                new_content = content
                for old, new in replacements:
                    new_content = re.sub(old, new, new_content, flags=re.IGNORECASE)
                
                if new_content != content:
                    with open(file_path, 'w') as f:
                        f.write(new_content)
                    print(f"Updated {file_path}")
                    modified_count += 1

print(f"Global CSS Refactoring complete. Modified {modified_count} files.")
