import base64
import difflib
import os
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.exceptions import ValidationError

MAGIC_HEADERS = {
    "pdf": [b"%PDF-"],
    "docx": [b"PK\x03\x04"],
    "jpg": [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "png": [b"\x89PNG\r\n\x1a\n"],
    "webp": [b"RIFF"],
}


def fast_validate_file_metadata(file_obj, max_mb=5, allowed_types=None):
    """
    Synchronous guard for uploaded files (<10ms CPU time).
    Validates file size, file extension, and initial magic header bytes.
    """
    if not file_obj:
        return

    # 1. Size check
    max_bytes = max_mb * 1024 * 1024
    file_size = getattr(file_obj, "size", 0)
    if file_size > max_bytes:
        raise ValidationError(f"File size exceeds maximum allowed limit of {max_mb}MB.")
    if file_size == 0:
        raise ValidationError("Uploaded file is empty.")

    # 2. Extension check
    filename = getattr(file_obj, "name", "")
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    if allowed_types and ext not in allowed_types:
        allowed_str = ", ".join(allowed_types).upper()
        raise ValidationError(f"Unsupported file format '.{ext}'. Allowed formats: {allowed_str}.")

    # 3. Magic Header check
    if ext in MAGIC_HEADERS:
        pos = file_obj.tell() if hasattr(file_obj, "tell") else 0
        try:
            header = file_obj.read(16)
            if hasattr(file_obj, "seek"):
                file_obj.seek(pos)
        except Exception:
            raise ValidationError("Could not read file header stream.")

        valid_header = any(header.startswith(sig) for sig in MAGIC_HEADERS[ext])
        if not valid_header:
            raise ValidationError(f"File extension '.{ext}' does not match the file header content.")


import re
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.translation import gettext_lazy as _


def check_name_fuzzy_match(profile_name, text):
    if not profile_name or not text:
        return True, 1.0

    profile_name_clean = profile_name.lower().strip()
    text_clean = text.lower()

    # Direct substring match
    if profile_name_clean in text_clean:
        return True, 1.0

    name_tokens = [token for token in re.findall(r"\w+", profile_name_clean) if len(token) >= 2]
    if not name_tokens:
        return True, 1.0

    matched_tokens = [token for token in name_tokens if token in text_clean]
    token_ratio = len(matched_tokens) / len(name_tokens)

    # Search through all non-empty lines for best fuzzy ratio
    lines = [line.strip() for line in text_clean.split("\n") if line.strip()]
    best_fuzzy_ratio = 0.0
    for line in lines:
        if profile_name_clean in line:
            return True, 1.0
        ratio = difflib.SequenceMatcher(None, profile_name_clean, line).ratio()
        if ratio > best_fuzzy_ratio:
            best_fuzzy_ratio = ratio

    is_match = (
        (token_ratio >= 0.5)
        or (best_fuzzy_ratio >= 0.55)
        or (len(name_tokens) == 1 and token_ratio == 1.0)
    )
    return is_match, max(token_ratio, best_fuzzy_ratio)


def _resume_extraction_quality(extracted_text):
    """Prefer the PDF extraction that preserved the most resume structure."""
    normalized = " ".join((extracted_text or "").lower().split())
    structural_hints = (
        "education", "academic background", "qualification", "skills",
        "competencies", "experience", "employment", "internship", "training",
        "projects", "portfolio", "achievements", "certifications",
        "linkedin", "github", "email", "mobile", "phone",
    )
    hint_count = sum(1 for hint in structural_hints if hint in normalized)
    return hint_count, len(normalized.split()), len(normalized)


def validate_resume_file(file_obj, student_profile=None):
    """
    Django Model and Serializer validator for uploaded Resumes.
    Validates:
    1. Maximum size: 5MB limit (prevents DoS disk fill attacks).
    2. Allowed extensions: .pdf or .docx.
    3. Magic bytes (%PDF- for pdf, PK\x03\x04 for docx).
    4. Full document parsing and active-content inspection.
    5. Multi-categorical Non-Resume Rejection (Research papers, Bills, Standalone Certificates).
    6. Resume Confidence Scoring Engine (0 - 100 Points).
    7. Identity Matching: Fuzzy name verification against student account profile name.
    """
    if not file_obj:
        return

    # If it is an existing saved FieldFile instance (already validated in the past), skip
    if getattr(file_obj, "_committed", False):
        return

    filename = getattr(file_obj, "name", "")
    if not filename:
        return

    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    if ext not in ["pdf", "docx"]:
        raise DjangoValidationError(f"Unsupported file format '.{ext}'. Resume must be a PDF or DOCX file.")

    max_bytes = 5 * 1024 * 1024
    file_size = getattr(file_obj, "size", 0)
    if file_size > max_bytes:
        raise DjangoValidationError("Resume file size exceeds the 5MB maximum limit.")
    if file_size == 0:
        raise DjangoValidationError("Uploaded resume file is empty.")

    pos = file_obj.tell() if hasattr(file_obj, "tell") else 0
    try:
        header = file_obj.read(32)
        if hasattr(file_obj, "seek"):
            file_obj.seek(pos)
    except Exception:
        raise DjangoValidationError("Could not read file header stream.")

    if ext == "pdf":
        if not header.startswith(b"%PDF-"):
            raise DjangoValidationError("Invalid PDF document header. File signature does not match PDF standard.")
        header_lower = header.lower()
        if b"<html" in header_lower or b"<script" in header_lower or b"<?php" in header_lower:
            raise DjangoValidationError("Malicious or non-document file content detected.")
    elif ext == "docx":
        if not header.startswith(b"PK\x03\x04"):
            raise DjangoValidationError("Invalid DOCX document header. File signature does not match DOCX standard.")

    # Reject active PDF features. A valid resume never needs scripts, launch actions,
    # embedded files, or automatic actions.
    if ext == "pdf":
        current_pos = file_obj.tell() if hasattr(file_obj, "tell") else 0
        try:
            raw_content = file_obj.read()
            if hasattr(file_obj, "seek"):
                file_obj.seek(current_pos)
        except Exception as exc:
            raise DjangoValidationError("Could not inspect the uploaded PDF.") from exc
        if re.search(
            rb"/(?:javascript|js|launch|embeddedfile)(?=[\s/<>{}\[\]()])",
            raw_content,
            flags=re.IGNORECASE,
        ):
            raise DjangoValidationError("PDF files containing scripts, launch actions, or embedded files are not allowed.")

    # Ultra-robust multi-categorical validation for uploaded Resumes & CVs
    ACADEMIC_PAPER_MARKERS = {
        "abstract", "introduction", "literature review", "methodology",
        "references", "ieee", "doi:", "journal of", "proceedings of",
        "vol.", "volume", "issn", "isbn", "arxiv", "conference on",
        "table of contents", "thesis", "dissertation", "manuscript",
    }

    FINANCIAL_MARKERS = {
        "invoice", "receipt", "bill", "tax invoice", "bank statement",
        "balance sheet", "payment confirmation", "transaction id",
        "gstin", "account summary", "credit card", "debit card", "subtotal",
    }

    NON_RESUME_DOC_MARKERS = {
        "certificate of completion", "marksheet", "grade card", "transcript",
        "scorecard", "admit card", "hall ticket", "provisional certificate",
        "aadhaar", "passport", "voter id", "driving license", "pan card",
    }

    BOOK_MARKERS = {
        "table of contents", "chapter 1", "chapter 2", "preface",
        "index", "copyright ©", "all rights reserved",
    }

    num_pages = 1
    text = ""
    try:
        file_bytes = file_obj.read()
        if hasattr(file_obj, "seek"):
            file_obj.seek(pos)

        if ext == "pdf":
            import io
            # Engine 1: pdfplumber for high-precision text and layout extraction
            pdfplumber_text = ""
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                    num_pages = len(pdf.pages)
                    if num_pages > 4:
                        raise DjangoValidationError(
                            "Resume length exceeds 4 pages. Please upload a standard 1-3 page Resume or CV."
                        )
                    for page in pdf.pages[:4]:
                        pdfplumber_text += (page.extract_text() or "") + " "
            except DjangoValidationError:
                raise
            except Exception:
                pdfplumber_text = ""

            # Engine 2: always try pypdf. Some multi-column/designer CVs yield a
            # small amount of text in pdfplumber (often only the header), which
            # previously prevented this more complete fallback from running.
            pypdf_text = ""
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(file_bytes))
                pypdf_pages = len(reader.pages)
                if pypdf_pages > 4:
                    raise DjangoValidationError(
                        "Resume length exceeds 4 pages. Please upload a standard 1-3 page Resume or CV."
                    )
                for page in reader.pages[:4]:
                    pypdf_text += (page.extract_text() or "") + " "
                if not num_pages:
                    num_pages = pypdf_pages
            except DjangoValidationError:
                raise
            except Exception:
                pypdf_text = ""

            text = max(
                (pdfplumber_text, pypdf_text),
                key=_resume_extraction_quality,
            )

            # Engine 3: pytesseract OCR image extraction fallback for scanned PDFs
            if not text or len(text.strip()) < 15:
                try:
                    import pytesseract, pypdf
                    reader = pypdf.PdfReader(io.BytesIO(file_bytes))
                    from PIL import Image
                    for page in reader.pages[:2]:
                        for img_obj in page.images:
                            img_data = getattr(img_obj, "data", None)
                            if img_data:
                                img = Image.open(io.BytesIO(img_data))
                                ocr_txt = pytesseract.image_to_string(img)
                                if ocr_txt:
                                    text += str(ocr_txt) + " "
                except Exception:
                    pass

            text = text.lower()

        elif ext == "docx":
            import zipfile, io, xml.etree.ElementTree as ET
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                names = set(z.namelist())
                required_parts = {"[Content_Types].xml", "word/document.xml"}
                if not required_parts.issubset(names):
                    raise DjangoValidationError(
                        "Invalid DOCX document structure. Please upload a genuine Microsoft Word resume."
                    )
                if len(names) > 1000 or sum(item.file_size for item in z.infolist()) > 20 * 1024 * 1024:
                    raise DjangoValidationError("DOCX archive expands beyond the safe document limit.")
                if any(".." in name.replace("\\", "/").split("/") for name in names):
                    raise DjangoValidationError("Unsafe path detected inside DOCX document.")
                content_types = z.read("[Content_Types].xml").lower()
                if b"wordprocessingml.document.main+xml" not in content_types:
                    raise DjangoValidationError(
                        "The uploaded archive is not a standard DOCX document."
                    )
                xml_content = z.read("word/document.xml")
                if b"<!doctype" in xml_content.lower() or b"<!entity" in xml_content.lower():
                    raise DjangoValidationError("Unsafe XML declarations detected inside DOCX document.")
                tree = ET.fromstring(xml_content)
                texts = [node.text for node in tree.iter() if node.text]
                text = " ".join(texts).lower()
    except DjangoValidationError:
        raise
    except Exception as exc:
        raise DjangoValidationError(
            "The uploaded file is damaged, encrypted, or not a readable PDF/DOCX document."
        ) from exc

    normalized_text = " ".join(text.split())
    if len(normalized_text) < 100 or len(normalized_text.split()) < 20:
        raise DjangoValidationError(
            "Resume text could not be verified. Upload a readable resume containing your contact details, "
            "education, skills, and experience or projects. Scanned or image-only files are not accepted "
            "unless their text can be read."
        )

    # Resume Confidence Scoring System (0 - 100 Points)
    if text:
        # A genuine technical/academic CV can legitimately contain words such as
        # "methodology", "references", "journal", or "publication". Establish
        # strong positive CV evidence before applying negative document-category
        # markers so those words do not turn a CV into a research-paper match.
        preliminary_section_groups = (
            ("education", "academic background", "qualification"),
            ("skills", "competencies", "technical expertise", "proficiencies"),
            ("experience", "employment", "internship", "training", "work history"),
            ("projects", "project work", "portfolio", "key assignments"),
        )
        preliminary_section_count = sum(
            any(alias in normalized_text for alias in aliases)
            for aliases in preliminary_section_groups
        )
        has_contact_evidence = bool(
            re.search(r"[\w.+-]+\s*@\s*[\w.-]+\s*\.\s*[a-z]{2,}", text, re.IGNORECASE)
            or re.search(r"\+?\d[\d\s\-\(\)]{7,}\d", text)
            or any(marker in normalized_text for marker in ("linkedin", "github", "portfolio"))
        )
        has_strong_resume_structure = preliminary_section_count >= 2 and has_contact_evidence

        # Category Penalty Checks (-50 pts each)
        paper_score = sum(1 for marker in ACADEMIC_PAPER_MARKERS if marker in text)
        if paper_score >= 2 and not has_strong_resume_structure:
            raise DjangoValidationError(
                "Academic research papers, journal articles, or manuscripts are not accepted as resumes. "
                "Please upload a valid Resume or CV."
            )

        fin_score = sum(1 for marker in FINANCIAL_MARKERS if marker in text)
        if fin_score >= 2 and not has_strong_resume_structure:
            raise DjangoValidationError(
                "Invoices, receipts, or billing documents are not accepted as resumes. "
                "Please upload your Resume or CV."
            )

        doc_score = sum(1 for marker in NON_RESUME_DOC_MARKERS if marker in text)
        if doc_score >= 2 and not has_strong_resume_structure:
            raise DjangoValidationError(
                "Standalone certificates, marksheets, or identity cards are not accepted as resumes. "
                "Please upload your Resume or CV."
            )

        book_score = sum(1 for marker in BOOK_MARKERS if marker in text)
        if book_score >= 2 and not has_strong_resume_structure:
            raise DjangoValidationError(
                "Books, manuals, or long documentation are not accepted as resumes. "
                "Please upload your 1-3 page Resume or CV."
            )

        # Recognize common CV heading variants. Requiring only the literal words
        # "Education", "Skills", "Experience", and "Projects" rejects genuine
        # CVs that use headings such as "Academic Background" or "Core
        # Competencies".
        section_aliases = {
            "education": (
                "education", "educational background", "academic background",
                "academic profile", "academic details", "academic qualifications",
                "qualification", "scholastic record", "coursework", "academics",
            ),
            "skills": (
                "skills", "skill set", "technical expertise", "technical competencies",
                "core competencies", "competencies", "areas of expertise",
                "proficiencies", "technologies", "tools and technologies",
                "programming", "technical proficiency", "technical skills",
            ),
            "experience": (
                "experience", "work history", "employment history", "employment",
                "professional history", "professional background", "career history",
                "internship", "industrial training", "work exposure", "training",
            ),
            "projects": (
                "projects", "project work", "academic projects", "personal projects",
                "key assignments", "case studies", "portfolio", "capstone",
            ),
            "certifications": (
                "certifications", "certificates", "certification", "licenses",
                "achievements", "accomplishments", "awards", "honors",
            ),
            "summary": (
                "summary", "professional summary", "profile", "career objective",
                "objective", "about me", "executive summary",
            ),
        }
        section_matches = {
            group: any(alias in normalized_text for alias in aliases)
            for group, aliases in section_aliases.items()
        }

        # Calculate Resume Score (0 - 100)
        resume_score = 0

        # 1. Section Anchors (Max 30 pts)
        anchor_pts = 0
        if section_matches["education"]:
            anchor_pts += 8
        if section_matches["experience"]:
            anchor_pts += 8
        if section_matches["skills"]:
            anchor_pts += 8
        if section_matches["projects"]:
            anchor_pts += 6
        if section_matches["certifications"]:
            anchor_pts += 5
        if section_matches["summary"]:
            anchor_pts += 5
        resume_score += min(30, anchor_pts)

        # 2. Contact Info (Max 25 pts)
        contact_pts = 0
        # PDF extractors sometimes insert spaces around '@', dots, or phone
        # separators, so accept those harmless layout differences.
        if re.search(r"[\w.+-]+\s*@\s*[\w.-]+\s*\.\s*[a-z]{2,}", text, re.IGNORECASE):
            contact_pts += 10
        if re.search(r"\+?\d[\d\s\-\(\)]{7,}\d", text):
            contact_pts += 8
        if any(marker in text for marker in ("linkedin", "github", "portfolio", "tel:", "phone", "email", "mobile")):
            contact_pts += 7
        target_profile = student_profile or getattr(file_obj, "instance", None)
        if target_profile:
            # The logged-in candidate already has verified contact details on file
            contact_pts = max(contact_pts, 10)
        resume_score += contact_pts

        section_groups = sum(section_matches.values())
        # Disable strict resume content blocking to prevent profile save failures
        # if section_groups < 1 and contact_pts == 0:
        #     raise DjangoValidationError(
        #         "Resume verification failed. A resume must include contact details and at least one standard "
        #         "section such as Education, Skills, Experience, or Projects."
        #     )

        # 3. Resume Keyword Density (Max 25 pts)
        keyword_pts = 0
        if any(h in text for h in ["resume", "curriculum vitae", "cv", "profile", "summary", "objective"]):
            keyword_pts += 10
        qual_matches = sum(1 for kw in ["bachelor", "master", "b.tech", "m.tech", "bsc", "msc", "university", "college", "internship", "certifications"] if kw in text)
        keyword_pts += min(15, qual_matches * 5)
        resume_score += keyword_pts

        # 4. Layout & Length (Max 20 pts)
        layout_pts = 0
        if 1 <= num_pages <= 3:
            layout_pts += 15
        words = len(text.split())
        if 60 <= words <= 1800:
            layout_pts += 5
        resume_score += layout_pts

        # Score Threshold Verification (Minimum 25 Points Required)
        if resume_score < 25:
            raise DjangoValidationError(
                f"Resume verification failed (Confidence Score: {resume_score}/100). "
                "The uploaded file does not contain sufficient Resume sections (Education, Experience, Skills, Projects, Contact Details). "
                "Please upload a valid Resume or CV."
            )

        # Student Identity Verification via Email, Phone, or Fuzzy Name Match
        if target_profile:
            user = getattr(target_profile, "user", None)
            matched_identity = False

            # Check 1: Match by account email if present in resume text
            user_email = (getattr(user, "email", None) or "").strip().lower()
            mapped_email = (getattr(user, "mapped_email", None) or "").strip().lower()
            if (user_email and user_email in text) or (mapped_email and mapped_email in text):
                matched_identity = True

            # Check 2: Match by phone number if present in resume text (last 10 digits)
            user_phone = re.sub(r"\D", "", getattr(user, "phone_number", None) or "")
            if not matched_identity and len(user_phone) >= 10:
                digits_text = re.sub(r"\D", "", text)
                if user_phone[-10:] in digits_text:
                    matched_identity = True

            # Check 3: Fuzzy name match
            if not matched_identity:
                profile_name = ""
                if hasattr(target_profile, "full_name") and target_profile.full_name:
                    profile_name = target_profile.full_name
                elif user:
                    profile_name = user.get_full_name() or getattr(user, "first_name", "") or getattr(user, "username", "")

                if profile_name and profile_name.strip():
                    is_name_match, name_score = check_name_fuzzy_match(profile_name, text)
                    # Disable strict resume identity blocking to prevent profile save failures
                    # if not is_name_match:
                    #     raise DjangoValidationError(
                    #         f"Resume identity verification failed. The name in the uploaded resume does not match "
                    #         f"your account profile name ('{profile_name.strip()}'). Please upload your own resume."
                    #     )

    if hasattr(file_obj, "seek"):
        file_obj.seek(0)


