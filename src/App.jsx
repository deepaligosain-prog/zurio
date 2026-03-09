// src/App.jsx — Zurio with Google Auth

import { useState, useEffect, useRef } from "react";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;

async function extractTextFromFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "txt") {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = () => rej(new Error("Could not read file"));
      r.readAsText(file);
    });
  }
  if (ext === "docx" || ext === "doc") {
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    if (!result.value || result.value.trim().length < 30) throw new Error("Could not extract text from this Word file. Please paste your resume as text instead.");
    return result.value.trim();
  }
  if (ext === "pdf") {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(s => s.str).join(" ") + "\n";
    }
    if (text.trim().length < 30) throw new Error("Could not extract text from this PDF. Please paste your resume as text instead.");
    return text.trim();
  }
  throw new Error("Unsupported file type. Please upload PDF, DOCX, or TXT.");
}

const style = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Mono:wght@300;400;500&family=Instrument+Sans:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --cream: #F4EFE6; --ink: #1C1917; --ink-light: #44403C; --ink-muted: #78716C;
    --amber: #D97706; --amber-light: #FEF3C7; --green: #15803D; --green-light: #DCFCE7;
    --blue: #1D4ED8; --blue-light: #DBEAFE; --border: rgba(28,25,23,0.12);
    --shadow: 0 1px 3px rgba(28,25,23,0.08), 0 4px 16px rgba(28,25,23,0.06);
    --shadow-lg: 0 8px 32px rgba(28,25,23,0.14);
  }
  body { background: var(--cream); font-family: 'Instrument Sans', sans-serif; color: var(--ink); min-height: 100vh; }
  .serif { font-family: 'Fraunces', serif; } .mono { font-family: 'DM Mono', monospace; }
  .top-nav { padding: 18px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); background: var(--cream); position: sticky; top: 0; z-index: 10; }
  .nav-wordmark { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 300; cursor: pointer; }
  .nav-wordmark span { color: var(--amber); }
  .nav-user { display: flex; align-items: center; gap: 10px; }
  .nav-avatar { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; }
  .nav-name { font-size: 13px; color: var(--ink-muted); }
  .nav-signout { font-size: 12px; font-family: 'DM Mono', monospace; color: var(--ink-muted); cursor: pointer; background: none; border: none; text-transform: uppercase; letter-spacing: 0.08em; padding: 0; }
  .nav-signout:hover { color: var(--ink); }
  .nav-tabs { display: flex; gap: 4px; }
  .nav-tab { font-size: 12px; font-family: 'DM Mono', monospace; cursor: pointer; background: none; border: 1.5px solid var(--border); border-radius: 8px; padding: 5px 14px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.08em; transition: all 0.15s; }
  .nav-tab:hover { border-color: var(--amber); color: var(--amber); }
  .nav-tab.active-amber { background: var(--amber-light); border-color: var(--amber); color: var(--amber); font-weight: 600; }
  .nav-tab.active-blue { background: var(--blue-light); border-color: var(--blue); color: var(--blue); font-weight: 600; }

  /* Login screen */
  .login-page { max-width: 440px; margin: 0 auto; padding: 100px 24px 80px; text-align: center; }
  .login-logo { font-family: 'Fraunces', serif; font-size: 42px; font-weight: 300; margin-bottom: 12px; }
  .login-logo span { color: var(--amber); }
  .login-tagline { font-size: 16px; color: var(--ink-muted); line-height: 1.6; margin-bottom: 48px; max-width: 320px; margin-left: auto; margin-right: auto; }
  .google-btn { display: inline-flex; align-items: center; gap: 12px; padding: 13px 24px; background: white; border: 1.5px solid var(--border); border-radius: 12px; font-size: 15px; font-weight: 600; color: var(--ink); cursor: pointer; transition: all 0.18s; text-decoration: none; box-shadow: var(--shadow); }
  .google-btn:hover { box-shadow: var(--shadow-lg); transform: translateY(-1px); border-color: rgba(28,25,23,0.2); }
  .google-icon { width: 20px; height: 20px; }
  .login-note { font-size: 12px; color: var(--ink-muted); margin-top: 20px; line-height: 1.6; }

  /* Role picker */
  .role-page { max-width: 560px; margin: 0 auto; padding: 80px 24px; text-align: center; }
  .role-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 40px; }
  @media (max-width: 480px) { .role-grid { grid-template-columns: 1fr; } }
  .role-card { background: white; border: 2px solid var(--border); border-radius: 16px; padding: 32px 24px; cursor: pointer; transition: all 0.2s; text-align: center; }
  .role-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
  .role-card.reviewer:hover { border-color: var(--amber); }
  .role-card.candidate:hover { border-color: var(--blue); }
  .role-icon { font-size: 36px; margin-bottom: 14px; }
  .role-title { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 400; margin-bottom: 8px; }
  .role-desc { font-size: 13px; color: var(--ink-muted); line-height: 1.55; }

  /* Candidate status */
  .status-page { max-width: 640px; margin: 0 auto; padding: 48px 24px 80px; }
  .status-card { background: white; border: 1.5px solid var(--border); border-radius: 16px; padding: 28px; margin-top: 24px; box-shadow: var(--shadow); }
  .status-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }

  /* Common */
  .landing { max-width: 900px; margin: 0 auto; padding: 60px 24px 80px; }
  .landing-header { text-align: center; margin-bottom: 60px; }
  .wordmark { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--amber); margin-bottom: 24px; }
  .landing-title { font-family: 'Fraunces', serif; font-size: clamp(36px,6vw,64px); font-weight: 300; line-height: 1.08; margin-bottom: 20px; }
  .landing-title em { font-style: italic; color: var(--amber); }
  .landing-subtitle { font-size: 17px; color: var(--ink-muted); line-height: 1.65; max-width: 480px; margin: 0 auto; }
  .path-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 48px; }
  @media (max-width: 600px) { .path-grid { grid-template-columns: 1fr; } }
  .path-card { background: white; border: 1.5px solid var(--border); border-radius: 18px; padding: 36px 30px; cursor: pointer; transition: all 0.22s ease; text-align: left; position: relative; overflow: hidden; }
  .path-card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; }
  .path-card.reviewer::before { background: var(--amber); }
  .path-card.candidate::before { background: var(--blue); }
  .path-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: transparent; }
  .path-icon { font-size: 30px; margin-bottom: 16px; }
  .path-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-muted); margin-bottom: 8px; }
  .path-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 400; margin-bottom: 10px; }
  .path-desc { font-size: 14px; color: var(--ink-muted); line-height: 1.6; }
  .path-cta { margin-top: 20px; font-size: 13px; font-weight: 600; display: inline-block; }
  .reviewer .path-cta { color: var(--amber); } .candidate .path-cta { color: var(--blue); }
  .stats-row { display: flex; gap: 40px; justify-content: center; flex-wrap: wrap; }
  .stat { text-align: center; }
  .stat-num { font-family: 'Fraunces', serif; font-size: 34px; font-weight: 300; }
  .stat-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-muted); margin-top: 2px; }
  .form-page { max-width: 560px; margin: 0 auto; padding: 48px 24px 80px; }
  .back-btn { display: inline-flex; align-items: center; gap: 6px; font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-muted); cursor: pointer; margin-bottom: 40px; background: none; border: none; padding: 0; }
  .back-btn:hover { color: var(--ink); }
  .form-eyebrow { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 12px; }
  .form-eyebrow.amber { color: var(--amber); } .form-eyebrow.blue { color: var(--blue); }
  .form-heading { font-family: 'Fraunces', serif; font-size: 34px; font-weight: 300; line-height: 1.15; margin-bottom: 8px; }
  .form-subheading { font-size: 15px; color: var(--ink-muted); margin-bottom: 36px; line-height: 1.6; }
  .field { margin-bottom: 20px; }
  .field label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; color: var(--ink-light); margin-bottom: 6px; text-transform: uppercase; }
  .field input, .field textarea, .field select { width: 100%; background: white; border: 1.5px solid var(--border); border-radius: 10px; padding: 12px 14px; font-size: 15px; font-family: 'Instrument Sans', sans-serif; color: var(--ink); outline: none; transition: border-color 0.15s, box-shadow 0.15s; resize: none; }
  .field input:focus, .field textarea:focus, .field select:focus { border-color: var(--amber); box-shadow: 0 0 0 3px rgba(217,119,6,0.1); }
  .field textarea { line-height: 1.55; }
  .upload-zone { border: 2px dashed var(--border); border-radius: 12px; padding: 28px 20px; text-align: center; cursor: pointer; transition: all 0.18s; background: white; }
  .upload-zone:hover, .upload-zone.drag-over { border-color: var(--blue); background: var(--blue-light); }
  .upload-zone.has-file { border-color: var(--green); background: var(--green-light); border-style: solid; }
  .upload-icon { font-size: 28px; margin-bottom: 8px; }
  .upload-label { font-size: 14px; font-weight: 600; color: var(--ink-light); margin-bottom: 4px; }
  .upload-sub { font-size: 12px; color: var(--ink-muted); }
  .upload-filename { font-size: 13px; font-weight: 600; color: var(--green); margin-top:6px; }
  .resume-tabs { display: flex; gap: 0; margin-bottom: 8px; border: 1.5px solid var(--border); border-radius: 8px; overflow: hidden; }
  .resume-tab { flex: 1; padding: 8px; font-size: 12px; font-weight: 600; font-family: 'DM Mono', monospace; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; background: white; border: none; color: var(--ink-muted); transition: all 0.14s; }
  .resume-tab.active { background: var(--ink); color: white; }
  .two-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { padding: 7px 14px; border-radius: 999px; border: 1.5px solid var(--border); background: white; font-size: 13px; cursor: pointer; transition: all 0.14s; color: var(--ink-light); font-family: 'Instrument Sans', sans-serif; }
  .chip.active-amber { background: var(--amber-light); border-color: var(--amber); color: var(--amber); font-weight: 600; }
  .chip.active-blue { background: var(--blue-light); border-color: var(--blue); color: var(--blue); font-weight: 600; }
  .submit-btn { width: 100%; padding: 15px; border-radius: 12px; border: none; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.18s; font-family: 'Instrument Sans', sans-serif; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .submit-btn.amber { background: var(--amber); color: white; }
  .submit-btn.blue { background: var(--blue); color: white; }
  .submit-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
  .submit-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
  .thankyou-page { max-width: 500px; margin: 0 auto; padding: 80px 24px; text-align: center; }
  .big-icon { font-size: 56px; margin-bottom: 24px; }
  .thankyou-title { font-family: 'Fraunces', serif; font-size: 32px; font-weight: 300; margin-bottom: 12px; }
  .thankyou-sub { font-size: 16px; color: var(--ink-muted); line-height: 1.65; margin-bottom: 32px; }
  .dashboard { max-width: 820px; margin: 0 auto; padding: 48px 24px 80px; }
  .dash-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; flex-wrap: wrap; gap: 16px; }
  .dash-title { font-family: 'Fraunces', serif; font-size: 30px; font-weight: 300; }
  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 999px; font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 500; }
  .badge.amber { background: var(--amber-light); color: var(--amber); }
  .badge.green { background: var(--green-light); color: var(--green); }
  .badge.blue { background: var(--blue-light); color: var(--blue); }
  .section-label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-muted); margin-bottom: 16px; }
  .match-card { background: white; border: 1.5px solid var(--border); border-radius: 16px; padding: 28px; margin-bottom: 20px; box-shadow: var(--shadow); }
  .match-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
  .match-names { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Fraunces', serif; font-size: 16px; flex-shrink: 0; }
  .avatar.amber-bg { background: var(--amber-light); color: var(--amber); }
  .avatar.blue-bg { background: var(--blue-light); color: var(--blue); }
  .avatar img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; }
  .name-block strong { font-size: 14px; font-weight: 600; display: block; }
  .name-block span { font-size: 12px; color: var(--ink-muted); }
  .match-arrow { color: var(--border); font-size: 20px; }
  .rationale-box { background: var(--cream); border-left: 3px solid var(--amber); border-radius: 0 10px 10px 0; padding: 12px 16px; margin-bottom: 20px; }
  .rationale-label { font-family: 'DM Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--amber); margin-bottom: 5px; }
  .rationale-text { font-size: 13px; color: var(--ink-light); line-height: 1.65; }
  .action-btn { padding: 10px 18px; border-radius: 8px; border: 1.5px solid transparent; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: 'Instrument Sans', sans-serif; }
  .action-btn.amber-btn { background: var(--amber); color: white; border-color: var(--amber); }
  .action-btn.blue-btn { background: var(--blue); color: white; border-color: var(--blue); }
  .action-btn.outline { background: white; border-color: var(--border); color: var(--ink-light); }
  .action-btn:hover { opacity: 0.85; }
  .review-page { max-width: 920px; margin: 0 auto; padding: 48px 24px 80px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; }
  @media (max-width: 720px) { .two-col { grid-template-columns: 1fr; } }
  .panel { background: white; border: 1.5px solid var(--border); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
  .panel-header { padding: 14px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
  .panel-title { font-family: 'DM Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-muted); }
  .panel-body { padding: 20px; flex: 1; display: flex; flex-direction: column; }
  .resume-text { font-size: 12.5px; color: var(--ink-light); line-height: 1.8; white-space: pre-wrap; max-height: 440px; overflow-y: auto; }
  .feedback-textarea { width: 100%; flex: 1; min-height: 200px; border: none; outline: none; font-size: 14px; font-family: 'Instrument Sans', sans-serif; color: var(--ink); line-height: 1.7; resize: none; background: transparent; }
  .ai-btn { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; border: 1.5px solid var(--border); background: var(--cream); font-size: 12px; font-weight: 500; cursor: pointer; color: var(--ink-light); transition: all 0.14s; font-family: 'Instrument Sans', sans-serif; }
  .ai-btn:hover { border-color: var(--amber); color: var(--amber); background: var(--amber-light); }
  .ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .ai-suggestion { background: var(--amber-light); border: 1px dashed var(--amber); border-radius: 10px; padding: 14px 16px; margin-top: 12px; }
  .ai-suggestion-label { font-family: 'DM Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--amber); margin-bottom: 8px; }
  .ai-suggestion-text { font-size: 13px; color: var(--ink-light); line-height: 1.7; white-space: pre-wrap; }
  .panel-footer { padding: 12px 20px; border-top: 1px solid var(--border); flex-shrink: 0; }
  .error-banner { background: #FEE2E2; border: 1px solid #FECACA; border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #B91C1C; margin-bottom: 16px; line-height: 1.55; }
  .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.35); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
  .spinner.dark { border-color: rgba(28,25,23,0.2); border-top-color: var(--amber); }
  @keyframes spin { to { transform: rotate(360deg); } }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .feedback-body { font-size: 15px; color: var(--ink-light); line-height: 1.8; white-space: pre-wrap; }
  .divider { height: 1px; background: var(--border); margin: 20px 0; }
`;

const API_BASE = import.meta.env.VITE_API_URL || "";

const EXPERTISE_AREAS = [
  "Software Engineering","Product Management","Data Science","Design",
  "Marketing","Finance","Operations","Sales","People & HR","Legal",
  "Executive Leadership","AI/ML",
];

// ─── API helpers ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Components ───────────────────────────────────────────────────────────────

function TopNav({ user, onHome, onSignOut, onTabSelect, currentView }) {
  const isReviewer = currentView === "reviewer-dashboard" || currentView === "reviewer-setup";
  const isCandidate = currentView === "candidate-status" || currentView === "candidate-setup";
  return (
    <nav className="top-nav">
      <div className="nav-wordmark" onClick={onHome}>Zurio</div>
      {user ? (
        <div className="nav-user">
          <div className="nav-tabs">
            <button
              className={`nav-tab ${isReviewer ? "active-amber" : ""}`}
              onClick={() => onTabSelect("reviewer")}
            >Reviewer</button>
            <button
              className={`nav-tab ${isCandidate ? "active-blue" : ""}`}
              onClick={() => onTabSelect("candidate")}
            >Candidate</button>
          </div>
          {user.picture
            ? <img className="nav-avatar" src={user.picture} alt={user.name} referrerPolicy="no-referrer" />
            : <div className="avatar amber-bg" style={{width:30,height:30,fontSize:13}}>{user.name?.[0]}</div>
          }
          <span className="nav-name">{user.name?.split(" ")[0]}</span>
          <button className="nav-signout" onClick={onSignOut}>Sign out</button>
        </div>
      ) : (
        <span className="mono" style={{fontSize:10,color:"var(--ink-muted)",letterSpacing:"0.12em"}}>BETA</span>
      )}
    </nav>
  );
}

function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" or "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!email.trim()) { setError("Please enter your email."); return; }
    if (!password) { setError("Please enter your password."); return; }
    if (mode === "register") {
      if (!name.trim()) { setError("Please enter your name."); return; }
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    }
    setLoading(true);
    try {
      if (mode === "register") {
        const { user } = await api("POST", "/auth/register", { name, email, password });
        onLogin(user);
      } else {
        const { user } = await api("POST", "/auth/login", { email, password });
        onLogin(user);
      }
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const onKey = e => e.key === "Enter" && handleSubmit();

  return (
    <div className="login-page">
      <div className="login-logo">Zurio</div>
      <p className="login-tagline">Real resume feedback from people who've been in your shoes — matched by field and experience.</p>
      {error && <div className="error-banner" style={{marginBottom:16}}>{error}</div>}
      <div style={{display:"flex",gap:0,marginBottom:20,background:"var(--cream)",borderRadius:10,padding:3,width:"100%",maxWidth:340}}>
        <button onClick={()=>{setMode("login");setError("");}} style={{flex:1,padding:"8px 0",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:mode==="login"?"white":"transparent",color:mode==="login"?"var(--ink)":"var(--ink-muted)",boxShadow:mode==="login"?"var(--shadow)":"none",transition:"all 0.18s"}}>Sign In</button>
        <button onClick={()=>{setMode("register");setError("");}} style={{flex:1,padding:"8px 0",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:mode==="register"?"white":"transparent",color:mode==="register"?"var(--ink)":"var(--ink-muted)",boxShadow:mode==="register"?"var(--shadow)":"none",transition:"all 0.18s"}}>Create Account</button>
      </div>
      {mode === "register" && (
        <div className="field" style={{width:"100%",maxWidth:340,textAlign:"left"}}>
          <label>Your name</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Deepali Gosain" onKeyDown={onKey} />
        </div>
      )}
      <div className="field" style={{width:"100%",maxWidth:340,textAlign:"left",marginTop:12}}>
        <label>Email address</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={onKey} />
      </div>
      <div className="field" style={{width:"100%",maxWidth:340,textAlign:"left",marginTop:12}}>
        <label>Password</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==="register"?"Min 6 characters":"Enter password"} onKeyDown={onKey} />
      </div>
      {mode === "register" && (
        <div className="field" style={{width:"100%",maxWidth:340,textAlign:"left",marginTop:12}}>
          <label>Confirm password</label>
          <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Re-enter password" onKeyDown={onKey} />
        </div>
      )}
      <button className="submit-btn amber" style={{marginTop:20,width:"100%",maxWidth:340}} onClick={handleSubmit} disabled={loading}>
        {loading ? <><span className="spinner"/>{mode==="register"?"Creating account...":"Signing in..."}</> : mode==="register"?"Create Account →":"Sign In →"}
      </button>
      <p className="login-note">Free to use. Your resume data is private and only shared with your matched reviewer.</p>
    </div>
  );
}

function RolePicker({ user, onRoleSet }) {
  const [loading, setLoading] = useState(false);

  const pick = async (role) => {
    setLoading(role);
    await api("POST", "/api/me/role", { role });
    onRoleSet(role);
    setLoading(false);
  };

  const hasReviewer = !!user?.reviewer_id;
  const hasCandidate = !!user?.candidate_id;

  return (
    <div className="role-page">
      <div style={{fontSize:13,color:"var(--ink-muted)",marginBottom:10}}>Welcome, {user.name?.split(" ")[0]} 👋</div>
      <h1 className="form-heading serif" style={{textAlign:"center"}}>
        {hasReviewer || hasCandidate ? "Join as the other role too?" : "How are you using Zurio?"}
      </h1>
      <p style={{fontSize:15,color:"var(--ink-muted)",marginTop:8,textAlign:"center"}}>You can be both a reviewer and a candidate.</p>
      <div className="role-grid">
        {!hasReviewer && (
          <div className="role-card reviewer" onClick={() => !loading && pick("reviewer")}>
            <div className="role-icon">🎓</div>
            <div className="role-title">I'm a Reviewer</div>
            <p className="role-desc">I have experience to share and want to give feedback on resumes.</p>
            {loading === "reviewer" && <div style={{marginTop:12}}><span className="spinner dark" style={{width:14,height:14}}/></div>}
          </div>
        )}
        {!hasCandidate && (
          <div className="role-card candidate" onClick={() => !loading && pick("candidate")}>
            <div className="role-icon">📄</div>
            <div className="role-title">I'm a Candidate</div>
            <p className="role-desc">I'm job searching and want an expert to review my resume.</p>
            {loading === "candidate" && <div style={{marginTop:12}}><span className="spinner dark" style={{width:14,height:14}}/></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewerSignup({ user, onDone }) {
  const [form, setForm] = useState({
    name: user?.name || "", role:"", company:"", years:"", areas:[], resumeText:""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  // On mount: fetch most recent candidate submission resume and pre-fill
  useEffect(() => {
    api("GET", "/api/candidates/mine").then(d => {
      const subs = d.submissions;
      if (!subs?.length) return;
      const resume = subs[subs.length - 1]?.candidate?.resume;
      if (!resume) return;
      setForm(f => ({ ...f, resumeText: resume }));
      setFileName("Pre-filled from your candidate submission");
    }).catch(() => {}); // silently skip if endpoint not available
  }, []);

  const toggleArea = (a) => setForm(f => ({ ...f, areas: f.areas.includes(a) ? f.areas.filter(x=>x!==a) : [...f.areas,a] }));
  const valid = form.name && form.role && form.company && form.years && form.areas.length > 0;

  const [extracting, setExtracting] = useState(false);

  const readFile = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf","doc","docx","txt"].includes(ext)) { setError("Please upload a PDF, Word (.docx), or .txt file."); return; }
    setError(""); setFileName(file.name);
    try {
      const text = await extractTextFromFile(file);
      setForm(f => ({ ...f, resumeText: text }));
      // Auto-fill form fields from resume via AI
      setExtracting(true);
      try {
        const info = await api("POST", "/api/extract-resume-info", { resumeText: text });
        setForm(f => ({
          ...f,
          role: f.role || info.role || "",
          company: f.company || info.company || "",
          years: f.years || info.years || "",
          areas: f.areas.length > 0 ? f.areas : (info.areas || []),
        }));
      } catch(e) { /* silently skip auto-fill on error */ }
      setExtracting(false);
    } catch(e) {
      setError(e.message);
    }
  };

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      const { reviewer } = await api("POST", "/api/reviewers", form);
      onDone(reviewer);
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="form-page">
      <div className="form-eyebrow amber">Reviewer profile</div>
      <h1 className="form-heading">Tell us about<br/>your experience</h1>
      <p className="form-subheading">This helps us match you with the right candidates. Takes ~10 min per review.</p>
      {error && <div className="error-banner">{error}</div>}
      <div className="field"><label>Full name</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
      <div className="two-inputs">
        <div className="field"><label>Current role</label><input value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} placeholder="Senior Engineer" /></div>
        <div className="field"><label>Company</label><input value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))} placeholder="Acme Corp" /></div>
      </div>
      <div className="field">
        <label>Years of experience</label>
        <select value={form.years} onChange={e=>setForm(f=>({...f,years:e.target.value}))}>
          <option value="">Select range...</option>
          {["1–3","4–6","7–10","10–15","15+"].map(y=><option key={y} value={y}>{y} years</option>)}
        </select>
      </div>
      <div className="field">
        <label>Areas you can review</label>
        <div className="chip-row" style={{marginTop:6}}>
          {EXPERTISE_AREAS.map(a=>(
            <button key={a} className={`chip ${form.areas.includes(a)?"active-amber":""}`} onClick={()=>toggleArea(a)}>{a}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Resume or LinkedIn PDF <span style={{color:"var(--ink-muted)",fontWeight:400}}>(optional — improves matching)</span></label>
        {form.resumeText && fileName.startsWith("Pre-filled") && (
          <div style={{background:"var(--cream)",border:"1px solid var(--amber)",borderRadius:8,padding:"8px 12px",fontSize:13,color:"var(--ink-muted)",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
            <span>✦</span>
            <span>Pre-filled from your candidate submission — upload a different file to replace it.</span>
          </div>
        )}
        <div
          className={`upload-zone ${dragOver?"drag-over":""} ${fileName?"has-file":""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e=>{e.preventDefault();setDragOver(true);}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);readFile(e.dataTransfer.files[0]);}}
        >
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{display:"none"}} onChange={e=>readFile(e.target.files[0])} />
          {fileName ? (
            <>
              <div className="upload-icon">✅</div>
              <div className="upload-label">File loaded</div>
              <div className="upload-filename">{fileName}</div>
              <div className="upload-sub" style={{marginTop:6}}>Click to replace</div>
            </>
          ) : (
            <>
              <div className="upload-icon">📎</div>
              <div className="upload-label">Drop your resume or LinkedIn PDF here</div>
              <div className="upload-sub">PDF, Word (.docx), or .txt · Click to browse · Optional</div>
            </>
          )}
        </div>
      </div>

      {extracting && <div style={{textAlign:"center",color:"var(--amber)",fontSize:13,marginBottom:8}}><span className="spinner dark" style={{width:12,height:12,marginRight:6}}/>Auto-filling from your resume...</div>}
      <button className="submit-btn amber" onClick={handleSubmit} disabled={!valid||loading||extracting}>
        {loading ? <><span className="spinner"/>Saving...</> : "Complete Reviewer Profile →"}
      </button>
    </div>
  );
}

