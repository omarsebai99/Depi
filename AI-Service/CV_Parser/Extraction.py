import json
import os
import re
from datetime import date

from dotenv import load_dotenv
from groq import Groq

from prompts import CV_EXTRACTION_PROMPT
from CV_Parser.Role_Inference import (
    VALID_LEVELS,
    infer_role_from_skills,
    map_role,
    normalize_level,
)

load_dotenv()

PARSER_VERSION = "cv-parser-2.0"
LLM_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")

TECH_SKILL_PATTERNS = {
    "Python": [r"\bpython\b"],
    "Java": [r"\bjava\b"],
    "C++": [r"\bc\+\+\b"],
    "C#": [r"\bc#\b", r"\bc sharp\b"],
    "JavaScript": [r"\bjavascript\b"],
    "TypeScript": [r"\btypescript\b"],
    "PHP": [r"\bphp\b"],
    "Go": [r"\bgolang\b", r"\bgo\b"],
    "SQL": [r"\bsql\b"],
    "HTML": [r"\bhtml5?\b"],
    "CSS": [r"\bcss3?\b", r"\bcss\b"],
    "React": [r"\breact(?:\.js)?\b"],
    "Next.js": [r"\bnext(?:\.js)?\b"],
    "Vue.js": [r"\bvue(?:\.js)?\b"],
    "Angular": [r"\bangular\b"],
    "Node.js": [r"\bnode(?:\.js)?\b"],
    "Express.js": [r"\bexpress(?:\.js)?\b"],
    "FastAPI": [r"\bfastapi\b"],
    "Django": [r"\bdjango\b"],
    "Flask": [r"\bflask\b"],
    "Spring Boot": [r"\bspring boot\b"],
    "Laravel": [r"\blaravel\b"],
    "REST API": [r"\brest(?:ful)? api\b", r"\brestful\b"],
    "GraphQL": [r"\bgraphql\b"],
    "MongoDB": [r"\bmongodb\b"],
    "MySQL": [r"\bmysql\b"],
    "PostgreSQL": [r"\bpostgresql\b", r"\bpostgres\b"],
    "SQLite": [r"\bsqlite\b"],
    "Redis": [r"\bredis\b"],
    "Docker": [r"\bdocker\b"],
    "Kubernetes": [r"\bkubernetes\b", r"\bk8s\b"],
    "Git": [r"\bgit\b", r"\bgithub\b", r"\bgitlab\b"],
    "Linux": [r"\blinux\b"],
    "AWS": [r"\baws\b", r"\bamazon web services\b"],
    "Azure": [r"\bazure\b"],
    "GCP": [r"\bgcp\b", r"\bgoogle cloud\b"],
    "TensorFlow": [r"\btensorflow\b"],
    "PyTorch": [r"\bpytorch\b"],
    "Scikit-learn": [r"\bscikit[- ]learn\b", r"\bsklearn\b"],
    "Pandas": [r"\bpandas\b"],
    "NumPy": [r"\bnumpy\b"],
    "Power BI": [r"\bpower bi\b"],
    "Tableau": [r"\btableau\b"],
    "Excel": [r"\bexcel\b"],
    "Apache Spark": [r"\bspark\b"],
    "Airflow": [r"\bairflow\b"],
    "Hadoop": [r"\bhadoop\b"],
    "LangChain": [r"\blangchain\b"],
    "LLMs": [r"\bllm\b", r"\bllms\b", r"\blarge language model\b"],
}

SKILLS_SECTION_HEADINGS = {
    "skills",
    "technical skills",
    "core skills",
    "core competencies",
    "competencies",
    "expertise",
    "areas of expertise",
    "strengths",
    "tools",
    "technologies",
    "languages",
}

SECTION_HEADINGS = {
    "experience": {
        "experience",
        "work experience",
        "professional experience",
        "employment history",
        "career history",
        "employment",
        "professional",
        "jobs",
        "positions",
    },
    "education": {
        "education",
        "academic background",
        "academics",
        "educational background",
        "qualifications",
        "schooling",
        "studies",
    },
    "projects": {
        "projects",
        "personal projects",
        "academic projects",
        "key projects",
        "project experience",
        "relevant projects",
        "portfolio",
        "works",
    },
    "certifications": {
        "certifications",
        "certificates",
        "licenses",
        "credentials",
        "awards",
        "achievements",
        "honors",
        "courses",
    },
}

# Keywords to validate that extracted lines belong to specific sections
SECTION_KEYWORDS = {
    "experience": {
        "worked",
        "led",
        "managed",
        "developed",
        "implemented",
        "designed",
        "contributed",
        "responsible for",
        "duration",
        "role",
        "company",
        "organization",
        "full-time",
        "part-time",
        "internship",
        "contract",
    },
    "education": {
        "university",
        "college",
        "school",
        "degree",
        "bachelor",
        "master",
        "diploma",
        "certificate",
        "gpa",
        "graduated",
        "expected",
        "honors",
        "distinction",
        "major",
        "minor",
        "faculty",
    },
    "projects": {
        "built",
        "developed",
        "created",
        "designed",
        "implemented",
        "collaborated",
        "tech stack",
        "features",
        "technologies",
        "platform",
        "application",
        "system",
        "solution",
        "project",
        "graduation",
        "personal",
        "academic",
    },
    "certifications": {
        "certified",
        "credential",
        "license",
        "certified by",
        "issued by",
        "valid",
        "expir",
        "award",
        "recognition",
    },
}

SECTION_TITLES = {
    normalized
    for values in SECTION_HEADINGS.values()
    for normalized in values
}.union(
    {
        "skills",
        "technical skills",
        "summary",
        "profile",
        "objective",
        "contact",
        "personal information",
        "achievements",
        "awards",
        "languages",
        "interests",
        "training",
        "internship",
        "training & internship experience",
        "training and internship experience",
        "training & internship",
        "training and internship",
        "work history",
        "career history",
        "courses",
        "certifications",
    }
)

