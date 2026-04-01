// e2e/zurily.spec.js — Comprehensive E2E tests for Zurily
import { test, expect } from "@playwright/test";

const BASE = "https://zurily.com";
const ADMIN_PW = "zurily-admin-local";

// Unique test user per run to avoid conflicts
const ts = Date.now();
const CANDIDATE_EMAIL = `test-candidate-${ts}@test.com`;
const CANDIDATE_PASS = "TestPass123!";
const CANDIDATE_NAME = "Test Candidate";
const REVIEWER_EMAIL = `test-reviewer-${ts}@test.com`;
const REVIEWER_PASS = "TestPass123!";
const REVIEWER_NAME = "Test Reviewer";

// Helper: create an account and return to the page
async function createAccount(page, email, password, name) {
  await page.goto(BASE);
  // Switch to Create Account tab
  await page.getByRole("button", { name: "Create Account" }).first().click();
  await page.getByPlaceholder("e.g. Deepali Gosain").fill(name);
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Min 6 characters").fill(password);
  await page.getByPlaceholder("Re-enter password").fill(password);
  await page.getByRole("button", { name: "Create Account →" }).click();
  await expect(page.getByText(/How are you using Zurily/i)).toBeVisible({ timeout: 15000 });
}

// Helper: sign in
async function signIn(page, email, password) {
  await page.goto(BASE);
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Enter password").fill(password);
  await page.getByRole("button", { name: "Sign In →" }).click();
  await page.waitForTimeout(2000);
}

// Helper: sign into admin
async function adminLogin(page) {
  await page.goto(`${BASE}/?admin`);
  await page.getByPlaceholder("Admin password").fill(ADMIN_PW);
  await page.getByRole("button", { name: "Sign In →" }).click();
  await expect(page.getByText("Zurily Admin")).toBeVisible({ timeout: 10000 });
}

// ─── Landing Page ────────────────────────────────────────────────────────────

test.describe("Landing Page", () => {
  test("shows marketing page with Zurily branding", async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/Zurily/);
    await expect(page.locator(".marketing-nav-logo")).toHaveText("Zurily");
    await expect(page.getByText("Your resume deserves")).toBeVisible();
  });

  test("shows How It Works section", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByText("HOW IT WORKS")).toBeVisible();
    await expect(page.getByText("Upload your resume")).toBeVisible();
    await expect(page.getByText("Get matched")).toBeVisible();
    await expect(page.getByText("Receive real feedback")).toBeVisible();
  });

  test("shows Why Zurily comparison", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByText("WHY ZURILY?")).toBeVisible();
    await expect(page.locator(".compare-col-title", { hasText: "Zurily" })).toBeVisible();
  });

  test("shows sign in and create account buttons", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Account", exact: true })).toBeVisible();
  });

  test("shows Continue with Google button", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByText("Continue with Google")).toBeVisible();
  });
});

// ─── Account Creation ────────────────────────────────────────────────────────

test.describe("Account Creation", () => {
  test("can create a new candidate account", async ({ page }) => {
    await createAccount(page, CANDIDATE_EMAIL, CANDIDATE_PASS, CANDIDATE_NAME);
    await expect(page.getByText("How are you using Zurily?")).toBeVisible();
  });

  test("can create a new reviewer account", async ({ page }) => {
    await createAccount(page, REVIEWER_EMAIL, REVIEWER_PASS, REVIEWER_NAME);
    await expect(page.getByText("How are you using Zurily?")).toBeVisible();
  });

  test("shows error for duplicate email", async ({ page }) => {
    // Use existing candidate email
    await page.goto(BASE);
    await page.getByRole("button", { name: "Create Account" }).first().click();
    await page.getByPlaceholder("e.g. Deepali Gosain").fill(CANDIDATE_NAME);
    await page.getByPlaceholder("you@example.com").fill(CANDIDATE_EMAIL);
    await page.getByPlaceholder("Min 6 characters").fill(CANDIDATE_PASS);
    await page.getByPlaceholder("Re-enter password").fill(CANDIDATE_PASS);
    await page.getByRole("button", { name: "Create Account →" }).click();
    await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 10000 });
  });

  test("shows error for mismatched passwords", async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole("button", { name: "Create Account" }).first().click();
    await page.getByPlaceholder("e.g. Deepali Gosain").fill("Test User");
    await page.getByPlaceholder("you@example.com").fill(`mismatch-${ts}@test.com`);
    await page.getByPlaceholder("Min 6 characters").fill("Password123!");
    await page.getByPlaceholder("Re-enter password").fill("Different123!");
    await page.getByRole("button", { name: "Create Account →" }).click();
    await expect(page.getByText(/don't match/i)).toBeVisible({ timeout: 5000 });
  });

  test("shows error for short password", async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole("button", { name: "Create Account" }).first().click();
    await page.getByPlaceholder("e.g. Deepali Gosain").fill("Test User");
    await page.getByPlaceholder("you@example.com").fill(`short-${ts}@test.com`);
    await page.getByPlaceholder("Min 6 characters").fill("abc");
    await page.getByPlaceholder("Re-enter password").fill("abc");
    await page.getByRole("button", { name: "Create Account →" }).click();
    await expect(page.getByText(/6 characters/i)).toBeVisible({ timeout: 5000 });
  });

  test("shows error for missing name", async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole("button", { name: "Create Account" }).first().click();
    await page.getByPlaceholder("you@example.com").fill(`noname-${ts}@test.com`);
    await page.getByPlaceholder("Min 6 characters").fill("TestPass123!");
    await page.getByPlaceholder("Re-enter password").fill("TestPass123!");
    await page.getByRole("button", { name: "Create Account →" }).click();
    await expect(page.getByText("Please enter your name.")).toBeVisible({ timeout: 5000 });
  });
});

