# Zurio E2E Testing Plan

## 1. Authentication & Session Management

### 1.1 Registration
- [ ] Register with valid name, email, password → session created, redirected to role picker
- [ ] Duplicate email → 409 error
- [ ] Missing name → validation error
- [ ] Password < 6 chars → validation error
- [ ] Email normalized to lowercase
- [ ] Whitespace trimmed from name/email
- [ ] Refresh after register → still authenticated (session persists)

### 1.2 Login
- [ ] Login with correct credentials → session established
- [ ] Wrong password → 401 error
- [ ] Non-existent email → 401 error
- [ ] Session persists across page reload

### 1.3 Logout
- [ ] Sign out destroys session, redirected to login
- [ ] After logout, `/api/me` returns null

### 1.4 Session Security
- [ ] HttpOnly cookie (not accessible via JS)
- [ ] 7-day max age
- [ ] Secure flag when NODE_ENV=production

---

## 2. Reviewer Flow

### 2.1 Reviewer Signup
- [ ] Required fields: name, role, company, years, areas (at least 1)
- [ ] Optional: bio, linkedin, resumeText
- [ ] Submit with missing required field → validation error
- [ ] Years dropdown: "1-3", "4-6", "7-10", "10-15", "15+"
- [ ] Multiple expertise areas selectable (22 options)

### 2.2 Resume Upload (Reviewer)
- [ ] PDF upload → text extracted via pdfjs-dist
- [ ] DOCX upload → text extracted via mammoth
- [ ] TXT upload → text read via FileReader
- [ ] Unsupported format → error message
- [ ] Extracted text < 30 chars → error
- [ ] Drag-and-drop works
- [ ] Empty file → error
- [ ] Large file (10MB+) → handled gracefully
- [ ] Corrupted PDF → does not crash, shows error

### 2.3 AI Vetting (Async)
- [ ] Status set to "pending" after profile creation
- [ ] AI assessment triggered asynchronously
- [ ] Assessment includes score (1-5) and text
- [ ] Flags added: low_experience, no_resume, no_linkedin
- [ ] Assessment visible in admin dashboard

### 2.4 Reviewer Dashboard States
- [ ] Pending: "Under Review" banner, no matches shown
- [ ] Approved: Normal dashboard with assigned matches
- [ ] Rejected: Decline message shown
- [ ] Matches show anonymized candidate names
- [ ] Self-match prevention (own submissions not shown)
- [ ] Review counter: "X pending · Y done"

### 2.5 Share Banner
- [ ] Shows "Share your experience" (no arrow, no "Enjoying")
- [ ] LinkedIn button reveals pre-written text
- [ ] "Copy text & open LinkedIn" copies to clipboard + opens LinkedIn
- [ ] X button opens Twitter with pre-filled text
- [ ] Reviewer gets reviewer-specific share text

---

## 3. Candidate Flow

### 3.1 Candidate Submission
- [ ] Required: name, email, targetRole, targetArea, resume (50+ chars or file)
- [ ] Resume paste tab: minimum 50 chars
- [ ] Resume upload tab: PDF/DOCX/TXT
- [ ] Tab toggle between upload and paste
- [ ] currentRole auto-extracted from resume (AI)
- [ ] Label auto-generated if not provided: "{targetRole} Resume"
- [ ] Submit with missing required field → validation error

