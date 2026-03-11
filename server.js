// server.js — Zurio
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, "zurio-data.json");
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.set("trust proxy", 1);
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "50mb" }));

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

// On startup: remove any self-matches created before the self-match fix
{
  const selfMatchIds = new Set();
  db.matches.forEach(m => {
    if (!m.candidate_id || !m.reviewer_id) return;
    const candidate = findById("candidates", m.candidate_id);
    const reviewer = findById("reviewers", m.reviewer_id);
    if (!candidate || !reviewer) return;
    const candidateUser = db.users.find(u =>
      u.candidate_ids?.includes(candidate.id) || u.candidate_id === candidate.id
    );
    const reviewerUser = db.users.find(u => u.reviewer_id === reviewer.id);
    if (candidateUser && reviewerUser && candidateUser.id === reviewerUser.id) {
      selfMatchIds.add(m.id);
      console.log(`[startup] Removing self-match: match ${m.id}, user ${candidateUser.id} (${candidateUser.email})`);
    }
  });
  if (selfMatchIds.size > 0) {
    db.matches = db.matches.filter(m => !selfMatchIds.has(m.id));
    saveDB();
    console.log(`[startup] Cleaned up ${selfMatchIds.size} self-match(es)`);
  }
}

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
app.post("/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: "Name, email, and password required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  const normalizedEmail = email.toLowerCase().trim();
  const existing = findByField("users", "email", normalizedEmail);
  if (existing) return res.status(409).json({ error: "An account with this email already exists. Please sign in." });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = insert("users", {
    email: normalizedEmail,
    name: name.trim(),
    passwordHash,
    picture: null,
    role: null,
    reviewer_id: null,
    candidate_ids: [],
  });
  req.session.userId = user.id;
  const { passwordHash: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) return res.status(400).json({ error: "Email and password required" });
  const normalizedEmail = email.toLowerCase().trim();
  const user = findByField("users", "email", normalizedEmail);
  if (!user) return res.status(401).json({ error: "No account found with this email. Please create an account first." });
  // Legacy migration: first login with password sets it permanently
  if (!user.passwordHash) {
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
    user.passwordHash = await bcrypt.hash(password, 10);
    saveDB();
    req.session.userId = user.id;
    const { passwordHash: _, ...safeUser } = user;
    return res.json({ user: safeUser });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Incorrect password." });
  req.session.userId = user.id;
  const { passwordHash: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session?.userId) return res.json({ user: null });
  const raw = findById("users", req.session.userId);
  if (!raw) return res.json({ user: null });
  const { passwordHash: _, ...user } = { ...raw };
  if (user.reviewer_id) user.reviewer = findById("reviewers", user.reviewer_id);
  if (user.candidate_ids?.length) user.candidates = user.candidate_ids.map(id => findById("candidates", id)).filter(Boolean);
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
app.post("/api/reviewers", requireAuth, async (req, res) => {
  const { name, role, company, years, areas, bio, resumeText, linkedin } = req.body;
  if (!name || !role || !company || !years || !areas?.length)
    return res.status(400).json({ error: "Missing required fields" });

  let reviewer = req.user.reviewer_id ? findById("reviewers", req.user.reviewer_id) : null;
  const reviewerData = { name, role, company, years, areas, bio: bio || "", resumeText: resumeText || "", linkedin: linkedin || "" };
  if (reviewer) {
    Object.assign(reviewer, reviewerData);
    if (!reviewer.status) reviewer.status = "pending"; // backfill status for existing
    saveDB();
  } else {
    reviewer = insert("reviewers", { ...reviewerData, status: "pending", aiAssessment: "", flags: [] });
    req.user.reviewer_id = reviewer.id;
    req.user.role = "reviewer";
    saveDB();
  }

  // AI vetting (async, don't block response)
  if (reviewer.status === "pending") {
    vetReviewer(reviewer.id).catch(e => console.error("[vet-reviewer] Error:", e.message));
  }

  res.json({ reviewer });
});

async function vetReviewer(reviewerId) {
  const reviewer = findById("reviewers", reviewerId);
  if (!reviewer) return;

  const flags = [];
  if (reviewer.years === "1–3") flags.push("low_experience");
  if (!reviewer.resumeText) flags.push("no_resume");
  if (!reviewer.linkedin) flags.push("no_linkedin");

  // AI assessment
  let aiAssessment = "";
  try {
    const sys = `You assess reviewer qualifications for a resume review platform. Return JSON only, no markdown:
{"score": <1-5>, "assessment": "<2-3 sentence assessment>", "concerns": ["<issue1>", ...]}

Score guide:
5 = Highly qualified — senior leader with clear hiring/mentoring experience
4 = Well qualified — experienced professional with relevant domain expertise
3 = Adequate — mid-level with some relevant experience
2 = Questionable — limited experience or vague background
1 = Unqualified — no clear expertise, very junior, or suspicious profile

Check for:
- Does the role + company + years seem plausible?
- If resume provided, does it show real experience with specific companies/metrics?
- Do years claimed match resume timeline?
- Are selected expertise areas consistent with their background?
- Are they senior enough to give useful resume advice?`;

    const prompt = `Reviewer profile:
Name: ${reviewer.name}
Role: ${reviewer.role}
Company: ${reviewer.company}
Years: ${reviewer.years}
Areas: ${reviewer.areas.join(", ")}
LinkedIn: ${reviewer.linkedin || "Not provided"}
${reviewer.resumeText ? `Resume:\n${reviewer.resumeText.slice(0, 2000)}` : "Resume: Not provided"}`;

    const raw = await callClaude(sys, prompt, 400);
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      aiAssessment = `Score: ${result.score}/5 — ${result.assessment}`;
      if (result.concerns?.length) {
        result.concerns.forEach(c => {
          const flag = c.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, "").slice(0, 30);
          if (flag && !flags.includes(flag)) flags.push(flag);
        });
      }
    }
  } catch (e) {
    aiAssessment = "AI assessment unavailable — review manually.";
    console.error("[vet-reviewer] Claude error:", e.message);
  }

  reviewer.aiAssessment = aiAssessment;
  reviewer.flags = flags;
  saveDB();
  console.log(`[vet-reviewer] ${reviewer.name}: ${aiAssessment} | flags: [${flags.join(", ")}]`);
}

