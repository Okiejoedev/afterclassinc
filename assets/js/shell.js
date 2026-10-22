// Shared state and page frame for the teacher dashboard.
import { sb } from "./sb.js";
import { $, esc, LOGO } from "./ui.js";

export const ctx = {
  user: null,          // signed-in teacher
  head: null,          // { school, member, profile } from loadHeader()
  leaveGuard: null,    // async () => boolean, asks before leaving unsaved work
  get kind() { return this.head?.profile?.kind || "secondary"; },
  get section() { return SECTION_OF[this.kind] || "secondary"; },
  get role() { return this.head?.member?.role || null; },
  get reviewer() { return this.role === "admin" || this.role === "hod"; },
};

// Afterclass has three sections, each with its own tools and words:
// Primary (pupils, no pupil accounts), Secondary (JSS/SSS) and Higher (university,
// polytechnic, college of education; training/webinars sit here too).
export const SECTION_OF = { primary: "primary", secondary: "secondary", university: "higher", polytechnic: "higher", college: "higher", training: "higher" };
export const SECTION_NAME = { primary: "Primary", secondary: "Secondary", higher: "Higher" };
// Institution types inside each section. Teachers only ever see and choose their own section's.
export const KINDS = [["primary", "Primary school"], ["secondary", "Secondary school"], ["university", "University"], ["polytechnic", "Polytechnic / monotechnic"], ["college", "College (education, nursing, health, agriculture…)"], ["training", "Training / webinars / church / NGO"]];
export const kindsIn = (sec = ctx.section) => KINDS.filter(([k]) => SECTION_OF[k] === sec);
export const sectionBadge = (sec = ctx.section) => `<span class="sec-badge ${sec}">${SECTION_NAME[sec]}</span>`;

// Words that change with the audience.
export function words(kind = ctx.kind) {
  const sec = SECTION_OF[kind] || "secondary";
  const base = sec === "primary"
    ? { learners: "pupils", learner: "pupil", Learners: "Pupils", teacher: "teacher", classes: "Classes", Classes: "Classes", klass: "class", Klass: "Class", number: "admission number", period: "term" }
    : sec === "higher"
      ? { learners: "students", learner: "student", Learners: "Students", teacher: "lecturer", classes: "courses", Classes: "Courses", klass: "course", Klass: "Course", number: "matric number", period: "semester" }
      : { learners: "students", learner: "student", Learners: "Students", teacher: "teacher", classes: "class lists", Classes: "Class lists", klass: "class", Klass: "Class", number: "admission number", period: "term" };
  if (kind === "training") return { ...base, learners: "participants", learner: "participant", Learners: "Participants", teacher: "presenter", classes: "groups", Classes: "Groups", klass: "group", Klass: "Group", number: "ID number" };
  return base;
}

export function frame(active, inner) {
  const app = $("#app");
  const tabs = [["home", "Home"], ["quizzes", "Quizzes"], ["classes", words().Classes], ["sessions", "Results"], ...(ctx.reviewer ? [["reviews", "Reviews"]] : []), ["school", "School"], ...(ctx.isAdmin ? [["admin", "Admin"]] : [])];
  app.innerHTML = `<header class="topbar">
      <a class="brand" href="#/home">${LOGO} Afterclass ${sectionBadge()}</a>
      <nav class="tabs" aria-label="Sections">${tabs.map(([k, l]) => `<a href="#/${k}" class="${active === k ? "on" : ""}" ${active === k ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      <div class="row"><span class="muted acct">${esc(ctx.head?.school?.name || "")}${ctx.head?.school ? " · " : ""}${esc(ctx.user.email)}</span><button class="btn sm" id="signOut" type="button">Sign out</button></div>
    </header><main id="view" style="display:grid;gap:20px">${inner}</main>
    <footer class="app-foot"><a href="../help.html">Help &amp; guide</a><a href="#" id="fbLink">Report a problem</a><a href="../terms.html">Terms</a><a href="../privacy.html">Privacy</a></footer>`;
  $("#signOut").onclick = async () => { await sb.auth.signOut(); location.hash = ""; };
  $("#fbLink").onclick = (e) => { e.preventDefault(); import("./feedback.js").then((m) => m.openFeedback()); };
  return $("#view");
}

export const statusChip = (s) => ({
  draft: "", submitted: `<span class="chip open">AWAITING REVIEW</span>`,
  approved: `<span class="chip live">APPROVED</span>`, changes: `<span class="chip warn">CHANGES REQUESTED</span>`,
}[s] || "");
