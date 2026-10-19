// Home page: what everyone sees first. Register / sign in as a student or a
// teacher, a quick "Have a game PIN?" box, and the student dashboard.
// student.js passes in how to start a game: { pin(pin), joinAs(pin, name) }.
import { sb, friendly, rpc, q } from "./sb.js";
import { $, esc, toast, ask, dialog, fmtDate, LOGO } from "./ui.js";

const app = $("#app");
let hooks = {}, user = null, profile = null;

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
  const fallback = { role: meta.role === "student" ? "student" : "teacher", full_name: meta.full_name || "", student_no: meta.student_no || "" };
  try { return (await q(sb.from("profiles").select("role,full_name,student_no").eq("user_id", user.id).maybeSingle())) || fallback; }
  catch { return fallback; }
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
        <p class="lead">Teachers turn lesson notes into live quiz games, timed online tests and printed exams. Students join, play, and keep track of every score.</p>
        ${teacher ? `<p class="muted" style="margin:0">You're signed in as a teacher (${esc(user.email)}).</p>` : `<div class="row">
          <button class="btn primary big" data-auth="up" data-role="student" type="button">I'm a student</button>
          <button class="btn big" data-auth="up" data-role="teacher" type="button">I'm a teacher</button></div>
          <p class="muted" style="margin:0;font-size:14px">Already registered? <a href="#" data-auth="in">Sign in</a></p>`}
      </div>
      <div class="hero-side">${pinBox()}<p class="muted" style="margin:0;font-size:13px;text-align:center">Joining a game doesn't need an account.</p></div>
    </section>
    <section class="roles">
      <article class="role-card">
        <span class="role-ic" aria-hidden="true">A</span><h2>For students</h2>
        <ul><li>Join your teacher's class once with a class code</li><li>See every test and assignment your classes set</li><li>Jump into live games without typing your name</li><li>Track your scores over the term</li></ul>
        ${teacher ? "" : `<div class="row"><button class="btn primary" data-auth="up" data-role="student" type="button">Register as a student</button><button class="btn ghost" data-auth="in" type="button">Sign in</button></div>`}
      </article>
      <article class="role-card">
        <span class="role-ic t" aria-hidden="true">B</span><h2>For teachers</h2>
        <ul><li>Upload notes (PDF, Word) and get questions written for you</li><li>Run live games, class teams, assignments and CBT tests</li><li>Print exam papers with your school heading</li><li>Class lists, marking and results in one place</li></ul>
        ${teacher ? `<a class="btn primary" href="teacher/">Open your dashboard</a>` : `<div class="row"><button class="btn primary" data-auth="up" data-role="teacher" type="button">Register as a teacher</button><button class="btn ghost" data-auth="in" type="button">Sign in</button></div>`}
      </article>
    </section>
    <section class="steps" aria-label="How it works">
      <div><b>1</b><h3>Teacher makes a quiz</h3><p class="muted">From notes, past questions or scratch.</p></div>
      <div><b>2</b><h3>Students join</h3><p class="muted">With a game PIN, or from their dashboard.</p></div>
      <div><b>3</b><h3>Everyone sees results</h3><p class="muted">Scores, corrections and reports straight away.</p></div>
    </section>
    <footer class="home-foot"><a href="privacy.html">Privacy notice</a><span>Afterclass</span></footer>
  </div>`;
  bindPin();
  app.querySelectorAll("[data-auth]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); authDialog(b.dataset.auth, b.dataset.role || "student"); }));
  $("#out")?.addEventListener("click", signOut);
}

async function signOut() { await sb.auth.signOut(); home(); }

/* ================= sign in / register ================= */
function authDialog(mode = "in", role = "student") {
  const up = mode === "up", reset = mode === "reset", stu = role === "student";
  const d = dialog(`<form id="authForm" style="display:grid;gap:12px">
    <div class="spread"><h2 style="font-size:24px">${up ? (stu ? "Register as a student" : "Register as a teacher") : reset ? "Reset your password" : "Sign in"}</h2>
      <button class="btn ghost sm" type="button" data-x aria-label="Close">✕</button></div>
    ${up ? `<div class="seg" role="radiogroup" aria-label="I am a">
        <button type="button" role="radio" aria-checked="${stu}" data-role="student">Student</button>
        <button type="button" role="radio" aria-checked="${!stu}" data-role="teacher">Teacher</button></div>
      <div class="field"><label class="label" for="aName">Full name</label><input id="aName" type="text" maxlength="80" autocomplete="name" required placeholder="${stu ? "As your school has it, e.g. Okafor Adaeze" : "e.g. Mrs. Bello"}"></div>
      ${stu ? `<div class="field"><label class="label" for="aNo">Admission / matric number <span style="text-transform:none;letter-spacing:0">(optional)</span></label><input id="aNo" type="text" maxlength="40" autocomplete="off"></div>` : ""}` : ""}
    <div class="field"><label class="label" for="aEmail">Email</label><input id="aEmail" type="email" autocomplete="email" required></div>
    ${reset ? "" : `<div class="field"><label class="label" for="aPw">Password</label><input id="aPw" type="password" minlength="8" autocomplete="${up ? "new-password" : "current-password"}" required>${up ? `<small class="muted">At least 8 characters.</small>` : ""}</div>`}
    <button class="btn primary big" type="submit" id="aGo">${up ? "Create account" : reset ? "Send reset link" : "Sign in"}</button>
    <div class="status" id="aStatus" role="status"></div>
    <div class="spread" style="font-size:14px">${mode === "in"
      ? `<a href="#" data-mode="up">Create an account</a><a href="#" data-mode="reset">Forgot password?</a>`
      : `<a href="#" data-mode="in">I already have an account</a>`}</div></form>`);
  d.querySelector("[data-x]").onclick = () => d.close();
  d.querySelectorAll("[data-mode]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); d.close(); authDialog(a.dataset.mode, role); }));
  d.querySelectorAll(".seg [data-role]").forEach((b) => (b.onclick = () => { d.close(); authDialog("up", b.dataset.role); }));
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
        const meta = { role, full_name, ...(stu ? { student_no: ($("#aNo", d)?.value || "").trim() } : {}) };
        const back = new URL(stu ? "./" : "teacher/", location.href).href;
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
async function studentDash(msg = "") {
  const first = profile.full_name || user.email.split("@")[0];
  app.innerHTML = `<div class="home-wrap">
    ${header(`<span class="who-chip">${esc(profile.full_name || user.email)}</span><button class="btn ghost" id="out" type="button">Sign out</button>`)}
    ${msg ? `<div class="notice">${esc(msg)}</div>` : ""}
    <div class="page-h"><div><span class="label">Student dashboard</span><h1>Hi, ${esc(first)}</h1></div></div>
    <div class="stat-row" id="stats">${["Games & tests", "Average test score", "Classes", "To do"].map((l) => `<div class="stat"><span class="label">${l}</span><b>–</b></div>`).join("")}</div>
    <div class="dash">
      <div class="dash-main">
        <section class="panel"><div class="spread"><h2 class="h2">Join a game</h2></div>${pinBox("dashPin")}</section>
        <section class="panel"><h2 class="h2">To do</h2><div id="todo"><p class="muted">Loading…</p></div></section>
        <section class="panel"><h2 class="h2">Recent results</h2><div id="hist"><p class="muted">Loading…</p></div></section>
      </div>
      <aside class="dash-side">
        <section class="panel"><h2 class="h2">My classes</h2><div id="classes"><p class="muted">Loading…</p></div>
          <form id="joinClass" style="display:grid;gap:10px;border-top:1px solid var(--line);padding-top:14px" autocomplete="off">
            <div class="field"><label class="label" for="cCode">Join a class</label><input id="cCode" type="text" maxlength="12" placeholder="Class code from your teacher" required style="text-transform:uppercase;font-family:var(--f-mono);letter-spacing:.1em"></div>
            <button class="btn primary" type="submit">Join class</button><p class="status" id="cStatus" role="status"></p></form></section>
        <section class="panel"><h2 class="h2">Profile</h2>
          <form id="prof" style="display:grid;gap:10px">
            <div class="field"><label class="label" for="pName">Full name</label><input id="pName" type="text" maxlength="80" required value="${esc(profile.full_name)}"></div>
            <div class="field"><label class="label" for="pNo">Admission / matric number</label><input id="pNo" type="text" maxlength="40" value="${esc(profile.student_no)}"></div>
            <div class="row"><button class="btn" type="submit">Save</button><span class="muted" style="font-size:13px">${esc(user.email)}</span></div></form></section>
      </aside>
    </div>
    <footer class="home-foot"><a href="privacy.html">Privacy notice</a><span>Afterclass</span></footer>
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
    ["#todo", "#hist", "#classes"].forEach((s) => ($(s).innerHTML = `<p class="status err">${esc(missing ? "Student accounts aren't switched on yet. Ask your teacher (or the site owner) to re-run supabase/schema.sql." : err.message)}</p>`));
    return;
  }
  const graded = d.history.filter((h) => h.kind === "assignment" && h.finished && !h.hide_scores);
  const avg = graded.length ? Math.round(graded.reduce((a, h) => a + h.score / 10, 0) / graded.length) + "%" : "–";
  $("#stats").innerHTML = [["Games & tests", d.history.length], ["Average test score", avg], ["Classes", d.classes.length], ["To do", d.todo.length]]
    .map(([l, v]) => `<div class="stat"><span class="label">${l}</span><b>${v}</b></div>`).join("");

  $("#todo").innerHTML = d.todo.length ? `<ul class="todo">${d.todo.map((t) => `<li>
      <div><b>${esc(t.title)}</b><div class="muted" style="font-size:13px">${esc(t.class)} · ${t.kind === "live" ? `<span class="chip live">LIVE NOW</span>` : `${t.timed ? "Timed test" : "Assignment"} · ${t.questions} questions${t.closes_at ? ` · due ${esc(fmtDate(t.closes_at))}` : ""}`}</div></div>
      <button class="btn primary sm" data-pin="${esc(t.pin)}" type="button">${t.kind === "live" ? "Join" : "Start"}</button></li>`).join("")}</ul>`
    : `<p class="muted" style="margin:0">${d.classes.length ? "Nothing due. When your teacher sets a test for your class it shows up here." : "Join your class with the code from your teacher, and tests they set will show up here."}</p>`;
  $("#todo").onclick = (e) => { const b = e.target.closest("[data-pin]"); if (b) hooks.joinAs(b.dataset.pin, profile.full_name); };

  $("#hist").innerHTML = d.history.length ? `<div class="scroll-x"><table class="data"><thead><tr><th>Quiz</th><th>Type</th><th>Result</th><th>When</th></tr></thead><tbody>
      ${d.history.map((h) => `<tr><td><strong>${esc(h.title)}</strong></td><td><span class="chip">${h.kind === "live" ? "LIVE GAME" : h.graded ? "CLASS TEST" : "ASSIGNMENT"}</span></td>
        <td class="num">${result(h)}</td><td class="muted">${esc(fmtDate(h.at))}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted" style="margin:0">Your scores will appear here after your first game or test.</p>`;

  $("#classes").innerHTML = d.classes.length ? `<ul class="todo">${d.classes.map((c) => `<li><div><b>${esc(c.name)}</b><div class="muted" style="font-size:13px">${esc(c.teacher)} · No. ${esc(c.student_no)}</div></div>
      <button class="btn ghost sm danger" data-leave="${c.id}" data-name="${esc(c.name)}" type="button">Leave</button></li>`).join("")}</ul>`
    : `<p class="muted" style="margin:0">You haven't joined a class yet.</p>`;
  $("#classes").onclick = async (e) => {
    const b = e.target.closest("[data-leave]"); if (!b) return;
    if (!(await ask(`Leave ${b.dataset.name}? Your past results stay with your teacher.`, "Leave class", true))) return;
    try { await rpc("leave_class", { p_class: b.dataset.leave }); toast("Left the class"); loadDash(); } catch (err) { toast(err.message, true); }
  };
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
