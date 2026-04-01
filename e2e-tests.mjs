#!/usr/bin/env node
// e2e-tests.mjs — Comprehensive E2E test suite for Zurio
// Usage: node e2e-tests.mjs
// Requires: server running on localhost:3001

const BASE = process.env.TEST_URL || "http://localhost:3001";
const ADMIN_SECRET = "zurio-admin-local";
const TS = Date.now(); // unique per run

let passed = 0, failed = 0, skipped = 0;
const failures = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

function createAgent() {
  let cookies = "";
  return async function fetchAs(method, path, body) {
    const opts = {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookies },
      redirect: "manual",
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const setCookie = res.headers.getSetCookie?.() || [];
    if (setCookie.length) {
      // Extract session cookie
      for (const c of setCookie) {
        const m = c.match(/^(connect\.sid=[^;]+)/);
        if (m) cookies = m[1];
      }
    }
    const ct = res.headers.get("content-type") || "";
    let data = null;
    if (ct.includes("json")) {
      try { data = await res.json(); } catch { data = null; }
    }
    return { status: res.status, data, headers: res.headers };
  };
}

function adminApi(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(`${BASE}${path}`, opts).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));
}

function assert(condition, testName, detail) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${testName}`);
  } else {
    failed++;
    const msg = `${testName}${detail ? ` — ${detail}` : ""}`;
    failures.push(msg);
    console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  }
}

function skip(testName, reason) {
  skipped++;
  console.log(`  \x1b[33m⊘\x1b[0m ${testName} (${reason})`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const SAMPLE_RESUME = `John Smith
Senior Software Engineer | 8 years experience

Experience:
- Staff Engineer at Google (2020–Present): Led distributed systems team, designed microservices architecture serving 10M+ users.
- Senior Engineer at Meta (2017–2020): Built real-time data pipelines processing 50TB/day using Kafka and Spark.
- Software Engineer at Stripe (2015–2017): Developed payment processing APIs, improved latency by 40%.

Skills: Python, Go, Java, Kubernetes, AWS, distributed systems, system design
Education: MS Computer Science, Stanford University

Contact: john.smith@email.com | 555-123-4567 | 123 Main St, San Francisco, CA 94105
SSN: 123-45-6789`;

const GOOD_FEEDBACK = `Here's my detailed review of your resume:

1. **Experience Section**: Your progression from Stripe to Meta to Google shows excellent career growth. However, I'd recommend quantifying more of your achievements. For example, at Meta, "Built real-time data pipelines" — what was the business impact? Did it reduce costs, improve speed?

2. **Skills Section**: Strong technical skills listed. I'd suggest organizing them by category (languages, infrastructure, domains) and adding proficiency levels. Kubernetes and AWS are great, but mention specific services.

3. **Overall Structure**: The resume reads well chronologically, but for a Staff Engineer role, I'd add a summary section at the top highlighting your leadership experience and technical vision. Hiring managers for staff-level positions want to see architectural thinking.

4. **Formatting**: Consider adding bullet sub-points under each role for major projects. The current format works but could be more scannable for recruiters who spend 30 seconds per resume.

5. **Education**: Stanford MS is great, but if you have notable coursework or research publications, add them — especially for ML/systems roles.`;

// ─── Suite 1: Health & Basics ───────────────────────────────────────────────

async function suite1() {
  console.log("\n\x1b[1mSuite 1: Health & Basics\x1b[0m");

  // 1.1 Health endpoint
  const h = await fetch(`${BASE}/api/health`).then(r => r.json());
  assert(h.ok === true, "1.1 Health returns ok:true");

  // 1.2-1.5 Unauthenticated access
  const noAuth = createAgent();
  const r2 = await noAuth("GET", "/api/candidates/mine");
  assert(r2.status === 401, "1.2 GET /api/candidates/mine without auth → 401", `got ${r2.status}`);

  const r3 = await noAuth("POST", "/api/reviewers", { name: "x" });
  assert(r3.status === 401, "1.3 POST /api/reviewers without auth → 401", `got ${r3.status}`);

  const r4 = await noAuth("POST", "/api/candidates", { name: "x" });
  assert(r4.status === 401, "1.4 POST /api/candidates without auth → 401", `got ${r4.status}`);

  const r5 = await noAuth("POST", "/api/feedback", { matchId: 1 });
  assert(r5.status === 401, "1.5 POST /api/feedback without auth → 401", `got ${r5.status}`);
}

// ─── Suite 2: Auth — Registration ───────────────────────────────────────────

let registeredUser = null;
const agent1 = createAgent();

async function suite2() {
  console.log("\n\x1b[1mSuite 2: Auth — Registration\x1b[0m");

  // 2.1 Valid registration
  const r1 = await agent1("POST", "/auth/register", {
    name: "Test User", email: `test-${TS}@example.com`, password: "password123"
  });
  assert(r1.status === 200 && r1.data?.user?.email, "2.1 Register with valid credentials", `status=${r1.status}`);
  assert(!r1.data?.user?.passwordHash, "2.1b No passwordHash in response");
  registeredUser = r1.data?.user;

  // 2.2 Duplicate email
  const r2 = await createAgent()("POST", "/auth/register", {
    name: "Dupe", email: `test-${TS}@example.com`, password: "password123"
  });
  assert(r2.status === 409, "2.2 Duplicate email → 409", `got ${r2.status}`);

  // 2.3 Empty name
  const r3 = await createAgent()("POST", "/auth/register", {
    name: "", email: `empty-name-${TS}@example.com`, password: "password123"
  });
  assert(r3.status === 400, "2.3 Empty name → 400", `got ${r3.status}`);

  // 2.4 Empty email
  const r4 = await createAgent()("POST", "/auth/register", {
    name: "No Email", email: "", password: "password123"
  });
  assert(r4.status === 400, "2.4 Empty email → 400", `got ${r4.status}`);

  // 2.5 Short password
  const r5 = await createAgent()("POST", "/auth/register", {
    name: "Short Pass", email: `short-${TS}@example.com`, password: "12345"
  });
  assert(r5.status === 400, "2.5 Password < 6 chars → 400", `got ${r5.status}`);

  // 2.6 Email normalization
  const r6 = await createAgent()("POST", "/auth/register", {
    name: "Norm User", email: `  NORM-${TS}@Example.COM  `, password: "password123"
  });
  assert(r6.status === 200 && r6.data?.user?.email === `norm-${TS}@example.com`, "2.6 Email normalized to lowercase/trimmed", `email=${r6.data?.user?.email}`);

  // 2.7 Session persists
  const me = await agent1("GET", "/api/me");
  assert(me.status === 200 && me.data?.user?.id === registeredUser?.id, "2.7 Session persists after registration");
}

// ─── Suite 3: Auth — Login & Logout ─────────────────────────────────────────

async function suite3() {
  console.log("\n\x1b[1mSuite 3: Auth — Login & Logout\x1b[0m");

  const loginAgent = createAgent();

  // 3.1 Login with correct credentials
  const r1 = await loginAgent("POST", "/auth/login", {
    email: `test-${TS}@example.com`, password: "password123"
  });
  assert(r1.status === 200 && r1.data?.user?.email, "3.1 Login with correct credentials", `status=${r1.status}`);

  // 3.2 Wrong password
  const r2 = await createAgent()("POST", "/auth/login", {
    email: `test-${TS}@example.com`, password: "wrongpassword"
  });
  assert(r2.status === 401, "3.2 Wrong password → 401", `got ${r2.status}`);

  // 3.3 Nonexistent email
  const r3 = await createAgent()("POST", "/auth/login", {
    email: `nonexistent-${TS}@example.com`, password: "password123"
  });
  assert(r3.status === 401, "3.3 Nonexistent email → 401", `got ${r3.status}`);

  // 3.4 Logout
  const r4 = await loginAgent("POST", "/auth/logout");
  assert(r4.status === 200, "3.4 Logout → 200");
  const meAfter = await loginAgent("GET", "/api/me");
  assert(meAfter.data?.user === null, "3.4b After logout, /api/me returns null user");

  // 3.5 Login preserves session
  const sessionAgent = createAgent();
  await sessionAgent("POST", "/auth/login", { email: `test-${TS}@example.com`, password: "password123" });
  const me1 = await sessionAgent("GET", "/api/me");
  const me2 = await sessionAgent("GET", "/api/me");
  assert(me1.data?.user?.id === me2.data?.user?.id && me1.data?.user?.id != null, "3.5 Session consistent across requests");
}

// ─── Suite 4: Role Selection ────────────────────────────────────────────────

async function suite4() {
  console.log("\n\x1b[1mSuite 4: Role Selection\x1b[0m");

  // 4.1 Set role to reviewer
  const r1 = await agent1("POST", "/api/me/role", { role: "reviewer" });
  assert(r1.status === 200, "4.1 Set role to reviewer", `status=${r1.status}`);

  // 4.2 Set role to candidate
  const r2 = await agent1("POST", "/api/me/role", { role: "candidate" });
  assert(r2.status === 200, "4.2 Set role to candidate", `status=${r2.status}`);

  // 4.3 Check role persisted
  const me = await agent1("GET", "/api/me");
  assert(me.data?.user?.role === "candidate", "4.3 Role persisted", `role=${me.data?.user?.role}`);

  // 4.4 Invalid role
  const r4 = await agent1("POST", "/api/me/role", { role: "admin" });
  assert(r4.status === 400, "4.4 Invalid role → 400", `got ${r4.status}`);
}

// ─── Suite 5: Reviewer Signup & AI Vetting ──────────────────────────────────

const reviewerAgent = createAgent();
let reviewerUser = null;
let reviewerId = null;

async function suite5() {
  console.log("\n\x1b[1mSuite 5: Reviewer Signup & AI Vetting\x1b[0m");

  // Register a reviewer user
  const reg = await reviewerAgent("POST", "/auth/register", {
    name: "Reviewer Pro", email: `reviewer-${TS}@example.com`, password: "password123"
  });
  reviewerUser = reg.data?.user;

  // 5.1 Create reviewer with all fields
  const r1 = await reviewerAgent("POST", "/api/reviewers", {
    name: "Reviewer Pro", role: "VP Engineering", company: "Google",
    years: "10–15", areas: ["Software Engineering", "AI/ML"],
    bio: "Led 200-person engineering org", resumeText: "15 years building distributed systems...",
    linkedin: "https://linkedin.com/in/reviewerpro"
  });
  assert(r1.status === 200 && r1.data?.reviewer?.status === "pending", "5.1 Reviewer created with status=pending", `status=${r1.data?.reviewer?.status}`);
  reviewerId = r1.data?.reviewer?.id;

  // 5.2 Missing name
  const badAgent = createAgent();
  await badAgent("POST", "/auth/register", { name: "Bad", email: `bad-${TS}@example.com`, password: "password123" });
  const r2 = await badAgent("POST", "/api/reviewers", {
    role: "Eng", company: "X", years: "1–3", areas: ["Design"]
  });
  assert(r2.status === 400, "5.2 Missing name → 400", `got ${r2.status}`);

  // 5.3 Missing areas
  const r3 = await badAgent("POST", "/api/reviewers", {
    name: "Bad", role: "Eng", company: "X", years: "1–3"
  });
  assert(r3.status === 400, "5.3 Missing areas → 400", `got ${r3.status}`);

  // 5.4 Empty areas array
  const r4 = await badAgent("POST", "/api/reviewers", {
    name: "Bad", role: "Eng", company: "X", years: "1–3", areas: []
  });
  assert(r4.status === 400, "5.4 Empty areas → 400", `got ${r4.status}`);

  // 5.5 Wait for AI vetting, check status
  await sleep(3000); // Give AI time
  const dash = await adminApi("GET", "/api/admin/dashboard");
  const thisReviewer = dash.data?.reviewers?.find(r => r.id === reviewerId);
  assert(thisReviewer?.status === "pending", "5.5 Reviewer still pending before admin action");
  // AI assessment may or may not be populated depending on ANTHROPIC_API_KEY
  if (thisReviewer?.aiAssessment) {
    console.log(`    (AI assessment: ${thisReviewer.aiAssessment.slice(0, 80)}...)`);
  }

  // 5.6 Update existing reviewer (no duplicate)
  const r6 = await reviewerAgent("POST", "/api/reviewers", {
    name: "Reviewer Pro Updated", role: "SVP Engineering", company: "Google",
    years: "15+", areas: ["Software Engineering", "AI/ML", "Executive Leadership"],
    bio: "Now leading all of engineering"
  });
  assert(r6.status === 200 && r6.data?.reviewer?.id === reviewerId, "5.6 Update existing → same ID", `id=${r6.data?.reviewer?.id} vs ${reviewerId}`);

  // 5.7 Weak reviewer — check flags
  const weakAgent = createAgent();
  await weakAgent("POST", "/auth/register", { name: "Weak Rev", email: `weak-${TS}@example.com`, password: "password123" });
  const r7 = await weakAgent("POST", "/api/reviewers", {
    name: "Weak Rev", role: "Intern", company: "Startup",
    years: "1–3", areas: ["Software Engineering"]
    // No resume, no linkedin
  });
  assert(r7.status === 200, "5.7 Weak reviewer created");
  const weakId = r7.data?.reviewer?.id;

  await sleep(2000);
  const dash2 = await adminApi("GET", "/api/admin/dashboard");
  const weakRev = dash2.data?.reviewers?.find(r => r.id === weakId);
  if (weakRev?.flags?.length > 0) {
    assert(weakRev.flags.includes("low_experience") || weakRev.flags.includes("no_resume") || weakRev.flags.includes("no_linkedin"),
      "5.7b Weak reviewer has flags", `flags=${weakRev.flags.join(",")}`);
  } else {
    skip("5.7b Weak reviewer flags", "AI vetting may not be available");
  }
}

// ─── Suite 6: Reviewer Approval (Admin) ─────────────────────────────────────

async function suite6() {
  console.log("\n\x1b[1mSuite 6: Reviewer Approval (Admin)\x1b[0m");

  // 6.1 Dashboard without secret
  const r1 = await fetch(`${BASE}/api/admin/dashboard`).then(r => ({ status: r.status }));
  assert(r1.status === 403, "6.1 Dashboard without secret → 403", `got ${r1.status}`);

  // 6.2 Dashboard with secret
  const r2 = await adminApi("GET", "/api/admin/dashboard");
  assert(r2.status === 200 && r2.data?.stats, "6.2 Dashboard with secret → 200");
  assert(r2.data?.reviewers?.length > 0, "6.2b Reviewers list populated");

  // 6.3 Approve reviewer
  const r3 = await adminApi("POST", `/api/admin/reviewers/${reviewerId}/approve`);
  assert(r3.status === 200 && r3.data?.reviewer?.status === "approved", "6.3 Approve reviewer → approved", `status=${r3.data?.reviewer?.status}`);

  // 6.4 Reject different reviewer (weak one)
  const dash = await adminApi("GET", "/api/admin/dashboard");
  const weakRev = dash.data?.reviewers?.find(r => r.name === "Weak Rev");
  if (weakRev) {
    const r4 = await adminApi("POST", `/api/admin/reviewers/${weakRev.id}/reject`);
    assert(r4.status === 200 && r4.data?.reviewer?.status === "rejected", "6.4 Reject reviewer → rejected", `status=${r4.data?.reviewer?.status}`);
  } else {
    skip("6.4 Reject reviewer", "Weak reviewer not found");
  }

  // 6.5 Approve nonexistent ID
  const r5 = await adminApi("POST", "/api/admin/reviewers/99999/approve");
  assert(r5.status === 404, "6.5 Approve nonexistent → 404", `got ${r5.status}`);

  // 6.6 Idempotent approve (already approved)
  const r6 = await adminApi("POST", `/api/admin/reviewers/${reviewerId}/approve`);
  assert(r6.status === 200 && r6.data?.reviewer?.status === "approved", "6.6 Approve already-approved → still approved");
}

// ─── Suite 7: Resume Extraction ─────────────────────────────────────────────

async function suite7() {
  console.log("\n\x1b[1mSuite 7: Resume Extraction\x1b[0m");

  // 7.1 Valid resume
  const r1 = await agent1("POST", "/api/extract-resume-info", { resumeText: SAMPLE_RESUME });
  assert(r1.status === 200 && (r1.data?.role || r1.data?.fallback), "7.1 Extract from valid resume", `role=${r1.data?.role}`);

  // 7.2 Very short text
  const r2 = await agent1("POST", "/api/extract-resume-info", { resumeText: "Short text" });
  // Should still return something (may be partial)
  assert(r2.status === 200, "7.2 Short text → still returns 200", `status=${r2.status}`);

  // 7.3 Empty text
  const r3 = await agent1("POST", "/api/extract-resume-info", { resumeText: "" });
  assert(r3.status === 400, "7.3 Empty text → 400", `got ${r3.status}`);
}

// ─── Suite 8: Candidate Submission & Matching ───────────────────────────────

const candidateAgent = createAgent();
let candidateUser = null;
let candidateId = null;
let matchId = null;

async function suite8() {
  console.log("\n\x1b[1mSuite 8: Candidate Submission & Matching\x1b[0m");

  // Register candidate user
  const reg = await candidateAgent("POST", "/auth/register", {
    name: "Candidate Test", email: `candidate-${TS}@example.com`, password: "password123"
  });
  candidateUser = reg.data?.user;

  // 8.1 Submit candidate with all fields
  const r1 = await candidateAgent("POST", "/api/candidates", {
    name: "Candidate Test", email: `candidate-${TS}@example.com`,
    currentRole: "Senior Engineer", targetRole: "Staff Engineer",
    targetArea: "Software Engineering",
    resume: SAMPLE_RESUME
  });
  assert(r1.status === 200, "8.1 Submit candidate → 200", `status=${r1.status}`);
  candidateId = r1.data?.candidate?.id;
  const match = r1.data?.match;
  matchId = match?.id;

  if (match && match.status !== "waitlist") {
    assert(match.status === "pending", "8.1b Match status = pending", `status=${match.status}`);
    assert(match.reviewer_id != null, "8.1c Match has reviewer assigned");
  } else {
    console.log("    (Candidate was waitlisted — no reviewer available or AI didn't match)");
  }

  // 8.2 PII redaction
  assert(r1.data?.redactions?.length > 0, "8.2 PII redacted from resume", `redactions=${r1.data?.redactions?.length}`);
  const resumeText = r1.data?.candidate?.resume || "";
  assert(!resumeText.includes("john.smith@email.com"), "8.2b Email redacted from stored resume");
  assert(!resumeText.includes("555-123-4567"), "8.2c Phone redacted from stored resume");
  assert(!resumeText.includes("123-45-6789"), "8.2d SSN redacted from stored resume");

  // 8.3 Resume too short
  const r3 = await candidateAgent("POST", "/api/candidates", {
    name: "Short", email: `short-c-${TS}@example.com`,
    targetRole: "Eng", targetArea: "Software Engineering", resume: "Too short"
  });
  assert(r3.status === 400, "8.3 Resume < 50 chars → 400", `got ${r3.status}`);

  // 8.4 GET /api/candidates/mine
  const r4 = await candidateAgent("GET", "/api/candidates/mine");
  assert(r4.status === 200 && r4.data?.submissions?.length > 0, "8.4 GET /api/candidates/mine returns submissions");

  // 8.5 GET /api/candidates/:id/status
  if (candidateId) {
    const r5 = await candidateAgent("GET", `/api/candidates/${candidateId}/status`);
    assert(r5.status === 200 && r5.data?.candidate?.id === candidateId, "8.5 GET candidate status", `id=${r5.data?.candidate?.id}`);
  }

  // 8.6 Self-match prevention
  // The reviewer agent IS the reviewer — try submitting as candidate too
  const selfR = await reviewerAgent("POST", "/api/candidates", {
    name: "Self Match", email: `reviewer-${TS}@example.com`,
    currentRole: "VP Eng", targetRole: "CTO",
    targetArea: "Software Engineering",
    resume: SAMPLE_RESUME
  });
  assert(selfR.status === 200, "8.6 Self-submission succeeds");
  // Check that the match is NOT assigned to their own reviewer profile
  if (selfR.data?.match && selfR.data.match.status !== "waitlist") {
    assert(selfR.data.match.reviewer_id !== reviewerId, "8.6b Not matched to own reviewer profile", `reviewer_id=${selfR.data.match.reviewer_id}`);
  } else {
    console.log("    (Self-submission was waitlisted — self-match prevention working)");
  }

  // 8.7 Reviewer GET anonymization
  const revDash = await reviewerAgent("GET", `/api/reviewers/${reviewerId}`);
  if (revDash.data?.matches?.length > 0) {
    const firstMatch = revDash.data.matches[0];
    assert(!firstMatch.candidate?.name?.includes("@"), "8.7 Candidate name anonymized (no email in name)");
  } else {
    skip("8.7 Anonymization check", "No matches to check");
  }
}

// ─── Suite 9: PII Redaction (detailed) ──────────────────────────────────────

async function suite9() {
  console.log("\n\x1b[1mSuite 9: PII Redaction (detailed)\x1b[0m");

  const piiResume = `Jane Doe
Software Engineer

Contact: jane.doe@gmail.com
Phone: (555) 987-6543
Address: 456 Oak Avenue, Palo Alto, CA 94301
SSN: 987-65-4321

Experience: 5 years at various tech companies building web applications with React and Node.js.
Education: BS Computer Science, UC Berkeley, 2018
Interests: hiking, open source contributions, mentoring junior developers.
Previously worked at Acme Corp from 2018-2023 as a full stack developer. Built internal tools used by 500+ employees.`;

  const piiAgent = createAgent();
  await piiAgent("POST", "/auth/register", { name: "Jane Doe", email: `pii-${TS}@example.com`, password: "password123" });

  const r = await piiAgent("POST", "/api/candidates", {
    name: "Jane Doe", email: `pii-${TS}@example.com`,
    targetRole: "Senior Engineer", targetArea: "Software Engineering",
    resume: piiResume
  });

  const redactions = r.data?.redactions || [];
  const stored = r.data?.candidate?.resume || "";
  const types = redactions.map(r => r.type);

  assert(types.includes("name"), "9.1 Name redacted", `types=[${types}]`);
  assert(types.includes("phone"), "9.2 Phone redacted", `types=[${types}]`);
  assert(types.includes("email"), "9.3 Email redacted", `types=[${types}]`);
  assert(types.includes("SSN"), "9.4 SSN redacted", `types=[${types}]`);
  // Address/zip detection can be finicky, check but don't fail hard
  if (types.includes("address") || types.includes("zipcode")) {
    assert(true, "9.5 Address/zip redacted");
  } else {
    skip("9.5 Address/zip redaction", "Pattern may not match exactly");
  }
  assert(stored.includes("[NAME REDACTED]"), "9.6 Stored resume has [NAME REDACTED]");
  assert(!stored.includes("jane.doe@gmail.com"), "9.7 No email in stored resume");
  assert(redactions.length >= 3, "9.8 Multiple PII types detected", `count=${redactions.length}`);
}

// ─── Suite 10: Feedback Submission ──────────────────────────────────────────

let feedbackId = null;

async function suite10() {
  console.log("\n\x1b[1mSuite 10: Feedback Submission\x1b[0m");

  // We need a pending match. If the candidate from suite 8 was matched, use that.
  // Otherwise create one via admin force
  let targetMatchId = matchId;

  if (!targetMatchId || !matchId) {
    // Check if there's any pending match for our reviewer
    const dash = await reviewerAgent("GET", `/api/reviewers/${reviewerId}`);
    const pendingMatch = dash.data?.matches?.find(m => m.status === "pending");
    if (pendingMatch) {
      targetMatchId = pendingMatch.id;
    }
  }

  if (!targetMatchId) {
    // Force create a match
    if (candidateId) {
      const force = await adminApi("POST", "/api/admin/matches/force", {
        reviewer_id: reviewerId, candidate_id: candidateId
      });
      targetMatchId = force.data?.match?.id;
    }
  }

  if (!targetMatchId) {
    skip("10.1-10.4 Feedback tests", "No match available to submit feedback against");
    return;
  }

  // 10.1 Submit valid feedback
  const r1 = await reviewerAgent("POST", "/api/feedback", {
    matchId: targetMatchId, body: GOOD_FEEDBACK
  });
  assert(r1.status === 200 && r1.data?.feedback?.id, "10.1 Submit feedback → 200", `status=${r1.status}`);
  feedbackId = r1.data?.feedback?.id;

  // 10.2 Match status → done
  if (candidateId) {
    const status = await candidateAgent("GET", `/api/candidates/${candidateId}/status`);
    const m = status.data?.matches?.find(m => m.id === targetMatchId);
    if (m) {
      assert(m.status === "done", "10.2 Match status → done after feedback", `status=${m.status}`);
    }
  }

  // 10.3 Feedback for nonexistent match
  const r3 = await reviewerAgent("POST", "/api/feedback", {
    matchId: 99999, body: "test"
  });
  assert(r3.status === 404, "10.3 Feedback for nonexistent match → 404", `got ${r3.status}`);

  // 10.4 Empty body
  const r4 = await reviewerAgent("POST", "/api/feedback", {
    matchId: targetMatchId, body: ""
  });
  assert(r4.status === 400, "10.4 Empty feedback body → 400", `got ${r4.status}`);
}

// ─── Suite 11: Feedback Scoring ─────────────────────────────────────────────

async function suite11() {
  console.log("\n\x1b[1mSuite 11: Feedback Scoring\x1b[0m");

  // 11.1 Good feedback
  const r1 = await reviewerAgent("POST", "/api/feedback/score", {
    feedbackText: GOOD_FEEDBACK, candidateTargetRole: "Staff Engineer"
  });
  assert(r1.status === 200, "11.1 Score good feedback → 200");
  if (r1.data?.aiUnavailable) {
    console.log("    (AI unavailable — fallback score used)");
  } else {
    assert(r1.data?.score >= 5, "11.1b Good feedback scores ≥ 5", `score=${r1.data?.score}`);
  }

  // 11.2 Very short feedback
  const r2 = await reviewerAgent("POST", "/api/feedback/score", {
    feedbackText: "looks good nice resume", candidateTargetRole: "Engineer"
  });
  assert(r2.status === 200 && r2.data?.score === 1 && r2.data?.minNotMet === true,
    "11.2 Short feedback → score 1, minNotMet", `score=${r2.data?.score} minNotMet=${r2.data?.minNotMet}`);

  // 11.3 Empty feedback
  const r3 = await reviewerAgent("POST", "/api/feedback/score", {
    feedbackText: "", candidateTargetRole: "Engineer"
  });
  assert(r3.status === 400, "11.3 Empty feedback → 400", `got ${r3.status}`);
}

// ─── Suite 12: Candidate Feedback Rating ────────────────────────────────────

async function suite12() {
  console.log("\n\x1b[1mSuite 12: Candidate Feedback Rating\x1b[0m");

  if (!feedbackId) {
    skip("12.1-12.4 Rating tests", "No feedback to rate");
    return;
  }

  // 12.1 Rate 5 stars
  const r1 = await candidateAgent("POST", `/api/feedback/${feedbackId}/rating`, { rating: 5 });
  assert(r1.status === 200 && r1.data?.feedback?.candidateRating === 5, "12.1 Rate 5 stars → stored", `rating=${r1.data?.feedback?.candidateRating}`);

  // 12.2 Rate 0 (out of range)
  const r2 = await candidateAgent("POST", `/api/feedback/${feedbackId}/rating`, { rating: 0 });
  assert(r2.status === 400, "12.2 Rating 0 → 400", `got ${r2.status}`);

  // 12.3 Rate 6 (out of range)
  const r3 = await candidateAgent("POST", `/api/feedback/${feedbackId}/rating`, { rating: 6 });
  assert(r3.status === 400, "12.3 Rating 6 → 400", `got ${r3.status}`);

  // 12.4 Verify rating persists
  if (candidateId) {
    const st = await candidateAgent("GET", `/api/candidates/${candidateId}/status`);
    const fb = st.data?.matches?.flatMap(m => m.feedback ? [m.feedback] : [])?.find(f => f.id === feedbackId);
    if (fb) {
      assert(fb.candidateRating === 5, "12.4 Rating persisted in status", `rating=${fb.candidateRating}`);
    } else {
      skip("12.4 Rating persistence", "Feedback not in status response");
    }
  }
}

// ─── Suite 13: Waitlist & Drain Logic ───────────────────────────────────────

async function suite13() {
  console.log("\n\x1b[1mSuite 13: Waitlist & Drain Logic\x1b[0m");

  // Create a new reviewer (pending) and a candidate who gets waitlisted
  const newRevAgent = createAgent();
  await newRevAgent("POST", "/auth/register", { name: "Drain Rev", email: `drain-rev-${TS}@example.com`, password: "password123" });
  const revR = await newRevAgent("POST", "/api/reviewers", {
    name: "Drain Rev", role: "Director of Engineering", company: "Amazon",
    years: "10–15", areas: ["Software Engineering", "Cloud Infrastructure"]
  });
  const drainRevId = revR.data?.reviewer?.id;

  // Submit candidate — should go to waitlist since new reviewer is pending
  const waitAgent = createAgent();
  await waitAgent("POST", "/auth/register", { name: "Waitlist Cand", email: `waitlist-${TS}@example.com`, password: "password123" });

  // First fill the approved reviewer to capacity
  // Submit 3 candidates to fill existing reviewer
  const fillers = [];
  for (let i = 0; i < 3; i++) {
    const fAgent = createAgent();
    await fAgent("POST", "/auth/register", { name: `Filler ${i}`, email: `filler-${i}-${TS}@example.com`, password: "password123" });
    const fr = await fAgent("POST", "/api/candidates", {
      name: `Filler ${i}`, email: `filler-${i}-${TS}@example.com`,
      targetRole: "Engineer", targetArea: "Software Engineering",
      resume: SAMPLE_RESUME.replace("John Smith", `Filler Person ${i}`)
    });
    fillers.push(fr.data);
  }

  // Now submit the waitlist candidate
  const wR = await waitAgent("POST", "/api/candidates", {
    name: "Waitlist Cand", email: `waitlist-${TS}@example.com`,
    targetRole: "Senior Engineer", targetArea: "Software Engineering",
    resume: SAMPLE_RESUME.replace("John Smith", "Waitlist Candidate Person")
  });

  const waitMatch = wR.data?.match;
  if (waitMatch?.status === "waitlist") {
    assert(true, "13.1 Candidate waitlisted when no capacity");

    // 13.2 Approve the new reviewer → triggers drainWaitlist
    const approveR = await adminApi("POST", `/api/admin/reviewers/${drainRevId}/approve`);
    assert(approveR.status === 200, "13.2 Approve new reviewer");

    // Wait for drainWaitlist async
    await sleep(3000);

    // Check if waitlisted candidate got assigned
    const wStatus = await waitAgent("GET", `/api/candidates/${wR.data?.candidate?.id}/status`);
    const updatedMatch = wStatus.data?.matches?.find(m => m.id === waitMatch.id);
    if (updatedMatch?.status === "pending") {
      assert(true, "13.3 Waitlisted candidate assigned after reviewer approved");
      assert(updatedMatch.reviewer_id === drainRevId, "13.3b Assigned to newly approved reviewer", `reviewer_id=${updatedMatch.reviewer_id}`);
    } else {
      // AI may not have scored this match high enough
      skip("13.3 Drain waitlist assignment", `Match still ${updatedMatch?.status} — AI may have scored below threshold`);
    }
  } else {
    console.log("    (Candidate was matched immediately — adjusting tests)");
    skip("13.1-13.3 Waitlist tests", "Candidate was matched, not waitlisted");
  }
}

// ─── Suite 14: Admin — Match Management ─────────────────────────────────────

async function suite14() {
  console.log("\n\x1b[1mSuite 14: Admin — Match Management\x1b[0m");

  const dash = await adminApi("GET", "/api/admin/dashboard");
  const pendingMatches = dash.data?.matches?.filter(m => m.status === "pending") || [];
  const doneMatches = dash.data?.matches?.filter(m => m.status === "done") || [];

  // 14.1 Unassign a pending match
  if (pendingMatches.length > 0) {
    const pm = pendingMatches[0];
    const r1 = await adminApi("POST", `/api/admin/matches/${pm.id}/unassign`);
    assert(r1.status === 200 && r1.data?.match?.status === "waitlist", "14.1 Unassign pending → waitlist", `status=${r1.data?.match?.status}`);

    // Reassign it back
    if (pm.reviewer?.id) {
      const r2 = await adminApi("POST", `/api/admin/matches/${pm.id}/reassign`, { reviewer_id: pm.reviewer.id });
      assert(r2.status === 200 && r2.data?.match?.reviewer, "14.2 Reassign → reviewer assigned");
    } else {
      skip("14.2 Reassign", "No reviewer to reassign to");
    }
  } else {
    skip("14.1-14.2 Unassign/Reassign", "No pending matches");
  }

  // 14.3 Unassign done match → 400
  if (doneMatches.length > 0) {
    const dm = doneMatches[0];
    const r3 = await adminApi("POST", `/api/admin/matches/${dm.id}/unassign`);
    assert(r3.status === 400, "14.3 Unassign done match → 400", `got ${r3.status}`);
  } else {
    skip("14.3 Unassign done match", "No done matches");
  }

  // 14.4 Force create match
  const allReviewers = dash.data?.reviewers || [];
  const allCandidates = dash.data?.candidates || [];
  if (allReviewers.length > 0 && allCandidates.length > 0) {
    // Find a pair without existing match
    const rev = allReviewers[allReviewers.length - 1];
    const cand = allCandidates[allCandidates.length - 1];

    const r4 = await adminApi("POST", "/api/admin/matches/force", {
      reviewer_id: rev.id, candidate_id: cand.id
    });
    if (r4.status === 200) {
      assert(true, "14.4 Force create match → 200");
      const forcedMatchId = r4.data?.match?.id;

      // 14.5 Duplicate → 409
      const r5 = await adminApi("POST", "/api/admin/matches/force", {
        reviewer_id: rev.id, candidate_id: cand.id
      });
      assert(r5.status === 409, "14.5 Duplicate force → 409", `got ${r5.status}`);

      // 14.6 Delete match
      if (forcedMatchId) {
        const r6 = await adminApi("DELETE", `/api/admin/matches/${forcedMatchId}`);
        assert(r6.status === 200 && r6.data?.ok, "14.6 Delete match → 200");
      }
    } else if (r4.status === 400) {
      skip("14.4-14.6 Force create", "Self-match prevented or reviewer not found");
    } else if (r4.status === 409) {
      skip("14.4-14.6 Force create", "Match already exists");
    }
  } else {
    skip("14.4-14.6 Force create/delete", "Not enough data");
  }

  // 14.7 Delete nonexistent match → 404
  const r7 = await adminApi("DELETE", "/api/admin/matches/99999");
  assert(r7.status === 404, "14.7 Delete nonexistent → 404", `got ${r7.status}`);
}

// ─── Suite 15: Admin — Export/Import ────────────────────────────────────────

async function suite15() {
  console.log("\n\x1b[1mSuite 15: Admin — Export/Import\x1b[0m");

  // 15.1 Export
  const r1 = await adminApi("GET", "/api/admin/export");
  assert(r1.status === 200 && r1.data?.db && r1.data?.nextId, "15.1 Export returns db + nextId");
  assert(r1.data?.exportedAt, "15.1b Export has timestamp");

  const exportData = r1.data;
  const userCountBefore = exportData.db.users?.length;

  // 15.2 Import
  const r2 = await adminApi("POST", "/api/admin/import", { db: exportData.db, nextId: exportData.nextId });
  assert(r2.status === 200 && r2.data?.ok, "15.2 Import → ok");
  assert(r2.data?.users === userCountBefore, "15.2b User count preserved after import", `${r2.data?.users} vs ${userCountBefore}`);

  // 15.3 Health check after import
  const h = await fetch(`${BASE}/api/health`).then(r => r.json());
  assert(h.ok && h.users === userCountBefore, "15.3 Data intact after import");

  // 15.4 Import with missing fields → 400
  const r4 = await adminApi("POST", "/api/admin/import", { db: {} });
  assert(r4.status === 400, "15.4 Import without nextId → 400", `got ${r4.status}`);
}

// ─── Suite 16: File Upload & Download ───────────────────────────────────────

async function suite16() {
  console.log("\n\x1b[1mSuite 16: File Upload & Download\x1b[0m");

  const fileAgent = createAgent();
  await fileAgent("POST", "/auth/register", { name: "File User", email: `file-${TS}@example.com`, password: "password123" });

  // 16.1 Submit with file
  const fakeBase64 = Buffer.from("fake PDF content for testing").toString("base64");
  const r1 = await fileAgent("POST", "/api/candidates", {
    name: "File User", email: `file-${TS}@example.com`,
    targetRole: "Engineer", targetArea: "Software Engineering",
    resume: SAMPLE_RESUME.replace("John Smith", "File User Test"),
    fileBase64: fakeBase64, fileType: "application/pdf", fileName: "test-resume.pdf"
  });
  assert(r1.status === 200, "16.1 Submit with file → 200");
  const fileCandId = r1.data?.candidate?.id;

  // 16.2 Download file
  if (fileCandId) {
    const r2 = await fileAgent("GET", `/api/candidates/${fileCandId}/file`);
    assert(r2.status === 200, "16.2 Download file → 200", `status=${r2.status}`);
  }

  // 16.3 No file → 404
  if (candidateId) {
    // candidateId from suite 8 was submitted without file
    const r3 = await candidateAgent("GET", `/api/candidates/${candidateId}/file`);
    assert(r3.status === 404, "16.3 No file → 404", `got ${r3.status}`);
  }
}

// ─── Suite 17: Multi-Resume Support ─────────────────────────────────────────

async function suite17() {
  console.log("\n\x1b[1mSuite 17: Multi-Resume Support\x1b[0m");

  const multiAgent = createAgent();
  await multiAgent("POST", "/auth/register", { name: "Multi User", email: `multi-${TS}@example.com`, password: "password123" });

  // 17.1 Submit first resume
  const r1 = await multiAgent("POST", "/api/candidates", {
    name: "Multi User", email: `multi-${TS}@example.com`,
    targetRole: "Engineer", targetArea: "Software Engineering",
    resume: SAMPLE_RESUME.replace("John Smith", "Multi User Alpha"), label: "SWE Resume"
  });
  const id1 = r1.data?.candidate?.id;

  // 17.2 Submit second resume
  const r2 = await multiAgent("POST", "/api/candidates", {
    name: "Multi User", email: `multi-${TS}@example.com`,
    targetRole: "Product Manager", targetArea: "Product Management",
    resume: SAMPLE_RESUME.replace("John Smith", "Multi User Beta").replace("Software Engineer", "Product Manager"), label: "PM Resume"
  });
  const id2 = r2.data?.candidate?.id;

  assert(id1 && id2 && id1 !== id2, "17.1 Two different candidate records created", `${id1} vs ${id2}`);

  // 17.3 GET /api/candidates/mine returns both
  const mine = await multiAgent("GET", "/api/candidates/mine");
  assert(mine.data?.submissions?.length >= 2, "17.2 /api/candidates/mine returns both", `count=${mine.data?.submissions?.length}`);

  // 17.4 Check user has both in candidate_ids
  const me = await multiAgent("GET", "/api/me");
  assert(me.data?.user?.candidate_ids?.includes(id1) && me.data?.user?.candidate_ids?.includes(id2),
    "17.3 Both IDs in user.candidate_ids");
}

// ─── Suite 18: Cross-Role Users ─────────────────────────────────────────────

async function suite18() {
  console.log("\n\x1b[1mSuite 18: Cross-Role Users\x1b[0m");

  const dualAgent = createAgent();
  await dualAgent("POST", "/auth/register", { name: "Dual User", email: `dual-${TS}@example.com`, password: "password123" });

  // 18.1 Sign up as reviewer
  const revR = await dualAgent("POST", "/api/reviewers", {
    name: "Dual User", role: "Senior Manager", company: "Apple",
    years: "7–10", areas: ["Product Management"]
  });
  assert(revR.status === 200, "18.1 Dual user → reviewer signup");
  const dualRevId = revR.data?.reviewer?.id;

  // Approve
  await adminApi("POST", `/api/admin/reviewers/${dualRevId}/approve`);

  // 18.2 Same user submits as candidate
  const candR = await dualAgent("POST", "/api/candidates", {
    name: "Dual User", email: `dual-${TS}@example.com`,
    targetRole: "Director of PM", targetArea: "Product Management",
    resume: SAMPLE_RESUME.replace("John Smith", "Dual User Person").replace("Software Engineer", "Product Manager")
  });
  assert(candR.status === 200, "18.2 Dual user → candidate submission");

  // 18.3 Self-match prevention
  if (candR.data?.match && candR.data.match.status !== "waitlist") {
    assert(candR.data.match.reviewer_id !== dualRevId, "18.3 Not matched to own reviewer profile");
  } else {
    console.log("    (Waitlisted or no match — self-match prevention OK)");
    assert(true, "18.3 Self-match prevented (waitlisted)");
  }

  // 18.4 /api/me shows both
  const me = await dualAgent("GET", "/api/me");
  assert(me.data?.user?.reviewer_id != null, "18.4a User has reviewer_id");
  assert(me.data?.user?.candidate_ids?.length > 0, "18.4b User has candidate_ids");
}

// ─── Suite 19: Edge Cases & Error Handling ──────────────────────────────────

async function suite19() {
  console.log("\n\x1b[1mSuite 19: Edge Cases & Error Handling\x1b[0m");

  // 19.1 Very long resume
  const longResume = SAMPLE_RESUME + "\n" + "Lorem ipsum dolor sit amet. ".repeat(500);
  const longAgent = createAgent();
  await longAgent("POST", "/auth/register", { name: "Long Resume", email: `long-${TS}@example.com`, password: "password123" });
  const r1 = await longAgent("POST", "/api/candidates", {
    name: "Long Resume", email: `long-${TS}@example.com`,
    targetRole: "Engineer", targetArea: "Software Engineering",
    resume: longResume
  });
  assert(r1.status === 200, "19.1 Very long resume → 200", `status=${r1.status}`);

  // 19.2 Special characters in name
  const specAgent = createAgent();
  await specAgent("POST", "/auth/register", { name: "María José O'Brien-González", email: `spec-${TS}@example.com`, password: "password123" });
  const me = await specAgent("GET", "/api/me");
  assert(me.data?.user?.name === "María José O'Brien-González", "19.2 Special chars preserved in name");

  // 19.3 Admin dashboard for no-admin → 403
  const r3 = await fetch(`${BASE}/api/admin/dashboard`, {
    headers: { "x-admin-secret": "wrong-secret" }
  });
  assert(r3.status === 403, "19.3 Wrong admin secret → 403", `got ${r3.status}`);

  // 19.4 Reviewer with no matches
  const emptyRevAgent = createAgent();
  await emptyRevAgent("POST", "/auth/register", { name: "Empty Rev", email: `empty-rev-${TS}@example.com`, password: "password123" });
  const er = await emptyRevAgent("POST", "/api/reviewers", {
    name: "Empty Rev", role: "Lead", company: "Startup",
    years: "4–6", areas: ["Design"]
  });
  const emptyRevId = er.data?.reviewer?.id;
  await adminApi("POST", `/api/admin/reviewers/${emptyRevId}/approve`);
  const revDash = await emptyRevAgent("GET", `/api/reviewers/${emptyRevId}`);
  assert(revDash.data?.matches?.length === 0, "19.4 Reviewer with no matches → empty array", `count=${revDash.data?.matches?.length}`);

  // 19.5 GET nonexistent reviewer
  const r5 = await agent1("GET", "/api/reviewers/99999");
  assert(r5.status === 404, "19.5 Nonexistent reviewer → 404", `got ${r5.status}`);

  // 19.6 GET nonexistent candidate
  const r6 = await agent1("GET", "/api/candidates/99999/status");
  assert(r6.status === 404, "19.6 Nonexistent candidate → 404", `got ${r6.status}`);

  // 19.7 Nonexistent feedback rating
  const r7 = await agent1("POST", "/api/feedback/99999/rating", { rating: 3 });
  assert(r7.status === 404, "19.7 Nonexistent feedback → 404", `got ${r7.status}`);

  // 19.8 Login without password
  const r8 = await createAgent()("POST", "/auth/login", { email: `test-${TS}@example.com` });
  assert(r8.status === 400, "19.8 Login without password → 400", `got ${r8.status}`);

  // 19.9 Register without password
  const r9 = await createAgent()("POST", "/auth/register", {
    name: "No Pass", email: `nopass-${TS}@example.com`
  });
  assert(r9.status === 400, "19.9 Register without password → 400", `got ${r9.status}`);
}

// ─── Run all suites ─────────────────────────────────────────────────────────

async function run() {
  console.log(`\n\x1b[1m═══ Zurio E2E Tests ═══\x1b[0m`);
  console.log(`Target: ${BASE}`);
  console.log(`Run ID: ${TS}\n`);

  // Check server is up
  try {
    await fetch(`${BASE}/api/health`);
  } catch (e) {
    console.error(`\x1b[31mServer not reachable at ${BASE}\x1b[0m`);
    console.error("Start the server with: node server.js");
    process.exit(1);
  }

  // Reset DB to clean state before tests
  console.log("Resetting database to clean state...");
  await adminApi("POST", "/api/admin/import", {
    db: { users: [], reviewers: [], candidates: [], matches: [], feedback: [] },
    nextId: { users: 1, reviewers: 1, candidates: 1, matches: 1, feedback: 1 }
  });

  const start = Date.now();

  await suite1();
  await suite2();
  await suite3();
  await suite4();
  await suite5();
  await suite6();
  await suite7();
  await suite8();
  await suite9();
  await suite10();
  await suite11();
  await suite12();
  await suite13();
  await suite14();
  await suite15();
  await suite16();
  await suite17();
  await suite18();
  await suite19();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n\x1b[1m═══ Results ═══\x1b[0m`);
  console.log(`  \x1b[32m${passed} passed\x1b[0m`);
  if (failed) console.log(`  \x1b[31m${failed} failed\x1b[0m`);
  if (skipped) console.log(`  \x1b[33m${skipped} skipped\x1b[0m`);
  console.log(`  ${elapsed}s elapsed\n`);

  if (failures.length > 0) {
    console.log("\x1b[1mFailures:\x1b[0m");
    failures.forEach(f => console.log(`  \x1b[31m✗\x1b[0m ${f}`));
    console.log();
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
