// Teacher home: an overview of everything at a glance, with quick actions,
// what's running now, recent quizzes, class codes for students, and results.
import { sb, q, rpc } from "./sb.js";
import { $, esc, toast, fmtDate } from "./ui.js";
import { ctx, frame, words } from "./shell.js";
import { sampleDialog } from "./samples.js";

const isOpen = (s) => s.kind === "assignment"
  ? s.status === "open" && (!s.closes_at || new Date(s.closes_at) > new Date())
  : s.status !== "ended" && !s.settings?.teams;
const kindName = (s) => s.settings?.teams ? "CLASS TEAMS" : s.kind === "assignment" ? (s.settings?.timeLimitMin ? "TIMED TEST" : "ASSIGNMENT") : s.settings?.audience === "webinar" ? "WEBINAR" : "LIVE GAME";

// Class codes need the newer database; older copies still load the rest of the page.
async function loadClasses() {
  const base = () => sb.from("classes").select("id,name,students(count)").eq("owner_id", ctx.user.id).order("name");
  try { return await q(sb.from("classes").select("id,name,join_code,students(count)").eq("owner_id", ctx.user.id).order("name")); }
  catch { return q(base()); }
}

const step = (done, title, body) => `<li class="${done ? "done" : ""}"><span class="tick" aria-hidden="true">${done ? "✓" : ""}</span><div><b>${title}</b>${done ? ` <span class="chip live">DONE</span>` : ""}<p class="muted" style="margin:2px 0 0;font-size:14px">${body}</p></div></li>`;