app.get("/api/reviewers/:id", requireAuth, (req, res) => {
  const reviewer = findById("reviewers", req.params.id);
  if (!reviewer) return res.status(404).json({ error: "Not found" });

  // Find the user who owns this reviewer profile (for self-match filtering)
  const reviewerUser = db.users.find(u => u.reviewer_id === reviewer.id);

  const matches = db.matches
    .filter((m) => m.reviewer_id === reviewer.id && m.status !== "waitlist")
    .map((m) => {
      const candidate = findById("candidates", m.candidate_id);
      // Never show a candidate whose user account is the same person as the reviewer
      const candidateUser = candidate ? db.users.find(u => u.candidate_ids?.includes(candidate.id)) : null;
      if (reviewerUser && candidateUser && reviewerUser.id === candidateUser.id) return null;
      // Strip resume from candidate summary — reviewer only needs role info for the card
      // Format: "Exec mundu → Chief mundu" or just "Chief mundu" if no current role
      const anonName = candidate
        ? (candidate.currentRole
            ? `${candidate.currentRole} → ${candidate.targetRole}`
            : candidate.targetRole)
        : "Anonymous Candidate";
      return { ...m, reviewer: findById("reviewers", m.reviewer_id), candidate: candidate ? { id: candidate.id, name: anonName, currentRole: candidate.currentRole, targetRole: candidate.targetRole, targetArea: candidate.targetArea, resume: candidate.resume, hasFile: !!candidate.fileBase64 } : null };
    })
    .filter(Boolean);
  res.json({ reviewer, matches });
});

