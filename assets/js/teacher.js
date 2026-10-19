// Teacher dashboard entry: sign in, routing, the quiz list and the
// "start" options (live game, class teams, assignment / online test).
import { sb, configured, configProblem, friendly, rpc, q } from "./sb.js";
import { $, esc, toast, ask, dialog, fmtDate, LOGO, store } from "./ui.js";
import { ctx, frame, words, statusChip } from "./shell.js";
import { loadHeader, schoolView } from "./school.js";
import { examView } from "./exam.js";
import { editorView } from "./editor.js";
import { classesView, classView } from "./classes.js";
import { overviewView } from "./overview.js";
import { sessionsView, reportView, reviewsView, reviewView } from "./report.js";

const app = $("#app");
const SITE = new URL("../", location.href).href;          // student join page
let recovering = false;
let currentHash = location.hash;
ctx.replaceHash = (h) => { history.replaceState(null, "", h); currentHash = location.hash; };
ctx.reloadHead = async () => { const { loadHeader: lh } = await import("./school.js"); ctx.head = await lh(); };

/* ================= boot & auth ================= */
if (!configured) {
  app.innerHTML = `<div class="auth panel"><a class="brand" href="../">${LOGO} Afterclass</a>
    <h1 style="font-size:26px">Almost there</h1>
    <p class="muted" style="margin:0">${configProblem || 'This copy of Afterclass is not connected to a database yet. Open <code>assets/js/config.js</code> and paste your Supabase Project URL and publishable key (README, step 3).'}</p></div>`;
} else {
  let booted = false;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") { recovering = true; return renderNewPassword(); }
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
    const was = ctx.user?.id; ctx.user = session?.user ?? null;
    if (booted && !recovering && ctx.user?.id !== was) { ctx.head = null; ctx.isStudent = undefined; route(); }
  });
  const { data } = await sb.auth.getSession();
  ctx.user = data.session?.user ?? null;
  booted = true;
  if (!recovering) route();
}
addEventListener("hashchange", () => route());

function renderAuth(mode = "in") {
  app.innerHTML = `<div class="auth panel">
    <a class="brand" href="../">${LOGO} Afterclass</a>
    <div><h1 style="font-size:28px">${mode === "up" ? "Create your account" : mode === "reset" ? "Reset your password" : "Teacher sign in"}</h1>
    <p class="muted" style="margin:6px 0 0">${mode === "reset" ? "We'll email you a link to choose a new password." : `For teachers, lecturers and presenters. Students register on the <a href="../">home page</a>, or just join a game with its PIN.`}</p></div>
    <form id="authForm" style="display:grid;gap:12px">
      ${mode === "up" ? `<div class="field"><label class="label" for="fullName">Full name</label><input id="fullName" type="text" maxlength="80" autocomplete="name" required placeholder="e.g. Mrs. Bello"></div>` : ""}
      <div class="field"><label class="label" for="email">Email</label><input id="email" type="email" autocomplete="email" required></div>
      ${mode === "reset" ? "" : `<div class="field"><label class="label" for="pw">Password</label><input id="pw" type="password" minlength="8" autocomplete="${mode === "up" ? "new-password" : "current-password"}" required></div>`}
      <button class="btn primary big" type="submit">${mode === "up" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</button>
      <div class="status" id="authStatus" role="status"></div>
    </form>
    <div class="spread" style="font-size:14px">
      ${mode === "in" ? `<a href="#" data-mode="up">Create an account</a><a href="#" data-mode="reset">Forgot password?</a>` : `<a href="#" data-mode="in">Back to sign in</a>`}
    </div></div>`;
  app.querySelectorAll("[data-mode]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); renderAuth(a.dataset.mode); }));
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const st = $("#authStatus"), email = $("#email").value.trim(), pw = $("#pw")?.value;
    st.className = "status"; st.textContent = "Please wait…";
    try {
      if (mode === "in") { const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; }
      else if (mode === "up") {
        const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { role: "teacher", full_name: $("#fullName").value.trim() }, emailRedirectTo: location.href.split("#")[0] } });
        if (error) throw error;
        if (!data.session) { st.textContent = "Check your email and click the confirmation link, then sign in."; return; }
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
        if (error) throw error;
        st.textContent = "If that email has an account, a reset link is on its way.";
      }
    } catch (err) { st.className = "status err"; st.textContent = err.message === "Invalid login credentials" ? "Wrong email or password." : /Email not confirmed/i.test(err.message) ? "Confirm your email first: open the link Supabase sent you, then sign in." : friendly(err.message); }
  };
}

