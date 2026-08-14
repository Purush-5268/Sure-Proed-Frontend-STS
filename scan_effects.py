import os
import glob
import re

jsx_files = glob.glob('src/**/*.jsx', recursive=True)
files_to_fix = []

for file in jsx_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
        if 'useEffect' in content and 'apiClient.get' in content:
            if 'AbortController' not in content:
                files_to_fix.append(file)

print("\n".join(files_to_fix))
