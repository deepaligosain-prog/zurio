const BASE = "http://localhost:3001";
const SECRET = "zurio-admin-local";

async function api(method, path, body) {
  const opts = { method, headers: { "x-admin-secret": SECRET, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  return res.json();
}

// 1. Check current state
console.log("=== CURRENT STATE ===");
let dash = await api("GET", "/api/admin/dashboard");
dash.reviewers.filter(r => ["Sarah Chen","Marcus Johnson","Jake Wilson","Alex Doe","Priya Sharma"].includes(r.name))
  .forEach(r => console.log(`  ${r.name}: status=${r.status} | id=${r.id}`));

// 2. Approve Marcus (score 4/5, no flags)
console.log("\n=== APPROVE Marcus Johnson (4/5) ===");
let result = await api("POST", "/api/admin/reviewers/30/approve");
console.log("Result:", JSON.stringify(result));

// 3. Approve Priya (score 4/5, no_resume flag)
console.log("\n=== APPROVE Priya Sharma (4/5, no_resume) ===");
result = await api("POST", "/api/admin/reviewers/33/approve");
console.log("Result:", JSON.stringify(result));

// 4. Reject Alex (score 1/5, all flags)
console.log("\n=== REJECT Alex Doe (1/5) ===");
result = await api("POST", "/api/admin/reviewers/32/reject");
console.log("Result:", JSON.stringify(result));

// 5. Verify final state
console.log("\n=== FINAL STATE ===");
dash = await api("GET", "/api/admin/dashboard");
dash.reviewers.filter(r => ["Sarah Chen","Marcus Johnson","Jake Wilson","Alex Doe","Priya Sharma"].includes(r.name))
  .forEach(r => console.log(`  ${r.name}: status=${r.status}`));

// 6. Check stats
console.log("\nStats:", JSON.stringify(dash.stats));
