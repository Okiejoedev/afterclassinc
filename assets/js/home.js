// Home page: what everyone sees first. Register / sign in as a student or a
// teacher, a quick "Have a game PIN?" box, and the student dashboard.
// student.js passes in how to start a game: { pin(pin), joinAs(pin, name) }.
import { sb, friendly, rpc, q } from "./sb.js";
import { $, esc, toast, ask, dialog, fmtDate, LOGO } from "./ui.js";
import { practise } from "./practice.js";

const app = $("#app");
let hooks = {}, user = null, profile = null;
// "Report a problem" links on the home page, dashboards and phone screens.
document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-fb]")) return;
  e.preventDefault(); import("./feedback.js").then((m) => m.openFeedback());
});

export async function home(h = hooks, msg = "") {
  hooks = h;
  document.body.className = "home";
  app.innerHTML = `<div class="home-wrap"><p class="muted">Loading…</p></div>`;
  try { user = (await sb.auth.getSession()).data.session?.user ?? null; } catch { user = null; }
  profile = user ? await loadProfile() : null;
  if (profile?.role === "student") return studentDash(msg);
  landing(msg);
}

// Teachers who registered before student accounts existed have no profile row: they are teachers.
async function loadProfile() {
  const meta = user.user_metadata || {};
  const fallback = { role: meta.role === "student" ? "student" : "teacher", full_name: meta.full_name || "", student_no: meta.student_no || "", section: meta.section || "" };
  try {
    const row = await q(sb.from("profiles").select("role,full_name,student_no,section").eq("user_id", user.id).maybeSingle())
      .catch(() => q(sb.from("profiles").select("role,full_name,student_no").eq("user_id", user.id).maybeSingle()));   // older database
    return row ? { ...row, section: row.section || fallback.section } : fallback;
  } catch { return fallback; }
}

const header = (right) => `<header class="home-top"><a class="brand" href="./">${LOGO} Afterclass</a><nav class="row">${right}</nav></header>`;
const pinBox = (id = "pinForm") => `<form class="pin-card" id="${id}" autocomplete="off">
    <label class="label" for="${id}-pin">Have a game PIN?</label>
    <div class="pin-row"><input id="${id}-pin" type="text" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" placeholder="000 000" aria-describedby="${id}-err" required>
    <button class="btn primary" type="submit">Join</button></div>
    <p class="status err" id="${id}-err" role="alert"></p></form>`;
function bindPin(id = "pinForm", name = "") {
  $("#" + id).onsubmit = (e) => {
    e.preventDefault();
    const p = $(`#${id}-pin`).value.replace(/\D/g, "");
    if (p.length !== 6) { $(`#${id}-err`).textContent = "The PIN has 6 digits."; return; }
    name ? hooks.joinAs(p, name) : hooks.pin(p);
  };
}