function renderNewPassword() {
  app.innerHTML = `<div class="auth panel"><h1 style="font-size:26px">Choose a new password</h1>
    <form id="npForm" style="display:grid;gap:12px"><div class="field"><label class="label" for="np">New password</label><input id="np" type="password" minlength="8" autocomplete="new-password" required></div>
    <button class="btn primary" type="submit">Save password</button><div class="status" id="npStatus"></div></form></div>`;
  $("#npForm").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $("#np").value });
    if (error) { $("#npStatus").className = "status err"; $("#npStatus").textContent = error.message; return; }
    recovering = false; toast("Password updated"); location.hash = "#/quizzes"; route();
  };
}

/* ================= routing ================= */
async function route() {
  if (!configured || recovering) return;
  if (!ctx.user) return renderAuth();
  if (ctx.leaveGuard && location.hash !== currentHash && !(await ctx.leaveGuard())) { history.replaceState(null, "", currentHash || "#/quizzes"); return; }
  ctx.leaveGuard = null; window.onbeforeunload = null;
  currentHash = location.hash;
  if (!ctx.head) { ctx.head = await loadHeader().catch(() => ({ profile: { kind: "secondary" } })); autoPurge(); }
  if (await isStudent()) return renderStudentAccount();
  const [, pageRaw = "", id] = (location.hash || "#/home").split("/");
  const [page, query = ""] = pageRaw.split("?");
  try {
    if (page === "new") return await editorView(null, { importNow: query === "import" });
    if (page === "edit") return await editorView(id);
    if (page === "print") return await examView(id, frame);
    if (page === "classes") return await classesView();
    if (page === "class") return await classView(id);
    if (page === "sessions") return await sessionsView();
    if (page === "report") return await reportView(id);
    if (page === "reviews") return await reviewsView();
    if (page === "review") return await reviewView(id);
    if (page === "school") { await schoolView(frame); ctx.head = await loadHeader(); return; }
    if (page === "quizzes") return await quizzesView();
    return await overviewView();
  } catch (e) { frame("", `<div class="notice">${esc(e.message)}</div>`); }
}
export const refreshHead = async () => { ctx.head = await loadHeader(); };

// Student accounts use the home page, not the teacher dashboard.
async function isStudent() {
  if (ctx.role !== null) return false;   // in a school as a teacher
  if (ctx.isStudent === undefined) {
    const { data } = await sb.from("profiles").select("role").eq("user_id", ctx.user.id).maybeSingle();
    ctx.isStudent = (data?.role ?? ctx.user.user_metadata?.role) === "student";
  }
  return ctx.isStudent;
}
function renderStudentAccount() {
  app.innerHTML = `<div class="auth panel"><a class="brand" href="../">${LOGO} Afterclass</a>
    <h1 style="font-size:26px">This is a student account</h1>
    <p class="muted" style="margin:0">You're signed in as ${esc(ctx.user.email)}, which is registered as a student. Your dashboard is on the home page.</p>
    <div class="row"><a class="btn primary" href="../">Go to my dashboard</a><button class="btn" id="so" type="button">Sign out</button></div></div>`;
  $("#so").onclick = async () => { await sb.auth.signOut(); };
}

// Data protection: quietly delete results older than the chosen retention period, once a day.
async function autoPurge() {
  const days = Number(ctx.head?.school?.retention_days || ctx.head?.profile?.retention_days || 365);
  const stamp = "afterclass.purged." + ctx.user.id;
  if (store.get(stamp, 0) > Date.now() - 864e5) return;
  store.set(stamp, Date.now());
  try { await rpc("purge_old_sessions", { p_days: days }); } catch { /* not critical */ }
}