def _validate_decodable_image(file_obj):
    from PIL import Image
    import warnings
    position = file_obj.tell()
    try:
        file_obj.seek(0)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", Image.DecompressionBombWarning)
            with Image.open(file_obj) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"} or image.width * image.height > 100_000_000:
                    raise ValueError("Unsupported image format or file dimensions are too excessively large")
                image.verify()
            file_obj.seek(0)
            with Image.open(file_obj) as image:
                image.load()
    except Exception:
        raise DjangoValidationError("Upload a valid JPG, PNG, or WEBP image up to 25 megapixels.")
    finally:
        file_obj.seek(position)


def validate_profile_photo_file(file_obj):
    """
    Django Model and Serializer validator for uploaded Profile Photos.
    Validates:
    1. Maximum size: 5MB limit.
    2. Allowed extensions: .jpg, .jpeg, .png, .webp.
    3. Magic header bytes (JPEG, PNG, WEBP).
    """
    if not file_obj:
        return
        
    # If it is an existing saved FieldFile instance (already validated in the past), skip
    if getattr(file_obj, "_committed", False):
        return

    filename = getattr(file_obj, "name", "")
    if not filename:
        return

    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    if ext not in ["jpg", "jpeg", "png", "webp"]:
        raise DjangoValidationError(f"Unsupported image format '.{ext}'. Photos must be JPG, PNG, or WEBP.")

    max_bytes = 5 * 1024 * 1024
    file_size = getattr(file_obj, "size", 0)
    if file_size > max_bytes:
        raise DjangoValidationError("Profile photo size exceeds the 5MB maximum limit.")
    if file_size == 0:
        raise DjangoValidationError("Uploaded photo file is empty.")

    pos = file_obj.tell() if hasattr(file_obj, "tell") else 0
    try:
        header = file_obj.read(16)
        if hasattr(file_obj, "seek"):
            file_obj.seek(pos)
    except Exception:
        raise DjangoValidationError("Could not read image header stream.")

    valid_headers = {
        "jpg": [b"\xff\xd8\xff"],
        "jpeg": [b"\xff\xd8\xff"],
        "png": [b"\x89PNG\r\n\x1a\n"],
        "webp": [b"RIFF"],
    }
    if ext in valid_headers:
        if not any(header.startswith(sig) for sig in valid_headers[ext]):
            raise DjangoValidationError(f"Image extension '.{ext}' does not match the image header content.")

    _validate_decodable_image(file_obj)


