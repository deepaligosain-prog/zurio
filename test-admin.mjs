const BASE = "http://localhost:3001";
const SECRET = "zurio-admin-local";

async function api(method, path, body) {
  const opts = { method, headers: { "x-admin-secret": SECRET, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  return res.json();
}

// Get admin dashboard
const dash = await api("GET", "/api/admin/dashboard");
console.log("Stats:", JSON.stringify(dash.stats));

const pending = dash.reviewers.filter(r => r.status === "pending");
console.log(`\n=== ${pending.length} PENDING REVIEWERS ===\n`);

pending.forEach(r => {
  console.log(`${r.name} | ${r.role} @ ${r.company} | ${r.years} yrs`);
  console.log(`  LinkedIn: ${r.linkedin || "none"}`);
  console.log(`  Flags: ${r.flags?.length ? r.flags.join(", ") : "none"}`);
  console.log(`  AI: ${r.aiAssessment || "none"}`);
  console.log();
});

// Test approve Sarah Chen (high quality)
const sarah = pending.find(r => r.name === "Sarah Chen");
if (sarah) {
  console.log("=== APPROVING Sarah Chen ===");
  const result = await api("POST", `/api/admin/reviewers/${sarah.id}/approve`);
  console.log("Result:", JSON.stringify(result));
}

// Test reject Alex Doe (low quality)
const alex = pending.find(r => r.name === "Alex Doe");
if (alex) {
  console.log("\n=== REJECTING Alex Doe ===");
  const result = await api("POST", `/api/admin/reviewers/${alex.id}/reject`);
  console.log("Result:", JSON.stringify(result));
}

// Verify
const dash2 = await api("GET", "/api/admin/dashboard");
console.log("\n=== AFTER ACTIONS ===");
dash2.reviewers.filter(r => ["Sarah Chen", "Alex Doe", "Marcus Johnson", "Jake Wilson", "Priya Sharma"].includes(r.name)).forEach(r => {
  console.log(`${r.name}: status=${r.status}`);
});