/* ================= landing ================= */
function landing(msg) {
  const teacher = user && profile?.role !== "student";
  app.innerHTML = `<div class="home-wrap">
    ${header(teacher
      ? `<a class="btn primary" href="teacher/">Open your dashboard</a><button class="btn ghost" id="out" type="button">Sign out</button>`
      : `<button class="btn ghost" data-auth="in" type="button">Sign in</button><button class="btn primary" data-auth="up" data-role="student" type="button">Register</button>`)}
    ${msg ? `<div class="notice">${esc(msg)}</div>` : ""}
    <section class="hero">
      <div class="hero-copy">
        <span class="label">Quizzes · online tests · exam papers</span>
        <h1>Learn it in class. <mark>Prove it</mark> after.</h1>
        <p class="lead">For Nigerian classrooms, from primary school to university. Teachers turn lesson notes into live quiz games, CBT tests and printed exams; students join, play and keep track of every score.</p>
        ${teacher ? `<p class="muted" style="margin:0">You're signed in as a teacher (${esc(user.email)}).</p>` : `<div class="row">
          <button class="btn primary big" data-auth="up" data-role="teacher" type="button">I'm a teacher</button>
          <button class="btn big" data-auth="up" data-role="student" type="button">I'm a student</button></div>
          <p class="muted" style="margin:0;font-size:14px">Already registered? <a href="#" data-auth="in">Sign in</a></p>`}
      </div>
      <div class="hero-side">${pinBox()}<p class="muted" style="margin:0;font-size:13px;text-align:center">Joining a game doesn't need an account.</p></div>
    </section>
    <section class="sections" aria-label="Choose your section">
      <h2 class="sec-title">Built for every stage of school</h2>
      <div class="sec-grid">
        <article class="sec-card primary">
          <span class="sec-badge primary">Primary</span>
          <h3>Nursery &amp; primary schools</h3>
          <ul><li>Class teams: play on the board, no phones needed</li><li>Big-picture games with read-aloud</li><li>Simple quizzes from your notes</li><li>Star charts and printable worksheets</li></ul>
          <p class="muted" style="margin:0;font-size:14px">Pupils don't need accounts: they play as teams or join with a PIN.</p>
          ${teacher ? "" : `<button class="btn primary" data-auth="up" data-role="teacher" data-sec="primary" type="button">Register as a primary teacher</button>`}
        </article>
        <article class="sec-card secondary">
          <span class="sec-badge secondary">Secondary</span>
          <h3>Junior &amp; senior secondary</h3>
          <ul><li>Questions from notes, PDFs or a recorded lesson</li><li>CBT tests with timers and class lists</li><li>WAEC / NECO-style exam papers</li><li>Class codes, leaderboards and practice</li></ul>
          ${teacher ? "" : `<div class="row"><button class="btn primary" data-auth="up" data-role="teacher" data-sec="secondary" type="button">I'm a teacher</button><button class="btn" data-auth="up" data-role="student" data-sec="secondary" type="button">I'm a student</button></div>`}
        </article>
        <article class="sec-card higher">
          <span class="sec-badge higher">Higher</span>
          <h3>Universities, polytechnics &amp; colleges</h3>
          <ul><li>Courses with codes and matric numbers</li><li>Live lectures with polls and Q&amp;A</li><li>CA tests (CBT) and semester exam papers</li><li>Record a lecture, get questions after</li></ul>
          ${teacher ? "" : `<div class="row"><button class="btn primary" data-auth="up" data-role="teacher" data-sec="higher" type="button">I'm a lecturer</button><button class="btn" data-auth="up" data-role="student" data-sec="higher" type="button">I'm a student</button></div>`}
        </article>
      </div>
      ${teacher ? `<a class="btn primary" style="justify-self:start" href="teacher/">Open your dashboard</a>` : `<p class="muted" style="margin:0;font-size:14px">Already registered? <a href="#" data-auth="in">Sign in</a></p>`}
    </section>
    <section class="steps" aria-label="How it works">
      <div><b>1</b><h3>Teacher makes a quiz</h3><p class="muted">From notes, past questions or scratch.</p></div>
      <div><b>2</b><h3>Students join</h3><p class="muted">With a game PIN, or from their dashboard.</p></div>
      <div><b>3</b><h3>Everyone sees results</h3><p class="muted">Scores, corrections and reports straight away.</p></div>
    </section>
    <footer class="home-foot"><span class="row" style="gap:6px 16px"><a href="help.html">Help &amp; guide</a><a href="#" data-fb>Report a problem</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a></span><span>Afterclass</span></footer>
  </div>`;
  bindPin();
  app.querySelectorAll("[data-auth]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); authDialog(b.dataset.auth, b.dataset.role || "student", b.dataset.sec || ""); }));
  $("#out")?.addEventListener("click", signOut);
}

async function signOut() { await sb.auth.signOut(); home(); }

/* ================= sign in / register ================= */
// Teachers pick their section (and, for higher education, the kind of institution);
// students pick secondary or higher. Primary pupils don't register.
const TEACHER_SECTIONS = [["primary", "Primary", "Nursery & primary"], ["secondary", "Secondary", "JSS & SSS"], ["higher", "Higher", "University, poly, college"]];
const HIGHER_KINDS = [["university", "University"], ["polytechnic", "Polytechnic / monotechnic"], ["college", "College of Education or other college"], ["training", "Training / workshops"]];
function authDialog(mode = "in", role = "student", sec = "") {
  const up = mode === "up", reset = mode === "reset", stu = role === "student";
  if (up && stu && sec === "primary") sec = "";
  const d = dialog(`<form id="authForm" style="display:grid;gap:12px">
    <div class="spread"><h2 style="font-size:24px">${up ? (stu ? "Register as a student" : "Register as a teacher") : reset ? "Reset your password" : "Sign in"}</h2>
      <button class="btn ghost sm" type="button" data-x aria-label="Close">✕</button></div>
    ${up ? `<div class="seg" role="radiogroup" aria-label="I am a">
        <button type="button" role="radio" aria-checked="${!stu}" data-role="teacher">Teacher / lecturer</button>
        <button type="button" role="radio" aria-checked="${stu}" data-role="student">Student</button></div>
      <fieldset class="sec-pick"><legend class="label">${stu ? "Where do you study?" : "Where do you teach?"}</legend>
        <div class="sec-pick-row">${(stu ? TEACHER_SECTIONS.slice(1) : TEACHER_SECTIONS).map(([k, l, sub]) => `<label class="sec-opt ${k}"><input type="radio" name="aSec" value="${k}" ${sec === k ? "checked" : ""} required><b>${l}</b><span>${sub}</span></label>`).join("")}</div>
        ${stu ? `<small class="muted">Primary pupils don't need an account: they join games with a PIN.</small>` : ""}</fieldset>
      ${!stu ? `<div class="field" id="kindWrap" ${sec === "higher" ? "" : "hidden"}><label class="label" for="aKind">Type of institution</label><select id="aKind">${HIGHER_KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>` : ""}
      <div class="field"><label class="label" for="aName">Full name</label><input id="aName" type="text" maxlength="80" autocomplete="name" required placeholder="${stu ? "As your school has it, e.g. Okafor Adaeze" : "e.g. Mrs. Bello"}"></div>
      ${stu ? `<div class="field"><label class="label" for="aNo"><span id="aNoLabel">${sec === "higher" ? "Matric / registration number" : "Admission number"}</span> <span style="text-transform:none;letter-spacing:0">(optional)</span></label><input id="aNo" type="text" maxlength="40" autocomplete="off"></div>` : ""}` : ""}
    <div class="field"><label class="label" for="aEmail">Email</label><input id="aEmail" type="email" autocomplete="email" required></div>
    ${reset ? "" : `<div class="field"><label class="label" for="aPw">Password</label><input id="aPw" type="password" minlength="8" autocomplete="${up ? "new-password" : "current-password"}" required>${up ? `<small class="muted">At least 8 characters.</small>` : ""}</div>`}
    ${up ? `<label class="check" style="border:0;padding:0;align-items:flex-start"><input type="checkbox" id="aTerms"> <span style="font-size:14px">I agree to the <a href="terms.html" target="_blank" rel="noopener">terms of use</a> and <a href="privacy.html" target="_blank" rel="noopener">privacy notice</a>${stu ? ". If I am under 13, a parent or teacher knows I am using Afterclass." : "."}</span></label>` : ""}
    <button class="btn primary big" type="submit" id="aGo">${up ? "Create account" : reset ? "Send reset link" : "Sign in"}</button>
    <div class="status" id="aStatus" role="status"></div>
    <div class="spread" style="font-size:14px">${mode === "in"
      ? `<a href="#" data-mode="up">Create an account</a><a href="#" data-mode="reset">Forgot password?</a>`
      : `<a href="#" data-mode="in">I already have an account</a>`}</div></form>`);
  d.querySelector("[data-x]").onclick = () => d.close();
  d.querySelectorAll("[data-mode]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); d.close(); authDialog(a.dataset.mode, role); }));
  d.querySelectorAll(".seg [data-role]").forEach((b) => (b.onclick = () => { d.close(); authDialog("up", b.dataset.role, sec); }));
  d.querySelectorAll("[name=aSec]").forEach((r) => (r.onchange = () => {
    if ($("#kindWrap", d)) $("#kindWrap", d).hidden = r.value !== "higher";
    if ($("#aNoLabel", d)) $("#aNoLabel", d).textContent = r.value === "higher" ? "Matric / registration number" : "Admission number";
  }));
  $("#authForm", d).onsubmit = async (e) => {
    e.preventDefault();
    const st = $("#aStatus", d), email = $("#aEmail", d).value.trim(), pw = $("#aPw", d)?.value;
    st.className = "status"; st.textContent = "Please wait…"; $("#aGo", d).disabled = true;
    try {
      if (mode === "in") {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error;
        user = data.user; profile = await loadProfile(); d.close();
        if (profile.role === "student") return home();
        location.href = "teacher/";
      } else if (up) {
        const full_name = $("#aName", d).value.trim().replace(/\s+/g, " ");
        if (full_name.length < 2) throw new Error("Enter your full name.");
        const chosen = d.querySelector("[name=aSec]:checked")?.value;
        if (!chosen) throw new Error(stu ? "Choose where you study." : "Choose where you teach.");
        const kind = chosen === "higher" ? $("#aKind", d)?.value || "university" : chosen;
        const meta = { role, full_name, section: chosen, ...(stu ? { student_no: ($("#aNo", d)?.value || "").trim() } : { kind }) };
        const back = new URL(stu ? "./" : "teacher/", location.href).href;
        if (!$("#aTerms", d).checked) throw new Error("Please accept the terms of use to continue.");
        const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: meta, emailRedirectTo: back } });
        if (error) throw error;
        if (!data.session) { st.textContent = `Almost done: we sent a link to ${email}. Open it to confirm your email, then sign in.`; return; }
        d.close();
        if (stu) return home(); location.href = "teacher/";
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL("teacher/", location.href).href });
        if (error) throw error;
        st.textContent = "If that email has an account, a reset link is on its way.";
      }
    } catch (err) {
      st.className = "status err";
      st.textContent = err.message === "Invalid login credentials" ? "Wrong email or password."
        : /Email not confirmed/i.test(err.message) ? "Confirm your email first: open the link we sent you, then sign in."
        : /already registered/i.test(err.message) ? "That email already has an account. Sign in instead."
        : friendly(err.message);
    } finally { const b = $("#aGo", d); if (b) b.disabled = false; }
  };
  (up ? $("#aName", d) : $("#aEmail", d)).focus();
}

