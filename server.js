// server.js — Zurio
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, "zurio-data.json");
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.set("trust proxy", 1);
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || "zurio-dev-secret-change-in-prod",
  resave: false,
  saveUninitialized: false,
  cookie: { 
    httpOnly: true, 
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
  }
}));

// ─── JSON DB ──────────────────────────────────────────────────────────────────
let db = { users: [], reviewers: [], candidates: [], matches: [], feedback: [] };
let nextId = { users: 1, reviewers: 1, candidates: 1, matches: 1, feedback: 1 };

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      db = saved.db || db;
      if (!db.users) db.users = [];
      nextId = saved.nextId || nextId;
      if (!nextId.users) nextId.users = 1;
    }
  } catch (e) {}
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify({ db, nextId }, null, 2));
}

function insert(table, obj) {
  const id = nextId[table]++;
  const record = { ...obj, id, created_at: new Date().toISOString() };
  db[table].push(record);
  saveDB();
  return record;
}

function findById(table, id) {
  return db[table].find((r) => r.id === Number(id)) || null;
}

function findByField(table, field, value) {
  return db[table].find((r) => r[field] === value) || null;
}

loadDB();
console.log("✅ Zurio database ready");

// ─── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
  const user = findByField("users", "id", req.session.userId);
  if (!user) return res.status(401).json({ error: "User not found" });
  req.user = user;
  next();
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post("/auth/login", (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and email required" });
  const normalizedEmail = email.toLowerCase().trim();
  let user = findByField("users", "email", normalizedEmail);
  if (!user) {
    user = insert("users", {
      email: normalizedEmail,
      name: name.trim(),
      picture: null,
      role: null,
      reviewer_id: null,
      candidate_id: null,
    });
  }
  req.session.userId = user.id;
  res.json({ user });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session?.userId) return res.json({ user: null });
  const user = { ...findById("users", req.session.userId) };
  if (!user) return res.json({ user: null });
  if (user.reviewer_id) user.reviewer = findById("reviewers", user.reviewer_id);
  if (user.candidate_id) user.candidate = findById("candidates", user.candidate_id);
  res.json({ user });
});

// Set role for first-time user
app.post("/api/me/role", requireAuth, (req, res) => {
  const { role } = req.body;
  if (!["reviewer", "candidate"].includes(role)) return res.status(400).json({ error: "Invalid role" });
  req.user.role = role;
  saveDB();
  res.json({ user: req.user });
});


// ─── Email helper ─────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log("[email] No RESEND_API_KEY — skipping:", subject, "to", to); return; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: "Zurio <notifications@zurio.com>", to, subject, html }),
    });
    const data = await res.json();
    if (!res.ok) console.error("[email] Resend error:", data);
    else console.log("[email] Sent:", subject, "to", to);
  } catch(e) { console.error("[email] Failed:", e.message); }
}

// ─── Claude helper ────────────────────────────────────────────────────────────
async function callClaude(system, userMsg, maxTokens = 200) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No API key");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, system, messages: [{ role: "user", content: userMsg }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Claude error");
  return data.content?.map((b) => b.text || "").join("") || "";
}

// ─── Reviewer routes ──────────────────────────────────────────────────────────
app.post("/api/reviewers", requireAuth, (req, res) => {
  const { name, role, company, years, areas, bio, resumeText } = req.body;
  if (!name || !role || !company || !years || !areas?.length)
    return res.status(400).json({ error: "Missing required fields" });

  let reviewer = req.user.reviewer_id ? findById("reviewers", req.user.reviewer_id) : null;
  if (reviewer) {
    Object.assign(reviewer, { name, role, company, years, areas, bio: bio || "", resumeText: resumeText || "" });
    saveDB();
  } else {
    reviewer = insert("reviewers", { name, role, company, years, areas, bio: bio || "", resumeText: resumeText || "" });
    req.user.reviewer_id = reviewer.id;
    req.user.role = "reviewer";
    saveDB();
  }
  res.json({ reviewer });
});

app.get("/api/reviewers/:id", requireAuth, (req, res) => {
  const reviewer = findById("reviewers", req.params.id);
  if (!reviewer) return res.status(404).json({ error: "Not found" });
  const matches = db.matches
    .filter((m) => m.reviewer_id === reviewer.id)
    .map((m) => ({ ...m, reviewer: findById("reviewers", m.reviewer_id), candidate: findById("candidates", m.candidate_id) }));
  res.json({ reviewer, matches });
});

