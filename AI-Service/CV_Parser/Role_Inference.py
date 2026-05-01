VALID_ROLES = [
    "Frontend Developer",
    "Backend Developer",
    "Full Stack Developer",
    "AI/ML Engineer",
    "Data Scientist",
    "Data Analyst",
    "Data Engineer",
    "Unknown",
]

VALID_LEVELS = [
    "Fresh",
    "Junior",
    "Senior",
]

ROLE_KEYWORDS = {
    "Frontend Developer": [
        "frontend",
        "front-end",
        "react",
        "next.js",
        "nextjs",
        "vue",
        "angular",
        "javascript",
        "typescript",
        "html",
        "css",
    ],
    "Backend Developer": [
        "backend",
        "back-end",
        "api",
        "node.js",
        "nodejs",
        "express",
        "fastapi",
        "django",
        "flask",
        "spring",
        "laravel",
        "postgresql",
        "mysql",
    ],
    "Full Stack Developer": [
        "full stack",
        "fullstack",
        "mern",
        "mean",
        "react",
        "node.js",
        "express",
        "mongodb",
    ],
    "AI/ML Engineer": [
        "machine learning",
        "ml engineer",
        "artificial intelligence",
        "ai engineer",
        "deep learning",
        "tensorflow",
        "pytorch",
        "llm",
        "nlp",
        "computer vision",
    ],
    "Data Scientist": [
        "data scientist",
        "predictive modeling",
        "feature engineering",
        "statistics",
        "scikit-learn",
    ],
    "Data Analyst": [
        "data analyst",
        "power bi",
        "tableau",
        "excel",
        "dashboard",
        "reporting",
        "sql",
    ],
    "Data Engineer": [
        "data engineer",
        "etl",
        "elt",
        "data pipeline",
        "airflow",
        "spark",
        "hadoop",
        "warehouse",
    ],
}


def map_role(raw_role):
    """
    Map extracted role text into one of supported system roles.
    """

    if not raw_role:
        return "Unknown"

    role = str(raw_role).lower()

    for canonical_role, keywords in ROLE_KEYWORDS.items():
        if any(keyword in role for keyword in keywords):
            return canonical_role

    return "Unknown"


def infer_role_from_skills(skills, current_role=""):
    """
    Infer the most likely supported role from title and detected skills.
    """

    mapped_role = map_role(current_role)
    if mapped_role != "Unknown":
        return mapped_role

    if not isinstance(skills, list):
        return "Unknown"

    skill_text = " ".join(str(skill).lower() for skill in skills)
    scores = {role: 0 for role in ROLE_KEYWORDS}

    for role, keywords in ROLE_KEYWORDS.items():
        for keyword in keywords:
            if keyword in skill_text:
                scores[role] += 1

    best_role = max(scores, key=scores.get)
    return best_role if scores[best_role] > 0 else "Unknown"


def normalize_level(level, years_of_experience=0):
    """
    Normalize the experience level to supported buckets.
    """

    if isinstance(level, str):
        lowered = level.strip().lower()

        if lowered in {"fresh", "fresher", "intern", "entry", "entry-level"}:
            return "Fresh"
        if lowered in {"junior", "jr", "mid", "associate"}:
            return "Junior"
        if lowered in {"senior", "sr", "lead", "principal"}:
            return "Senior"

    if years_of_experience >= 3:
        return "Senior"
    if years_of_experience >= 1:
        return "Junior"
    return "Fresh"
