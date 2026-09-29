import io
import os
import re
import zipfile
import xml.etree.ElementTree as ET

from django.db import transaction
from django.utils import timezone

from common.validators import _resume_extraction_quality
from students.models import StudentProfile


SECTION_ALIASES = {
    "summary": {"summary", "professional summary", "profile", "career objective", "objective", "about me"},
    "skills": {"skills", "technical skills", "skill set", "core competencies", "technical expertise", "proficiencies"},
    "education": {"education", "educational background", "academic background", "academic profile", "qualifications"},
    "experience": {"experience", "work experience", "professional experience", "employment history", "training", "internships"},
    "projects": {"projects", "project work", "academic projects", "personal projects", "key projects"},
    "achievements": {"achievements", "awards", "certifications", "publications", "publications & media recognition"},
}
ALL_HEADINGS = set().union(*SECTION_ALIASES.values())


def extract_resume_text(resume_file):
    """Extract text from a saved PDF or DOCX using storage-agnostic reads."""
    if not resume_file:
        return ""

    name = getattr(resume_file, "name", "")
    extension = os.path.splitext(name)[1].lower()
    try:
        resume_file.open("rb")
        file_bytes = resume_file.read()
    finally:
        try:
            resume_file.close()
        except Exception:
            pass

    if extension == ".pdf":
        candidates = []
        try:
            import pdfplumber

            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                candidates.append("\n".join((page.extract_text() or "") for page in pdf.pages[:4]))
        except Exception:
            pass
        try:
            import pypdf

            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            candidates.append("\n".join((page.extract_text() or "") for page in reader.pages[:4]))
        except Exception:
            pass
        return max(candidates, key=_resume_extraction_quality) if candidates else ""

    if extension == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
                root = ET.fromstring(archive.read("word/document.xml"))
            paragraphs = []
            for paragraph in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
                value = "".join(
                    node.text or ""
                    for node in paragraph.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")
                ).strip()
                if value:
                    paragraphs.append(value)
            return "\n".join(paragraphs)
        except Exception:
            return ""

    return ""


def _clean_line(value):
    return " ".join(str(value or "").replace("\uf0b7", " ").replace("•", " ").split()).strip(" :-|\t")


def _normalized_heading(value):
    return re.sub(r"[^a-z0-9& ]", "", _clean_line(value).lower()).strip()


def _section_lines(lines, section):
    aliases = SECTION_ALIASES[section]
    start = None
    for index, line in enumerate(lines):
        heading = _normalized_heading(line)
        if heading in aliases:
            start = index + 1
            break
    if start is None:
        return []

    result = []
    for line in lines[start:]:
        if _normalized_heading(line) in ALL_HEADINGS:
            break
        cleaned = _clean_line(line)
        if cleaned:
            result.append(cleaned)
    return result


def _extract_skills(lines):
    skill_lines = _section_lines(lines, "skills")
    skills = []
    category_labels = {
        "languages", "frameworks", "tools", "platforms", "technologies",
        "embedded systems", "eda tools/platforms", "soft skills", "databases",
    }
    for line in skill_lines:
        candidate = line
        if ":" in candidate:
            label, remainder = candidate.split(":", 1)
            if label.strip().lower() in category_labels:
                candidate = remainder
        for item in re.split(r"[,;|]", candidate):
            skill = _clean_line(item).rstrip(".")
            if not skill or len(skill) > 80 or len(skill.split()) > 8:
                continue
            if skill.lower() not in {existing.lower() for existing in skills}:
                skills.append(skill[:100])
            if len(skills) >= 40:
                return skills
    return skills