// ─── Candidate routes ─────────────────────────────────────────────────────────
app.post("/api/candidates", requireAuth, async (req, res) => {
  const { name, email, targetRole, targetArea, resume } = req.body;
  if (!name || !email || !targetRole || !targetArea || !resume)
    return res.status(400).json({ error: "Missing required fields" });

  let candidate = req.user.candidate_id ? findById("candidates", req.user.candidate_id) : null;
  if (candidate) {
    Object.assign(candidate, { name, email, targetRole, targetArea, resume });
    saveDB();
  } else {
    candidate = insert("candidates", { name, email, targetRole, targetArea, resume });
    req.user.candidate_id = candidate.id;
    req.user.role = "candidate";
    saveDB();
  }

  // ─── AI Matching ────────────────────────────────────────────────────────────
  // Build reviewer summaries for Claude — exclude self
  const eligibleReviewers = db.reviewers.filter(r => r.id !== req.user.reviewer_id);
  const reviewerSummaries = eligibleReviewers.map(r => {
    let summary = `Reviewer ID ${r.id}: ${r.name}, ${r.role} at ${r.company}, ${r.years} years exp, areas: [${r.areas.join(", ")}].`;
    if (r.bio) summary += ` Bio: ${r.bio}`;
    if (r.resumeText) summary += `\nFull resume:\n${r.resumeText.slice(0, 1500)}`;
    return summary;
  }).join("\n\n---\n\n");

  const matchSystem = `You are a matching engine for a resume review platform. Your job is to rank reviewers for a given candidate and return a JSON array only — no markdown, no explanation.

Each object in the array must have:
- reviewer_id (number)
- score (1–10, integer)
- reasoning (one sentence, max 20 words, explaining why this reviewer fits this candidate)

Score based on:
1. Overlap between reviewer's career path / expertise and candidate's target role
2. Industry or company relevance
3. Seniority match — CRITICAL: reviewer must be meaningfully MORE senior than the candidate's target role. A VP reviewing an entry-level candidate is acceptable. A Sr Manager reviewing a VP candidate is NOT acceptable. Penalize heavily any reviewer who is at the same level or junior to the candidate's target.
4. If reviewer uploaded a resume, use it for richer signal

Return ALL reviewers ranked from best to worst match. JSON array only.`;

  const matchPrompt = `Candidate:
Name: ${name}
Target role: ${targetRole}
Field: ${targetArea}
Resume:
${resume.slice(0, 2000)}

Reviewers:
${reviewerSummaries}`;

  let bestReviewer = null;
  let rationale = "";

  try {
    const raw = await callClaude(matchSystem, matchPrompt, 800);
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const ranked = JSON.parse(cleaned);
    if (Array.isArray(ranked) && ranked.length > 0) {
      // Pick highest scorer, skip reviewers already matched to this candidate
      const alreadyMatched = new Set(
        db.matches.filter(m => m.candidate_id === candidate.id).map(m => m.reviewer_id)
      );
      const best = ranked.find(r => !alreadyMatched.has(r.reviewer_id)) || ranked[0];
      bestReviewer = findById("reviewers", best.reviewer_id);
      rationale = best.reasoning || "";
    }
  } catch (e) {
    // Fallback to simple area match if Claude fails
    bestReviewer = db.reviewers.find(r => r.areas?.includes(targetArea)) || db.reviewers[0] || null;
    rationale = bestReviewer ? `${bestReviewer.name}'s background in ${bestReviewer.areas?.[0]} aligns with ${targetRole}.` : "";
  }

  if (!bestReviewer) return res.json({ candidate, match: null });

  const existingMatch = db.matches.find(m => m.reviewer_id === bestReviewer.id && m.candidate_id === candidate.id);
  const match = existingMatch || insert("matches", { reviewer_id: bestReviewer.id, candidate_id: candidate.id, rationale, status: "pending" });
  saveDB();

  res.json({ candidate, reviewer: bestReviewer, match, rationale });
});

app.get("/api/candidates/:id/status", requireAuth, (req, res) => {
  const candidate = findById("candidates", req.params.id);
  if (!candidate) return res.status(404).json({ error: "Not found" });
  const matches = db.matches
    .filter((m) => m.candidate_id === candidate.id)
    .map((m) => {
      const fb = db.feedback.find(f => f.match_id === m.id) || null;
      return { ...m, reviewer: findById("reviewers", m.reviewer_id), feedback: fb };
    });
  res.json({ candidate, matches });
});

