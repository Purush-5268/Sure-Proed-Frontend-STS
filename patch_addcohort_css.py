import re

with open('src/pages/admin/AddCohort.module.css', 'r') as f:
    content = f.read()

content = re.sub(
    r'\.submitBtn:hover:not\(:disabled\) \{\n  background: var\(--primary-color-hover\);\n\}',
    r'.submitBtn:hover:not(:disabled) {\n  background: var(--primary-color-hover, #7c3aed);\n  color: white;\n  opacity: 0.9;\n}',
    content
)

with open('src/pages/admin/AddCohort.module.css', 'w') as f:
    f.write(content)