/* ================= quizzes list ================= */
async function quizzesView() {
  const w = words();
  const v = frame("quizzes", `<div class="page-h"><div><span class="label">Your library</span><h1>Quizzes</h1></div>
    <div class="row"><a class="btn big" href="#/new?import">Import past questions</a><a class="btn primary big" href="#/new">+ New quiz from notes</a></div></div><div id="list"><p class="muted">Loading…</p></div>`);
  const list = await q(sb.from("quizzes").select("id,title,questions,updated_at,review_status,review_note").eq("owner_id", ctx.user.id).order("updated_at", { ascending: false }));
  const box = $("#list", v);
  if (!list.length) {
    box.innerHTML = `<div class="empty"><h2 style="font-size:22px;margin-bottom:6px">No quizzes yet</h2>
      <p style="margin:0 0 14px">Upload your lesson notes (PDF, Word or text) and Afterclass writes the questions. You can also paste in past questions you already have.</p>
      <div class="row" style="justify-content:center"><a class="btn primary" href="#/new">Create your first quiz</a><a class="btn" href="#/new?import">Import past questions</a></div></div>`;
    return;
  }
  const inSchool = !!ctx.head?.school;
  box.innerHTML = `<div class="grid-cards">${list.map((z) => {
    const c = { mcq: 0, tf: 0, short: 0, poll: 0, word: 0 }; z.questions.forEach((x) => c[x.type]++);
    const fix = z.questions.filter((x) => x.needsAnswer).length;
    return `<article class="qcard" data-id="${z.id}"><div class="spread" style="align-items:flex-start"><h3>${esc(z.title)}</h3>${statusChip(z.review_status)}</div>
      <div class="meta"><span class="num">${z.questions.length} questions</span>${c.mcq ? `<span class="chip mcq">${c.mcq} MCQ</span>` : ""}${c.tf ? `<span class="chip tf">${c.tf} T/F</span>` : ""}${c.short ? `<span class="chip short">${c.short} WRITTEN</span>` : ""}${c.poll + c.word ? `<span class="chip">${c.poll + c.word} POLL</span>` : ""}</div>
      ${fix ? `<div class="notice" style="padding:6px 10px;font-size:13px">${fix} question${fix > 1 ? "s need" : " needs"} a correct answer. <a href="#/edit/${z.id}">Fix</a></div>` : ""}
      ${z.review_status === "changes" && z.review_note ? `<div class="notice" style="padding:6px 10px;font-size:13px"><b>HOD:</b> ${esc(z.review_note)}</div>` : ""}
      <div class="meta">Edited ${fmtDate(z.updated_at)}</div>
      <div class="actions">
        <details class="menu"><summary class="btn sm primary">Start ▾</summary><div class="menu-list">
          <button data-act="live" type="button"><b>Live game</b><span>${w.Learners} join on their phones with a PIN</span></button>
          <button data-act="teams" type="button"><b>Class teams (no phones)</b><span>Show on the board; you score the teams</span></button>
          <button data-act="assign" type="button"><b>Assignment / online test</b><span>Self-paced, with optional timer and class list</span></button>
          <a href="#/print/${z.id}"><b>Print exam paper</b><span>PDF or Word, with your school heading</span></a>
          <a href="../index.html?preview=${z.id}" target="_blank" rel="noopener"><b>Try it as a ${w.learner}</b><span>Opens a preview; nothing is saved</span></a>
        </div></details>
        <a class="btn sm" href="#/edit/${z.id}">Edit</a>
        <details class="menu"><summary class="btn sm ghost" aria-label="More actions">More ▾</summary><div class="menu-list">
          ${inSchool && z.review_status !== "submitted" ? `<button data-act="review" type="button"><b>Send for review</b><span>Your HOD approves it before printing</span></button>` : ""}
          <button data-act="dup" type="button"><b>Duplicate</b></button>
          <button data-act="del" type="button" class="danger"><b>Delete</b></button>
        </div></details></div></article>`;
  }).join("")}</div>`;
  box.onclick = async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    b.closest("details")?.removeAttribute("open");
    const z = list.find((x) => x.id === b.closest(".qcard").dataset.id);
    try {
      if (b.dataset.act === "live") return hostDialog(z);
      if (b.dataset.act === "teams") return teamsDialog(z);
      if (b.dataset.act === "assign") return assignDialog(z);
      if (b.dataset.act === "review") { await rpc("submit_for_review", { p_quiz: z.id }); toast("Sent to your HOD for review"); return quizzesView(); }
      if (b.dataset.act === "dup") { await q(sb.from("quizzes").insert({ title: z.title + " (copy)", questions: z.questions })); toast("Duplicated"); return quizzesView(); }
      if (b.dataset.act === "del" && await ask(`Delete "${z.title}"? Past results stay under Results.`, "Delete quiz", true)) {
        await q(sb.from("quizzes").delete().eq("id", z.id)); toast("Quiz deleted"); quizzesView();
      }
    } catch (err) { toast(err.message, true); }
  };
  // close other open menus
  box.addEventListener("toggle", (e) => { if (e.target.open) box.querySelectorAll("details[open]").forEach((d) => d !== e.target && d.removeAttribute("open")); }, true);
}

const playable = (z) => z.questions.filter((x) => !x.needsAnswer);
function guardQuiz(z, live) {
  if (!z.questions.length) { toast("Add questions to this quiz first", true); return false; }
  const n = z.questions.filter((x) => x.needsAnswer).length;
  if (n) { toast(`${n} question${n > 1 ? "s" : ""} still need a correct answer. Open Edit to fix ${n > 1 ? "them" : "it"}.`, true); return false; }
  if (!live && !z.questions.some((x) => x.type !== "poll" && x.type !== "word")) { toast("Polls and word clouds only work in live games", true); return false; }
  return true;
}