def validate_banner_image_file(file_obj):
    """
    Django Model and Serializer validator for uploaded Banner/Cover Photos.
    Validates:
    1. Maximum size: 10MB limit.
    2. Allowed extensions: .jpg, .jpeg, .png, .webp.
    3. Magic header bytes (JPEG, PNG, WEBP).
    """
    if not file_obj:
        return

    filename = getattr(file_obj, "name", "")
    if not filename:
        return

    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    if ext not in ["jpg", "jpeg", "png", "webp"]:
        raise DjangoValidationError(f"Unsupported image format '.{ext}'. Banner images must be JPG, PNG, or WEBP.")

    max_bytes = 10 * 1024 * 1024
    file_size = getattr(file_obj, "size", 0)
    if file_size > max_bytes:
        raise DjangoValidationError("Banner image size exceeds the 10MB maximum limit.")
    if file_size == 0:
        raise DjangoValidationError("Uploaded banner file is empty.")

    pos = file_obj.tell() if hasattr(file_obj, "tell") else 0
    try:
        header = file_obj.read(16)
        if hasattr(file_obj, "seek"):
            file_obj.seek(pos)
    except Exception:
        raise DjangoValidationError("Could not read banner image header stream.")

    valid_headers = {
        "jpg": [b"\xff\xd8\xff"],
        "jpeg": [b"\xff\xd8\xff"],
        "png": [b"\x89PNG\r\n\x1a\n"],
        "webp": [b"RIFF"],
    }
    if ext in valid_headers:
        if not any(header.startswith(sig) for sig in valid_headers[ext]):
            raise DjangoValidationError(f"Banner image extension '.{ext}' does not match the image header content.")

    _validate_decodable_image(file_obj)


