// Shared state and page frame for the teacher dashboard.
import { sb } from "./sb.js";
import { $, esc, LOGO } from "./ui.js";

export const ctx = {
  user: null,          // signed-in teacher
  head: null,          // { school, member, profile } from loadHeader()
  leaveGuard: null,    // async () => boolean, asks before leaving unsaved work
  get kind() { return this.head?.profile?.kind || "secondary"; },
  get role() { return this.head?.member?.role || null; },
  get reviewer() { return this.role === "admin" || this.role === "hod"; },
};

// Words that change with the audience.
export function words(kind = ctx.kind) {
  if (kind === "training") return { learners: "participants", learner: "participant", teacher: "presenter", Learners: "Participants" };
  if (kind === "university") return { learners: "students", learner: "student", teacher: "lecturer", Learners: "Students" };
  return { learners: "students", learner: "student", teacher: "teacher", Learners: "Students" };
}

export function frame(active, inner) {
  const app = $("#app");
  const tabs = [["quizzes", "Quizzes"], ["classes", "Class lists"], ["sessions", "Results"], ...(ctx.reviewer ? [["reviews", "Reviews"]] : []), ["school", "School"]];
  app.innerHTML = `<header class="topbar">
      <a class="brand" href="#/quizzes">${LOGO} Afterclass</a>
      <nav class="tabs" aria-label="Sections">${tabs.map(([k, l]) => `<a href="#/${k}" class="${active === k ? "on" : ""}" ${active === k ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      <div class="row"><span class="muted acct">${esc(ctx.head?.school?.name || "")}${ctx.head?.school ? " · " : ""}${esc(ctx.user.email)}</span><button class="btn sm" id="signOut" type="button">Sign out</button></div>
    </header><main id="view" style="display:grid;gap:20px">${inner}</main>`;
  $("#signOut").onclick = async () => { await sb.auth.signOut(); location.hash = ""; };
  return $("#view");
}

export const statusChip = (s) => ({
  draft: "", submitted: `<span class="chip open">AWAITING REVIEW</span>`,
  approved: `<span class="chip live">APPROVED</span>`, changes: `<span class="chip warn">CHANGES REQUESTED</span>`,
}[s] || "");
