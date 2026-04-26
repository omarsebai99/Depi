import fitz  # PyMuPDF
import re
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    raw_text = ""
    for page in doc:
        raw_text += page.get_text("text")
    doc.close()
    return raw_text


def clean_text(raw_text: str) -> str:
    # remove strange symbols with keeping Arabic and English
    text = re.sub(r'[^\w\s\u0600-\u06FF\.,@\-\/\(\)\+\:]', ' ', raw_text)
    # Only one space
    text = re.sub(r'[ \t]+', ' ', text)
    # Only two empty line at most
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Clean each line
    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    return "\n".join(lines)


@app.post("/parse-cv")
async def parse_cv(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File must be .PDF")

    file_bytes = await file.read()
    raw_text = extract_text_from_pdf(file_bytes)

    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="There is no readable text in the PDF")

    clean = clean_text(raw_text)

    return {
        "status": "success",
        "cleaned_text": clean,
        "char_count": len(clean),
        "word_count": len(clean.split())
    }