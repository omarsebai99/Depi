---
title: Smart Virtual Interview AI Service
emoji: 🤖
colorFrom: blue
colorTo: indigo
sdk: gradio
sdk_version: 4.0.0
app_file: app.py
pinned: false
---

# Smart Virtual Interview AI Service (FastAPI)

FastAPI service that manages semantic resume parsing, interview question planning, and candidate answer evaluation.

## Hugging Face Spaces Deployment (Free Tier)

This folder is configured for direct deployment as a **Hugging Face Gradio Space** (which runs `app.py` on the free tier without requiring billing/credit card registration).

### Steps to Deploy:
1. Create a new Space on [Hugging Face](https://huggingface.co/new-space).
2. Select **Gradio** as the Space SDK (this is the 100% free tier).
3. Clone your Space repository locally or upload all files inside this `/AI-Service` directory (including `app.py`, `main.py`, `prompts.py`, and `requirements.txt`) directly into the root of the Space.
4. In the Space **Settings** page, scroll down to **Repository Secrets** and add your variables:
   * **Key**: `GROQ_API_KEY` -> (Your Groq Cloud API Key)
   * **Key**: `GROQ_MODEL` -> (Value: `llama-3.1-8b-instant`)
5. Hugging Face will automatically install your Python requirements from `requirements.txt` and execute `app.py`, which binds the FastAPI server to port 7860.
6. Once running, copy your public Hugging Face Space API URL (e.g. `https://yourusername-spacename.hf.space`) and paste it as the `AI_SERVICE_URL` in your Railway backend variables!