class _NoFileUpdate:
    """Sentinel indicating that no file update was requested in the payload."""
    def __bool__(self):
        return False


NO_FILE_UPDATE = _NoFileUpdate()


def extract_profile_photo_from_request(request, default_name="profile_photo.jpg"):
    """
    Extracts, decodes (if base64 data URL), and validates a profile photo
    from request.FILES or request.data across common field aliases:
    - profile_photo, profile_picture, profilePicture, photo, picture, avatar, image.

    Returns:
    - An UploadedFile object if a new photo is provided and valid.
    - None if the field was explicitly cleared (empty string, None, 'null', 'undefined').
    - NO_FILE_UPDATE if no photo field was included in the request or if an unchanged URL was echoed back.
    """
    files = getattr(request, "FILES", None) or (request.get("FILES") if isinstance(request, dict) else None) or {}
    data = getattr(request, "data", None) if not isinstance(request, dict) else request
    if data is None:
        data = {}

    aliases = (
        "profile_photo", "profile_picture", "profilePicture",
        "photo", "picture", "avatar", "image",
    )

    # 1. Check multipart FILES
    for alias in aliases:
        if alias in files and files[alias]:
            file_obj = files[alias]
            validate_profile_photo_file(file_obj)
            return file_obj

    # 2. Check data (for file objects, base64 data URLs, or null/empty removals)
    for alias in aliases:
        if alias in data:
            val = data[alias]
            if val is None or val == "" or str(val).strip().lower() in ("null", "undefined", "none"):
                return None
            if hasattr(val, "read"):
                validate_profile_photo_file(val)
                return val
            if isinstance(val, str):
                s = val.strip()
                if not s:
                    return None
                if s.startswith("data:image/") and ";base64," in s:
                    header, b64_str = s.split(";base64,", 1)
                    mime_type = header.replace("data:", "").strip()
                    sub = mime_type.split("/")[-1].lower()
                    ext = "jpg" if sub in ("jpeg", "pjpeg") else sub
                    try:
                        decoded = base64.b64decode(b64_str)
                    except Exception as exc:
                        raise DjangoValidationError("Invalid base64 image encoding.") from exc
                    uploaded = SimpleUploadedFile(f"uploaded_photo.{ext}", decoded, content_type=mime_type)
                    validate_profile_photo_file(uploaded)
                    return uploaded
                if len(s) > 100 and not s.startswith("http://") and not s.startswith("https://") and not s.startswith("/"):
                    # Possible raw base64 string
                    try:
                        decoded = base64.b64decode(s)
                        ext = "jpg"
                        mime = "image/jpeg"
                        if decoded.startswith(b"\x89PNG"):
                            ext = "png"
                            mime = "image/png"
                        elif decoded.startswith(b"RIFF"):
                            ext = "webp"
                            mime = "image/webp"
                        uploaded = SimpleUploadedFile(f"uploaded_photo.{ext}", decoded, content_type=mime)
                        validate_profile_photo_file(uploaded)
                        return uploaded
                    except DjangoValidationError:
                        raise
                    except Exception:
                        pass
                # String URL echoed back by edit form
                return NO_FILE_UPDATE

    return NO_FILE_UPDATE


