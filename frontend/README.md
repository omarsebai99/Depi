# Frontend

واجهة React أولية لمشروع Smart Virtual Interview System.

## Features

- Drag and Drop لرفع ملف PDF
- Loading/Spinner أثناء التحليل
- استلام JSON من الباك إند وعرضه داخل Form قابل للتعديل
- Demo fallback في حال عدم توفر API بعد

## Run

1. ادخل إلى مجلد `frontend`
2. شغل `npm install`
3. شغل `npm run dev`

## API Contract

الواجهة تتوقع أن الباك إند يرجع JSON بصيغة مرنة مثل:

```json
{
  "candidate": {
    "fullName": "...",
    "email": "...",
    "phone": "...",
    "currentRole": "...",
    "suggestedRole": "...",
    "experienceYears": 3
  },
  "extraction": {
    "skills": ["React", "TypeScript"],
    "highlights": ["..."],
    "interviewNotes": ["..."]
  }
}
```

If the backend uses different field names, the frontend normalizes the common ones as a fallback.
