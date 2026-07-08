import uvicorn
import os
from main import app

if __name__ == "__main__":
    # Hugging Face sets the PORT environment variable to 7860 by default
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