MONTH_LOOKUP = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

GENERIC_ROLE_PATTERN = re.compile(
    r"\b(?:senior|junior|lead|principal|assistant|associate|head|chief)?\s*"
    r"(?:[a-z][a-z&/+.-]*\s+){0,4}"
    r"(?:developer|engineer|scientist|analyst|manager|specialist|"
    r"coordinator|consultant|representative|officer|assistant|designer|"
    r"teacher|instructor|recruiter|executive|administrator|accountant|"
    r"architect|writer|editor|researcher|marketer|salesperson|intern)\b",
    re.IGNORECASE,
)

EMAIL_PATTERN = re.compile(
    r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
    re.IGNORECASE,
)
PHONE_PATTERN = re.compile(
    r"(?:(?:\+\d{1,3}[\s\-]*)?(?:\(?\d{2,4}\)?[\s\-]*){2,4}\d{2,4})"
)
URL_PATTERN = re.compile(r"(https?://[^\s|]+|www\.[^\s|]+)", re.IGNORECASE)
YEARS_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience",
    re.IGNORECASE,
)
DATE_RANGE_PATTERN = re.compile(
    r"(?P<start>(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)"
    r"[a-z]*\s+\d{4}|\d{4})\s*(?:-|–|to)\s*"
    r"(?P<end>(?:present|current|now|ongoing|"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)"
    r"[a-z]*\s+\d{4}|\d{4}))",
    re.IGNORECASE,
)


def get_groq_client():
    api_key = os.environ.get("GROQ_API_KEY")

    if not api_key:
        raise ValueError(
            "GROQ_API_KEY is not set. Falling back to heuristic parsing."
        )

    return Groq(api_key=api_key)


def strip_markdown_fence(text):
    raw_output = str(text or "").strip()

    if raw_output.startswith("```json"):
        return raw_output[7:-3].strip()
    if raw_output.startswith("```"):
        return raw_output[3:-3].strip()
    return raw_output


def extract_json_object(text):
    cleaned = strip_markdown_fence(text)

    if cleaned.startswith("{") and cleaned.endswith("}"):
        return cleaned

    start = cleaned.find("{")
    end = cleaned.rfind("}")

    if start != -1 and end != -1 and end > start:
        return cleaned[start : end + 1]

    return cleaned


def unique_strings(values):
    unique = []
    seen = set()

    for value in values or []:
        normalized = normalize_line(value)
        key = normalized.lower()

        if normalized and key not in seen:
            seen.add(key)
            unique.append(normalized)

    return unique


def normalize_line(value):
    return re.sub(r"\s+", " ", str(value or "")).strip(" -•\t\r\n")


def normalize_lines(text):
    lines = []
    for raw_line in str(text or "").splitlines():
        line = normalize_line(raw_line)
        if line:
            lines.append(line)
    return lines


def normalize_skills(skills):
    normalized = []
    seen = set()

    for skill in skills or []:
        value = normalize_line(skill)
        if not value:
            continue

        key = value.lower()
        if key not in seen:
            seen.add(key)
            normalized.append(value)

    return normalized


def clean_skill_token(token):
    value = normalize_line(token)
    if not value:
        return ""

    value = re.sub(
        r"^(?:skills?|technical skills?|core skills?|core competencies|"
        r"competencies|expertise|areas of expertise|strengths|tools|"
        r"technologies|languages?)\s*[:\-]\s*",
        "",
        value,
        flags=re.IGNORECASE,
    )
    value = normalize_line(value)
    lowered = value.lower()

    if not value or lowered in SECTION_TITLES:
        return ""
    if EMAIL_PATTERN.search(value) or URL_PATTERN.search(value):
        return ""
    if re.fullmatch(r"[\d\s\-+/,.]+", value):
        return ""
    if len(value) > 60 and len(value.split()) > 7:
        return ""

    return value


def first_non_empty(*values):
    for value in values:
        if isinstance(value, str):
            candidate = normalize_line(value)
            if candidate:
                return candidate
        elif value not in (None, [], {}):
            return value
    return ""


def parse_float(value, default=0.0):
    if isinstance(value, (int, float)):
        return round(float(value), 1)

    if isinstance(value, str):
        match = re.search(r"\d+(?:\.\d+)?", value)
        if match:
            return round(float(match.group(0)), 1)

    return default


def is_heading(line):
    normalized = normalize_line(line).lower().rstrip(":")
    return normalized in SECTION_TITLES


def is_probable_name(line):
    normalized = normalize_line(line)

    if not normalized:
        return False
    if any(token in normalized.lower() for token in ["@", "http", "www", "linkedin", "github"]):
        return False
    if re.search(r"\d", normalized):
        return False
    if is_heading(normalized):
        return False

    words = normalized.split()
    if len(words) < 2 or len(words) > 5:
        return False

    uppercase_ratio = sum(1 for char in normalized if char.isupper()) / max(len(normalized), 1)
    if uppercase_ratio > 0.55:
        return True

    return all(word[:1].isalpha() for word in words)


def extract_name(lines):
    for line in lines[:12]:
        if is_probable_name(line):
            return normalize_line(line.title() if line.isupper() else line)
    return ""


def extract_primary_email(text):
    matches = EMAIL_PATTERN.findall(text or "")
    return matches[0] if matches else ""


def extract_primary_phone(text):
    matches = PHONE_PATTERN.findall(text or "")

    for match in matches:
        digits = re.sub(r"\D", "", match)
        if 8 <= len(digits) <= 15:
            cleaned = re.sub(r"\s{2,}", " ", match).strip()
            return cleaned

    return ""


