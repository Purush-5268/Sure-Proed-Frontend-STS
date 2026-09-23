import os
import re
import PyPDF2
from docx import Document

directory = "/home/purush/DEV/Sure-Proed-V2/Frontend/public"

keywords = [r'sure\s*proed', r'sure\s*trust', r'sure-proed', r'suretrust']
grad_years = [r'2026', r'2027']

# Heuristics for sections
experience_headers = [
    r'^experience\b', r'^work experience\b', r'^internship\b', r'^internships\b', 
    r'^employment\b', r'^professional experience\b'
]
# We assume a section header is usually short (e.g. < 5 words), uppercase or title case.
def is_section_header(line):
    line = line.strip()
    if not line: return False
    if len(line.split()) > 5: return False
    # If all caps and > 2 chars, very likely a header
    if line.isupper() and len(line) > 2:
        return True
    return False

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

def get_text_from_docx(filepath):
    text = ""
    try:
        doc = Document(filepath)
        for para in doc.paragraphs:
            text += para.text + "\n"
    except Exception:
        pass
    return text

def check_resume(filepath, text):
    text_lower = text.lower()
    
    # Check grad year
    has_year = False
    for gy in grad_years:
        if re.search(gy, text_lower):
            has_year = True
            break
            
    if not has_year:
        return False, "No 2026/2027 year found"
        
    lines = text.split('\n')
    in_exp_section = False
    exp_text = ""
    
    for line in lines:
        clean_line = line.strip().lower()
        
        # Check if line is a header
        if is_section_header(line):
            # Is it an experience header?
            is_exp = any(re.match(h, clean_line) for h in experience_headers)
            if is_exp:
                in_exp_section = True
            else:
                in_exp_section = False
        elif any(re.match(h, clean_line) for h in experience_headers):
            # Sometimes headers are not all caps but match exactly
            in_exp_section = True

        if in_exp_section:
            exp_text += line + "\n"
            
    # Now check if keyword is in exp_text
    exp_text_lower = exp_text.lower()
    for kw in keywords:
        if re.search(kw, exp_text_lower):
            return True, "Found in Experience/Internship section"
            
    # What if no standard headers are used? Let's also check context around keyword.
    for kw in keywords:
        if re.search(kw, text_lower):
            return False, "Keyword found but NOT in Experience/Internship section"
            
    return False, "Keyword not found"

for filename in os.listdir(directory):
    filepath = os.path.join(directory, filename)
    if filename.lower().endswith('.pdf'):
        text = get_text_from_pdf(filepath)
    elif filename.lower().endswith('.docx'):
        text = get_text_from_docx(filepath)
    else:
        continue
        
    if not text: continue
    
    is_valid, reason = check_resume(filepath, text)
    if is_valid:
        print(f"[MATCH] {filename}")
    else:
        if reason == "Keyword found but NOT in Experience/Internship section":
            print(f"[FAIL] {filename} - {reason}")
