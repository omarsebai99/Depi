from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
import fitz

from CV_Parser.Extraction import extract_and_infer_profile

app = FastAPI(
    title="AI Service",
    description="CV Parsing + Candidate Profile Extraction",
    version="1.0.0"
)


class CVRequest(BaseModel):
    clean_cv_text: str


def extract_text_from_pdf(file_bytes):
    text = ""
    pdf = fitz.open(stream=file_bytes, filetype="pdf")

    for page in pdf:
        text += page.get_text()

    return text



def clean_text(text):
    return " ".join(text.split())


@app.get("/")
async def root():
    return {
        "message": "AI Service API is running successfully"
    }


@app.post("/parse-cv")
async def parse_cv(file: UploadFile = File(...)):
    """
    PDF -> Clean Text
    """

    try:
        content = await file.read()

        raw_text = extract_text_from_pdf(content)
        clean_cv_text = clean_text(raw_text)

        return {
            "status": "success",
            "clean_cv_text": clean_cv_text
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@app.post("/extract-profile")
async def extract_profile(request: CVRequest):
    """
    Clean Text -> Candidate Profile JSON
    """

    if not request.clean_cv_text.strip():
        raise HTTPException(
            status_code=400,
            detail="clean_cv_text cannot be empty"
        )

    result = extract_and_infer_profile(
        request.clean_cv_text
    )

    if result["status"] == "error":
        raise HTTPException(
            status_code=500,
            detail=result["message"]
        )

    return result