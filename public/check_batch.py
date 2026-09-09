import os
import re
import PyPDF2
from docx import Document

directory = "/home/purush/DEV/Sure-Proed-V2/Frontend/public/Tata Elxsi SURE Proed Students/Tata Elxsi SURE Proed Students"

keywords = [r'sure\s*proed', r'sure\s*trust', r'sure-proed', r'suretrust']
grad_years = [r'2026', r'2027', r'2026/2027', r'2026/27', r'2026-2027', r'26/27']

def get_text_from_pdf(filepath):
    text = ""
    try:
        with open(filepath, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
    except Exception:
        pass
    return text

print("Checking resumes in:", directory)
print("="*60)

for filename in os.listdir(directory):
    filepath = os.path.join(directory, filename)
    if filename.lower().endswith('.pdf'):
        text = get_text_from_pdf(filepath)
    else:
        continue
        
    text_lower = text.lower()
    
    # Check graduation years
    found_years = []
    for gy in grad_years:
        if re.search(gy, text_lower):
            found_years.append(gy)
            
    # Check keywords
    found_keywords = []
    for kw in keywords:
        matches = list(re.finditer(kw, text_lower))
        for match in matches:
            found_keywords.append(kw)
            
    print(f"\n--- FILE: {filename} ---")
    if found_years:
        print(f"GRAD YEAR MATCH: {set(found_years)}")
    else:
        print("GRAD YEAR MATCH: None Found (No 2026/2027 detected)")
        
    if found_keywords:
        print(f"KEYWORD MATCH: {set(found_keywords)}")
        # Print context of keywords
        for kw in set(found_keywords):
            matches = list(re.finditer(kw, text_lower))
            for match in matches:
                start = max(0, match.start() - 250)
                end = min(len(text), match.end() + 250)
                context = text[start:end].replace('\n', '  ')
                print(f"  Context '{kw}': ...{context}...")
    else:
        print("KEYWORD MATCH: None Found")