// ─── Feedback routes ──────────────────────────────────────────────────────────
app.post("/api/feedback", requireAuth, (req, res) => {
  const { matchId, body } = req.body;
  if (!matchId || !body?.trim()) return res.status(400).json({ error: "matchId and body required" });
  const match = findById("matches", matchId);
  if (!match) return res.status(404).json({ error: "Match not found" });
  match.status = "done";
  saveDB();
  const fb = insert("feedback", { match_id: Number(matchId), body });
  match.status = "done";
  saveDB();

  // Notify candidate by email
  const candidate = findById("candidates", match.candidate_id);
  if (candidate?.email) {
    sendEmail({
      to: candidate.email,
      subject: "Your resume review is ready on Zurio",
      html: `<p>Hi ${candidate.name},</p>
<p>Your resume review is ready on <strong>Zurio</strong>!</p>
<p>An expert in your target field has reviewed your resume and left detailed feedback.</p>
<p><a href="${process.env.SERVER_URL || "https://zurio-api-production.up.railway.app"}">Read your feedback →</a></p>
<p style="color:#888;font-size:12px">You're receiving this because you submitted your resume on Zurio.</p>`
    });
  }

  res.json({ feedback: fb });
});

// ─── Claude proxy ─────────────────────────────────────────────────────────────
app.post("/api/claude", requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set." });
  const { system, messages, max_tokens = 1000 } = req.body;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens, system, messages }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message });
    res.json({ text: data.content?.map((b) => b.text || "").join("") || "" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, users: db.users.length, reviewers: db.reviewers.length, candidates: db.candidates.length });
});

// Serve React frontend in production
const distPath = path.join(__dirname, "dist");
console.log("distPath:", distPath, "exists:", fs.existsSync(distPath));
app.use(express.static(distPath));
app.get("*", (req, res) => {
  const indexPath = path.join(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send(`<h2>Zurio API is running. dist not found at ${distPath}</h2>`);
  }
});

// ─── Debug: match scores (test use only) ─────────────────────────────────────
app.post("/api/debug/match-scores", requireAuth, async (req, res) => {
  const { resume, targetRole, targetArea, excludeReviewerIds } = req.body;
  if (!resume || !targetRole || !targetArea) return res.status(400).json({ error: "Missing fields" });

  const exclude = new Set((excludeReviewerIds || []).map(Number));
  const pool = db.reviewers.filter(r => !exclude.has(r.id) && r.id !== req.user.reviewer_id);

  if (pool.length === 0) return res.json({ scores: [], pool_size: 0 });

  const reviewerSummaries = pool.map(r => {
    let s = `Reviewer ID ${r.id}: ${r.name}, ${r.role} at ${r.company}, ${r.years} years exp, areas: [${r.areas.join(", ")}].`;
    if (r.bio) s += ` Bio: ${r.bio}`;
    if (r.resumeText) s += `\nResume:\n${r.resumeText.slice(0, 1000)}`;
    return s;
  }).join("\n\n---\n\n");

  const system = `You are a matching engine. Return a JSON array only — no markdown, no explanation.
Each object: { reviewer_id (number), score (1-10), reasoning (string), seniority_ok (boolean), field_match (boolean) }
Score based on: field overlap, industry relevance, seniority (reviewer must be MORE senior than candidate target).
Return ALL reviewers ranked best to worst. JSON array only.`;

  const prompt = `Candidate targeting: ${targetRole} in ${targetArea}\nResume: ${resume.slice(0, 1500)}\n\nReviewers:\n${reviewerSummaries}`;

  try {
    const raw = await callClaude(system, prompt, 1200);
    const cleaned = raw.replace(/\`\`\`json\n?|\n?\`\`\`/g, "").trim();
    const scores = JSON.parse(cleaned);
    // Enrich with reviewer details
    const enriched = scores.map(s => {
      const rev = pool.find(r => r.id === s.reviewer_id);
      return { ...s, reviewer_name: rev?.name, reviewer_role: rev?.role, reviewer_company: rev?.company, reviewer_years: rev?.years, reviewer_areas: rev?.areas };
    });
    res.json({ scores: enriched, pool_size: pool.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`✅ Zurio server on http://localhost:${PORT}`));