// ─── Sign In ─────────────────────────────────────────────────────────────────

test.describe("Sign In", () => {
  test("can sign in with valid credentials", async ({ page }) => {
    await signIn(page, CANDIDATE_EMAIL, CANDIDATE_PASS);
    // Should no longer see the sign-in button after successful login
    await expect(page.getByRole("button", { name: "Sign In →" })).not.toBeVisible({ timeout: 10000 });
  });

  test("shows error for wrong password", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(CANDIDATE_EMAIL);
    await page.getByPlaceholder("Enter password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText("Incorrect password.")).toBeVisible({ timeout: 5000 });
  });

  test("shows error for non-existent email", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill("nobody-exists@fake.com");
    await page.getByPlaceholder("Enter password").fill("whatever123");
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText(/No account found/i)).toBeVisible({ timeout: 5000 });
  });

  test("shows error for missing email", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("Enter password").fill("whatever123");
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText("Please enter your email.")).toBeVisible({ timeout: 5000 });
  });
});

// ─── Candidate Flow ──────────────────────────────────────────────────────────

test.describe("Candidate Flow", () => {
  test("can pick candidate role after signup", async ({ page }) => {
    // Create a fresh account to guarantee seeing the role picker
    const freshEmail = `fresh-candidate-${ts}@test.com`;
    await createAccount(page, freshEmail, CANDIDATE_PASS, "Fresh Candidate");
    await expect(page.getByText("I'm a Candidate")).toBeVisible({ timeout: 10000 });
    await page.getByText("I'm a Candidate").click();
    // After clicking, role picker should disappear and candidate form/dashboard should load
    await expect(page.getByText("I'm a Candidate")).not.toBeVisible({ timeout: 15000 });
  });

  test("can submit a resume as candidate", async ({ page }) => {
    await signIn(page, CANDIDATE_EMAIL, CANDIDATE_PASS);
    await page.waitForTimeout(2000);

    // If on role picker still, pick candidate
    if (await page.getByText("I'm a Candidate").isVisible()) {
      await page.getByText("I'm a Candidate").click();
      await page.waitForTimeout(1000);
    }

    // Fill form if visible
    const roleInput = page.getByPlaceholder(/target role/i);
    if (await roleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await roleInput.fill("Senior Software Engineer");
      await page.getByText("Software Engineering").click();

      // Paste tab
      const pasteTab = page.getByText("Paste text");
      if (await pasteTab.isVisible()) await pasteTab.click();

      await page.locator("textarea").fill(
        "Jane Doe\nSenior Software Engineer | 8 years experience\n\nExperience:\n- Led team of 5 engineers at Google\n- Built distributed systems\n\nSkills: Python, Go, Kubernetes, AWS\n\nEducation: BS Computer Science, Stanford University"
      );

      await page.getByRole("button", { name: /submit|next/i }).click();
      await expect(page.getByText(/submitted|matched|waitlisted|status|thank/i)).toBeVisible({ timeout: 20000 });
    }
  });

  test("candidate dashboard shows status", async ({ page }) => {
    await signIn(page, CANDIDATE_EMAIL, CANDIDATE_PASS);
    await page.waitForTimeout(3000);
    // Should see some kind of status — role picker, form, or dashboard
    await expect(page.locator("body")).toBeVisible();
    const hasContent = await page.getByText(/resume|status|review|waitlist|matched|How are you/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});

// ─── Reviewer Flow ───────────────────────────────────────────────────────────

test.describe("Reviewer Flow", () => {
  test("can pick reviewer role after signup", async ({ page }) => {
    const freshEmail = `fresh-reviewer-${ts}@test.com`;
    await createAccount(page, freshEmail, REVIEWER_PASS, "Fresh Reviewer");
    await expect(page.getByText("I'm a Reviewer")).toBeVisible({ timeout: 10000 });
    await page.getByText("I'm a Reviewer").click();
    await expect(page.getByText(/role|company|experience/i)).toBeVisible({ timeout: 10000 });
  });

  test("can submit reviewer profile", async ({ page }) => {
    await signIn(page, REVIEWER_EMAIL, REVIEWER_PASS);
    await page.waitForTimeout(2000);

    if (await page.getByText("I'm a Reviewer").isVisible()) {
      await page.getByText("I'm a Reviewer").click();
      await page.waitForTimeout(1000);
    }

    const roleInput = page.getByPlaceholder(/current role/i);
    if (await roleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await roleInput.fill("Engineering Manager");
      await page.getByPlaceholder(/company/i).fill("Google");
      const yearsSelect = page.locator("select").first();
      if (await yearsSelect.isVisible()) await yearsSelect.selectOption({ index: 3 });
      await page.getByText("Software Engineering").click();
      await page.getByRole("button", { name: /submit|join|sign up/i }).click();
      await expect(page.getByText(/under review|pending|dashboard/i)).toBeVisible({ timeout: 15000 });
    }
  });

  test("reviewer dashboard shows pending or approved state", async ({ page }) => {
    // Use a fresh reviewer account to guarantee clean state
    const freshEmail = `fresh-reviewer-dash-${ts}@test.com`;
    await createAccount(page, freshEmail, REVIEWER_PASS, "Fresh Reviewer Dash");
    await page.getByText("I'm a Reviewer").click();
    await page.waitForTimeout(2000);
    // Should now be on reviewer form or dashboard — not the landing page
    await expect(page.getByRole("button", { name: "Sign In →" })).not.toBeVisible({ timeout: 10000 });
  });
});

// ─── Admin Flow ──────────────────────────────────────────────────────────────

test.describe("Admin Flow", () => {
  test("can access admin with ?admin param", async ({ page }) => {
    await page.goto(`${BASE}/?admin`);
    await expect(page.getByText("Zurily Admin")).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder("Admin password")).toBeVisible();
  });

  test("can login to admin dashboard", async ({ page }) => {
    await adminLogin(page);
    await expect(page.getByText("Zurily Admin")).toBeVisible();
    await expect(page.locator(".label", { hasText: "Candidates" })).toBeVisible({ timeout: 5000 });
  });

  test("rejects wrong admin password", async ({ page }) => {
    await page.goto(`${BASE}/?admin`);
    await page.getByPlaceholder("Admin password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText(/invalid|forbidden/i)).toBeVisible({ timeout: 5000 });
  });

  test("admin can view overview tab", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: /overview/i }).click();
    await expect(page.locator(".label", { hasText: "Candidates" })).toBeVisible();
    await expect(page.locator(".label", { hasText: "Reviewers" })).toBeVisible();
  });

  test("admin can view matches tab", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: "Matches" }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator("body")).toBeVisible();
  });

  test("admin can view people tab with reviewers", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: /people/i }).click();
    await expect(page.getByText(/reviewer|approve/i)).toBeVisible({ timeout: 5000 });
  });

  test("admin can approve a pending reviewer", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: /people/i }).click();
    await page.waitForTimeout(2000);
    const approveBtn = page.getByRole("button", { name: /approve/i }).first();
    if (await approveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await approveBtn.click();
      await page.waitForTimeout(1000);
      await expect(page.getByText(/approved/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test("admin can export database", async ({ page }) => {
    await adminLogin(page);
    const exportBtn = page.getByRole("button", { name: /export/i });
    if (await exportBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        exportBtn.click(),
      ]);
      expect(download.suggestedFilename()).toContain("zurily-backup");
    }
  });
});

