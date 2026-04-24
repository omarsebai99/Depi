VALID_ROLES = [
    "Frontend Developer",
    "Backend Developer",
    "Full Stack Developer",
    "AI/ML Engineer",
    "Data Scientist",
    "Data Analyst",
    "Data Engineer",
    "Unknown"
]

VALID_LEVELS = [
    "Fresh",
    "Junior",
    "Senior"
]


def map_role(raw_role):
    """
    Map extracted role text into one of supported system roles
    """

    if not raw_role:
        return "Unknown"

    role = raw_role.lower()

    if "frontend" in role:
        return "Frontend Developer"

    elif "backend" in role:
        return "Backend Developer"

    elif "full stack" in role or "fullstack" in role:
        return "Full Stack Developer"

    elif "data scientist" in role:
        return "Data Scientist"

    elif "data analyst" in role:
        return "Data Analyst"

    elif "data engineer" in role:
        return "Data Engineer"

    elif (
        "machine learning" in role
        or "ml engineer" in role
        or "artificial intelligence" in role
        or "ai engineer" in role
    ):
        return "AI/ML Engineer"

    return "Unknown"