def extract_links(text):
    urls = unique_strings(URL_PATTERN.findall(text or ""))
    linkedin = ""
    github = ""
    portfolio = ""

    for raw_url in urls:
        url = raw_url if raw_url.startswith("http") else f"https://{raw_url}"
        lowered = url.lower()

        if "linkedin.com" in lowered and not linkedin:
            linkedin = url
        elif "github.com" in lowered and not github:
            github = url
        elif not portfolio:
            portfolio = url

    return linkedin, github, portfolio


def extract_location(lines):
    for line in lines[:12]:
        lowered = line.lower()
        if any(token in lowered for token in ["@", "http", "github", "linkedin"]):
            continue
        if re.search(r"\b(?:egypt|cairo|giza|alexandria|riyadh|dubai|ksa|uae)\b", lowered):
            return normalize_line(line)
        if "," in line and len(line.split()) <= 6 and not re.search(r"\d", line):
            return normalize_line(line)
    return ""


def detect_skills(text):
    lowered = str(text or "").lower()
    skills = []

    for skill, patterns in TECH_SKILL_PATTERNS.items():
        if any(re.search(pattern, lowered) for pattern in patterns):
            skills.append(skill)

    section_skills = extract_skills_from_sections(text)
    return normalize_skills(skills + section_skills)


def extract_skills_from_sections(text):
    lines = normalize_lines(text)
    items = []
    collecting = False

    for line in lines:
        normalized = normalize_line(line).lower().rstrip(":")

        if not collecting:
            if is_heading_match(normalized, SKILLS_SECTION_HEADINGS):
                collecting = True
                remainder = strip_heading_prefix(
                    line,
                    [
                        r"^skills?\b",
                        r"^technical skills?\b",
                        r"^core skills?\b",
                        r"^core competencies\b",
                        r"^competencies\b",
                        r"^expertise\b",
                        r"^areas of expertise\b",
                        r"^strengths\b",
                        r"^tools\b",
                        r"^technologies\b",
                        r"^languages?\b",
                    ],
                )
                if remainder:
                    items.extend(split_skill_line(remainder))
            continue

        is_any_section = is_heading_match(normalized, SECTION_TITLES)
        if is_any_section and not is_heading_match(normalized, SKILLS_SECTION_HEADINGS):
            break

        items.extend(split_skill_line(line))

    return normalize_skills(items)


def split_skill_line(line):
    value = normalize_line(line)
    if not value:
        return []

    segments = re.split(r"[|,;/]+", value)
    if len(segments) == 1 and len(value.split()) > 8:
        segments = re.split(r"\s{2,}", value)

    tokens = []
    for segment in segments:
        cleaned = clean_skill_token(segment)
        if cleaned:
            tokens.append(cleaned)

    if not tokens:
        cleaned_value = clean_skill_token(value)
        return [cleaned_value] if cleaned_value else []

    return tokens


def is_heading_match(normalized_line, section_headings):
    """Check if a line is a heading using fuzzy matching."""
    if not normalized_line:
        return False
    
    # Exact match first (fastest)
    if normalized_line in section_headings:
        return True
    
    # Fuzzy match for partial matches and variations
    # Remove common words and compare similarity
    normalized_cleaned = re.sub(r"\b(and|or|the)\b", "", normalized_line).strip()
    
    for heading in section_headings:
        heading_cleaned = re.sub(r"\b(and|or|the)\b", "", heading).strip()
        
        # Exact match after cleaning
        if normalized_cleaned == heading_cleaned:
            return True
        
        # Partial match (70% similarity or more)
        if len(normalized_cleaned) > 4:  # Only for substantial strings
            # Check if any section heading contains most of this line
            words_in_line = set(normalized_cleaned.split())
            words_in_heading = set(heading.split())
            
            if words_in_heading.issubset(words_in_line):
                return True
    
    return False


def validate_line_for_section(line, section_name):
    """Check if a line likely belongs to a section based on keywords."""
    normalized = line.lower()
    
    # Skip very short lines (likely formatting)
    if len(normalized.split()) < 2:
        return True  # Don't filter out - could be valid
    
    # Skip lines that are dates or numbers only
    if re.match(r"^[\d\s\-/,]*$", normalized):
        return True  # These are typically valid (dates, years, etc.)
    
    # For projects: be less strict since project titles often don't have action verbs
    if section_name == "projects":
        # Accept almost everything - project titles are diverse
        # Just reject lines that are clearly technical skills or other sections
        if any(keyword in normalized for keyword in ["language:", "tool:", "framework:", "technology:"]):
            return False
        return True
    
    # If we have keywords for this section, use them for validation
    keywords = SECTION_KEYWORDS.get(section_name, set())
    if not keywords:
        return True  # No keywords defined, accept everything
    
    # Check if line contains any section keywords
    line_lower = normalized
    has_keyword = any(keyword in line_lower for keyword in keywords)
    
    # Also accept lines with dates (likely experience entries)
    has_date = bool(re.search(r"\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec", line_lower))
    
    # Accept if it has a keyword OR has a date (for experience/education)
    return has_keyword or has_date


def reorder_interleaved_lines(lines):
    """
    Attempt to reorder lines that may be from multi-column PDF layout.
    Groups lines that appear to be from the same logical block.
    """
    if not lines:
        return lines
    
    # This is a simplified approach: group consecutive content blocks
    # A more sophisticated approach would require PDF coordinate info
    # For now, we preserve order but with better boundary detection
    return lines


