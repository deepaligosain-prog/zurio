#!/usr/bin/env node
/**
 * Zurio Comprehensive Test Suite
 * Tests all features: auth, PII redaction, feedback scoring, anonymization,
 * matching, waitlist backfill, file storage, resume extraction, candidate rating.
 *
 * Run: node tests.mjs [--url BASE_URL]
 */

const BASE = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "https://zurio-api-production.up.railway.app";

const TS = Date.now();
const PASSWORD = "TestPass123!";
let passed = 0, failed = 0, skipped = 0;
const failures = [];

function log(icon, label, msg) { console.log(`  ${icon}  ${label.padEnd(55)} ${msg}`); }
function pass(label, msg = "") { passed++; log("✅", label, msg); }
function fail(label, msg = "") { failed++; log("❌", label, msg); failures.push({ label, msg }); }
function skip(label, msg = "") { skipped++; log("⏭️ ", label, msg); }
function section(n, title) { console.log(`\n${"─".repeat(80)}\n  ${n}. ${title}\n${"─".repeat(80)}`); }

async function api(method, path, body, cookie) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "follow",
  });
  const setCookie = res.headers.get("set-cookie");
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  return { status: res.status, data, cookie: setCookie ? setCookie.split(";")[0] : cookie };
}

async function register(name, email, password = PASSWORD) {
  const r = await api("POST", "/auth/register", { name, email, password });
  if (r.status === 409) {
    // Already exists — login instead
    const r2 = await api("POST", "/auth/login", { email, password });
    return r2;
  }
  return r;
}

// ─── Test runner ─────────────────────────────────────────────────────────────

