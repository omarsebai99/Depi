import { useEffect, useRef, useState } from "react";

const AUTH_STORAGE_KEY = "smart-interview-auth-token";
const THEME_STORAGE_KEY = "smart-interview-theme";
const ROUTE_PATHS = {
  login: "/login",
  signup: "/signup",
  dashboard: "/dashboard",
  review: "/review",
  profile: "/profile",
};
const PROTECTED_ROUTES = new Set(["dashboard", "review", "profile"]);
const PUBLIC_ROUTES = new Set(["login", "signup"]);

const emptyForm = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  github: "",
  portfolio: "",
  currentRole: "",
  suggestedRole: "",
  experienceYears: "",
  experienceLevel: "",
  summary: "",
  skills: "",
  highlights: "",
  experience: "",
  education: "",
  projects: "",
  certifications: "",
  interviewNotes: "",
};

const emptyProfile = {
  candidate: {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",
    currentRole: "",
    suggestedRole: "",
    experienceYears: 0,
    experienceLevel: "",
    summary: "",
  },
  extraction: {
    skills: [],
    highlights: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    interviewNotes: [],
  },
  metadata: {
    rawRoleText: "",
    parser: "",
    parserVersion: "",
    llmStatus: "",
    llmError: "",
    cleanTextPreview: "",
    cleanTextLength: 0,
    rawTextLength: 0,
    warnings: [],
    sourceFileHash: "",
    analysisDurationMs: 0,
  },
  cleanCvText: "",
  lastCvFileName: "",
  lastUpdatedAt: "",
};

const readList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const joinList = (value) => readList(value).join("\n");

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

const formatDateTime = (value) => {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
};

const hasProfileContent = (profile) => {
  if (!profile) return false;

  const candidate = profile.candidate || {};
  const extraction = profile.extraction || {};

  return Boolean(
    candidate.fullName ||
    candidate.currentRole ||
    candidate.summary ||
    extraction.skills?.length ||
    extraction.experience?.length,
  );
};

const normalizeProfilePayload = (payload) => {
  const root = payload?.data ?? payload ?? {};
  const profile =
    root.profile ?? root.analysis ?? payload?.profile ?? emptyProfile;
  const user = root.user ?? payload?.user ?? null;
  const cvs = Array.isArray(root.cvs)
    ? root.cvs.map((item) => ({
        ...item,
        profile: {
          candidate: {
            ...emptyProfile.candidate,
            ...(item.profile?.candidate || {}),
          },
          extraction: {
            ...emptyProfile.extraction,
            ...(item.profile?.extraction || {}),
          },
          metadata: {
            ...emptyProfile.metadata,
            ...(item.profile?.metadata || {}),
          },
          cleanCvText: item.profile?.cleanCvText ?? "",
          lastCvFileName: item.profile?.lastCvFileName ?? "",
          lastUpdatedAt: item.profile?.lastUpdatedAt ?? "",
        },
      }))
    : [];

  return {
    user,
    cvs,
    profile: {
      candidate: {
        ...emptyProfile.candidate,
        ...(profile.candidate || {}),
      },
      extraction: {
        ...emptyProfile.extraction,
        ...(profile.extraction || {}),
      },
      metadata: {
        ...emptyProfile.metadata,
        ...(profile.metadata || {}),
      },
      cleanCvText: profile.cleanCvText ?? payload?.clean_cv_text ?? "",
      lastCvFileName: profile.lastCvFileName ?? "",
      lastUpdatedAt: profile.lastUpdatedAt ?? "",
    },
  };
};

const buildFormFromProfile = (profile) => ({
  fullName: profile.candidate.fullName || "",
  email: profile.candidate.email || "",
  phone: profile.candidate.phone || "",
  location: profile.candidate.location || "",
  linkedin: profile.candidate.linkedin || "",
  github: profile.candidate.github || "",
  portfolio: profile.candidate.portfolio || "",
  currentRole: profile.candidate.currentRole || "",
  suggestedRole: profile.candidate.suggestedRole || "",
  experienceYears: String(profile.candidate.experienceYears ?? ""),
  experienceLevel: profile.candidate.experienceLevel || "",
  summary: profile.candidate.summary || "",
  skills: joinList(profile.extraction.skills),
  highlights: joinList(profile.extraction.highlights),
  experience: joinList(profile.extraction.experience),
  education: joinList(profile.extraction.education),
  projects: joinList(profile.extraction.projects),
  certifications: joinList(profile.extraction.certifications),
  interviewNotes: joinList(profile.extraction.interviewNotes),
});

const buildProfileFromForm = (form, baseProfile) => ({
  candidate: {
    fullName: form.fullName.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    location: form.location.trim(),
    linkedin: form.linkedin.trim(),
    github: form.github.trim(),
    portfolio: form.portfolio.trim(),
    currentRole: form.currentRole.trim(),
    suggestedRole: form.suggestedRole.trim(),
    experienceYears: Number(form.experienceYears) || 0,
    experienceLevel: form.experienceLevel.trim(),
    summary: form.summary.trim(),
  },
  extraction: {
    skills: readList(form.skills),
    highlights: readList(form.highlights),
    experience: readList(form.experience),
    education: readList(form.education),
    projects: readList(form.projects),
    certifications: readList(form.certifications),
    interviewNotes: readList(form.interviewNotes),
  },
  metadata: baseProfile?.metadata || emptyProfile.metadata,
  cleanCvText: baseProfile?.cleanCvText || "",
  lastCvFileName: baseProfile?.lastCvFileName || "",
  lastUpdatedAt: baseProfile?.lastUpdatedAt || "",
});

const renderItems = (items, emptyMessage) => {
  if (!items?.length) {
    return <li>{emptyMessage}</li>;
  }

  return items.map((item) => <li key={item}>{item}</li>);
};

