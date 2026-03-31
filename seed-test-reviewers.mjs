import { readFileSync, writeFileSync } from 'fs';

const dbPath = 'zurio-data.json';
const data = JSON.parse(readFileSync(dbPath, 'utf8'));

// Get next ID
let nextId = data.nextId || 1000;

function insert(collection, record) {
  record.id = nextId++;
  record.created_at = new Date().toISOString();
  data.db[collection].push(record);
  return record;
}

// Create test users + reviewers with different quality levels
const testReviewers = [
  {
    // Strong reviewer - should be easy approve
    name: "Sarah Chen",
    email: "sarah.chen@test.com",
    role: "VP of Engineering",
    company: "Stripe",
    years: "15+",
    areas: ["Software Engineering", "Executive Leadership"],
    linkedin: "https://linkedin.com/in/sarahchen",
    resumeText: "VP of Engineering at Stripe. Previously Director of Engineering at Google Cloud. 18 years of experience building and scaling engineering teams. Led organizations of 200+ engineers. Hired and mentored 50+ senior engineers. Stanford CS graduate.",
    status: "pending",
    aiAssessment: "Score: 5/5 — Exceptional reviewer candidate. VP-level leader with 18+ years across Stripe and Google Cloud. Extensive hiring and mentoring experience makes them ideal for reviewing engineering resumes at all levels.",
    flags: [],
  },
  {
    // Good reviewer - easy approve
    name: "Marcus Johnson",
    email: "marcus.j@test.com",
    role: "Senior Product Manager",
    company: "Meta",
    years: "7–10",
    areas: ["Product Management", "AI/ML"],
    linkedin: "https://linkedin.com/in/marcusjohnson",
    resumeText: "Senior PM at Meta working on AI products. Previously PM at Airbnb. 8 years in product management. Led teams launching 3 major features. MBA from Wharton.",
    status: "pending",
    aiAssessment: "Score: 4/5 — Well-qualified reviewer. Senior PM at Meta with 8 years of product management experience across major tech companies. Strong background for reviewing PM resumes.",
    flags: [],
  },
  {
    // Mediocre - needs review
    name: "Jake Wilson",
    email: "jake.w@test.com",
    role: "Software Engineer",
    company: "Startup",
    years: "4–6",
    areas: ["Software Engineering", "Frontend"],
    linkedin: "",
    resumeText: "Software engineer at a startup. 4 years experience. Built some React apps and APIs.",
    status: "pending",
    aiAssessment: "Score: 3/5 — Mid-level engineer with 4 years at a small startup. Resume is vague — no specific company name, no metrics, no notable projects. May be adequate for reviewing junior resumes but lacks seniority for senior roles.",
    flags: ["no_linkedin", "vague_resume"],
  },
  {
    // Weak - should reject
    name: "Alex Doe",
    email: "alex.d@test.com",
    role: "Manager",
    company: "Company",
    years: "1–3",
    areas: ["Software Engineering", "Data Science"],
    linkedin: "",
    resumeText: "",
    status: "pending",
    aiAssessment: "Score: 1/5 — Very limited profile. Only 1-3 years of experience, no resume uploaded, no LinkedIn. Role and company are generic ('Manager' at 'Company'). Cannot verify any qualifications.",
    flags: ["low_experience", "no_resume", "no_linkedin", "vague_role"],
  },
  {
    // Good but no resume - needs LinkedIn check
    name: "Priya Sharma",
    email: "priya.s@test.com",
    role: "Director of Data Science",
    company: "Netflix",
    years: "10–15",
    areas: ["Data Science", "AI/ML"],
    linkedin: "https://linkedin.com/in/priyasharma",
    resumeText: "",
    status: "pending",
    aiAssessment: "Score: 4/5 — Director-level at Netflix with 10-15 years in Data Science. Strong title and company, but no resume uploaded to verify specifics. LinkedIn provided for verification.",
    flags: ["no_resume"],
  },
];

for (const tr of testReviewers) {
  // Create user
  const user = insert("users", {
    email: tr.email,
    name: tr.name,
    password: "$2b$10$test", // dummy hash
    role: "reviewer",
  });

  // Create reviewer
  const reviewer = insert("reviewers", {
    name: tr.name,
    role: tr.role,
    company: tr.company,
    years: tr.years,
    areas: tr.areas,
    bio: "",
    resumeText: tr.resumeText,
    linkedin: tr.linkedin,
    status: tr.status,
    aiAssessment: tr.aiAssessment,
    flags: tr.flags,
  });

  user.reviewer_id = reviewer.id;
  console.log(`Created: ${tr.name} (${tr.role} @ ${tr.company}) — Score: ${tr.aiAssessment.split(' — ')[0]} | Flags: [${tr.flags.join(', ')}]`);
}

data.nextId = nextId;
writeFileSync(dbPath, JSON.stringify(data, null, 2));
console.log(`\nDone. ${testReviewers.length} test reviewers seeded.`);
