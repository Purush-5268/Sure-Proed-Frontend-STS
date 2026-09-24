import os
import re

dir_path = "/home/dev1/Student-Tracking-Application-Frontend/src"

course_sort = 'slice().sort((a,b) => (a.name || a.title || a.code || "").localeCompare(b.name || b.title || b.code || ""))'
cohort_sort = 'slice().sort((a,b) => (a.name || a.code || a.title || "").localeCompare(b.name || b.code || b.title || ""))'

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Simple replacements
    content = content.replace('courses.map(', f'courses.{course_sort}.map(')
    content = content.replace('cohorts.map(', f'cohorts.{cohort_sort}.map(')
    content = content.replace('filteredCourses.map(', f'filteredCourses.{course_sort}.map(')
    
    # Handle cohorts.filter(...).map(...)
    # This is a bit tricky with regex, but we can look for .map( right after filter block
    # Actually, it's safer to just let the user know we did a global replace for the common ones.

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk(dir_path):
    for file in files:
        if file.endswith('.jsx'):
            process_file(os.path.join(root, file))

print("Done")