export async function overviewView() {
  const w = words();
  const v = frame("home", `<p class="muted">Loading…</p>`);
  const [quizzes, classes, sessions, prof] = await Promise.all([
    q(sb.from("quizzes").select("id,title,updated_at").eq("owner_id", ctx.user.id).order("updated_at", { ascending: false })),
    loadClasses(),
    q(sb.from("sessions").select("id,title,kind,pin,status,created_at,closes_at,settings,players(count)").eq("owner_id", ctx.user.id).order("created_at", { ascending: false }).limit(100)),
    sb.from("profiles").select("full_name").eq("user_id", ctx.user.id).maybeSingle().then((r) => r.data, () => null),
  ]);
  const name = prof?.full_name || ctx.head?.member?.display_name || ctx.user.user_metadata?.full_name || "";
  const h = new Date().getHours(), hello = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const people = (s) => s.players?.[0]?.count ?? 0;
  const learners = classes.reduce((a, c) => a + (c.students?.[0]?.count ?? 0), 0);
  const running = sessions.filter(isOpen), recent = sessions.filter((s) => !isOpen(s)).slice(0, 6);

  v.innerHTML = `
    <div class="page-h"><div><span class="label">Dashboard</span><h1>${hello}${name ? ", " + esc(name) : ""}</h1>
      <p class="muted" style="margin:4px 0 0">${running.length ? `${running.length} session${running.length > 1 ? "s are" : " is"} running right now.` : "Here's everything in one place."}</p></div></div>
    <div class="stat-row">
      <a class="stat link" href="#/quizzes"><span class="label">Quizzes</span><b>${quizzes.length}</b></a>
      <a class="stat link" href="#/classes"><span class="label">${w.Learners} on class lists</span><b>${learners}</b></a>
      <a class="stat link" href="#/sessions"><span class="label">Games &amp; tests run</span><b>${sessions.length}</b></a>
      <a class="stat link" href="#/sessions"><span class="label">Took part</span><b>${sessions.reduce((a, s) => a + people(s), 0)}</b></a>
    </div>
    <div class="quick">
      <a class="go" href="#/new"><b>+ Quiz from your notes</b><span>Upload a PDF, Word file or paste notes</span></a>
      <a href="#/new?blank"><b>Type your own questions</b><span>Build a quiz question by question</span></a>
      <a href="#/quizzes"><b>▶ Play a live game</b><span>Pick a quiz and press Play live</span></a>
      <a href="#" data-sample><b>Try a sample quiz</b><span>Ready-made, play it in a minute</span></a>
    </div>
    ${!quizzes.length || !sessions.length ? `<section class="panel"><h2 class="h2">Getting started</h2><ol class="steps-list">
      ${step(quizzes.length > 0, "Make a quiz", `From your notes, by typing questions, or <a href="#" data-sample>add a sample quiz</a>.`)}
      ${step(sessions.some((s) => s.kind === "live"), "Play it as a live game", `Press <b>▶ Play live</b> on a quiz. Put the host screen on a projector or share it on Zoom; ${w.learners} join on their phones with the PIN. A leaderboard shows after each question and a podium at the end.`)}
      ${step(classes.length > 0, "Add your class", `Create a class list, then give ${w.learners} the class code so tests you set appear on their dashboard.`)}
    </ol></section>` : ""}
    <section class="panel" id="week" hidden></section>
    ${running.length ? `<section class="panel"><div class="spread"><h2 class="h2">Happening now</h2><span class="chip live">● LIVE</span></div>
      <ul class="todo">${running.map((s) => `<li><div><b>${esc(s.title)}</b><div class="muted" style="font-size:13px"><span class="chip">${kindName(s)}</span> PIN <span class="num">${esc(s.pin)}</span> · ${people(s)} joined${s.closes_at ? ` · due ${esc(fmtDate(s.closes_at))}` : ""}</div></div>
        <div class="row">${s.kind === "live" ? `<a class="btn primary sm" href="host.html?s=${s.id}">Host screen</a>` : ""}<a class="btn sm" href="#/report/${s.id}">Results</a></div></li>`).join("")}</ul></section>` : ""}
    <div class="dash">
      <div class="dash-main">
        <section class="panel"><div class="spread"><h2 class="h2">Recent quizzes</h2><a href="#/quizzes" style="font-size:14px">All quizzes →</a></div>
          ${quizzes.length ? `<ul class="todo">${quizzes.slice(0, 5).map((z) => `<li><div><b>${esc(z.title)}</b><div class="muted" style="font-size:13px">Edited ${esc(fmtDate(z.updated_at))}</div></div>
            <div class="row"><a class="btn sm" href="#/edit/${z.id}">Edit</a><a class="btn sm ghost" href="#/print/${z.id}">Print</a></div></li>`).join("")}</ul>`
          : `<div class="empty">No quizzes yet. <a href="#/new">Create your first quiz</a> from your lesson notes.</div>`}</section>
        <section class="panel"><div class="spread"><h2 class="h2">Recent results</h2><a href="#/sessions" style="font-size:14px">All results →</a></div>
          ${recent.length ? `<div class="scroll-x"><table class="data"><tbody>${recent.map((s) => `<tr class="click" data-id="${s.id}" tabindex="0"><td><strong>${esc(s.title)}</strong></td>
            <td><span class="chip">${kindName(s)}</span></td><td class="num">${s.settings?.teams ? s.settings.teams.length + " teams" : people(s) + " took part"}</td><td class="muted">${esc(fmtDate(s.created_at))}</td></tr>`).join("")}</tbody></table></div>`
          : `<p class="muted" style="margin:0">Finished games and tests will show up here.</p>`}</section>
      </div>
      <aside class="dash-side">
        <section class="panel"><h2 class="h2">Class codes</h2>
          <p class="muted" style="margin:0;font-size:14px">${w.Learners} register on the home page and join your class with its code. Tests you set for that class then appear on their dashboard.</p>
          ${classes.length ? `<ul class="todo">${classes.map((c) => `<li><div><a href="#/class/${c.id}"><b>${esc(c.name)}</b></a><div class="muted" style="font-size:13px">${c.students?.[0]?.count ?? 0} ${w.learners}</div></div>
            ${c.join_code ? `<button class="code-pill" data-code="${esc(c.join_code)}" type="button" title="Copy code">${esc(c.join_code)}</button>` : ""}</li>`).join("")}</ul>
            ${classes.some((c) => !c.join_code) ? `<div class="notice">To get class codes, re-run <code>supabase/schema.sql</code> in Supabase → SQL Editor.</div>` : ""}`
          : `<div class="empty" style="padding:18px">No classes yet. <a href="#/classes">Create a class</a></div>`}</section>
        <section class="panel"><h2 class="h2">Share the join page</h2>
          <p class="muted" style="margin:0;font-size:14px">${w.Learners} go here to register, or to join a game with its PIN.</p>
          <div class="row"><code style="overflow-wrap:anywhere">${esc(new URL("../", location.href).href)}</code><button class="btn sm" id="copySite" type="button">Copy</button></div></section>
      </aside>
    </div>`;

  v.querySelectorAll("[data-sample]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); sampleDialog(() => (location.hash = "#/quizzes")); }));
  loadWeek($("#week", v), w);
  const copy = (t, msg) => navigator.clipboard?.writeText(t).then(() => toast(msg), () => toast(t));
  v.querySelectorAll("[data-code]").forEach((b) => (b.onclick = () => copy(b.dataset.code, "Class code copied")));
  $("#copySite", v).onclick = () => copy(new URL("../", location.href).href, "Link copied");
  const open = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) location.hash = "#/report/" + tr.dataset.id; };
  v.querySelectorAll("table.data").forEach((t) => { t.onclick = open; t.onkeydown = (e) => { if (e.key === "Enter") open(e); }; });
}

