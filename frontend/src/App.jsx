import { useRef, useState } from "react";

const emptyForm = {
  fullName: "",
  email: "",
  phone: "",
  currentRole: "",
  suggestedRole: "",
  experienceYears: "",
  skills: "",
  highlights: "",
  interviewNotes: "",
};

const readList = (value) => {
  if (Array.isArray(value))
    return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let size = bytes;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const normalizeResponse = (payload) => {
  const candidate =
    payload?.candidate ?? payload?.data?.candidate ?? payload ?? {};
  const extraction =
    payload?.extraction ?? payload?.data?.extraction ?? payload ?? {};

  return {
    fullName: candidate.fullName ?? candidate.name ?? payload.fullName ?? "",
    email: candidate.email ?? payload.email ?? "",
    phone: candidate.phone ?? payload.phone ?? "",
    currentRole:
      candidate.currentRole ?? candidate.jobTitle ?? payload.currentRole ?? "",
    suggestedRole:
      candidate.suggestedRole ??
      candidate.suggested_title ??
      payload.suggestedRole ??
      payload.suggested_title ??
      "",
    experienceYears: candidate.experienceYears ?? payload.experienceYears ?? "",
    skills: readList(extraction.skills ?? candidate.skills ?? payload.skills),
    highlights: readList(
      extraction.highlights ?? candidate.highlights ?? payload.highlights,
    ),
    interviewNotes: readList(
      extraction.interviewNotes ?? payload.interviewNotes,
    ),
  };
};

export default function App() {
  const fileInputRef = useRef(null);
  const [currentFile, setCurrentFile] = useState(null);
  const [currentSource, setCurrentSource] = useState("none");
  const [currentResponse, setCurrentResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysisState, setAnalysisState] = useState("Waiting for upload");
  const [connectionStatus, setConnectionStatus] = useState("Ready");
  const [apiUrl, setApiUrl] = useState("/api/upload-cv");
  const [reviewVisible, setReviewVisible] = useState(false);
  const [summary, setSummary] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [dragActive, setDragActive] = useState(false);

  const applyPayload = (payload, source) => {
    const normalized = normalizeResponse(payload);
    setCurrentResponse(payload);
    setCurrentSource(source);
    setForm({
      fullName: normalized.fullName,
      email: normalized.email,
      phone: normalized.phone,
      currentRole: normalized.currentRole,
      suggestedRole: normalized.suggestedRole,
      experienceYears: normalized.experienceYears,
      skills: normalized.skills.join("\n"),
      highlights: normalized.highlights.join("\n"),
      interviewNotes: normalized.interviewNotes.join("\n"),
    });
    setSummary(payload);
    setReviewVisible(true);
    setAnalysisError(null);
    setLoading(false);
    setAnalysisState("CV analyzed successfully");
    setConnectionStatus(source === "api" ? "Connected" : "Ready");
  };

  const handleFile = (file) => {
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setAnalysisState("File must be a PDF");
      setConnectionStatus("Error");
      setAnalysisError({
        title: "Unsupported File Type",
        message: "Only PDF files are accepted for analysis.",
      });
      return;
    }

    setCurrentFile(file);
    setAnalysisError(null);
    setAnalysisState("File selected");
    setConnectionStatus("Ready");
  };

  const handleAnalyze = async () => {
    if (!currentFile) {
      setAnalysisState("Upload a PDF file first");
      setConnectionStatus("Error");
      setAnalysisError({
        title: "No File Selected",
        message: "Choose a CV file first, then click Analyze File.",
      });
      return;
    }

    setLoading(true);
    setAnalysisState("Analyzing file...");
    setConnectionStatus("Processing");
    setAnalysisError(null);

    try {
      if (!apiUrl.trim()) {
        throw new Error("API URL is empty");
      }

      const formData = new FormData();
      formData.append("cv", currentFile);

      const response = await fetch(apiUrl.trim(), {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const serverMessage =
          payload?.message || payload?.error || payload?.detail || "Unknown error";
        throw new Error(
          `Request failed with status ${response.status}: ${serverMessage}`,
        );
      }

      applyPayload(payload, "api");
    } catch (error) {
      console.error(error);
      setAnalysisState("Connection failed");
      setConnectionStatus("Error");
      setAnalysisError({
        title: "Could Not Reach Analysis Service",
        message:
          "The request failed before receiving a valid analysis response.",
        details: error?.message || "Unknown network error",
        suggestions: [
          "Make sure backend is running on port 5000.",
          "Make sure AI-Service is running on port 8000.",
          "Check Backend API URL and try again.",
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const payload = {
      candidate: {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        currentRole: form.currentRole.trim(),
        suggestedRole: form.suggestedRole.trim(),
        experienceYears: Number(form.experienceYears) || 0,
      },
      extraction: {
        skills: readList(form.skills),
        highlights: readList(form.highlights),
        interviewNotes: readList(form.interviewNotes),
      },
      source: currentSource,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "interview-review.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const openPicker = () => fileInputRef.current?.click();

  const clearFile = () => {
    setCurrentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setAnalysisState("File removed");
    setConnectionStatus("Ready");
    setAnalysisError(null);
    setReviewVisible(false);
  };

  const resetForm = () => {
    const normalized = normalizeResponse(currentResponse);
    setForm({
      fullName: normalized.fullName,
      email: normalized.email,
      phone: normalized.phone,
      currentRole: normalized.currentRole,
      suggestedRole: normalized.suggestedRole,
      experienceYears: normalized.experienceYears,
      skills: normalized.skills.join("\n"),
      highlights: normalized.highlights.join("\n"),
      interviewNotes: normalized.interviewNotes.join("\n"),
    });
  };

  const templateSkills = summary?.extraction?.skills ?? summary?.skills ?? [];
  const rawSummary = summary
    ? JSON.stringify(summary, null, 2)
    : "No response yet. Upload a PDF and click Analyze File.";

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Smart Virtual Interview System</p>
          <h1>
            Upload the CV, review the data, and start the interview with
            confidence
          </h1>
          <p className="lead">
            Week 1 prototype for uploading a PDF, showing analysis status, and
            receiving backend JSON into an editable form before the interview
            starts.
          </p>
        </div>

        <div className="hero-meta">
          <div className="meta-box">
            <span>Step 1</span>
            <strong>Upload PDF</strong>
          </div>
          <div className="meta-box">
            <span>Step 2</span>
            <strong>Analyze CV</strong>
          </div>
          <div className="meta-box">
            <span>Step 3</span>
            <strong>Edit JSON</strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <article className="panel upload-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">1. Upload</p>
              <h2>Drag and Drop PDF</h2>
            </div>
            <span
              className={`status-pill ${connectionStatus === "Error" ? "error" : ""}`}
            >
              {connectionStatus}
            </span>
          </div>

          <div
            className={`dropzone ${dragActive ? "is-dragover" : ""}`}
            tabIndex={0}
            role="button"
            aria-label="Upload PDF file"
            onClick={openPicker}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") openPicker();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const [file] = event.dataTransfer.files;
              if (file) handleFile(file);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(event) => {
                const [file] = event.target.files;
                if (file) handleFile(file);
              }}
            />
            <div className="dropzone-icon">PDF</div>
            <h3>Drag your CV file here or click to choose</h3>
            <p>
              PDF files only. The file will be sent to backend then AI-Service
              for analysis.
            </p>
            <button className="ghost-button" type="button" onClick={openPicker}>
              Choose File
            </button>
          </div>

          {currentFile ? (
            <div className="file-card">
              <div>
                <strong>{currentFile.name}</strong>
                <p>{formatBytes(currentFile.size)} • PDF</p>
              </div>
              <button className="text-button" type="button" onClick={clearFile}>
                Remove
              </button>
            </div>
          ) : null}

          <div className="control-row">
            <label className="field full-width">
              <span>Backend API URL</span>
              <input
                type="text"
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                placeholder="/api/upload-cv"
              />
            </label>
          </div>

          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={handleAnalyze}
            >
              Analyze File
            </button>
          </div>
        </article>

        <article className="panel output-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">2. Analysis</p>
              <h2>Loading / Spinner</h2>
            </div>
            <span
              className={`status-pill ${analysisError ? "error" : "accent"}`}
            >
              {analysisState}
            </span>
          </div>

          {loading ? (
            <div className="spinner-card">
              <div className="spinner" aria-hidden="true" />
              <div>
                <strong>Analyzing CV</strong>
                <p>
                  Receiving the file and extracting skills and suggested role.
                </p>
              </div>
            </div>
          ) : null}

          {analysisError && !loading ? (
            <div className="error-card" role="alert" aria-live="polite">
              <div>
                <strong>{analysisError.title}</strong>
                <p>{analysisError.message}</p>
                {analysisError.details ? (
                  <p className="error-details">{analysisError.details}</p>
                ) : null}
                {Array.isArray(analysisError.suggestions) ? (
                  <ul>
                    {analysisError.suggestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={handleAnalyze}
              >
                Retry Analysis
              </button>
            </div>
          ) : null}

          <div className="json-summary">
            <h3>Latest Received JSON</h3>
            <p>
              {currentSource === "api"
                ? "Result received from backend"
                : "No analysis response yet"}
            </p>

            <div className="json-grid">
              <div className="json-box">
                <strong>skills</strong>
                <ul>
                  {templateSkills.length > 0 ? (
                    templateSkills.map((skill) => <li key={skill}>{skill}</li>)
                  ) : (
                    <li>No skills detected</li>
                  )}
                </ul>
              </div>

              <div className="json-box">
                <strong>raw response</strong>
                <pre>{rawSummary}</pre>
              </div>
            </div>
          </div>
        </article>
      </section>

      {reviewVisible ? (
        <section className="panel form-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">3. Review</p>
              <h2>Editable Form Before Interview</h2>
            </div>
            <div className="form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={resetForm}
              >
                Refill from Response
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={handleExport}
              >
                Export JSON
              </button>
            </div>
          </div>

          <form className="review-form">
            <div className="field-grid">
              <label className="field">
                <span>Full Name</span>
                <input
                  name="fullName"
                  type="text"
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      fullName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Phone Number</span>
                <input
                  name="phone"
                  type="text"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      phone: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Current Role</span>
                <input
                  name="currentRole"
                  type="text"
                  value={form.currentRole}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      currentRole: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Suggested Role</span>
                <input
                  name="suggestedRole"
                  type="text"
                  value={form.suggestedRole}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      suggestedRole: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Years of Experience</span>
                <input
                  name="experienceYears"
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.experienceYears}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      experienceYears: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className="field full-width">
              <span>Skills</span>
              <textarea
                name="skills"
                rows="5"
                placeholder="Write skills separated by new lines"
                value={form.skills}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    skills: event.target.value,
                  }))
                }
              />
            </label>

            <div className="field-grid">
              <label className="field full-width">
                <span>Highlights</span>
                <textarea
                  name="highlights"
                  rows="4"
                  placeholder="Quick summary of the strongest CV points"
                  value={form.highlights}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      highlights: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field full-width">
                <span>Interview Notes</span>
                <textarea
                  name="interviewNotes"
                  rows="4"
                  placeholder="Any notes before starting the interview"
                  value={form.interviewNotes}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      interviewNotes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </form>

          <div className="footer-note">
            <p>
              Review and edit the analyzed JSON before moving to the interview
              step.
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
