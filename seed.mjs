#!/usr/bin/env node
/**
 * Seed script: creates 25 reviewers and 100 candidates with multiple resumes
 * via the live Zurio API. Outputs a login-info table at the end.
 *
 * Usage:  node seed.mjs
 */

const BASE = "https://zurio-api-production.up.railway.app";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function api(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  const json = await res.json();
  return { json, cookie: setCookie || cookie };
}

// ─── Reviewer Profiles (25) ─────────────────────────────────────────────────

const reviewers = [
  // Software Engineering (5)
  { name: "Sarah Chen", email: "sarah.chen@seed.zurio", role: "Staff Engineer", company: "Google", years: "10–15", areas: ["Software Engineering"], bio: "Distributed systems specialist. Led the design of Google's next-gen storage layer. Stanford CS PhD. I focus reviews on system design, scalability patterns, and clean architecture." },
  { name: "Marcus Williams", email: "marcus.w@seed.zurio", role: "Engineering Manager", company: "Stripe", years: "10–15", areas: ["Software Engineering", "Backend"], bio: "Former IC turned manager. 12 years building payment infrastructure. I review for both technical depth and communication clarity." },
  { name: "Priya Patel", email: "priya.patel@seed.zurio", role: "Principal Engineer", company: "Netflix", years: "15+", areas: ["Software Engineering", "Distributed Systems"], bio: "Led microservices migration for Netflix streaming. Expert in Java, Go, and system design. I give actionable feedback on architecture sections." },
  { name: "James O'Brien", email: "james.obrien@seed.zurio", role: "Senior Engineer", company: "Shopify", years: "5–10", areas: ["Software Engineering", "Full Stack"], bio: "Full-stack Ruby/React developer. Open source contributor to Rails. I focus on practical project descriptions and impact metrics." },
  { name: "Aisha Johnson", email: "aisha.j@seed.zurio", role: "VP of Engineering", company: "Datadog", years: "15+", areas: ["Software Engineering", "DevOps"], bio: "Built Datadog's monitoring platform from 10 to 500 engineers. I review for leadership narrative and technical strategy." },

  // AI / ML (5)
  { name: "Dr. Wei Zhang", email: "wei.zhang@seed.zurio", role: "Research Scientist", company: "DeepMind", years: "10–15", areas: ["AI/ML", "Research"], bio: "NeurIPS best paper author. Specializing in reinforcement learning and LLMs. I review ML resumes for research rigor and publication impact." },
  { name: "Elena Rodriguez", email: "elena.r@seed.zurio", role: "ML Engineering Lead", company: "Meta", years: "5–10", areas: ["AI/ML", "Software Engineering"], bio: "Built recommendation systems serving 3B+ users. PyTorch contributor. I bridge the gap between ML research and production systems." },
  { name: "Raj Krishnan", email: "raj.k@seed.zurio", role: "Head of AI", company: "Anthropic", years: "10–15", areas: ["AI/ML", "NLP"], bio: "Former OpenAI researcher. PhD in NLP from MIT. I focus on how candidates communicate complex ML concepts and quantify model improvements." },
  { name: "Dr. Lisa Park", email: "lisa.park@seed.zurio", role: "Senior Research Scientist", company: "Google Brain", years: "5–10", areas: ["AI/ML", "Computer Vision"], bio: "Computer vision specialist. 30+ papers in CVPR/ICCV. I look for strong mathematical foundations and real-world ML deployment experience." },
  { name: "Ahmed Hassan", email: "ahmed.h@seed.zurio", role: "MLOps Director", company: "Uber", years: "10–15", areas: ["AI/ML", "Data Engineering"], bio: "Built Uber's Michelangelo ML platform. Expert in ML infrastructure, feature stores, and model serving at scale." },

  // Data Science & Analytics (3)
  { name: "Natasha Volkov", email: "natasha.v@seed.zurio", role: "Chief Data Scientist", company: "Airbnb", years: "15+", areas: ["Data Science", "Analytics"], bio: "Built Airbnb's experimentation platform. PhD in Statistics from Berkeley. I review for statistical rigor and business impact storytelling." },
  { name: "David Kim", email: "david.kim@seed.zurio", role: "Senior Data Scientist", company: "Spotify", years: "5–10", areas: ["Data Science", "AI/ML"], bio: "Recommendation algorithms and A/B testing at scale. I focus on how candidates present data-driven decision making." },
  { name: "Maria Santos", email: "maria.santos@seed.zurio", role: "Analytics Director", company: "DoorDash", years: "10–15", areas: ["Data Science", "Product Analytics"], bio: "Led analytics for DoorDash marketplace. Expert in causal inference and marketplace dynamics. I review for analytical thinking and SQL proficiency." },

  // Product Management (3)
  { name: "Chris Taylor", email: "chris.taylor@seed.zurio", role: "Group PM", company: "Microsoft", years: "10–15", areas: ["Product Management"], bio: "Shipped Azure AI services to GA. Former founder. I review PM resumes for outcome-driven narratives and cross-functional leadership." },
  { name: "Jennifer Wu", email: "jennifer.wu@seed.zurio", role: "Director of Product", company: "Figma", years: "5–10", areas: ["Product Management", "Design"], bio: "Led Figma's collaboration features. I focus on user empathy, metrics-driven thinking, and how PMs articulate product vision." },
  { name: "Tom Anderson", email: "tom.anderson@seed.zurio", role: "VP Product", company: "Slack", years: "15+", areas: ["Product Management", "Strategy"], bio: "Built Slack's enterprise product line. I review for strategic thinking, stakeholder management, and go-to-market narrative." },

  // Design (2)
  { name: "Yuki Tanaka", email: "yuki.t@seed.zurio", role: "Design Director", company: "Apple", years: "10–15", areas: ["Design", "UX"], bio: "Led iOS design system evolution. Red Dot Design Award winner. I review for design process articulation and portfolio presentation." },
  { name: "Alex Rivera", email: "alex.r@seed.zurio", role: "Staff UX Researcher", company: "Airbnb", years: "5–10", areas: ["Design", "UX Research"], bio: "Mixed-methods researcher. Built Airbnb's research ops practice. I focus on how designers communicate research insights and design rationale." },

  // DevOps / Infrastructure (2)
  { name: "Mike Okafor", email: "mike.okafor@seed.zurio", role: "Principal SRE", company: "AWS", years: "15+", areas: ["DevOps", "Cloud Infrastructure"], bio: "Architected AWS's internal SRE practices. Expert in Kubernetes, Terraform, and incident management. I review for operational thinking." },
  { name: "Sandra Lee", email: "sandra.lee@seed.zurio", role: "Platform Engineering Lead", company: "Cloudflare", years: "5–10", areas: ["DevOps", "Software Engineering"], bio: "Built Cloudflare's edge computing platform. Rust and Go specialist. I focus on infrastructure-as-code and reliability engineering." },

  // Security (1)
  { name: "Omar Farid", email: "omar.farid@seed.zurio", role: "CISO", company: "Coinbase", years: "15+", areas: ["Security", "Software Engineering"], bio: "Former NSA analyst turned CISO. Built Coinbase's security program from scratch. I review for security mindset and threat modeling skills." },

  // Mobile (2)
  { name: "Katie Morgan", email: "katie.m@seed.zurio", role: "iOS Lead", company: "Lyft", years: "5–10", areas: ["Mobile Development", "Software Engineering"], bio: "Built Lyft's rider app from scratch in Swift. WWDC speaker. I review iOS resumes for SwiftUI proficiency and app architecture." },
  { name: "Daniel Park", email: "daniel.park@seed.zurio", role: "Android Tech Lead", company: "Cash App", years: "5–10", areas: ["Mobile Development", "Software Engineering"], bio: "Led Cash App Android rewrite to Kotlin/Compose. I focus on mobile architecture patterns and performance optimization." },

  // Blockchain / Web3 (1)
  { name: "Sophie Laurent", email: "sophie.l@seed.zurio", role: "Protocol Engineer", company: "Ethereum Foundation", years: "5–10", areas: ["Blockchain", "Software Engineering"], bio: "Core contributor to Ethereum 2.0. Solidity and Rust expert. I review for smart contract security patterns and protocol design thinking." },

  // Frontend (1)
  { name: "Ryan Cooper", email: "ryan.cooper@seed.zurio", role: "Staff Frontend Engineer", company: "Vercel", years: "5–10", areas: ["Frontend", "Software Engineering"], bio: "Next.js core team member. Built Vercel's dashboard. Expert in React, TypeScript, and web performance. I review for component design and a11y." },
];