const getParserBadge = (profile) => {
  const llmStatus = profile?.metadata?.llmStatus || "";

  if (llmStatus === "used") {
    return { label: "Parsed by LLM", tone: "success" };
  }

  if (llmStatus === "fallback") {
    return { label: "Parsed by Heuristics", tone: "warning" };
  }

  return { label: "Parser status unknown", tone: "neutral" };
};

const ParserBadge = ({ profile }) => {
  const badge = getParserBadge(profile);

  return <span className={`parser-badge ${badge.tone}`}>{badge.label}</span>;
};

const ActiveCvBanner = ({ snapshot, profile, title = "Active CV" }) => (
  <div className="active-cv-banner">
    <div className="active-cv-copy">
      <span className="active-cv-label">{title}</span>
      <strong>{snapshot?.fileName || profile?.lastCvFileName || "No active CV selected"}</strong>
      <small>
        {profile?.candidate?.currentRole || profile?.candidate?.suggestedRole || "Role not detected"}
      </small>
    </div>
    <div className="active-cv-meta">
      <ParserBadge profile={profile} />
      <span>{formatDateTime(snapshot?.uploadedAt || profile?.lastUpdatedAt)}</span>
    </div>
  </div>
);

const getPathForRoute = (route) => ROUTE_PATHS[route] || ROUTE_PATHS.login;

const getRouteFromPath = (pathname) => {
  const normalizedPath = pathname && pathname !== "/" ? pathname : "/login";
  return (
    Object.entries(ROUTE_PATHS).find(([, path]) => path === normalizedPath)?.[0] ||
    "login"
  );
};

const resolveRoute = (pathname, token) => {
  const requestedRoute = getRouteFromPath(pathname);

  if (token) {
    return PUBLIC_ROUTES.has(requestedRoute) ? "dashboard" : requestedRoute;
  }

  return PROTECTED_ROUTES.has(requestedRoute) ? "login" : requestedRoute;
};

