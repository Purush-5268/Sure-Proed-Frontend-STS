import os
import re
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)

# Essential section and contact keyword patterns
RESUME_KEYWORDS = [
    "education", "qualification", "skills", "experience", "projects",
    "internship", "contact", "email", "phone", "curriculum vitae", "resume",
    "developed", "coded", "analyzed", "engineered", "implemented", "clinical", "degree"
]


def process_profile_verification(student_profile):
    """
    Decoupled verification pipeline executing face detection on profile_photo
    and keyword/section evaluation on resume.
    """
    if not student_profile:
        return

    student_profile.verification_status = "PROCESSING"
    student_profile.save(update_fields=["verification_status", "updated_at"])

    remarks = []
    photo_valid = True
    resume_valid = True

    # 1. Profile Photo Verification via OpenCV Haar Cascade
    if student_profile.profile_photo:
        try:
            photo_path = student_profile.profile_photo.path
            if os.path.exists(photo_path):
                import cv2
                cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
                if os.path.exists(cascade_path):
                    face_cascade = cv2.CascadeClassifier(cascade_path)
                    img = cv2.imread(photo_path)
                    if img is not None:
                        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
                        if len(faces) == 0:
                            photo_valid = False
                            remarks.append("Photo warning: No human face detected in profile picture.")
                        elif len(faces) > 2:
                            remarks.append("Photo note: Group photo detected.")
                else:
                    remarks.append("Photo checked: Haar cascade classifier unavailable.")
        except Exception as e:
            logger.warning(f"Profile photo verification skipped: {e}")

    extracted_text = ""

    # 2. Resume Text & Keyword Verification
    if student_profile.resume:
        try:
            from students.services.resume_profile_service import extract_resume_text

            extracted_text = extract_resume_text(student_profile.resume)
            try:
                resume_path = student_profile.resume.path
            except Exception:
                resume_path = ""

            # Fallback Path: Lazy OCR for 0-word image PDFs on local storage.
            if len(extracted_text.strip()) < 30 and resume_path.lower().endswith(".pdf") and os.path.exists(resume_path):
                try:
                    from pdf2image import convert_from_path
                    import pytesseract
                    images = convert_from_path(resume_path, first_page=1, last_page=2)
                    for img in images:
                        extracted_text += pytesseract.image_to_string(img)
                except Exception:
                    pass

            text_lower = extracted_text.lower()

            # Basic validation logic
            if len(text_lower) > 0:
                matched_keywords = [kw for kw in RESUME_KEYWORDS if kw in text_lower]
                has_contact = bool(re.search(r"[\w\.-]+@[\w\.-]+|\b\d{10}\b", extracted_text))

                if len(matched_keywords) < 2 and not has_contact:
                    resume_valid = False
                    remarks.append("Resume warning: Document content does not appear to be a standard resume.")
                else:
                    remarks.append(f"Resume verified: Matches {len(matched_keywords)} resume structural indicators.")
        except Exception as e:
            logger.warning(f"Resume verification skipped: {e}")

    # 3. Final Verification Status Update
    if photo_valid and resume_valid:
        student_profile.verification_status = "VERIFIED"
    else:
        student_profile.verification_status = "REJECTED"

    final_remarks = "; ".join(remarks) if remarks else "Profile media verified successfully."
    student_profile.verification_remarks = final_remarks
    student_profile.save(update_fields=["verification_status", "verification_remarks", "updated_at"])

    if extracted_text and resume_valid:
        try:
            from students.services.resume_profile_service import autofill_student_profile_from_resume

            autofill_student_profile_from_resume(student_profile.id, extracted_text)
        except Exception as e:
            logger.warning(f"Resume profile autofill skipped: {e}")
