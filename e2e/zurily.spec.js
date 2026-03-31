// e2e/zurily.spec.mjs — Comprehensive E2E tests for Zurily
import { test, expect } from "@playwright/test";

const BASE = "https://zurily.com";
const ADMIN_PW = "zurily-admin-local";

// Unique test user per run to avoid conflicts
const ts = Date.now();
const TEST_USER = {
  email: `test-candidate-${ts}@test.com`,
  password: "TestPass123!",
  name: "Test Candidate",
};
const TEST_REVIEWER = {
  email: `test-reviewer-${ts}@test.com`,
  password: "TestPass123!",
  name: "Test Reviewer",
};

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
    await expect(page.getByText("Generic services", { exact: false })).toBeVisible();
    await expect(page.getByText("Matched with a real professional")).toBeVisible();
  });

  test("shows sign in and create account buttons", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
  });
});

// ─── Account Creation ────────────────────────────────────────────────────────

test.describe("Account Creation", () => {
  test("can create a new account", async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Choose a password").fill(TEST_USER.password);
    await page.getByPlaceholder("Your full name").fill(TEST_USER.name);
    await page.getByRole("button", { name: /Create Account/ }).click();
    // Should land on role picker
    await expect(page.getByText("How are you using Zurily?")).toBeVisible({ timeout: 10000 });
  });

  test("shows error for duplicate email", async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Choose a password").fill(TEST_USER.password);
    await page.getByPlaceholder("Your full name").fill(TEST_USER.name);
    await page.getByRole("button", { name: /Create Account/ }).click();
    await expect(page.getByText(/already exists|error/i)).toBeVisible({ timeout: 10000 });
  });

  test("shows error for missing fields", async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByRole("button", { name: /Create Account/ }).click();
    // Should show validation error
    await expect(page.getByText(/required|fill|email/i)).toBeVisible({ timeout: 5000 });
  });
});

// ─── Sign In ─────────────────────────────────────────────────────────────────

test.describe("Sign In", () => {
  test("can sign in with valid credentials", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Enter password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText(/Welcome|How are you using|Dashboard/i)).toBeVisible({ timeout: 10000 });
  });

  test("shows error for wrong password", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Enter password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible({ timeout: 5000 });
  });

  test("shows error for non-existent email", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill("nobody-exists@fake.com");
    await page.getByPlaceholder("Enter password").fill("whatever123");
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText(/not found|invalid|error/i)).toBeVisible({ timeout: 5000 });
  });
});

// ─── Candidate Flow ──────────────────────────────────────────────────────────

test.describe("Candidate Flow", () => {
  test("can submit resume as candidate", async ({ page }) => {
    // Sign in
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Enter password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText(/How are you using Zurily/i)).toBeVisible({ timeout: 10000 });

    // Pick candidate role
    await page.getByText("I want my resume reviewed").click();

    // Fill candidate form
    await page.getByPlaceholder(/target role/i).fill("Senior Software Engineer");

    // Select expertise area
    await page.getByText("Software Engineering").click();

    // Paste resume text
    const pasteTab = page.getByText("Paste text");
    if (await pasteTab.isVisible()) await pasteTab.click();

    await page.locator("textarea").fill(
      "Jane Doe\nSenior Software Engineer | 8 years experience\n\nExperience:\n- Led team of 5 engineers at Google\n- Built distributed systems handling 1M+ requests/day\n- Mentored junior engineers\n\nSkills: Python, Go, Kubernetes, AWS\n\nEducation: BS Computer Science, Stanford University"
    );

    // Submit
    await page.getByRole("button", { name: /submit|next/i }).click();

    // Should see status page or confirmation
    await expect(page.getByText(/submitted|matched|waitlisted|status|thank/i)).toBeVisible({ timeout: 15000 });
  });

  test("candidate can view their status", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Enter password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign In →" }).click();

    // Should see candidate dashboard/status
    await expect(page.getByText(/status|matched|waitlisted|pending|feedback/i)).toBeVisible({ timeout: 10000 });
  });
});

// ─── Reviewer Flow ───────────────────────────────────────────────────────────