const Navigation = ({
  token,
  route,
  setRoute,
  user,
  onLogout,
  theme,
  onToggleTheme,
}) => {
  const guestItems = [
    { id: "login", label: "Login" },
    { id: "signup", label: "Sign Up" },
  ];

  const appItems = [
    { id: "dashboard", label: "Dashboard" },
    { id: "review", label: "Review" },
    { id: "profile", label: "Profile" },
  ];

  const items = token ? appItems : guestItems;

  return (
    <header className="topbar">
      <div className="brand-block">
        <p className="brand-kicker">Smart Virtual Interview</p>
        <h1>CV Workspace</h1>
      </div>

      <nav className="nav-links" aria-label="Primary">
        {items.map((item) => (
          <a
            key={item.id}
            href={getPathForRoute(item.id)}
            className={route === item.id ? "nav-link active" : "nav-link"}
            onClick={(event) => {
              event.preventDefault();
              setRoute(item.id);
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="nav-meta">
        <button className="theme-toggle" type="button" onClick={onToggleTheme}>
          <span className="theme-toggle-icon" aria-hidden="true">
            {theme === "dark" ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2.5v2.7M12 18.8v2.7M21.5 12h-2.7M5.2 12H2.5M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9M18.7 18.7l-1.9-1.9M7.2 7.2 5.3 5.3" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.2 14.1A8.5 8.5 0 0 1 9.9 3.8a8.9 8.9 0 1 0 10.3 10.3Z" />
              </svg>
            )}
          </span>
          <span className="theme-toggle-text">
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </span>
        </button>
        {token ? (
          <button className="secondary-button" type="button" onClick={onLogout}>
            Logout
          </button>
        ) : null}
      </div>
    </header>
  );
};

const GuestPage = ({
  route,
  authForm,
  setAuthForm,
  authLoading,
  authError,
  onSubmit,
}) => {
  const isSignup = route === "signup";

  return (
    <section className="auth-layout">
      <article className="auth-intro panel">
        <p className="panel-kicker">Welcome</p>
        <h2>Smart virtual interview powered by your CV</h2>
        <p className="lead">
          Upload a CV, parse candidate data automatically, and drive a real-time
          interview flow based on the candidate profile and extracted details.
        </p>
        <div className="auth-benefits">
          <div className="meta-box">
            <span>Smart Virtual Interview</span>
            <strong>Interview experience tailored to the uploaded CV</strong>
          </div>
          <div className="meta-box">
            <span>Upload and Parse CV</span>
            <strong>
              Extract profile, skills, experience, and role details
            </strong>
          </div>
          <div className="meta-box">
            <span>Real-Time Interview</span>
            <strong>Use parsed CV data to guide the interview session</strong>
          </div>
        </div>
      </article>

      <article className="auth-card panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">{isSignup ? "Sign Up" : "Login"}</p>
            <h2>{isSignup ? "Create your account" : "Access your profile"}</h2>
          </div>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {isSignup ? (
            <label className="field">
              <span>Full Name</span>
              <input
                type="text"
                value={authForm.name}
                onChange={(event) =>
                  setAuthForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={authForm.email}
              onChange={(event) =>
                setAuthForm((previous) => ({
                  ...previous,
                  email: event.target.value,
                }))
              }
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={authForm.password}
              onChange={(event) =>
                setAuthForm((previous) => ({
                  ...previous,
                  password: event.target.value,
                }))
              }
            />
          </label>

          {authError ? <p className="inline-error">{authError}</p> : null}

          <button
            className="primary-button auth-submit"
            type="submit"
            disabled={authLoading}
          >
            {authLoading
              ? "Please wait..."
              : isSignup
                ? "Create Account"
                : "Login"}
          </button>
        </form>
      </article>
    </section>
  );
};

const DashboardPage = ({
  token,
  currentFile,
  fileInputRef,
  dragActive,
  setDragActive,
  handleFile,
  openPicker,
  clearFile,
  formatBytesValue,
  apiUrl,
  setApiUrl,
  handleAnalyze,
  loading,
  connectionStatus,
  analysisState,
  analysisError,
  currentProfile,
  currentResponse,
  cvHistory,
  selectedCvId,
  loadSnapshot,
  setRoute,
  saveMessage,
}) => {
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [dashboardView, setDashboardView] = useState("overview");
  const selectedSnapshot =
    cvHistory.find((item) => item.id === selectedCvId) || cvHistory[0] || null;
  const selectedProfile = selectedSnapshot?.profile || currentProfile;
  const templateSkills = selectedProfile.extraction.skills ?? [];
  const templateHighlights = selectedProfile.extraction.highlights ?? [];
  const summaryText =
    selectedProfile.candidate.summary ||
    "Parsed candidate summary will appear here after analysis.";
  const rawSummary = currentResponse
    ? JSON.stringify(currentResponse, null, 2)
    : JSON.stringify(selectedProfile, null, 2);

  return (
    <section className="page-stack">
      <article className="panel upload-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">1. Upload</p>
            <h2>Upload CV (PDF)</h2>
          </div>
          <span
            className={`status-pill ${connectionStatus === "Error" ? "error" : ""}`}
          >
            {connectionStatus}
          </span>
        </div>

        <div
          className={`dropzone ${dragActive ? "is-dragover" : ""} ${!token ? "is-disabled" : ""}`}
          tabIndex={0}
          role="button"
          aria-label="Upload PDF file"
          onClick={openPicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") openPicker();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!token) return;
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            if (!token) return;
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
          <h3>Upload into the active user profile</h3>
          <p>
            CV parsing is saved to the authenticated user, then reviewed on a
            separate page.
          </p>
          <button
            className="ghost-button"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openPicker();
            }}
          >
            Choose file
          </button>
        </div>

        {currentFile ? (
          <div className="file-card">
            <div>
              <strong>{currentFile.name}</strong>
              <p>{formatBytesValue(currentFile.size)} - PDF</p>
            </div>
            <button className="text-button" type="button" onClick={clearFile}>
              Remove
            </button>
          </div>
        ) : null}

        <div className="inline-tools">
          <button
            className="text-button"
            type="button"
            onClick={() => setShowApiSettings((previous) => !previous)}
          >
            {showApiSettings ? "Hide advanced settings" : "Show advanced settings"}
          </button>
        </div>

        {showApiSettings ? (
          <div className="control-row">
            <label className="field full-width">
              <span>Upload API URL</span>
              <input
                type="text"
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                placeholder="/api/profile/upload-cv"
              />
            </label>
          </div>
        ) : null}

        <div className="action-row">
          <button
            className="primary-button"
            type="button"
            onClick={handleAnalyze}
            disabled={!token || loading}
          >
            {loading ? "Analyzing..." : "Analyze and Save"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setRoute("review")}
          >
            Open Review Page
          </button>
        </div>

        {saveMessage ? <p className="save-message">{saveMessage}</p> : null}
      </article>

      <article className="panel output-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">2. Analysis</p>
            <h2>Latest Parsed Snapshot</h2>
          </div>
          <span className={`status-pill ${analysisError ? "error" : "accent"}`}>
            {analysisState}
          </span>
        </div>

        <ActiveCvBanner snapshot={selectedSnapshot} profile={selectedProfile} />

        {loading ? (
          <div className="spinner-card">
            <div className="spinner" aria-hidden="true" />
            <div>
              <strong>Analyzing CV</strong>
              <p>
                Parsing details and storing them in the current user profile.
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
          </div>
        ) : null}

        <div className="insight-grid">
          <div className="json-box compact-box">
            <strong>suggested role</strong>
            <p>
              {selectedProfile.candidate.suggestedRole || "Not detected yet"}
            </p>
          </div>
          <div className="json-box compact-box">
            <strong>experience</strong>
            <p>
              {selectedProfile.candidate.experienceYears || 0} years -{" "}
              {selectedProfile.candidate.experienceLevel || "Not classified"}
            </p>
          </div>
          <div className="json-box compact-box">
            <strong>current role</strong>
            <p>{selectedProfile.candidate.currentRole || "Not detected yet"}</p>
          </div>
          <div className="json-box compact-box">
            <strong>updated</strong>
            <p>{formatDateTime(selectedProfile.lastUpdatedAt)}</p>
          </div>
          <div className="json-box compact-box">
            <strong>parser</strong>
            <p>{selectedProfile.metadata.parserVersion || "Unknown"}</p>
            <ParserBadge profile={selectedProfile} />
          </div>
        </div>

        {selectedProfile.metadata.warnings?.length ? (
          <div className="error-card" role="status" aria-live="polite">
            <div>
              <strong>Review recommended</strong>
              <ul>
                {selectedProfile.metadata.warnings.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="json-summary">
          <div className="panel-header dashboard-response-header">
            <div>
              <h3>Response Explorer</h3>
              <p>
                Browse saved uploads, then inspect structured candidate,
                extraction, and metadata content for the selected snapshot.
              </p>
            </div>
            {selectedSnapshot ? (
              <div className="response-selection-meta">
                <strong>{selectedSnapshot.fileName}</strong>
                <span>{formatDateTime(selectedSnapshot.uploadedAt)}</span>
              </div>
            ) : null}
          </div>

          <div className="section-tabs">
            {[
              ["overview", "Overview"],
              ["extraction", "Extraction"],
              ["metadata", "Metadata"],
              ["raw", "Raw JSON"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={
                  dashboardView === value ? "tab-button active" : "tab-button"
                }
                type="button"
                onClick={() => setDashboardView(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="response-workspace">
            <aside className="response-sidebar">
              <div className="response-sidebar-header">
                <strong>Saved uploads</strong>
                <span>{cvHistory.length} total</span>
              </div>
              {cvHistory.length ? (
                <ul className="snapshot-list">
                  {cvHistory.map((item) => (
                    <li key={item.id}>
                      <button
                        className={
                          selectedSnapshot?.id === item.id
                            ? "snapshot-button active"
                            : "snapshot-button"
                        }
                        type="button"
                        onClick={() => loadSnapshot(item)}
                      >
                        <span>{item.fileName}</span>
                        <small>
                          {formatDateTime(item.uploadedAt)}
                          {item.storedFileSize
                            ? ` - ${formatBytesValue(item.storedFileSize)}`
                            : ""}
                        </small>
                        <ParserBadge profile={item.profile} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state compact-empty">
                  <p>No saved uploads yet.</p>
                </div>
              )}
            </aside>

            <div className="response-main">
              {dashboardView === "overview" ? (
                <div className="response-card-grid">
                  <div className="json-box response-panel">
                    <strong>summary</strong>
                    <p className="box-paragraph">{summaryText}</p>
                  </div>

                  <div className="json-box response-panel">
                    <strong>highlights</strong>
                    <ul>
                      {renderItems(templateHighlights, "No highlights detected")}
                    </ul>
                  </div>

                  <div className="json-box response-panel">
                    <strong>candidate</strong>
                    <pre>{JSON.stringify(selectedProfile.candidate, null, 2)}</pre>
                  </div>

                  <div className="json-box response-panel">
                    <strong>top skills</strong>
                    <ul>{renderItems(templateSkills, "No skills detected")}</ul>
                  </div>
                </div>
              ) : null}

              {dashboardView === "extraction" ? (
                <div className="response-card-grid">
                  <div className="json-box response-panel response-span-full">
                    <strong>extraction</strong>
                    <pre>
                      {JSON.stringify(selectedProfile.extraction, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : null}

              {dashboardView === "metadata" ? (
                <div className="response-card-grid">
                  <div className="json-box response-panel">
                    <strong>metadata</strong>
                    <pre>{JSON.stringify(selectedProfile.metadata, null, 2)}</pre>
                  </div>
                  <div className="json-box response-panel">
                    <strong>clean CV text</strong>
                    <pre>{selectedProfile.cleanCvText || "Not available"}</pre>
                  </div>
                </div>
              ) : null}

              {dashboardView === "raw" ? (
                <div className="response-card-grid">
                  <div className="json-box response-panel response-span-full">
                    <strong>latest API payload</strong>
                    <pre>{rawSummary}</pre>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
};

const ReviewPage = ({
  form,
  updateField,
  handleSaveProfile,
  savingProfile,
  resetForm,
  handleExport,
  saveMessage,
  reviewVisible,
  currentSnapshot,
  openStoredCv,
}) => {
  const [reviewSection, setReviewSection] = useState("identity");

  if (!reviewVisible) {
    return (
      <section className="panel empty-state">
        <p className="panel-kicker">Review</p>
        <h2>No profile data yet</h2>
        <p>
          Upload a CV first, then review and edit the extracted details here.
        </p>
      </section>
    );
  }

  return (
    <section className="panel form-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">3. Review</p>
          <h2>Editable Candidate Review</h2>
          {currentSnapshot?.profile ? (
            <ParserBadge profile={currentSnapshot.profile} />
          ) : null}
        </div>
        <div className="form-actions">
          {currentSnapshot?.fileUrl ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => openStoredCv(currentSnapshot)}
            >
              Open Original PDF
            </button>
          ) : null}
          <button
            className="secondary-button"
            type="button"
            onClick={resetForm}
          >
            Reset to Saved
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={handleSaveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? "Saving..." : "Save to Profile"}
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

        <ActiveCvBanner
          snapshot={currentSnapshot}
          profile={currentSnapshot?.profile}
          title="Reviewing CV"
        />

      {saveMessage ? <p className="save-message">{saveMessage}</p> : null}

      <div className="section-tabs">
        {[
          ["identity", "Identity"],
          ["summary", "Summary"],
          ["experience", "Experience"],
          ["notes", "Notes"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={
              reviewSection === value ? "tab-button active" : "tab-button"
            }
            type="button"
            onClick={() => setReviewSection(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <form className="review-form">
        {reviewSection === "identity" ? (
          <div className="section-panel">
            <div className="field-grid field-grid-3">
              <label className="field">
                <span>Full Name</span>
                <input
                  name="fullName"
                  type="text"
                  value={form.fullName}
                  onChange={(event) => updateField("fullName", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Profile Email</span>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Phone Number</span>
                <input
                  name="phone"
                  type="text"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Location</span>
                <input
                  name="location"
                  type="text"
                  value={form.location}
                  onChange={(event) => updateField("location", event.target.value)}
                />
              </label>
              <label className="field">
                <span>LinkedIn</span>
                <input
                  name="linkedin"
                  type="text"
                  value={form.linkedin}
                  onChange={(event) => updateField("linkedin", event.target.value)}
                />
              </label>
              <label className="field">
                <span>GitHub</span>
                <input
                  name="github"
                  type="text"
                  value={form.github}
                  onChange={(event) => updateField("github", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Portfolio</span>
                <input
                  name="portfolio"
                  type="text"
                  value={form.portfolio}
                  onChange={(event) => updateField("portfolio", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Current Role</span>
                <input
                  name="currentRole"
                  type="text"
                  value={form.currentRole}
                  onChange={(event) =>
                    updateField("currentRole", event.target.value)
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
                    updateField("suggestedRole", event.target.value)
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
                    updateField("experienceYears", event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Experience Level</span>
                <input
                  name="experienceLevel"
                  type="text"
                  value={form.experienceLevel}
                  onChange={(event) =>
                    updateField("experienceLevel", event.target.value)
                  }
                />
              </label>
            </div>
          </div>
        ) : null}

        {reviewSection === "summary" ? (
          <div className="section-panel">
            <label className="field full-width">
              <span>Professional Summary</span>
              <textarea
                name="summary"
                rows="5"
                value={form.summary}
                onChange={(event) => updateField("summary", event.target.value)}
              />
            </label>

            <div className="field-grid">
              <label className="field full-width">
                <span>Skills</span>
                <textarea
                  name="skills"
                  rows="7"
                  value={form.skills}
                  onChange={(event) => updateField("skills", event.target.value)}
                />
              </label>
              <label className="field full-width">
                <span>Highlights</span>
                <textarea
                  name="highlights"
                  rows="7"
                  value={form.highlights}
                  onChange={(event) =>
                    updateField("highlights", event.target.value)
                  }
                />
              </label>
            </div>
          </div>
        ) : null}

        {reviewSection === "experience" ? (
          <div className="section-panel">
            <div className="field-grid">
              <label className="field full-width">
                <span>Experience Details</span>
                <textarea
                  name="experience"
                  rows="8"
                  value={form.experience}
                  onChange={(event) =>
                    updateField("experience", event.target.value)
                  }
                />
              </label>
              <label className="field full-width">
                <span>Education</span>
                <textarea
                  name="education"
                  rows="8"
                  value={form.education}
                  onChange={(event) => updateField("education", event.target.value)}
                />
              </label>
              <label className="field full-width">
                <span>Projects</span>
                <textarea
                  name="projects"
                  rows="7"
                  value={form.projects}
                  onChange={(event) => updateField("projects", event.target.value)}
                />
              </label>
              <label className="field full-width">
                <span>Certifications</span>
                <textarea
                  name="certifications"
                  rows="7"
                  value={form.certifications}
                  onChange={(event) =>
                    updateField("certifications", event.target.value)
                  }
                />
              </label>
            </div>
          </div>
        ) : null}

        {reviewSection === "notes" ? (
          <div className="section-panel">
            <label className="field full-width">
              <span>Interview Notes</span>
              <textarea
                name="interviewNotes"
                rows="10"
                value={form.interviewNotes}
                onChange={(event) =>
                  updateField("interviewNotes", event.target.value)
                }
              />
            </label>
          </div>
        ) : null}
      </form>
    </section>
  );
};

const HistoryPage = ({
  cvHistory,
  selectedCvId,
  loadSnapshot,
  openStoredCv,
  setRoute,
}) => {
  const selected =
    cvHistory.find((item) => item.id === selectedCvId) || cvHistory[0];

  if (!cvHistory.length) {
    return (
      <section className="panel empty-state">
        <p className="panel-kicker">History</p>
        <h2>No saved CV uploads yet</h2>
        <p>Upload a CV from the dashboard and it will appear here.</p>
      </section>
    );
  }

  return (
    <section className="page-grid history-page">
      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">History</p>
            <h2>Saved CV uploads</h2>
          </div>
        </div>

        <ul className="history-list">
          {cvHistory.map((item) => (
            <li key={item.id}>
              <button
                className={
                  selected?.id === item.id
                    ? "history-item active"
                    : "history-item"
                }
                type="button"
                onClick={() => loadSnapshot(item)}
              >
                <span>{item.fileName}</span>
                <small>
                  {formatDateTime(item.uploadedAt)}
                  {item.storedFileSize
                    ? ` • ${formatBytes(item.storedFileSize)}`
                    : ""}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </article>

      <article className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Preview</p>
            <h2>{selected?.fileName || "Snapshot"}</h2>
          </div>
        </div>

        {selected ? (
          <div className="json-summary">
            <div className="action-row preview-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  loadSnapshot(selected);
                  setRoute("review");
                }}
              >
                Edit This CV
              </button>
              {selected.fileUrl ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => openStoredCv(selected)}
                >
                  Open Original PDF
                </button>
              ) : null}
            </div>
            <div className="json-grid">
              <div className="json-box">
                <strong>full name</strong>
                <p className="box-paragraph">
                  {selected.profile.candidate.fullName || "Not available"}
                </p>
              </div>
              <div className="json-box">
                <strong>suggested role</strong>
                <p className="box-paragraph">
                  {selected.profile.candidate.suggestedRole || "Not available"}
                </p>
              </div>
              <div className="json-box">
                <strong>skills</strong>
                <ul>
                  {renderItems(
                    selected.profile.extraction.skills,
                    "No skills detected",
                  )}
                </ul>
              </div>
              <div className="json-box">
                <strong>summary</strong>
                <p className="box-paragraph">
                  {selected.profile.candidate.summary || "No summary available"}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
};

const ProfilePage = ({
  user,
  currentProfile,
  cvHistory,
  selectedCvId,
  loadSnapshot,
  openStoredCv,
  onDeleteCv,
  deletingCvId,
  setRoute,
  onResetProfile,
  resettingProfile,
  saveMessage,
}) => {
  const selected =
    cvHistory.find((item) => item.id === selectedCvId) || cvHistory[0] || null;
  const leadSkills = currentProfile.extraction.skills?.slice(0, 8) || [];
  const profileSummary =
    currentProfile.candidate.summary ||
    "Upload and analyze a CV to build a richer profile summary.";

  return (
    <section className="page-stack profile-page">
      <article className="panel profile-hero-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Profile</p>
            <h2>Candidate Profile</h2>
          </div>
          <ParserBadge profile={currentProfile} />
        </div>

        <div className="profile-hero">
          <div className="profile-identity">
            <h3>{currentProfile.candidate.fullName || user?.name || "No active CV selected"}</h3>
            <p>{user?.email || currentProfile.candidate.email || "No email available"}</p>
            <strong>
              {currentProfile.candidate.currentRole || "Current role not detected"}
            </strong>
          </div>
          <div className="profile-hero-meta">
            <span>Last updated: {formatDateTime(currentProfile.lastUpdatedAt)}</span>
            <span>
              Source file: {currentProfile.lastCvFileName || "No uploaded file"}
            </span>
          </div>
        </div>

        <div className="json-grid profile-stat-grid">
          <div className="json-box compact-box">
            <strong>name</strong>
            <p>{user?.name || "Not available"}</p>
          </div>
          <div className="json-box compact-box">
            <strong>email</strong>
            <p>{user?.email || "Not available"}</p>
          </div>
          <div className="json-box compact-box">
            <strong>saved cv versions</strong>
            <p>{cvHistory.length}</p>
          </div>
          <div className="json-box compact-box">
            <strong>skills count</strong>
            <p>{currentProfile.extraction.skills?.length || 0}</p>
          </div>
          <div className="json-box compact-box">
            <strong>suggested role</strong>
            <p>{currentProfile.candidate.suggestedRole || "Not available"}</p>
          </div>
          <div className="json-box compact-box">
            <strong>experience</strong>
            <p>
              {currentProfile.candidate.experienceYears || 0} years -{" "}
              {currentProfile.candidate.experienceLevel || "Not classified"}
            </p>
          </div>
        </div>

        <div className="profile-focus-grid">
          <div className="json-box">
            <strong>summary</strong>
            <p className="box-paragraph">{profileSummary}</p>
          </div>
          <div className="json-box">
            <strong>top skills</strong>
            <ul>{renderItems(leadSkills, "No skills detected")}</ul>
          </div>
        </div>
      </article>

      <section className="page-grid profile-history-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Saved CVs</p>
              <h2>Upload History</h2>
            </div>
          </div>

          {cvHistory.length ? (
            <ul className="history-list">
              {cvHistory.map((item) => (
                <li key={item.id} className="history-row">
                  <button
                    className={
                      selected?.id === item.id
                        ? "history-item active"
                        : "history-item"
                    }
                    type="button"
                    onClick={() => loadSnapshot(item)}
                  >
                    <span>{item.fileName}</span>
                    <small>
                      {formatDateTime(item.uploadedAt)}
                      {item.storedFileSize
                        ? ` - ${formatBytes(item.storedFileSize)}`
                        : ""}
                    </small>
                    <ParserBadge profile={item.profile} />
                  </button>
                  <button
                    className="danger-button history-delete-button"
                    type="button"
                    onClick={() => onDeleteCv(item)}
                    disabled={deletingCvId === item.id}
                  >
                    {deletingCvId === item.id ? "Deleting..." : "Delete"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <p className="panel-kicker">Saved CVs</p>
              <h2>No saved CV uploads yet</h2>
              <p>Upload a CV from the dashboard and it will appear here.</p>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Preview</p>
              <h2>{selected?.fileName || "Snapshot"}</h2>
            </div>
          </div>

          {selected ? (
            <div className="json-summary">
              <ActiveCvBanner snapshot={selected} profile={selected.profile} />
              <div className="action-row preview-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    loadSnapshot(selected);
                    setRoute("review");
                  }}
                >
                  Edit This CV
                </button>
                {selected.fileUrl ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => openStoredCv(selected)}
                  >
                    Open Original PDF
                  </button>
                ) : null}
              </div>
              <div className="preview-header">
                <ParserBadge profile={selected.profile} />
              </div>
              <div className="json-grid">
                <div className="json-box">
                  <strong>full name</strong>
                  <p className="box-paragraph">
                    {selected.profile.candidate.fullName || "Not available"}
                  </p>
                </div>
                <div className="json-box">
                  <strong>suggested role</strong>
                  <p className="box-paragraph">
                    {selected.profile.candidate.suggestedRole || "Not available"}
                  </p>
                </div>
                <div className="json-box">
                  <strong>skills</strong>
                  <ul>
                    {renderItems(
                      selected.profile.extraction.skills,
                      "No skills detected",
                    )}
                  </ul>
                </div>
                <div className="json-box">
                  <strong>summary</strong>
                  <p className="box-paragraph">
                    {selected.profile.candidate.summary || "No summary available"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p>Select a saved CV to inspect its parsed profile.</p>
            </div>
          )}
        </article>
      </section>

      <article className="panel reset-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Danger Zone</p>
            <h2>Reset Profile Data</h2>
          </div>
        </div>

        <p className="lead">
          This deletes all saved CV versions and clears parsed profile data,
          metadata, skills, and extracted sections from your account.
        </p>

        <div className="footer-note reset-note">
          <p>
            This action cannot be undone. Original uploaded CV files and GridFS
            chunks linked to your saved snapshots will also be removed.
          </p>
        </div>

        <div className="action-row">
          <button
            className="danger-button"
            type="button"
            onClick={onResetProfile}
            disabled={resettingProfile}
          >
            {resettingProfile ? "Resetting..." : "Reset Profile"}
          </button>
        </div>

        {saveMessage ? <p className="save-message">{saveMessage}</p> : null}
      </article>
    </section>
  );
};

export default function App() {
  const fileInputRef = useRef(null);
  const [pathname, setPathname] = useState(() =>
    window.location.pathname || getPathForRoute("login"),
  );
  const [theme, setTheme] = useState(
    () => window.localStorage.getItem(THEME_STORAGE_KEY) || "dark",
  );
  const [currentFile, setCurrentFile] = useState(null);
  const [currentResponse, setCurrentResponse] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(emptyProfile);
  const [cvHistory, setCvHistory] = useState([]);
  const [selectedCvId, setSelectedCvId] = useState("");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(
    () => window.localStorage.getItem(AUTH_STORAGE_KEY) || "",
  );
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysisState, setAnalysisState] = useState("Waiting for login");
  const [connectionStatus, setConnectionStatus] = useState("Locked");
  const [apiUrl, setApiUrl] = useState("/api/profile/upload-cv");
  const [reviewVisible, setReviewVisible] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [resettingProfile, setResettingProfile] = useState(false);
  const [deletingCvId, setDeletingCvId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [dragActive, setDragActive] = useState(false);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const route = resolveRoute(pathname, token);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname || getPathForRoute("login"));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const canonicalPath = getPathForRoute(route);
    if (pathname !== canonicalPath) {
      window.history.replaceState({}, "", canonicalPath);
      setPathname(canonicalPath);
    }
  }, [route, pathname]);

  const setRoute = (nextRoute, options = {}) => {
    const nextPath = getPathForRoute(nextRoute);
    const method = options.replace ? "replaceState" : "pushState";

    if (window.location.pathname !== nextPath) {
      window.history[method]({}, "", nextPath);
    }

    setPathname(nextPath);
  };

  const applyServerState = (payload, sourceMessage, preferredCvId = "") => {
    const normalized = normalizeProfilePayload(payload);
    const fallbackCvId = normalized.cvs?.[0]?.id || "";
    const resolvedCvId =
      preferredCvId && normalized.cvs.some((item) => item.id === preferredCvId)
        ? preferredCvId
        : fallbackCvId;
    const selectedSnapshot =
      normalized.cvs.find((item) => item.id === resolvedCvId) || null;

    setCurrentResponse(payload);
    setCurrentProfile(selectedSnapshot?.profile || normalized.profile);
    setUser(normalized.user || null);
    setCvHistory(normalized.cvs || []);
    setSelectedCvId(resolvedCvId);
    setForm(
      buildFormFromProfile(selectedSnapshot?.profile || normalized.profile),
    );
    setReviewVisible(
      hasProfileContent(selectedSnapshot?.profile || normalized.profile),
    );
    setAnalysisState(sourceMessage);
    setConnectionStatus("Connected");
    setAnalysisError(null);
  };

  const loadProfile = async (authToken = token) => {
    if (!authToken) return;

    setLoading(true);
    setConnectionStatus("Loading");
    setAnalysisState("Loading saved profile...");

    try {
      const response = await fetch("/api/profile/me", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload?.message || payload?.error || "Failed to load profile";
        const error = new Error(message);
        error.statusCode = response.status;
        throw error;
      }

      applyServerState(
        payload,
        hasProfileContent(normalizeProfilePayload(payload).profile)
          ? "Saved profile loaded"
          : "Logged in. No CV saved yet",
      );
    } catch (error) {
      const isAuthFailure =
        error?.statusCode === 401 || error?.statusCode === 403;

      setConnectionStatus("Error");
      setAnalysisState(
        isAuthFailure ? "Authentication expired" : "Could not load profile",
      );
      setAnalysisError({
        title: isAuthFailure ? "Session Expired" : "Profile Load Error",
        message:
          error.message ||
          (isAuthFailure
            ? "Please login again."
            : "Could not load saved profile."),
      });

      if (isAuthFailure) {
        setToken("");
        setUser(null);
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        setRoute("login");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadProfile(token);
    }
  }, []);

  const updateField = (name, value) => {
    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const isSignup = route === "signup";
      const endpoint = isSignup ? "/api/auth/register" : "/api/auth/login";
      const payload = {
        email: authForm.email.trim(),
        password: authForm.password,
      };

      if (isSignup) {
        payload.name = authForm.name.trim();
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || "Authentication request failed");
      }

      if (!data?.token) {
        throw new Error("Authentication token missing from server response");
      }

      setToken(data.token);
      window.localStorage.setItem(AUTH_STORAGE_KEY, data.token);
      setAuthForm({ name: "", email: "", password: "" });
      applyServerState(data, isSignup ? "Account created" : "Login successful");
      setRoute("dashboard");
    } catch (error) {
      setAuthError(error.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken("");
    setUser(null);
    setCurrentFile(null);
    setCurrentResponse(null);
    setCurrentProfile(emptyProfile);
    setCvHistory([]);
    setSelectedCvId("");
    setForm(emptyForm);
    setReviewVisible(false);
    setAnalysisState("Waiting for login");
    setConnectionStatus("Locked");
    setAnalysisError(null);
    setSaveMessage("");
    setDeletingCvId("");
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setRoute("login");
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
    setConnectionStatus(token ? "Ready" : "Locked");
  };

  const handleAnalyze = async () => {
    if (!token) {
      setAnalysisError({
        title: "Authentication Required",
        message: "Login or create an account before uploading a CV.",
      });
      setConnectionStatus("Locked");
      setRoute("login");
      return;
    }

    if (!currentFile) {
      setAnalysisState("Upload a PDF file first");
      setConnectionStatus("Error");
      setAnalysisError({
        title: "No File Selected",
        message: "Choose a CV file first, then click Analyze.",
      });
      return;
    }

    setLoading(true);
    setAnalysisState("Analyzing and saving CV...");
    setConnectionStatus("Processing");
    setAnalysisError(null);
    setSaveMessage("");

    try {
      const formData = new FormData();
      formData.append("cv", currentFile);

      const response = await fetch(apiUrl.trim(), {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const serverMessage =
          payload?.message ||
          payload?.error ||
          payload?.detail ||
          "Unknown error";
        throw new Error(
          `Request failed with status ${response.status}: ${serverMessage}`,
        );
      }

      applyServerState(payload, "CV analyzed and saved to your profile");
      setSaveMessage("Saved to Mongo profile");
    } catch (error) {
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
          "Make sure you are logged in before uploading.",
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!token) {
      setSaveMessage("Login required");
      return;
    }

    setSavingProfile(true);
    setSaveMessage("");

    try {
      const targetUrl = selectedCvId
        ? `/api/profile/cvs/${selectedCvId}`
        : "/api/profile/me";

      const response = await fetch(targetUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          profile: buildProfileFromForm(form, currentProfile),
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to save profile");
      }

      applyServerState(payload, "Profile updated and saved", selectedCvId);
      setSaveMessage(
        selectedCvId
          ? "Saved changes to the selected CV"
          : "Profile changes saved",
      );
    } catch (error) {
      setSaveMessage(error.message || "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleResetProfile = async () => {
    if (!token) {
      setSaveMessage("Login required");
      return;
    }

    const confirmed = window.confirm(
      "Reset profile and delete all saved CV versions? This cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    setResettingProfile(true);
    setSaveMessage("");

    try {
      const response = await fetch("/api/profile/reset", {
        method: "DELETE",
        headers: authHeaders,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to reset profile");
      }

      applyServerState(payload, "Profile reset to empty state");
      setCurrentFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSaveMessage(
        "Profile reset completed. Previous CV versions were deleted.",
      );
      setRoute("profile");
    } catch (error) {
      setSaveMessage(error.message || "Failed to reset profile");
    } finally {
      setResettingProfile(false);
    }
  };

  const handleDeleteCv = async (snapshot) => {
    if (!token || !snapshot?.id) {
      setSaveMessage("Login required");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${snapshot.fileName}" from saved CV uploads? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingCvId(snapshot.id);
    setSaveMessage("");

    try {
      const response = await fetch(`/api/profile/cvs/${snapshot.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to delete saved CV");
      }

      const nextPreferredCvId =
        selectedCvId === snapshot.id ? "" : selectedCvId;

      applyServerState(
        payload,
        `Deleted saved CV: ${snapshot.fileName}`,
        nextPreferredCvId,
      );
      setSaveMessage(`Deleted saved CV: ${snapshot.fileName}`);
      setRoute("profile");
    } catch (error) {
      setSaveMessage(error.message || "Failed to delete saved CV");
    } finally {
      setDeletingCvId("");
    }
  };

  const openStoredCv = async (snapshot) => {
    if (!snapshot?.fileUrl) {
      setSaveMessage("Stored PDF is not available for this CV");
      return;
    }

    try {
      const response = await fetch(snapshot.fileUrl, {
        headers: authHeaders,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "Failed to open stored PDF");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setSaveMessage(error.message || "Failed to open stored PDF");
    }
  };

  const handleExport = () => {
    const payload = {
      status: "success",
      data: {
        user,
        profile: buildProfileFromForm(form, currentProfile),
        cvs: cvHistory,
      },
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

  const openPicker = () => {
    if (!token) {
      setAnalysisError({
        title: "Authentication Required",
        message: "Login first, then upload a CV.",
      });
      setRoute("login");
      return;
    }

    fileInputRef.current?.click();
  };

  const clearFile = () => {
    setCurrentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setAnalysisState("File removed");
    setConnectionStatus(token ? "Connected" : "Locked");
    setAnalysisError(null);
  };

  const resetForm = () => {
    setForm(buildFormFromProfile(currentProfile));
  };

  const loadSnapshot = (snapshot) => {
    setSelectedCvId(snapshot.id);
    setCurrentProfile(snapshot.profile);
    setForm(buildFormFromProfile(snapshot.profile));
    setReviewVisible(true);
    setAnalysisState(`Loaded saved CV: ${snapshot.fileName}`);
  };

  let page = null;

  if (!token) {
    page = (
      <GuestPage
        route={route}
        authForm={authForm}
        setAuthForm={setAuthForm}
        authLoading={authLoading}
        authError={authError}
        onSubmit={handleAuthSubmit}
      />
    );
  } else if (route === "review") {
    page = (
      <ReviewPage
        form={form}
        updateField={updateField}
        handleSaveProfile={handleSaveProfile}
        savingProfile={savingProfile}
        resetForm={resetForm}
        handleExport={handleExport}
        saveMessage={saveMessage}
        reviewVisible={reviewVisible}
        currentSnapshot={
          cvHistory.find((item) => item.id === selectedCvId) || null
        }
        openStoredCv={openStoredCv}
      />
    );
  } else if (route === "profile") {
    page = (
      <ProfilePage
        user={user}
        currentProfile={currentProfile}
        cvHistory={cvHistory}
        selectedCvId={selectedCvId}
        loadSnapshot={loadSnapshot}
        openStoredCv={openStoredCv}
        onDeleteCv={handleDeleteCv}
        deletingCvId={deletingCvId}
        setRoute={setRoute}
        onResetProfile={handleResetProfile}
        resettingProfile={resettingProfile}
        saveMessage={saveMessage}
      />
    );
  } else {
    page = (
      <DashboardPage
        token={token}
        currentFile={currentFile}
        fileInputRef={fileInputRef}
        dragActive={dragActive}
        setDragActive={setDragActive}
        handleFile={handleFile}
        openPicker={openPicker}
        clearFile={clearFile}
        formatBytesValue={formatBytes}
        apiUrl={apiUrl}
        setApiUrl={setApiUrl}
        handleAnalyze={handleAnalyze}
        loading={loading}
        connectionStatus={connectionStatus}
        analysisState={analysisState}
        analysisError={analysisError}
        currentProfile={currentProfile}
        currentResponse={currentResponse}
        cvHistory={cvHistory}
        selectedCvId={selectedCvId}
        loadSnapshot={loadSnapshot}
        setRoute={setRoute}
        saveMessage={saveMessage}
      />
    );
  }

  return (
    <div className="app-frame">
      <Navigation
        token={token}
        route={route}
        setRoute={setRoute}
        user={user}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={() =>
          setTheme((previous) => (previous === "dark" ? "light" : "dark"))
        }
      />
      <main className="app-shell">{page}</main>
    </div>
  );
}
