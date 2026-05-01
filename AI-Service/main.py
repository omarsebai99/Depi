import fitz
import re
from datetime import datetime, timezone
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

from CV_Parser.Extraction import extract_and_infer_profile, test_llm_connection

app = FastAPI(
    title="AI Service",
    description="CV Parsing + Candidate Profile Extraction",
    version="1.1.0",
)


SECTION_HINTS = (
    "profile",
    "projects",
    "education",
    "professional experience",
    "experience",
    "skills & languages",
    "certificates & achievements",
    "courses",
)

SECTION_BOUNDARIES = (
    "professional experience",
    "certificates & achievements",
    "skills & languages",
    "education",
    "projects",
    "profile",
    "courses",
)


def split_section_boundaries(text):
    normalized = str(text or "")

    for heading in sorted(SECTION_BOUNDARIES, key=len, reverse=True):
        pattern = rf"(?i)(?<!\n)(?<!^)(?<!\b)(?<![\r\n])(?<!\s)({re.escape(heading)})(?!\s*$)"
        normalized = re.sub(pattern, r"\n\1\n", normalized)
        normalized = re.sub(
            rf"(?i)(?<!\n)({re.escape(heading)})(?=\s+[A-Za-z])",
            r"\1\n",
            normalized,
        )
        normalized = re.sub(
            rf"(?i)(?<=\w)({re.escape(heading)})(?=\w)",
            r"\n\1\n",
            normalized,
        )

    return normalized


def score_text_layout(text):
    normalized = str(text or "").strip()
    if not normalized:
        return -1

    lines = [line for line in normalized.splitlines() if line.strip()]
    heading_hits = sum(1 for hint in SECTION_HINTS if hint in normalized.lower())
    long_lines = sum(1 for line in lines if len(line) > 220)
    short_lines = sum(1 for line in lines if len(line) < 18)

    return (heading_hits * 20) + len(lines) - long_lines - (short_lines // 3)


def order_blocks_by_columns(page, blocks):
    page_mid = page.rect.width / 2
    left_column = []
    right_column = []
    full_order = []

    for block in blocks:
        if len(block) < 5:
            continue

        text = str(block[4]).strip()
        if not text:
            continue

        x0, y0, x1, y1 = block[:4]
        entry = (y0, x0, text)
        full_order.append(entry)

        if x1 <= page_mid:
            left_column.append(entry)
        elif x0 >= page_mid:
            right_column.append(entry)
        elif x0 < page_mid:
            left_column.append(entry)
        else:
            right_column.append(entry)

    left_text = "\n".join(text for _, _, text in sorted(left_column))
    right_text = "\n".join(text for _, _, text in sorted(right_column))
    full_text = "\n".join(text for _, _, text in sorted(full_order))

    return [candidate for candidate in (left_text + ("\n" + right_text if right_text else ""), full_text) if candidate.strip()]


def extract_page_text(page):
    candidates = []

    plain_text = page.get_text("text", sort=True) or ""
    if plain_text.strip():
        candidates.append(plain_text)

    blocks = page.get_text("blocks", sort=False) or []
    candidates.extend(order_blocks_by_columns(page, blocks))

    words = page.get_text("words", sort=True) or []
    if words:
        word_lines = {}
        for word in words:
            if len(word) < 5:
                continue
            text = str(word[4]).strip()
            if not text:
                continue
            y_key = round(float(word[1]), 1)
            x_key = float(word[0])
            word_lines.setdefault(y_key, []).append((x_key, text))

        reconstructed = []
        for _, entries in sorted(word_lines.items()):
            reconstructed.append(" ".join(text for _, text in sorted(entries)))

        word_text = "\n".join(reconstructed)
        if word_text.strip():
            candidates.append(word_text)

    best_text = max(candidates, key=score_text_layout, default="")

    if not best_text.strip():
        try:
            ocr_text_page = page.get_textpage_ocr(language="eng")
            best_text = page.get_text(textpage=ocr_text_page) or ""
        except Exception:
            best_text = plain_text

    return best_text


class CVRequest(BaseModel):
    clean_cv_text: str


def extract_text_from_pdf(file_bytes):
    pages = []
    pdf = fitz.open(stream=file_bytes, filetype="pdf")

    for page in pdf:
        page_text = extract_page_text(page)

        if len(page_text.strip()) < 40:
            try:
                ocr_text_page = page.get_textpage_ocr(language="eng")
                ocr_text = page.get_text(textpage=ocr_text_page) or ""
                if len(ocr_text.strip()) > len(page_text.strip()):
                    page_text = ocr_text
            except Exception:
                pass

        if page_text.strip():
            pages.append(page_text)

    return "\n".join(pages)


def clean_text(text):
    normalized = (
        str(text or "")
        .replace("\u00a0", " ")
        .replace("\u2022", "- ")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
    )
    normalized = split_section_boundaries(normalized)
    cleaned_lines = []

    for raw_line in normalized.splitlines():
        line = " ".join(raw_line.split()).strip()
        if line:
            cleaned_lines.append(line)

    return "\n".join(cleaned_lines)


def analyze_cv_bytes(file_bytes):
    raw_text = extract_text_from_pdf(file_bytes)
    clean_cv_text = clean_text(raw_text)

    if len(clean_cv_text.strip()) < 30:
        raise HTTPException(
            status_code=422,
            detail=(
                "No readable text could be extracted from this PDF. "
                "The file may be scanned or image-based and requires OCR."
            ),
        )

    result = extract_and_infer_profile(clean_cv_text)
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])

    result["data"]["metadata"]["rawTextLength"] = len(raw_text)
    result["data"]["metadata"]["cleanTextLength"] = len(clean_cv_text)
    return clean_cv_text, result


@app.get("/")
async def root():
    return {"message": "AI Service API is running successfully"}


@app.get("/health/llm")
async def health_llm():
    checked_at = datetime.now(timezone.utc).isoformat()

    try:
        result = test_llm_connection()
        return {
            "status": "success",
            "service": "llm",
            "checkedAt": checked_at,
            **result,
        }
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "error",
                "service": "llm",
                "checkedAt": checked_at,
                "message": str(error),
            },
        )


@app.post("/parse-cv")
async def parse_cv(file: UploadFile = File(...)):
    try:
        content = await file.read()
        raw_text = extract_text_from_pdf(content)
        clean_cv_text = clean_text(raw_text)

        return {
            "status": "success",
            "clean_cv_text": clean_cv_text,
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/extract-profile")
async def extract_profile(request: CVRequest):
    if not request.clean_cv_text.strip():
        raise HTTPException(
            status_code=400,
            detail="clean_cv_text cannot be empty",
        )

    result = extract_and_infer_profile(request.clean_cv_text)
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])

    return result


@app.post("/analyze-cv")
async def analyze_cv(file: UploadFile = File(...)):
    try:
        content = await file.read()
        clean_cv_text, result = analyze_cv_bytes(content)

        return {
            "status": "success",
            "message": "CV parsed and analyzed successfully",
            "clean_cv_text": clean_cv_text,
            "data": result["data"],
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
