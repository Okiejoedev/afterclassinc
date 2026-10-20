// Results: list of games/assignments, detailed reports (marking written answers,
// absentees, CSV, certificates, Q&A), and HOD reviews of colleagues' quizzes.
import { sb, q, rpc } from "./sb.js";
import { $, esc, rt, LET, TYPE_NAME, toast, ask, dialog, fmtDate, pct, csvCell, downloadFile, renderMath, qimg, waButton } from "./ui.js";
import { ctx, frame, words, statusChip } from "./shell.js";
import { headerHTML } from "./exam.js";

const SITE = new URL("../", location.href).href;
const weight = (x) => (x.type === "poll" || x.type === "word" ? 0 : Number(x.marks) > 0 ? Number(x.marks) : 1);
const gradable = (x) => x.type !== "poll" && x.type !== "word";

/* ================= list ================= */
export async function sessionsView() {
  const v = frame("sessions", `<div class="page-h"><div><span class="label">History</span><h1>Results</h1></div></div><div id="list"><p class="muted">Loading…</p></div>`);
  const rows = await q(sb.from("sessions").select("id,title,kind,pin,status,created_at,closes_at,class_id,settings,players(count)").eq("owner_id", ctx.user.id).order("created_at", { ascending: false }).limit(300));
  const box = $("#list", v);
  if (!rows.length) { box.innerHTML = `<div class="empty">Nothing here yet. Start a live game, class teams or an assignment from <a href="#/quizzes">Quizzes</a>.</div>`; return; }
  box.innerHTML = `<div class="panel scroll-x" style="padding:6px 8px"><table class="data"><thead><tr><th>Quiz</th><th>Type</th><th>PIN</th><th>Status</th><th>People</th><th>Started</th></tr></thead><tbody>
    ${rows.map((s) => `<tr class="click" data-id="${s.id}" tabindex="0"><td><strong>${esc(s.title)}</strong></td><td>${kindChip(s)}</td>
      <td class="num">${s.settings?.teams ? "–" : s.pin}</td><td>${sessionStatus(s)}</td><td class="num">${s.settings?.teams ? s.settings.teams.length + " teams" : s.players?.[0]?.count ?? 0}</td><td class="muted">${fmtDate(s.created_at)}</td></tr>`).join("")}</tbody></table></div>`;
  const open = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) location.hash = "#/report/" + tr.dataset.id; };
  box.onclick = open; box.onkeydown = (e) => { if (e.key === "Enter") open(e); };
}
function kindChip(s) {
  if (s.settings?.teams) return `<span class="chip">CLASS TEAMS</span>`;
  if (s.kind === "assignment") return `<span class="chip">${s.settings?.timeLimitMin ? "TIMED TEST" : "ASSIGNMENT"}</span>${s.class_id ? ` <span class="chip">CLASS LIST</span>` : ""}`;
  return `<span class="chip">${s.settings?.audience === "webinar" ? "WEBINAR" : "LIVE GAME"}</span>`;
}
function sessionStatus(s) {
  if (s.kind === "assignment") {
    const open = s.status === "open" && (!s.closes_at || new Date(s.closes_at) > new Date());
    return open ? `<span class="chip open">OPEN${s.closes_at ? " · DUE " + esc(fmtDate(s.closes_at).toUpperCase()) : ""}</span>` : `<span class="chip">CLOSED</span>`;
  }
  return s.status === "ended" ? `<span class="chip">FINISHED</span>` : `<span class="chip live">IN PROGRESS</span>`;
}

