import os
import glob
import re

jsx_files = glob.glob('src/**/*.jsx', recursive=True)

# We want to match: useEffect(() => { ... }, [...]);
# and inject abortController.

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Very naive check: if the file has apiClient.get and doesn't have AbortController
    if 'apiClient.get' not in content or 'AbortController' in content:
        return False
        
    print(f"Skipping {filepath} for safety, please handle manually or with a safer tool.")
    return False

# For now, let's just count how many we actually need to fix.
count = 0
for file in jsx_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
        if 'apiClient.get' in content and 'useEffect' in content and 'AbortController' not in content:
            count += 1
            
print(f"Found {count} files to fix.")