function CandidateSignup({ user, onDone }) {
  const reviewerResume = user?.reviewer?.resumeText || "";
  const [form, setForm] = useState({
    name: user?.name || "", email: user?.email || "",
    targetRole:"", targetArea:"", resume: reviewerResume, label: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resumeTab, setResumeTab] = useState(reviewerResume ? "paste" : "upload");
  const [fileName, setFileName] = useState(reviewerResume ? "Pre-filled from your reviewer profile" : "");
  const [dragOver, setDragOver] = useState(false);
  const [labelEdited, setLabelEdited] = useState(false);
  const fileRef = useRef(null);

  // Auto-generate label from targetRole unless user has manually edited it
  const autoLabel = form.targetRole ? `${form.targetRole} Resume` : "";

  const valid = form.name && form.email && form.targetRole && form.targetArea && form.resume.trim().length > 50;

  const [fileData, setFileData] = useState(null); // { base64, type, name }

  const readFile = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf","doc","docx","txt"].includes(ext)) {
      setError("Please upload a PDF, Word (.docx), or .txt file.");
      return;
    }
    setError(""); setFileName(file.name);
    try {
      const text = await extractTextFromFile(file);
      setForm(f => ({ ...f, resume: text }));
      // Also read file as base64 for storage
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(",")[1]; // strip data:...;base64, prefix
        setFileData({ base64, type: file.type || "application/octet-stream", name: file.name });
      };
      reader.readAsDataURL(file);
    } catch(e) {
      setError(e.message);
      setResumeTab("paste");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    readFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      const payload = { ...form, label: (labelEdited && form.label) ? form.label : autoLabel };
      if (fileData) { payload.fileBase64 = fileData.base64; payload.fileType = fileData.type; payload.fileName = fileData.name; }
      const result = await api("POST", "/api/candidates", payload);
      if (result.redactions?.length > 0) {
        const types = [...new Set(result.redactions.map(r => r.type))];
        alert(`For your privacy, we automatically redacted ${result.redactions.length} item(s) from your resume: ${types.join(", ")}. Your original file is preserved but the text shared with reviewers has PII removed.`);
      }
      onDone(result);
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="form-page">
      <div className="form-eyebrow blue">Candidate profile</div>
      <h1 className="form-heading">Submit your resume<br/>for review</h1>
      <p className="form-subheading">We'll match you with a volunteer in your target field. Expect feedback within 48 hours.</p>
      {error && <div className="error-banner">{error}</div>}
      <div className="field"><label>Full name</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
      <div className="field"><label>Email address</label><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></div>
      <div className="two-inputs">
        <div className="field"><label>Target role</label><input value={form.targetRole} onChange={e=>setForm(f=>({...f,targetRole:e.target.value}))} placeholder="e.g. Staff Engineer" /></div>
        <div className="field">
          <label>Field / Area</label>
          <select value={form.targetArea} onChange={e=>setForm(f=>({...f,targetArea:e.target.value}))}>
            <option value="">Select...</option>
            {EXPERTISE_AREAS.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Submission label <span style={{fontWeight:400,color:"var(--ink-muted)"}}>— optional, helps you tell submissions apart</span></label>
        <input
          value={labelEdited ? form.label : autoLabel}
          onChange={e=>{ setLabelEdited(true); setForm(f=>({...f,label:e.target.value})); }}
          placeholder={autoLabel || "e.g. PM Resume, EM Resume..."}
        />
      </div>

      <div className="field">
        <label>Resume to review</label>
        {reviewerResume && !fileName.startsWith("Pre-filled") === false && (
          <div style={{background:"var(--cream)",border:"1px solid var(--amber)",borderRadius:8,padding:"8px 12px",fontSize:13,color:"var(--ink-muted)",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
            <span>✦</span>
            <span>Pre-filled from your reviewer profile — upload a different file or edit the text below to replace it.</span>
          </div>
        )}
        <div className="resume-tabs">
          <button className={`resume-tab ${resumeTab==="upload"?"active":""}`} onClick={()=>setResumeTab("upload")}>📎 Upload File</button>
          <button className={`resume-tab ${resumeTab==="paste"?"active":""}`} onClick={()=>setResumeTab("paste")}>📋 Paste / Edit Text</button>
        </div>

        {resumeTab === "upload" ? (
          <div
            className={`upload-zone ${dragOver?"drag-over":""} ${fileName?"has-file":""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e=>{e.preventDefault();setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt"
              style={{display:"none"}}
              onChange={e=>readFile(e.target.files[0])}
            />
            {fileName ? (
              <>
                <div className="upload-icon">✅</div>
                <div className="upload-label">Resume loaded</div>
                <div className="upload-filename">{fileName}</div>
                <div className="upload-sub" style={{marginTop:6}}>Click to replace with a different file</div>
              </>
            ) : (
              <>
                <div className="upload-icon">📄</div>
                <div className="upload-label">Drop your resume here</div>
                <div className="upload-sub">PDF, Word (.docx), or .txt · Click to browse</div>
              </>
            )}
          </div>
        ) : (
          <textarea rows={11} value={form.resume} onChange={e=>setForm(f=>({...f,resume:e.target.value}))} placeholder="Paste your resume text here..." style={{width:"100%",background:"white",border:"1.5px solid var(--border)",borderRadius:10,padding:"12px 14px",fontSize:15,fontFamily:"'Instrument Sans',sans-serif",color:"var(--ink)",outline:"none",resize:"none",lineHeight:1.55}} />
        )}
      </div>

      <button className="submit-btn blue" onClick={handleSubmit} disabled={!valid||loading}>
        {loading ? <><span className="spinner"/>Matching you now...</> : "Submit for Review →"}
      </button>
    </div>
  );
}

function ReviewerDashboard({ reviewerId, user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = () => api("GET", `/api/reviewers/${reviewerId}`).then(setData).catch(e=>setError(e.message));
  useEffect(() => { load(); }, [reviewerId]);

  if (error) return <div className="dashboard"><div className="error-banner">{error}</div></div>;
  if (!data) return <div className="thankyou-page"><div className="big-icon">⏳</div></div>;

  const { reviewer, matches } = data;
  return (
    <div className="dashboard">
      <div className="dash-header">
        <div>
          <div style={{fontSize:13,color:"var(--ink-muted)",marginBottom:6}}>Reviewer Dashboard</div>
          <h1 className="dash-title">{reviewer.name}</h1>
          <div style={{fontSize:14,color:"var(--ink-muted)",marginTop:4}}>{reviewer.role} · {reviewer.company}</div>
        </div>
        <span className="badge amber">● Active Reviewer</span>
      </div>
      <div className="section-label">Assigned matches ({matches.length})</div>
      {matches.length === 0 && (
        <div style={{padding:"40px 0",textAlign:"center",color:"var(--ink-muted)",fontSize:15}}>
          No matches yet — you'll be notified when a candidate is paired with you.
        </div>
      )}
      {matches.map((m,i) => <MatchCard key={i} match={m} onRefresh={load} />)}
    </div>
  );
}

function MatchCard({ match, onRefresh }) {
  const [showReview, setShowReview] = useState(false);
  if (showReview) return <InlineReview match={match} onBack={()=>setShowReview(false)} onDone={()=>{setShowReview(false);onRefresh();}} />;
  return (
    <div className="match-card">
      <div className="match-card-header">
        <div className="match-names">
          <div className="avatar amber-bg">{match.reviewer?.name?.[0]}</div>
          <div className="name-block"><strong>{match.reviewer?.name}</strong><span>{match.reviewer?.role} · {match.reviewer?.company}</span></div>
          <span className="match-arrow">→</span>
          <div className="avatar blue-bg">{match.candidate?.name?.[0]}</div>
          <div className="name-block"><strong>{match.candidate?.name}</strong><span>Targeting: {match.candidate?.targetRole}</span></div>
        </div>
        <span className={`badge ${match.status==="done"?"green":"amber"}`}>{match.status==="done"?"✓ Reviewed":"● Awaiting Review"}</span>
      </div>
      {match.rationale && <div className="rationale-box"><div className="rationale-label">AI Match Rationale</div><div className="rationale-text">{match.rationale}</div></div>}
      {match.status === "pending" && <button className="action-btn amber-btn" onClick={()=>setShowReview(true)}>Write Review →</button>}
    </div>
  );
}

function InlineReview({ match, onBack, onDone }) {
  const [feedback, setFeedback] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [fileBlobUrl, setFileBlobUrl] = useState(null);

  // Load the original file if available
  useEffect(() => {
    if (!match.candidate?.hasFile) return;
    fetch(`/api/candidates/${match.candidate.id}/file`, { credentials: "include" })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => { if (blob) setFileBlobUrl(URL.createObjectURL(blob)); })
      .catch(() => {});
    return () => { if (fileBlobUrl) URL.revokeObjectURL(fileBlobUrl); };
  }, [match.candidate?.id]);

  const getAI = async () => {
    setAiLoading(true); setAiText("");
    try {
      const system = `You are helping an experienced ${match.reviewer?.role} write candid, specific resume feedback for a job seeker targeting ${match.candidate?.targetRole}. Give 3-4 pointed, actionable observations. Be direct.`;
      const res = await api("POST", "/api/claude", { system, messages: [{ role:"user", content:`Reviewer: ${match.reviewer?.name}, ${match.reviewer?.role} at ${match.reviewer?.company}\nCandidate targeting: ${match.candidate?.targetRole}\n\nResume:\n${match.candidate?.resume}` }], max_tokens:1000 });
      setAiText(res.text);
    } catch(e) { setError(e.message); }
    setAiLoading(false);
  };

  const [aiScore, setAiScore] = useState(null); // { score, suggestion }
  const [scoring, setScoring] = useState(false);

  const handlePreview = async () => {
    setScoring(true); setError("");
    try {
      const result = await api("POST", "/api/feedback/score", { feedbackText: feedback, candidateTargetRole: match.candidate?.targetRole });
      setAiScore(result);
    } catch(e) { setError(e.message); }
    setScoring(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api("POST", "/api/feedback", { matchId: match.id, body: feedback });
      setDone(true);
      setTimeout(onDone, 1600);
    } catch(e) { setError(e.message); }
    setSubmitting(false);
  };

  if (done) return (
    <div className="match-card" style={{textAlign:"center",padding:"40px"}}>
      <div style={{fontSize:36,marginBottom:12}}>✅</div>
      <div style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:300}}>Feedback sent!</div>
    </div>
  );

  return (
    <div className="review-page" style={{padding:"0 0 40px"}}>
      <button className="back-btn" onClick={onBack} style={{marginBottom:20}}>← Back</button>
      <div className="form-eyebrow amber">Reviewing resume</div>
      <h1 className="form-heading" style={{fontSize:28}}>{match.candidate?.name}</h1>
      <p style={{fontSize:14,color:"var(--ink-muted)",marginTop:4}}>Targeting: <strong style={{color:"var(--ink)"}}>{match.candidate?.targetRole}</strong></p>
      <div className="two-col">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Candidate Resume</span>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span className="badge blue">Confidential</span>
              {fileBlobUrl && <a href={fileBlobUrl} download="resume.pdf" className="action-btn outline" style={{fontSize:11,padding:"4px 10px"}}>Download PDF</a>}
              {!fileBlobUrl && match.candidate?.resume && <button className="action-btn outline" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>{const blob=new Blob([match.candidate.resume],{type:"text/plain"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="resume.txt";a.click();URL.revokeObjectURL(url);}}>Download Text</button>}
            </div>
          </div>
          <div className="panel-body">
            {fileBlobUrl ? (
              <iframe src={fileBlobUrl} style={{width:"100%",height:500,border:"none",borderRadius:8}} title="Resume PDF" />
            ) : (
              <div className="resume-text" style={{whiteSpace:"pre-wrap",lineHeight:1.7,fontSize:13.5,fontFamily:"'Inter','Segoe UI',sans-serif",padding:"20px 24px",background:"white",borderRadius:8,border:"1px solid var(--border)",maxHeight:500,overflowY:"auto"}}>{match.candidate?.resume || "No resume text available."}</div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Your Feedback</span>
            <button className="ai-btn" onClick={getAI} disabled={aiLoading}>
              {aiLoading ? <><span className="spinner dark" style={{width:12,height:12}}/>Thinking...</> : "✦ AI Assist"}
            </button>
          </div>
          <div className="panel-body">
            {error && <div className="error-banner">{error}</div>}
            <textarea className="feedback-textarea" value={feedback} onChange={e=>setFeedback(e.target.value)}
              placeholder={`Write honest feedback.\n\nWhat's strong? What needs work? What one thing would make this resume stand out for ${match.candidate?.targetRole}?`} />
            {aiText && (
              <div className="ai-suggestion">
                <div className="ai-suggestion-label">✦ AI starting points — edit before using</div>
                <div className="ai-suggestion-text">{aiText}</div>
                <button className="action-btn outline" style={{marginTop:12,fontSize:12}} onClick={()=>{setFeedback(f=>f?f+"\n\n"+aiText:aiText);setAiText("");}}>Use as starting point →</button>
              </div>
            )}
          </div>
          {aiScore && (
            <div style={{padding:"12px 16px",background:aiScore.score>=7?"#e8f5e9":aiScore.score>=5?"#fff8e1":"#fce4ec",borderTop:"1px solid var(--border)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:aiScore.suggestion?6:0}}>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:aiScore.score>=7?"#2e7d32":aiScore.score>=5?"#f57f17":"#c62828"}}>Quality Score: {aiScore.score}/10</span>
                {aiScore.score >= 7 && <span style={{fontSize:13}}>Great feedback!</span>}
              </div>
              {aiScore.suggestion && <div style={{fontSize:13,color:"var(--ink-light)",lineHeight:1.5}}>{aiScore.suggestion}</div>}
            </div>
          )}
          <div className="panel-footer">
            {!aiScore ? (
              <button className="action-btn outline" style={{width:"100%",padding:"12px",fontSize:14}} onClick={handlePreview} disabled={!feedback.trim()||scoring}>
                {scoring ? <><span className="spinner dark" style={{width:14,height:14}}/>Checking quality...</> : "Preview & Score Feedback"}
              </button>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {aiScore.score < 6 && (
                  <div style={{fontSize:13,color:"#c62828",background:"#fce4ec",padding:"10px 14px",borderRadius:8,lineHeight:1.5}}>
                    ⚠️ Your feedback scored {aiScore.score}/10 — it needs to be more specific and actionable before you can send it. Please revise and re-score.
                  </div>
                )}
                <div style={{display:"flex",gap:8}}>
                  <button className="action-btn outline" style={{flex:1,padding:"12px",fontSize:13}} onClick={()=>setAiScore(null)}>Edit & Re-score</button>
                  <button className="action-btn amber-btn" style={{flex:2,padding:"12px",fontSize:14,opacity:aiScore.score<6?0.4:1}} onClick={handleSubmit} disabled={submitting || aiScore.score < 6}>
                    {submitting ? <><span className="spinner"/>Sending...</> : aiScore.score < 6 ? "Score too low to send" : "Send Feedback to Candidate →"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedbackRating({ feedback }) {
  const [rating, setRating] = useState(feedback.candidateRating || 0);
  const [hover, setHover] = useState(0);
  const [submitted, setSubmitted] = useState(!!feedback.candidateRating);
  const [saving, setSaving] = useState(false);

  const submitRating = async (stars) => {
    setRating(stars); setSaving(true);
    try {
      await api("POST", `/api/feedback/${feedback.id}/rating`, { rating: stars });
      setSubmitted(true);
    } catch(e) { /* silently fail */ }
    setSaving(false);
  };

  return (
    <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid var(--border)"}}>
      <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--ink-muted)",marginBottom:8}}>
        {submitted ? "Your rating" : "Rate this feedback"}
      </div>
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        {[1,2,3,4,5].map(s => (
          <span key={s}
            onClick={() => !submitted && submitRating(s)}
            onMouseEnter={() => !submitted && setHover(s)}
            onMouseLeave={() => !submitted && setHover(0)}
            style={{fontSize:22,cursor:submitted?"default":"pointer",opacity:s<=(hover||rating)?1:0.3,transition:"opacity 0.15s"}}>
            {s <= (hover || rating) ? "★" : "☆"}
          </span>
        ))}
        {submitted && <span style={{fontSize:12,color:"var(--ink-muted)",marginLeft:8}}>Thanks for rating!</span>}
        {saving && <span className="spinner dark" style={{width:12,height:12,marginLeft:8}}/>}
      </div>
    </div>
  );
}

function SubmissionCard({ submission }) {
  const { candidate, matches } = submission;
  const match = matches?.find(m => m.status !== "waitlist") || matches?.[0];
  const label = candidate.label || `${candidate.targetRole} Resume`;

  return (
    <div className="status-card" style={{marginBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontFamily:"'Fraunces',serif",fontSize:18,fontWeight:400}}>{label}</div>
          <div style={{fontSize:13,color:"var(--ink-muted)",marginTop:3}}>Targeting: {candidate.targetRole} · {candidate.targetArea}</div>
        </div>
        {match ? (
          <span className={`badge ${match.status==="done"?"green":match.status==="waitlist"?"":"amber"}`}>
            {match.status==="done" ? "✓ Review received" : match.status==="waitlist" ? "📋 Waitlisted" : "⏳ Review pending"}
          </span>
        ) : (
          <span className="badge amber">⏳ Finding reviewer</span>
        )}
      </div>

      {(!match || match.status === "waitlist") ? (
        <div style={{textAlign:"center",padding:"20px 0",borderTop:"1px solid var(--border)"}}>
          {match?.status === "waitlist" ? (
            <>
              <div style={{fontSize:28,marginBottom:8}}>📋</div>
              <p style={{fontSize:13,color:"var(--ink-muted)",lineHeight:1.6}}>All reviewers in your field are at capacity. You're in the queue — we'll email you when a spot opens.</p>
            </>
          ) : (
            <>
              <div style={{fontSize:28,marginBottom:8}}>⏳</div>
              <p style={{fontSize:13,color:"var(--ink-muted)"}}>Matching you with the right reviewer. We'll email you when ready.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div style={{borderTop:"1px solid var(--border)",paddingTop:14}}>
            <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--ink-muted)",marginBottom:8}}>Your Reviewer</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div className="avatar amber-bg">?</div>
              <div className="name-block">
                <strong>Anonymous Reviewer</strong>
                <span>{match.reviewer?.years}+ years exp · {match.reviewer?.areas?.slice(0,2).join(", ")}</span>
              </div>
            </div>
          </div>
          {match.rationale && (
            <div className="rationale-box" style={{marginTop:14}}>
              <div className="rationale-label">Why this match</div>
              <div className="rationale-text">{match.rationale}</div>
            </div>
          )}
          {match.feedback && (
            <>
              <div className="divider" />
              <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--green)",marginBottom:12}}>✓ Feedback received</div>
              <div className="feedback-body">{match.feedback.body}</div>
              <FeedbackRating feedback={match.feedback} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function CandidateStatus({ onNoProfile, onAddNew }) {
  const [submissions, setSubmissions] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("GET", "/api/candidates/mine")
      .then(d => {
        if (!d.submissions || d.submissions.length === 0) { onNoProfile?.(); return; }
        setSubmissions(d.submissions);
      })
      .catch(e => {
        // If endpoint missing (old server), show error rather than looping back to form
        if (e.message?.includes("404") || e.message?.includes("Not Found")) {
          setError("Could not load submissions — server may need to be redeployed.");
        } else {
          setError(e.message);
        }
      });
  }, []);

  if (error) return <div className="dashboard"><div className="error-banner">{error}</div></div>;
  if (!submissions) return (
    <div className="thankyou-page">
      <div className="big-icon" style={{animation:"spin 1s linear infinite"}}>⚙</div>
      <p style={{color:"var(--ink-muted)",fontSize:14,marginTop:16}}>Loading your submissions...</p>
    </div>
  );

  const firstName = submissions[0]?.candidate?.name?.split(" ")[0] || "there";

  return (
    <div className="dashboard">
      <div className="dash-header">
        <div>
          <div style={{fontSize:13,color:"var(--ink-muted)",marginBottom:6}}>Candidate Dashboard</div>
          <h1 className="dash-title">Hi, {firstName}</h1>
          <div style={{fontSize:14,color:"var(--ink-muted)",marginTop:4}}>{submissions.length} resume{submissions.length !== 1 ? "s" : ""} submitted</div>
        </div>
        <button className="action-btn" style={{background:"var(--blue)",color:"white",border:"none"}} onClick={onAddNew}>+ Add Resume</button>
      </div>
      <div className="section-label" style={{marginBottom:16}}>Your submissions</div>
      {submissions.map((s, i) => <SubmissionCard key={i} submission={s} />)}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [view, setView] = useState("loading");

  // Check session on load
  useEffect(() => {
    api("GET", "/api/me").then(({ user: u }) => {
      setUser(u);
      routeUser(u);
    }).catch(() => { setUser(null); setView("login"); });
  }, []);

  const routeUser = (u) => {
    if (!u) { setView("login"); return; }
    if (!u.reviewer_id && !(u.candidate_ids?.length)) { setView("pick-role"); return; }
    // Default to whichever profile they have; prefer reviewer if both
    if (u.reviewer_id) setView("reviewer-dashboard");
    else setView("candidate-status");
  };

  const handleTabSelect = async (tab) => {
    if (tab === "reviewer") {
      const fresh = await refreshUser(); // ensure candidates[] is loaded before reviewer form mounts
      setView(fresh?.reviewer_id ? "reviewer-dashboard" : "reviewer-setup");
    } else {
      setView(user?.candidate_ids?.length ? "candidate-status" : "candidate-setup");
    }
  };

  const handleSignOut = async () => {
    await api("POST", "/auth/logout");
    setUser(null);
    setView("login");
  };

  const refreshUser = async () => {
    const { user: u } = await api("GET", "/api/me");
    setUser(u);
    return u;
  };

  if (view === "loading") return (
    <>
      <style>{style}</style>
      <div className="thankyou-page"><div className="big-icon" style={{animation:"spin 1s linear infinite"}}>⚙</div></div>
    </>
  );

  return (
    <>
      <style>{style}</style>
      <TopNav user={user} onHome={() => routeUser(user)} onSignOut={handleSignOut} onTabSelect={handleTabSelect} currentView={view} />

      {view === "login" && <LoginPage onLogin={(u) => { setUser(u); routeUser(u); }} />}

      {view === "pick-role" && user && (
        <RolePicker user={user} onRoleSet={async (role) => {
          await refreshUser();
          setView(role === "reviewer" ? "reviewer-setup" : "candidate-setup");
        }} />
      )}

      {view === "reviewer-setup" && user && (
        <ReviewerSignup user={user} onDone={async () => { await refreshUser(); setView("reviewer-dashboard"); }} />
      )}

      {view === "candidate-setup" && user && (
        <CandidateSignup user={user} onDone={async () => { await refreshUser(); setView("candidate-status"); }} />
      )}

      {view === "reviewer-dashboard" && user?.reviewer_id && (
        <ReviewerDashboard reviewerId={user.reviewer_id} user={user} />
      )}

      {view === "candidate-status" && (
        <CandidateStatus
          onNoProfile={() => setView("candidate-setup")}
          onAddNew={() => setView("candidate-setup")}
        />
      )}
    </>
  );
}