/* ================= report ================= */
export async function reportView(id) {
  const v = frame("sessions", `<p class="muted">Loading results…</p>`);
  const s = await q(sb.from("sessions").select("*").eq("id", id).maybeSingle());
  if (!s) { v.innerHTML = `<div class="notice">That session no longer exists. <a href="#/sessions">Back</a></div>`; return; }
  if (s.settings?.teams) return teamReport(v, s);
  const web = s.settings?.audience === "webinar", w = words(web ? "training" : ctx.kind);
  const [players, answers, roster, aqs, runs] = await Promise.all([
    q(sb.from("players").select("id,nickname,score,correct,finished_at,started_at,joined_at,email,flags,student_id").eq("session_id", id).order("score", { ascending: false })),
    q(sb.from("answers").select("id,player_id,q_index,choice,text_answer,is_correct,credit,points,ms,reviewed").eq("session_id", id).limit(50000)),
    s.class_id ? q(sb.from("students").select("id,student_no,full_name").eq("class_id", s.class_id).order("full_name")) : Promise.resolve([]),
    s.kind === "live" ? q(sb.from("audience_questions").select("*").eq("session_id", id).order("votes", { ascending: false })) : Promise.resolve([]),
    s.quiz_id ? q(sb.from("sessions").select("id,kind,created_at,settings,players(count)").eq("quiz_id", s.quiz_id).neq("id", id).order("created_at", { ascending: false }).limit(8)) : Promise.resolve([]),
  ]);
  const Q = s.questions, totalW = Q.reduce((t, x) => t + weight(x), 0);
  const byPlayer = {}; answers.forEach((a) => (byPlayer[a.player_id] ||= []).push(a));
  const got = (pid) => (byPlayer[pid] || []).reduce((t, a) => t + Number(a.credit) * weight(Q[a.q_index] || {}), 0);
  const mark = (pid) => pct(got(pid), totalW);
  const counted = s.kind === "assignment" ? players.filter((p) => p.finished_at) : players;
  const avg = counted.length && totalW ? Math.round(counted.reduce((t, p) => t + mark(p.id), 0) / counted.length) : 0;
  const needReview = answers.filter((a) => !a.reviewed).length;
  const perQ = Q.map((x, i) => {
    const as = answers.filter((a) => a.q_index === i);
    const right = as.reduce((t, a) => t + Number(a.credit), 0);
    const wrong = {}; as.filter((a) => !a.is_correct && a.choice != null).forEach((a) => (wrong[a.choice] = (wrong[a.choice] || 0) + 1));
    const top = Object.entries(wrong).sort((a, b) => b[1] - a[1])[0];
    let extra = "";
    if (x.type === "poll") extra = x.options.map((o, k) => `${LET[k]}. ${esc(o)}: <b>${as.filter((a) => a.choice === k).length}</b>`).join(" · ");
    if (x.type === "word") { const c = {}; as.forEach((a) => a.text_answer && (c[a.text_answer] = (c[a.text_answer] || 0) + 1)); extra = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => `${esc(t)} (${n})`).join(", "); }
    return { x, i, n: as.length, rate: as.length && gradable(x) ? Math.round((100 * right) / as.length) : null, trap: top && x.options ? `${LET[top[0]]}. ${esc(x.options[top[0]])} (${top[1]})` : "", extra, pending: as.filter((a) => !a.reviewed).length };
  });
  const hardest = perQ.filter((p) => p.rate != null).sort((a, b) => a.rate - b.rate)[0];
  const isOpen = s.kind === "assignment" ? s.status === "open" : s.status !== "ended";
  const link = `${SITE}?pin=${s.pin}`;
  const joinedIds = new Set(players.map((p) => p.student_id).filter(Boolean));
  const absent = roster.filter((st) => !joinedIds.has(st.id));
  const studentNo = Object.fromEntries(roster.map((st) => [st.id, st.student_no]));
  const showTabs = s.kind === "assignment";
  const shorts = perQ.filter((p) => p.x.type === "short" && p.n);

  v.innerHTML = `
    <div class="page-h"><div><a href="#/sessions" style="font-size:14px">← Results</a><h1>${esc(s.title)}</h1>
      <div class="row muted" style="font-size:14px;margin-top:6px">${kindChip(s)}${sessionStatus(s)}<span>PIN <b class="num">${s.pin}</b></span><span>${fmtDate(s.created_at)}</span>${s.settings?.timeLimitMin ? `<span>${s.settings.timeLimitMin} min limit</span>` : ""}<span>Answers shown: ${{ close: "after the deadline", submit: "on submit", never: "never" }[s.answer_reveal] || "after the deadline"}</span></div></div>
      <div class="row">
        ${s.kind === "live" && isOpen ? `<a class="btn primary" href="host.html?s=${s.id}">Open host screen</a>` : ""}
        ${s.kind === "assignment" ? `<button class="btn" id="copyLink" type="button">Copy link</button>${waButton(`${s.title} on Afterclass: open ${link} (PIN ${s.pin})${s.closes_at ? `. Closes ${fmtDate(s.closes_at)}` : ""}.`)}<button class="btn" id="toggle" type="button">${isOpen ? "Close now" : "Reopen"}</button>` : ""}
        <button class="btn" id="csv" type="button" ${players.length ? "" : "disabled"}>Download CSV</button>
        ${players.length && (web || s.settings?.collectEmail) ? `<button class="btn" id="certs" type="button">Print certificates</button>` : ""}
        <button class="btn ghost danger" id="delS" type="button">Delete</button></div></div>
    <div class="stat-row">
      <div class="stat"><span class="label">${w.Learners}</span><b>${players.length}${roster.length ? `<small class="muted" style="font-size:14px"> of ${roster.length}</small>` : ""}</b></div>
      ${s.kind === "assignment" ? `<div class="stat"><span class="label">Handed in</span><b>${counted.length}</b></div>` : ""}
      ${totalW ? `<div class="stat"><span class="label">Average</span><b>${avg}%</b></div>` : ""}
      ${hardest ? `<div class="stat"><span class="label">Hardest question</span><b style="font-size:18px">Q${hardest.i + 1} · ${hardest.rate}%</b></div>` : ""}
      ${needReview ? `<div class="stat warnstat"><span class="label">Written answers to check</span><b>${needReview}</b><a href="#written" style="font-size:13px">Mark them</a></div>` : ""}
    </div>
    ${needReview ? `<div class="notice">Written answers were marked <b>provisionally</b> by matching key words. Check them below before using these marks; students see "provisional" until you do.</div>` : ""}
    <section class="panel"><h2 style="font-size:20px">${w.Learners}</h2>
      ${players.length ? `<div class="scroll-x"><table class="data"><thead><tr><th>#</th><th>Name</th>${roster.length ? "<th>Number</th>" : ""}${web || s.settings?.collectEmail ? "<th>Email</th>" : ""}<th>${s.kind === "live" ? "Points" : "Marks"}</th><th>Mark</th>${s.kind === "assignment" ? "<th>Handed in</th>" : ""}${showTabs ? `<th title="Times the student left the test page">Left page</th>` : ""}</tr></thead><tbody>
      ${players.map((p, i) => `<tr class="click" data-pid="${p.id}" tabindex="0"><td class="num">${i + 1}</td><td><strong>${esc(p.nickname)}</strong></td>${roster.length ? `<td class="num">${esc(studentNo[p.student_id] || "")}</td>` : ""}${web || s.settings?.collectEmail ? `<td>${esc(p.email || "")}</td>` : ""}
        <td class="num">${s.kind === "live" ? p.score.toLocaleString() : `${+got(p.id).toFixed(1)} / ${totalW}`}</td>
        <td>${totalW ? `<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar" style="width:90px"><i style="width:${mark(p.id)}%;background:${mark(p.id) >= 50 ? "var(--good)" : "var(--bad)"}"></i></div><span class="num">${mark(p.id)}%</span></div>` : "–"}</td>
        ${s.kind === "assignment" ? `<td class="muted">${p.finished_at ? fmtDate(p.finished_at) : p.started_at ? "In progress" : "Not started"}</td>` : ""}
        ${showTabs ? `<td class="num">${p.flags?.tabSwitches ? `<span class="chip ${p.flags.tabSwitches >= 3 ? "warn" : ""}">${p.flags.tabSwitches}×</span>` : "0"}</td>` : ""}</tr>`).join("")}</tbody></table></div><p class="muted" style="margin:0;font-size:13px">Click a name to see their answers.${showTabs ? " \"Left page\" counts how often they switched away from the test (another app or tab). It is a hint, not proof." : ""}</p>`
        : `<div class="empty">No one yet.${s.kind === "assignment" ? ` Share <b>${esc(link)}</b> or PIN <b>${s.pin}</b>.` : ""}</div>`}
      ${absent.length ? `<details><summary class="btn sm">${absent.length} on the class list ${s.kind === "assignment" ? "haven't started" : "didn't join"}</summary><p style="margin:10px 0 0">${absent.map((st) => `${esc(st.full_name)} <span class="muted">(${esc(st.student_no)})</span>`).join(" · ")}</p></details>` : ""}
    </section>
    <section class="panel"><h2 style="font-size:20px">Questions</h2><div class="scroll-x"><table class="data"><thead><tr><th>#</th><th>Question</th><th>Got it right</th><th>Most common wrong answer / responses</th></tr></thead><tbody>
      ${perQ.map((p) => `<tr><td class="num">${p.i + 1}</td><td style="min-width:240px"><span class="chip ${p.x.type}">${TYPE_NAME[p.x.type]}</span>${weight(p.x) > 1 ? ` <span class="chip">${weight(p.x)} MARKS</span>` : ""}<div style="margin-top:4px">${rt(p.x.question)}</div></td>
        <td>${p.rate == null ? `<span class="muted">${p.n ? p.n + " responses" : "No answers"}</span>` : `<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar" style="width:110px"><i style="width:${p.rate}%;background:${p.rate >= 70 ? "var(--good)" : p.rate >= 40 ? "var(--c)" : "var(--bad)"}"></i></div><span class="num">${p.rate}%</span></div><span class="muted" style="font-size:12px">${p.n} answers${p.pending ? ` · ${p.pending} provisional` : ""}</span>`}</td>
        <td class="muted">${p.extra || p.trap}</td></tr>`).join("")}</tbody></table></div></section>
    ${shorts.length ? `<section class="panel" id="written"><div class="spread"><h2 style="font-size:20px">Written answers</h2>${needReview ? `<button class="btn sm primary" data-accept="" type="button">Accept all ${needReview} automatic marks</button>` : ""}</div>
      <p class="muted" style="margin:0;font-size:14px">Read each answer and confirm the mark. "Provisional" means nobody has checked it yet.</p><div id="writtenList" style="display:grid;gap:18px"></div></section>` : ""}
    ${aqs.length ? `<section class="panel"><h2 style="font-size:20px">Questions from the audience</h2><div style="display:grid;gap:8px">${aqs.map((a) => `<div class="spread" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px"><span>${esc(a.body)}</span><span class="row"><span class="chip">▲ ${a.votes}</span>${a.answered ? `<span class="chip live">ANSWERED</span>` : ""}</span></div>`).join("")}</div></section>` : ""}
    ${runs.length ? `<section class="panel"><h2 style="font-size:20px">Other times you used this quiz</h2><div class="row">${runs.map((r) => `<a class="btn sm" href="#/report/${r.id}">${fmtDate(r.created_at)} · ${r.settings?.teams ? "teams" : r.kind === "live" ? "live" : "assignment"} · ${r.players?.[0]?.count ?? 0} people</a>`).join("")}</div>
      <p class="muted" style="margin:0;font-size:13px">Tip: run the same quiz before and after a lesson to see how much the class improved.</p></section>` : ""}`;

  const nick = Object.fromEntries(players.map((p) => [p.id, p.nickname]));
  const markBtns = (a) => `<div class="row" style="gap:4px;flex-wrap:nowrap">${!a.reviewed ? `<span class="chip warn">PROVISIONAL ${Math.round(a.credit * 100)}%</span>` : ""}${[[1, "Full"], [0.5, "Half"], [0, "Zero"]].map(([c, l]) => `<button class="btn sm ${a.reviewed && Number(a.credit) === c ? "primary" : ""}" data-aid="${a.id}" data-credit="${c}" type="button">${l}</button>`).join("")}</div>`;
  const wl = $("#writtenList", v);
  if (wl) wl.innerHTML = shorts.map((p) => {
    const as = answers.filter((a) => a.q_index === p.i).sort((a, b) => a.reviewed - b.reviewed);
    return `<div style="display:grid;gap:8px"><div class="spread" style="align-items:flex-start"><div style="min-width:0"><span class="label">Q${p.i + 1} · ${weight(p.x)} mark${weight(p.x) === 1 ? "" : "s"}</span><div><strong>${rt(p.x.question)}</strong></div><div class="q-exp" style="margin-top:4px">Model: ${rt(p.x.answer || "(none)")}${p.x.keyPoints?.length ? `<br>Key points: ${p.x.keyPoints.map(esc).join(" · ")}` : ""}</div></div>
      ${p.pending ? `<button class="btn sm" data-accept="${p.i}" type="button">Accept ${p.pending} for this question</button>` : ""}</div>
      ${as.map((a) => `<div class="spread answer-row ${a.reviewed ? "" : "pending"}"><div style="min-width:0;flex:1"><span class="label">${esc(nick[a.player_id] || "Student")}</span><div style="overflow-wrap:anywhere;white-space:pre-line">${esc(a.text_answer) || '<i class="muted">No answer</i>'}</div></div>${markBtns(a)}</div>`).join("")}</div>`;
  }).join("");
  renderMath(v);

  v.addEventListener("click", async (e) => {
    const mb = e.target.closest("[data-aid]");
    if (mb) { try { await rpc("set_answer_credit", { p_answer: +mb.dataset.aid, p_credit: +mb.dataset.credit }); toast("Mark saved"); reportView(id); } catch (err) { toast(err.message, true); } return; }
    const ab = e.target.closest("[data-accept]");
    if (ab) {
      const idx = ab.dataset.accept === "" ? null : +ab.dataset.accept;
      if (!(await ask(idx == null ? "Accept every provisional mark as it is?" : `Accept all provisional marks for question ${idx + 1}?`, "Accept marks"))) return;
      try { const n = await rpc("accept_marks", { p_session: id, p_index: idx }); toast(`${n} marks confirmed`); reportView(id); } catch (err) { toast(err.message, true); }
      return;
    }
    const tr = e.target.closest("tr[data-pid]");
    if (tr) studentDialog(players.find((p) => p.id === tr.dataset.pid), byPlayer[tr.dataset.pid] || [], Q, markBtns, () => reportView(id));
  });
  $("#copyLink", v)?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch { toast(link); } });
  $("#toggle", v)?.addEventListener("click", async () => {
    try { await rpc("host_set_state", { p_session: id, p_status: isOpen ? "closed" : "open", p_index: null }); toast(isOpen ? "Closed. Students can now see the answers (if you chose that)." : "Reopened"); reportView(id); }
    catch (err) { toast(err.message, true); }
  });
  $("#delS", v).onclick = async () => {
    if (!(await ask("Delete this session and all of its results? This can't be undone.", "Delete results", true))) return;
    await q(sb.from("sessions").delete().eq("id", id)); toast("Deleted"); location.hash = "#/sessions";
  };
  $("#csv", v).onclick = () => {
    const head = ["Rank", "Name", ...(roster.length ? ["Number"] : []), ...(web || s.settings?.collectEmail ? ["Email"] : []), s.kind === "live" ? "Points" : "Marks", "Out of", "Percent", ...(showTabs ? ["Left page"] : []), "Provisional answers", ...Q.map((_, i) => `Q${i + 1}`)];
    const lines = players.map((p, i) => {
      const map = Object.fromEntries((byPlayer[p.id] || []).map((a) => [a.q_index, a]));
      return [i + 1, p.nickname, ...(roster.length ? [studentNo[p.student_id] || ""] : []), ...(web || s.settings?.collectEmail ? [p.email || ""] : []),
        s.kind === "live" ? p.score : got(p.id).toFixed(2), totalW, mark(p.id) + "%", ...(showTabs ? [p.flags?.tabSwitches || 0] : []), (byPlayer[p.id] || []).filter((a) => !a.reviewed).length,
        ...Q.map((x, qi) => { const a = map[qi]; if (!a) return ""; if (x.type === "short" || x.type === "word") return `${a.credit} | ${a.text_answer || ""}`; return a.choice == null ? "-" : `${LET[a.choice]}${gradable(x) ? (a.is_correct ? " ✓" : " ✗") : ""}`; })];
    });
    for (const st of absent) lines.push(["", st.full_name, st.student_no, ...(web || s.settings?.collectEmail ? [""] : []), "", totalW, "ABSENT"]);
    const csv = [head, ...lines].map((r) => r.map(csvCell).join(",")).join("\r\n");
    downloadFile(`${s.title.replace(/[^\w\- ]+/g, "").trim() || "results"} - ${s.pin}.csv`, new Blob(["﻿" + csv], { type: "text/csv" }));
  };
  $("#certs", v)?.addEventListener("click", () => printCertificates(s, players));
}

