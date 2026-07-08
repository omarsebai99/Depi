import json
import os
import fitz
import re
from datetime import datetime, timezone
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

from CV_Parser.Extraction import extract_and_infer_profile, test_llm_connection
from groq import Groq
from prompts import INTERVIEW_EVALUATION_PROMPT, INTERVIEW_QUESTION_PROMPT

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


class InterviewSessionRequest(BaseModel):
    profile: dict
    question_count: int = 5


class InterviewAnswerRequest(BaseModel):
    profile: dict
    question: str
    answer: str
    history: list[dict] = []


def get_groq_client():
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set")
    return Groq(api_key=api_key)


def normalize_text(value):
    return " ".join(str(value or "").split()).strip()


def normalize_list(values):
    return [normalize_text(value) for value in values or [] if normalize_text(value)]


def sanitize_profile_for_interview(profile):
    candidate = profile.get("candidate", {}) if isinstance(profile, dict) else {}
    extraction = profile.get("extraction", {}) if isinstance(profile, dict) else {}

    return {
        "candidate": {
            "fullName": normalize_text(candidate.get("fullName")),
            "currentRole": normalize_text(candidate.get("currentRole")),
            "suggestedRole": normalize_text(candidate.get("suggestedRole")),
            "experienceYears": candidate.get("experienceYears", 0),
            "experienceLevel": normalize_text(candidate.get("experienceLevel")),
            "summary": normalize_text(candidate.get("summary")),
        },
        "extraction": {
            "skills": normalize_list(extraction.get("skills")),
            "highlights": normalize_list(extraction.get("highlights")),
            "experience": normalize_list(extraction.get("experience")),
            "projects": normalize_list(extraction.get("projects")),
            "certifications": normalize_list(extraction.get("certifications")),
        },
    }


def fallback_interview_plan(profile, question_count=5):
    candidate = profile["candidate"]
    extraction = profile["extraction"]
    target_role = (
        candidate.get("suggestedRole")
        or candidate.get("currentRole")
        or "the target role"
    )
    focus_areas = normalize_list(
        [
            target_role,
            *extraction.get("skills", [])[:2],
            *extraction.get("projects", [])[:1],
            "communication",
        ]
    )[:4]

    questions = [
        {
            "id": "q1",
            "category": "Personal",
            "prompt": f"Tell me a bit about yourself and why you want {target_role}.",
            "why": "Opens the interview with role motivation and self-presentation.",
        },
        {
            "id": "q2",
            "category": "Personal",
            "prompt": "What project from your CV are you most proud of?",
            "why": "Checks ownership, impact, and storytelling.",
        },
        {
            "id": "q3",
            "category": "Technical",
            "prompt": (
                f"What skill will help you most as a {target_role}, and where did you use it?"
            ),
            "why": "Connects declared skills to real experience.",
        },
        {
            "id": "q4",
            "category": "Technical",
            "prompt": "Tell me about a technical problem you solved in a project.",
            "why": "Assesses reasoning, resilience, and execution.",
        },
        {
            "id": "q5",
            "category": "Personal",
            "prompt": "What skill would you like to improve next?",
            "why": "Measures self-awareness and growth mindset.",
        },
    ]

    return {
        "interviewerIntro": (
            f"Hi {candidate.get('fullName') or 'there'}, I will simulate a live interview for "
            f"{target_role}. Answer naturally, and I will give coaching feedback after each response."
        ),
        "focusAreas": focus_areas,
        "questions": questions[: max(1, min(question_count, len(questions)))],
    }