def detect_section(lines, section_name):
    """
    Detect section content with improved heading matching and content validation.
    Uses fuzzy heading matching, keyword filtering, and handles column interleaving.
    """
    headings = SECTION_HEADINGS[section_name]
    items = []
    collecting = False
    consecutive_non_matching = 0
    max_non_matching_threshold = 3  # Allow up to 3 lines without section keywords before stopping

    for i, line in enumerate(lines):
        normalized = normalize_line(line).lower().rstrip(":")

        # Check for section heading
        if is_heading_match(normalized, headings):
            collecting = True
            consecutive_non_matching = 0
            continue

        # Check for stop condition (another section started)
        if collecting:
            # Check if this line is ANY recognized section heading (not just the current section)
            is_any_section = is_heading_match(normalized, SECTION_TITLES)
            
            # If it's a different section heading, stop collecting
            if is_any_section and not is_heading_match(normalized, headings):
                break

        if collecting:
            # Validate that the line belongs to this section
            if validate_line_for_section(line, section_name):
                items.append(line)
                consecutive_non_matching = 0
            else:
                consecutive_non_matching += 1
                # Stop if we've seen too many non-matching lines
                if consecutive_non_matching > max_non_matching_threshold:
                    break

    return unique_strings(items)


def extract_role_from_lines(lines):
    role_pattern = re.compile(
        r"\b(?:frontend|backend|full stack|fullstack|software|web|data|ai|ml)"
        r"[\w /-]*(?:developer|engineer|scientist|analyst|intern)\b",
        re.IGNORECASE,
    )

    for line in lines[:20]:
        match = role_pattern.search(line)
        if match:
            return normalize_line(match.group(0))
        generic_match = GENERIC_ROLE_PATTERN.search(line)
        if generic_match:
            return normalize_line(generic_match.group(0))

    text = "\n".join(lines)
    match = role_pattern.search(text)
    if match:
        return normalize_line(match.group(0))

    generic_match = GENERIC_ROLE_PATTERN.search(text)
    return normalize_line(generic_match.group(0)) if generic_match else ""


def parse_partial_date(value, is_end=False):
    text = normalize_line(value).lower()

    if not text:
        return None

    if text in {"present", "current", "now", "ongoing"}:
        today = date.today()
        return today.year, today.month

    month_year = re.match(r"([a-z]+)\s+(\d{4})", text)
    if month_year:
        month = MONTH_LOOKUP.get(month_year.group(1)[:4], MONTH_LOOKUP.get(month_year.group(1)[:3]))
        year = int(month_year.group(2))
        if month:
            return year, month

    year_only = re.match(r"(\d{4})", text)
    if year_only:
        return int(year_only.group(1)), 12 if is_end else 1

    return None


def months_between(start_tuple, end_tuple):
    if not start_tuple or not end_tuple:
        return 0

    start_year, start_month = start_tuple
    end_year, end_month = end_tuple

    total = (end_year - start_year) * 12 + (end_month - start_month) + 1
    return max(total, 0)


def merge_intervals(intervals):
    if not intervals:
        return []

    sorted_intervals = sorted(intervals, key=lambda item: item[0])
    merged = [sorted_intervals[0]]

    for current_start, current_end in sorted_intervals[1:]:
        last_start, last_end = merged[-1]

        if current_start <= last_end + 1:
            merged[-1] = (last_start, max(last_end, current_end))
        else:
            merged.append((current_start, current_end))

    return merged


def estimate_experience_years(text):
    explicit_years = [
        float(match)
        for match in YEARS_PATTERN.findall(text or "")
    ]

    intervals = []
    for match in DATE_RANGE_PATTERN.finditer(text or ""):
        start = parse_partial_date(match.group("start"))
        end = parse_partial_date(match.group("end"), is_end=True)

        if not start or not end:
            continue

        start_index = start[0] * 12 + start[1]
        end_index = end[0] * 12 + end[1]
        if end_index >= start_index:
            intervals.append((start_index, end_index))

    interval_years = 0.0
    if intervals:
        merged = merge_intervals(intervals)
        total_months = sum((end - start) + 1 for start, end in merged)
        interval_years = round(total_months / 12, 1)

    return round(max(explicit_years + [interval_years, 0.0]), 1)


def build_summary(candidate, extraction):
    if normalize_line(candidate.get("summary", "")):
        return normalize_line(candidate["summary"])

    current_role = candidate.get("currentRole", "")
    years = parse_float(candidate.get("experienceYears", 0))
    skills = extraction.get("skills", [])

    summary_bits = []
    if current_role:
        summary_bits.append(current_role)
    if years > 0:
        summary_bits.append(f"with {years:g} years of experience")
    if skills:
        summary_bits.append(f"across {', '.join(skills[:5])}")

    return normalize_line(" ".join(summary_bits)) if summary_bits else ""


def build_highlights(candidate, extraction):
    highlights = list(extraction.get("highlights", []))
    if highlights:
        return unique_strings(highlights)

    generated = []
    years = parse_float(candidate.get("experienceYears", 0))
    current_role = candidate.get("currentRole", "")
    skills = extraction.get("skills", [])
    projects = extraction.get("projects", [])

    if current_role:
        generated.append(f"Recent role appears to be {current_role}.")
    if years > 0:
        generated.append(f"Estimated professional experience is about {years:g} years.")
    if skills:
        generated.append(f"Core skills include {', '.join(skills[:6])}.")
    if projects:
        generated.append(f"Projects mentioned: {projects[0]}")

    return unique_strings(generated[:4])


def build_metadata_warnings(candidate, extraction, clean_cv_text, llm_used=False, llm_error=""):
    warnings = []

    if llm_error and not llm_used:
        warnings.append("LLM extraction was unavailable; heuristic fallback was used.")
    if len(normalize_line(clean_cv_text)) < 500:
        warnings.append("Low text volume was extracted from the PDF; review the profile manually.")
    if not extraction.get("skills"):
        warnings.append("No explicit skills were detected.")
    if not extraction.get("experience"):
        warnings.append("No clear experience section was detected.")
    if not candidate.get("email") and not candidate.get("phone"):
        warnings.append("Primary contact details could not be extracted.")

    return unique_strings(warnings)


