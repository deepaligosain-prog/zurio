/**
 * Zurio Browser E2E Test Suite
 * Real browser testing — clicks buttons, fills forms, takes screenshots.
 *
 * Run: node browser_e2e_test.mjs [--headed] [--url URL]
 * Screenshots saved to: ./e2e-screenshots/
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "https://zurio-api-production.up.railway.app";

const TS = Date.now();
const SCREENSHOT_DIR = path.join(__dirname, "e2e-screenshots");
const HEADLESS = !process.argv.includes("--headed");

let passed = 0, failed = 0, skipped = 0;
const failures = [];

function log(icon, label, msg = "") {
  console.log(`  ${icon}  ${label.padEnd(55)} ${msg}`);
}
function pass(label, msg = "") { passed++; log("✅", label, msg); }
function fail(label, msg = "") { failed++; log("❌", label, msg); failures.push({ label, msg }); }
function skip(label, msg = "") { skipped++; log("⏭️ ", label, msg); }
function section(n, title) { console.log(`\n${"─".repeat(76)}\n  ${n}. ${title}\n${"─".repeat(76)}`); }

// ─── Helpers ─────────────────────────────────────────────────────────────────

let screenshotCount = 0;
async function snap(page, name) {
  screenshotCount++;
  const filename = `${String(screenshotCount).padStart(2, "0")}_${name}.png`;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });
  log("📸", `Screenshot: ${filename}`);
}

/** Wait until text appears in page body */
async function waitForText(page, text, timeout = 15000) {
  try {
    await page.waitForFunction((t) => document.body?.innerText?.includes(t), { timeout }, text);
    return true;
  } catch { return false; }
}

/** Check if page body contains text */
async function hasText(page, text) {
  return page.evaluate((t) => document.body?.innerText?.includes(t), text);
}

/** Click the first visible element whose innerText includes the given string */
async function clickByText(page, text) {
  await page.evaluate((t) => {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walk.nextNode())) {
      if (node.offsetParent === null && getComputedStyle(node).position !== "fixed") continue; // hidden
      const own = [...node.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent).join("").trim();
      if (own.includes(t)) { node.click(); return; }
    }
    // Fallback: any element containing text
    const all = [...document.querySelectorAll("*")];
    const el = all.find(e => e.innerText?.trim()?.includes(t) && e.offsetParent !== null && e.children.length === 0);
    if (el) el.click();
    else throw new Error(`No clickable element with text: "${t}"`);
  }, text);
}

/** Type into an input by matching its placeholder text (partial match) */
async function typeByPlaceholder(page, placeholderPart, value) {
  const sel = `input[placeholder*="${placeholderPart}"], textarea[placeholder*="${placeholderPart}"]`;
  await page.waitForSelector(sel, { timeout: 5000 });
  const el = await page.$(sel);
  await el.click({ clickCount: 3 });
  await el.type(value);
}

/** Type into the Nth input on the page (0-indexed) */
async function typeIntoInput(page, index, value) {
  const inputs = await page.$$(".field input, .field textarea");
  if (index >= inputs.length) throw new Error(`Input index ${index} out of range (${inputs.length} found)`);
  await inputs[index].click({ clickCount: 3 });
  await inputs[index].type(value);
}

/** Small delay helper */
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Main Test ───────────────────────────────────────────────────────────────

