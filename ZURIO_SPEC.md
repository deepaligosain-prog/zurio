# Zurio — Complete Application Specification

> **AI-powered resume review platform** that matches job seekers with volunteer industry reviewers using Claude AI for intelligent matching, PII redaction, and feedback quality scoring.

**Production URL:** https://zurio-api-production.up.railway.app
**Repo:** https://github.com/deepaligosain-prog/zurio
**Branch:** `claude/wizardly-rubin`

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20+, Express 4.18 |
| Frontend | React 18, Vite 5 (SPA, single `App.jsx` file) |
| Database | JSON file (`zurio-data.json`) — ephemeral on Railway deploys |
| AI | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Auth | Email + password (bcryptjs), express-session with HttpOnly cookies |
| Email | Resend API (transactional notifications) |
| File parsing | pdfjs-dist (PDF), mammoth (DOCX), FileReader (TXT) |
| Hosting | Railway (auto-deploy from branch) |

**Key Dependencies:** `express`, `cors`, `express-session`, `bcryptjs`, `react`, `react-dom`, `vite`, `pdfjs-dist`, `mammoth`, `concurrently`

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  React SPA (src/App.jsx)                                  │
│  - Single file: all components, styles, routing           │
│  - Vite builds to /dist, served by Express in production  │
│  - API calls via fetch() with credentials: "include"      │
└──────────────┬───────────────────────────────────────────┘
               │  HTTP (same origin in prod)