// "This week": last 7 days against the 7 before (needs the newer database; hidden otherwise).
async function loadWeek(box, w) {
  let d;
  try { d = await rpc("teacher_week", {}); } catch { return; }
  box.hidden = false;
  if (!d.sessions && !d.sessions_prev) {
    box.innerHTML = `<h2 class="h2">This week</h2><p class="muted" style="margin:0">No games or tests in the last two weeks. Press <b>▶ Play live</b> on a quiz, or set an assignment, and your weekly summary appears here.</p>`;
    return;
  }
  const trend = (cur, prev, unit = "") => {
    if (prev == null || (!prev && !cur)) return `<span class="trend flat">no data last week</span>`;
    const diff = (cur ?? 0) - prev;
    return diff > 0 ? `<span class="trend up">▲ ${diff}${unit} on last week</span>` : diff < 0 ? `<span class="trend down">▼ ${-diff}${unit} on last week</span>` : `<span class="trend flat">same as last week</span>`;
  };
  const tile = (label, val, tr) => `<div class="stat"><span class="label">${label}</span><b>${val}</b>${tr}</div>`;
  box.innerHTML = `<div class="spread"><h2 class="h2">This week</h2><span class="muted" style="font-size:13px">Last 7 days</span></div>
    <div class="week">
      ${tile("Games &amp; tests", d.sessions, trend(d.sessions, d.sessions_prev))}
      ${tile("Took part", d.people, trend(d.people, d.people_prev))}
      ${tile("Average score", d.avg == null ? "–" : d.avg + "%", d.avg == null ? "" : trend(d.avg, d.avg_prev, "%"))}
    </div>
    <div class="week" style="align-items:start">
      <div><span class="label">Top ${w.learners}</span>${d.top.length ? `<ol class="board" style="margin-top:8px">${d.top.map((r, i) => `<li><span class="pos">${i + 1}</span><span class="nm">${esc(r.name)}</span><span class="sc num">${r.avg}%</span></li>`).join("")}</ol>` : `<p class="muted" style="margin:6px 0 0;font-size:14px">No scores yet this week.</p>`}</div>
      <div><span class="label">Hardest questions</span>${d.hardest.length ? `<ul class="todo">${d.hardest.map((h) => `<li><div><a href="#/report/${h.session_id}" style="color:inherit"><b>${esc(String(h.question || "").slice(0, 110))}</b></a><div class="muted" style="font-size:13px">${h.pct}% got it right · ${esc(h.title)}</div></div></li>`).join("")}</ul>` : `<p class="muted" style="margin:6px 0 0;font-size:14px">Shows once at least 3 people answer a question.</p>`}</div>
      <div><span class="label">Haven't handed in</span>${d.missing.length ? `<ul class="todo">${d.missing.map((m) => `<li><div><a href="#/report/${m.session_id}" style="color:inherit"><b>${esc(m.title)}</b></a><div class="muted" style="font-size:13px">${m.missing} ${m.missing > 1 ? w.learners : w.learner} on the class list${m.status === "open" && (!m.closes_at || new Date(m.closes_at) > new Date()) ? " · still open" : ""}</div></div></li>`).join("")}</ul>` : `<p class="muted" style="margin:6px 0 0;font-size:14px">Everyone on your class lists has handed in.</p>`}</div>
    </div>`;
}
