// server.js — Zurio with Google OAuth
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, "zurio-data.json");
const CLIENT_URL = "http://localhost:5173";

// ─── CORS (must allow credentials from Vite) ──────────────────────────────────
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

// ─── Session ──────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || "zurio-dev-secret-change-in-prod",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
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

// ─── Passport ─────────────────────────────────────────────────────────────────
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`,
  },
  (accessToken, refreshToken, profile, done) => {
    const googleId = profile.id;
    let user = findByField("users", "googleId", googleId);
    if (!user) {
      user = insert("users", {
        googleId,
        email: profile.emails?.[0]?.value || "",
        name: profile.displayName || "",
        picture: profile.photos?.[0]?.value || "",
        role: null,       // null = hasn't chosen yet
        reviewer_id: null,
        candidate_id: null,
      });
    }
    return done(null, user);
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = findById("users", id);
  done(null, user || false);
});

app.use(passport.initialize());
app.use(passport.session());

// ─── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not authenticated" });
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: `${CLIENT_URL}?auth=error` }),
  (req, res) => res.redirect(`${CLIENT_URL}?auth=success`)
);

app.post("/auth/logout", (req, res) => {
  req.logout(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.isAuthenticated()) return res.json({ user: null });
  // Attach linked reviewer/candidate records
  const user = { ...req.user };
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
  // Build reviewer summaries for Claude — richer if they uploaded a resume
  const reviewerSummaries = db.reviewers.map(r => {
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
3. Seniority match (reviewer should be at least 1 level above candidate's target)
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
  res.json({ feedback: insert("feedback", { match_id: Number(matchId), body }) });
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

app.listen(PORT, () => console.log(`✅ Zurio server on http://localhost:${PORT}`));
