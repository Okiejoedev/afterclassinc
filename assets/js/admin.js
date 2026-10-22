// Site owner's console: everyone, every school, every game and test, and the problem reports.
// Only accounts listed in app_admins can open it (every function checks this in the database).
// Pages: #/admin, #/admin/people, #/admin/person/<id>, #/admin/quiz/<id>, #/admin/schools, #/admin/activity, #/admin/reports
import { rpc } from "./sb.js";
import { $, esc, toast, ask, fmtDate } from "./ui.js";
import { frame, sectionBadge, SECTION_NAME, KINDS } from "./shell.js";

const PAGES = [["", "Overview"], ["people", "People"], ["schools", "Schools"], ["activity", "Activity"], ["reports", "Reports"]];
const KIND_NAME = Object.fromEntries(KINDS);
const badge = (sec) => SECTION_NAME[sec] ? sectionBadge(sec) : `<span class="chip">NO SECTION</span>`;
const day = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "never";
const tile = (label, val, sub = "") => `<div class="stat"><span class="label">${label}</span><b>${val}</b>${sub ? `<span class="muted" style="font-size:13px">${sub}</span>` : ""}</div>`;

function shell(page, inner) {
  const v = frame("admin", `
    <div class="page-h"><div><span class="label">Site owner</span><h1>Admin</h1></div></div>
    <nav class="admin-nav" aria-label="Admin pages">${PAGES.map(([k, l]) => `<a href="#/admin${k ? "/" + k : ""}" class="${page === k ? "on" : ""}">${l}</a>`).join("")}</nav>
    <div id="adminBody" style="display:grid;gap:20px">${inner}</div>`);
  return $("#adminBody", v);
}

export async function adminView() {
  const [, , page = "", id = ""] = location.hash.split("?")[0].split("/");
  const known = ["people", "person", "quiz", "schools", "activity", "reports"];
  const p = known.includes(page) ? page : "";
  const body = shell(p === "person" ? "people" : p === "quiz" ? "activity" : p, `<p class="muted">Loading…</p>`);
  try {
    if (p === "people") return await peopleView(body);
    if (p === "person") return await personView(body, id);
    if (p === "quiz") return await quizView(body, id);
    if (p === "schools") return await schoolsView(body);
    if (p === "activity") return await activityView(body);
    if (p === "reports") return await reportsView(body);
    return await overview(body);
  } catch (err) {
    body.innerHTML = `<div class="notice">${esc(/Could not find the function/i.test(err.message) ? "The admin console needs the latest database update. Run supabase/schema.sql in the Supabase SQL Editor." : err.message)}</div>`;
  }
}

