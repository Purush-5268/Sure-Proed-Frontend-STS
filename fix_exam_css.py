import re
import glob

def fix_css_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Text Colors
    content = re.sub(r'#0f172a|#1e293b|#000000', 'var(--text-primary)', content, flags=re.IGNORECASE)
    content = re.sub(r'#64748b|#475569|#334155', 'var(--text-secondary)', content, flags=re.IGNORECASE)
    content = re.sub(r'#94a3b8|#cbd5e1', 'var(--text-muted)', content, flags=re.IGNORECASE)
    
    # Backgrounds & Surfaces
    content = re.sub(r'#ffffff|#fff', 'var(--bg-card)', content, flags=re.IGNORECASE)
    content = re.sub(r'#f1f5f9|#f8fafc|#f4f4f5|#fafafa', 'var(--bg-nested)', content, flags=re.IGNORECASE)
    content = re.sub(r'#edf2f7|#e2e8f0|#e5e7eb', 'var(--border-color)', content, flags=re.IGNORECASE)
    
    # Theme/Primary Colors
    content = re.sub(r'#2563eb|#1d4ed8|#3b82f6', 'var(--primary-color)', content, flags=re.IGNORECASE)
    content = re.sub(r'#dbeafe|#eff6ff', 'var(--primary-light)', content, flags=re.IGNORECASE)
    
    # Status Colors (Success/Active)
    content = re.sub(r'#166534|#15803d', 'var(--status-active-text, #166534)', content, flags=re.IGNORECASE)
    content = re.sub(r'#f0fdf4|#dcfce7|#bbf7d0', 'var(--status-active-bg, #dcfce7)', content, flags=re.IGNORECASE)
    
    # Status Colors (Warning)
    content = re.sub(r'#9a3412|#b45309|#c2410c', 'var(--status-pending-text, #9a3412)', content, flags=re.IGNORECASE)
    content = re.sub(r'#fff7ed|#ffedd5|#fef3c7', 'var(--status-pending-bg, #ffedd5)', content, flags=re.IGNORECASE)

    # Status Colors (Danger)
    content = re.sub(r'#991b1b|#b91c1c|#ef4444', 'var(--status-inactive-text, #ef4444)', content, flags=re.IGNORECASE)
    content = re.sub(r'#fef2f2|#fee2e2', 'var(--status-inactive-bg, #fee2e2)', content, flags=re.IGNORECASE)

    with open(filepath, 'w') as f:
        f.write(content)
    
    print(f"Fixed {filepath}")

for f in glob.glob('/home/purush/DEV/Sure-Proed-V2/Frontend/src/pages/exams/*.module.css'):
    fix_css_file(f)
