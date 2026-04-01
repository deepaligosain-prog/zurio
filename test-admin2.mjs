const BASE = "http://localhost:3001";
const SECRET = "zurio-admin-local";

async function api(method, path, body) {
  const opts = { method, headers: { "x-admin-secret": SECRET, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  return res.json();
}

const dash = await api("GET", "/api/admin/dashboard");
const pending = dash.reviewers.filter(r => r.status === "pending");
pending.forEach(r => console.log(`ID: ${r.id} | ${r.name} | status: ${r.status}`));

// Try approve the first pending one
const first = pending[0];
if (first) {
  console.log(`\nApproving ID ${first.id}: ${first.name}`);
  const result = await api("POST", `/api/admin/reviewers/${first.id}/approve`);
  console.log("Result:", JSON.stringify(result));
}
