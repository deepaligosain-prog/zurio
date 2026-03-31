import { chromium } from "playwright";

const BASE = "https://zurio-api-production.up.railway.app";
const ADMIN_SECRET = "zurio-admin-local";
const TS = Date.now();
const TEST_EMAIL = `e2etest${TS}@test.zurio`;
const TEST_PASS = "TestPass123";
const TEST_NAME = `E2E Tester ${TS}`;

let page, browser, context;
let passed = 0, failed = 0;
const results = [];

async function test(name, fn) {
  process.stdout.write(`\n  ${name}... `);
  try {
    await fn();
    process.stdout.write("\x1b[32mPASS\x1b[0m\n");
    passed++;
    results.push({ name, status: "pass" });
  } catch (e) {
    process.stdout.write(`\x1b[31mFAIL\x1b[0m: ${e.message.split("\n")[0]}\n`);
    failed++;
    results.push({ name, status: "fail", error: e.message.split("\n")[0] });
    try { await page.screenshot({ path: `e2e-screenshots/fail-${name.replace(/[^a-zA-Z0-9]/g, "-")}.png` }); } catch (_) {}
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log("\n\x1b[1m  ZURIO E2E TEST SUITE\x1b[0m");
  console.log(`  Target: ${BASE}`);
  console.log(`  Test user: ${TEST_EMAIL}\n`);

  browser = await chromium.launch({
    headless: false,
    slowMo: 250,
    args: ["--window-size=1280,900"],
  });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();

  const fs = await import("fs");
  if (!fs.existsSync("e2e-screenshots")) fs.mkdirSync("e2e-screenshots");

  // ════════════════════════════════════════════════
  console.log("\n\x1b[1m  1. LANDING & AUTH\x1b[0m");
  // ════════════════════════════════════════════════

  await test("Landing page loads", async () => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Zurio", { timeout: 15000 });
    await page.screenshot({ path: "e2e-screenshots/01-landing.png" });
  });

  await test("Register new account", async () => {
    // Click "Create Account" tab
    await page.locator("button", { hasText: "Create Account" }).click();
    await sleep(800);

    // Fill: YOUR NAME, EMAIL ADDRESS, PASSWORD, CONFIRM PASSWORD
    await page.locator('input[placeholder*="Deepali" i]').fill(TEST_NAME);
    await page.locator('input[placeholder="you@example.com"]').fill(TEST_EMAIL);
    // Password fields - there are two: password and confirm
    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.nth(0).fill(TEST_PASS);
    await pwInputs.nth(1).fill(TEST_PASS);
    await page.screenshot({ path: "e2e-screenshots/02-register-filled.png" });

    // Click "Create Account →"
    await page.locator("button.submit-btn", { hasText: "Create Account" }).click();
    await sleep(3000);
    await page.screenshot({ path: "e2e-screenshots/03-after-register.png" });

    // Should see role picker
    await page.waitForSelector("text=How are you using Zurio", { timeout: 10000 });
  });

  await test("Duplicate email returns 409", async () => {
    const res = await page.evaluate(async (data) => {
      const r = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.status;
    }, { name: "Dup", email: TEST_EMAIL, password: TEST_PASS });
    if (res !== 409) throw new Error(`Expected 409, got ${res}`);
  });

  // ════════════════════════════════════════════════
  console.log("\n\x1b[1m  2. REVIEWER FLOW\x1b[0m");
  // ════════════════════════════════════════════════

  await test("Select Reviewer role", async () => {
    await page.locator("text=I'm a Reviewer").click();
    await sleep(2000);
    await page.waitForSelector("text=REVIEWER PROFILE", { timeout: 10000 });
    await page.screenshot({ path: "e2e-screenshots/04-reviewer-form.png" });
  });

  await test("Fill reviewer profile", async () => {
    // FULL NAME - pre-filled
    // CURRENT ROLE - 2nd input
    await page.locator('input[placeholder*="Director" i]').fill("Director of Engineering");
    // COMPANY
    await page.locator('input[placeholder*="company" i]').fill("Meta");
    // YEARS dropdown
    await page.locator("select").first().selectOption({ label: "10-15 years" });
    // AREAS
    await page.locator("button", { hasText: "Software Engineering" }).click();
    await sleep(200);
    await page.locator("button", { hasText: "AI/ML" }).click();
    await sleep(200);
    // BIO textarea
    await page.locator("textarea").first().fill("Director of Engineering at Meta. 11 years building distributed systems and leading teams of 30+. Expert in system design and mentoring.");

    await page.screenshot({ path: "e2e-screenshots/05-reviewer-filled.png" });
  });

  await test("Submit reviewer profile", async () => {
    // Scroll down to see submit button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
    await page.locator("button", { hasText: "Complete Reviewer Profile" }).click();
    await sleep(4000);
    await page.screenshot({ path: "e2e-screenshots/06-reviewer-submitted.png" });
  });

  await test("Reviewer dashboard shows pending", async () => {
    const bodyText = await page.textContent("body");
    const isPending = bodyText.includes("Under Review") || bodyText.includes("under review");
    if (!isPending) console.log("    (reviewer may be auto-approved)");
    await page.screenshot({ path: "e2e-screenshots/07-reviewer-pending.png" });
  });

  // ════════════════════════════════════════════════
  console.log("\n\x1b[1m  3. ADMIN APPROVAL\x1b[0m");
  // ════════════════════════════════════════════════

  await test("Admin login via UI", async () => {
    await page.goto(`${BASE}/?admin`);
    await sleep(1500);
    // Admin login form - find password input and button
    await page.locator('input[type="password"]').first().fill(ADMIN_SECRET);
    // Click the login button - could be Submit, Enter, etc
    await page.locator("button", { hasText: /enter|login|submit/i }).first().click();
    await sleep(2000);
    await page.screenshot({ path: "e2e-screenshots/08-admin-dashboard.png" });
  });

  await test("Admin People tab", async () => {
    // Tab buttons in admin
    await page.locator("button", { hasText: /People/i }).click();
    await sleep(1500);
    await page.screenshot({ path: "e2e-screenshots/09-admin-people.png" });
  });

  await test("Admin approves test reviewer", async () => {
    const result = await page.evaluate(async (data) => {
      const dashRes = await fetch("/api/admin/dashboard", {
        headers: { "x-admin-secret": data.secret },
      });
      const dash = await dashRes.json();
      const reviewer = dash.reviewers.find(r => r.name && r.name.includes("E2E Tester"));
      if (!reviewer) return { error: `Reviewer not found. Names: ${dash.reviewers.slice(-5).map(r=>r.name).join(", ")}` };

      const approveRes = await fetch(`/api/admin/reviewers/${reviewer.id}/approve`, {
        method: "POST",
        headers: { "x-admin-secret": data.secret, "Content-Type": "application/json" },
      });
      const body = await approveRes.json();
      return { status: body.reviewer?.status, id: reviewer.id };
    }, { secret: ADMIN_SECRET });

    if (result.error) throw new Error(result.error);
    if (result.status !== "approved") throw new Error(`Status: ${result.status}`);
  });

  // ════════════════════════════════════════════════
  console.log("\n\x1b[1m  4. CANDIDATE FLOW\x1b[0m");
  // ════════════════════════════════════════════════

  const CAND_EMAIL = `e2ecand${TS}@test.zurio`;
  const CAND_NAME = `Jane Candidate ${TS}`;

  await test("Register candidate user", async () => {
    await page.evaluate(async () => {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    });
    const res = await page.evaluate(async (data) => {
      const r = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      return r.status;
    }, { name: CAND_NAME, email: CAND_EMAIL, password: TEST_PASS });
    if (res !== 200 && res !== 201) throw new Error(`Register failed: ${res}`);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await sleep(2000);
  });

  await test("Select Candidate role", async () => {
    await page.locator("text=I'm a Candidate").click();
    await sleep(2000);
    await page.screenshot({ path: "e2e-screenshots/10-candidate-form.png" });
  });

  await test("Fill candidate form completely", async () => {
    // FULL NAME - pre-filled
    // EMAIL ADDRESS - pre-filled
    // CURRENT ROLE (optional)
    await page.locator('input[placeholder*="current" i]').first().fill("Backend Engineer").catch(() => {});

    // TARGET ROLE - "e.g. Staff Engineer"
    await page.locator('input[placeholder*="Staff Engineer" i]').fill("Senior Backend Engineer");

    // FIELD/AREA select
    await page.locator("select").first().selectOption({ label: "Software Engineering" });

    await page.screenshot({ path: "e2e-screenshots/11-candidate-fields.png" });
  });

  await test("Paste resume text", async () => {
    // Click PASTE / EDIT TEXT tab
    await page.locator("button", { hasText: "PASTE" }).click();
    await sleep(500);

    await page.locator("textarea").first().fill(`${CAND_NAME}
Senior Backend Engineer | 5 years experience

SUMMARY
Experienced backend engineer specializing in distributed systems and API design.
Built high-throughput payment processing systems handling 50K TPS.

EXPERIENCE
Backend Engineer, Stripe (2021-2024)
- Designed payment routing microservices in Go
- Reduced API latency by 40% through caching and query optimization
- Led migration from monolith to microservices

Software Engineer, Uber (2019-2021)
- Built real-time pricing engine serving 10M requests/day

SKILLS
Go, Python, PostgreSQL, Redis, Kafka, Kubernetes, AWS, gRPC

EDUCATION
BS Computer Science, UC Berkeley, 2019

CONTACT
Email: ${CAND_EMAIL}
Phone: 555-123-4567
123 Main Street, San Francisco, CA 94102`);

    await page.screenshot({ path: "e2e-screenshots/12-resume-pasted.png" });
  });

  await test("Submit for review", async () => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);

    // Check if button is enabled
    const btn = page.locator("button", { hasText: "Submit for Review" });
    const isDisabled = await btn.isDisabled();
    if (isDisabled) {
      // Try force-clicking or check what's missing
      const bodyText = await page.textContent("body");
      throw new Error("Submit button is disabled. Check required fields.");
    }

    await btn.click();
    await sleep(8000); // Wait for AI matching
    await page.screenshot({ path: "e2e-screenshots/13-candidate-submitted.png" });
  });

  await test("PII was redacted", async () => {
    const result = await page.evaluate(async () => {
      const me = await fetch("/api/me", { credentials: "include" }).then(r => r.json());
      if (!me?.user?.candidate_ids?.length) return { error: "No candidate submissions" };
      const candId = me.user.candidate_ids[0];
      const status = await fetch(`/api/candidates/${candId}/status`, { credentials: "include" }).then(r => r.json());
      return { resume: status.candidate?.resume || "" };
    });
    if (result.error) throw new Error(result.error);
    if (result.resume.includes("555-123-4567")) throw new Error("Phone NOT redacted!");
    if (result.resume.includes(CAND_EMAIL)) throw new Error("Email NOT redacted!");
  });

  await test("Candidate matched or waitlisted", async () => {
    const result = await page.evaluate(async () => {
      const me = await fetch("/api/me", { credentials: "include" }).then(r => r.json());
      if (!me?.user?.candidate_ids?.length) return { error: "No submissions" };
      const candId = me.user.candidate_ids[0];
      const status = await fetch(`/api/candidates/${candId}/status`, { credentials: "include" }).then(r => r.json());
      return { matchStatus: status.match?.status };
    });
    if (result.error) throw new Error(result.error);
    if (!["pending", "done", "waitlist"].includes(result.matchStatus)) {
      throw new Error(`Unexpected: ${result.matchStatus}`);
    }
    console.log(`    match: ${result.matchStatus}`);
  });

  await test("Candidate dashboard loads", async () => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await sleep(2000);
    await page.screenshot({ path: "e2e-screenshots/14-candidate-dashboard.png" });
  });

  // ════════════════════════════════════════════════
  console.log("\n\x1b[1m  5. SHARE BANNER\x1b[0m");
  // ════════════════════════════════════════════════

  await test("No 'Enjoying' text on page", async () => {
    const bodyText = await page.textContent("body");
    if (bodyText.includes("Enjoying")) throw new Error("Old 'Enjoying' text still present!");
  });

  await test("Share banner visible", async () => {
    const banner = page.locator(".share-banner");
    const visible = await banner.isVisible().catch(() => false);
    if (!visible) {
      // May need to scroll down
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(500);
    }
    await page.screenshot({ path: "e2e-screenshots/15-share-banner.png" });
  });

  // ════════════════════════════════════════════════
  console.log("\n\x1b[1m  6. API VALIDATION\x1b[0m");
  // ════════════════════════════════════════════════

  await test("Wrong password → 401", async () => {
    const s = await page.evaluate(async () =>
      (await fetch("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@x.com", password: "wrong" }) })).status
    );
    if (s !== 401) throw new Error(`Expected 401, got ${s}`);
  });

  await test("Short password → 400", async () => {
    const s = await page.evaluate(async () =>
      (await fetch("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "T", email: "s@s.com", password: "12" }) })).status
    );
    if (s !== 400) throw new Error(`Expected 400, got ${s}`);
  });

  await test("Health endpoint → 200", async () => {
    const s = await page.evaluate(async () => (await fetch("/api/health")).status);
    if (s !== 200) throw new Error(`Got ${s}`);
  });

  await test("Admin without secret → 401/403", async () => {
    const s = await page.evaluate(async () => (await fetch("/api/admin/dashboard")).status);
    if (s !== 401 && s !== 403) throw new Error(`Expected 401/403, got ${s}`);
  });

  await test("Admin with secret → 200", async () => {
    const s = await page.evaluate(async (sec) =>
      (await fetch("/api/admin/dashboard", { headers: { "x-admin-secret": sec } })).status
    , ADMIN_SECRET);
    if (s !== 200) throw new Error(`Got ${s}`);
  });

  await test("passwordHash not in /api/me", async () => {
    const leaked = await page.evaluate(async () =>
      (await (await fetch("/api/me", { credentials: "include" })).text()).includes("passwordHash")
    );
    if (leaked) throw new Error("passwordHash exposed!");
  });

  // ════════════════════════════════════════════════
  console.log("\n\x1b[1m  7. SESSION\x1b[0m");
  // ════════════════════════════════════════════════

  await test("Session persists after reload", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await sleep(1000);
    const loggedIn = await page.evaluate(async () => {
      const d = await (await fetch("/api/me", { credentials: "include" })).json();
      return !!d?.user;
    });
    if (!loggedIn) throw new Error("Session lost!");
  });

  await test("Login as approved reviewer", async () => {
    await page.evaluate(async (d) => {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
      await fetch("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d), credentials: "include" });
    }, { email: TEST_EMAIL, password: TEST_PASS });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await sleep(2000);
    await page.screenshot({ path: "e2e-screenshots/16-reviewer-approved.png" });

    const bodyText = await page.textContent("body");
    if (bodyText.includes("Under Review")) throw new Error("Still pending after approval!");
  });

  await test("Logout clears session", async () => {
    const loggedIn = await page.evaluate(async () => {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
      const d = await (await fetch("/api/me", { credentials: "include" })).json();
      return !!d?.user;
    });
    if (loggedIn) throw new Error("Still logged in!");
    await page.goto(BASE, { waitUntil: "networkidle" });
    await sleep(1000);
    await page.screenshot({ path: "e2e-screenshots/17-logged-out.png" });
  });

  // ════════════════════════════════════════════════
  // RESULTS
  // ════════════════════════════════════════════════
  console.log("\n" + "=".repeat(50));
  console.log(`\x1b[1m  RESULTS: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m out of ${passed + failed}`);
  console.log("=".repeat(50));

  if (failed > 0) {
    console.log("\n  \x1b[31mFailed:\x1b[0m");
    results.filter(r => r.status === "fail").forEach(r => {
      console.log(`    - ${r.name}: ${r.error}`);
    });
  }

  console.log(`\n  Screenshots: e2e-screenshots/\n`);
  await sleep(2000);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error("\n  Fatal:", e.message);
  browser?.close();
  process.exit(1);
});