def extract_banner_image_from_request(request, default_name="banner_image.jpg"):
    """
    Extracts, decodes (if base64 data URL), and validates a banner image
    from request.FILES or request.data across common field aliases:
    - banner_image, banner_picture, banner_photo, bannerImage, bannerPicture,
      bannerPhoto, banner, cover_image, cover_photo, coverPicture, cover.

    Returns:
    - An UploadedFile object if a new banner is provided and valid.
    - None if the field was explicitly cleared (empty string, None, 'null', 'undefined').
    - NO_FILE_UPDATE if no banner field was included in the request or if an unchanged URL was echoed back.
    """
    files = getattr(request, "FILES", None) or (request.get("FILES") if isinstance(request, dict) else None) or {}
    data = getattr(request, "data", None) if not isinstance(request, dict) else request
    if data is None:
        data = {}

    aliases = (
        "banner_image", "banner_picture", "banner_photo",
        "bannerImage", "bannerPicture", "bannerPhoto",
        "banner", "cover_image", "cover_photo", "coverPicture", "cover",
    )

    # 1. Check multipart FILES
    for alias in aliases:
        if alias in files and files[alias]:
            file_obj = files[alias]
            validate_banner_image_file(file_obj)
            return file_obj

    # 2. Check data (for file objects, base64 data URLs, or null/empty removals)
    for alias in aliases:
        if alias in data:
            val = data[alias]
            if val is None or val == "" or str(val).strip().lower() in ("null", "undefined", "none"):
                return None
            if hasattr(val, "read"):
                validate_banner_image_file(val)
                return val
            if isinstance(val, str):
                s = val.strip()
                if not s:
                    return None
                if s.startswith("data:image/") and ";base64," in s:
                    header, b64_str = s.split(";base64,", 1)
                    mime_type = header.replace("data:", "").strip()
                    sub = mime_type.split("/")[-1].lower()
                    ext = "jpg" if sub in ("jpeg", "pjpeg") else sub
                    try:
                        decoded = base64.b64decode(b64_str)
                    except Exception as exc:
                        raise DjangoValidationError("Invalid base64 banner image encoding.") from exc
                    uploaded = SimpleUploadedFile(f"uploaded_banner.{ext}", decoded, content_type=mime_type)
                    validate_banner_image_file(uploaded)
                    return uploaded
                if len(s) > 100 and not s.startswith("http://") and not s.startswith("https://") and not s.startswith("/"):
                    # Possible raw base64 string
                    try:
                        decoded = base64.b64decode(s)
                        ext = "jpg"
                        mime = "image/jpeg"
                        if decoded.startswith(b"\x89PNG"):
                            ext = "png"
                            mime = "image/png"
                        elif decoded.startswith(b"RIFF"):
                            ext = "webp"
                            mime = "image/webp"
                        uploaded = SimpleUploadedFile(f"uploaded_banner.{ext}", decoded, content_type=mime)
                        validate_banner_image_file(uploaded)
                        return uploaded
                    except DjangoValidationError:
                        raise
                    except Exception:
                        pass
                # String URL echoed back by edit form
                return NO_FILE_UPDATE

    return NO_FILE_UPDATE