function studentDialog(p, as, Q, markBtns, refresh) {
  const map = Object.fromEntries(as.map((a) => [a.q_index, a]));
  const d = dialog(`<div class="spread"><h2 style="font-size:22px">${esc(p.nickname)}</h2><button class="btn sm" data-x type="button">Close</button></div>
    ${p.flags?.tabSwitches ? `<p class="muted" style="margin:0">Left the test page ${p.flags.tabSwitches} time${p.flags.tabSwitches > 1 ? "s" : ""}.</p>` : ""}
    <div style="display:grid;gap:10px;max-height:65vh;overflow:auto" id="sdBody">${Q.map((x, i) => {
      const a = map[i];
      const given = !a ? '<i class="muted">No answer</i>' : x.type === "short" || x.type === "word" ? esc(a.text_answer || "") : a.choice == null ? '<i class="muted">No answer</i>' : `${LET[a.choice]}. ${esc(x.options[a.choice])}`;
      const right = x.type === "short" ? rt(x.answer || "(no model answer)") : gradable(x) ? `${LET[x.answer]}. ${esc(x.options[x.answer])}` : "(no right answer)";
      return `<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:grid;gap:4px">
        <div class="spread"><span class="label">Q${i + 1}</span>${gradable(x) ? `<span class="chip" style="color:${a?.is_correct ? "var(--good)" : "var(--bad)"}">${a ? (x.type === "short" ? Math.round(a.credit * 100) + "%" : a.is_correct ? "CORRECT" : "WRONG") : "SKIPPED"}</span>` : ""}</div>
        <strong style="overflow-wrap:anywhere">${rt(x.question)}</strong>${qimg(x, "qimg sm")}<div style="overflow-wrap:anywhere;white-space:pre-line">Answer: ${given}</div><div class="muted" style="font-size:13px;overflow-wrap:anywhere">Expected: ${right}</div>
        ${a && x.type === "short" ? markBtns(a) : ""}</div>`;
    }).join("")}</div>`, true);
  renderMath($("#sdBody", d));
  d.querySelector("[data-x]").onclick = () => d.close();
  d.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-aid]"); if (!b) return;
    try { await rpc("set_answer_credit", { p_answer: +b.dataset.aid, p_credit: +b.dataset.credit }); toast("Mark saved"); d.close(); refresh(); }
    catch (err) { toast(err.message, true); }
  });
}

