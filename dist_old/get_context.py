import os
import re
import PyPDF2
from docx import Document

directory = "/home/purush/DEV/Sure-Proed-V2/Frontend/public"

files_to_check = [
    "Gurjot_Singh_Resume_SURE_Trust_TataElxsi.pdf",
    "Gowtham_Resume.pdf",
    "Prasad Resume.docx",
    "Himanshu Resume.pdf",
    "Kotapati_Radhika_Sure_trust.pdf",
    "CHETANA__SURETRUST.pdf",
    "UNGARALA_NITHYA_SANTHOSHI_resume_G326VLSI.pdf",
    "KADAVERLA_ROOPIKA_RESUME.pdf",
    "Raji_Samundeeswari_Sure_trust.pdf",
    "Peta_Jaya_Siva_Sai_TataElxsi_Resume_Final.pdf",
    "Kotla Kavya Sri.pdf",
    "AshwithaReddy_Suretrust.pdf",
    "gayatri_vispute .pdf",
    "Mahek Sultana Resume.pdf",
    "Musthafa_Resume (3).pdf",
    "antara resume.pdf",
    "Dhana_gunda_resume (3).pdf",
    "Utkaresh Chavan.pdf",
    "Ankita Gore- G31 FSD   Resume.pdf"
]

keywords = [r'sure\s*proed', r'sure\s*trust', r'sure-proed', r'suretrust']

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

for filename in files_to_check:
    filepath = os.path.join(directory, filename)
    if not os.path.exists(filepath):
        continue
    
    if filename.lower().endswith('.pdf'):
        text = get_text_from_pdf(filepath)
    elif filename.lower().endswith('.docx'):
        text = get_text_from_docx(filepath)
    else:
        continue
        
    text_lower = text.lower()
    
    print(f"\n=========================================")
    print(f"FILE: {filename}")
    found = False
    
    # Try to find context for any of the keywords
    for kw in keywords:
        matches = list(re.finditer(kw, text_lower))
        for match in matches:
            found = True
            start = max(0, match.start() - 250)
            end = min(len(text), match.end() + 250)
            context = text[start:end].replace('\n', '  ')
            print(f"--- MATCH for '{kw}' ---")
            print(f"...{context}...\n")
            
    if not found:
        print("Keyword not found in text content (might be in filename only).")