def heuristic_profile(clean_cv_text):
    lines = normalize_lines(clean_cv_text)
    email = extract_primary_email(clean_cv_text)
    phone = extract_primary_phone(clean_cv_text)
    linkedin, github, portfolio = extract_links(clean_cv_text)
    skills = detect_skills(clean_cv_text)
    current_role = extract_role_from_lines(lines)
    raw_role = current_role
    experience_years = estimate_experience_years(clean_cv_text)
    experience_level = normalize_level("", experience_years)

    candidate = {
        "fullName": extract_name(lines),
        "email": email,
        "phone": phone,
        "location": extract_location(lines),
        "linkedin": linkedin,
        "github": github,
        "portfolio": portfolio,
        "currentRole": current_role,
        "suggestedRole": infer_role_from_skills(skills, current_role),
        "experienceYears": experience_years,
        "experienceLevel": experience_level,
        "summary": "",
    }

    extraction = {
        "skills": skills,
        "highlights": [],
        "experience": detect_section(lines, "experience"),
        "education": detect_section(lines, "education"),
        "projects": detect_section(lines, "projects"),
        "certifications": detect_section(lines, "certifications"),
    }

    candidate["summary"] = build_summary(candidate, extraction)
    extraction["highlights"] = build_highlights(candidate, extraction)

    return {
        "candidate": candidate,
        "extraction": extraction,
        "metadata": {
            "rawRoleText": raw_role,
            "parserVersion": PARSER_VERSION,
            "warnings": build_metadata_warnings(candidate, extraction, clean_cv_text),
        },
    }


def request_llm_profile(clean_cv_text):
    client = get_groq_client()
    response = client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": CV_EXTRACTION_PROMPT,
            },
            {
                "role": "user",
                "content": f"CV Text:\n{clean_cv_text}",
            },
        ],
        model=LLM_MODEL,
        temperature=0.0,
    )

    content = response.choices[0].message.content
    if not content:
        raise ValueError("LLM returned empty response")

    return json.loads(extract_json_object(content))


def test_llm_connection():
    client = get_groq_client()
    response = client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": "You are a health check endpoint. Reply with OK only.",
            },
            {
                "role": "user",
                "content": "Respond with OK",
            },
        ],
        model=LLM_MODEL,
        temperature=0.0,
        max_tokens=10,
    )

    content = normalize_line(response.choices[0].message.content if response.choices else "")
    if not content:
        raise ValueError("LLM health check returned empty response")

    return {
        "provider": "groq",
        "model": LLM_MODEL,
        "reply": content,
    }


def merge_scalar(primary, fallback):
    if isinstance(primary, str):
        normalized = normalize_line(primary)
        return normalized if normalized else normalize_line(fallback)
    if primary not in (None, "", [], {}):
        return primary
    return fallback


def merge_list(primary, fallback):
    combined = []

    for source in [primary or [], fallback or []]:
        if isinstance(source, list):
            combined.extend(source)

    return unique_strings(combined)


def merge_profiles(llm_profile, heuristic_result, clean_cv_text, llm_error=""):
    llm_candidate = llm_profile.get("candidate", {}) if isinstance(llm_profile, dict) else {}
    llm_extraction = llm_profile.get("extraction", {}) if isinstance(llm_profile, dict) else {}
    llm_metadata = llm_profile.get("metadata", {}) if isinstance(llm_profile, dict) else {}

    fallback_candidate = heuristic_result["candidate"]
    fallback_extraction = heuristic_result["extraction"]
    fallback_metadata = heuristic_result["metadata"]

    merged_skills = normalize_skills(
        merge_list(llm_extraction.get("skills"), fallback_extraction.get("skills"))
    )

    current_role = first_non_empty(
        llm_candidate.get("currentRole"),
        llm_metadata.get("rawRoleText"),
        fallback_candidate.get("currentRole"),
        fallback_metadata.get("rawRoleText"),
    )

    experience_years = max(
        parse_float(llm_candidate.get("experienceYears"), 0.0),
        parse_float(fallback_candidate.get("experienceYears"), 0.0),
    )

    suggested_role = first_non_empty(
        llm_candidate.get("suggestedRole"),
        current_role,
        llm_metadata.get("rawRoleText"),
        map_role(llm_metadata.get("rawRoleText", "")),
        infer_role_from_skills(merged_skills, current_role),
    )
    suggested_role = normalize_line(suggested_role) or "Unknown"

    experience_level = normalize_level(
        llm_candidate.get("experienceLevel", ""),
        experience_years,
    )
    if experience_level not in VALID_LEVELS:
        experience_level = normalize_level("", experience_years)

    candidate = {
        "fullName": first_non_empty(
            llm_candidate.get("fullName"),
            fallback_candidate.get("fullName"),
        ),
        "email": first_non_empty(
            llm_candidate.get("email"),
            fallback_candidate.get("email"),
        ),
        "phone": first_non_empty(
            llm_candidate.get("phone"),
            fallback_candidate.get("phone"),
        ),
        "location": first_non_empty(
            llm_candidate.get("location"),
            fallback_candidate.get("location"),
        ),
        "linkedin": first_non_empty(
            llm_candidate.get("linkedin"),
            fallback_candidate.get("linkedin"),
        ),
        "github": first_non_empty(
            llm_candidate.get("github"),
            fallback_candidate.get("github"),
        ),
        "portfolio": first_non_empty(
            llm_candidate.get("portfolio"),
            fallback_candidate.get("portfolio"),
        ),
        "currentRole": current_role,
        "suggestedRole": suggested_role,
        "experienceYears": round(experience_years, 1),
        "experienceLevel": experience_level,
        "summary": first_non_empty(
            llm_candidate.get("summary"),
            fallback_candidate.get("summary"),
        ),
    }

    extraction = {
        "skills": merged_skills,
        "highlights": merge_list(
            llm_extraction.get("highlights"),
            fallback_extraction.get("highlights"),
        ),
        "experience": merge_list(
            llm_extraction.get("experience"),
            fallback_extraction.get("experience"),
        ),
        "education": merge_list(
            llm_extraction.get("education"),
            fallback_extraction.get("education"),
        ),
        "projects": merge_list(
            llm_extraction.get("projects"),
            fallback_extraction.get("projects"),
        ),
        "certifications": merge_list(
            llm_extraction.get("certifications"),
            fallback_extraction.get("certifications"),
        ),
    }

    candidate["summary"] = build_summary(candidate, extraction)
    extraction["highlights"] = build_highlights(candidate, extraction)

    metadata = {
        "rawRoleText": first_non_empty(
            llm_metadata.get("rawRoleText"),
            fallback_metadata.get("rawRoleText"),
            current_role,
        ),
        "parser": "llm+heuristic" if llm_profile else "heuristic",
        "llmStatus": "used" if llm_profile else "fallback",
        "llmError": normalize_line(llm_error),
        "cleanTextPreview": clean_cv_text[:800],
        "parserVersion": first_non_empty(
            llm_metadata.get("parserVersion"),
            fallback_metadata.get("parserVersion"),
            PARSER_VERSION,
        ),
    }
    metadata["warnings"] = build_metadata_warnings(
        candidate,
        extraction,
        clean_cv_text,
        llm_used=bool(llm_profile),
        llm_error=llm_error,
    )

    return {
        "candidate": candidate,
        "extraction": extraction,
        "metadata": metadata,
    }


