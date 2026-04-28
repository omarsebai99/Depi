# AI Mock Interview Platform

DEPI Graduation Project

## Description

An AI-powered system that simulates real interview experiences using:

- Multi-agent architecture
- Real-time voice interaction
- CV understanding
- AI-based evaluation

## Tech Stack (Planned)

- React
- Node.js
- FastAPI
- LangGraph
- Groq
- STT / TTS

## Current Structure

- `frontend/` - React/Vite UI scaffold for PDF upload, analysis loading state, and review form
- `AI-Service/` - backend service placeholder

## Run Locally

Run each app from its own folder in separate terminals.

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on Vite, usually at `http://localhost:5173`.

### 2. Backend

```bash
cd Backend
npm install
npm run dev
```

The backend runs on Express, usually at `http://localhost:3000`.

### 3. AI Service

```bash
cd AI-Service
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The AI service runs on FastAPI, usually at `http://localhost:8000`.

## Notes

- Start the backend and AI service before using the frontend features that depend on them.
- The frontend Vite proxy currently points `/api` to `http://localhost:5000`, while the backend defaults to `http://localhost:3000`. Either set `PORT=5000` for the backend or update `frontend/vite.config.js` to match your backend port.