function teamReport(v, s) {
  const teams = [...s.settings.teams].sort((a, b) => b.score - a.score);
  v.innerHTML = `<div class="page-h"><div><a href="#/sessions" style="font-size:14px">← Results</a><h1>${esc(s.title)}</h1>
      <div class="row muted" style="font-size:14px;margin-top:6px">${kindChip(s)}<span>${fmtDate(s.created_at)}</span><span>${s.settings.played ?? s.questions.length} questions played</span></div></div>
      <button class="btn ghost danger" id="delS" type="button">Delete</button></div>
    <section class="panel"><h2 style="font-size:20px">Team scores</h2><div class="scroll-x"><table class="data"><thead><tr><th>#</th><th>Team</th><th>Points</th><th>Questions right</th></tr></thead><tbody>
      ${teams.map((t, i) => `<tr><td class="num">${i + 1}</td><td><strong>${esc(t.name)}</strong></td><td class="num">${t.score}</td><td class="num">${t.right} / ${s.settings.played ?? s.questions.length}</td></tr>`).join("")}</tbody></table></div></section>`;
  $("#delS", v).onclick = async () => { if (await ask("Delete this result?", "Delete", true)) { await q(sb.from("sessions").delete().eq("id", s.id)); location.hash = "#/sessions"; } };
}

