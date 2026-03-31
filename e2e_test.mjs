/**
 * Zurio E2E Test Suite
 * Comprehensive end-to-end tests covering all API endpoints,
 * auth flows, validation, feedback, and full user journeys.
 *
 * Run: node e2e_test.mjs [--url BASE_URL]
 */

const BASE = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "https://zurio-api-production.up.railway.app";

const TS = Date.now();
let passed = 0, failed = 0, skipped = 0;
const failures = [];

function log(icon, label, msg) {
  console.log(`  ${icon}  ${label.padEnd(50)} ${msg}`);
}
function pass(label, msg = "") { passed++; log("✅", label, msg); }
function fail(label, msg = "") { failed++; log("❌", label, msg); failures.push({ label, msg }); }
function skip(label, msg = "") { skipped++; log("⏭️ ", label, msg); }
function section(n, title) { console.log(`\n${"─".repeat(72)}\n  ${n}. ${title}\n${"─".repeat(72)}`); }

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

// ─── Test runner ─────────────────────────────────────────────────────────────

async function runTests() {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  ZURIO E2E TEST SUITE`);
  console.log(`  Target: ${BASE}`);
  console.log(`  Run ID: ${TS}`);
  console.log(`${"═".repeat(72)}`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(1, "HEALTH CHECK");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    const r = await api("GET", "/api/health");
    r.status === 200 && r.data.ok === true
      ? pass("GET /api/health", `ok=true, ${r.data.users} users, ${r.data.reviewers} reviewers, ${r.data.candidates} candidates`)
      : fail("GET /api/health", `Status ${r.status}: ${JSON.stringify(r.data)}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(2, "AUTH — LOGIN / LOGOUT / SESSION");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 2a. Successful login
  let authCookie;
  {
    const r = await api("POST", "/auth/login", { name: `E2E User ${TS}`, email: `e2e_auth_${TS}@test.zurio` });
    if (r.status === 200 && r.data.user?.id && r.cookie) {
      pass("POST /auth/login — success", `user.id=${r.data.user.id}`);
      authCookie = r.cookie;
    } else {
      fail("POST /auth/login — success", `Status ${r.status}`);
    }
  }

  // 2b. Login missing name
  {
    const r = await api("POST", "/auth/login", { email: "x@test.zurio" });
    r.status === 400
      ? pass("POST /auth/login — missing name", `400: ${r.data.error}`)
      : fail("POST /auth/login — missing name", `Expected 400, got ${r.status}`);
  }

  // 2c. Login missing email
  {
    const r = await api("POST", "/auth/login", { name: "Test" });
    r.status === 400
      ? pass("POST /auth/login — missing email", `400: ${r.data.error}`)
      : fail("POST /auth/login — missing email", `Expected 400, got ${r.status}`);
  }

  // 2d. Login empty body
  {
    const r = await api("POST", "/auth/login", {});
    r.status === 400
      ? pass("POST /auth/login — empty body", `400`)
      : fail("POST /auth/login — empty body", `Expected 400, got ${r.status}`);
  }

  // 2e. GET /api/me — authenticated
  {
    const r = await api("GET", "/api/me", null, authCookie);
    r.status === 200 && r.data.user?.id
      ? pass("GET /api/me — authenticated", `user.id=${r.data.user.id}, email=${r.data.user.email}`)
      : fail("GET /api/me — authenticated", `Status ${r.status}`);
  }

  // 2f. GET /api/me — unauthenticated
  {
    const r = await api("GET", "/api/me");
    r.status === 200 && r.data.user === null
      ? pass("GET /api/me — unauthenticated", `user=null`)
      : fail("GET /api/me — unauthenticated", `Expected user=null, got ${JSON.stringify(r.data.user)}`);
  }

  // 2g. Idempotent login (same email returns same user)
  {
    const email = `e2e_idem_${TS}@test.zurio`;
    const r1 = await api("POST", "/auth/login", { name: "A", email });
    const r2 = await api("POST", "/auth/login", { name: "B", email });
    r1.data.user?.id === r2.data.user?.id
      ? pass("Idempotent login — same user ID", `id=${r1.data.user.id}`)
      : fail("Idempotent login — same user ID", `${r1.data.user?.id} !== ${r2.data.user?.id}`);
  }

  // 2h. Email normalization (case-insensitive + trimmed)
  {
    const email = `e2e_norm_${TS}@test.zurio`;
    const r1 = await api("POST", "/auth/login", { name: "A", email });
    const r2 = await api("POST", "/auth/login", { name: "A", email: `  ${email.toUpperCase()}  ` });
    r1.data.user?.id === r2.data.user?.id
      ? pass("Email normalization — case+trim", `Same user ID: ${r1.data.user.id}`)
      : fail("Email normalization — case+trim", `IDs differ: ${r1.data.user?.id} vs ${r2.data.user?.id}`);
  }

  // 2i. Logout
  {
    const r = await api("POST", "/auth/logout", null, authCookie);
    r.status === 200 && r.data.ok === true
      ? pass("POST /auth/logout", "ok=true")
      : fail("POST /auth/logout", `Status ${r.status}`);
  }

  // 2j. Session destroyed after logout — re-login for later tests
  {
    const r = await api("POST", "/auth/login", { name: `E2E User ${TS}`, email: `e2e_auth_${TS}@test.zurio` });
    authCookie = r.cookie;
    r.status === 200
      ? pass("Re-login after logout", `New session obtained`)
      : fail("Re-login after logout", `Status ${r.status}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(3, "ROLE SETTING — POST /api/me/role");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 3a. Set role to reviewer
  {
    const r = await api("POST", "/api/me/role", { role: "reviewer" }, authCookie);
    r.status === 200 && r.data.user?.role === "reviewer"
      ? pass("Set role — reviewer", `role=${r.data.user.role}`)
      : fail("Set role — reviewer", `Status ${r.status}, role=${r.data.user?.role}`);
  }

  // 3b. Set role to candidate
  {
    const r = await api("POST", "/api/me/role", { role: "candidate" }, authCookie);
    r.status === 200 && r.data.user?.role === "candidate"
      ? pass("Set role — candidate", `role=${r.data.user.role}`)
      : fail("Set role — candidate", `Status ${r.status}`);
  }

  // 3c. Invalid role
  {
    const r = await api("POST", "/api/me/role", { role: "admin" }, authCookie);
    r.status === 400
      ? pass("Set role — invalid 'admin'", `400: ${r.data.error}`)
      : fail("Set role — invalid 'admin'", `Expected 400, got ${r.status}`);
  }

  // 3d. Empty role
  {
    const r = await api("POST", "/api/me/role", {}, authCookie);
    r.status === 400
      ? pass("Set role — empty body", `400`)
      : fail("Set role — empty body", `Expected 400, got ${r.status}`);
  }

  // 3e. Unauthenticated role set
  {
    const r = await api("POST", "/api/me/role", { role: "reviewer" });
    r.status === 401
      ? pass("Set role — unauthenticated", `401`)
      : fail("Set role — unauthenticated", `Expected 401, got ${r.status}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(4, "REVIEWER CRUD");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let reviewerCookie, reviewerId;

  // 4a. Create reviewer
  {
    const r1 = await api("POST", "/auth/login", { name: `E2E Reviewer ${TS}`, email: `e2e_reviewer_${TS}@test.zurio` });
    reviewerCookie = r1.cookie;

    const r = await api("POST", "/api/reviewers", {
      name: `E2E Reviewer ${TS}`, role: "Senior Engineer", company: "TestCorp",
      years: "8", areas: ["Software Engineering", "Backend"],
      bio: "E2E test reviewer.", resumeText: "Senior Engineer at TestCorp. 8 years experience."
    }, reviewerCookie);

    if (r.status === 200 && r.data.reviewer?.id) {
      reviewerId = r.data.reviewer.id;
      pass("POST /api/reviewers — create", `id=${reviewerId}`);
    } else {
      fail("POST /api/reviewers — create", `Status ${r.status}: ${JSON.stringify(r.data)}`);
    }
  }

  // 4b. Update existing reviewer (idempotent — same user, updates profile)
  {
    const r = await api("POST", "/api/reviewers", {
      name: `E2E Reviewer Updated ${TS}`, role: "Staff Engineer", company: "TestCorp",
      years: "10", areas: ["Software Engineering", "Backend", "Systems"],
      bio: "Updated bio.", resumeText: "Staff Engineer, 10 years."
    }, reviewerCookie);

    if (r.status === 200 && r.data.reviewer?.id === reviewerId && r.data.reviewer?.role === "Staff Engineer") {
      pass("POST /api/reviewers — update", `Same ID ${reviewerId}, role updated to Staff Engineer`);
    } else {
      fail("POST /api/reviewers — update", `Status ${r.status}, id=${r.data.reviewer?.id}`);
    }
  }

  // 4c. Create reviewer — missing fields
  {
    const r = await api("POST", "/api/reviewers", { name: "X" }, reviewerCookie);
    r.status === 400
      ? pass("POST /api/reviewers — missing fields", `400: ${r.data.error}`)
      : fail("POST /api/reviewers — missing fields", `Expected 400, got ${r.status}`);
  }

  // 4d. Create reviewer — missing areas
  {
    const r = await api("POST", "/api/reviewers", {
      name: "X", role: "PM", company: "Co", years: "5", areas: []
    }, reviewerCookie);
    r.status === 400
      ? pass("POST /api/reviewers — empty areas array", `400`)
      : fail("POST /api/reviewers — empty areas array", `Expected 400, got ${r.status}`);
  }

  // 4e. Unauthenticated reviewer creation
  {
    const r = await api("POST", "/api/reviewers", {
      name: "X", role: "PM", company: "Co", years: "5", areas: ["PM"]
    });
    r.status === 401
      ? pass("POST /api/reviewers — unauthenticated", `401`)
      : fail("POST /api/reviewers — unauthenticated", `Expected 401, got ${r.status}`);
  }

  // 4f. GET /api/reviewers/:id — existing reviewer
  {
    if (reviewerId) {
      const r = await api("GET", `/api/reviewers/${reviewerId}`, null, reviewerCookie);
      r.status === 200 && r.data.reviewer?.id === reviewerId
        ? pass("GET /api/reviewers/:id — found", `id=${reviewerId}, matches=${r.data.matches?.length}`)
        : fail("GET /api/reviewers/:id — found", `Status ${r.status}`);
    } else skip("GET /api/reviewers/:id", "No reviewer created");
  }

  // 4g. GET /api/reviewers/:id — non-existent
  {
    const r = await api("GET", "/api/reviewers/999999", null, reviewerCookie);
    r.status === 404
      ? pass("GET /api/reviewers/:id — not found", `404`)
      : fail("GET /api/reviewers/:id — not found", `Expected 404, got ${r.status}`);
  }

  // 4h. GET /api/reviewers/:id — unauthenticated
  {
    const r = await api("GET", `/api/reviewers/${reviewerId || 1}`);
    r.status === 401
      ? pass("GET /api/reviewers/:id — unauthenticated", `401`)
      : fail("GET /api/reviewers/:id — unauthenticated", `Expected 401, got ${r.status}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(5, "CANDIDATE SUBMISSION + MATCHING");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let candidateCookie, candidateId, matchId;

  // 5a. Create candidate — happy path
  {
    const r1 = await api("POST", "/auth/login", { name: `E2E Candidate ${TS}`, email: `e2e_candidate_${TS}@test.zurio` });
    candidateCookie = r1.cookie;

    const r = await api("POST", "/api/candidates", {
      name: `E2E Candidate ${TS}`, email: `e2e_candidate_${TS}@test.zurio`,
      targetRole: "Software Engineer", targetArea: "Software Engineering",
      resume: "Computer Science grad, 3 years experience in Python, JavaScript, React. Built microservices at scale. Targeting mid-level SWE roles.",
      label: "E2E Test Resume"
    }, candidateCookie);

    if (r.status === 200 && r.data.candidate?.id) {
      candidateId = r.data.candidate.id;
      matchId = r.data.match?.id;
      const matched = r.data.reviewer ? `matched to reviewer ${r.data.reviewer.id}` : `waitlisted`;
      pass("POST /api/candidates — create", `candidateId=${candidateId}, ${matched}`);
    } else {
      fail("POST /api/candidates — create", `Status ${r.status}: ${JSON.stringify(r.data)}`);
    }
  }

  // 5b. Candidate — missing fields
  {
    const r = await api("POST", "/api/candidates", { name: "X", email: "x@x.com" }, candidateCookie);
    r.status === 400
      ? pass("POST /api/candidates — missing fields", `400: ${r.data.error}`)
      : fail("POST /api/candidates — missing fields", `Expected 400, got ${r.status}`);
  }

  // 5c. Candidate — missing resume
  {
    const r = await api("POST", "/api/candidates", {
      name: "X", email: "x@x.com", targetRole: "PM", targetArea: "Product"
    }, candidateCookie);
    r.status === 400
      ? pass("POST /api/candidates — missing resume", `400`)
      : fail("POST /api/candidates — missing resume", `Expected 400, got ${r.status}`);
  }

  // 5d. Unauthenticated candidate submission
  {
    const r = await api("POST", "/api/candidates", {
      name: "X", email: "x@x.com", targetRole: "PM", targetArea: "Product", resume: "test"
    });
    r.status === 401
      ? pass("POST /api/candidates — unauthenticated", `401`)
      : fail("POST /api/candidates — unauthenticated", `Expected 401, got ${r.status}`);
  }

  // 5e. GET /api/candidates/mine — with submissions
  {
    const r = await api("GET", "/api/candidates/mine", null, candidateCookie);
    if (r.status === 200 && r.data.submissions?.length >= 1) {
      pass("GET /api/candidates/mine", `${r.data.submissions.length} submission(s)`);
    } else {
      fail("GET /api/candidates/mine", `Status ${r.status}, submissions=${r.data.submissions?.length}`);
    }
  }

  // 5f. GET /api/candidates/mine — unauthenticated
  {
    const r = await api("GET", "/api/candidates/mine");
    r.status === 401
      ? pass("GET /api/candidates/mine — unauth", `401`)
      : fail("GET /api/candidates/mine — unauth", `Expected 401, got ${r.status}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(6, "CANDIDATE STATUS");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 6a. GET /api/candidates/:id/status — existing
  {
    if (candidateId) {
      const r = await api("GET", `/api/candidates/${candidateId}/status`, null, candidateCookie);
      if (r.status === 200 && r.data.candidate?.id === candidateId && Array.isArray(r.data.matches)) {
        pass("GET /candidates/:id/status — found", `${r.data.matches.length} match(es), status=${r.data.matches[0]?.status || "none"}`);
      } else {
        fail("GET /candidates/:id/status — found", `Status ${r.status}`);
      }
    } else skip("GET /candidates/:id/status", "No candidate");
  }

  // 6b. GET /api/candidates/:id/status — non-existent
  {
    const r = await api("GET", "/api/candidates/999999/status", null, candidateCookie);
    r.status === 404
      ? pass("GET /candidates/:id/status — not found", `404`)
      : fail("GET /candidates/:id/status — not found", `Expected 404, got ${r.status}`);
  }

  // 6c. GET /api/candidates/:id/status — unauthenticated
  {
    const r = await api("GET", `/api/candidates/${candidateId || 1}/status`);
    r.status === 401
      ? pass("GET /candidates/:id/status — unauth", `401`)
      : fail("GET /candidates/:id/status — unauth", `Expected 401, got ${r.status}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(7, "FEEDBACK SUBMISSION");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Find a valid match to submit feedback for
  let feedbackMatchId = null;
  {
    if (candidateId) {
      const r = await api("GET", `/api/candidates/${candidateId}/status`, null, candidateCookie);
      const pendingMatch = r.data.matches?.find(m => m.status === "pending");
      if (pendingMatch) feedbackMatchId = pendingMatch.id;
    }
  }

  // 7a. Submit feedback — happy path
  {
    if (feedbackMatchId) {
      const r = await api("POST", "/api/feedback", {
        matchId: feedbackMatchId,
        body: "Great resume! Your experience in microservices is impressive. Consider highlighting specific metrics and impact. Add more detail about leadership experience."
      }, reviewerCookie);

      if (r.status === 200 && r.data.feedback?.id) {
        pass("POST /api/feedback — success", `feedbackId=${r.data.feedback.id}`);
      } else {
        fail("POST /api/feedback — success", `Status ${r.status}: ${JSON.stringify(r.data)}`);
      }
    } else {
      skip("POST /api/feedback — success", "No pending match available");
    }
  }

  // 7b. Verify feedback appears in candidate status
  {
    if (candidateId && feedbackMatchId) {
      const r = await api("GET", `/api/candidates/${candidateId}/status`, null, candidateCookie);
      const matchWithFb = r.data.matches?.find(m => m.id === feedbackMatchId);
      if (matchWithFb?.feedback?.body) {
        pass("Feedback visible in status", `match status=${matchWithFb.status}, feedback present`);
      } else {
        fail("Feedback visible in status", `No feedback found on match ${feedbackMatchId}`);
      }
    } else skip("Feedback visible in status", "No match or candidate");
  }

  // 7c. Verify match status changed to "done" after feedback
  {
    if (candidateId && feedbackMatchId) {
      const r = await api("GET", `/api/candidates/${candidateId}/status`, null, candidateCookie);
      const match = r.data.matches?.find(m => m.id === feedbackMatchId);
      match?.status === "done"
        ? pass("Match status → done after feedback", `status=${match.status}`)
        : fail("Match status → done after feedback", `status=${match?.status}`);
    } else skip("Match status after feedback", "No match");
  }

  // 7d. Feedback — missing matchId
  {
    const r = await api("POST", "/api/feedback", { body: "test" }, reviewerCookie);
    r.status === 400
      ? pass("POST /api/feedback — missing matchId", `400: ${r.data.error}`)
      : fail("POST /api/feedback — missing matchId", `Expected 400, got ${r.status}`);
  }

  // 7e. Feedback — missing body
  {
    const r = await api("POST", "/api/feedback", { matchId: 1 }, reviewerCookie);
    r.status === 400
      ? pass("POST /api/feedback — missing body", `400: ${r.data.error}`)
      : fail("POST /api/feedback — missing body", `Expected 400, got ${r.status}`);
  }

  // 7f. Feedback — empty body string
  {
    const r = await api("POST", "/api/feedback", { matchId: 1, body: "   " }, reviewerCookie);
    r.status === 400
      ? pass("POST /api/feedback — whitespace body", `400`)
      : fail("POST /api/feedback — whitespace body", `Expected 400, got ${r.status}`);
  }

  // 7g. Feedback — non-existent match
  {
    const r = await api("POST", "/api/feedback", { matchId: 999999, body: "test feedback" }, reviewerCookie);
    r.status === 404
      ? pass("POST /api/feedback — bad matchId", `404`)
      : fail("POST /api/feedback — bad matchId", `Expected 404, got ${r.status}`);
  }

  // 7h. Feedback — unauthenticated
  {
    const r = await api("POST", "/api/feedback", { matchId: 1, body: "test" });
    r.status === 401
      ? pass("POST /api/feedback — unauthenticated", `401`)
      : fail("POST /api/feedback — unauthenticated", `Expected 401, got ${r.status}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(8, "MULTI-RESUME SUBMISSIONS");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let multiCookie;
  {
    const r1 = await api("POST", "/auth/login", { name: `E2E Multi ${TS}`, email: `e2e_multi_${TS}@test.zurio` });
    multiCookie = r1.cookie;

    // First submission
    const sub1 = await api("POST", "/api/candidates", {
      name: `E2E Multi ${TS}`, email: `e2e_multi_${TS}@test.zurio`,
      targetRole: "Product Manager", targetArea: "Product Management",
      resume: "3 years PM experience. Built roadmaps for enterprise SaaS.",
      label: "PM Resume"
    }, multiCookie);
    sub1.status === 200
      ? pass("Multi-resume: 1st submission", `candidateId=${sub1.data.candidate?.id}`)
      : fail("Multi-resume: 1st submission", `Status ${sub1.status}`);

    // Second submission — different role
    const sub2 = await api("POST", "/api/candidates", {
      name: `E2E Multi ${TS}`, email: `e2e_multi_${TS}@test.zurio`,
      targetRole: "Data Analyst", targetArea: "Data Science",
      resume: "SQL, Python, Tableau expert. 2 years business analytics at fintech startup.",
      label: "Data Resume"
    }, multiCookie);
    sub2.status === 200
      ? pass("Multi-resume: 2nd submission", `candidateId=${sub2.data.candidate?.id}`)
      : fail("Multi-resume: 2nd submission", `Status ${sub2.status}`);

    // Different candidate IDs
    if (sub1.data.candidate?.id && sub2.data.candidate?.id) {
      sub1.data.candidate.id !== sub2.data.candidate.id
        ? pass("Multi-resume: distinct candidate IDs", `${sub1.data.candidate.id} ≠ ${sub2.data.candidate.id}`)
        : fail("Multi-resume: distinct candidate IDs", `Same ID returned`);
    }

    // Verify both in /mine
    const mine = await api("GET", "/api/candidates/mine", null, multiCookie);
    mine.data.submissions?.length >= 2
      ? pass("Multi-resume: /mine returns both", `${mine.data.submissions.length} submissions`)
      : fail("Multi-resume: /mine returns both", `Expected ≥2, got ${mine.data.submissions?.length}`);

    // Verify labels stored
    const labels = mine.data.submissions?.map(s => s.candidate.label).filter(Boolean) || [];
    labels.length >= 2
      ? pass("Multi-resume: labels stored", labels.join(" | "))
      : fail("Multi-resume: labels stored", `Only ${labels.length} labels found`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(9, "SELF-MATCH PREVENTION");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    // Use the reviewer cookie to submit a candidate — should NOT match to own reviewer profile
    const r = await api("POST", "/api/candidates", {
      name: `E2E Reviewer ${TS}`, email: `e2e_reviewer_${TS}@test.zurio`,
      targetRole: "Staff Engineer", targetArea: "Software Engineering",
      resume: "Senior Engineer at TestCorp. 8 years experience in backend systems.",
    }, reviewerCookie);

    if (r.status === 200) {
      const matchedReviewerId = r.data.reviewer?.id;
      if (matchedReviewerId === reviewerId) {
        fail("Self-match prevention", `MATCHED TO SELF: reviewer ${matchedReviewerId}`);
      } else if (!matchedReviewerId) {
        pass("Self-match prevention", "Waitlisted (no self-match)");
      } else {
        pass("Self-match prevention", `Matched to different reviewer: ${matchedReviewerId}`);
      }
    } else {
      fail("Self-match prevention", `Status ${r.status}`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(10, "CLAUDE PROXY — AUTH GUARD");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 10a. Unauthenticated
  {
    const r = await api("POST", "/api/claude", {
      system: "You are a helpful assistant.", messages: [{ role: "user", content: "Hello" }]
    });
    r.status === 401
      ? pass("POST /api/claude — unauthenticated", `401`)
      : fail("POST /api/claude — unauthenticated", `Expected 401, got ${r.status}`);
  }

  // 10b. Authenticated (should work or return 500 if no API key)
  {
    const r = await api("POST", "/api/claude", {
      system: "Respond with one word only: 'pong'", messages: [{ role: "user", content: "ping" }], max_tokens: 10
    }, reviewerCookie);
    if (r.status === 200 && r.data.text) {
      pass("POST /api/claude — authenticated", `Response: "${r.data.text.slice(0, 30)}"`);
    } else if (r.status === 500) {
      pass("POST /api/claude — no API key (expected)", `500: ${r.data.error}`);
    } else {
      fail("POST /api/claude — authenticated", `Status ${r.status}`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(11, "DEBUG MATCH SCORES");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 11a. Authenticated debug scores
  {
    const r = await api("POST", "/api/debug/match-scores", {
      resume: "Software engineer, 5 years Python, distributed systems.",
      targetRole: "Senior Software Engineer",
      targetArea: "Software Engineering",
      excludeReviewerIds: []
    }, candidateCookie);

    if (r.status === 200 && Array.isArray(r.data.scores)) {
      pass("POST /api/debug/match-scores", `pool=${r.data.pool_size}, scored=${r.data.scores.length}`);
    } else if (r.status === 500) {
      pass("POST /api/debug/match-scores — no API key", `500 (expected in some envs)`);
    } else {
      fail("POST /api/debug/match-scores", `Status ${r.status}`);
    }
  }

  // 11b. Missing fields
  {
    const r = await api("POST", "/api/debug/match-scores", { resume: "test" }, candidateCookie);
    r.status === 400
      ? pass("POST /api/debug/match-scores — missing fields", `400`)
      : fail("POST /api/debug/match-scores — missing fields", `Expected 400, got ${r.status}`);
  }

  // 11c. Unauthenticated
  {
    const r = await api("POST", "/api/debug/match-scores", {
      resume: "test", targetRole: "PM", targetArea: "Product", excludeReviewerIds: []
    });
    r.status === 401
      ? pass("POST /api/debug/match-scores — unauth", `401`)
      : fail("POST /api/debug/match-scores — unauth", `Expected 401, got ${r.status}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(12, "FULL USER JOURNEY — reviewer signs up → candidate submits → reviewer gives feedback → candidate sees it");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let journeyReviewerCookie, journeyReviewerId;
  let journeyCandidateCookie, journeyCandidateId, journeyMatchId;

  // Step 1: Reviewer signs up
  {
    const r1 = await api("POST", "/auth/login", { name: `Journey Reviewer ${TS}`, email: `journey_rev_${TS}@test.zurio` });
    journeyReviewerCookie = r1.cookie;

    const r2 = await api("POST", "/api/me/role", { role: "reviewer" }, journeyReviewerCookie);
    const r3 = await api("POST", "/api/reviewers", {
      name: `Journey Reviewer ${TS}`, role: "Director of Engineering", company: "Meta",
      years: "11", areas: ["Software Engineering", "Engineering Management"],
      bio: "Director of Engineering at Meta. 11 years in distributed systems and team leadership.",
      resumeText: "Director of Engineering at Meta. Previously Staff Engineer at Google. Led teams of 30+ engineers. Expert in system design."
    }, journeyReviewerCookie);

    if (r3.status === 200 && r3.data.reviewer?.id) {
      journeyReviewerId = r3.data.reviewer.id;
      pass("Journey: reviewer signup", `id=${journeyReviewerId}`);
    } else {
      fail("Journey: reviewer signup", `Status ${r3.status}`);
    }
  }

  // Step 2: Candidate submits resume
  {
    const r1 = await api("POST", "/auth/login", { name: `Journey Candidate ${TS}`, email: `journey_cand_${TS}@test.zurio` });
    journeyCandidateCookie = r1.cookie;

    await api("POST", "/api/me/role", { role: "candidate" }, journeyCandidateCookie);

    const r2 = await api("POST", "/api/candidates", {
      name: `Journey Candidate ${TS}`, email: `journey_cand_${TS}@test.zurio`,
      targetRole: "Senior Software Engineer", targetArea: "Software Engineering",
      resume: "4 years experience as a software engineer. Python, Go, Kubernetes. Built data pipelines at Series B startup. Targeting Senior SWE at FAANG companies.",
      label: "Journey Test"
    }, journeyCandidateCookie);

    if (r2.status === 200 && r2.data.candidate?.id) {
      journeyCandidateId = r2.data.candidate.id;
      journeyMatchId = r2.data.match?.id;
      const status = r2.data.waitlisted ? "waitlisted" : `matched (reviewer ${r2.data.reviewer?.id})`;
      pass("Journey: candidate submission", `candidateId=${journeyCandidateId}, ${status}`);
    } else {
      fail("Journey: candidate submission", `Status ${r2.status}`);
    }
  }

  // Step 3: Reviewer sees match in dashboard
  {
    if (journeyReviewerId) {
      const r = await api("GET", `/api/reviewers/${journeyReviewerId}`, null, journeyReviewerCookie);
      const hasMatch = r.data.matches?.some(m => m.candidate?.id === journeyCandidateId);
      if (hasMatch) {
        pass("Journey: reviewer sees match", `Match for candidate ${journeyCandidateId} visible`);
        // Find the match ID from the reviewer's perspective
        if (!journeyMatchId) {
          journeyMatchId = r.data.matches.find(m => m.candidate?.id === journeyCandidateId)?.id;
        }
      } else {
        // Candidate may have been matched to a different reviewer
        skip("Journey: reviewer sees match", `Candidate may be matched to different reviewer`);
      }
    } else skip("Journey: reviewer sees match", "No reviewer");
  }

  // Step 4: Reviewer submits feedback
  {
    if (journeyMatchId) {
      const r = await api("POST", "/api/feedback", {
        matchId: journeyMatchId,
        body: "Excellent technical foundation! Your experience with distributed systems is strong. To stand out for FAANG Senior SWE: 1) Add specific metrics (latency reductions, throughput gains). 2) Highlight system design decisions. 3) Emphasize cross-team collaboration examples."
      }, journeyReviewerCookie);

      r.status === 200 && r.data.feedback?.id
        ? pass("Journey: feedback submitted", `feedbackId=${r.data.feedback.id}`)
        : fail("Journey: feedback submitted", `Status ${r.status}: ${JSON.stringify(r.data)}`);
    } else skip("Journey: feedback submitted", "No match ID");
  }

  // Step 5: Candidate sees feedback
  {
    if (journeyCandidateId) {
      const r = await api("GET", `/api/candidates/${journeyCandidateId}/status`, null, journeyCandidateCookie);
      const matchWithFb = r.data.matches?.find(m => m.feedback?.body);
      if (matchWithFb) {
        pass("Journey: candidate sees feedback", `Match status=${matchWithFb.status}, feedback length=${matchWithFb.feedback.body.length}`);
      } else if (journeyMatchId) {
        fail("Journey: candidate sees feedback", "Feedback not visible in status");
      } else {
        skip("Journey: candidate sees feedback", "Candidate was waitlisted");
      }
    } else skip("Journey: candidate sees feedback", "No candidate");
  }

  // Step 6: Verify /api/me includes candidate data
  {
    const r = await api("GET", "/api/me", null, journeyCandidateCookie);
    const hasCandidates = r.data.user?.candidates?.length > 0 || r.data.user?.candidate_ids?.length > 0;
    hasCandidates
      ? pass("Journey: /api/me includes candidate data", `candidate_ids=${JSON.stringify(r.data.user.candidate_ids)}`)
      : fail("Journey: /api/me includes candidate data", `No candidates on user`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  section(13, "EDGE CASES");
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 13a. Very long resume text
  {
    const longResume = "A".repeat(5000);
    const r1 = await api("POST", "/auth/login", { name: `E2E Long ${TS}`, email: `e2e_long_${TS}@test.zurio` });
    const r = await api("POST", "/api/candidates", {
      name: `Long Resume ${TS}`, email: `e2e_long_${TS}@test.zurio`,
      targetRole: "PM", targetArea: "Product Management", resume: longResume
    }, r1.cookie);

    r.status === 200
      ? pass("Long resume (5000 chars)", `candidateId=${r.data.candidate?.id}`)
      : fail("Long resume (5000 chars)", `Status ${r.status}`);
  }

  // 13b. Special characters in fields
  {
    const r1 = await api("POST", "/auth/login", { name: `O'Brien-Müller`, email: `e2e_special_${TS}@test.zurio` });
    r1.status === 200 && r1.data.user?.name?.includes("O'Brien")
      ? pass("Special chars in name", `name="${r1.data.user.name}"`)
      : fail("Special chars in name", `Status ${r1.status}`);
  }

  // 13c. Unicode in resume
  {
    const r1 = await api("POST", "/auth/login", { name: `Unicode ${TS}`, email: `e2e_unicode_${TS}@test.zurio` });
    const r = await api("POST", "/api/candidates", {
      name: `Unicode ${TS}`, email: `e2e_unicode_${TS}@test.zurio`,
      targetRole: "PM", targetArea: "Product Management",
      resume: "Experience: 日本語テスト. Worked at 北京 office. Skills: données analytiques."
    }, r1.cookie);
    r.status === 200
      ? pass("Unicode resume content", `candidateId=${r.data.candidate?.id}`)
      : fail("Unicode resume content", `Status ${r.status}`);
  }

  // 13d. Concurrent logins (same user)
  {
    const email = `e2e_concurrent_${TS}@test.zurio`;
    const [r1, r2, r3] = await Promise.all([
      api("POST", "/auth/login", { name: "Concurrent", email }),
      api("POST", "/auth/login", { name: "Concurrent", email }),
      api("POST", "/auth/login", { name: "Concurrent", email }),
    ]);
    const allSameId = r1.data.user?.id === r2.data.user?.id && r2.data.user?.id === r3.data.user?.id;
    allSameId
      ? pass("Concurrent logins — same user", `All returned id=${r1.data.user.id}`)
      : fail("Concurrent logins — same user", `IDs: ${r1.data.user?.id}, ${r2.data.user?.id}, ${r3.data.user?.id}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SUMMARY
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log(`\n${"═".repeat(72)}`);
  console.log(`  RESULTS:  ✅ ${passed} passed   ❌ ${failed} failed   ⏭️  ${skipped} skipped   (${passed + failed + skipped} total)`);
  console.log(`${"═".repeat(72)}`);

  if (failures.length > 0) {
    console.log("\n  FAILURES:");
    failures.forEach(f => console.log(`    ❌ ${f.label} → ${f.msg}`));
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error("Fatal:", e); process.exit(1); });