def validate_profile(profile):
    if not isinstance(profile, dict):
        raise ValueError("Profile must be a dictionary")

    for key in ["candidate", "extraction", "metadata"]:
        if key not in profile or not isinstance(profile[key], dict):
            raise ValueError(f"Missing or invalid key: {key}")

    if not isinstance(profile["candidate"].get("experienceYears"), (int, float)):
        raise ValueError("candidate.experienceYears must be numeric")

    if not isinstance(profile["extraction"].get("skills"), list):
        raise ValueError("extraction.skills must be a list")


def postprocess_projects(lines):
    """Group and clean raw project lines into coherent project items."""
    if not lines:
        return []

    items = []
    current = None

    for raw in lines:
        s = normalize_line(raw)
        if not s:
            continue

        low = s.lower()

        # If the line contains an explicit section marker (e.g. 'Education -'), split and keep left part
        if "education -" in low or "education:" in low:
            left = re.split(r"education\s*[-:]", low, flags=re.IGNORECASE)[0].strip()
            left = normalize_line(left)
            if left:
                if current:
                    items.append(current.strip())
                current = left
            # stop collecting further project content when education starts
            break

        # Tech stack lines should attach to current project if exists
        if low.startswith("tech stack") or low.startswith("techstack") or low.startswith("tech:"):
            if current:
                current += " " + s
            else:
                # treat as standalone small item
                items.append(s)
            continue

        # Bullet or dash indicates continuation
        if s.startswith("-") or s.startswith("•"):
            if current:
                current += " " + s.lstrip("-• \t")
            else:
                current = s.lstrip("-• \t")
            continue

        # Heuristic: lines that look like a title/start of project
        if ("project" in low) or (len(s) < 120 and (s.endswith("Project") or s.endswith("project") or re.search(r"\b(Platform|System|Application|Pipeline|E-commerce|Ecommerce)\b", s, re.IGNORECASE))):
            if current:
                items.append(current.strip())
            current = s
            continue

        # If current exists and next line looks like description, append
        if current:
            current += " " + s
        else:
            # Start new item
            current = s

    if current:
        items.append(current.strip())

    # Final cleanup: remove obvious non-project fragments
    cleaned = []
    for it in items:
        # remove repeated section words accidentally included
        it2 = re.sub(r"\b(Education|Experience|Certificates|Certificates & Achievements)\b", "", it, flags=re.IGNORECASE).strip()
        if it2:
            cleaned.append(normalize_line(it2))

    return unique_strings(cleaned)


def postprocess_certifications(lines):
    """Clean certification lines: remove tech-stack fragments and fix merged words."""
    out = []
    for raw in lines:
        s = normalize_line(raw)
        if not s:
            continue
        # drop tech stack fragments accidentally captured
        if re.search(r"tech stack|techstack|react|node\.js|next\.js|typescript", s, re.IGNORECASE):
            # try to split on known award keywords
            parts = re.split(r"(Award|Awarded|InnovEgypt|DeepMinds|Certificate|Certificate:)", s)
            if parts:
                candidate = " ".join(parts).strip()
                candidate = re.sub(r"\b(Award|Awarded|Certificate)\b", r"\1", candidate)
                s = candidate
            else:
                continue

        # fix merged words like 'MongoDBDeepMinds' and 'JWTAwarded'
        s = re.sub(r"([A-Za-z0-9])([A-Z][a-z])", r"\1 \2", s)
        out.append(s)

    return unique_strings(out)


def postprocess_experience(lines):
    """Group experience snippets into coherent entries."""
    if not lines:
        return []
    items = []
    current = None
    for raw in lines:
        s = normalize_line(raw)
        if not s:
            continue
        # If line looks like a date range starting, start new entry
        if re.search(r"\b\d{4}\b|present|\d{4}\s*-\s*present", s.lower()):
            if current:
                items.append(current.strip())
            current = s
            continue

        # If very short and uppercase, may be company name -> attach
        if len(s.split()) <= 4 and s.isupper() and current:
            current += " " + s
            continue

        if current:
            current += " " + s
        else:
            current = s

    if current:
        items.append(current.strip())

    return unique_strings(items)