/* ================= student dashboard ================= */
// Higher-education students have courses and matric numbers; secondary students have classes.
const studentWords = () => (profile?.section === "higher"
  ? { klass: "course", Klass: "Course", classes: "courses", number: "Matric / registration number", badge: "higher", Badge: "Higher" }
  : { klass: "class", Klass: "Class", classes: "classes", number: "Admission number", badge: "secondary", Badge: "Secondary" });

async function studentDash(msg = "") {
  const sw = studentWords();
  const first = profile.full_name || user.email.split("@")[0];
  app.innerHTML = `<div class="home-wrap">
    ${header(`<span class="who-chip">${esc(profile.full_name || user.email)}</span><button class="btn ghost" id="out" type="button">Sign out</button>`)}
    ${msg ? `<div class="notice">${esc(msg)}</div>` : ""}
    <div class="page-h"><div><span class="label">Student dashboard <span class="sec-badge ${sw.badge}">${sw.Badge}</span></span><h1>Hi, ${esc(first)}</h1></div></div>
    <div class="stat-row" id="stats">${["Games & tests", "Average test score", "Practice runs", "To do"].map((l) => `<div class="stat"><span class="label">${l}</span><b>–</b></div>`).join("")}</div>
    <div class="dash">
      <div class="dash-main">
        <section class="panel"><div class="spread"><h2 class="h2">Join a game</h2></div>${pinBox("dashPin")}</section>
        <section class="panel"><h2 class="h2">To do</h2><div id="todo"><p class="muted">Loading…</p></div></section>
        <section class="panel"><div class="spread"><h2 class="h2">Practice</h2><span class="muted" style="font-size:13px">Replay quizzes you've taken. Private, doesn't affect results.</span></div><div id="prac"><p class="muted">Loading…</p></div></section>
        <section class="panel"><h2 class="h2">Recent results</h2><div id="hist"><p class="muted">Loading…</p></div></section>
      </div>
      <aside class="dash-side">
        <section class="panel" id="lbPanel" hidden><div class="spread"><h2 class="h2">Leaderboard</h2><select id="lbClass" aria-label="Class" style="width:auto;max-width:60%"></select></div><div id="lb"></div></section>
        <section class="panel"><h2 class="h2">My ${sw.classes}</h2><div id="classes"><p class="muted">Loading…</p></div>
          <form id="joinClass" style="display:grid;gap:10px;border-top:1px solid var(--line);padding-top:14px" autocomplete="off">
            <div class="field"><label class="label" for="cCode">Join a ${sw.klass}</label><input id="cCode" type="text" maxlength="12" placeholder="${sw.Klass} code from your ${sw.klass === "course" ? "lecturer" : "teacher"}" required style="text-transform:uppercase;font-family:var(--f-mono);letter-spacing:.1em"></div>
            <button class="btn primary" type="submit">Join ${sw.klass}</button><p class="status" id="cStatus" role="status"></p></form></section>
        <section class="panel"><h2 class="h2">Profile</h2>
          <form id="prof" style="display:grid;gap:10px">
            <div class="field"><label class="label" for="pName">Full name</label><input id="pName" type="text" maxlength="80" required value="${esc(profile.full_name)}"></div>
            <div class="field"><label class="label" for="pNo">${sw.number}</label><input id="pNo" type="text" maxlength="40" value="${esc(profile.student_no)}"></div>
            <div class="row"><button class="btn" type="submit">Save</button><span class="muted" style="font-size:13px">${esc(user.email)}</span></div></form></section>
      </aside>
    </div>
    <footer class="home-foot"><span class="row" style="gap:6px 16px"><a href="help.html">Help &amp; guide</a><a href="#" data-fb>Report a problem</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a></span><span>Afterclass</span></footer>
  </div>`;
  $("#out").onclick = signOut;
  bindPin("dashPin", profile.full_name);
  $("#prof").onsubmit = async (e) => {
    e.preventDefault();
    const full_name = $("#pName").value.trim().replace(/\s+/g, " "), student_no = $("#pNo").value.trim();
    if (full_name.length < 2) return toast("Enter your full name", true);
    try { await q(sb.from("profiles").upsert({ user_id: user.id, role: "student", full_name, student_no })); profile = { ...profile, full_name, student_no }; toast("Saved"); }
    catch (err) { toast(err.message, true); }
  };
  $("#joinClass").onsubmit = async (e) => {
    e.preventDefault();
    const st = $("#cStatus"); st.className = "status"; st.textContent = "Joining…";
    try {
      const r = await rpc("join_class", { p_code: $("#cCode").value, p_student_no: profile.student_no || "" });
      toast(r.already ? `You're already in ${r.name}` : `Joined ${r.name}`); loadDash();
    } catch (err) { st.className = "status err"; st.textContent = err.message; }
  };
  loadDash();
}