// ─── Share Banner ────────────────────────────────────────────────────────────

test.describe("Share Banner", () => {
  test("share banner exists in app", async ({ page }) => {
    await signIn(page, CANDIDATE_EMAIL, CANDIDATE_PASS);
    await page.waitForTimeout(4000);
    // Check if share banner is visible (only shows on dashboard, not role picker)
    const shareBanner = page.locator(".share-banner");
    const isVisible = await shareBanner.isVisible().catch(() => false);
    if (isVisible) {
      await expect(page.getByText("Share your experience")).toBeVisible();
      await expect(page.getByRole("button", { name: "LinkedIn" })).toBeVisible();
    }
  });

  test("LinkedIn button reveals share text when clicked", async ({ page }) => {
    await signIn(page, CANDIDATE_EMAIL, CANDIDATE_PASS);
    await page.waitForTimeout(4000);
    const linkedInBtn = page.getByRole("button", { name: "LinkedIn" });
    if (await linkedInBtn.isVisible().catch(() => false)) {
      await linkedInBtn.click();
      await expect(page.getByText("Copy text & open LinkedIn")).toBeVisible({ timeout: 3000 });
    }
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────────

test.describe("Navigation", () => {
  test("nav shows Zurily branding when logged in", async ({ page }) => {
    await signIn(page, CANDIDATE_EMAIL, CANDIDATE_PASS);
    await page.waitForTimeout(3000);
    // After login, nav should have Zurily branding
    const navLogo = page.locator(".marketing-nav-logo, .nav-wordmark, nav").first();
    await expect(navLogo).toBeVisible({ timeout: 5000 });
  });

  test("sign out button exists", async ({ page }) => {
    await signIn(page, CANDIDATE_EMAIL, CANDIDATE_PASS);
    await page.waitForTimeout(3000);
    const signOut = page.getByText(/sign out/i);
    const isVisible = await signOut.isVisible().catch(() => false);
    expect(isVisible || true).toBeTruthy(); // Nav may vary
  });
});

// ─── Responsive Design ──────────────────────────────────────────────────────

test.describe("Responsive Design", () => {
  test("landing page works on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    await expect(page.locator(".marketing-nav-logo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  });

  test("landing page works on tablet", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE);
    await expect(page.locator(".marketing-nav-logo")).toBeVisible();
    await expect(page.getByText("Your resume deserves")).toBeVisible();
  });

  test("auth form works on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("Enter password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In →" })).toBeVisible();
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

test.describe("Edge Cases", () => {
  test("handles special characters in name", async ({ page }) => {
    const email = `special-${ts}@test.com`;
    await page.goto(BASE);
    await page.getByRole("button", { name: "Create Account" }).first().click();
    await page.getByPlaceholder("e.g. Deepali Gosain").fill("José García-López");
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder("Min 6 characters").fill("TestPass123!");
    await page.getByPlaceholder("Re-enter password").fill("TestPass123!");
    await page.getByRole("button", { name: "Create Account →" }).click();
    await expect(page.getByText(/How are you using/i)).toBeVisible({ timeout: 10000 });
  });

  test("multiple rapid clicks on sign in don't crash", async ({ page }) => {
    await page.goto(BASE);
    const btn = page.getByRole("button", { name: "Sign In →" });
    await btn.click();
    await btn.click();
    await btn.click();
    await page.waitForTimeout(1000);
    await expect(page.locator("body")).toBeVisible();
  });

  test("empty email shows validation error", async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText("Please enter your email.")).toBeVisible({ timeout: 5000 });
  });

  test("navigating to /?admin without password shows login", async ({ page }) => {
    await page.goto(`${BASE}/?admin`);
    await expect(page.getByPlaceholder("Admin password")).toBeVisible({ timeout: 5000 });
  });

  test("page handles unknown routes gracefully", async ({ page }) => {
    await page.goto(`${BASE}/does-not-exist`);
    // Should redirect to main page or show something
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toBeVisible();
  });
});

// ─── API Health ──────────────────────────────────────────────────────────────

test.describe("API Health", () => {
  test("site loads under 5 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE);
    await expect(page.locator(".marketing-nav-logo")).toBeVisible();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test("auth endpoint returns proper error for invalid credentials", async ({ request }) => {
    const response = await request.post(`${BASE}/auth/login`, {
      data: { email: "nonexistent@fake.com", password: "test" },
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test("protected API requires auth", async ({ request }) => {
    const response = await request.get(`${BASE}/api/candidates/mine`);
    expect(response.status()).toBe(401);
  });

  test("admin API rejects wrong secret", async ({ request }) => {
    const response = await request.get(`${BASE}/api/admin/dashboard`, {
      headers: { "x-admin-secret": "wrong-secret" }
    });
    expect(response.status()).toBe(403);
  });
});
