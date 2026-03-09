#!/usr/bin/env node
/**
 * Sets passwords for all seeded users (reviewers + candidates).
 * Password pattern: Zurio2026!
 * Run AFTER deploying the legacy-login migration.
 */

const BASE = "https://zurio-api-production.up.railway.app";
const PASSWORD = "Zurio2026!";

async function login(email, name) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = await res.json();
  const cookie = res.headers.get("set-cookie");
  // Logout immediately
  if (cookie) await fetch(`${BASE}/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
  return { ok: res.ok, json };
}

const reviewerEmails = [
  "sarah.chen@seed.zurio", "marcus.w@seed.zurio", "priya.patel@seed.zurio",
  "james.obrien@seed.zurio", "aisha.j@seed.zurio", "wei.zhang@seed.zurio",
  "elena.r@seed.zurio", "raj.k@seed.zurio", "lisa.park@seed.zurio",
  "ahmed.h@seed.zurio", "natasha.v@seed.zurio", "david.kim@seed.zurio",
  "maria.santos@seed.zurio", "chris.taylor@seed.zurio", "jennifer.wu@seed.zurio",
  "tom.anderson@seed.zurio", "yuki.t@seed.zurio", "alex.r@seed.zurio",
  "mike.okafor@seed.zurio", "sandra.lee@seed.zurio", "omar.farid@seed.zurio",
  "katie.m@seed.zurio", "daniel.park@seed.zurio", "sophie.l@seed.zurio",
  "ryan.cooper@seed.zurio",
];

const firstNames = [
  "Emma","Liam","Olivia","Noah","Ava","Ethan","Sophia","Mason","Isabella","Logan",
  "Mia","Lucas","Charlotte","Jackson","Amelia","Aiden","Harper","Sebastian","Evelyn","Mateo",
  "Abigail","Henry","Emily","Alexander","Ella","Daniel","Scarlett","Michael","Grace","Owen",
  "Chloe","Jacob","Zoey","William","Lily","Elijah","Hannah","James","Nora","Benjamin",
  "Riley","Jack","Aria","Carter","Ellie","Luke","Aubrey","Jayden","Savannah","Dylan",
  "Maya","Grayson","Penelope","Levi","Layla","Isaac","Stella","Gabriel","Hazel","Julian",
  "Aurora","Anthony","Violet","Jaxon","Nova","Lincoln","Luna","Joshua","Willow","Andrew",
  "Emilia","Hudson","Paisley","Caleb","Naomi","Ryan","Elena","Nathan","Brooklyn","Adrian",
  "Aaliyah","Miles","Madelyn","Leo","Peyton","Tristan","Kennedy","Ezra","Skylar","Axel",
  "Valentina","Asher","Claire","Nolan","Autumn","Cameron","Bella","Kai","Lucy","Finn"
];
const lastNames = [
  "Martinez","Thompson","Garcia","Anderson","Taylor","Thomas","Jackson","White","Harris","Clark",
  "Lewis","Robinson","Walker","Young","Hall","Allen","King","Wright","Lopez","Hill",
  "Scott","Green","Adams","Baker","Nelson","Carter","Mitchell","Perez","Roberts","Turner",
  "Phillips","Campbell","Parker","Evans","Edwards","Collins","Stewart","Sanchez","Morris","Rogers",
  "Reed","Cook","Morgan","Bell","Murphy","Bailey","Rivera","Cooper","Richardson","Cox",
  "Howard","Ward","Torres","Peterson","Gray","Ramirez","James","Watson","Brooks","Kelly",
  "Sanders","Price","Bennett","Wood","Barnes","Ross","Henderson","Coleman","Jenkins","Perry",
  "Powell","Long","Patterson","Hughes","Flores","Washington","Butler","Simmons","Foster","Gonzalez",
  "Bryant","Alexander","Russell","Griffin","Diaz","Hayes","Myers","Ford","Hamilton","Graham",
  "Sullivan","Wallace","Woods","Cole","West","Jordan","Owens","Reynolds","Fisher","Ellis"
];

async function main() {
  console.log(`Setting password "${PASSWORD}" for all seeded users...\n`);

  let ok = 0, fail = 0;

  // Reviewers
  console.log("── Reviewers ──");
  for (const email of reviewerEmails) {
    const { ok: success, json } = await login(email);
    if (success) { ok++; process.stdout.write("."); }
    else { fail++; process.stdout.write("X"); console.log(` ${email}: ${json.error}`); }
  }
  console.log(`\n${ok} reviewer passwords set\n`);

  // Candidates
  ok = 0;
  console.log("── Candidates ──");
  for (let i = 0; i < 100; i++) {
    const email = `${firstNames[i].toLowerCase()}.${lastNames[i].toLowerCase()}@seed.zurio`;
    const { ok: success, json } = await login(email);
    if (success) { ok++; process.stdout.write("."); }
    else { fail++; process.stdout.write("X"); }
  }
  console.log(`\n${ok} candidate passwords set\n`);

  console.log(`Done! ${fail > 0 ? `${fail} failures.` : "All passwords set successfully."}`);
  console.log(`\nLogin with any seeded email + password: ${PASSWORD}`);
}

main().catch(console.error);