async function loadDash() {
  let d;
  try { d = await rpc("student_home", {}); }
  catch (err) {
    const missing = /Could not find the function|database isn't set up/i.test(err.message);
    ["#todo", "#prac", "#hist", "#classes"].forEach((s) => ($(s).innerHTML = `<p class="status err">${esc(missing ? "Student accounts aren't switched on yet. Ask your teacher (or the site owner) to re-run supabase/schema.sql." : err.message)}</p>`));
    return;
  }
  const graded = d.history.filter((h) => h.kind === "assignment" && h.finished && !h.hide_scores);
  const avg = graded.length ? Math.round(graded.reduce((a, h) => a + h.score / 10, 0) / graded.length) + "%" : "–";
  $("#stats").innerHTML = [["Games & tests", d.history.length], ["Average test score", avg], ["Practice runs", d.practice_runs ?? 0], ["To do", d.todo.length]]
    .map(([l, v]) => `<div class="stat"><span class="label">${l}</span><b>${v}</b></div>`).join("");

  // Practice: each quiz once (newest attempt), when its answers are no longer secret.
  const seen = new Set(), prac = d.history.filter((h) => h.practice && !seen.has(h.session_id) && seen.add(h.session_id));
  $("#prac").innerHTML = prac.length ? `<ul class="todo">${prac.slice(0, 8).map((h) => `<li><div><b>${esc(h.title)}</b><div class="muted" style="font-size:13px">${h.kind === "live" ? "Live game" : "Test"} · ${esc(fmtDate(h.at))}</div></div>
      <button class="btn sm primary" data-practise="${h.session_id}" type="button">Practise</button></li>`).join("")}</ul>`
    : `<p class="muted" style="margin:0">After a live game ends, or your teacher closes a test, you can practise it here as many times as you like.</p>`;
  $("#prac").onclick = (e) => { const b = e.target.closest("[data-practise]"); if (b) practise(b.dataset.practise, () => home()); };
  loadBoard(d.classes);

  $("#todo").innerHTML = d.todo.length ? `<ul class="todo">${d.todo.map((t) => `<li>
      <div><b>${esc(t.title)}</b><div class="muted" style="font-size:13px">${esc(t.class)} · ${t.kind === "live" ? `<span class="chip live">LIVE NOW</span>` : `${t.timed ? "Timed test" : "Assignment"} · ${t.questions} questions${t.closes_at ? ` · due ${esc(fmtDate(t.closes_at))}` : ""}`}</div></div>
      <button class="btn primary sm" data-pin="${esc(t.pin)}" type="button">${t.kind === "live" ? "Join" : "Start"}</button></li>`).join("")}</ul>`
    : `<p class="muted" style="margin:0">${d.classes.length ? `Nothing due. When a test is set for your ${studentWords().klass} it shows up here.` : `Join your ${studentWords().klass} with the code from your ${studentWords().klass === "course" ? "lecturer" : "teacher"}, and tests they set will show up here.`}</p>`;
  $("#todo").onclick = (e) => { const b = e.target.closest("[data-pin]"); if (b) hooks.joinAs(b.dataset.pin, profile.full_name); };

  $("#hist").innerHTML = d.history.length ? `<div class="scroll-x"><table class="data"><thead><tr><th>Quiz</th><th>Type</th><th>Result</th><th>When</th></tr></thead><tbody>
      ${d.history.map((h) => `<tr><td><strong>${esc(h.title)}</strong></td><td><span class="chip">${h.kind === "live" ? "LIVE GAME" : h.graded ? "CLASS TEST" : "ASSIGNMENT"}</span></td>
        <td class="num">${result(h)}</td><td class="muted">${esc(fmtDate(h.at))}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted" style="margin:0">Your scores will appear here after your first game or test.</p>`;

  $("#classes").innerHTML = d.classes.length ? `<ul class="todo">${d.classes.map((c) => `<li><div><b>${esc(c.name)}</b><div class="muted" style="font-size:13px">${esc(c.teacher)} · No. ${esc(c.student_no)}</div></div>
      <button class="btn ghost sm danger" data-leave="${c.id}" data-name="${esc(c.name)}" type="button">Leave</button></li>`).join("")}</ul>`
    : `<p class="muted" style="margin:0">You haven't joined a ${studentWords().klass} yet.</p>`;
  $("#classes").onclick = async (e) => {
    const b = e.target.closest("[data-leave]"); if (!b) return;
    if (!(await ask(`Leave ${b.dataset.name}? Your past results stay with your teacher.`, `Leave ${studentWords().klass}`, true))) return;
    try { await rpc("leave_class", { p_class: b.dataset.leave }); toast(`Left the ${studentWords().klass}`); loadDash(); } catch (err) { toast(err.message, true); }
  };
}