┌──────────────▼───────────────────────────────────────────┐
│  Express Server (server.js)                               │
│  - REST API on PORT (default 3001)                        │
│  - Session middleware (connect.sid cookie)                 │
│  - Serves /dist as static in production                   │
│  - JSON file DB (zurio-data.json)                         │
│  - Claude API integration for matching/scoring/extraction │
│  - Resend API for email notifications                     │
└──────────────┬───────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────┐
│  External Services                                        │
│  - Anthropic API (Claude) — matching, scoring, extraction │
│  - Resend — transactional email                           │
└──────────────────────────────────────────────────────────┘
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default: 3001) |
| `SESSION_SECRET` | Express session encryption key |
| `ANTHROPIC_API_KEY` | Claude API key for AI features |
| `RESEND_API_KEY` | Resend email service key |
| `CLIENT_URL` | CORS origin (default: http://localhost:5173) |
| `SERVER_URL` | Public URL for email links |
| `NODE_ENV` | "production" for secure cookies |

---

## 3. Database Schema

The database is a single JSON file with 5 tables and auto-incrementing IDs:

### 3.1 Users

```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "Jane Doe",
  "passwordHash": "$2a$10$...",
  "picture": null,
  "role": "reviewer" | "candidate" | null,
  "reviewer_id": 1 | null,
  "candidate_ids": [1, 2, 3],
  "created_at": "2026-03-09T..."
}
```

- `role`: last-selected role; users can be both reviewer and candidate
- `reviewer_id`: FK to reviewers table (null if not a reviewer)
- `candidate_ids`: array of FKs to candidates table (one user can submit multiple resumes)
- `passwordHash`: bcrypt hash, **never** sent to client

### 3.2 Reviewers

```json
{
  "id": 1,
  "name": "Sarah Chen",
  "role": "Staff Engineer",
  "company": "Google",
  "years": "7-10",
  "areas": ["Software Engineering", "AI/ML"],
  "bio": "Optional bio text",
  "resumeText": "Full resume text for better matching",
  "created_at": "2026-03-09T..."
}
```

- `years`: one of "1-3", "4-6", "7-10", "10-15", "15+"
- `areas`: array from predefined list of 22 expertise areas
- `resumeText`: optional, extracted from uploaded file, used for richer AI matching

### 3.3 Candidates

```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "targetRole": "Senior Software Engineer",
  "targetArea": "Software Engineering",
  "resume": "PII-redacted resume text...",
  "label": "SWE Resume",
  "fileBase64": "JVBERi0xLjQ...",
  "fileType": "application/pdf",
  "fileName": "resume.pdf",
  "created_at": "2026-03-09T..."
}
```

- `resume`: stored AFTER PII redaction (the clean version)
- `label`: user-facing label to distinguish multiple submissions (auto-generated as "{targetRole} Resume" if not provided)
- `fileBase64`: original uploaded file stored as base64 (optional)
- One user can have many candidate submissions (multi-resume support)

### 3.4 Matches

```json
{
  "id": 1,
  "reviewer_id": 2,
  "candidate_id": 1,
  "rationale": "AI-generated explanation of why this reviewer was matched",
  "status": "pending" | "done" | "waitlist",
  "created_at": "2026-03-09T..."
}
```

- `status: "waitlist"` → no suitable reviewer available yet; `reviewer_id` is null
- `status: "pending"` → matched and awaiting review
- `status: "done"` → feedback has been submitted
- `rationale`: Claude-generated one-sentence explanation of the match

### 3.5 Feedback

```json
{
  "id": 1,
  "match_id": 1,
  "body": "Detailed feedback text...",
  "candidateRating": 4,
  "candidateComment": "",
  "created_at": "2026-03-09T..."
}
```

- `candidateRating`: 1-5 stars, set by candidate after receiving feedback
- One feedback per match

---

## 4. API Endpoints

### 4.1 Authentication

All endpoints except `/api/health`, `/api/me` (GET), and auth routes require authentication via `requireAuth` middleware (checks `req.session.userId`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Create account (name, email, password). Returns user object. Sets session. |
| POST | `/auth/login` | No | Login with email + password. Supports legacy migration (first login with password for old passwordless accounts sets it permanently). |
| POST | `/auth/logout` | No | Destroy session. Returns `{ ok: true }`. |
| GET | `/api/me` | No | Get current user from session. Returns `{ user: null }` if not authenticated. Includes nested `reviewer` and `candidates` objects. **Never returns passwordHash.** |
| POST | `/api/me/role` | Yes | Set user role to "reviewer" or "candidate". |

**Auth details:**
- Passwords hashed with bcryptjs (salt rounds: 10)
- Sessions: 7-day expiry, HttpOnly, secure in production, SameSite=none in production
- Email normalized to lowercase + trimmed
- Minimum password length: 6 characters
- Duplicate email → 409

### 4.2 Reviewer Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/reviewers` | Yes | Create or update reviewer profile. Required: name, role, company, years, areas. Optional: bio, resumeText. |
| GET | `/api/reviewers/:id` | Yes | Get reviewer + their matches. Candidates are **anonymized** (name shown as "Anonymous Candidate"). Self-matches excluded. |

**Anonymization in GET /api/reviewers/:id:**
- Candidate name replaced with "Anonymous Candidate"
- Resume text IS included (for review purposes) but with PII already redacted at submission time
- Self-match filtering: if reviewer and candidate are the same user, match is hidden

### 4.3 Candidate Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/candidates` | Yes | Submit resume for review. Triggers PII redaction → AI matching → email notification. |
| GET | `/api/candidates/mine` | Yes | Get all candidate submissions for current user with their matches and feedback. |
| GET | `/api/candidates/:id/status` | Yes | Get a specific candidate's status with matches and feedback. |
| GET | `/api/candidates/:id/file` | Yes | Download the original uploaded file (base64-decoded, sent as binary with correct Content-Type). Returns 404 if no file. |

### 4.4 Feedback Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/feedback` | Yes | Submit feedback for a match. Sets match.status="done". Triggers waitlist backfill + email to candidate. |
| POST | `/api/feedback/score` | Yes | AI-score feedback quality (1-10). Hard minimum: 15 words. Returns `{ score, suggestion }`. |
| POST | `/api/feedback/:id/rating` | Yes | Candidate rates received feedback 1-5 stars. |

### 4.5 AI Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/extract-resume-info` | Yes | Extract structured info (role, company, years, areas) from resume text via Claude. Returns empty defaults with `aiUnavailable: true` if AI fails. |
| POST | `/api/claude` | Yes | General Claude proxy. Accepts `{ system, messages, max_tokens }`. Used by frontend AI Assist feature. |
| POST | `/api/debug/match-scores` | Yes | Debug endpoint: score all reviewers against a resume. Returns enriched scores with reviewer details. |

### 4.6 Other

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check. Returns `{ ok, users, reviewers, candidates }` counts. |
| GET | `*` | No | Serves React SPA from /dist. |

---

## 5. Core Features & Business Logic

### 5.1 AI-Powered Matching

When a candidate submits a resume (`POST /api/candidates`):

1. **PII Redaction** — Remove personal info from resume text before storage
2. **Reviewer Pool Filtering:**
   - Exclude reviewers at capacity (max 3 pending reviews per reviewer)
   - Exclude self (same user account)
   - If no eligible reviewers → candidate goes to waitlist
3. **Claude Ranking** — AI scores all eligible reviewers 1-10 based on:
   - Field/expertise overlap with candidate's target role
   - Industry/company relevance
   - Seniority match (reviewer must be MORE senior than target role)
   - Resume content if available
4. **Minimum Quality Bar** — Only reviewers scoring ≥ 5 are considered
5. **Best Match Selected** — Top-scoring reviewer assigned
6. **Email Notification** — Reviewer gets email about new assignment
7. **Fallback** — If Claude fails, simple area-match fallback used

**Match Rationale:** Claude generates a one-sentence explanation of why the reviewer was chosen, displayed to both parties.

### 5.2 PII Auto-Redaction

The `redactPII(text, candidateName)` function runs on every resume submission:

1. **Name Redaction:** Full name, first name, and last name (3+ chars) replaced with `[NAME REDACTED]`
2. **Pattern-based Redaction:**
   - Phone numbers → `[PHONE REDACTED]`
   - Email addresses → `[EMAIL REDACTED]`
   - SSN (###-##-####) → `[SSN REDACTED]`
   - Street addresses → `[ADDRESS REDACTED]`
   - ZIP codes → `[ZIPCODE REDACTED]`
3. **Client Notification:** Redaction types/counts returned in API response
4. **Frontend Alert:** User shown what was redacted after submission

### 5.3 Candidate Anonymization

Reviewers never see candidate identity:
- **Dashboard:** All candidate names shown as "Anonymous Candidate"
- **Resume:** PII already stripped at submission time
- **Download:** File downloaded as generic "resume.pdf" (not "CandidateName Resume.pdf")
- **No candidate email/phone** exposed to reviewers

### 5.4 Feedback Quality Scoring

Two-step feedback submission flow:

**Step 1 — Score Preview (`POST /api/feedback/score`):**
- Hard minimum: 15 words required (returns score 1 + `minNotMet: true` if below)
- Claude scores 1-10 with specific suggestion for improvement
- Scoring rubric:
  - 1-2: Garbage (single words, vague)
  - 3-4: Low effort (generic, no specifics)
  - 5-6: Decent (relevant but not actionable)
  - 7-8: Good (actionable, references specific areas)
  - 9-10: Excellent (detailed, specific, concrete)

**Step 2 — Gate Check (Frontend):**
- Score < 6 → Submit button disabled, warning shown: "Score too low to send"
- Score ≥ 6 → Submit button enabled: "Send Feedback to Candidate →"
- "Edit & Re-score" option always available

**Graceful Fallback:** If Claude API is unavailable, returns `score: 7` with `aiUnavailable: true` flag so users aren't blocked.

### 5.5 Waitlist & Backfill

When a reviewer finishes a review, the system automatically tries to fill their freed slot:

1. `drainWaitlist(freedReviewerId)` called after feedback submission
2. Finds waitlisted candidates not already matched with this reviewer
3. Excludes self-matches
4. Calls Claude to score fit (must score ≥ 5)
5. Fills up to `MAX_ACTIVE_REVIEWS` (3) slots
6. Sends email notification to reviewer for each new assignment

### 5.6 Resume Info Extraction (AI Auto-Fill)

When a reviewer uploads a resume file:
1. File text extracted client-side (PDF/DOCX/TXT)
2. Text sent to `POST /api/extract-resume-info`
3. Claude extracts: role, company, years, areas
4. Form fields auto-filled (only empty fields overwritten)
5. If AI fails, empty defaults returned with `aiUnavailable: true` — user fills manually

### 5.7 Multi-Resume Submissions

- One user can submit multiple resumes for different roles
- Each submission is a separate candidate record with its own match
- `candidate_ids` array on user tracks all submissions
- Candidate dashboard shows all submissions with individual status
- Each submission can have a label (e.g., "PM Resume", "EM Resume")

### 5.8 Candidate Feedback Rating

After receiving feedback, candidates can rate it 1-5 stars:
- Star rating UI in candidate dashboard
- Stored as `candidateRating` on feedback record
- One-time: once rated, rating is locked
- Optional `candidateComment` field (not currently exposed in UI)

### 5.9 Resume Cross-Pollination

- If a user is both reviewer and candidate:
  - **Reviewer signup** auto-fills resume from their most recent candidate submission
  - **Candidate signup** auto-fills resume from their reviewer profile resumeText
  - Either can be replaced by uploading a different file

### 5.10 Self-Match Prevention

Three layers:
1. **At matching time:** Exclude reviewers whose user account matches the candidate's
2. **At display time:** Reviewer dashboard filters out matches where reviewer and candidate are the same user
3. **At startup:** Cleanup routine removes any legacy self-matches from before the fix

### 5.11 Email Notifications (Resend)

Two email triggers:
1. **Reviewer assigned** — When a new match is created (includes target role + rationale)
2. **Feedback ready** — When reviewer submits feedback (includes link to view)

Emails are fire-and-forget (errors logged but don't block the response). Skip silently if `RESEND_API_KEY` is not set.

### 5.12 File Storage

- Original resume files stored as base64 in the JSON database
- Uploaded via the candidate submission form
- Retrieved via `GET /api/candidates/:id/file` (base64-decoded, served as binary)
- Content-Type preserved from upload
- No size limit enforced (but practically limited by JSON DB)

---

## 6. Frontend (React SPA)

### 6.1 Component Tree

```
App
├── TopNav (sticky header with Reviewer/Candidate tabs, sign out)
├── LoginPage (email + password, sign in / create account toggle)
├── RolePicker (first-time user picks reviewer or candidate)
├── ReviewerSignup (reviewer profile form with resume upload + AI auto-fill)
├── CandidateSignup (resume submission form with file upload or paste)
├── ReviewerDashboard
│   └── MatchCard (one per assigned match)
│       └── InlineReview (two-column: resume | feedback editor)
├── CandidateStatus
│   └── SubmissionCard (one per resume submission)
│       └── FeedbackRating (star rating component)
```

### 6.2 Views & Navigation

| View State | Component | When Shown |
|------------|-----------|------------|
| `loading` | Spinner | Initial session check |
| `login` | LoginPage | No session |
| `pick-role` | RolePicker | Authenticated but no reviewer_id and no candidate_ids |
| `reviewer-setup` | ReviewerSignup | First time as reviewer |
| `candidate-setup` | CandidateSignup | First time as candidate or "Add Resume" |
| `reviewer-dashboard` | ReviewerDashboard | Has reviewer_id |
| `candidate-status` | CandidateStatus | Has candidate_ids |

Navigation is state-based (no React Router). Users toggle between Reviewer and Candidate tabs in TopNav.

### 6.3 Design System

- **Fonts:** Fraunces (serif headings), DM Mono (labels/badges), Instrument Sans (body)
- **Colors:** Cream background (#F4EFE6), ink text (#1C1917), amber (#D97706) for reviewers, blue (#1D4ED8) for candidates, green (#15803D) for completed states
- **Components:** Cards with subtle borders and shadows, pill badges, chip-style area selectors, drag-and-drop upload zones

### 6.4 InlineReview Component (Feedback Writing)

Two-column layout:
- **Left panel:** Resume display
  - If candidate uploaded a file: renders in iframe (PDF viewer)
  - If text only: styled document-like display with line wrapping
  - Download button: "Download PDF" (if file) or "Download Text" (if text only)
  - "Confidential" badge
- **Right panel:** Feedback editor
  - Textarea with placeholder prompts
  - "AI Assist" button → calls Claude for 3-4 starter suggestions
  - "Use as starting point" to merge AI text into editor
  - "Preview & Score Feedback" → calls scoring endpoint
  - Score display: color-coded (green ≥ 7, yellow ≥ 5, red < 5)
  - Score < 6 → "Score too low to send" (disabled button with warning)
  - Score ≥ 6 → "Send Feedback to Candidate →"
  - "Edit & Re-score" to revise

### 6.5 File Handling (Client-Side)

The `extractTextFromFile()` utility handles:
- **PDF:** Uses pdfjs-dist to extract text page by page (min 30 chars or error)
- **DOCX/DOC:** Uses mammoth to extract raw text (min 30 chars or error)
- **TXT:** Direct FileReader text read

Files are also read as base64 via FileReader for server-side storage.

---

## 7. Expertise Areas

Both reviewers and candidates select from these areas:

```
Software Engineering, Product Management, Data Science, Design,
Marketing, Finance, Operations, Sales, People & HR, Legal,
Executive Leadership, AI/ML
```

The extraction AI can also return from an extended list:
```
DevOps, Security, Mobile Development, Blockchain, Frontend, Backend,
Cloud Infrastructure, Distributed Systems, UX, UX Research, NLP,
Computer Vision, Data Engineering, Analytics, Product Analytics,
Strategy, Full Stack
```

---

## 8. Security

| Feature | Implementation |
|---------|---------------|
| Password hashing | bcryptjs, 10 salt rounds |
| Session management | express-session, 7-day HttpOnly cookies |
| CORS | Restricted to CLIENT_URL origin |
| Password never leaked | `passwordHash` stripped from all API responses via destructuring |
| Session validation | `requireAuth` middleware on all protected routes |
| PII protection | Automatic redaction before storage |
| Anonymization | Reviewer never sees candidate identity |
| Secure cookies | `secure: true`, `sameSite: "none"` in production |
| Trust proxy | `app.set("trust proxy", 1)` for Railway reverse proxy |

---

## 9. Seeding

`seed.mjs` generates test data for production:
- 25 reviewers across all expertise areas
- 100 candidates with realistic resumes
- All seeded accounts use password `Zurio2026!`
- Seeded emails follow pattern: `firstname.lastname@seed.zurio`

---

## 10. API Request/Response Examples

### Register
```
POST /auth/register
{ "name": "Jane Doe", "email": "jane@example.com", "password": "MyPass123" }
→ { "user": { "id": 1, "name": "Jane Doe", "email": "jane@example.com", "role": null, ... } }
```

### Submit Resume
```
POST /api/candidates
{
  "name": "Jane Doe", "email": "jane@example.com",
  "targetRole": "Staff Engineer", "targetArea": "Software Engineering",
  "resume": "Jane Doe, 555-123-4567, jane@gmail.com\nExperienced engineer at Google...",
  "fileBase64": "JVBERi0xLjQ...", "fileType": "application/pdf", "fileName": "resume.pdf"
}
→ {
  "candidate": { "id": 1, "resume": "[NAME REDACTED], [PHONE REDACTED], [EMAIL REDACTED]\nExperienced engineer at Google...", ... },
  "reviewer": { "id": 2, "name": "Sarah Chen", ... },
  "match": { "id": 1, "reviewer_id": 2, "candidate_id": 1, "status": "pending", "rationale": "Sarah's background in distributed systems..." },
  "rationale": "Sarah's background in distributed systems...",
  "redactions": [{ "type": "name", "original": "Jane Doe" }, { "type": "phone", "original": "555-123-4567" }, ...]
}
```

### Score Feedback
```
POST /api/feedback/score
{ "feedbackText": "Your resume is good.", "candidateTargetRole": "Staff Engineer" }
→ { "score": 2, "suggestion": "Add specific observations about the resume content..." }
```

### Submit Feedback
```
POST /api/feedback
{ "matchId": 1, "body": "Your experience with distributed systems is strong. I recommend..." }
→ { "feedback": { "id": 1, "match_id": 1, "body": "...", "created_at": "..." } }
```

---

## 11. Known Limitations & Future Work

1. **Ephemeral database** — JSON file on Railway resets every deploy. Need persistent storage (PostgreSQL/Supabase).
2. **PDF display for text-only resumes** — When candidate only pastes text (no file upload), there's no PDF to display in the iframe viewer. Currently shows styled text fallback.
3. **No password reset** — No forgot password or email verification flow.
4. **No rate limiting** — API endpoints don't have rate limiting.
5. **No pagination** — All data loaded at once.
6. **Single-file frontend** — All UI in one App.jsx (1070 lines). Could be split into modules.
7. **AI dependency** — Matching and scoring degrade gracefully when API is down, but core matching quality depends on Claude.

---

## 12. Running Locally

```bash
# Install
npm install

# Dev mode (Express + Vite hot reload)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Requires `ANTHROPIC_API_KEY` env var for AI features. Other env vars optional for local dev.