def parse_json_response(text):
    cleaned = str(text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    if cleaned.startswith("{") and cleaned.endswith("}"):
        return json.loads(cleaned)

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(cleaned[start : end + 1])

    return json.loads(cleaned)


def request_interview_plan(profile, question_count=5):
    client = get_groq_client()
    model = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
    prompt_payload = json.dumps(
        {
            "questionCount": question_count,
            "profile": profile,
        },
        ensure_ascii=False,
    )

    completion = client.chat.completions.create(
        model=model,
        temperature=0.4,
        messages=[
            {"role": "system", "content": INTERVIEW_QUESTION_PROMPT},
            {"role": "user", "content": prompt_payload},
        ],
    )
    parsed = parse_json_response(completion.choices[0].message.content)
    questions = parsed.get("questions") if isinstance(parsed, dict) else None
    if not isinstance(questions, list) or not questions:
        raise ValueError("Interview plan did not return any questions")
    return {
        "interviewerIntro": normalize_text(parsed.get("interviewerIntro")),
        "focusAreas": normalize_list(parsed.get("focusAreas"))[:6],
        "questions": [
            {
                "id": normalize_text(item.get("id")) or f"q{index + 1}",
                "category": normalize_text(item.get("category")) or "general",
                "prompt": normalize_text(item.get("prompt")),
                "why": normalize_text(item.get("why")),
            }
            for index, item in enumerate(questions)
            if normalize_text(item.get("prompt"))
        ][: max(1, question_count)],
    }


def evaluate_answer_fallback(question, answer):
    answer_text = normalize_text(answer)
    word_count = len(answer_text.split())
    score = 5

    if word_count >= 25:
        score += 2
    if word_count >= 45:
        score += 1
    if any(token in answer_text.lower() for token in ["because", "result", "impact", "learned", "improved"]):
        score += 1
    score = max(3, min(score, 9))

    strengths = []
    improvements = []

    if word_count >= 25:
        strengths.append("You gave enough detail to understand your thinking.")
    else:
        improvements.append("Add more detail so the interviewer can judge your contribution.")

    if any(token in answer_text.lower() for token in ["result", "impact", "improved", "increased", "reduced"]):
        strengths.append("You hinted at outcomes, which makes the answer stronger.")
    else:
        improvements.append("Mention the result or impact of your work.")

    if not improvements:
        improvements.append("Make the structure even clearer using situation, action, and result.")

    return {
        "score": score,
        "strengths": strengths or ["Your answer addressed the question directly."],
        "improvements": improvements[:2],
        "followUpQuestion": f"Can you give one specific example related to: {normalize_text(question)}",
        "coachReply": "Solid start. Tighten the structure and make your impact more explicit.",
    }


def request_answer_evaluation(profile, question, answer, history):
    client = get_groq_client()
    model = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
    prompt_payload = json.dumps(
        {
            "profile": profile,
            "question": normalize_text(question),
            "answer": normalize_text(answer),
            "history": history[-3:],
        },
        ensure_ascii=False,
    )

    completion = client.chat.completions.create(
        model=model,
        temperature=0.3,
        messages=[
            {"role": "system", "content": INTERVIEW_EVALUATION_PROMPT},
            {"role": "user", "content": prompt_payload},
        ],
    )
    parsed = parse_json_response(completion.choices[0].message.content)

    return {
        "score": max(1, min(int(parsed.get("score", 0) or 0), 10)),
        "strengths": normalize_list(parsed.get("strengths"))[:3],
        "improvements": normalize_list(parsed.get("improvements"))[:3],
        "followUpQuestion": normalize_text(parsed.get("followUpQuestion")),
        "coachReply": normalize_text(parsed.get("coachReply")),
    }


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


@app.post("/interview/session/start")
async def start_interview_session(request: InterviewSessionRequest):
    profile = sanitize_profile_for_interview(request.profile)
    question_count = max(1, min(int(request.question_count or 5), 7))

    try:
        try:
            plan = request_interview_plan(profile, question_count=question_count)
            source = "llm"
        except Exception:
            plan = fallback_interview_plan(profile, question_count=question_count)
            source = "fallback"

        return {
            "status": "success",
            "message": "Interview session created successfully",
            "data": {
                **plan,
                "questionCount": len(plan["questions"]),
                "source": source,
            },
        }
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/interview/session/answer")
async def evaluate_interview_answer(request: InterviewAnswerRequest):
    question = normalize_text(request.question)
    answer = normalize_text(request.answer)

    if not question:
        raise HTTPException(status_code=400, detail="question cannot be empty")
    if not answer:
        raise HTTPException(status_code=400, detail="answer cannot be empty")

    profile = sanitize_profile_for_interview(request.profile)
    history = request.history if isinstance(request.history, list) else []

    try:
        try:
            evaluation = request_answer_evaluation(profile, question, answer, history)
            source = "llm"
        except Exception:
            evaluation = evaluate_answer_fallback(question, answer)
            source = "fallback"

        return {
            "status": "success",
            "message": "Interview answer evaluated successfully",
            "data": {
                **evaluation,
                "source": source,
            },
        }
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