/* ---------- overview ---------- */
async function overview(body) {
  const [d, secs] = await Promise.all([rpc("admin_stats", {}), rpc("admin_sections", {})]);
  const open = d.feedback.filter((f) => !f.handled).length;
  const secCard = (k) => {
    const s = secs[k] || { teachers: 0, students: 0, quizzes: 0, sessions: 0 };
    return `<a class="panel admin-sec ${k}" href="#/admin/people?section=${k}"><div class="spread">${badge(k)}<span class="muted" style="font-size:13px">View people →</span></div>
      <div class="admin-nums"><span><b>${s.teachers}</b> ${k === "higher" ? "lecturers" : "teachers"}</span>${k === "primary" ? "" : `<span><b>${s.students}</b> students</span>`}<span><b>${s.quizzes}</b> quizzes</span><span><b>${s.sessions}</b> games &amp; tests</span></div></a>`;
  };
  body.innerHTML = `
    <div class="stat-row">
      ${tile("Accounts", d.accounts, `+${d.signups_7d} this week`)}${tile("Teachers", d.teachers)}${tile("Students", d.students)}
      ${tile("Active teachers", d.active_teachers_7d, "ran a game or test this week")}
    </div>
    <div class="stat-row">
      ${tile("Quizzes", d.quizzes)}${tile("Live games", d.live_games)}${tile("Tests & assignments", d.assignments)}${tile("Took part", d.players, `+${d.players_7d} this week`)}
    </div>
    <h2 class="h2" style="margin:0">By section</h2>
    <div class="sec-grid">${["primary", "secondary", "higher"].map(secCard).join("")}</div>
    ${secs.unset ? `<div class="notice">${secs.unset.teachers + secs.unset.students} account(s) haven't chosen a section yet (registered before sections, or never opened the dashboard). <a href="#/admin/people?section=unset">See them</a></div>` : ""}
    <div class="dash">
      <section class="panel"><div class="spread"><h2 class="h2">Problem reports</h2><a class="chip ${open ? "warn" : ""}" href="#/admin/reports">${open} open</a></div>
        ${d.feedback.slice(0, 5).map((f) => `<div style="${f.handled ? "opacity:.55" : ""}"><div style="white-space:pre-wrap">${esc(f.message.slice(0, 240))}</div><div class="muted" style="font-size:13px">${esc(fmtDate(f.at))}${f.email ? " · " + esc(f.email) : ""}</div></div>`).join("<hr>") || `<p class="muted" style="margin:0">No reports yet.</p>`}
      </section>
      <aside class="dash-side"><section class="panel"><h2 class="h2">Last 14 days</h2>
        <div class="scroll-x"><table class="data"><thead><tr><th>Day</th><th>Sign-ups</th><th>Games &amp; tests</th></tr></thead><tbody>
          ${d.by_day.slice().reverse().map((r) => `<tr><td>${esc(new Date(r.day).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }))}</td><td class="num">${r.signups}</td><td class="num">${r.sessions}</td></tr>`).join("")}</tbody></table></div>
        <p class="muted" style="margin:0;font-size:13px">${d.classes} class lists · <a href="#/admin/schools">${d.schools} school accounts</a></p></section></aside>
    </div>`;
}

/* ---------- people ---------- */
async function peopleView(body) {
  const qs = new URLSearchParams(location.hash.split("?")[1] || "");
  const f = { q: qs.get("q") || "", section: qs.get("section") || "", role: qs.get("role") || "" };
  body.innerHTML = `
    <form class="panel admin-filter" id="pf">
      <div class="field"><label class="label" for="pq">Search</label><input id="pq" type="search" placeholder="Email, name or matric / admission number" value="${esc(f.q)}"></div>
      <div class="field"><label class="label" for="ps">Section</label><select id="ps"><option value="">All sections</option>${[["primary", "Primary"], ["secondary", "Secondary"], ["higher", "Higher"], ["unset", "No section yet"]].map(([k, l]) => `<option value="${k}" ${f.section === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label class="label" for="pr">Role</label><select id="pr"><option value="">Teachers and students</option><option value="teacher" ${f.role === "teacher" ? "selected" : ""}>Teachers / lecturers</option><option value="student" ${f.role === "student" ? "selected" : ""}>Students</option></select></div>
      <button class="btn primary" type="submit">Search</button>
    </form>
    <section class="panel" id="plist"><p class="muted">Loading…</p></section>`;
  $("#pf", body).onsubmit = (e) => {
    e.preventDefault();
    const n = new URLSearchParams(Object.entries({ q: $("#pq", body).value.trim(), section: $("#ps", body).value, role: $("#pr", body).value }).filter(([, x]) => x));
    location.hash = "#/admin/people" + (n.toString() ? "?" + n : "");
  };
  const rows = await rpc("admin_people", { p_q: f.q, p_section: f.section, p_role: f.role, p_limit: 500 });
  $("#plist", body).innerHTML = `<div class="spread"><h2 class="h2">${rows.length} ${rows.length === 1 ? "person" : "people"}</h2>${rows.length >= 500 ? `<span class="muted" style="font-size:13px">Showing the newest 500. Search to narrow down.</span>` : ""}</div>
    ${rows.length ? `<div class="scroll-x"><table class="data"><thead><tr><th>Name</th><th>Role</th><th>Section</th><th>School</th><th>Registered</th><th>Last sign-in</th><th>Activity</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.name || "—")}</b>${r.is_admin ? ` <span class="chip open">ADMIN</span>` : ""}<div class="muted" style="font-size:13px">${esc(r.email)}${r.confirmed ? "" : " · <span class=\"warn-text\">email not confirmed</span>"}</div></td>
        <td>${r.role === "student" ? "Student" : "Teacher"}${r.student_no ? `<div class="muted" style="font-size:13px">${esc(r.student_no)}</div>` : ""}</td>
        <td>${badge(r.section)}${r.role !== "student" && r.kind && r.section === "higher" ? `<div class="muted" style="font-size:13px">${esc(KIND_NAME[r.kind] || r.kind)}</div>` : ""}</td>
        <td>${esc(r.school || "")}</td><td>${day(r.created_at)}</td><td>${day(r.last_sign_in_at)}</td>
        <td class="muted" style="font-size:13px">${r.role === "student" ? `${r.joined} class${r.joined === 1 ? "" : "es"}` : [[r.quizzes, "quiz", "quizzes"], [r.classes, "class", "classes"], [r.sessions, "game/test", "games/tests"]].map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(" · ")}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted" style="margin:0">Nobody matches.</p>`}`;
  $("#plist", body).onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) location.hash = "#/admin/person/" + tr.dataset.id; };
}