// Class leaderboard: top 10 and your own place (the teacher can turn it off).
const MEDAL = ["🥇", "🥈", "🥉"];
function loadBoard(classes) {
  const panel = $("#lbPanel"), sel = $("#lbClass");
  if (!classes.length) { panel.hidden = true; return; }
  panel.hidden = false;
  sel.innerHTML = classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  sel.hidden = classes.length < 2;
  const show = async () => {
    const box = $("#lb"); box.innerHTML = `<p class="muted">Loading…</p>`;
    let b;
    try { b = await rpc("class_leaderboard", { p_class: sel.value }); } catch (err) { box.innerHTML = `<p class="status err">${esc(err.message)}</p>`; return; }
    if (!b.enabled) { box.innerHTML = `<p class="muted" style="margin:0">Your teacher has turned off the leaderboard for this class.</p>`; return; }
    if (!b.top.length) { box.innerHTML = `<p class="muted" style="margin:0">No scores yet. The leaderboard fills up as your class takes tests and live games.</p>`; return; }
    const meInTop = b.top.some((r) => r.me);
    box.innerHTML = `<ol class="board">${b.top.map((r) => `<li class="${r.me ? "me" : ""}"><span class="pos">${r.pos <= 3 ? MEDAL[r.pos - 1] : r.pos}</span><span class="nm">${esc(r.name)}${r.me ? " (you)" : ""}</span><span class="sc num">${r.avg}%</span></li>`).join("")}
      ${b.me && !meInTop ? `<li class="me gap"><span class="pos">${b.me.pos}</span><span class="nm">You</span><span class="sc num">${b.me.avg}%</span></li>` : ""}</ol>
      <p class="muted" style="margin:0;font-size:13px">${b.me ? `You're number ${b.me.pos} of ${b.count}, averaged over ${b.me.taken} test${b.me.taken > 1 ? "s" : ""} and games.` : "Take a class test or live game to get on the board."}</p>`;
  };
  sel.onchange = show; show();
}

function result(h) {
  if (h.hide_scores) return `<span class="muted">Hidden</span>`;
  if (h.kind === "assignment") {
    if (!h.finished) return `<span class="chip open">NOT HANDED IN</span>`;
    const p = Math.round(h.score / 10);
    return `<span class="score-pill ${p >= 70 ? "hi" : p >= 50 ? "mid" : "lo"}">${p}%</span>`;
  }
  return `${h.correct}/${h.questions} correct`;
}