### 3.2 PII Redaction
- [ ] Candidate name redacted from resume text
- [ ] Phone numbers (###-###-####) redacted
- [ ] Email addresses redacted
- [ ] SSN (###-##-####) redacted
- [ ] Street addresses redacted
- [ ] ZIP codes redacted
- [ ] API returns redaction list
- [ ] Client shows alert with what was redacted
- [ ] Redacted resume does not contain original PII

### 3.3 AI Matching
- [ ] Eligible reviewers: approved status, capacity < 3, not self
- [ ] Claude ranks reviewers 1-10
- [ ] Best match (score >= 5) assigned
- [ ] Score < 5 for all → candidate waitlisted
- [ ] Zero eligible reviewers → candidate waitlisted
- [ ] Claude API fails → fallback to area-based matching
- [ ] Email sent to matched reviewer

### 3.4 Waitlist
- [ ] Candidate placed on waitlist when no eligible reviewer
- [ ] "Waitlisted" badge shown in dashboard
- [ ] When reviewer completes review → drainWaitlist fires
- [ ] Waitlisted candidate assigned to freed reviewer
- [ ] Email sent to reviewer for backfill assignment

### 3.5 Multi-Resume Support
- [ ] One user can submit multiple resumes
- [ ] Each gets independent matching
- [ ] Dashboard shows all submissions with individual status/labels

### 3.6 Candidate Dashboard
- [ ] Status page shows match status (pending, done, waitlisted)
- [ ] Anonymized reviewer info shown
- [ ] Match rationale displayed
- [ ] When feedback received: feedback text shown
- [ ] Star rating (1-5) for received feedback
- [ ] Rating locked after submission
- [ ] Share banner with candidate-specific text

---

## 4. Feedback Flow

### 4.1 InlineReview (Reviewer Writing Feedback)
- [ ] Resume displayed: iframe for PDF, styled text for text-only
- [ ] "Confidential" badge shown
- [ ] Download: PDF if file exists, TXT if text-only
- [ ] Feedback textarea accepts input
- [ ] AI Assist button → Claude returns 3-4 starter suggestions
- [ ] "Use as starting point" merges suggestion into editor

### 4.2 Feedback Scoring
- [ ] Preview & Score calls /api/feedback/score
- [ ] < 15 words → score 1, minNotMet: true
- [ ] Score displayed with color: green >= 7, yellow >= 5, red < 5
- [ ] Score < 6 → submit button disabled with warning
- [ ] Score >= 6 → submit button enabled
- [ ] Can edit and re-score multiple times
- [ ] AI unavailable → auto score 7, user not blocked

### 4.3 Feedback Submission
- [ ] Submit → "Feedback sent!" message
- [ ] Match status transitions to "done"
- [ ] Waitlist backfill triggered
- [ ] Email notification sent to candidate

### 4.4 Feedback Quality Edge Cases
- [ ] Exactly 15 words → passes minimum
- [ ] 14 words → fails (score 1)
- [ ] Empty feedback → fails
- [ ] Generic "Good resume" → low score (1-3)
- [ ] Specific, actionable feedback → high score (7+)

---

## 5. Admin Dashboard

### 5.1 Admin Login
- [ ] Access via /?admin
- [ ] Correct password (zurio-admin-local or ADMIN_SECRET) → access granted
- [ ] Wrong password → access denied
- [ ] Admin secret stored in sessionStorage

### 5.2 Overview Tab
- [ ] Stats cards: users, reviewers, candidates, pending, done, waitlisted, feedback count
- [ ] Stats are accurate (match actual DB counts)
- [ ] Recent matches shown
- [ ] Export/import buttons visible

### 5.3 People Tab
- [ ] Pending reviewers sorted to top with amber border
- [ ] Status badges: Pending (amber), Approved (green), Rejected (red)
- [ ] LinkedIn link clickable
- [ ] Flags displayed (no_linkedin, no_resume, low_experience)
- [ ] AI assessment text shown
- [ ] Approve button → status "approved", backfill triggered
- [ ] Reject button → status "rejected"

### 5.4 Matches Tab
- [ ] All matches listed with status, reviewer, candidate
- [ ] Search by name, role, rationale
- [ ] Filter by status (all, pending, done, waitlist)
- [ ] Reassign: select new reviewer, self-match check enforced
- [ ] Unassign: moves match to waitlist
- [ ] Delete: removes match + associated feedback

### 5.5 Data Management
- [ ] Export → valid JSON with { db, nextId }
- [ ] Import → overwrites all data (confirm dialog)
- [ ] Round-trip: export → import → no data loss
- [ ] Malformed JSON → import error

---

## 6. End-to-End Scenarios

### 6.1 Full Reviewer Journey
1. Register → Choose Reviewer → Fill profile → Upload resume
2. See "Under Review" dashboard
3. Admin approves reviewer
4. Dashboard updates to active
5. Candidate submits → matched to reviewer
6. Reviewer sees new match
7. Writes review, scores >= 6, submits
8. Match marked done, candidate notified

### 6.2 Full Candidate Journey
1. Register → Choose Candidate → Fill form → Upload resume
2. PII redacted alert shown
3. Matched to reviewer (or waitlisted)
4. Status page shows pending/waitlisted
5. Feedback received → shown in dashboard
6. Rate feedback 1-5 stars

### 6.3 Dual-Role User
1. Register as Reviewer → complete profile
2. Switch to Candidate tab → submit resume
3. Resume pre-filled from reviewer profile
4. Verify: NOT matched to own reviewer profile
5. Both dashboards accessible

### 6.4 Waitlist → Backfill
1. All reviewers at capacity (3 pending each)
2. Submit candidate → waitlisted
3. Reviewer completes a review → slot opens
4. Waitlisted candidate auto-assigned
5. Email notification sent

### 6.5 Reviewer Rejection
1. Reviewer signs up with weak profile
2. AI flags concerns (low experience, no resume, no linkedin)
3. Admin sees flags + low AI score
4. Admin rejects
5. Reviewer sees rejection message
6. Reviewer cannot receive matches

---

## 7. Edge Cases

### 7.1 Input Validation
- [ ] Whitespace-only strings treated as empty
- [ ] XSS attempts in name/email (script tags)
- [ ] SQL injection characters in inputs
- [ ] Unicode/emoji in names
- [ ] Very long inputs (1000+ chars)

### 7.2 File Upload Edge Cases
- [ ] 0-byte file → error
- [ ] 100MB file → graceful handling
- [ ] Corrupted PDF → error, no crash
- [ ] DOCX with no text → error
- [ ] Special characters in filename
- [ ] Wrong extension (PDF renamed to .txt)

### 7.3 Matching Edge Cases
- [ ] First candidate when no reviewers exist → waitlist
- [ ] All reviewers at capacity → waitlist
- [ ] Claude API timeout → fallback matching
- [ ] Claude returns invalid JSON → fallback
- [ ] Two identical candidates → both matched independently

### 7.4 PII Redaction Edge Cases
- [ ] Names with apostrophes: O'Brien
- [ ] Hyphenated names: Mary-Jane
- [ ] Phone formats: 555.123.4567, (555)123-4567
- [ ] Multiple instances of same PII → all redacted
- [ ] Short names (< 3 chars) → not redacted (to avoid false positives)

### 7.5 Concurrent Operations
- [ ] Two users submit simultaneously → no race conditions
- [ ] Admin reassigns while reviewer writing feedback
- [ ] Multiple feedback score requests → no double-processing

### 7.6 Network/API Failures
- [ ] Claude API down → graceful fallback for matching, scoring, vetting
- [ ] Resend email API down → silent skip, no user-facing error
- [ ] Server restart → data persists from JSON file

---

## 8. Security

### 8.1 Password & Auth
- [ ] Passwords bcrypt hashed (salt rounds = 10)
- [ ] passwordHash NEVER returned in any API response
- [ ] Unauthenticated requests to protected routes → 401
- [ ] Admin routes require x-admin-secret header

### 8.2 Data Protection
- [ ] PII redacted before storage
- [ ] Resume text stored but name anonymized in matches
- [ ] File downloads require authentication

### 8.3 CORS
- [ ] Cross-origin requests from wrong origin blocked
- [ ] Credentials included with matching origin

---

## 9. Email Notifications

- [ ] Reviewer assigned email: includes target role + rationale + link
- [ ] Feedback ready email: sent to candidate when feedback submitted
- [ ] No RESEND_API_KEY → silent skip (no error)
- [ ] Invalid email → caught by validation or silent fail from Resend

---

## 10. Performance

- [ ] /api/me: < 100ms
- [ ] /api/candidates (with AI matching): < 5s
- [ ] /api/admin/dashboard: < 500ms
- [ ] File download: proportional to file size
- [ ] 100+ concurrent requests: no crashes

---

## 11. Browser Compatibility

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Chrome / Safari
- [ ] File upload works across all browsers
- [ ] Clipboard API (share text copy) works
- [ ] PDF viewer in iframe works