def extract_section_window(text, start_markers, end_markers):
    lines = normalize_lines(text)
    collected = []
    collecting = False

    start_markers = tuple(normalize_line(marker).lower().rstrip(":") for marker in start_markers)
    end_markers = tuple(normalize_line(marker).lower().rstrip(":") for marker in end_markers)

    for raw_line in lines:
        line = normalize_line(raw_line)
        lowered = line.lower().rstrip(":")

        if not collecting:
            if any(lowered.startswith(marker) for marker in start_markers):
                collecting = True
            else:
                continue

        if any(lowered.startswith(marker) for marker in end_markers):
            break

        collected.append(line)

    return "\n".join(collected)


def looks_like_project_title(line):
    normalized = normalize_line(line)
    lowered = normalized.lower()

    if not normalized:
        return False
        if current:
            current = f"{current} {line}"


    if any(token in lowered for token in [
        "tech stack",
        "experience",
        "education",
        "certif",
        "course",
        "award",
        "skills",
    ]):
        return False

    project_keywords = [
        "platform",
        "system",
        "dashboard",
        "tracker",
        "hub",
        "discovery",
        "visualization",
        "scraping",
        "e-commerce",
        "ecommerce",
        "speech therapy",
        "project",
        "application",
    ]
    if any(keyword in lowered for keyword in project_keywords):
        return True

    words = normalized.split()
    if 2 <= len(words) <= 10:
        title_ratio = sum(1 for word in words if word[:1].isupper()) / max(len(words), 1)
        if title_ratio >= 0.5:
            return True

    return False


def strip_heading_prefix(line, prefix_patterns):
    value = normalize_line(line)
    for pattern in prefix_patterns:
        value = re.sub(pattern, "", value, flags=re.IGNORECASE).strip(" -•:")
    return value


def refine_projects_from_text(clean_cv_text):
    window = extract_section_window(
        clean_cv_text,
        ["projects", "profile projects"],
        ["professional experience", "experience", "skills & languages", "certificates & achievements", "courses"],
    )
    if not window:
        return []

    lines = normalize_lines(window)
    items = []
    current = None

    for raw in lines:
        stop_after_current = False
        line = strip_heading_prefix(
            raw,
            [r"^profile\s+projects\b", r"^projects?\b", r"^portfolio\b"],
        )
        if not line:
            continue

        lowered = line.lower()

        heading_match = re.search(
            r"\b(education|professional experience|experience|skills & languages|courses|certificates & achievements)\b",
            line,
            re.IGNORECASE,
        )
        if heading_match:
            before = normalize_line(line[: heading_match.start()])
            if before and looks_like_project_title(before):
                line = before
                stop_after_current = True
            else:
                break

        if lowered.startswith("tech stack"):
            continue

        if line.startswith("-") or line.startswith("•"):
            continue

        if looks_like_project_title(line):
            if current:
                items.append(current.strip())
            current = line
            continue

        if stop_after_current:
            break

    if current:
        items.append(current.strip())

    cleaned = []
    for item in items:
        item = re.sub(r",?\s*graduation project\b.*$", "", item, flags=re.IGNORECASE).strip()
        item = re.sub(r"\b(Final-year|Final year|Computer Science student and Software Engineer)\b", "", item, flags=re.IGNORECASE)
        item = re.sub(r"\s+", " ", item).strip(" -•")
        item = re.split(r"\b(?:education|professional experience|skills & languages|courses|certificates & achievements)\b", item, flags=re.IGNORECASE)[0].strip()
        words = item.split()
        title_ratio = sum(1 for word in words if word[:1].isupper() or word[:1].isdigit()) / max(len(words), 1)
        if item and len(words) <= 12 and not item[:1].islower() and not re.search(r"\b(bachelor|university|degree|gpa|faculty|education|experience|tech|stack|react|node|mongodb|tailwind|paymob|jwt|zustand)\b", item, re.IGNORECASE) and (title_ratio >= 0.45 or re.search(r"\b(project|platform|system|dashboard|tracker|hub|discovery|e-commerce|ecommerce)\b", item, re.IGNORECASE)):
            cleaned.append(item)

    return unique_strings(cleaned)


def refine_experience_from_text(clean_cv_text):
    window = extract_section_window(
        clean_cv_text,
        ["professional experience", "experience"],
        ["projects", "education", "skills & languages", "certificates & achievements", "courses"],
    )
    if not window:
        return []

    lines = normalize_lines(window)
    items = []
    current = None

    for raw in lines:
        stop_after_current = False
        line = strip_heading_prefix(
            raw,
            [r"^professional\s+experience\b", r"^experience\b"],
        )
        if not line:
            continue

        lowered = line.lower()

        heading_match = re.search(
            r"\b(skills & languages|education|projects|courses|certificates & achievements)\b",
            line,
            re.IGNORECASE,
        )
        if heading_match:
            before = normalize_line(line[: heading_match.start()])
            if before:
                line = before
                stop_after_current = True
            else:
                break

        has_role_anchor = any(token in lowered for token in ["freelancer", "upwork", "intern", "developer", "engineer", "manager", "analyst"])
        has_date_anchor = bool(re.search(r"\b\d{4}\b", lowered) and any(token in lowered for token in ["present", "current", "ongoing"]))

        if has_role_anchor and not has_date_anchor:
            if current and re.search(r"\b\d{4}\b|present|current|ongoing", current.lower()):
                items.append(current.strip())
            current = line
            continue

        if has_date_anchor:
            if current and not re.search(r"\b\d{4}\b|present|current|ongoing", current.lower()):
                # Merge role/company line with the following date range line.
                current = f"{current} {line}"
            else:
                if current:
                    items.append(current.strip())
                current = line
            continue

        if current is None and re.search(r"\b\d{4}\b|present|current|ongoing", lowered):
            # Ignore date-only fragments until we see a real role/company anchor.
            continue

        if current:
            current = f"{current} {line}"

        if stop_after_current:
            break

    if current:
        items.append(current.strip())

    cleaned = []
    for item in items:
        item = re.split(r"\b(?:skills & languages|education|projects|courses|certificates & achievements)\b", item, flags=re.IGNORECASE)[0].strip()
        if item and (
            re.search(r"\b\d{4}\b|present|current|ongoing", item.lower())
            or re.search(r"\b(freelancer|upwork|developer|engineer|intern|manager|analyst)\b", item.lower())
        ):
            cleaned.append(item)

    return unique_strings(cleaned)