async function personView(body, id) {
  const d = await rpc("admin_person", { p_user: id });
  const p = d.person;
  if (!p) { body.innerHTML = `<div class="notice">That account doesn't exist any more.</div>`; return; }
  const stu = p.role === "student";
  const kindOpts = stu ? [["secondary", "Secondary"], ["higher", "Higher"]] : KINDS.map(([k, l]) => [k, `${SECTION_NAME[{ primary: "primary", secondary: "secondary" }[k] || "higher"]} · ${l}`]);
  const current = stu ? p.section : p.kind;
  const list = (items, empty, row) => items.length ? `<ul class="todo">${items.map(row).join("")}</ul>` : `<p class="muted" style="margin:0">${empty}</p>`;
  body.innerHTML = `
    <a href="#/admin/people" style="font-size:14px">← People</a>
    <section class="panel"><div class="spread"><div><h2 style="font-size:26px;margin:0">${esc(p.name || p.email)}</h2>
        <p class="muted" style="margin:4px 0 0">${esc(p.email)} · ${stu ? "Student" : "Teacher"}${p.student_no ? " · " + esc(p.student_no) : ""} · registered ${day(p.created_at)} · last signed in ${day(p.last_sign_in_at)}${p.confirmed ? "" : " · email not confirmed"}</p></div>
        <div class="row">${badge(p.section)}${p.is_admin ? `<span class="chip open">ADMIN</span>` : ""}</div></div>
      ${d.school ? `<p style="margin:0">School account: <b>${esc(d.school.name)}</b> (${esc(d.school.role)}${d.school.department ? ", " + esc(d.school.department) : ""})</p>` : d.profile?.name ? `<p style="margin:0">School on papers: <b>${esc(d.profile.name)}</b></p>` : ""}
      <div class="row" style="align-items:end">
        <div class="field"><label class="label" for="mvKind">${stu ? "Section" : "Section and institution type"}</label><select id="mvKind">${!current ? `<option value="">Not chosen</option>` : ""}${kindOpts.map(([k, l]) => `<option value="${k}" ${current === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
        <button class="btn" id="mvGo" type="button">Move</button>
        <button class="btn ${p.is_admin ? "ghost danger" : "ghost"}" id="adm" type="button">${p.is_admin ? "Remove admin access" : "Make admin"}</button>
        <a class="btn ghost" href="mailto:${esc(p.email)}">Email</a>
      </div>
      ${d.school && !stu ? `<p class="muted" style="margin:0;font-size:13px">Moving this teacher also moves their whole school account, <b>${esc(d.school.name)}</b>.</p>` : ""}
    </section>
    <div class="dash">
      <div style="display:grid;gap:20px;align-content:start">
        ${stu ? `<section class="panel"><h2 class="h2">Classes joined</h2>${list(d.joined, "Not in any class yet.", (c) => `<li><div><b>${esc(c.name)}</b><div class="muted" style="font-size:13px">as ${esc(c.student_no)} · teacher ${esc(c.teacher || "")}</div></div></li>`)}
            <p class="muted" style="margin:0;font-size:13px">${d.practice} practice runs</p></section>` : `
          <section class="panel"><h2 class="h2">Quizzes (${d.quizzes.length})</h2>${list(d.quizzes, "No quizzes yet.", (x) => `<li><div><a href="#/admin/quiz/${x.id}"><b>${esc(x.title)}</b></a><div class="muted" style="font-size:13px">${x.n} questions · edited ${esc(fmtDate(x.updated_at))}${x.review_status !== "draft" ? " · " + esc(x.review_status) : ""}</div></div></li>`)}</section>
          <section class="panel"><h2 class="h2">Games and tests (${d.sessions.length})</h2>${list(d.sessions, "None yet.", (s) => `<li><div><b>${esc(s.title)}</b><div class="muted" style="font-size:13px">${s.kind === "live" ? "Live game" : "Test / assignment"} · ${s.players} took part · ${esc(fmtDate(s.created_at))}</div></div></li>`)}</section>`}
      </div>
      <aside class="dash-side">
        ${stu ? "" : `<section class="panel"><h2 class="h2">Classes (${d.classes.length})</h2>${list(d.classes, "No class lists.", (c) => `<li><div><b>${esc(c.name)}</b><div class="muted" style="font-size:13px">${c.students} on the list${c.join_code ? " · code " + esc(c.join_code) : ""}</div></div></li>`)}</section>`}
        <section class="panel"><h2 class="h2">Their problem reports</h2>${list(d.feedback, "None.", (f) => `<li style="${f.handled ? "opacity:.55" : ""}"><div><div style="white-space:pre-wrap">${esc(f.message)}</div><div class="muted" style="font-size:13px">${esc(fmtDate(f.created_at))}</div></div></li>`)}</section>
      </aside>
    </div>`;
  $("#mvGo", body).onclick = async () => {
    const k = $("#mvKind", body).value;
    if (!k || k === current) return toast("Choose a different section first", true);
    if (!(await ask(`Move ${p.email} to ${$("#mvKind", body).selectedOptions[0].textContent}? Their dashboard changes the next time they open it.`, "Move"))) return;
    try { await rpc("admin_set_kind", { p_user: p.id, p_kind: k }); toast("Moved"); adminView(); } catch (err) { toast(err.message, true); }
  };
  $("#adm", body).onclick = async () => {
    if (!(await ask(p.is_admin ? `Remove ${p.email}'s admin access?` : `Give ${p.email} full admin access? They will see every account and quiz.`, p.is_admin ? "Remove" : "Make admin", p.is_admin))) return;
    try { await rpc("admin_set_admin", { p_user: p.id, p_on: !p.is_admin }); toast("Updated"); adminView(); } catch (err) { toast(err.message, true); }
  };
}