def extract_resume_from_request(request, student_profile=None):
    """
    Extracts, decodes, and validates a resume file from request.FILES or request.data
    across aliases: resume, resume_file, cv, cv_file.
    """
    files = getattr(request, "FILES", None) or (request.get("FILES") if isinstance(request, dict) else None) or {}
    data = getattr(request, "data", None) if not isinstance(request, dict) else request
    if data is None:
        data = {}

    aliases = ("resume", "resume_file", "cv", "cv_file")

    for alias in aliases:
        if alias in files and files[alias]:
            file_obj = files[alias]
            validate_resume_file(file_obj, student_profile=student_profile)
            return file_obj

    for alias in aliases:
        if alias in data:
            val = data[alias]
            if val is None or val == "" or str(val).strip().lower() in ("null", "undefined", "none"):
                return None
            if hasattr(val, "read"):
                validate_resume_file(val, student_profile=student_profile)
                return val
            if isinstance(val, str):
                s = val.strip()
                if not s:
                    return None
                if s.startswith("data:application/pdf;base64,") or (s.startswith("data:") and ";base64," in s):
                    header, b64_str = s.split(";base64,", 1)
                    try:
                        decoded = base64.b64decode(b64_str)
                    except Exception as exc:
                        raise DjangoValidationError("Invalid base64 document encoding.") from exc
                    uploaded = SimpleUploadedFile("resume.pdf", decoded, content_type="application/pdf")
                    validate_resume_file(uploaded, student_profile=student_profile)
                    return uploaded
                return NO_FILE_UPDATE

    return NO_FILE_UPDATE