// ─── Candidate Profiles (100) ─────────────────────────────────────────────────

const categories = [
  "Software Engineering",
  "AI/ML",
  "Data Science",
  "Product Management",
  "Design",
  "DevOps",
  "Security",
  "Mobile Development",
  "Blockchain",
  "Frontend",
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

function generateResume(name, targetRole, targetArea, experienceLevel) {
  const years = experienceLevel === "senior" ? "7+" : experienceLevel === "mid" ? "3-5" : "0-2";
  const resumes = {
    "Software Engineering": {
      senior: `${name}\nSenior Software Engineer | ${years} years experience\n\nSUMMARY\nExperienced software engineer with expertise in distributed systems, microservices architecture, and cloud-native applications. Proven track record of leading technical teams and delivering scalable solutions.\n\nEXPERIENCE\n• Led migration of monolithic application to microservices, reducing deployment time by 80%\n• Designed and implemented real-time data pipeline processing 1M+ events/second\n• Mentored 8 junior engineers, 3 promoted to senior within 18 months\n• Reduced system latency by 60% through database optimization and caching strategies\n\nSKILLS: Java, Go, Python, Kubernetes, AWS, PostgreSQL, Redis, gRPC, Terraform`,
      mid: `${name}\nSoftware Engineer | ${years} years experience\n\nSUMMARY\nSoftware engineer passionate about building reliable, maintainable systems. Experience with full-stack development and cloud infrastructure.\n\nEXPERIENCE\n• Built RESTful APIs serving 500K daily active users with 99.9% uptime\n• Implemented CI/CD pipeline reducing release cycle from 2 weeks to daily\n• Contributed to open-source projects with 500+ GitHub stars\n• Developed automated testing framework increasing code coverage from 45% to 90%\n\nSKILLS: Python, TypeScript, React, Node.js, Docker, AWS, PostgreSQL, MongoDB`,
      junior: `${name}\nJunior Software Engineer | ${years} years experience\n\nSUMMARY\nRecent CS graduate eager to build impactful software. Strong foundation in algorithms, data structures, and web development.\n\nEXPERIENCE\n• Built a full-stack e-commerce platform using React and Node.js (capstone project)\n• Completed internship at tech startup, shipped 3 features to production\n• Won 2nd place at university hackathon with real-time collaboration tool\n• Contributed bug fixes to 2 open-source projects\n\nSKILLS: JavaScript, Python, React, Node.js, SQL, Git, Docker basics`,
    },
    "AI/ML": {
      senior: `${name}\nSenior ML Engineer | ${years} years experience\n\nSUMMARY\nMachine learning engineer with deep expertise in NLP, computer vision, and production ML systems. Published researcher with industry deployment experience.\n\nEXPERIENCE\n• Deployed transformer-based NLP model serving 10M+ predictions/day with <50ms latency\n• Built end-to-end ML pipeline: data ingestion, feature engineering, training, deployment\n• Published 5 papers at top-tier conferences (NeurIPS, ICML, ACL)\n• Reduced model training costs by 40% through distributed training optimization\n\nSKILLS: PyTorch, TensorFlow, Kubernetes, Python, CUDA, MLflow, Spark, Hugging Face`,
      mid: `${name}\nML Engineer | ${years} years experience\n\nSUMMARY\nML engineer focused on building production machine learning systems. Experience with recommendation systems and NLP applications.\n\nEXPERIENCE\n• Built recommendation engine increasing user engagement by 25%\n• Implemented A/B testing framework for ML model evaluation\n• Fine-tuned LLMs for domain-specific text classification (95% accuracy)\n• Created feature store serving 100+ ML models across the organization\n\nSKILLS: Python, PyTorch, scikit-learn, SQL, Airflow, Docker, AWS SageMaker`,
      junior: `${name}\nML Engineer (Entry Level) | ${years} years experience\n\nSUMMARY\nRecent MS graduate in Machine Learning. Research experience in computer vision and natural language processing.\n\nEXPERIENCE\n• Master's thesis: Novel attention mechanism for medical image segmentation (accepted at workshop)\n• Kaggle competition top 5% in NLP sentiment analysis challenge\n• Internship: Built data preprocessing pipeline for computer vision team\n• Teaching assistant for graduate ML course (60 students)\n\nSKILLS: Python, PyTorch, TensorFlow, pandas, NumPy, Jupyter, Git, basic MLOps`,
    },
    "Data Science": {
      senior: `${name}\nSenior Data Scientist | ${years} years experience\n\nSUMMARY\nData scientist with expertise in causal inference, experimentation, and applied statistics. Track record of driving business decisions through data.\n\nEXPERIENCE\n• Designed experimentation platform handling 200+ concurrent A/B tests\n• Built churn prediction model saving $5M annually in customer retention\n• Led analytics for product launch reaching 2M users in first quarter\n• Developed automated anomaly detection system for business metrics\n\nSKILLS: Python, R, SQL, Spark, Tableau, Bayesian statistics, causal inference, dbt`,
      mid: `${name}\nData Scientist | ${years} years experience\n\nSUMMARY\nData scientist with strong statistical background and business acumen. Experience in product analytics and machine learning.\n\nEXPERIENCE\n• Built customer segmentation model identifying 5 key user personas\n• Analyzed marketplace dynamics, recommendations adopted by product team\n• Created dashboards tracking $50M+ revenue pipeline\n• Ran 30+ A/B tests with statistically rigorous analysis\n\nSKILLS: Python, SQL, R, Tableau, Looker, pandas, scikit-learn, BigQuery`,
      junior: `${name}\nData Analyst | ${years} years experience\n\nSUMMARY\nAnalytically-minded recent graduate with strong SQL and Python skills. Passionate about turning data into actionable insights.\n\nEXPERIENCE\n• Analyzed user behavior data for product team, leading to 15% conversion improvement\n• Built automated reporting pipeline replacing 10 hours/week of manual work\n• Capstone project: Predictive modeling of housing prices using ensemble methods\n• Data science bootcamp graduate with 3 portfolio projects\n\nSKILLS: SQL, Python, Excel, Tableau, pandas, basic ML, Git`,
    },
    "Product Management": {
      senior: `${name}\nSenior Product Manager | ${years} years experience\n\nSUMMARY\nProduct leader with experience shipping 0-to-1 products and scaling existing platforms. Strong technical background with MBA.\n\nEXPERIENCE\n• Launched B2B SaaS product from concept to $10M ARR in 18 months\n• Led cross-functional team of 15 (eng, design, data) through major platform migration\n• Defined product strategy resulting in 3x user growth year-over-year\n• Established product-led growth framework adopted company-wide\n\nSKILLS: Product strategy, roadmapping, A/B testing, SQL, Figma, Jira, user research`,
      mid: `${name}\nProduct Manager | ${years} years experience\n\nSUMMARY\nProduct manager with technical background and passion for user-centric design. Experience in agile environments.\n\nEXPERIENCE\n• Owned feature roadmap for mobile app with 1M+ monthly active users\n• Increased activation rate by 30% through onboarding flow redesign\n• Conducted 50+ user interviews to validate product-market fit\n• Collaborated with 3 engineering teams across 2 time zones\n\nSKILLS: Roadmapping, user research, Jira, Amplitude, SQL basics, wireframing`,
      junior: `${name}\nAssociate Product Manager | ${years} years experience\n\nSUMMARY\nAPM with engineering background transitioning to product management. Strong analytical skills and user empathy.\n\nEXPERIENCE\n• Shipped 2 features as APM, both exceeding engagement targets by 20%\n• Conducted competitive analysis for 3 product areas\n• Created product requirements documents adopted as team template\n• Former software engineer — deep understanding of technical tradeoffs\n\nSKILLS: PRDs, Jira, Figma basics, SQL, data analysis, user interviews`,
    },
    "Design": {
      senior: `${name}\nSenior Product Designer | ${years} years experience\n\nSUMMARY\nProduct designer with expertise in design systems, interaction design, and user research. Portfolio of shipped products used by millions.\n\nEXPERIENCE\n• Created design system used across 5 product teams (40+ components)\n• Redesigned checkout flow increasing conversion by 22%\n• Led design for accessibility initiative, achieving WCAG AA compliance\n• Mentored 4 junior designers through structured design critique sessions\n\nSKILLS: Figma, Sketch, prototyping, user research, design systems, HTML/CSS, accessibility`,
      mid: `${name}\nProduct Designer | ${years} years experience\n\nSUMMARY\nProduct designer focused on creating intuitive, accessible user experiences. Strong in both visual design and interaction design.\n\nEXPERIENCE\n• Designed onboarding flow reducing time-to-value by 40%\n• Conducted 30+ usability tests, synthesized findings into design recommendations\n• Built and maintained component library in Figma with 25+ components\n• Collaborated with engineering to implement pixel-perfect designs\n\nSKILLS: Figma, Adobe Creative Suite, prototyping, usability testing, wireframing`,
      junior: `${name}\nUX Designer | ${years} years experience\n\nSUMMARY\nRecent design graduate with a passion for user-centered design. Strong portfolio including web and mobile projects.\n\nEXPERIENCE\n• Redesigned nonprofit website, increasing donations by 30% (freelance)\n• UX design bootcamp capstone: Mental health app prototype (100+ user tests)\n• Internship: Created wireframes and prototypes for B2B dashboard\n• Won university design competition with inclusive transit app concept\n\nSKILLS: Figma, Sketch, Adobe XD, user research, wireframing, basic HTML/CSS`,
    },
    "DevOps": {
      senior: `${name}\nSenior DevOps Engineer | ${years} years experience\n\nSUMMARY\nDevOps engineer specializing in cloud infrastructure, CI/CD, and site reliability. Experience managing infrastructure at scale.\n\nEXPERIENCE\n• Migrated 200+ services to Kubernetes, reducing infrastructure costs by 35%\n• Built CI/CD platform processing 5000+ deployments per day\n• Achieved 99.99% uptime SLA through automated failover and monitoring\n• Implemented infrastructure-as-code for multi-cloud (AWS + GCP) environment\n\nSKILLS: Kubernetes, Terraform, AWS, GCP, Docker, Prometheus, Grafana, Python, Go`,
      mid: `${name}\nDevOps Engineer | ${years} years experience\n\nSUMMARY\nDevOps engineer with strong Linux and cloud experience. Passionate about automation and reliability.\n\nEXPERIENCE\n• Automated server provisioning reducing setup time from 2 days to 30 minutes\n• Managed Kubernetes clusters serving 50+ microservices\n• Implemented monitoring and alerting system reducing MTTR by 60%\n• Built Docker-based development environments for 40+ developers\n\nSKILLS: Docker, Kubernetes, AWS, Linux, Ansible, Jenkins, Terraform, Bash`,
      junior: `${name}\nJunior DevOps Engineer | ${years} years experience\n\nSUMMARY\nRecent graduate passionate about cloud infrastructure and automation. AWS certified with hands-on project experience.\n\nEXPERIENCE\n• AWS Solutions Architect Associate certification\n• Built personal Kubernetes cluster for self-hosted applications\n• Internship: Wrote Terraform modules for team's AWS infrastructure\n• Capstone: Designed CI/CD pipeline for microservices application\n\nSKILLS: AWS, Docker, Linux, Terraform basics, Python, Bash, Git, Jenkins`,
    },
    "Security": {
      senior: `${name}\nSenior Security Engineer | ${years} years experience\n\nSUMMARY\nSecurity engineer with expertise in application security, cloud security, and incident response. OSCP and CISSP certified.\n\nEXPERIENCE\n• Built application security program reducing critical vulnerabilities by 90%\n• Led incident response for 3 major security events with zero data loss\n• Implemented automated SAST/DAST pipeline catching 70% of vulns pre-production\n• Designed zero-trust architecture for multi-cloud environment\n\nSKILLS: Penetration testing, SAST/DAST, AWS security, Kubernetes security, Python, threat modeling`,
      mid: `${name}\nSecurity Engineer | ${years} years experience\n\nSUMMARY\nSecurity engineer focused on application security and cloud security. Experience with vulnerability management and security automation.\n\nEXPERIENCE\n• Conducted 20+ penetration tests identifying critical vulnerabilities\n• Built security scanning into CI/CD pipeline for 30+ repositories\n• Developed security training program completed by 200+ engineers\n• Managed vulnerability remediation program with 95% SLA compliance\n\nSKILLS: Burp Suite, OWASP, AWS security, Docker security, Python, vulnerability scanning`,
      junior: `${name}\nJunior Security Analyst | ${years} years experience\n\nSUMMARY\nCybersecurity graduate with CTF competition experience and security certifications. Eager to grow in application security.\n\nEXPERIENCE\n• CompTIA Security+ certified, studying for OSCP\n• Top 10% in National Collegiate Cyber Defense Competition\n• Internship: Assisted with vulnerability scanning and remediation tracking\n• Built home lab for practicing penetration testing techniques\n\nSKILLS: Kali Linux, Wireshark, Burp Suite, Python, networking, OWASP Top 10`,
    },
    "Mobile Development": {
      senior: `${name}\nSenior Mobile Engineer | ${years} years experience\n\nSUMMARY\nMobile engineer with expertise in iOS and cross-platform development. Shipped apps with millions of downloads.\n\nEXPERIENCE\n• Led iOS app development reaching #1 in App Store category (5M+ downloads)\n• Reduced app crash rate from 2% to 0.1% through systematic debugging\n• Built cross-platform design system shared between iOS and Android teams\n• Optimized app startup time by 50% through lazy loading and caching\n\nSKILLS: Swift, SwiftUI, Kotlin, React Native, Xcode, CI/CD for mobile, Core Data`,
      mid: `${name}\nMobile Developer | ${years} years experience\n\nSUMMARY\nMobile developer with experience in native iOS and Android development. Focused on performance and user experience.\n\nEXPERIENCE\n• Developed features for app with 500K+ monthly active users\n• Implemented offline-first architecture with local database sync\n• Built push notification system increasing daily engagement by 20%\n• Contributed to app size reduction by 30% through asset optimization\n\nSKILLS: Swift, Kotlin, React Native, Firebase, REST APIs, SQLite, Git`,
      junior: `${name}\nJunior Mobile Developer | ${years} years experience\n\nSUMMARY\nMobile development enthusiast with published apps on the App Store. Self-taught with bootcamp training.\n\nEXPERIENCE\n• Published 2 iOS apps on App Store (productivity and fitness categories)\n• Completed iOS development bootcamp, built 5 portfolio apps\n• Freelance: Built MVP mobile app for local business (500+ users)\n• Hackathon winner with AR-based navigation app prototype\n\nSKILLS: Swift, SwiftUI basics, Xcode, Firebase, REST APIs, Git`,
    },
    "Blockchain": {
      senior: `${name}\nSenior Blockchain Engineer | ${years} years experience\n\nSUMMARY\nBlockchain engineer with expertise in smart contract development, DeFi protocols, and L2 scaling solutions.\n\nEXPERIENCE\n• Built DeFi protocol handling $500M+ in total value locked\n• Designed and audited 20+ smart contracts with zero exploits\n• Contributed to Ethereum EIP proposals for gas optimization\n• Led blockchain infrastructure team scaling to 10K+ TPS\n\nSKILLS: Solidity, Rust, Hardhat, Foundry, EVM, zero-knowledge proofs, Go`,
      mid: `${name}\nBlockchain Developer | ${years} years experience\n\nSUMMARY\nBlockchain developer focused on smart contract development and Web3 applications. Active in open-source DeFi ecosystem.\n\nEXPERIENCE\n• Developed smart contracts for NFT marketplace processing 10K+ transactions\n• Built full-stack dApp with React frontend and Solidity backend\n• Contributed to 3 open-source DeFi protocols\n• Implemented gas optimization reducing transaction costs by 40%\n\nSKILLS: Solidity, Hardhat, ethers.js, React, The Graph, IPFS, TypeScript`,
      junior: `${name}\nJunior Blockchain Developer | ${years} years experience\n\nSUMMARY\nWeb3 enthusiast transitioning from traditional web development. Completed blockchain development bootcamp.\n\nEXPERIENCE\n• Built NFT minting dApp as bootcamp capstone project\n• Contributed bug fixes to open-source Solidity libraries\n• Won ETHGlobal hackathon with cross-chain bridge prototype\n• Personal project: Token-gated community platform on Polygon\n\nSKILLS: Solidity basics, Hardhat, React, ethers.js, MetaMask, JavaScript`,
    },
    "Frontend": {
      senior: `${name}\nSenior Frontend Engineer | ${years} years experience\n\nSUMMARY\nFrontend engineer specializing in React ecosystem, web performance, and design systems. Passionate about accessibility.\n\nEXPERIENCE\n• Built design system serving 10+ product teams (React + TypeScript)\n• Improved Core Web Vitals: LCP reduced by 40%, CLS to near-zero\n• Led frontend architecture migration from class components to hooks/server components\n• Implemented micro-frontend architecture for multi-team codebase\n\nSKILLS: React, TypeScript, Next.js, CSS-in-JS, webpack, testing (Jest/Playwright), a11y`,
      mid: `${name}\nFrontend Developer | ${years} years experience\n\nSUMMARY\nFrontend developer with strong React and TypeScript skills. Experience building responsive, accessible web applications.\n\nEXPERIENCE\n• Developed customer-facing dashboard used by 50K+ users\n• Built reusable component library with 30+ components and Storybook docs\n• Implemented lazy loading reducing initial bundle size by 45%\n• Migrated codebase from JavaScript to TypeScript (200+ files)\n\nSKILLS: React, TypeScript, Next.js, Tailwind CSS, Redux, Jest, Cypress`,
      junior: `${name}\nJunior Frontend Developer | ${years} years experience\n\nSUMMARY\nFrontend developer with strong JavaScript fundamentals and React experience. Portfolio of responsive web projects.\n\nEXPERIENCE\n• Built portfolio of 5 React projects including e-commerce and social media clones\n• Freelance: Developed responsive website for local restaurant (mobile-first)\n• Bootcamp capstone: Real-time chat application with WebSocket integration\n• Open source: Contributed UI components to React component library\n\nSKILLS: JavaScript, React, HTML, CSS, Tailwind, Git, responsive design`,
    },
  };

  const areaResumes = resumes[targetArea] || resumes["Software Engineering"];
  return areaResumes[experienceLevel] || areaResumes["mid"];
}

// Target roles per category
const targetRoles = {
  "Software Engineering": ["Software Engineer", "Senior Software Engineer", "Staff Engineer", "Backend Engineer", "Full Stack Developer"],
  "AI/ML": ["ML Engineer", "Research Scientist", "AI Engineer", "NLP Engineer", "Computer Vision Engineer"],
  "Data Science": ["Data Scientist", "Senior Data Scientist", "Data Analyst", "Analytics Engineer", "Business Intelligence Analyst"],
  "Product Management": ["Product Manager", "Senior PM", "Associate PM", "Technical PM", "Growth PM"],
  "Design": ["Product Designer", "Senior UX Designer", "UX Researcher", "UI Designer", "Design Lead"],
  "DevOps": ["DevOps Engineer", "SRE", "Platform Engineer", "Cloud Engineer", "Infrastructure Engineer"],
  "Security": ["Security Engineer", "Penetration Tester", "Security Analyst", "AppSec Engineer", "Cloud Security Engineer"],
  "Mobile Development": ["iOS Developer", "Android Developer", "Mobile Engineer", "React Native Developer", "Flutter Developer"],
  "Blockchain": ["Smart Contract Developer", "Blockchain Engineer", "Web3 Developer", "Protocol Engineer", "DeFi Developer"],
  "Frontend": ["Frontend Engineer", "React Developer", "UI Engineer", "Web Developer", "Frontend Architect"],
};

const experienceLevels = ["junior", "mid", "senior"];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Zurio Seed Script ===\n");

  const loginInfo = { reviewers: [], candidates: [] };

  // ─── Create 25 Reviewers ────────────────────────────────────────────────────
  console.log("Creating 25 reviewers...\n");

  for (let i = 0; i < reviewers.length; i++) {
    const r = reviewers[i];
    process.stdout.write(`  [${i + 1}/25] ${r.name}...`);

    // 1. Login
    let { json, cookie } = await api("/auth/register", { name: r.name, email: r.email, password: "Zurio2026!" });
    if (!json.user) { console.log(" FAILED (login)"); continue; }

    // 2. Set role
    await api("/api/me/role", { role: "reviewer" }, cookie);

    // 3. Create reviewer profile
    const { json: revJson } = await api("/api/reviewers", {
      name: r.name,
      role: r.role,
      company: r.company,
      years: r.years,
      areas: r.areas,
      bio: r.bio,
      resumeText: "",
    }, cookie);

    if (revJson.reviewer) {
      console.log(` OK (reviewer_id: ${revJson.reviewer.id})`);
      loginInfo.reviewers.push({ name: r.name, email: r.email, role: r.role, company: r.company, areas: r.areas.join(", ") });
    } else {
      console.log(` FAILED:`, revJson.error || "unknown");
    }

    // Logout
    await api("/auth/logout", {}, cookie);
  }

  // ─── Create 100 Candidates with multiple resumes ────────────────────────────
  console.log("\nCreating 100 candidates with multiple resumes...\n");

  for (let i = 0; i < 100; i++) {
    const firstName = firstNames[i];
    const lastName = lastNames[i];
    const name = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@seed.zurio`;

    // Pick primary category (distribute evenly: 10 per category)
    const primaryCategory = categories[i % categories.length];
    const expLevel = experienceLevels[i % 3];

    // Pick 1-3 resumes for this candidate
    const numResumes = (i % 3) + 1; // 1, 2, or 3 resumes

    process.stdout.write(`  [${i + 1}/100] ${name} (${numResumes} resume${numResumes > 1 ? "s" : ""})...`);

    // 1. Login
    let { json, cookie } = await api("/auth/register", { name, email, password: "Zurio2026!" });
    if (!json.user) { console.log(" FAILED (login)"); continue; }

    const candidateInfo = { name, email, resumes: [] };

    for (let r = 0; r < numResumes; r++) {
      // First resume uses primary category, additional ones use different categories
      const category = r === 0 ? primaryCategory : categories[(i + r + 3) % categories.length];
      const roles = targetRoles[category];
      const targetRole = roles[i % roles.length];
      const resume = generateResume(name, targetRole, category, expLevel);

      // Set role to candidate
      await api("/api/me/role", { role: "candidate" }, cookie);

      // Submit resume
      const { json: candJson } = await api("/api/candidates", {
        name,
        email,
        targetRole,
        targetArea: category,
        resume,
      }, cookie);

      if (candJson.candidate) {
        const matchStatus = candJson.waitlisted ? "waitlisted" : "matched";
        candidateInfo.resumes.push({ targetRole, category, matchStatus });
      } else {
        candidateInfo.resumes.push({ targetRole, category, matchStatus: "FAILED" });
      }
    }

    console.log(` OK — ${candidateInfo.resumes.map(r => `${r.category}(${r.matchStatus})`).join(", ")}`);
    loginInfo.candidates.push(candidateInfo);

    // Logout
    await api("/auth/logout", {}, cookie);
  }

  // ─── Output Login Info ──────────────────────────────────────────────────────
  console.log("\n\n" + "=".repeat(100));
  console.log("LOGIN INFO — Use these credentials on https://zurio-api-production.up.railway.app");
  console.log("=".repeat(100));

  console.log("\n── REVIEWERS (25) ──────────────────────────────────────────────────────────\n");
  console.log("Name".padEnd(22) + "Email".padEnd(32) + "Role".padEnd(28) + "Company".padEnd(18) + "Areas");
  console.log("─".repeat(120));
  for (const r of loginInfo.reviewers) {
    console.log(r.name.padEnd(22) + r.email.padEnd(32) + r.role.padEnd(28) + r.company.padEnd(18) + r.areas);
  }

  console.log("\n── CANDIDATES (100) ────────────────────────────────────────────────────────\n");
  console.log("Name".padEnd(25) + "Email".padEnd(35) + "Resumes");
  console.log("─".repeat(120));
  for (const c of loginInfo.candidates) {
    const resumeSummary = c.resumes.map(r => `${r.targetRole} [${r.category}]`).join(" | ");
    console.log(c.name.padEnd(25) + c.email.padEnd(35) + resumeSummary);
  }

  console.log("\n" + "=".repeat(100));
  console.log(`TOTAL: ${loginInfo.reviewers.length} reviewers, ${loginInfo.candidates.length} candidates`);
  console.log("=".repeat(100));
}

main().catch(console.error);