/* ---------- one quiz, read-only ---------- */
async function quizView(body, id) {
  const qz = await rpc("admin_quiz", { p_id: id });
  if (!qz) { body.innerHTML = `<div class="notice">That quiz doesn't exist any more.</div>`; return; }
  const ans = (x) => x.type === "mcq" || x.type === "tf"
    ? `<ol type="A" style="margin:6px 0 0">${(x.options || []).map((o, i) => `<li style="${i === x.answer ? "font-weight:700;color:var(--good)" : ""}">${esc(o)}${i === x.answer ? " ✓" : ""}</li>`).join("")}</ol>`
    : x.answer ? `<p class="muted" style="margin:6px 0 0">Model answer: ${esc(x.answer)}</p>` : "";
  body.innerHTML = `
    <a href="#/admin/person/${qz.owner_id}" style="font-size:14px">← ${esc(qz.owner_email || "Owner")}</a>
    <section class="panel"><h2 style="font-size:24px;margin:0">${esc(qz.title)}</h2>
      <p class="muted" style="margin:0">${qz.questions.length} questions · created ${esc(fmtDate(qz.created_at))} · edited ${esc(fmtDate(qz.updated_at))}</p>
      <ol style="display:grid;gap:14px;margin:8px 0 0;padding-left:22px">${qz.questions.map((x) => `<li><div>${esc(x.question)}</div>${ans(x)}</li>`).join("")}</ol></section>
    ${qz.notes ? `<details class="panel"><summary><b>Notes it was made from</b></summary><div style="white-space:pre-wrap;margin-top:10px;font-size:14px">${esc(qz.notes)}</div></details>` : ""}`;
}