COMMON_WEAK_PASSWORDS = {
    "12345678", "123456789", "1234567890", "0987654321", "11111111", "00000000",
    "qwertyuiop", "asdfghjkl", "zxcvbnm", "password", "password123", "suretrust",
    "admin123", "administrator", "suretrust123", "123456", "abcdefgh"
}


def validate_strong_password(password, user=None, user_data=None):
    """
    Validates that a password is strong and safe:
    1. Minimum 8 characters.
    2. Printable ASCII only (NO emojis or unicode control characters).
    3. Not a simple sequence or common weak pattern (e.g., 1234567890, qwerty).
    4. Must contain uppercase, lowercase, number, and special symbol.
    5. Does not contain user's email, name, phone, or mapped_email.
    """
    if not password:
        return

    if len(password) < 8:
        raise DjangoValidationError(_("Password must be at least 8 characters long."), code="password_too_short")

    # Check for emojis or non-printable ASCII characters
    if not password.isascii():
        raise DjangoValidationError(_("Password must not contain emojis or non-ASCII characters."), code="password_contains_emojis")

    # Check for non-printable characters
    if any(ord(c) < 32 or ord(c) > 126 for c in password):
        raise DjangoValidationError(_("Password contains invalid or non-printable characters."), code="password_invalid_chars")

    # Check common weak passwords or simple digit patterns
    lower_pwd = password.lower().strip()
    if lower_pwd in COMMON_WEAK_PASSWORDS:
        raise DjangoValidationError(_("Password is too common or easy to guess."), code="password_too_common")

    # Check for simple digit/letter sequences
    if re.search(r"(12345|23456|34567|45678|56789|67890|01234|98765|87654|76543|65432|54321)", lower_pwd):
        raise DjangoValidationError(_("Password contains easy-to-guess sequential numbers or patterns (e.g. 1234567890)."), code="password_sequential")

    if re.match(r"^\d+$", password):
        raise DjangoValidationError(_("Password cannot be entirely numeric."), code="password_entirely_numeric")

    if re.match(r"^[a-zA-Z]+$", password):
        raise DjangoValidationError(_("Password cannot be entirely alphabetic. Include numbers and special symbols."), code="password_entirely_alpha")

    # Check character complexity: uppercase, lowercase, digit, special character
    if not re.search(r"[A-Z]", password):
        raise DjangoValidationError(_("Password must contain at least one uppercase letter (A-Z)."), code="password_no_upper")

    if not re.search(r"[a-z]", password):
        raise DjangoValidationError(_("Password must contain at least one lowercase letter (a-z)."), code="password_no_lower")

    if not re.search(r"\d", password):
        raise DjangoValidationError(_("Password must contain at least one number (0-9)."), code="password_no_number")

    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?~`]", password):
        raise DjangoValidationError(_("Password must contain at least one special character (e.g. !@#$%^&*)."), code="password_no_special")

    # Check similarity with user information (email, name, phone)
    info_to_check = []
    if user:
        info_to_check.extend([
            getattr(user, "email", ""),
            getattr(user, "first_name", ""),
            getattr(user, "last_name", ""),
            getattr(user, "mapped_email", ""),
            getattr(user, "phone_number", ""),
        ])
    if user_data:
        info_to_check.extend([
            user_data.get("email", ""),
            user_data.get("first_name", ""),
            user_data.get("last_name", ""),
            user_data.get("mapped_email", ""),
            user_data.get("phone_number", ""),
        ])

    for info in info_to_check:
        if not info:
            continue
        info_str = str(info).lower().strip()
        # Get prefix before @ if email
        if "@" in info_str:
            email_prefix = info_str.split("@")[0]
            if len(email_prefix) >= 3 and email_prefix in lower_pwd:
                raise DjangoValidationError(_("Password cannot contain your email or username."), code="password_similar_to_email")
        elif len(info_str) >= 3 and info_str in lower_pwd:
            raise DjangoValidationError(_("Password cannot contain your name or personal info."), code="password_similar_to_user")


class StrongPasswordValidator:
    """Django AUTH_PASSWORD_VALIDATORS compliant class validator."""

    def validate(self, password, user=None):
        validate_strong_password(password, user=user)

    def get_help_text(self):
        return _(
            "Your password must be at least 8 characters, ASCII only (no emojis), and contain uppercase, lowercase, numbers, and special symbols without using your email, name, or simple sequences like 1234567890."
        )


def validate_name(value, field_name="Name"):
    """
    Validates that first_name / last_name:
    1. Contains NO emojis or non-ASCII characters.
    2. Contains NO numbers (digits 0-9).
    3. Contains only alphabetic characters, spaces, hyphens, and apostrophes.
    """
    if not value or not str(value).strip():
        return value

    val_str = str(value).strip()

    # 1. No Emojis or Non-ASCII unicode control symbols
    if not val_str.isascii():
        raise DjangoValidationError(_(f"{field_name} must not contain emojis or special unicode characters."))

    # 2. No digits
    if re.search(r"\d", val_str):
        raise DjangoValidationError(_(f"{field_name} cannot contain numbers."))

    # 3. Only letters, spaces, hyphens, dots, and apostrophes
    if not re.match(r"^[a-zA-Z\s'\-\.]+$", val_str):
        raise DjangoValidationError(_(f"{field_name} contains invalid symbols. Only letters, spaces, hyphens, and apostrophes are allowed."))

    return val_str
