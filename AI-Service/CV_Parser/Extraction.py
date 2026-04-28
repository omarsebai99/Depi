import os
import json
from dotenv import load_dotenv
from groq import Groq

from prompts import CV_EXTRACTION_PROMPT
from CV_Parser.Role_Inference import map_role, VALID_LEVELS

load_dotenv()


def get_groq_client():
    """
    Build Groq client lazily to avoid crashing app startup when key is missing.
    """

    api_key = os.environ.get("GROQ_API_KEY")

    if not api_key:
        raise ValueError(
            "GROQ_API_KEY is not set. Set it in environment or .env file."
        )

    return Groq(api_key=api_key)


def normalize_skills(skills):
    """
    Normalize technical skills
    """

    if not isinstance(skills, list):
        return []

    normalized = []

    for skill in skills:
        if isinstance(skill, str):
            clean_skill = skill.strip().lower()

            if clean_skill and clean_skill not in normalized:
                normalized.append(clean_skill)

    return normalized



def validate_profile(profile):
    """
    Validate required JSON structure
    """

    if not isinstance(profile, dict):
        raise ValueError("Profile must be a dictionary")

    required_keys = [
        "personal_info",
        "skills",
        "experience",
        "inferred_role"
    ]
    for key in required_keys:
        if key not in profile:
            raise ValueError(f"Missing required key: {key}")

    if not isinstance(profile["skills"], list):
        raise ValueError("Skills must be a list")



def extract_and_infer_profile(clean_cv_text: str) -> dict:
    """
    Takes cleaned CV text and returns validated candidate profile JSON
    """

    user_prompt = f"CV Text:\n{clean_cv_text}"

    try:
        client = get_groq_client()

        response = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": CV_EXTRACTION_PROMPT
                },
                {
                    "role": "user",
                    "content": user_prompt
                }
            ],
            model="llama-3.1-8b-instant",
            temperature=0.0
        )

        content = response.choices[0].message.content

        if not content:
            return {
                "status": "error",
                "message": "LLM returned empty response",
                "data": None
            }

        raw_output = content.strip()

        if raw_output.startswith("```json"):
            raw_output = raw_output[7:-3].strip()
        elif raw_output.startswith("```"):
            raw_output = raw_output[3:-3].strip()

        profile_data = json.loads(raw_output)

        validate_profile(profile_data)

        profile_data["skills"] = normalize_skills(
            profile_data.get("skills", [])
        )

        raw_role = (
            profile_data
            .get("inferred_role", {})
            .get("raw_role_text", "")
        )

        profile_data["inferred_role"]["suggested_role"] = map_role(raw_role)

        level = (
            profile_data
            .get("experience", {})
            .get("level", "Fresh")
        )

        if level not in VALID_LEVELS:
            profile_data["experience"]["level"] = "Fresh"

        return {
            "status": "success",
            "message": "Candidate profile extracted successfully",
            "data": profile_data
        }

    except json.JSONDecodeError:
        return {
            "status": "error",
            "message": "Failed to parse LLM output into valid JSON",
            "data": None
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "data": None
        }