async function classOptions() {
  const cls = await q(sb.from("classes").select("id,name,students(count)").eq("owner_id", ctx.user.id).order("name"));
  return `<option value="">No class list (anyone with the PIN, nicknames)</option>${cls.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.students?.[0]?.count ?? 0} on list)</option>`).join("")}`;
}

async function hostDialog(z) {
  if (!guardQuiz(z, true)) return;
  const kind = ctx.kind, w = words();
  const defTime = kind === "primary" ? 60 : kind === "training" ? 30 : 20;
  const d = dialog(`<h2 style="font-size:22px">Live game: ${esc(z.title)}</h2>
    <p class="muted" style="margin:0">Put the host screen on your projector or share it on Zoom / Google Meet. ${w.Learners} join on their phones.</p>
    <div class="opts">
      <div class="field"><label class="label" for="hTime">Time per question</label>
        <select id="hTime"><option value="10">10 seconds</option><option value="20">20 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="90">90 seconds</option><option value="120">2 minutes</option><option value="0">No timer, I reveal</option></select></div>
      <div class="field"><label class="label" for="hAud">Audience</label><select id="hAud"><option value="class">A class</option><option value="webinar">Webinar / seminar / large event</option></select></div>
    </div>
    <div class="field"><label class="label" for="hClass">Class list</label><select id="hClass"><option value="">Loading…</option></select>
      <small class="muted">With a class list, ${w.learners} join with their admission / matric number, so scores are linked to real names.</small></div>
    <div class="checks">
      <label class="check"><input type="checkbox" id="hHide"> Hide scores and rankings</label>
      <label class="check"><input type="checkbox" id="hQa"> Let people ask questions (Q&amp;A)</label>
      <label class="check"><input type="checkbox" id="hEmail"> Ask for email (certificates, follow-up)</label>
      <label class="check"><input type="checkbox" id="hRead"> Read-aloud button on phones</label>
    </div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-x type="button">Cancel</button><button class="btn primary" id="hGo" type="button">Open host screen</button></div>`);
  $("#hTime", d).value = String(store.get("afterclass.time", defTime));
  $("#hHide", d).checked = kind === "primary";
  $("#hRead", d).checked = kind === "primary";
  $("#hAud", d).value = kind === "training" ? "webinar" : "class";
  const sync = () => { const web = $("#hAud", d).value === "webinar"; $("#hQa", d).checked ||= web; $("#hEmail", d).closest("label").hidden = !web; if (!web) $("#hEmail", d).checked = false; };
  $("#hAud", d).onchange = sync; sync();
  classOptions().then((o) => ($("#hClass", d).innerHTML = o)).catch(() => {});
  d.querySelector("[data-x]").onclick = () => d.close();
  $("#hGo", d).onclick = async () => {
    $("#hGo", d).disabled = true;
    try {
      const t = +$("#hTime", d).value; store.set("afterclass.time", t);
      const s = await rpc("create_session", { p_quiz: z.id, p_kind: "live", p_time_limit: t, p_reveal: "close", p_closes_at: null, p_class: $("#hClass", d).value || null,
        p_settings: { audience: $("#hAud", d).value, hideScores: $("#hHide", d).checked, qa: $("#hQa", d).checked, collectEmail: $("#hEmail", d).checked, readAloud: $("#hRead", d).checked } });
      location.href = `host.html?s=${s.id}`;
    } catch (e) { toast(e.message, true); $("#hGo", d).disabled = false; }
  };
}

function teamsDialog(z) {
  if (!guardQuiz(z, true)) return;
  const d = dialog(`<h2 style="font-size:22px">Class teams: ${esc(z.title)}</h2>
    <p class="muted" style="margin:0">For classrooms without phones. The question shows on the board, teams agree an answer, and you tap the teams that got it right.</p>
    <div class="field"><label class="label" for="tNames">Team names (one per line, 2–8 teams)</label><textarea id="tNames" rows="4">Red team\nBlue team\nYellow team\nGreen team</textarea></div>
    <div class="field"><label class="label" for="tTime">Time per question</label><select id="tTime"><option value="30">30 seconds</option><option value="60" selected>60 seconds</option><option value="90">90 seconds</option><option value="0">No timer</option></select></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-x type="button">Cancel</button><button class="btn primary" id="tGo" type="button">Start</button></div>`);
  d.querySelector("[data-x]").onclick = () => d.close();
  $("#tGo", d).onclick = () => {
    const teams = $("#tNames", d).value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8);
    if (teams.length < 2) return toast("Add at least two teams", true);
    store.set("afterclass.teams", { quiz: z.id, teams, time: +$("#tTime", d).value });
    location.href = `host.html?teams=${z.id}`;
  };
}

async function assignDialog(z) {
  if (!guardQuiz(z, false)) return;
  const w = words();
  const week = new Date(Date.now() + 7 * 864e5); week.setHours(23, 59, 0, 0);
  const local = new Date(week.getTime() - week.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  const d = dialog(`<h2 style="font-size:22px">Assignment / online test: ${esc(z.title)}</h2>
    <p class="muted" style="margin:0">${w.Learners} work through it on their own device after class, or as a timed online test (CBT).</p>
    <div class="field"><label class="label" for="aClass">Class list</label><select id="aClass"><option value="">Loading…</option></select>
      <small class="muted" id="aClassNote">Use a class list for anything that counts towards grades: one attempt per ${w.learner}, identified by admission / matric number.</small></div>
    <div class="opts">
      <div class="field"><label class="label" for="aClose">Closes at (empty = no deadline)</label><input id="aClose" type="datetime-local" value="${local}"></div>
      <div class="field"><label class="label" for="aTime">Time limit per ${w.learner}</label><select id="aTime"><option value="0">No time limit</option><option value="10">10 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option></select></div>
    </div>
    <div class="field"><label class="label" for="aReveal">Show correct answers to ${w.learners}</label>
      <select id="aReveal"><option value="close">After the deadline (recommended, stops answer-sharing)</option><option value="submit">Straight after they submit (practice only)</option><option value="never">Never (show only the score)</option></select></div>
    <label class="check" style="justify-self:start"><input type="checkbox" id="aShuffle" checked> Shuffle question and option order for each ${w.learner}</label>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-x type="button">Cancel</button><button class="btn primary" id="aGo" type="button">Create</button></div>`);
  d.querySelector("[data-x]").onclick = () => d.close();
  classOptions().then((o) => ($("#aClass", d).innerHTML = o)).catch(() => {});
  $("#aGo", d).onclick = async () => {
    const closeVal = $("#aClose", d).value, reveal = $("#aReveal", d).value;
    if (reveal === "close" && !closeVal && !(await ask("With no deadline, answers are shown only when you close the assignment from Results. Continue?", "Continue"))) return;
    $("#aGo", d).disabled = true;
    try {
      const s = await rpc("create_session", { p_quiz: z.id, p_kind: "assignment", p_time_limit: 0, p_reveal: reveal, p_closes_at: closeVal ? new Date(closeVal).toISOString() : null,
        p_class: $("#aClass", d).value || null, p_settings: { timeLimitMin: +$("#aTime", d).value, shuffle: $("#aShuffle", d).checked } });
      d.close(); shareDialog(s);
    } catch (e) { toast(e.message, true); $("#aGo", d).disabled = false; }
  };
}

function shareDialog(s) {
  const link = `${SITE}?pin=${s.pin}`, w = words();
  const timed = s.settings?.timeLimitMin ? `Time allowed: ${s.settings.timeLimitMin} minutes once you press Start.` : "";
  const d = dialog(`<span class="label">Ready</span><h2 style="font-size:22px">${esc(s.title)}</h2>
    <div><span class="label">PIN</span><div class="pinbox">${s.pin}</div></div>
    <div class="field"><label class="label" for="shLink">Link to share</label><input id="shLink" type="text" readonly value="${esc(link)}"></div>
    <p class="muted" style="margin:0;font-size:14px">${s.closes_at ? "Closes " + fmtDate(s.closes_at) + ". " : ""}${s.class_id ? `${w.Learners} sign in with their admission / matric number and name as it appears on your class list. ` : ""}${timed}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" id="shCopy" type="button">Copy message</button><a class="btn primary" href="#/report/${s.id}">View results</a></div>`);
  $("#shCopy", d).onclick = async () => {
    const msg = `${s.title}\nOpen: ${link}\n(or go to ${SITE} and enter PIN ${s.pin})${s.class_id ? "\nUse your admission/matric number and your name as on the class list." : ""}${s.closes_at ? "\nDue: " + fmtDate(s.closes_at) : ""}${timed ? "\n" + timed : ""}`;
    try { await navigator.clipboard.writeText(msg); toast("Copied. Paste it into your class group or LMS"); } catch { $("#shLink", d).select(); toast("Press Ctrl+C to copy"); }
  };
  d.querySelector("a").onclick = () => d.close();
}

export { playable };