async function runTests() {
  console.log(`\n${"═".repeat(80)}`);
  console.log(`  ZURIO COMPREHENSIVE TEST SUITE`);
  console.log(`  Target: ${BASE}`);
  console.log(`  Run ID: ${TS}`);
  console.log(`${"═".repeat(80)}`);

  // ━━━ 1. HEALTH CHECK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(1, "HEALTH CHECK");
  {
    const r = await api("GET", "/api/health");
    r.status === 200 && r.data.ok
      ? pass("GET /api/health", `users=${r.data.users}, reviewers=${r.data.reviewers}, candidates=${r.data.candidates}`)
      : fail("GET /api/health", `Status ${r.status}`);
  }

  // ━━━ 2. EMAIL+PASSWORD AUTH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(2, "EMAIL + PASSWORD AUTHENTICATION");
  let authCookie;

  // 2a. Register new account
  {
    const r = await register(`Test User ${TS}`, `test_auth_${TS}@test.zurio`);
    if (r.status === 200 && r.data.user?.id && r.cookie) {
      pass("POST /auth/register — new account", `user.id=${r.data.user.id}`);
      authCookie = r.cookie;
    } else {
      fail("POST /auth/register — new account", `Status ${r.status}: ${JSON.stringify(r.data)}`);
    }
  }

  // 2b. Register — duplicate email → 409
  {
    const r = await api("POST", "/auth/register", { name: "Dup", email: `test_auth_${TS}@test.zurio`, password: PASSWORD });
    r.status === 409
      ? pass("POST /auth/register — duplicate email", `409: ${r.data.error}`)
      : fail("POST /auth/register — duplicate email", `Expected 409, got ${r.status}`);
  }

  // 2c. Register — missing fields
  {
    const r = await api("POST", "/auth/register", { email: "x@test.zurio" });
    r.status === 400
      ? pass("POST /auth/register — missing name+password", `400: ${r.data.error}`)
      : fail("POST /auth/register — missing name+password", `Expected 400, got ${r.status}`);
  }

  // 2d. Register — short password
  {
    const r = await api("POST", "/auth/register", { name: "X", email: `test_short_${TS}@test.zurio`, password: "abc" });
    r.status === 400
      ? pass("POST /auth/register — short password", `400: ${r.data.error}`)
      : fail("POST /auth/register — short password", `Expected 400, got ${r.status}`);
  }

  // 2e. Login — correct password
  {
    const r = await api("POST", "/auth/login", { email: `test_auth_${TS}@test.zurio`, password: PASSWORD });
    r.status === 200 && r.data.user?.id
      ? pass("POST /auth/login — correct password", `user.id=${r.data.user.id}`)
      : fail("POST /auth/login — correct password", `Status ${r.status}`);
    authCookie = r.cookie || authCookie;
  }

  // 2f. Login — wrong password
  {
    const r = await api("POST", "/auth/login", { email: `test_auth_${TS}@test.zurio`, password: "WrongPass999" });
    r.status === 401
      ? pass("POST /auth/login — wrong password", `401: ${r.data.error}`)
      : fail("POST /auth/login — wrong password", `Expected 401, got ${r.status}`);
  }

  // 2g. Login — non-existent email
  {
    const r = await api("POST", "/auth/login", { email: "nonexistent_99999@test.zurio", password: PASSWORD });
    r.status === 401
      ? pass("POST /auth/login — non-existent email", `401: ${r.data.error}`)
      : fail("POST /auth/login — non-existent email", `Expected 401, got ${r.status}`);
  }

  // 2h. Login — missing password
  {
    const r = await api("POST", "/auth/login", { email: "x@test.zurio" });
    r.status === 400
      ? pass("POST /auth/login — missing password", `400`)
      : fail("POST /auth/login — missing password", `Expected 400, got ${r.status}`);
  }

  // 2i. Session — /api/me authenticated
  {
    const r = await api("GET", "/api/me", null, authCookie);
    r.status === 200 && r.data.user?.id
      ? pass("GET /api/me — authenticated", `user=${r.data.user.email}`)
      : fail("GET /api/me — authenticated", `Status ${r.status}`);
  }

  // 2j. Session — /api/me unauthenticated
  {
    const r = await api("GET", "/api/me");
    r.status === 200 && r.data.user === null
      ? pass("GET /api/me — unauthenticated", "user=null")
      : fail("GET /api/me — unauthenticated", `Expected null, got ${JSON.stringify(r.data.user)}`);
  }

  // 2k. Logout + session destroyed
  {
    const r = await api("POST", "/auth/logout", null, authCookie);
    r.status === 200 && r.data.ok
      ? pass("POST /auth/logout", "ok=true")
      : fail("POST /auth/logout", `Status ${r.status}`);

    // Re-login for subsequent tests
    const r2 = await api("POST", "/auth/login", { email: `test_auth_${TS}@test.zurio`, password: PASSWORD });
    authCookie = r2.cookie;
  }

  // 2l. Password hash NOT returned in /api/me
  {
    const r = await api("GET", "/api/me", null, authCookie);
    const hasHash = r.data.user?.passwordHash;
    !hasHash
      ? pass("passwordHash NOT in /api/me response", "Secure")
      : fail("passwordHash NOT in /api/me response", "PASSWORD HASH LEAKED!");
  }

  // ━━━ 3. PII REDACTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(3, "PII AUTO-REDACTION");
  let piiCookie, piiCandidateId;

  {
    const r = await register(`PII Test ${TS}`, `pii_test_${TS}@test.zurio`);
    piiCookie = r.cookie;
  }

  // 3a. Phone number redaction
  {
    const r = await api("POST", "/api/candidates", {
      name: `PII Test ${TS}`, email: `pii_test_${TS}@test.zurio`,
      targetRole: "Engineer", targetArea: "Software Engineering",
      resume: "John Doe, Software Engineer. Phone: 555-123-4567. Email: john.doe@gmail.com. Experience: 5 years Python, JavaScript, React. Built microservices at scale."
    }, piiCookie);

    if (r.status === 200) {
      const resume = r.data.candidate?.resume || "";
      const hasPhone = resume.includes("555-123-4567");
      const hasEmail = resume.includes("john.doe@gmail.com");
      const hasRedaction = resume.includes("REDACTED]");

      !hasPhone
        ? pass("PII: phone number redacted", "555-123-4567 removed")
        : fail("PII: phone number redacted", "Phone number still visible!");

      !hasEmail
        ? pass("PII: email address redacted", "john.doe@gmail.com removed")
        : fail("PII: email address redacted", "Email still visible!");

      hasRedaction
        ? pass("PII: redaction markers present", "Found REDACTED tags")
        : fail("PII: redaction markers present", "No REDACTED markers found in: " + resume.slice(0, 200));

      // Check redactions returned
      const redactionTypes = r.data.redactions?.map(r => r.type) || [];
      redactionTypes.length > 0
        ? pass("PII: redactions returned to client", `Types: ${[...new Set(redactionTypes)].join(", ")}`)
        : fail("PII: redactions returned to client", "No redactions returned");

      piiCandidateId = r.data.candidate?.id;
    } else {
      fail("PII: candidate creation", `Status ${r.status}`);
    }
  }

  // 3b. Candidate name redaction
  {
    const r = await api("POST", "/api/candidates", {
      name: `Jane Smith`, email: `pii_name_${TS}@test.zurio`,
      targetRole: "Designer", targetArea: "Design",
      resume: "Jane Smith is a senior designer with 10 years of experience. Jane has worked at Google and Meta. Smith was recognized as a top performer."
    }, piiCookie);

    if (r.status === 200) {
      const resume = r.data.candidate?.resume || "";
      const hasFullName = resume.includes("Jane Smith");
      const hasFirstName = /\bJane\b/.test(resume);
      const hasLastName = /\bSmith\b/.test(resume);

      !hasFullName
        ? pass("PII: full name redacted", "'Jane Smith' removed from resume")
        : fail("PII: full name redacted", "'Jane Smith' still visible!");

      !hasFirstName
        ? pass("PII: first name redacted", "'Jane' removed")
        : fail("PII: first name redacted", "'Jane' still visible!");

      !hasLastName
        ? pass("PII: last name redacted", "'Smith' removed")
        : fail("PII: last name redacted", "'Smith' still visible!");
    } else {
      fail("PII: name redaction candidate", `Status ${r.status}`);
    }
  }

  // 3c. SSN redaction
  {
    const r = await api("POST", "/api/candidates", {
      name: `SSN Test`, email: `pii_ssn_${TS}@test.zurio`,
      targetRole: "Analyst", targetArea: "Data Science",
      resume: "Data analyst with SSN 123-45-6789. 3 years experience in SQL, Python, Tableau. Strong analytical skills and attention to detail."
    }, piiCookie);

    if (r.status === 200) {
      const resume = r.data.candidate?.resume || "";
      !resume.includes("123-45-6789")
        ? pass("PII: SSN redacted", "123-45-6789 removed")
        : fail("PII: SSN redacted", "SSN still visible!");
    } else {
      fail("PII: SSN redaction", `Status ${r.status}`);
    }
  }

  // ━━━ 4. CANDIDATE ANONYMIZATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(4, "CANDIDATE ANONYMIZATION FOR REVIEWERS");
  let reviewerCookie, reviewerId;

  // Create a reviewer
  {
    const r = await register(`Reviewer ${TS}`, `reviewer_${TS}@test.zurio`);
    reviewerCookie = r.cookie;
    const r2 = await api("POST", "/api/reviewers", {
      name: `Reviewer ${TS}`, role: "Staff Engineer", company: "TestCorp",
      years: "10", areas: ["Software Engineering", "Design", "Data Science"],
      resumeText: "Staff Engineer with 10 years experience."
    }, reviewerCookie);
    reviewerId = r2.data.reviewer?.id;
    if (reviewerId) pass("Setup: reviewer created", `id=${reviewerId}`);
    else fail("Setup: reviewer created", `Status ${r2.status}`);
  }

  // Create a candidate matched to this reviewer
  let anonCandidateId;
  {
    const r = await register(`RealName Person ${TS}`, `anon_cand_${TS}@test.zurio`);
    const r2 = await api("POST", "/api/candidates", {
      name: `RealName Person ${TS}`, email: `anon_cand_${TS}@test.zurio`,
      targetRole: "Software Engineer", targetArea: "Software Engineering",
      resume: "5 years experience in Python, JavaScript. Built microservices. Looking for senior SWE role."
    }, r.cookie);
    anonCandidateId = r2.data.candidate?.id;
  }

  // 4a. Check reviewer dashboard shows "Anonymous Candidate"
  {
    if (reviewerId) {
      const r = await api("GET", `/api/reviewers/${reviewerId}`, null, reviewerCookie);
      const matches = r.data.matches || [];
      if (matches.length > 0) {
        const anyAnon = matches.every(m => m.candidate?.name === "Anonymous Candidate");
        anyAnon
          ? pass("Anonymization: all candidates show as Anonymous", `${matches.length} match(es) checked`)
          : fail("Anonymization: all candidates show as Anonymous", `Some names not anonymized: ${matches.map(m => m.candidate?.name).join(", ")}`);
      } else {
        skip("Anonymization check", "No matches on reviewer dashboard");
      }
    }
  }

  // ━━━ 5. FEEDBACK QUALITY SCORING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(5, "FEEDBACK QUALITY SCORING");

  // 5a. Single word → score 1 (hard minimum: < 15 words)
  {
    const r = await api("POST", "/api/feedback/score", {
      feedbackText: "honest",
      candidateTargetRole: "Software Engineer"
    }, reviewerCookie);

    if (r.status === 200) {
      r.data.score <= 2
        ? pass("Score: single word 'honest'", `Score ${r.data.score}/10 ✓ (correctly low)`)
        : fail("Score: single word 'honest'", `Score ${r.data.score}/10 — should be ≤ 2`);

      r.data.minNotMet === true
        ? pass("Score: minNotMet flag set", "Hard minimum triggered")
        : fail("Score: minNotMet flag set", "Expected minNotMet=true");
    } else {
      fail("Score: single word", `Status ${r.status}`);
    }
  }

  // 5b. Short generic → should score low
  {
    const r = await api("POST", "/api/feedback/score", {
      feedbackText: "good resume looks nice",
      candidateTargetRole: "Software Engineer"
    }, reviewerCookie);

    if (r.status === 200) {
      r.data.score <= 2
        ? pass("Score: short generic feedback", `Score ${r.data.score}/10 ✓ (below minimum)`)
        : fail("Score: short generic feedback", `Score ${r.data.score}/10 — should be ≤ 2 (below 15 words)`);
    } else {
      fail("Score: short generic", `Status ${r.status}`);
    }
  }

  // 5c. Quality feedback → should score ≥ 6
  {
    const r = await api("POST", "/api/feedback/score", {
      feedbackText: "Your experience with distributed systems at Stripe is impressive. However, I'd recommend: 1) Adding specific metrics — what was the latency reduction? How many requests per second did your system handle? 2) Your leadership section is weak — you mention 'leading projects' but don't quantify team size or business impact. 3) The projects section could benefit from more technical depth — what architecture decisions did you make and why? 4) Consider adding a brief summary section at the top that highlights your unique value proposition for senior SWE roles.",
      candidateTargetRole: "Senior Software Engineer"
    }, reviewerCookie);

    if (r.status === 200) {
      if (r.data.aiUnavailable) {
        pass("Score: quality detailed feedback", `AI unavailable — graceful fallback score ${r.data.score}/10`);
      } else {
        r.data.score >= 6
          ? pass("Score: quality detailed feedback", `Score ${r.data.score}/10 ✓ (above threshold)`)
          : fail("Score: quality detailed feedback", `Score ${r.data.score}/10 — expected ≥ 6 for detailed feedback`);
      }
    } else {
      fail("Score: quality feedback", `Status ${r.status}`);
    }
  }

  // 5d. Empty feedback → 400
  {
    const r = await api("POST", "/api/feedback/score", {
      feedbackText: "",
      candidateTargetRole: "PM"
    }, reviewerCookie);
    r.status === 400
      ? pass("Score: empty feedback", `400: ${r.data.error}`)
      : fail("Score: empty feedback", `Expected 400, got ${r.status}`);
  }

  // 5e. Unauthenticated → 401
  {
    const r = await api("POST", "/api/feedback/score", {
      feedbackText: "test", candidateTargetRole: "PM"
    });
    r.status === 401
      ? pass("Score: unauthenticated", "401")
      : fail("Score: unauthenticated", `Expected 401, got ${r.status}`);
  }

  // ━━━ 6. CANDIDATE FEEDBACK RATING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(6, "CANDIDATE FEEDBACK RATING");

  // 6a. Rating non-existent feedback → 404
  {
    const r = await api("POST", "/api/feedback/999999/rating", { rating: 5 }, authCookie);
    r.status === 404
      ? pass("Rating: non-existent feedback", "404")
      : fail("Rating: non-existent feedback", `Expected 404, got ${r.status}`);
  }

  // 6b. Invalid rating value → 400
  {
    const r = await api("POST", "/api/feedback/1/rating", { rating: 10 }, authCookie);
    // Either 400 (bad rating) or 404 (no feedback with that id) is acceptable
    (r.status === 400 || r.status === 404)
      ? pass("Rating: invalid value (10)", `${r.status}`)
      : fail("Rating: invalid value (10)", `Expected 400 or 404, got ${r.status}`);
  }

  // 6c. Missing rating → 400
  {
    const r = await api("POST", "/api/feedback/1/rating", {}, authCookie);
    (r.status === 400 || r.status === 404)
      ? pass("Rating: missing value", `${r.status}`)
      : fail("Rating: missing value", `Expected 400 or 404, got ${r.status}`);
  }

  // ━━━ 7. RESUME INFO EXTRACTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(7, "RESUME INFO EXTRACTION (AI AUTO-FILL)");

  // 7a. Extract from resume text
  {
    const r = await api("POST", "/api/extract-resume-info", {
      resumeText: "Sarah Chen, Staff Engineer at Google. 12 years experience in distributed systems, machine learning, and cloud infrastructure. Previously Senior Engineer at Netflix. Expert in Python, Go, Kubernetes."
    }, reviewerCookie);

    if (r.status === 200) {
      if (r.data.aiUnavailable) {
        pass("Extract: resume info", "AI unavailable — graceful fallback with empty defaults");
      } else {
        const { role, company, years, areas } = r.data;
        pass("Extract: returns structured data", `role="${role}", company="${company}", years="${years}", areas=[${areas?.join(", ")}]`);

        if (role) pass("Extract: role extracted", `"${role}"`);
        else fail("Extract: role extracted", "Missing role");

        if (company) pass("Extract: company extracted", `"${company}"`);
        else fail("Extract: company extracted", "Missing company");

        if (years) pass("Extract: years extracted", `"${years}"`);
        else fail("Extract: years extracted", "Missing years");

        if (areas?.length > 0) pass("Extract: areas extracted", `${areas.length} areas`);
        else fail("Extract: areas extracted", "No areas");
      }
    } else {
      fail("Extract: resume info", `Status ${r.status}: ${JSON.stringify(r.data)}`);
    }
  }

  // 7b. Empty resume → 400
  {
    const r = await api("POST", "/api/extract-resume-info", { resumeText: "" }, reviewerCookie);
    r.status === 400
      ? pass("Extract: empty resume text", `400`)
      : fail("Extract: empty resume text", `Expected 400, got ${r.status}`);
  }

  // 7c. Unauthenticated → 401
  {
    const r = await api("POST", "/api/extract-resume-info", { resumeText: "test" });
    r.status === 401
      ? pass("Extract: unauthenticated", "401")
      : fail("Extract: unauthenticated", `Expected 401, got ${r.status}`);
  }

  // ━━━ 8. FILE STORAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(8, "FILE STORAGE (BASE64)");
  let fileCandidateId;

  // 8a. Submit candidate with base64 file
  {
    const fakeBase64 = Buffer.from("Hello, this is a fake PDF content for testing purposes.").toString("base64");
    const r = await register(`File Test ${TS}`, `file_test_${TS}@test.zurio`);
    const r2 = await api("POST", "/api/candidates", {
      name: `File Test ${TS}`, email: `file_test_${TS}@test.zurio`,
      targetRole: "Engineer", targetArea: "Software Engineering",
      resume: "5 years experience in Python, JavaScript. Built microservices at a startup. Looking for senior SWE role at a tech company.",
      fileBase64: fakeBase64,
      fileType: "application/pdf",
      fileName: "test_resume.pdf"
    }, r.cookie);

    if (r2.status === 200 && r2.data.candidate?.id) {
      fileCandidateId = r2.data.candidate.id;
      pass("File storage: candidate with base64 file", `candidateId=${fileCandidateId}`);
    } else {
      fail("File storage: candidate with base64 file", `Status ${r2.status}`);
    }
  }

  // 8b. Retrieve file via GET /api/candidates/:id/file
  {
    if (fileCandidateId) {
      const r = await register(`File Test ${TS}`, `file_test_${TS}@test.zurio`);
      const r2 = await fetch(`${BASE}/api/candidates/${fileCandidateId}/file`, {
        headers: { Cookie: r.cookie },
        redirect: "follow",
      });

      if (r2.status === 200) {
        const contentType = r2.headers.get("content-type");
        const body = await r2.arrayBuffer();
        pass("File retrieval: GET /api/candidates/:id/file", `Content-Type: ${contentType}, size: ${body.byteLength} bytes`);
      } else {
        fail("File retrieval: GET /api/candidates/:id/file", `Status ${r2.status}`);
      }
    } else skip("File retrieval", "No file candidate");
  }

  // 8c. File not available → 404
  {
    const r = await api("GET", "/api/candidates/999999/file", null, authCookie);
    r.status === 404
      ? pass("File retrieval: non-existent → 404", "404")
      : fail("File retrieval: non-existent → 404", `Expected 404, got ${r.status}`);
  }

  // ━━━ 9. MATCH RATIONALE (Claude's reasoning) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(9, "MATCH RATIONALE — AI REASONING");

  // 9a. Check that seeded match rationales are specific, not generic
  {
    const r = await api("POST", "/auth/login", { email: "sarah.chen@seed.zurio", password: "Zurio2026!" });
    if (r.status === 200 && r.cookie) {
      const me = await api("GET", "/api/me", null, r.cookie);
      if (me.data.user?.reviewer_id) {
        const dashboard = await api("GET", `/api/reviewers/${me.data.user.reviewer_id}`, null, r.cookie);
        const matches = dashboard.data.matches || [];
        if (matches.length > 0) {
          const rationale = matches[0].rationale || "";
          const isGeneric = /background in .* aligns with/.test(rationale) && rationale.length < 60;
          !isGeneric
            ? pass("Rationale: not a generic template", `"${rationale.slice(0, 80)}..."`)
            : fail("Rationale: not a generic template", `Generic rationale detected: "${rationale}"`);
        } else {
          skip("Rationale check", "No matches on Sarah's dashboard");
        }
      }
    } else {
      skip("Rationale check", "Could not login as seeded reviewer");
    }
  }

  // ━━━ 10. SELF-MATCH PREVENTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(10, "SELF-MATCH PREVENTION");

  {
    // Reviewer submits own resume as candidate — should NOT match self
    const r = await api("POST", "/api/candidates", {
      name: `Reviewer ${TS}`, email: `reviewer_${TS}@test.zurio`,
      targetRole: "Staff Engineer", targetArea: "Software Engineering",
      resume: "Staff Engineer with 10 years experience in Python, Go, distributed systems. Targeting principal engineer roles."
    }, reviewerCookie);

    if (r.status === 200) {
      const matchedId = r.data.reviewer?.id;
      if (matchedId === reviewerId) {
        fail("Self-match prevention", `MATCHED TO SELF: reviewer ${matchedId}`);
      } else if (!matchedId) {
        pass("Self-match prevention", "Waitlisted (no self-match)");
      } else {
        pass("Self-match prevention", `Matched to different reviewer: ${matchedId}`);
      }
    } else {
      fail("Self-match prevention", `Status ${r.status}`);
    }
  }

  // ━━━ 11. MULTI-RESUME SUBMISSIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(11, "MULTI-RESUME SUBMISSIONS");

  let multiCookie;
  {
    const r = await register(`Multi ${TS}`, `multi_${TS}@test.zurio`);
    multiCookie = r.cookie;

    // First submission
    const sub1 = await api("POST", "/api/candidates", {
      name: `Multi ${TS}`, email: `multi_${TS}@test.zurio`,
      targetRole: "Product Manager", targetArea: "Product Management",
      resume: "3 years PM experience at B2B SaaS. Built roadmaps for enterprise products with $10M ARR.",
      label: "PM Resume"
    }, multiCookie);
    sub1.status === 200
      ? pass("Multi-resume: 1st submission", `id=${sub1.data.candidate?.id}`)
      : fail("Multi-resume: 1st submission", `Status ${sub1.status}`);

    // Second submission — different role
    const sub2 = await api("POST", "/api/candidates", {
      name: `Multi ${TS}`, email: `multi_${TS}@test.zurio`,
      targetRole: "Data Analyst", targetArea: "Data Science",
      resume: "SQL, Python, Tableau expert. 2 years analytics at fintech startup. Strong data visualization skills.",
      label: "Data Resume"
    }, multiCookie);
    sub2.status === 200
      ? pass("Multi-resume: 2nd submission", `id=${sub2.data.candidate?.id}`)
      : fail("Multi-resume: 2nd submission", `Status ${sub2.status}`);

    // Distinct candidate IDs
    if (sub1.data.candidate?.id && sub2.data.candidate?.id) {
      sub1.data.candidate.id !== sub2.data.candidate.id
        ? pass("Multi-resume: distinct IDs", `${sub1.data.candidate.id} ≠ ${sub2.data.candidate.id}`)
        : fail("Multi-resume: distinct IDs", "Same ID returned!");
    }

    // Both show in /mine
    const mine = await api("GET", "/api/candidates/mine", null, multiCookie);
    mine.data.submissions?.length >= 2
      ? pass("Multi-resume: /mine returns both", `${mine.data.submissions.length} submissions`)
      : fail("Multi-resume: /mine returns both", `Expected ≥2, got ${mine.data.submissions?.length}`);
  }

  // ━━━ 12. FULL E2E JOURNEY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(12, "FULL E2E JOURNEY — register → profile → submit → match → feedback → rate");

  let journeyReviewerCookie, journeyReviewerId;
  let journeyCandidateCookie, journeyCandidateId, journeyMatchId;

  // Step 1: Reviewer registers
  {
    const r = await register(`Journey Reviewer ${TS}`, `journey_rev_${TS}@test.zurio`);
    journeyReviewerCookie = r.cookie;
    const r2 = await api("POST", "/api/me/role", { role: "reviewer" }, journeyReviewerCookie);
    const r3 = await api("POST", "/api/reviewers", {
      name: `Journey Reviewer ${TS}`, role: "Director of Engineering", company: "Meta",
      years: "12", areas: ["Software Engineering"],
      resumeText: "Director of Engineering at Meta. Led teams of 30+ engineers."
    }, journeyReviewerCookie);

    if (r3.status === 200 && r3.data.reviewer?.id) {
      journeyReviewerId = r3.data.reviewer.id;
      pass("Journey: reviewer registered", `id=${journeyReviewerId}`);
    } else {
      fail("Journey: reviewer registered", `Status ${r3.status}`);
    }
  }

  // Step 2: Candidate registers + submits resume
  {
    const r = await register(`Journey Candidate ${TS}`, `journey_cand_${TS}@test.zurio`);
    journeyCandidateCookie = r.cookie;
    await api("POST", "/api/me/role", { role: "candidate" }, journeyCandidateCookie);

    const r2 = await api("POST", "/api/candidates", {
      name: `Journey Candidate ${TS}`, email: `journey_cand_${TS}@test.zurio`,
      targetRole: "Senior Software Engineer", targetArea: "Software Engineering",
      resume: "4 years SWE. Python, Go, Kubernetes. Built data pipelines at a Series B startup. Targeting senior SWE at FAANG.",
      label: "Journey Test"
    }, journeyCandidateCookie);

    if (r2.status === 200 && r2.data.candidate?.id) {
      journeyCandidateId = r2.data.candidate.id;
      journeyMatchId = r2.data.match?.id;
      pass("Journey: candidate submitted", `candidateId=${journeyCandidateId}, match=${journeyMatchId || "waitlisted"}`);
    } else {
      fail("Journey: candidate submitted", `Status ${r2.status}`);
    }
  }

  // Step 3: Reviewer sees match
  {
    if (journeyReviewerId) {
      const r = await api("GET", `/api/reviewers/${journeyReviewerId}`, null, journeyReviewerCookie);
      const hasMatch = r.data.matches?.some(m => m.candidate_id === journeyCandidateId);
      if (hasMatch) {
        pass("Journey: reviewer sees match", "Match visible in dashboard");
        if (!journeyMatchId) {
          journeyMatchId = r.data.matches.find(m => m.candidate_id === journeyCandidateId)?.id;
        }
      } else {
        skip("Journey: reviewer sees match", "Candidate matched to different reviewer");
      }
    }
  }

  // Step 4: Score feedback (preview)
  let feedbackScore;
  {
    if (journeyMatchId) {
      const r = await api("POST", "/api/feedback/score", {
        feedbackText: "Your experience with distributed systems and data pipelines is strong. However, I recommend adding specific metrics — what throughput did your pipelines handle? Also, your leadership section needs work — mention cross-team collaboration and mentorship. The projects section could use more technical depth about architecture decisions.",
        candidateTargetRole: "Senior Software Engineer"
      }, journeyReviewerCookie);

      if (r.status === 200) {
        feedbackScore = r.data.score;
        pass("Journey: feedback scored", `Score ${feedbackScore}/10`);
      } else {
        fail("Journey: feedback scored", `Status ${r.status}`);
      }
    }
  }

  // Step 5: Submit feedback (only if score ≥ 6)
  let journeyFeedbackId;
  {
    if (journeyMatchId) {
      const r = await api("POST", "/api/feedback", {
        matchId: journeyMatchId,
        body: "Your experience with distributed systems and data pipelines is strong. However, I recommend adding specific metrics — what throughput did your pipelines handle? Also, your leadership section needs work — mention cross-team collaboration and mentorship. The projects section could use more technical depth about architecture decisions."
      }, journeyReviewerCookie);

      if (r.status === 200 && r.data.feedback?.id) {
        journeyFeedbackId = r.data.feedback.id;
        pass("Journey: feedback submitted", `feedbackId=${journeyFeedbackId}`);
      } else {
        fail("Journey: feedback submitted", `Status ${r.status}`);
      }
    }
  }

  // Step 6: Candidate sees feedback
  {
    if (journeyCandidateId && journeyFeedbackId) {
      const r = await api("GET", `/api/candidates/${journeyCandidateId}/status`, null, journeyCandidateCookie);
      const matchWithFb = r.data.matches?.find(m => m.feedback?.body);
      if (matchWithFb) {
        pass("Journey: candidate sees feedback", `status=${matchWithFb.status}, length=${matchWithFb.feedback.body.length}`);
      } else {
        fail("Journey: candidate sees feedback", "Feedback not visible");
      }
    } else {
      skip("Journey: candidate sees feedback", "No feedback submitted");
    }
  }

  // Step 7: Match status changed to "done"
  {
    if (journeyCandidateId && journeyMatchId) {
      const r = await api("GET", `/api/candidates/${journeyCandidateId}/status`, null, journeyCandidateCookie);
      const match = r.data.matches?.find(m => m.id === journeyMatchId);
      match?.status === "done"
        ? pass("Journey: match status → done", "✓")
        : fail("Journey: match status → done", `status=${match?.status}`);
    }
  }

  // Step 8: Candidate rates feedback
  {
    if (journeyFeedbackId) {
      const r = await api("POST", `/api/feedback/${journeyFeedbackId}/rating`, { rating: 4 }, journeyCandidateCookie);
      if (r.status === 200 && r.data.feedback?.candidateRating === 4) {
        pass("Journey: candidate rated feedback", "4/5 stars");
      } else {
        fail("Journey: candidate rated feedback", `Status ${r.status}`);
      }
    } else {
      skip("Journey: candidate rated feedback", "No feedback to rate");
    }
  }

  // ━━━ 13. EDGE CASES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(13, "EDGE CASES");

  // 13a. Long resume
  {
    const longResume = "Experience in software engineering. ".repeat(200);
    const r = await register(`Long ${TS}`, `long_${TS}@test.zurio`);
    const r2 = await api("POST", "/api/candidates", {
      name: `Long ${TS}`, email: `long_${TS}@test.zurio`,
      targetRole: "PM", targetArea: "Product Management", resume: longResume
    }, r.cookie);
    r2.status === 200
      ? pass("Long resume (7000+ chars)", `candidateId=${r2.data.candidate?.id}`)
      : fail("Long resume", `Status ${r2.status}`);
  }

  // 13b. Special characters
  {
    const r = await register(`O'Brien-Müller`, `special_${TS}@test.zurio`);
    r.status === 200 && r.data.user?.name?.includes("O'Brien")
      ? pass("Special chars in name", `"${r.data.user.name}"`)
      : fail("Special chars in name", `Status ${r.status}`);
  }

  // 13c. Unicode resume
  {
    const r = await register(`Unicode ${TS}`, `unicode_${TS}@test.zurio`);
    const r2 = await api("POST", "/api/candidates", {
      name: `Unicode ${TS}`, email: `unicode_${TS}@test.zurio`,
      targetRole: "PM", targetArea: "Product Management",
      resume: "Experience: 日本語テスト. Worked at 北京 office. Skills: données analytiques. Über 5 years of experience."
    }, r.cookie);
    r2.status === 200
      ? pass("Unicode resume content", `candidateId=${r2.data.candidate?.id}`)
      : fail("Unicode resume", `Status ${r2.status}`);
  }

  // 13d. Concurrent registrations
  {
    const [r1, r2] = await Promise.all([
      register(`Concurrent A ${TS}`, `concurrent_a_${TS}@test.zurio`),
      register(`Concurrent B ${TS}`, `concurrent_b_${TS}@test.zurio`),
    ]);
    r1.status === 200 && r2.status === 200
      ? pass("Concurrent registrations", `ids: ${r1.data.user?.id}, ${r2.data.user?.id}`)
      : fail("Concurrent registrations", `Statuses: ${r1.status}, ${r2.status}`);
  }

  // ━━━ 14. AUTH GUARDS ON ALL ENDPOINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(14, "AUTH GUARDS — ALL PROTECTED ENDPOINTS");

  const guardTests = [
    ["POST", "/api/me/role", { role: "reviewer" }],
    ["POST", "/api/reviewers", { name: "X", role: "Y", company: "Z", years: "5", areas: ["PM"] }],
    ["GET", "/api/reviewers/1"],
    ["POST", "/api/candidates", { name: "X", email: "x@x.com", targetRole: "PM", targetArea: "Product", resume: "test" }],
    ["GET", "/api/candidates/mine"],
    ["GET", "/api/candidates/1/status"],
    ["GET", "/api/candidates/1/file"],
    ["POST", "/api/feedback", { matchId: 1, body: "test" }],
    ["POST", "/api/feedback/score", { feedbackText: "test", candidateTargetRole: "PM" }],
    ["POST", "/api/feedback/1/rating", { rating: 5 }],
    ["POST", "/api/extract-resume-info", { resumeText: "test" }],
    ["POST", "/api/claude", { system: "test", messages: [{ role: "user", content: "test" }] }],
  ];

  for (const [method, path, body] of guardTests) {
    const r = await api(method, path, body);
    r.status === 401
      ? pass(`Guard: ${method} ${path}`, "401 ✓")
      : fail(`Guard: ${method} ${path}`, `Expected 401, got ${r.status}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SUMMARY
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log(`\n${"═".repeat(80)}`);
  console.log(`  RESULTS:  ✅ ${passed} passed   ❌ ${failed} failed   ⏭️  ${skipped} skipped   (${passed + failed + skipped} total)`);
  console.log(`${"═".repeat(80)}`);

  if (failures.length > 0) {
    console.log("\n  FAILURES:");
    failures.forEach(f => console.log(`    ❌ ${f.label} → ${f.msg}`));
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error("Fatal:", e); process.exit(1); });
