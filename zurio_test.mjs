/**
 * Zurio Matching Test Agent — with full score tables
 * Run: node zurio_test.mjs
 */

const BASE = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "https://zurio-api-production.up.railway.app";

const TIMESTAMP = Date.now();
let passed = 0, failed = 0, warned = 0;
const results = [];

function log(emoji, label, msg) {
  const line = `${emoji}  ${label.padEnd(42)} ${msg}`;
  console.log(line);
  results.push({ emoji, label, msg });
}
function pass(label, msg)  { passed++;  log("✅", label, msg); }
function fail(label, msg)  { failed++;  log("❌", label, msg); }
function warn(label, msg)  { warned++;  log("⚠️ ", label, msg); }
function info(label, msg)  {            log("ℹ️ ", label, msg); }
function section(title)    { console.log(`\n${"─".repeat(70)}\n  ${title}\n${"─".repeat(70)}`); }

function scoreBar(score) {
  const filled = Math.round(score);
  return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${score}/10`;
}

function printScoreTable(scores, testReviewerIdSet) {
  if (!scores || scores.length === 0) { console.log("    (no scores returned)"); return; }
  console.log();
  console.log("    " + "─".repeat(66));
  console.log(`    ${"#".padEnd(4)} ${"Score".padEnd(15)} ${"Role @ Company".padEnd(30)} ${"Field".padEnd(6)} Senior`);
  console.log("    " + "─".repeat(66));
  scores.forEach((s, i) => {
    const isTest = testReviewerIdSet.has(s.reviewer_id);
    const tag = isTest ? "" : "  ⚡pre-existing";
    const role = `${s.reviewer_role || "?"}@${s.reviewer_company || "?"}`.slice(0, 29);
    const field = s.field_match ? "✓" : "✗";
    const senior = s.seniority_ok ? "✓" : "✗";
    console.log(`    ${String(i+1).padEnd(4)} ${scoreBar(s.score).padEnd(15)} ${role.padEnd(30)} ${field.padEnd(6)} ${senior}${tag}`);
    console.log(`         reasoning: ${s.reasoning || "none"}`);
  });
  console.log("    " + "─".repeat(66));
  console.log();
}

async function api(method, path, body, cookie) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "follow",
  });
  const setCookie = res.headers.get("set-cookie");
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, cookie: setCookie ? setCookie.split(";")[0] : cookie };
}

async function login(name, email) {
  const r = await api("POST", "/auth/login", { name, email });
  if (r.status !== 200 || !r.cookie) throw new Error(`Login failed for ${email}: ${JSON.stringify(r.data)}`);
  return r.cookie;
}
async function createReviewer(cookie, profile) {
  const r = await api("POST", "/api/reviewers", profile, cookie);
  if (r.status !== 200) throw new Error(`Failed: ${JSON.stringify(r.data)}`);
  return r.data.reviewer;
}
async function submitCandidate(cookie, profile) {
  const r = await api("POST", "/api/candidates", profile, cookie);
  if (r.status !== 200) throw new Error(`Failed: ${JSON.stringify(r.data)}`);
  return r.data;
}
async function getStatus(cookie, candidateId) {
  const r = await api("GET", `/api/candidates/${candidateId}/status`, null, cookie);
  if (r.status !== 200) throw new Error(`Failed: ${JSON.stringify(r.data)}`);
  return r.data;
}
async function getMatchScores(cookie, profile) {
  const r = await api("POST", "/api/debug/match-scores", {
    resume: profile.resume, targetRole: profile.targetRole, targetArea: profile.targetArea,
    excludeReviewerIds: [],
  }, cookie);
  return r.status === 200 ? r.data : null;
}

// ─── Test Data ────────────────────────────────────────────────────────────────

const REVIEWERS = [
  {
    tag: "senior_pm",
    user: { name: `TestReviewer PM ${TIMESTAMP}`, email: `reviewer_pm_${TIMESTAMP}@test.zurio` },
    profile: {
      name: `Sarah Chen ${TIMESTAMP}`, role: "VP of Product", company: "Google",
      years: "12", areas: ["Product Management", "Strategy"],
      bio: "Led product for Google Maps, 12 years building 0-to-1 and scaling B2B/B2C products.",
      resumeText: "VP of Product at Google. Previously Director of Product at Facebook. 12 years experience in product strategy, roadmap planning, leading cross-functional teams of 50+. Launched 5 products with $100M+ ARR each."
    }
  },
  {
    tag: "staff_engineer",
    user: { name: `TestReviewer Eng ${TIMESTAMP}`, email: `reviewer_eng_${TIMESTAMP}@test.zurio` },
    profile: {
      name: `Marcus Williams ${TIMESTAMP}`, role: "Staff Engineer", company: "Stripe",
      years: "9", areas: ["Software Engineering", "Backend"],
      bio: "Staff Engineer at Stripe, distributed systems expert.",
      resumeText: "Staff Software Engineer at Stripe. Expert in Go, Python, distributed systems, Kubernetes. Previously Senior Engineer at Amazon AWS. Mentor to junior engineers."
    }
  },
  {
    tag: "vp_finance",
    user: { name: `TestReviewer Finance ${TIMESTAMP}`, email: `reviewer_finance_${TIMESTAMP}@test.zurio` },
    profile: {
      name: `James Park ${TIMESTAMP}`, role: "VP of Finance", company: "Airbnb",
      years: "14", areas: ["Finance", "FP&A"],
      bio: "VP Finance at Airbnb, led IPO financial planning.",
      resumeText: "VP Finance at Airbnb. Led $3B IPO financial planning. CFO experience. 14 years in FP&A, M&A, financial modeling. CFA charterholder."
    }
  },
  {
    tag: "junior_engineer",
    user: { name: `TestReviewer JrEng ${TIMESTAMP}`, email: `reviewer_jreng_${TIMESTAMP}@test.zurio` },
    profile: {
      name: `Alex Kim ${TIMESTAMP}`, role: "Junior Software Engineer", company: "Startup",
      years: "2", areas: ["Software Engineering", "Frontend"],
      bio: "2 years as a junior frontend engineer.",
      resumeText: "Junior Software Engineer with 2 years experience in React and JavaScript. Learning backend development."
    }
  },
];

const CANDIDATES = [
  {
    tag: "pm_candidate",
    label: "Senior PM → targeting Director",
    expectedMatch: "senior_pm",
    shouldNotMatch: ["junior_engineer", "vp_finance", "staff_engineer"],
    user: { name: `TestCandidate PM ${TIMESTAMP}`, email: `candidate_pm_${TIMESTAMP}@test.zurio` },
    profile: {
      name: `Priya Sharma ${TIMESTAMP}`, email: `candidate_pm_${TIMESTAMP}@test.zurio`,
      targetRole: "Senior Product Manager", targetArea: "Product Management",
      resume: "Senior Product Manager with 5 years at Salesforce and Asana. Led roadmap for enterprise SaaS products with $10M ARR. Strong in user research, A/B testing, cross-functional leadership. Targeting Director of Product."
    }
  },
  {
    tag: "jr_engineer_candidate",
    label: "New grad → targeting Junior SWE",
    expectedMatch: "staff_engineer",
    shouldNotMatch: ["junior_engineer"],
    user: { name: `TestCandidate JrEng ${TIMESTAMP}`, email: `candidate_jreng_${TIMESTAMP}@test.zurio` },
    profile: {
      name: `Tom Lee ${TIMESTAMP}`, email: `candidate_jreng_${TIMESTAMP}@test.zurio`,
      targetRole: "Junior Software Engineer", targetArea: "Software Engineering",
      resume: "CS graduate seeking first software engineering role. Python, JavaScript, React. Built personal projects. Looking for mentorship."
    }
  },
  {
    tag: "finance_candidate",
    label: "Finance grad → targeting Analyst",
    expectedMatch: "vp_finance",
    shouldNotMatch: ["staff_engineer", "senior_pm"],
    user: { name: `TestCandidate Finance ${TIMESTAMP}`, email: `candidate_finance_${TIMESTAMP}@test.zurio` },
    profile: {
      name: `Diana Chen ${TIMESTAMP}`, email: `candidate_finance_${TIMESTAMP}@test.zurio`,
      targetRole: "Financial Analyst", targetArea: "Finance",
      resume: "Finance graduate with hedge fund internship. Excel, financial modeling, CFA Level 1. Seeking FP&A or investment analyst roles."
    }
  },
  {
    tag: "vp_candidate",
    label: "Director → targeting VP of Product",
    expectedMatch: "senior_pm",
    shouldNotMatch: ["junior_engineer"],
    user: { name: `TestCandidate VP ${TIMESTAMP}`, email: `candidate_vp_${TIMESTAMP}@test.zurio` },
    profile: {
      name: `Robert Zhang ${TIMESTAMP}`, email: `candidate_vp_${TIMESTAMP}@test.zurio`,
      targetRole: "VP of Product", targetArea: "Product Management",
      resume: "Director of Product, 8 years experience. Leading 5 PMs at Series C startup $50M ARR. Previously PM at Microsoft. Targeting VP of Product roles."
    }
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ZURIO MATCHING TEST AGENT`);
  console.log(`  Target: ${BASE}   Run ID: ${TIMESTAMP}`);
  console.log(`${"═".repeat(70)}\n`);

  section("1. HEALTH CHECK");
  try {
    const r = await api("GET", "/api/health");
    if (r.status === 200) { pass("Health check", JSON.stringify(r.data)); }
    else { fail("Health check", `Status ${r.status}`); process.exit(1); }
  } catch(e) { fail("Health check", e.message); process.exit(1); }

  section("2. CREATING TEST REVIEWERS");
  const reviewerCookies = {}, reviewerIds = {};
  for (const rev of REVIEWERS) {
    try {
      const cookie = await login(rev.user.name, rev.user.email);
      const reviewer = await createReviewer(cookie, rev.profile);
      reviewerCookies[rev.tag] = cookie;
      reviewerIds[rev.tag] = reviewer.id;
      pass(`[${rev.tag}]`, `ID ${reviewer.id} — ${reviewer.role} @ ${reviewer.company} (${reviewer.years}yr)`);
    } catch(e) { fail(`[${rev.tag}]`, e.message); }
  }
  const testIdSet = new Set(Object.values(reviewerIds));

  section("3. SELF-MATCH PREVENTION");
  for (const rev of REVIEWERS) {
    try {
      const cookie = reviewerCookies[rev.tag];
      if (!cookie) { warn(`[${rev.tag}]`, "Skipped"); continue; }
      const result = await submitCandidate(cookie, {
        name: rev.profile.name, email: rev.user.email,
        targetRole: rev.profile.role, targetArea: rev.profile.areas[0],
        resume: rev.profile.resumeText || "Experienced professional.",
      });
      const matchedId = result.reviewer?.id;
      if (!matchedId) {
        warn(`[${rev.tag}]`, "No reviewer assigned");
      } else if (matchedId === reviewerIds[rev.tag]) {
        fail(`[${rev.tag}]`, `MATCHED TO SELF (reviewer_id ${matchedId})`);
      } else {
        const tag = Object.entries(reviewerIds).find(([,id]) => id === matchedId)?.[0] || `ID ${matchedId}`;
        pass(`[${rev.tag}]`, `OK — assigned to [${tag}]`);
      }
    } catch(e) { fail(`[${rev.tag}]`, e.message); }
  }

  section("4. MATCH SCORING — FULL BREAKDOWN PER CANDIDATE");
  const candidateCookies = {}, candidateResults = {};

  for (const cand of CANDIDATES) {
    console.log(`\n  ► ${cand.tag.toUpperCase()}  —  ${cand.label}`);
    console.log(`    Targeting: "${cand.profile.targetRole}" in ${cand.profile.targetArea}`);
    try {
      const cookie = await login(cand.user.name, cand.user.email);
      candidateCookies[cand.tag] = cookie;

      // Full score table
      const scoreData = await getMatchScores(cookie, cand.profile);
      if (scoreData?.scores?.length) {
        console.log(`\n    ALL REVIEWERS SCORED (pool size: ${scoreData.pool_size}):`);
        printScoreTable(scoreData.scores, testIdSet);
      } else {
        console.log("    (debug endpoint not available or no reviewers)\n");
      }

      // Actual assignment
      const result = await submitCandidate(cookie, cand.profile);
      candidateResults[cand.tag] = result;
      const matchedId = result.reviewer?.id;
      const expectedId = reviewerIds[cand.expectedMatch];
      const matchedTag = Object.entries(reviewerIds).find(([,id]) => id === matchedId)?.[0];

      info(`  ASSIGNED`, `Reviewer ID ${matchedId} ${matchedTag ? `[${matchedTag}]` : "⚡pre-existing"} — "${result.rationale || "no rationale"}"`);

      if (!matchedId) {
        warn(`Field match [${cand.tag}]`, "No reviewer assigned");
      } else if (matchedId === expectedId) {
        pass(`Field match [${cand.tag}]`, `✓ Correctly matched to [${cand.expectedMatch}]`);
      } else {
        fail(`Field match [${cand.tag}]`, `Expected [${cand.expectedMatch}] (ID ${expectedId}) — got ${matchedTag ? `[${matchedTag}]` : "pre-existing"} (ID ${matchedId})`);
      }

      for (const badTag of (cand.shouldNotMatch || [])) {
        matchedId === reviewerIds[badTag]
          ? fail(`Exclusion [${cand.tag}→${badTag}]`, `INCORRECTLY matched to [${badTag}]`)
          : pass(`Exclusion [${cand.tag}→${badTag}]`, `Avoided [${badTag}]`);
      }
    } catch(e) { fail(`Match [${cand.tag}]`, e.message); }
  }

  section("5. SENIORITY GUARD");
  const vpResult = candidateResults["vp_candidate"];
  if (vpResult) {
    const matchedId = vpResult.reviewer?.id;
    const juniorId = reviewerIds["junior_engineer"];
    if (matchedId === juniorId) fail("VP → must not get junior", "MATCHED TO JUNIOR ENGINEER");
    else if (!matchedId) warn("VP → must not get junior", "No reviewer assigned");
    else {
      const tag = Object.entries(reviewerIds).find(([,id]) => id === matchedId)?.[0] || `ID ${matchedId}`;
      pass("VP → must not get junior", `Matched to [${tag}]`);
    }
  }

  section("6. CANDIDATE STATUS API");
  for (const cand of CANDIDATES) {
    try {
      const cookie = candidateCookies[cand.tag];
      const result = candidateResults[cand.tag];
      if (!cookie || !result?.candidate?.id) { warn(`[${cand.tag}]`, "Skipped"); continue; }
      const status = await getStatus(cookie, result.candidate.id);
      status.candidate && Array.isArray(status.matches)
        ? pass(`[${cand.tag}]`, `${status.matches.length} match(es), feedback: ${status.matches[0]?.feedback ? "received" : "pending"}`)
        : fail(`[${cand.tag}]`, `Bad response`);
    } catch(e) { fail(`[${cand.tag}]`, e.message); }
  }

  section("7. AUTH GUARD");
  try {
    const r = await api("POST", "/api/candidates", { name:"x", email:"x@x.com", targetRole:"PM", targetArea:"Product", resume:"test" });
    r.status === 401 ? pass("Unauthenticated request", "Rejected with 401") : fail("Unauthenticated request", `Expected 401, got ${r.status}`);
  } catch(e) { fail("Auth guard", e.message); }

  section("8. IDEMPOTENT LOGIN");
  try {
    const email = `idem_${TIMESTAMP}@test.zurio`;
    const [c1, c2] = await Promise.all([login("Test", email), login("Test", email)]);
    const [r1, r2] = await Promise.all([api("GET", "/api/me", null, c1), api("GET", "/api/me", null, c2)]);
    r1.data.user?.id === r2.data.user?.id
      ? pass("Same email = same user", `ID ${r1.data.user.id} on both logins`)
      : fail("Same email = same user", `Got IDs ${r1.data.user?.id} and ${r2.data.user?.id}`);
  } catch(e) { fail("Idempotent login", e.message); }

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  RESULTS:  ✅ ${passed} passed   ❌ ${failed} failed   ⚠️  ${warned} warned   (${passed+failed+warned} total)`);
  console.log(`${"═".repeat(70)}`);
  if (failed > 0) {
    console.log("\nFAILED:");
    results.filter(r => r.emoji === "❌").forEach(r => console.log(`  • ${r.label} → ${r.msg}`));
  }
  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error("Fatal:", e); process.exit(1); });