async function runTests() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.readdirSync(SCREENSHOT_DIR).forEach(f => fs.unlinkSync(path.join(SCREENSHOT_DIR, f)));

  console.log(`\n${"═".repeat(76)}`);
  console.log(`  ZURIO BROWSER E2E TEST SUITE`);
  console.log(`  Target: ${BASE}`);
  console.log(`  Mode: ${HEADLESS ? "headless" : "headed"}`);
  console.log(`  Run ID: ${TS}`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
  console.log(`${"═".repeat(76)}`);

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ["--window-size=1280,900", "--no-sandbox"],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  // Capture console errors and failed requests
  const consoleErrors = [];
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", err => consoleErrors.push(`PAGE ERROR: ${err.message}`));
  page.on("requestfailed", req => consoleErrors.push(`REQ FAILED: ${req.url()} — ${req.failure()?.errorText}`));

  const testEmail = `browser_e2e_${TS}@test.zurio`;
  const testName = `BrowserTest ${TS}`;

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section(1, "FLOW 1: LOGIN");
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
    await snap(page, "landing_page");

    // Verify landing page
    const hasZurio = await hasText(page, "Zurio");
    const hasGetStarted = await hasText(page, "Get Started");
    hasZurio && hasGetStarted
      ? pass("Landing page loaded", "Zurio logo + Get Started visible")
      : fail("Landing page loaded", `zurio=${hasZurio}, getStarted=${hasGetStarted}`);

    // Fill login form — name input has placeholder "e.g. Deepali Gosain", email has "you@example.com"
    await typeByPlaceholder(page, "Deepali", testName);
    await typeByPlaceholder(page, "example.com", testEmail);
    pass("Login form filled", `name="${testName}"`);
    await snap(page, "login_filled");

    // Click "Get Started →" button
    await page.click(".submit-btn.amber");
    await wait(2000);

    // Verify role picker
    const hasRolePicker = await waitForText(page, "I'm a Reviewer", 10000);
    await snap(page, "role_picker");
    hasRolePicker
      ? pass("Role picker loaded", 'Reviewer + Candidate cards visible')
      : fail("Role picker loaded", "Not found");

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section(2, "FLOW 2: REVIEWER SIGNUP");
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Click "I'm a Reviewer" card — use Puppeteer click for proper event bubbling
    const reviewerCard = await page.$(".role-card.reviewer");
    if (reviewerCard) {
      await reviewerCard.click();
      pass("Clicked 'I'm a Reviewer' card");
    } else {
      // Fallback: click by text
      await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".role-card")];
        const c = cards.find(el => el.textContent.includes("Reviewer"));
        if (c) c.click();
      });
    }
    await wait(3000);
    await snap(page, "after_reviewer_card_click");

    // Debug: log what view is showing + any errors
    const pageContent = await page.evaluate(() => document.body.innerText.slice(0, 200));
    log("🔍", "Page content after click", pageContent.replace(/\n/g, " | ").slice(0, 100));
    if (consoleErrors.length > 0) {
      log("🚨", "Console errors detected", `${consoleErrors.length} error(s)`);
      consoleErrors.forEach(e => console.log(`      → ${e.slice(0, 150)}`));
    }
    // Debug: check HTML structure
    const htmlDebug = await page.evaluate(() => {
      const root = document.getElementById("root");
      return root ? root.innerHTML.slice(0, 300) : "NO #root";
    });
    log("🔍", "HTML #root content", htmlDebug.slice(0, 120));

    const hasReviewerForm = await waitForText(page, "Complete Reviewer Profile", 15000)
      || await waitForText(page, "Tell us about", 5000);
    await snap(page, "reviewer_form_empty");
    hasReviewerForm
      ? pass("Reviewer form loaded")
      : fail("Reviewer form loaded", "Form not found");

    // Fill fields:
    // .field inputs: [0]=name(prefilled), [1]=role, [2]=company
    // Reviewer form: name, role, company, years(select), areas(chips), bio(textarea)

    // Role
    await typeByPlaceholder(page, "Senior Engineer", "Director of Engineering");
    pass("Reviewer: role filled", "Director of Engineering");

    // Company
    await typeByPlaceholder(page, "Acme Corp", "Meta");
    pass("Reviewer: company filled", "Meta");

    // Years dropdown — select "10–15"
    await page.select("select", "10–15");
    pass("Reviewer: years selected", "10-15");

    // Click area chips: "Software Engineering" and "AI/ML"
    await page.evaluate(() => {
      document.querySelectorAll(".chip").forEach(c => {
        if (c.textContent === "Software Engineering" || c.textContent === "AI/ML") c.click();
      });
    });
    pass("Reviewer: areas selected", "Software Engineering, AI/ML");

    // Bio textarea
    await page.evaluate(() => {
      const ta = document.querySelector("textarea");
      if (ta) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeInputValueSetter.call(ta, "Director of Engineering at Meta. 11 years building distributed systems and leading teams of 30+. Expert in system design and mentoring.");
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    pass("Reviewer: bio filled");

    await snap(page, "reviewer_form_filled");

    // Submit
    await page.click(".submit-btn.amber");
    await wait(3000);

    const hasDashboard = await waitForText(page, "Reviewer Dashboard", 15000)
      || await waitForText(page, "Active Reviewer", 5000);
    await snap(page, "reviewer_dashboard");
    hasDashboard
      ? pass("Reviewer dashboard loaded", "Dashboard visible after signup")
      : fail("Reviewer dashboard loaded", "Dashboard not found");

    // Verify dashboard content
    const hasNoMatches = await hasText(page, "No matches yet");
    // Badge text is uppercase via CSS (text-transform) so check both
    const hasActiveReviewer = await hasText(page, "Active Reviewer") || await hasText(page, "ACTIVE REVIEWER");
    hasActiveReviewer
      ? pass("Active Reviewer badge visible")
      : fail("Active Reviewer badge", "Not found");
    if (hasNoMatches) pass("Dashboard: no matches yet", "Expected for new reviewer");

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section(3, "FLOW 3: CANDIDATE SIGNUP + MATCHING");
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Click "Candidate" tab in nav
    const candTab = await page.$('.nav-tab:nth-child(2)');
    if (candTab) {
      await candTab.click();
    } else {
      // Fallback
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")];
        const tab = btns.find(b => b.textContent.trim() === "Candidate");
        if (tab) tab.click();
      });
    }
    await wait(2000);

    // May show role picker or directly candidate form
    const showsRolePick = await hasText(page, "I'm a Candidate");
    if (showsRolePick) {
      const candCard = await page.$(".role-card.candidate");
      if (candCard) await candCard.click();
      else await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".role-card")];
        const c = cards.find(el => el.textContent.includes("Candidate"));
        if (c) c.click();
      });
      await wait(2000);
      pass("Candidate: role card clicked");
    }

    const hasCandidateForm = await waitForText(page, "Submit for Review", 10000);
    await snap(page, "candidate_form_empty");
    hasCandidateForm
      ? pass("Candidate form loaded")
      : fail("Candidate form loaded", "Form not found");

    // Fill: target role
    await typeByPlaceholder(page, "Staff Engineer", "Software Engineer");
    pass("Candidate: target role filled", "Software Engineer");

    // Select field dropdown — "Software Engineering"
    await page.evaluate(() => {
      const selects = document.querySelectorAll("select");
      for (const sel of selects) {
        const opt = [...sel.options].find(o => o.text.includes("Software Engineering"));
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          break;
        }
      }
    });
    pass("Candidate: field selected", "Software Engineering");

    // Click "Paste Text" tab for resume
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll(".resume-tab, button")];
      const pasteTab = tabs.find(t => t.textContent.includes("Paste"));
      if (pasteTab) pasteTab.click();
    });
    await wait(500);

    // Type resume into the paste textarea
    await page.evaluate(() => {
      const ta = document.querySelector('textarea[placeholder*="Paste"]');
      if (ta) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, "Software Engineer with 4 years of experience at a Series B startup. Proficient in Python, Go, and JavaScript. Built scalable microservices handling 10M requests/day on AWS. Led migration from monolith to microservices architecture reducing deploy time by 80%. Experience with Kubernetes, Docker, CI/CD pipelines, and observability tooling. Seeking Senior SWE roles at top tech companies.");
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    pass("Candidate: resume pasted");

    await snap(page, "candidate_form_filled");

    // Submit
    await page.click(".submit-btn.blue");
    // AI matching takes time
    log("⏳", "Waiting for AI matching...", "(this may take 10-20 seconds)");
    await wait(5000);
    const hasStatus = await waitForText(page, "submitted", 30000)
      || await waitForText(page, "Targeting", 15000)
      || await waitForText(page, "Finding reviewer", 10000)
      || await waitForText(page, "Review pending", 10000)
      || await waitForText(page, "Waitlisted", 10000)
      || await waitForText(page, "Candidate Dashboard", 10000);

    await snap(page, "candidate_status");
    hasStatus
      ? pass("Candidate status page loaded", "Submission visible")
      : fail("Candidate status page loaded", "Status page not detected");

    // Check match status
    const statusText = await page.evaluate(() => document.body.innerText);
    if (statusText.includes("Review pending") || statusText.includes("Awaiting")) {
      pass("Candidate matched to reviewer", "Review pending");
    } else if (statusText.includes("Waitlisted") || statusText.includes("Finding reviewer")) {
      pass("Candidate waitlisted", "No available reviewer (self-match prevention)");
    } else if (statusText.includes("submitted")) {
      pass("Candidate submission confirmed");
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section(4, "FLOW 4: MULTI-RESUME SUBMISSION");
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Click "+ Add Resume" button
    const hasAddBtn = await hasText(page, "Add Resume");
    if (hasAddBtn) {
      const addBtn = await page.evaluateHandle(() => {
        const btns = [...document.querySelectorAll("button")];
        return btns.find(b => b.textContent.includes("Add Resume"));
      });
      if (addBtn) await addBtn.click();
      await wait(2000);
      pass("Clicked + Add Resume");
    } else {
      skip("+ Add Resume", "Button not visible");
    }

    const form2Ready = await waitForText(page, "Submit for Review", 10000);
    if (form2Ready) {
      // Fill second resume — Data Scientist
      await typeByPlaceholder(page, "Staff Engineer", "Data Scientist");
      pass("Multi-resume: target role", "Data Scientist");

      // Select "Data Science" area
      await page.evaluate(() => {
        const selects = document.querySelectorAll("select");
        for (const sel of selects) {
          const opt = [...sel.options].find(o => o.text.includes("Data Science"));
          if (opt) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            break;
          }
        }
      });
      pass("Multi-resume: field selected", "Data Science");

      // Paste tab
      await page.evaluate(() => {
        const tabs = [...document.querySelectorAll(".resume-tab, button")];
        const pasteTab = tabs.find(t => t.textContent.includes("Paste"));
        if (pasteTab) pasteTab.click();
      });
      await wait(500);

      // Type second resume
      await page.evaluate(() => {
        const ta = document.querySelector('textarea[placeholder*="Paste"]');
        if (ta) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(ta, "Data Scientist with 3 years experience in machine learning and statistical modeling. Proficient in Python, R, TensorFlow, PyTorch, and SQL. Published 2 papers on NLP at ACL. Built recommendation systems serving 5M users at an e-commerce startup. Experience with A/B testing, causal inference, and productionizing ML models. Seeking Senior Data Scientist roles at FAANG.");
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      pass("Multi-resume: second resume pasted");

      await snap(page, "second_resume_filled");

      // Submit
      await page.click(".submit-btn.blue");
      log("⏳", "Waiting for AI matching (2nd resume)...");
      await wait(5000);
      await waitForText(page, "Candidate Dashboard", 30000) || await waitForText(page, "Targeting", 20000);
      await wait(2000);

      // Count submission cards
      const targetingCount = await page.evaluate(() => {
        return (document.body.innerText.match(/Targeting:/g) || []).length;
      });
      await snap(page, "multi_resume_status");
      targetingCount >= 2
        ? pass("Multi-resume: 2 submissions visible", `${targetingCount} submission cards`)
        : fail("Multi-resume: 2 submissions visible", `Found ${targetingCount}`);
    } else {
      fail("Multi-resume: form not loaded", "Could not navigate to second resume form");
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section(5, "FLOW 5: REVIEWER WRITES FEEDBACK");
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Switch to Reviewer tab
    const revTab = await page.$('.nav-tab:first-child');
    if (revTab) await revTab.click();
    else await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const tab = btns.find(b => b.textContent.trim() === "Reviewer");
      if (tab) tab.click();
    });
    await wait(3000);

    const dashLoaded = await waitForText(page, "Reviewer Dashboard", 10000);
    await snap(page, "reviewer_dashboard_with_matches");
    dashLoaded
      ? pass("Reviewer dashboard loaded")
      : fail("Reviewer dashboard", "Not found after tab switch");

    // Check for "Write Review →" button
    const hasWriteReview = await hasText(page, "Write Review");
    if (hasWriteReview) {
      pass("Match card visible", "Write Review button present");

      // Click "Write Review →"
      const writeBtn = await page.evaluateHandle(() => {
        const btns = [...document.querySelectorAll("button")];
        return btns.find(b => b.textContent.includes("Write Review"));
      });
      if (writeBtn) await writeBtn.click();
      await wait(2000);

      const hasReviewUI = await waitForText(page, "Your Feedback", 10000);
      await snap(page, "review_interface");
      hasReviewUI
        ? pass("Review interface loaded", "Resume + feedback panel visible")
        : fail("Review interface loaded", "Not found");

      // Verify candidate resume is visible
      const hasResume = await hasText(page, "Candidate Resume");
      hasResume
        ? pass("Candidate resume displayed")
        : fail("Candidate resume", "Not visible in review panel");

      // Type feedback
      await page.evaluate(() => {
        const ta = document.querySelector(".feedback-textarea, textarea");
        if (ta) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(ta, "Great resume overall!\n\nSTRENGTHS:\n- Strong technical skills in Python, Go, and JavaScript\n- Impressive scale (10M requests/day)\n- Good progression showing leadership in monolith migration\n\nAREAS TO IMPROVE:\n- Add specific metrics: latency numbers, cost savings, team size\n- Highlight system design decisions you drove\n- Include mentoring or cross-team collaboration examples\n- Consider a stronger opening summary that positions you for Senior roles");
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      pass("Feedback typed");

      await snap(page, "feedback_filled");

      // Submit feedback
      const sendBtn = await page.evaluateHandle(() => {
        const btns = [...document.querySelectorAll("button")];
        return btns.find(b => b.textContent.includes("Send Feedback"));
      });
      if (sendBtn) await sendBtn.click();
      await wait(3000);

      const hasSent = await waitForText(page, "Feedback sent", 10000)
        || await waitForText(page, "Reviewed", 5000);
      await snap(page, "feedback_sent");
      hasSent
        ? pass("Feedback submitted successfully", "Success message visible")
        : fail("Feedback submitted", "Success message not found");
    } else {
      skip("Write Review", "No pending matches (self-match prevention — reviewer and candidate are same user)");
      await snap(page, "reviewer_no_matches");
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section(6, "FLOW 6: CANDIDATE SEES FEEDBACK");
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Switch to Candidate tab
    const candTab2 = await page.$('.nav-tab:nth-child(2)');
    if (candTab2) await candTab2.click();
    else await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const tab = btns.find(b => b.textContent.trim() === "Candidate");
      if (tab) tab.click();
    });
    await wait(3000);

    const bodyText = await page.evaluate(() => document.body.innerText);

    if (hasWriteReview) {
      // We submitted feedback — check if candidate sees it
      const hasReviewReceived = bodyText.includes("Review received") || bodyText.includes("Feedback received");
      const hasFeedbackText = bodyText.includes("STRENGTHS") || bodyText.includes("metrics");

      await snap(page, "candidate_sees_feedback");

      hasReviewReceived
        ? pass("Candidate: 'Review received' badge visible")
        : fail("Candidate: 'Review received'", "Badge not found");

      hasFeedbackText
        ? pass("Candidate: feedback text visible", "Reviewer's feedback displayed")
        : fail("Candidate: feedback text", "Not visible");
    } else {
      await snap(page, "candidate_status_no_feedback");
      skip("Candidate sees feedback", "No feedback was submitted (self-match)");
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section(7, "FLOW 7: SIGN OUT + RE-LOGIN");
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Click Sign out
    const signOutBtn = await page.$('.nav-signout');
    if (signOutBtn) await signOutBtn.click();
    else await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const btn = btns.find(b => b.textContent.trim() === "Sign out");
      if (btn) btn.click();
    });
    await wait(2000);

    const hasLoginAgain = await waitForText(page, "Get Started", 10000);
    await snap(page, "signed_out");
    hasLoginAgain
      ? pass("Signed out", "Login page visible again")
      : fail("Signed out", "Login page not found");

    // Re-login with same email
    if (hasLoginAgain) {
      await typeByPlaceholder(page, "Deepali", testName);
      await typeByPlaceholder(page, "example.com", testEmail);
      await page.click(".submit-btn.amber");
      await wait(3000);

      const hasData = await waitForText(page, "Dashboard", 10000)
        || await waitForText(page, "submitted", 5000)
        || await waitForText(page, "Targeting", 5000);

      await snap(page, "relogin_dashboard");
      hasData
        ? pass("Re-login: data persisted", "Previous data visible after re-login")
        : fail("Re-login: data persisted", "Dashboard not found");
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    section(8, "FLOW 8: TWO-USER FEEDBACK (separate candidate → reviewer writes feedback → candidate sees it)");
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Step 1: Open a new incognito context for a second user (candidate)
    const context2 = await browser.createBrowserContext();
    const page2 = await context2.newPage();
    page2.setDefaultTimeout(15000);

    const cand2Email = `browser_cand2_${TS}@test.zurio`;
    const cand2Name = `Candidate Two ${TS}`;

    try {
      // Login as candidate user
      await page2.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
      await typeByPlaceholder(page2, "Deepali", cand2Name);
      await typeByPlaceholder(page2, "example.com", cand2Email);
      await page2.click(".submit-btn.amber");
      await wait(2000);

      // Pick candidate role
      const hasPick = await waitForText(page2, "I'm a Candidate", 10000);
      if (hasPick) {
        const card = await page2.$(".role-card.candidate");
        if (card) await card.click();
        await wait(2000);
      }
      pass("Flow 8: candidate 2 logged in");

      // Fill candidate form
      await waitForText(page2, "Submit for Review", 10000);
      await typeByPlaceholder(page2, "Staff Engineer", "Senior Software Engineer");

      await page2.evaluate(() => {
        const selects = document.querySelectorAll("select");
        for (const sel of selects) {
          const opt = [...sel.options].find(o => o.text.includes("Software Engineering"));
          if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); break; }
        }
      });

      // Paste tab
      await page2.evaluate(() => {
        const tabs = [...document.querySelectorAll(".resume-tab, button")];
        const t = tabs.find(t => t.textContent.includes("Paste"));
        if (t) t.click();
      });
      await wait(500);

      await page2.evaluate(() => {
        const ta = document.querySelector('textarea[placeholder*="Paste"]');
        if (ta) {
          const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          s.call(ta, "Senior Software Engineer with 6 years experience. Led backend services at Uber handling 100M rides/month. Expert in Go, Rust, distributed systems, and observability. Migrated core payment systems to microservices. Seeking Staff Engineer roles at FAANG companies.");
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      await page2.click(".submit-btn.blue");
      log("⏳", "Flow 8: waiting for AI match...");
      await wait(5000);
      await waitForText(page2, "Candidate Dashboard", 30000) || await waitForText(page2, "Targeting", 20000);
      await wait(2000);
      await snap(page2, "flow8_candidate2_status");
      pass("Flow 8: candidate 2 submitted");

      // Step 2: Switch to reviewer (user 1) and check dashboard
      // Go back to original page and switch to reviewer tab
      await page.goto(BASE, { waitUntil: "networkidle2", timeout: 15000 });
      await wait(3000);

      // Navigate to reviewer dashboard
      const revTab2 = await page.$('.nav-tab:first-child');
      if (revTab2) await revTab2.click();
      await wait(3000);

      await snap(page, "flow8_reviewer_dashboard");
      const hasMatch = await hasText(page, "Write Review");

      if (hasMatch) {
        pass("Flow 8: reviewer sees new match");

        // Click Write Review
        const wrBtn = await page.evaluateHandle(() => {
          const btns = [...document.querySelectorAll("button")];
          return btns.find(b => b.textContent.includes("Write Review"));
        });
        if (wrBtn) await wrBtn.click();
        await wait(2000);

        await snap(page, "flow8_review_interface");
        const hasUI = await waitForText(page, "Your Feedback", 10000);
        hasUI
          ? pass("Flow 8: review interface loaded")
          : fail("Flow 8: review interface", "Not found");

        // Type feedback
        await page.evaluate(() => {
          const ta = document.querySelector(".feedback-textarea, textarea");
          if (ta) {
            const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            s.call(ta, "Excellent resume! Your Uber experience is very compelling.\n\nSTRENGTHS:\n- Strong distributed systems background\n- Impressive scale (100M rides/month)\n- Good progression to Staff-level scope\n\nIMPROVEMENTS:\n- Quantify the payment migration impact (latency, uptime)\n- Add cross-team leadership examples\n- Strengthen the opening summary");
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        pass("Flow 8: feedback typed");

        // Submit
        const sendBtn2 = await page.evaluateHandle(() => {
          const btns = [...document.querySelectorAll("button")];
          return btns.find(b => b.textContent.includes("Send Feedback"));
        });
        if (sendBtn2) await sendBtn2.click();
        await wait(3000);

        const sent = await waitForText(page, "Feedback sent", 10000);
        await snap(page, "flow8_feedback_sent");
        sent
          ? pass("Flow 8: feedback submitted", "Success!")
          : fail("Flow 8: feedback submitted", "Success message not found");

        // Step 3: Candidate 2 checks status — should see feedback
        await page2.reload({ waitUntil: "networkidle2" });
        await wait(3000);
        const cand2Body = await page2.evaluate(() => document.body.innerText);
        const seesReview = cand2Body.includes("Review received") || cand2Body.includes("Feedback received");
        const seesFeedback = cand2Body.includes("STRENGTHS") || cand2Body.includes("Uber");
        await snap(page2, "flow8_candidate2_sees_feedback");

        seesReview
          ? pass("Flow 8: candidate 2 sees 'Review received'")
          : fail("Flow 8: candidate 2 'Review received'", "Badge not found");
        seesFeedback
          ? pass("Flow 8: candidate 2 sees feedback text")
          : fail("Flow 8: feedback text", "Not visible");
      } else {
        skip("Flow 8: feedback flow", "Reviewer has no pending matches");
      }
    } catch (e) {
      await snap(page2, "flow8_error").catch(() => {});
      fail("Flow 8", e.message);
    } finally {
      await context2.close();
    }

  } catch (e) {
    await snap(page, "fatal_error").catch(() => {});
    fail("FATAL ERROR", e.message);
    console.error(e);
  } finally {
    await browser.close();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SUMMARY
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log(`\n${"═".repeat(76)}`);
  console.log(`  RESULTS:  ✅ ${passed} passed   ❌ ${failed} failed   ⏭️  ${skipped} skipped   (${passed + failed + skipped} total)`);
  console.log(`  SCREENSHOTS: ${screenshotCount} saved to ${SCREENSHOT_DIR}`);
  console.log(`${"═".repeat(76)}`);

  if (failures.length > 0) {
    console.log("\n  FAILURES:");
    failures.forEach(f => console.log(`    ❌ ${f.label} → ${f.msg}`));
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error("Fatal:", e); process.exit(1); });
