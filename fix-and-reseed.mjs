import { readFileSync, writeFileSync } from 'fs';

const dbPath = 'zurio-data.json';
const data = JSON.parse(readFileSync(dbPath, 'utf8'));

// 1. Remove broken seed records (id: null)
data.db.reviewers = data.db.reviewers.filter(r => r.id !== null);
data.db.users = data.db.users.filter(u => u.id !== null);
console.log("Cleaned nulls. Reviewers:", data.db.reviewers.length, "Users:", data.db.users.length);

// 2. Fix nextId to correct per-table format
const maxId = (col) => Math.max(0, ...data.db[col].map(r => r.id || 0)) + 1;
data.nextId = {
  users: maxId('users'),
  reviewers: maxId('reviewers'),
  candidates: maxId('candidates'),
  matches: maxId('matches'),
  feedback: maxId('feedback'),
};
console.log("Fixed nextId:", JSON.stringify(data.nextId));

// 3. Now re-seed test reviewers properly
const testReviewers = [
  {
    name: "Sarah Chen", email: "sarah.chen@test.com",
    role: "VP of Engineering", company: "Stripe", years: "15+",
    areas: ["Software Engineering", "Executive Leadership"],
    linkedin: "https://linkedin.com/in/sarahchen",
    resumeText: "VP of Engineering at Stripe. Previously Director of Engineering at Google Cloud. 18 years of experience building and scaling engineering teams. Led organizations of 200+ engineers.",
    aiAssessment: "Score: 5/5 — Exceptional reviewer. VP-level leader with 18+ years across Stripe and Google Cloud. Extensive hiring and mentoring experience.",
    flags: [],
  },
  {
    name: "Marcus Johnson", email: "marcus.j@test.com",
    role: "Senior Product Manager", company: "Meta", years: "7–10",
    areas: ["Product Management", "AI/ML"],
    linkedin: "https://linkedin.com/in/marcusjohnson",
    resumeText: "Senior PM at Meta working on AI products. Previously PM at Airbnb. 8 years in product management.",
    aiAssessment: "Score: 4/5 — Well-qualified reviewer. Senior PM at Meta with 8 years across major tech companies.",
    flags: [],
  },
  {
    name: "Jake Wilson", email: "jake.w@test.com",
    role: "Software Engineer", company: "Startup", years: "4–6",
    areas: ["Software Engineering", "Frontend"],
    linkedin: "",
    resumeText: "Software engineer at a startup. 4 years experience. Built some React apps.",
    aiAssessment: "Score: 3/5 — Mid-level engineer with vague resume. No specific company, no metrics. May be adequate for junior reviews.",
    flags: ["no_linkedin", "vague_resume"],
  },
  {
    name: "Alex Doe", email: "alex.d@test.com",
    role: "Manager", company: "Company", years: "1–3",
    areas: ["Software Engineering", "Data Science"],
    linkedin: "",
    resumeText: "",
    aiAssessment: "Score: 1/5 — Very limited profile. Only 1-3 years, no resume, no LinkedIn. Generic role and company.",
    flags: ["low_experience", "no_resume", "no_linkedin", "vague_role"],
  },
  {
    name: "Priya Sharma", email: "priya.s@test.com",
    role: "Director of Data Science", company: "Netflix", years: "10–15",
    areas: ["Data Science", "AI/ML"],
    linkedin: "https://linkedin.com/in/priyasharma",
    resumeText: "",
    aiAssessment: "Score: 4/5 — Director-level at Netflix with 10-15 years. Strong title, but no resume uploaded. LinkedIn provided.",
    flags: ["no_resume"],
  },
];

for (const tr of testReviewers) {
  const userId = data.nextId.users++;
  const reviewerId = data.nextId.reviewers++;

  const user = {
    id: userId, email: tr.email, name: tr.name,
    password: "$2b$10$dummy", role: "reviewer",
    reviewer_id: reviewerId,
    created_at: new Date().toISOString(),
  };
  data.db.users.push(user);

  const reviewer = {
    id: reviewerId, name: tr.name, role: tr.role, company: tr.company,
    years: tr.years, areas: tr.areas, bio: "", resumeText: tr.resumeText,
    linkedin: tr.linkedin, status: "pending",
    aiAssessment: tr.aiAssessment, flags: tr.flags,
    created_at: new Date().toISOString(),
  };
  data.db.reviewers.push(reviewer);

  console.log(`Seeded: ${tr.name} (id:${reviewerId}) | ${tr.aiAssessment.split(' — ')[0]} | flags: [${tr.flags.join(', ')}]`);
}

writeFileSync(dbPath, JSON.stringify(data, null, 2));
console.log("\nDone. Verifying...");

// Verify
const verify = JSON.parse(readFileSync(dbPath, 'utf8'));
verify.db.reviewers.filter(r => r.status === 'pending').forEach(r => {
  console.log(`  id:${r.id} | ${r.name} | status:${r.status}`);
});
