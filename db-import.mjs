#!/usr/bin/env node
/**
 * Import Zurio database from a local backup file to production.
 * Run AFTER deploying to restore all data.
 *
 * Usage: node db-import.mjs
 *        node db-import.mjs --file zurio-backup-2026-03-09.json
 *        node db-import.mjs --url http://localhost:3001
 *        node db-import.mjs --secret my-admin-secret
 */
import fs from "fs";

const BASE = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "https://zurio-api-production.up.railway.app";

const SECRET = process.argv.includes("--secret")
  ? process.argv[process.argv.indexOf("--secret") + 1]
  : "zurio-admin-local";

const FILE = process.argv.includes("--file")
  ? process.argv[process.argv.indexOf("--file") + 1]
  : "zurio-backup-latest.json";

async function main() {
  console.log(`\n  Importing to: ${BASE}`);
  console.log(`  From file:   ${FILE}`);
  console.log();

  if (!fs.existsSync(FILE)) {
    console.error(`  ERROR: File not found: ${FILE}`);
    console.error(`  Run "node db-export.mjs" first to create a backup.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(FILE, "utf8");
  const data = JSON.parse(raw);

  if (!data.db || !data.nextId) {
    console.error(`  ERROR: Invalid backup file — missing db or nextId`);
    process.exit(1);
  }

  console.log(`  Backup contains:`);
  console.log(`    Users:      ${data.db.users?.length || 0}`);
  console.log(`    Reviewers:  ${data.db.reviewers?.length || 0}`);
  console.log(`    Candidates: ${data.db.candidates?.length || 0}`);
  console.log(`    Matches:    ${data.db.matches?.length || 0}`);
  console.log(`    Feedback:   ${data.db.feedback?.length || 0}`);
  if (data.exportedAt) console.log(`    Exported:   ${data.exportedAt}`);
  console.log();

  try {
    const res = await fetch(`${BASE}/api/admin/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": SECRET,
      },
      body: JSON.stringify({ db: data.db, nextId: data.nextId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`  ERROR: ${res.status} — ${err.error || res.statusText}`);
      process.exit(1);
    }

    const result = await res.json();
    console.log(`  Imported successfully!`);
    console.log(`    Users:      ${result.users}`);
    console.log(`    Reviewers:  ${result.reviewers}`);
    console.log(`    Candidates: ${result.candidates}`);
    console.log(`\n  Done. Production DB is restored.\n`);
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    process.exit(1);
  }
}

main();