function printCertificates(s, players) {
  const school = ctx.head?.profile || {};
  const date = new Date(s.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  let box = document.getElementById("certPages");
  if (!box) { box = document.createElement("div"); box.id = "certPages"; document.body.appendChild(box); }
  box.innerHTML = players.map((p) => `<article class="cert">
      ${school.logo ? `<img src="${school.logo}" alt="" class="cert-logo">` : ""}
      <div class="cert-org">${esc(school.name || "")}</div>
      <div class="cert-title">Certificate of Participation</div>
      <div class="cert-small">This is to certify that</div>
      <div class="cert-name">${esc(p.nickname)}</div>
      <div class="cert-small">took part in</div>
      <div class="cert-event">${esc(s.title)}</div>
      <div class="cert-small">on ${esc(date)}</div>
      <div class="cert-sign"><span>Signature</span><span>Date</span></div></article>`).join("");
  document.body.classList.add("print-certs");
  window.print();
  document.body.classList.remove("print-certs");
}

/* ================= HOD / admin reviews ================= */
export async function reviewsView() {
  const v = frame("reviews", `<div class="page-h"><div><span class="label">${ctx.role === "admin" ? "All departments" : "Department: " + esc(ctx.head?.member?.department || "all")}</span><h1>Reviews</h1>
    <p class="muted" style="margin:4px 0 0">Quizzes and exam papers colleagues have sent for approval.</p></div></div><div id="list"><p class="muted">Loading…</p></div>`);
  const [rows, members] = await Promise.all([
    q(sb.from("quizzes").select("id,title,department,review_status,updated_at,owner_id,questions").neq("owner_id", ctx.user.id).order("updated_at", { ascending: false })),
    q(sb.from("school_members").select("user_id,display_name,email")),
  ]);
  const who = Object.fromEntries(members.map((m) => [m.user_id, m.display_name || m.email]));
  const order = { submitted: 0, changes: 1, approved: 2 };
  rows.sort((a, b) => (order[a.review_status] ?? 3) - (order[b.review_status] ?? 3));
  $("#list", v).innerHTML = rows.length ? `<div class="panel scroll-x" style="padding:6px 8px"><table class="data"><thead><tr><th>Quiz</th><th>Teacher</th><th>Department</th><th>Questions</th><th>Status</th><th>Updated</th></tr></thead><tbody>
    ${rows.map((z) => `<tr class="click" data-id="${z.id}" tabindex="0"><td><strong>${esc(z.title)}</strong></td><td>${esc(who[z.owner_id] || "")}</td><td>${esc(z.department)}</td><td class="num">${z.questions.length}</td><td>${statusChip(z.review_status)}</td><td class="muted">${fmtDate(z.updated_at)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">Nothing to review. When a teacher presses "Send for review", it appears here.</div>`;
  $("#list", v).onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) location.hash = "#/review/" + tr.dataset.id; };
}