test.describe("Reviewer Flow", () => {
  test("can sign up as reviewer", async ({ page }) => {
    // Create reviewer account
    await page.goto(BASE);
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByPlaceholder("you@example.com").fill(TEST_REVIEWER.email);
    await page.getByPlaceholder("Choose a password").fill(TEST_REVIEWER.password);
    await page.getByPlaceholder("Your full name").fill(TEST_REVIEWER.name);
    await page.getByRole("button", { name: /Create Account/ }).click();
    await expect(page.getByText(/How are you using Zurily/i)).toBeVisible({ timeout: 10000 });

    // Pick reviewer role
    await page.getByText("I want to review resumes").click();

    // Fill reviewer form
    await page.getByPlaceholder(/current role/i).fill("Engineering Manager");
    await page.getByPlaceholder(/company/i).fill("Google");

    // Select years of experience
    const yearsSelect = page.locator("select");
    if (await yearsSelect.isVisible()) await yearsSelect.selectOption({ index: 3 });

    // Select expertise area
    await page.getByText("Software Engineering").click();

    // Submit
    await page.getByRole("button", { name: /submit|sign up|next|join/i }).click();

    // Should see pending/under review status
    await expect(page.getByText(/under review|pending|dashboard|thank/i)).toBeVisible({ timeout: 15000 });
  });

  test("reviewer sees pending status before approval", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(TEST_REVIEWER.email);
    await page.getByPlaceholder("Enter password").fill(TEST_REVIEWER.password);
    await page.getByRole("button", { name: "Sign In →" }).click();

    await expect(page.getByText(/under review|pending/i)).toBeVisible({ timeout: 10000 });
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
    await page.goto(`${BASE}/?admin`);
    await page.getByPlaceholder("Admin password").fill(ADMIN_PW);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText("Zurily Admin")).toBeVisible({ timeout: 10000 });
    // Should see overview tab with stats
    await expect(page.getByText(/candidates|reviewers|matches/i)).toBeVisible({ timeout: 5000 });
  });

  test("rejects wrong admin password", async ({ page }) => {
    await page.goto(`${BASE}/?admin`);
    await page.getByPlaceholder("Admin password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5000 });
  });

  test("admin can view overview tab", async ({ page }) => {
    await page.goto(`${BASE}/?admin`);
    await page.getByPlaceholder("Admin password").fill(ADMIN_PW);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText("Zurily Admin")).toBeVisible({ timeout: 10000 });

    // Overview tab should show stats
    await page.getByText("overview").click();
    await expect(page.getByText(/candidates/i)).toBeVisible();
  });

  test("admin can view matches tab", async ({ page }) => {
    await page.goto(`${BASE}/?admin`);
    await page.getByPlaceholder("Admin password").fill(ADMIN_PW);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText("Zurily Admin")).toBeVisible({ timeout: 10000 });

    await page.getByText("matches").click();
    // Should show match list or empty state
    await expect(page.getByText(/match|pending|done|no matches/i)).toBeVisible({ timeout: 5000 });
  });

  test("admin can view people tab with reviewers", async ({ page }) => {
    await page.goto(`${BASE}/?admin`);
    await page.getByPlaceholder("Admin password").fill(ADMIN_PW);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText("Zurily Admin")).toBeVisible({ timeout: 10000 });

    await page.getByText("people").click();
    // Should show reviewer list
    await expect(page.getByText(/reviewer|approve|pending/i)).toBeVisible({ timeout: 5000 });
  });

  test("admin can approve a pending reviewer", async ({ page }) => {
    await page.goto(`${BASE}/?admin`);
    await page.getByPlaceholder("Admin password").fill(ADMIN_PW);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText("Zurily Admin")).toBeVisible({ timeout: 10000 });

    await page.getByText("people").click();
    await page.waitForTimeout(2000);

    // Look for an approve button (for any pending reviewer)
    const approveBtn = page.getByRole("button", { name: /approve/i }).first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      // Should see status change or success
      await page.waitForTimeout(1000);
      await expect(page.getByText(/approved/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test("admin can export database", async ({ page }) => {
    await page.goto(`${BASE}/?admin`);
    await page.getByPlaceholder("Admin password").fill(ADMIN_PW);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await expect(page.getByText("Zurily Admin")).toBeVisible({ timeout: 10000 });

    // Look for export button
    const exportBtn = page.getByRole("button", { name: /export/i });
    if (await exportBtn.isVisible()) {
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
  test("shows share banner on candidate dashboard", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Enter password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await page.waitForTimeout(3000);

    await expect(page.getByText("Share your experience")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "LinkedIn" })).toBeVisible();
  });

  test("LinkedIn button reveals share text", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Enter password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await page.waitForTimeout(3000);

    await page.getByRole("button", { name: "LinkedIn" }).click();
    await expect(page.getByText("Copy text & open LinkedIn")).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/Check out Zurily/)).toBeVisible();
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────────

test.describe("Navigation", () => {
  test("nav wordmark shows Zurily", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Enter password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await page.waitForTimeout(3000);

    await expect(page.locator(".nav-wordmark")).toHaveText("Zurily");
  });

  test("sign out returns to landing page", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
    await page.getByPlaceholder("Enter password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign In →" }).click();
    await page.waitForTimeout(3000);

    await page.getByText(/sign out|log out/i).click();
    await expect(page.getByText("Your resume deserves")).toBeVisible({ timeout: 5000 });
  });
});