def extract_profile_details(resume_text):
    """Return only high-confidence profile details found explicitly in resume text."""
    lines = [_clean_line(line) for line in (resume_text or "").splitlines()]
    lines = [line for line in lines if line]
    full_text = "\n".join(lines)
    details = {"profile": {}, "user": {}}

    phone_match = re.search(r"(?:mobile|phone|contact)?\s*:?[ \t]*(\+?\d[\d ()-]{8,}\d)", full_text, re.IGNORECASE)
    if phone_match:
        phone = re.sub(r"\s+", " ", phone_match.group(1)).strip()
        details["user"]["phone_number"] = phone[:20]

    urls = [url.rstrip(".,;)") for url in re.findall(r"https?://[^\s<>()]+", full_text, re.IGNORECASE)]
    for url in urls:
        lower_url = url.lower()
        if "linkedin.com/" in lower_url and "linkedin_url" not in details["profile"]:
            details["profile"]["linkedin_url"] = url
        elif "github.com/" in lower_url and "github_url" not in details["profile"]:
            details["profile"]["github_url"] = url
        elif "portfolio_url" not in details["profile"]:
            details["profile"]["portfolio_url"] = url

    summary_lines = _section_lines(lines, "summary")
    if summary_lines:
        summary = " ".join(summary_lines)
        details["profile"]["tagline"] = summary[:200]
        details["profile"]["bio"] = summary[:1500]

    skills = _extract_skills(lines)
    if skills:
        details["profile"]["skills"] = skills

    education_lines = _section_lines(lines, "education")
    institution_pattern = re.compile(r"\b(university|college|institute|school|polytechnic|academy)\b", re.IGNORECASE)
    degree_pattern = re.compile(
        r"\b(bachelor|master|diploma|b\.?\s?tech|m\.?\s?tech|bsc|msc|bca|mca|ph\.?d|doctorate)\b",
        re.IGNORECASE,
    )
    specialization_pattern = re.compile(
        r"\b(computer science|information technology|electronics(?: and communication)?|"
        r"electrical|mechanical|civil|data science|artificial intelligence|business administration|commerce)\b",
        re.IGNORECASE,
    )

    for line in education_lines:
        if "college" not in details["profile"] and institution_pattern.search(line):
            details["profile"]["college"] = line[:255]
        degree_match = degree_pattern.search(line)
        if "degree" not in details["profile"] and degree_match:
            degree_value = re.split(r"[;|]", line, maxsplit=1)[0].strip()
            degree_value = re.split(
                r"\s+(?=(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[’']?\s*\d|20\d{2})",
                degree_value,
                maxsplit=1,
                flags=re.IGNORECASE,
            )[0].strip()
            if " in " in degree_value.lower():
                split_at = degree_value.lower().index(" in ")
                details["profile"]["degree"] = degree_value[:split_at][:150]
                specialization = degree_value[split_at + 4:].strip()
                if specialization:
                    details["profile"]["specialization"] = specialization[:150]
            else:
                details["profile"]["degree"] = degree_value[:150]
        if "specialization" not in details["profile"]:
            specialization_match = specialization_pattern.search(line)
            if specialization_match and not institution_pattern.search(line):
                specialization = re.split(r"[;|]", line, maxsplit=1)[0].strip()
                details["profile"]["specialization"] = specialization[:150]

    explicit_graduation = re.search(
        r"(?:graduat(?:ing|ion)|expected|class of)\D{0,20}(20\d{2})",
        " ".join(education_lines),
        re.IGNORECASE,
    )
    if explicit_graduation:
        details["profile"]["graduation_year"] = int(explicit_graduation.group(1))

    return details


def autofill_student_profile_from_resume(student_profile_id, resume_text):
    """Atomically fill blank fields only; never overwrite student-entered data."""
    extracted = extract_profile_details(resume_text)
    changed = {"profile": [], "user": []}

    with transaction.atomic():
        profile = StudentProfile.objects.select_for_update().select_related("user").get(pk=student_profile_id)
        user = profile.user.__class__.objects.select_for_update().get(pk=profile.user_id)

        profile_updates = {}
        for field, value in extracted["profile"].items():
            current = getattr(profile, field)
            if current in (None, "", [], {}) and value not in (None, "", [], {}):
                profile_updates[field] = value
                changed["profile"].append(field)
        if profile_updates:
            profile_updates["updated_at"] = timezone.now()
            StudentProfile.objects.filter(pk=profile.pk).update(**profile_updates)

        user_updates = {}
        for field, value in extracted["user"].items():
            current = getattr(user, field)
            if current in (None, "") and value not in (None, ""):
                user_updates[field] = value
                changed["user"].append(field)
        if user_updates:
            user_updates["updated_at"] = timezone.now()
            user.__class__.objects.filter(pk=user.pk).update(**user_updates)

    return changed