def refine_certifications_from_text(clean_cv_text):
    window = extract_section_window(
        clean_cv_text,
        ["certificates & achievements", "courses", "certifications"],
        ["projects", "education", "skills & languages", "professional experience", "experience"],
    )
    if not window:
        return []

    lines = normalize_lines(window)
    items = []

    for raw in lines:
        stop_after_current = False
        line = strip_heading_prefix(
            raw,
            [r"^certificates\s*&\s*achievements\b", r"^courses\b", r"^certifications\b"],
        )
        if not line:
            continue

        lowered = line.lower()
        heading_match = re.search(
            r"\b(skills & languages|education|projects|professional experience|experience)\b",
            line,
            re.IGNORECASE,
        )
        if heading_match:
            before = normalize_line(line[: heading_match.start()])
            if before:
                line = before
                stop_after_current = True
            else:
                break

        line = re.split(r"\btech stack\b", line, flags=re.IGNORECASE)[0].strip(" -•")

        line = re.split(r"\b(?:skills & languages|education|projects|professional experience|experience)\b", line, flags=re.IGNORECASE)[0].strip()

        if not line:
            continue

        if not any(token in lowered for token in ["udemy", "maharatech", "mcit", "itida", "msa university", "award", "certif", "course", "certificate", "program"]):
            if lowered.startswith("courses"):
                continue

        # Keep the left-most meaningful piece before trailing project/tech-stack noise.
        cut_points = [
            r"\s+-\s+tech stack:",
            r"\s+tech stack:",
            r"\s+-\s+a\s+",
            r"\s+platform\b",
            r"\s+featuring\b",
            r"\s+key focus:\b",
        ]
        for pattern in cut_points:
            split_match = re.search(pattern, line, flags=re.IGNORECASE)
            if split_match:
                line = normalize_line(line[: split_match.start()])
                break

        if line and any(token in line.lower() for token in ["udemy", "maharatech", "mcit", "itida", "msa university", "award", "certif", "course", "certificate", "program"]):
            items.append(line)

        if stop_after_current:
            break

    cleaned = []
    for item in items:
        item = re.sub(r"\s+", " ", item).strip(" -•")
        if item:
            cleaned.append(item)

    return unique_strings(cleaned)


def refine_extraction_sections(profile_data, clean_cv_text):
    extraction = profile_data.get("extraction", {})
    if not isinstance(extraction, dict):
        return profile_data

    refined_projects = refine_projects_from_text(clean_cv_text)
    refined_experience = refine_experience_from_text(clean_cv_text)
    refined_certifications = refine_certifications_from_text(clean_cv_text)

    if refined_projects:
        extraction["projects"] = refined_projects
    if refined_experience:
        extraction["experience"] = refined_experience
    if refined_certifications:
        extraction["certifications"] = refined_certifications

    profile_data["extraction"] = extraction
    return profile_data


def has_meaningful_profile_data(profile):
    candidate = profile.get("candidate", {})
    extraction = profile.get("extraction", {})

    candidate_values = [
        candidate.get("fullName"),
        candidate.get("email"),
        candidate.get("phone"),
        candidate.get("location"),
        candidate.get("linkedin"),
        candidate.get("github"),
        candidate.get("portfolio"),
        candidate.get("currentRole"),
        candidate.get("summary"),
    ]

    if any(normalize_line(value) for value in candidate_values):
        return True

    extraction_lists = [
        extraction.get("skills", []),
        extraction.get("highlights", []),
        extraction.get("experience", []),
        extraction.get("education", []),
        extraction.get("projects", []),
        extraction.get("certifications", []),
    ]

    return any(isinstance(items, list) and len(items) > 0 for items in extraction_lists)


def extract_and_infer_profile(clean_cv_text: str) -> dict:
    heuristic_result = heuristic_profile(clean_cv_text)
    llm_profile = {}
    llm_error = ""

    try:
        llm_profile = request_llm_profile(clean_cv_text)
    except Exception as error:
        llm_error = str(error)

    try:
        profile_data = merge_profiles(
            llm_profile,
            heuristic_result,
            clean_cv_text,
            llm_error=llm_error,
        )
        # Rebuild noisy sections from the raw CV text, then clean them up.
        try:
            profile_data = refine_extraction_sections(profile_data, clean_cv_text)
            extraction = profile_data.get("extraction", {})
            if extraction:
                extraction["projects"] = postprocess_projects(extraction.get("projects", []))
                extraction["certifications"] = postprocess_certifications(extraction.get("certifications", []))
                extraction["experience"] = postprocess_experience(extraction.get("experience", []))
                extraction["highlights"] = []
                extraction["highlights"] = build_highlights(profile_data.get("candidate", {}), extraction)
                profile_data["extraction"] = extraction
        except Exception:
            # Don't fail extraction due to postprocessing errors
            pass
        validate_profile(profile_data)

        if not has_meaningful_profile_data(profile_data):
            return {
                "status": "error",
                "message": (
                    "No candidate data could be extracted from the CV text. "
                    "The PDF may not contain readable selectable text."
                ),
                "data": None,
            }

        return {
            "status": "success",
            "message": "Candidate profile extracted successfully",
            "data": profile_data,
        }
    except Exception as error:
        return {
            "status": "error",
            "message": str(error),
            "data": None,
        }
