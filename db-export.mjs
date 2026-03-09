#!/usr/bin/env node
/**
 * Export Zurio production database to a local backup file.
 * Run BEFORE deploying to save all data.
 *
 * Usage: node db-export.mjs
 *        node db-export.mjs --url http://localhost:3001
 *        node db-export.mjs --secret my-admin-secret
 */
import fs from "fs";

const BASE = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "https://zurio-api-production.up.railway.app";

const SECRET = process.argv.includes("--secret")
  ? process.argv[process.argv.indexOf("--secret") + 1]
  : "zurio-admin-local";

const BACKUP_FILE = `zurio-backup-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
const LATEST_FILE = "zurio-backup-latest.json";

async function main() {
  console.log(`\n  Exporting from: ${BASE}`);
  console.log(`  Secret: ${SECRET.slice(0, 4)}...`);
  console.log();

  try {
    const res = await fetch(`${BASE}/api/admin/export`, {
      headers: { "x-admin-secret": SECRET },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`  ERROR: ${res.status} — ${err.error || res.statusText}`);
      process.exit(1);
    }

    const data = await res.json();
    const json = JSON.stringify(data, null, 2);

    fs.writeFileSync(BACKUP_FILE, json);
    fs.writeFileSync(LATEST_FILE, json);

    console.log(`  Users:      ${data.db.users?.length || 0}`);
    console.log(`  Reviewers:  ${data.db.reviewers?.length || 0}`);
    console.log(`  Candidates: ${data.db.candidates?.length || 0}`);
    console.log(`  Matches:    ${data.db.matches?.length || 0}`);
    console.log(`  Feedback:   ${data.db.feedback?.length || 0}`);
    console.log();
    console.log(`  Saved to: ${BACKUP_FILE}`);
    console.log(`  Also:     ${LATEST_FILE}`);
    console.log(`  Size:     ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB`);
    console.log(`\n  Done. Deploy your changes, then run: node db-import.mjs\n`);
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    process.exit(1);
  }
}

main();