export async function reviewView(id) {
  const v = frame("reviews", `<p class="muted">Loading…</p>`);
  const z = await q(sb.from("quizzes").select("*").eq("id", id).maybeSingle());
  if (!z) { v.innerHTML = `<div class="notice">Not found or not yours to review. <a href="#/reviews">Back</a></div>`; return; }
  v.innerHTML = `<div class="page-h"><div><a href="#/reviews" style="font-size:14px">← Reviews</a><h1>${esc(z.title)} ${statusChip(z.review_status)}</h1><p class="muted" style="margin:4px 0 0">${z.questions.length} questions · ${esc(z.department || "No department")}</p></div>
      <a class="btn" href="#/print/${z.id}">Preview exam paper</a></div>
    <section class="panel"><h2 style="font-size:20px">Your decision</h2>
      <div class="field"><label class="label" for="note">Note to the teacher (required if you ask for changes)</label><textarea id="note" rows="3">${esc(z.review_note || "")}</textarea></div>
      <div class="row"><button class="btn primary" data-dec="approved" type="button">Approve</button><button class="btn" data-dec="changes" type="button">Ask for changes</button></div></section>
    <ol class="qlist" id="qs">${z.questions.map((x) => `<li class="q"><div class="row" style="gap:6px"><span class="chip ${x.type}">${TYPE_NAME[x.type]}</span>${x.marks ? `<span class="chip">${x.marks} MARKS</span>` : ""}${x.source ? `<span class="chip">FROM ${esc(x.source.toUpperCase())}</span>` : ""}</div>
      <div class="q-text">${rt(x.question)}</div>${qimg(x, "qimg sm")}
      ${x.options ? `<ul class="q-opts">${x.options.map((o, i) => `<li class="${i === x.answer ? "ok" : ""}"><span class="bub">${LET[i]}</span>${esc(o)}</li>`).join("")}</ul>` : ""}
      ${x.type === "short" ? `<div class="q-exp"><b>Model answer:</b> ${rt(x.answer || "(none)")}</div>` : x.explanation ? `<div class="q-exp">${esc(x.explanation)}</div>` : ""}</li>`).join("")}</ol>`;
  renderMath($("#qs", v));
  v.querySelectorAll("[data-dec]").forEach((b) => (b.onclick = async () => {
    const note = $("#note", v).value.trim();
    if (b.dataset.dec === "changes" && !note) return toast("Write a note so the teacher knows what to change", true);
    try { await rpc("review_quiz", { p_quiz: id, p_decision: b.dataset.dec, p_note: note }); toast(b.dataset.dec === "approved" ? "Approved" : "Sent back with your note"); location.hash = "#/reviews"; }
    catch (err) { toast(err.message, true); }
  }));
}
export { headerHTML };