// ─── PII detection & redaction ────────────────────────────────────────────────
function redactPII(text, candidateName) {
  const redactions = [];
  // First, redact the candidate's own name from the resume text
  if (candidateName) {
    const nameParts = candidateName.trim().split(/\s+/);
    // Redact full name
    const fullNameRegex = new RegExp(candidateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    text = text.replace(fullNameRegex, (match) => { redactions.push({ type: "name", original: match }); return "[NAME REDACTED]"; });
    // Redact individual name parts (first name, last name) if 3+ chars
    for (const part of nameParts) {
      if (part.length >= 3) {
        const partRegex = new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        text = text.replace(partRegex, (match) => { redactions.push({ type: "name", original: match }); return "[NAME REDACTED]"; });
      }
    }
  }
  const patterns = [
    { name: "phone", regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
    { name: "email", regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z]{2,}\b/gi },
    { name: "SSN", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
    { name: "address", regex: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Way|Pl|Place)\.?\b/gi },
    { name: "zipcode", regex: /\b\d{5}(?:-\d{4})?\b/g },
  ];
  let redacted = text;
  for (const { name, regex } of patterns) {
    redacted = redacted.replace(regex, (match) => {
      redactions.push({ type: name, original: match });
      return `[${name.toUpperCase()} REDACTED]`;
    });
  }
  return { redacted, redactions };
}

// ─── Candidate routes ─────────────────────────────────────────────────────────
app.post("/api/candidates", requireAuth, async (req, res) => {
  const { name, email, currentRole, targetRole, targetArea, resume, fileBase64, fileType, fileName } = req.body;
  if (!name || !email || !targetRole || !targetArea || !resume)
    return res.status(400).json({ error: "Missing required fields" });

  // Redact PII from resume text
  const { redacted: cleanResume, redactions } = redactPII(resume, name);

  // Always create a new candidate submission (one user can have multiple)
  const { label } = req.body; // optional user-override label
  const candidateData = { name, email, currentRole: currentRole || "", targetRole, targetArea, resume: cleanResume, label: label || "" };
  if (fileBase64) { candidateData.fileBase64 = fileBase64; candidateData.fileType = fileType || "application/pdf"; candidateData.fileName = fileName || "resume.pdf"; }
  const candidate = insert("candidates", candidateData);
  if (!req.user.candidate_ids) req.user.candidate_ids = [];
  req.user.candidate_ids.push(candidate.id);
  req.user.role = "candidate";
  saveDB();

  // ─── AI Matching ────────────────────────────────────────────────────────────
  const MAX_ACTIVE_REVIEWS = 3; // max pending reviews per reviewer at once

  // Exclude self; also exclude reviewers already at capacity
  const reviewerLoad = {};
  db.matches.filter(m => m.status === "pending").forEach(m => {
    reviewerLoad[m.reviewer_id] = (reviewerLoad[m.reviewer_id] || 0) + 1;
  });

  // Find the user account that owns this reviewer profile (by reviewer_id)
  // We exclude any reviewer whose owning user is the same person submitting the candidate
  const getReviewerOwner = (reviewerId) => db.users.find(u => u.reviewer_id === reviewerId);

  const eligibleReviewers = db.reviewers.filter(r => {
    // Only approved reviewers can be matched
    if (r.status !== "approved") return false;
    // Capacity check
    if ((reviewerLoad[r.id] || 0) >= MAX_ACTIVE_REVIEWS) return false;
    // Self-match check: exclude if the reviewer's user account is the same as the candidate's
    const reviewerOwner = getReviewerOwner(r.id);
    if (reviewerOwner && reviewerOwner.id === req.user.id) return false;
    return true;
  });

  // Check if candidate is already on waitlist
  const existingWaitlist = db.matches.find(m => m.candidate_id === candidate.id && m.status === "waitlist");
  const piiInfo = redactions.length > 0 ? { redactions } : {};
  if (existingWaitlist) return res.json({ candidate, match: existingWaitlist, waitlisted: true, ...piiInfo });

  // No available reviewers → waitlist
  if (eligibleReviewers.length === 0) {
    const waitlistMatch = insert("matches", { reviewer_id: null, candidate_id: candidate.id, rationale: "", status: "waitlist" });
    saveDB();
    console.log(`[matching] No available reviewers — candidate ${candidate.id} added to waitlist`);
    return res.json({ candidate, match: waitlistMatch, waitlisted: true, ...piiInfo });
  }

  const reviewerSummaries = eligibleReviewers.map(r => {
    let summary = `Reviewer ID ${r.id}: ${r.name}, ${r.role} at ${r.company}, ${r.years} years exp, areas: [${r.areas.join(", ")}]. Active reviews: ${reviewerLoad[r.id] || 0}/${MAX_ACTIVE_REVIEWS}.`;
    if (r.bio) summary += ` Bio: ${r.bio}`;
    if (r.resumeText) summary += `\nFull resume:\n${r.resumeText.slice(0, 1500)}`;
    return summary;
  }).join("\n\n---\n\n");

  const matchSystem = `You are a matching engine for a resume review platform. Your job is to rank reviewers for a given candidate and return a JSON array only — no markdown, no explanation.

Each object in the array must have:
- reviewer_id (number)
- score (1–10, integer)
- reasoning (2-3 sentences explaining WHY this reviewer is a good fit. Be specific: mention the reviewer's relevant experience, roles, companies, or skills that make them qualified to review this candidate's resume. Example: "Has 12 years in product management including VP-level roles at tech companies. Has directly hired for the type of role this candidate is targeting and can speak to what stands out.")

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

Reviewers (all have available capacity):
${reviewerSummaries}`;

  let bestReviewer = null;
  let rationale = "";

  try {
    const raw = await callClaude(matchSystem, matchPrompt, 800);
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const ranked = JSON.parse(cleaned);
    const MIN_MATCH_SCORE = 5; // below this, reviewer is not qualified enough — waitlist instead

    if (Array.isArray(ranked) && ranked.length > 0) {
      const alreadyMatched = new Set(
        db.matches.filter(m => m.candidate_id === candidate.id).map(m => m.reviewer_id)
      );
      // Only consider reviewers who clear the minimum quality bar
      const qualified = ranked.filter(r => (r.score || 0) >= MIN_MATCH_SCORE && !alreadyMatched.has(r.reviewer_id));
      const best = qualified[0]; // already sorted best-first by Claude
      if (best) {
        bestReviewer = findById("reviewers", best.reviewer_id);
        if (bestReviewer) {
          // Use Claude's specific reasoning for this reviewer-candidate pair
          rationale = best.reasoning || `${bestReviewer.name} is a ${bestReviewer.role || "professional"} ${bestReviewer.years ? `with ${bestReviewer.years}+ years` : ""} in ${bestReviewer.areas?.[0] || targetArea}. Their background is well-suited to review a ${targetRole} resume.`;
        }
      }
      // If no reviewer clears the bar, bestReviewer stays null → falls through to waitlist below
    }
  } catch (e) {
    // Fallback to simple area match if Claude fails
    bestReviewer = eligibleReviewers.find(r => r.areas?.includes(targetArea)) || eligibleReviewers[0] || null;
    if (bestReviewer) {
      const matchedArea = bestReviewer.areas?.find(a => a === targetArea) || bestReviewer.areas?.[0] || targetArea;
      const seniorityNote = bestReviewer.years ? `with ${bestReviewer.years}+ years of experience` : "";
      rationale = `${bestReviewer.name} is a ${bestReviewer.role || "professional"} ${seniorityNote} in ${matchedArea}. Their background reviewing and hiring for similar roles can provide relevant perspective on this ${targetRole} resume.`;
    }
  }

  if (!bestReviewer) {
    // Claude returned no valid match despite eligible reviewers — waitlist
    const waitlistMatch = insert("matches", { reviewer_id: null, candidate_id: candidate.id, rationale: "", status: "waitlist" });
    saveDB();
    return res.json({ candidate, match: waitlistMatch, waitlisted: true });
  }

  const existingMatch = db.matches.find(m => m.reviewer_id === bestReviewer.id && m.candidate_id === candidate.id);
  const match = existingMatch || insert("matches", { reviewer_id: bestReviewer.id, candidate_id: candidate.id, rationale, status: "pending" });
  saveDB();

  // Notify reviewer
  if (!existingMatch) {
    const reviewerUser = db.users.find(u => u.reviewer_id === bestReviewer.id);
    if (reviewerUser?.email) {
      sendEmail({
        to: reviewerUser.email,
        subject: "You have a new resume to review on Zurio",
        html: `<p>Hi ${bestReviewer.name},</p>
<p>You've been matched with a candidate targeting <strong>${candidate.targetRole}</strong>.</p>
<p><strong>Why you:</strong> ${rationale || "Your background aligns with their target role."}</p>
<p><a href="${process.env.SERVER_URL || "https://zurio-api-production.up.railway.app"}">Open Zurio →</a></p>
<p style="color:#888;font-size:12px">You're receiving this because you signed up as a reviewer on Zurio.</p>`
      });
    }
  }

  res.json({ candidate, reviewer: bestReviewer, match, rationale, redactions: redactions.length > 0 ? redactions : undefined });
});

// Get all candidate submissions for current user
app.get("/api/candidates/mine", requireAuth, (req, res) => {
  const ids = req.user.candidate_ids || [];
  const submissions = ids.map(id => {
    const candidate = findById("candidates", id);
    if (!candidate) return null;
    const matches = db.matches
      .filter((m) => m.candidate_id === candidate.id)
      .map((m) => {
        const fb = db.feedback.find(f => f.match_id === m.id) || null;
        return { ...m, reviewer: findById("reviewers", m.reviewer_id), feedback: fb };
      });
    return { candidate, matches };
  }).filter(Boolean);
  res.json({ submissions });
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

app.get("/api/candidates/:id/file", requireAuth, (req, res) => {
  const candidate = findById("candidates", req.params.id);
  if (!candidate?.fileBase64) return res.status(404).json({ error: "No file available" });
  const buf = Buffer.from(candidate.fileBase64, "base64");
  res.set("Content-Type", candidate.fileType || "application/pdf");
  res.set("Content-Disposition", `inline; filename="${candidate.fileName || "resume.pdf"}"`);
  res.send(buf);
});

// ─── Waitlist backfill ────────────────────────────────────────────────────────
async function drainWaitlist(freedReviewerId) {
  const MAX_ACTIVE_REVIEWS = 3;
  const MIN_MATCH_SCORE = 5;
  const pendingCount = db.matches.filter(m => m.reviewer_id === freedReviewerId && m.status === "pending").length;
  const slotsAvailable = MAX_ACTIVE_REVIEWS - pendingCount;
  if (slotsAvailable <= 0) return;

  const reviewer = findById("reviewers", freedReviewerId);
  if (!reviewer) return;
  if (reviewer.status !== "approved") return; // only approved reviewers get matches
  const reviewerUser = db.users.find(u => u.reviewer_id === freedReviewerId);

  const waitlisted = db.matches.filter(m => m.status === "waitlist");
  if (waitlisted.length === 0) return;

  const eligible = waitlisted.filter(wm => {
    const candidate = findById("candidates", wm.candidate_id);
    if (!candidate) return false;
    const candUser = db.users.find(u => u.candidate_ids?.includes(candidate.id));
    if (reviewerUser && candUser && reviewerUser.id === candUser.id) return false;
    const alreadyMatched = db.matches.some(m => m.reviewer_id === freedReviewerId && m.candidate_id === candidate.id && m.status !== "waitlist");
    return !alreadyMatched;
  });
  if (eligible.length === 0) return;

  let filled = 0;
  for (const wm of eligible) {
    if (filled >= slotsAvailable) break;
    const candidate = findById("candidates", wm.candidate_id);
    if (!candidate) continue;
    let score = 0;
    let reasoning = "";
    try {
      const sys = `You are a matching engine. Rate how well this reviewer fits this candidate. Return JSON only: {"score": <1-10>, "reasoning": "<one sentence>"}`;
      const prompt = `Reviewer: ${reviewer.name}, ${reviewer.role} at ${reviewer.company}, ${reviewer.years} years, areas: [${reviewer.areas.join(", ")}]\n\nCandidate: ${candidate.name}, targeting ${candidate.targetRole} in ${candidate.targetArea}\nResume excerpt: ${(candidate.resume || "").slice(0, 800)}`;
      const raw = await callClaude(sys, prompt, 200);
      const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
      const result = JSON.parse(cleaned);
      score = result.score || 0;
      reasoning = result.reasoning || "";
    } catch (e) {
      // Fallback: simple area-based matching when Claude API is unavailable
      console.warn(`[backfill] AI unavailable for candidate ${candidate.id}, using area-based fallback:`, e.message);
      const areaMatch = reviewer.areas?.some(a =>
        a.toLowerCase().includes(candidate.targetArea?.toLowerCase() || "") ||
        (candidate.targetArea || "").toLowerCase().includes(a.toLowerCase())
      );
      score = areaMatch ? 6 : 5; // area match gets 6, otherwise still meets minimum
      const matchedArea = areaMatch ? (reviewer.areas.find(a => a.toLowerCase().includes(candidate.targetArea?.toLowerCase() || "")) || reviewer.areas[0]) : reviewer.areas?.[0];
      reasoning = areaMatch
        ? `${reviewer.name} is a ${reviewer.role || "professional"} ${reviewer.years ? `with ${reviewer.years}+ years` : ""} in ${matchedArea}. Their experience can provide relevant perspective for someone targeting ${candidate.targetRole}.`
        : `${reviewer.name} is a ${reviewer.role || "professional"} ${reviewer.years ? `with ${reviewer.years}+ years of experience` : ""}. They have capacity to review and can offer a senior perspective on this ${candidate.targetRole} resume.`;
    }
    if (score >= MIN_MATCH_SCORE) {
      wm.reviewer_id = freedReviewerId;
      wm.status = "pending";
      wm.rationale = reasoning || `${reviewer.name} has experience in ${reviewer.areas?.[0] || "this field"} and can provide relevant feedback for a ${candidate.targetRole} resume.`;
      saveDB();
      filled++;
      if (reviewerUser?.email) {
        sendEmail({ to: reviewerUser.email, subject: "New resume to review on Zurio",
          html: `<p>Hi ${reviewer.name},</p><p>You've been matched with a new candidate targeting <strong>${candidate.targetRole}</strong>.</p><p><a href="${process.env.SERVER_URL || "https://zurio-api-production.up.railway.app"}">Open Zurio →</a></p>` });
      }
    }
  }
  if (filled > 0) console.log(`[backfill] Assigned ${filled} waitlisted candidate(s) to reviewer ${freedReviewerId}`);
}

// ─── Resume info extraction ──────────────────────────────────────────────────
app.post("/api/extract-resume-info", requireAuth, async (req, res) => {
  const { resumeText } = req.body;
  if (!resumeText?.trim()) return res.status(400).json({ error: "resumeText required" });
  try {
    const sys = `You extract structured info from resumes. You MUST return ONLY a valid JSON object with no explanation, no markdown, no code fences. Example format:
{"role": "Software Engineer", "company": "Google", "years": "4–6", "areas": ["Software Engineering", "Backend"]}

Fields:
- role: current or most recent job title (string)
- company: current or most recent company (string)
- years: total experience, one of: "1–3", "4–6", "7–10", "10–15", "15+"
- areas: 1-4 items from: Software Engineering, AI/ML, Data Science, Product Management, Design, DevOps, Security, Mobile Development, Blockchain, Frontend, Backend, Cloud Infrastructure, Distributed Systems, UX, UX Research, NLP, Computer Vision, Data Engineering, Analytics, Product Analytics, Strategy, Full Stack

Return ONLY the JSON object.`;
    const raw = await callClaude(sys, resumeText.slice(0, 2000), 300);
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    // Try to extract JSON from the response even if there's extra text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const info = JSON.parse(jsonMatch[0]);
    res.json(info);
  } catch (e) {
    console.error("[extract-resume-info] AI unavailable, using regex fallback:", e.message);
    // ── Regex-based fallback extraction ──
    const text = resumeText.slice(0, 3000);
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

    // Extract role: look for common title patterns in first ~15 lines
    const TITLES = [
      "Software Engineer", "Senior Software Engineer", "Staff Engineer", "Principal Engineer",
      "Engineering Manager", "Director of Engineering", "VP of Engineering", "CTO", "CEO", "COO", "CFO",
      "Product Manager", "Senior Product Manager", "Group Product Manager", "Director of Product",
      "Data Scientist", "Senior Data Scientist", "ML Engineer", "Machine Learning Engineer", "AI Engineer",
      "Designer", "UX Designer", "Product Designer", "Senior Designer", "Design Lead",
      "Frontend Engineer", "Backend Engineer", "Full Stack Engineer", "Fullstack Engineer", "DevOps Engineer",
      "QA Engineer", "Test Engineer", "Security Engineer", "Penetration Tester",
      "Data Analyst", "Business Analyst", "Marketing Manager", "Sales Manager",
      "Program Manager", "Technical Program Manager", "Scrum Master", "Agile Coach",
      "Solutions Architect", "Cloud Architect", "System Administrator",
      "Consultant", "Analyst", "Associate", "Manager", "Director", "Vice President",
    ];
    let role = "";
    const headerLines = lines.slice(0, 15).join(" ");
    for (const t of TITLES) {
      if (headerLines.toLowerCase().includes(t.toLowerCase())) { role = t; break; }
    }
    // Also try "Title at Company" or "Title, Company" patterns
    const titleAtMatch = headerLines.match(/(?:^|\n)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Engineer|Manager|Designer|Scientist|Developer|Architect|Analyst|Lead|Director|Consultant))\s+(?:at|@|,)\s+([A-Za-z][A-Za-z0-9 &.]+)/i);

    // Extract company
    let company = "";
    if (titleAtMatch) {
      if (!role) role = titleAtMatch[1].trim();
      company = titleAtMatch[2].trim();
    }
    // Try "Company" from "at Company" or "@ Company" in first lines
    if (!company) {
      const atMatch = headerLines.match(/(?:at|@)\s+([A-Z][A-Za-z0-9 &.]{1,30})/);
      if (atMatch) company = atMatch[1].trim();
    }

    // Extract years of experience
    let years = "";
    const yearsMatch = text.match(/(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/i);
    if (yearsMatch) {
      const y = parseInt(yearsMatch[1]);
      if (y <= 3) years = "1–3";
      else if (y <= 6) years = "4–6";
      else if (y <= 10) years = "7–10";
      else if (y <= 15) years = "10–15";
      else years = "15+";
    } else {
      // Estimate from date ranges (e.g., "2015 - 2023", "2018 – Present")
      const dateRanges = [...text.matchAll(/\b(20\d{2}|19\d{2})\s*[-–—]\s*(20\d{2}|[Pp]resent|[Cc]urrent)\b/g)];
      if (dateRanges.length > 0) {
        const starts = dateRanges.map(m => parseInt(m[1]));
        const earliest = Math.min(...starts);
        const totalYears = new Date().getFullYear() - earliest;
        if (totalYears <= 3) years = "1–3";
        else if (totalYears <= 6) years = "4–6";
        else if (totalYears <= 10) years = "7–10";
        else if (totalYears <= 15) years = "10–15";
        else years = "15+";
      }
    }

    // Extract areas from keyword matching
    const AREA_KEYWORDS = {
      "Software Engineering": ["software engineer", "backend", "frontend", "full stack", "fullstack", "developer", "coding", "programming"],
      "AI/ML": ["machine learning", "deep learning", "artificial intelligence", "ai/ml", "ml engineer", "neural network", "tensorflow", "pytorch"],
      "Data Science": ["data scientist", "data science", "statistical", "statistics", "r programming", "jupyter"],
      "Product Management": ["product manager", "product management", "roadmap", "user stories", "prd", "product strategy"],
      "Design": ["ux design", "ui design", "product design", "figma", "sketch", "user experience", "user interface", "interaction design"],
      "DevOps": ["devops", "ci/cd", "kubernetes", "docker", "terraform", "infrastructure as code", "jenkins", "github actions"],
      "Security": ["security", "penetration test", "vulnerability", "cybersecurity", "infosec", "soc ", "siem"],
      "Mobile Development": ["ios", "android", "react native", "swift", "kotlin", "mobile app", "flutter"],
      "Frontend": ["react", "vue", "angular", "javascript", "typescript", "css", "html", "next.js", "frontend"],
      "Backend": ["node.js", "python", "java", "golang", "api design", "microservices", "rest api", "graphql", "backend"],
      "Cloud Infrastructure": ["aws", "azure", "gcp", "cloud", "ec2", "s3", "lambda", "serverless"],
      "Data Engineering": ["data pipeline", "etl", "data warehouse", "spark", "airflow", "kafka", "data engineer"],
      "Analytics": ["analytics", "tableau", "power bi", "looker", "sql", "business intelligence", "dashboards"],
    };
    const areas = [];
    const lowerText = text.toLowerCase();
    for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
      if (keywords.some(kw => lowerText.includes(kw))) areas.push(area);
      if (areas.length >= 4) break;
    }

    console.log(`[extract-resume-info] Fallback extracted: role="${role}", company="${company}", years="${years}", areas=[${areas}]`);
    res.json({ role, company, years, areas, fallback: true });
  }
});

// ─── Feedback routes ──────────────────────────────────────────────────────────
app.post("/api/feedback", requireAuth, (req, res) => {
  const { matchId, body } = req.body;
  if (!matchId || !body?.trim()) return res.status(400).json({ error: "matchId and body required" });
  const match = findById("matches", matchId);
  if (!match) return res.status(404).json({ error: "Match not found" });
  match.status = "done";
  const fb = insert("feedback", { match_id: Number(matchId), body });
  saveDB();

  // Backfill waitlisted candidates into freed reviewer slot
  drainWaitlist(match.reviewer_id).catch(e => console.error("[backfill] Error:", e.message));

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

// Score feedback quality via AI before submission
app.post("/api/feedback/score", requireAuth, async (req, res) => {
  const { feedbackText, candidateTargetRole } = req.body;
  if (!feedbackText?.trim()) return res.status(400).json({ error: "feedbackText required" });

  // Hard minimum: feedback must be at least 50 characters and 2+ sentences
  const wordCount = feedbackText.trim().split(/\s+/).length;
  if (wordCount < 15) {
    return res.json({ score: 1, suggestion: "Your feedback is too short. Please write at least a few sentences with specific observations about the resume.", minNotMet: true });
  }

  try {
    const sys = `You are a quality checker for resume review feedback. Score on a 1-10 scale.

SCORING RULES:
- 1-2: Garbage (single words, random text, irrelevant content, "looks good", "nice resume")
- 3-4: Low effort (generic advice with no specifics, e.g. "needs work" or "add more details")
- 5-6: Decent (mentions relevant topics but could be more specific or actionable)
- 7-8: Good (gives actionable suggestions, mentions specific areas to improve)
- 9-10: Excellent (detailed, specific, actionable, references multiple resume elements with concrete advice)

Return JSON only: {"score": <1-10>, "suggestion": "<specific instruction on what to add or fix to improve the feedback>"}

A single word or phrase like "good" or "honest" or "nice resume" MUST score 1-2. Feedback that gives numbered actionable suggestions referencing specific resume sections should score 7+.`;
    const raw = await callClaude(sys, `Feedback for a ${candidateTargetRole} resume:\n\n${feedbackText}`, 200);
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned);
    res.json(result);
  } catch (e) {
    console.error("[feedback/score] AI scoring failed:", e.message);
    res.json({ score: 7, suggestion: "AI scoring is temporarily unavailable. Your feedback has been auto-approved — please ensure it contains specific, actionable observations.", aiUnavailable: true });
  }
});

// Candidate rates the feedback they received
app.post("/api/feedback/:id/rating", requireAuth, (req, res) => {
  const fb = findById("feedback", req.params.id);
  if (!fb) return res.status(404).json({ error: "Feedback not found" });
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be 1-5" });
  fb.candidateRating = rating;
  fb.candidateComment = comment || "";
  saveDB();
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

// ─── Admin: DB export/import (protected by ADMIN_SECRET) ─────────────────────
const ADMIN_SECRET = process.env.ADMIN_SECRET || "zurio-admin-local";

function checkAdmin(req, res, next) {
  const token = req.headers["x-admin-secret"] || req.query.secret;
  if (token !== ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
  next();
}

app.get("/api/admin/export", checkAdmin, (req, res) => {
  res.json({ db, nextId, exportedAt: new Date().toISOString() });
});

app.post("/api/admin/import", checkAdmin, express.json({ limit: "50mb" }), (req, res) => {
  const { db: importedDb, nextId: importedNextId } = req.body;
  if (!importedDb || !importedNextId) return res.status(400).json({ error: "Invalid payload — need { db, nextId }" });
  db = importedDb;
  if (!db.users) db.users = [];
  if (!db.reviewers) db.reviewers = [];
  if (!db.candidates) db.candidates = [];
  if (!db.matches) db.matches = [];
  if (!db.feedback) db.feedback = [];
  nextId = importedNextId;
  saveDB();
  res.json({ ok: true, users: db.users.length, reviewers: db.reviewers.length, candidates: db.candidates.length });
});

// ─── Admin dashboard & match management ─────────────────────────────────────
app.get("/api/admin/dashboard", checkAdmin, (req, res) => {
  const stats = {
    users: db.users.length,
    reviewers: db.reviewers.length,
    candidates: db.candidates.length,
    matches: db.matches.length,
    pending: db.matches.filter(m => m.status === "pending").length,
    done: db.matches.filter(m => m.status === "done").length,
    waitlisted: db.matches.filter(m => m.status === "waitlist").length,
    feedback: db.feedback.length,
  };

  const reviewers = db.reviewers.map(r => {
    const user = db.users.find(u => u.reviewer_id === r.id);
    return {
      ...r, resumeText: undefined,
      email: user?.email,
      status: r.status || "approved", // backcompat: old reviewers default to approved
      linkedin: r.linkedin || "",
      aiAssessment: r.aiAssessment || "",
      flags: r.flags || [],
      pendingCount: db.matches.filter(m => m.reviewer_id === r.id && m.status === "pending").length,
      doneCount: db.matches.filter(m => m.reviewer_id === r.id && m.status === "done").length,
    };
  });

  const candidates = db.candidates.map(c => {
    const match = db.matches.find(m => m.candidate_id === c.id && m.status !== "waitlist") ||
                  db.matches.find(m => m.candidate_id === c.id);
    const reviewer = match?.reviewer_id ? db.reviewers.find(r => r.id === match.reviewer_id) : null;
    return {
      id: c.id, name: c.name, email: c.email, currentRole: c.currentRole, targetRole: c.targetRole, targetArea: c.targetArea,
      created_at: c.created_at,
      matchStatus: match?.status || "unmatched",
      reviewerName: reviewer?.name || null,
    };
  });

  const matches = db.matches.map(m => {
    const reviewer = m.reviewer_id ? db.reviewers.find(r => r.id === m.reviewer_id) : null;
    const candidate = db.candidates.find(c => c.id === m.candidate_id);
    const feedback = db.feedback.find(f => f.match_id === m.id);
    return {
      id: m.id, status: m.status, rationale: m.rationale, created_at: m.created_at,
      reviewer: reviewer ? { id: reviewer.id, name: reviewer.name, role: reviewer.role, company: reviewer.company, areas: reviewer.areas } : null,
      candidate: candidate ? { id: candidate.id, name: candidate.name, currentRole: candidate.currentRole, targetRole: candidate.targetRole, targetArea: candidate.targetArea } : null,
      hasFeedback: !!feedback,
      feedbackRating: feedback?.candidateRating || null,
    };
  });

  res.json({ stats, reviewers, candidates, matches });
});

app.post("/api/admin/matches/:id/reassign", checkAdmin, (req, res) => {
  const matchId = parseInt(req.params.id);
  const { reviewer_id } = req.body;
  const match = findById("matches", matchId);
  if (!match) return res.status(404).json({ error: "Match not found" });
  const reviewer = findById("reviewers", reviewer_id);
  if (!reviewer) return res.status(400).json({ error: "Reviewer not found" });
  // Self-match check
  const reviewerUser = db.users.find(u => u.reviewer_id === reviewer_id);
  const candidateUser = db.users.find(u => (u.candidate_ids || []).includes(match.candidate_id));
  if (reviewerUser && candidateUser && reviewerUser.id === candidateUser.id) {
    return res.status(400).json({ error: "Cannot match a reviewer with their own candidate submission" });
  }
  match.reviewer_id = reviewer_id;
  if (match.status === "waitlist") match.status = "pending";
  match.rationale = "Manually assigned by admin";
  saveDB();
  const candidate = findById("candidates", match.candidate_id);
  res.json({ match: { ...match, reviewer: { id: reviewer.id, name: reviewer.name, role: reviewer.role }, candidate: { id: candidate?.id, name: candidate?.name, currentRole: candidate?.currentRole, targetRole: candidate?.targetRole } } });
});

app.post("/api/admin/matches/:id/unassign", checkAdmin, (req, res) => {
  const matchId = parseInt(req.params.id);
  const match = findById("matches", matchId);
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.status === "done") return res.status(400).json({ error: "Cannot unassign a completed review" });
  match.reviewer_id = null;
  match.status = "waitlist";
  match.rationale = "";
  saveDB();
  res.json({ match });
});

app.post("/api/admin/matches/force", checkAdmin, (req, res) => {
  const { reviewer_id, candidate_id } = req.body;
  const reviewer = findById("reviewers", reviewer_id);
  const candidate = findById("candidates", candidate_id);
  if (!reviewer) return res.status(400).json({ error: "Reviewer not found" });
  if (!candidate) return res.status(400).json({ error: "Candidate not found" });
  // Self-match check
  const reviewerUser = db.users.find(u => u.reviewer_id === reviewer_id);
  const candidateUser = db.users.find(u => (u.candidate_ids || []).includes(candidate_id));
  if (reviewerUser && candidateUser && reviewerUser.id === candidateUser.id) {
    return res.status(400).json({ error: "Cannot match a reviewer with their own candidate submission" });
  }
  // Check for existing waitlist entry to convert
  const existing = db.matches.find(m => m.candidate_id === candidate_id && m.status === "waitlist");
  if (existing) {
    existing.reviewer_id = reviewer_id;
    existing.status = "pending";
    existing.rationale = "Manually assigned by admin";
    saveDB();
    return res.json({ match: existing });
  }
  // Check duplicate
  const dupe = db.matches.find(m => m.reviewer_id === reviewer_id && m.candidate_id === candidate_id && m.status !== "waitlist");
  if (dupe) return res.status(409).json({ error: "Match already exists between this reviewer and candidate" });
  const match = insert("matches", { reviewer_id, candidate_id, status: "pending", rationale: "Manually assigned by admin" });
  saveDB();
  res.json({ match });
});

app.delete("/api/admin/matches/:id", checkAdmin, (req, res) => {
  const matchId = parseInt(req.params.id);
  const idx = db.matches.findIndex(m => m.id === matchId);
  if (idx === -1) return res.status(404).json({ error: "Match not found" });
  // Also remove associated feedback
  db.feedback = db.feedback.filter(f => f.match_id !== matchId);
  db.matches.splice(idx, 1);
  saveDB();
  res.json({ ok: true });
});

// ─── Reviewer approval ──────────────────────────────────────────────────────
app.post("/api/admin/reviewers/:id/approve", checkAdmin, async (req, res) => {
  const reviewer = findById("reviewers", parseInt(req.params.id));
  if (!reviewer) return res.status(404).json({ error: "Reviewer not found" });
  reviewer.status = "approved";
  saveDB();
  console.log(`[admin] Approved reviewer: ${reviewer.name} (${reviewer.id})`);
  // Try to assign waiting candidates to the newly approved reviewer
  try { await drainWaitlist(reviewer.id); } catch(e) { console.error("[drainWaitlist]", e.message); }
  res.json({ reviewer: { id: reviewer.id, name: reviewer.name, status: reviewer.status } });
});

app.post("/api/admin/reviewers/:id/reject", checkAdmin, (req, res) => {
  const reviewer = findById("reviewers", parseInt(req.params.id));
  if (!reviewer) return res.status(404).json({ error: "Reviewer not found" });
  reviewer.status = "rejected";
  saveDB();
  console.log(`[admin] Rejected reviewer: ${reviewer.name} (${reviewer.id})`);
  res.json({ reviewer: { id: reviewer.id, name: reviewer.name, status: reviewer.status } });
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

  const system = `You are a matching engine for a resume review platform. Return a JSON array only — no markdown, no explanation, no code fences.

Each object must have:
- reviewer_id (number)
- score (1-10, integer)
- reasoning (2-3 sentences explaining WHY this reviewer is a good fit. Be specific: mention the reviewer's relevant experience, roles, companies, or skills that make them qualified to review this candidate's resume.)
- seniority_ok (boolean — is the reviewer senior enough?)
- field_match (boolean — does the reviewer's field overlap?)

Score based on: field overlap, industry relevance, seniority (reviewer must be MORE senior than candidate target).
Return ALL reviewers ranked best to worst. JSON array only — no other text.`;

  const prompt = `Candidate targeting: ${targetRole} in ${targetArea}\nResume: ${resume.slice(0, 1500)}\n\nReviewers:\n${reviewerSummaries}`;

  try {
    const raw = await callClaude(system, prompt, 2000);
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const scores = JSON.parse(cleaned);
    // Enrich with reviewer details
    const enriched = scores.map(s => {
      const rev = pool.find(r => r.id === s.reviewer_id);
      return { ...s, reviewer: rev?.name, reviewer_role: rev?.role, reviewer_company: rev?.company, reviewer_years: rev?.years, reviewer_areas: rev?.areas };
    });
    res.json({ scores: enriched, pool_size: pool.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`✅ Zurio server on http://localhost:${PORT}`));