/* ---------- schools ---------- */
async function schoolsView(body) {
  const rows = await rpc("admin_schools", {});
  body.innerHTML = `<section class="panel"><h2 class="h2">${rows.length} school account${rows.length === 1 ? "" : "s"}</h2>
    <p class="muted" style="margin:0;font-size:14px">Teachers without a school account keep their own heading and appear only under People.</p>
    ${rows.length ? `<div class="scroll-x"><table class="data"><thead><tr><th>School</th><th>Section</th><th>Teachers</th><th>Quizzes</th><th>Created</th></tr></thead><tbody>
      ${rows.map((s) => `<tr><td><b>${esc(s.name)}</b><div class="muted" style="font-size:13px">code ${esc(s.join_code)}${s.require_approval ? " · HOD approval on" : ""}</div></td>
        <td>${badge(s.section)}<div class="muted" style="font-size:13px">${esc(KIND_NAME[s.kind] || s.kind)}</div></td>
        <td>${s.members.map((m) => `<div><a href="#/admin/person/${m.user_id}">${esc(m.name || m.email)}</a> <span class="muted" style="font-size:12px">${esc(m.role)}${m.department ? " · " + esc(m.department) : ""}</span></div>`).join("")}</td>
        <td class="num">${s.quizzes}</td><td>${day(s.created_at)}</td></tr>`).join("")}
    </tbody></table></div>` : ""}</section>`;
}

/* ---------- activity ---------- */
async function activityView(body) {
  const d = await rpc("admin_activity", { p_limit: 150 });
  body.innerHTML = `
    <section class="panel"><h2 class="h2">Latest games and tests</h2>
      ${d.sessions.length ? `<div class="scroll-x"><table class="data"><thead><tr><th>Title</th><th>Type</th><th>Teacher</th><th>Section</th><th>Took part</th><th>When</th></tr></thead><tbody>
        ${d.sessions.map((s) => `<tr><td><b>${esc(s.title)}</b>${s.class_name ? `<div class="muted" style="font-size:13px">${esc(s.class_name)}</div>` : ""}</td>
          <td>${s.kind === "live" ? "Live game" : "Test"}${s.status === "ended" || s.status === "closed" ? "" : ` <span class="chip live">${esc(s.status.toUpperCase())}</span>`}</td>
          <td><a href="#/admin/person/${s.owner_id}">${esc(s.owner_email || "")}</a></td><td>${badge(s.section)}</td><td class="num">${s.players}</td><td>${esc(fmtDate(s.created_at))}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted" style="margin:0">No games or tests yet.</p>`}</section>
    <section class="panel"><h2 class="h2">Latest quizzes</h2>
      ${d.quizzes.length ? `<div class="scroll-x"><table class="data"><thead><tr><th>Quiz</th><th>Questions</th><th>Teacher</th><th>Section</th><th>Edited</th></tr></thead><tbody>
        ${d.quizzes.map((x) => `<tr><td><a href="#/admin/quiz/${x.id}"><b>${esc(x.title)}</b></a></td><td class="num">${x.n}</td>
          <td><a href="#/admin/person/${x.owner_id}">${esc(x.owner_email || "")}</a></td><td>${badge(x.section)}</td><td>${esc(fmtDate(x.updated_at))}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted" style="margin:0">No quizzes yet.</p>`}</section>`;
}

/* ---------- problem reports ---------- */
async function reportsView(body) {
  const d = await rpc("admin_stats", {});
  const open = d.feedback.filter((f) => !f.handled);
  body.innerHTML = `<section class="panel"><div class="spread"><h2 class="h2">Problem reports</h2><span class="chip ${open.length ? "warn" : ""}">${open.length} open</span></div>
    ${d.feedback.length ? `<ul class="todo" id="fb">${d.feedback.map((f) => `<li data-id="${f.id}" style="${f.handled ? "opacity:.55" : ""}"><div>
        <div style="white-space:pre-wrap">${esc(f.message)}</div>
        <div class="muted" style="font-size:13px">${esc(fmtDate(f.at))}${f.email ? " · " + esc(f.email) : ""}${f.contact ? " · reply to: <b>" + esc(f.contact) + "</b>" : ""}${f.page ? " · on " + esc(f.page) : ""}</div></div>
        <button class="btn sm ${f.handled ? "ghost" : ""}" data-done="${f.handled ? 0 : 1}" type="button">${f.handled ? "Reopen" : "Mark done"}</button></li>`).join("")}</ul>`
      : `<p class="muted" style="margin:0">No reports yet. People send them with “Report a problem” at the bottom of every page.</p>`}
  </section>`;
  $("#fb", body)?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-done]"); if (!b) return;
    try { await rpc("admin_feedback_done", { p_id: +b.closest("li").dataset.id, p_done: b.dataset.done === "1" }); adminView(); }
    catch (err) { toast(err.message, true); }
  });
}