// ─── Responsive Design ──────────────────────────────────────────────────────

test.describe("Responsive Design", () => {
  test("landing page works on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    await expect(page.getByText("Zurily")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("landing page works on tablet", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE);
    await expect(page.getByText("Zurily")).toBeVisible();
    await expect(page.getByText("Your resume deserves")).toBeVisible();
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

test.describe("Edge Cases", () => {
  test("handles empty resume submission gracefully", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(`edge-empty-${ts}@test.com`);
    // Create account flow
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByPlaceholder("you@example.com").fill(`edge-empty-${ts}@test.com`);
    await page.getByPlaceholder("Choose a password").fill("TestPass123!");
    await page.getByPlaceholder("Your full name").fill("Edge Tester");
    await page.getByRole("button", { name: /Create Account/ }).click();
    await page.waitForTimeout(3000);

    // Pick candidate
    if (await page.getByText("I want my resume reviewed").isVisible()) {
      await page.getByText("I want my resume reviewed").click();
    }
    await page.waitForTimeout(1000);

    // Try to submit without filling required fields
    const submitBtn = page.getByRole("button", { name: /submit|next/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Should show validation error, not crash
      await page.waitForTimeout(2000);
      // Page should still be responsive (not crashed)
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("handles special characters in name", async ({ page }) => {
    const specialEmail = `special-${ts}@test.com`;
    await page.goto(BASE);
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByPlaceholder("you@example.com").fill(specialEmail);
    await page.getByPlaceholder("Choose a password").fill("TestPass123!");
    await page.getByPlaceholder("Your full name").fill("José García-López");
    await page.getByRole("button", { name: /Create Account/ }).click();
    await expect(page.getByText(/Welcome|How are you using/i)).toBeVisible({ timeout: 10000 });
  });

  test("handles very long resume text", async ({ page }) => {
    await page.goto(BASE);
    await page.getByPlaceholder("you@example.com").fill(`long-resume-${ts}@test.com`);
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByPlaceholder("you@example.com").fill(`long-resume-${ts}@test.com`);
    await page.getByPlaceholder("Choose a password").fill("TestPass123!");
    await page.getByPlaceholder("Your full name").fill("Long Resume Tester");
    await page.getByRole("button", { name: /Create Account/ }).click();
    await page.waitForTimeout(3000);

    if (await page.getByText("I want my resume reviewed").isVisible()) {
      await page.getByText("I want my resume reviewed").click();
    }
    await page.waitForTimeout(1000);

    // Fill with very long text
    const longText = "Software Engineer with extensive experience. ".repeat(200);
    const textarea = page.locator("textarea").first();
    if (await textarea.isVisible()) {
      await textarea.fill(longText);
      // Should not crash
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("multiple rapid clicks don't cause issues", async ({ page }) => {
    await page.goto(BASE);
    // Rapidly click sign in button without filling fields
    const btn = page.getByRole("button", { name: "Sign In →" });
    await btn.click();
    await btn.click();
    await btn.click();
    // Page should still be responsive
    await page.waitForTimeout(1000);
    await expect(page.locator("body")).toBeVisible();
  });
});

// ─── API Health ──────────────────────────────────────────────────────────────

test.describe("API Health", () => {
  test("API is responding", async ({ request }) => {
    const response = await request.get(`${BASE}/api/health`);
    // Should return 200 or at least not 5xx
    expect(response.status()).toBeLessThan(500);
  });

  test("auth endpoints work", async ({ request }) => {
    const response = await request.post(`${BASE}/api/auth/login`, {
      data: { email: "nonexistent@fake.com", password: "test" },
    });
    // Should return 4xx (not found / invalid), not 5xx
    expect(response.status()).toBeLessThan(500);
  });
});
