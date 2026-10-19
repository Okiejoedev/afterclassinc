// Student / participant side: join with a PIN, play a live game on the phone,
// or do a self-paced assignment / timed online test. No account needed; with
// no PIN in the link the home page (home.js) is shown instead.
// ?preview=<quizId> lets a signed-in teacher try a quiz without saving anything.
import { sb, configured, rpc, q } from "./sb.js";
import { home } from "./home.js";
import { $, esc, rt, LET, store, toast, confetti, LOGO, qimg, renderMath, speak, canSpeak, questionSpeech, rng, seededShuffle, dialog } from "./ui.js";

const app = $("#app");
const KEY = "afterclass.player";
const params = new URLSearchParams(location.search);
let me = store.get(KEY, null);   // { player_id, token, session_id, kind, nickname, title }
let channel = null, poll = 0, timerRAF = 0, lastKey = "", offset = 0, state = null, sheetTimer = 0;

const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const announce = (t) => { const a = $("#announce"); if (a) { a.textContent = ""; setTimeout(() => (a.textContent = t), 50); } };
const isWeb = () => state?.settings?.audience === "webinar";
const phone = (inner, who = true) => {
  document.body.className = "stage";
  app.innerHTML = `<div class="phone"><div class="top"><span class="brand" style="color:var(--stage-ink)">${LOGO} Afterclass</span>${who && me ? `<span class="who">${esc(me.nickname)}</span>` : ""}</div>${inner}</div>`;
  renderMath(app);
};

if (!configured) phone(`<div class="wait"><h1 style="font-size:28px">This site isn't set up yet</h1><p class="muted">Ask your teacher to finish the setup.</p></div>`, false);
else if (params.get("preview")) previewMode(params.get("preview"));
else if (me && !params.get("pin")) resume();
else if (me && params.get("pin")) { // opened a new link while still in an old game
  const pin = params.get("pin").replace(/\D/g, "");
  store.del(KEY); me = null; nameScreen(pin);
}
else { const pin = (params.get("pin") || "").replace(/\D/g, ""); pin.length === 6 ? nameScreen(pin) : goHome(); }

function goHome(msg = "") { stop(); home({ pin: (p) => nameScreen(p), joinAs }, msg); }

// Signed-in students join straight from their dashboard with their account name.
async function joinAs(pin, name) {
  if (!name) return nameScreen(pin);
  phone(`<div class="wait"><div class="spinner"></div><p class="muted">Joining…</p></div>`, false);
  try {
    me = await rpc("join_session", { p_pin: pin, p_nickname: name, p_student_no: null, p_email: null });
    store.set(KEY, me);
    history.replaceState(null, "", location.pathname);
    if (me.resumed) toast(me.finished ? "You have already handed this in. Here is your result." : "Welcome back. Carrying on where you left off.");
    resume();
  } catch (err) {
    if (err.message === "STUDENT_NO_REQUIRED") return nameScreen(pin, "", { roster: true, nick: "" });
    if (/valid email/i.test(err.message)) return nameScreen(pin, "", { email: true, nick: name });
    if (/PIN|closed|locked/i.test(err.message)) return goHome(err.message);
    nameScreen(pin, err.message, { nick: name });
  }
}

/* ================= joining ================= */
function joinScreen(pinPrefill = "", err = "") {
  stop();
  phone(`<form class="join" id="pinForm" autocomplete="off">
      <h1>Join</h1>
      <label class="label" for="pin" style="text-align:center">Game PIN</label>
      <input id="pin" type="text" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" placeholder="000 000" value="${esc(pinPrefill)}" required aria-describedby="err">
      <button class="btn primary" type="submit">Enter</button>
      <p class="status" id="err" role="alert" style="text-align:center;color:#FF8E86">${esc(err)}</p>
      <p class="muted" style="text-align:center;font-size:14px;margin-top:8vh"><a href="./" style="color:var(--hi)">← Back to home</a><br><a href="privacy.html" style="color:var(--stage-muted)">Privacy notice</a></p>
    </form>`, false);
  const pin = $("#pin");
  if (!pinPrefill) pin.focus();
  $("#pinForm").onsubmit = (e) => {
    e.preventDefault();
    const p = pin.value.replace(/\D/g, "");
    if (p.length !== 6) { $("#err").textContent = "The PIN has 6 digits."; return; }
    nameScreen(p);
  };
}

const ANIMALS = ["Lion", "Eagle", "Zebra", "Tiger", "Parrot", "Elephant", "Giraffe", "Dolphin", "Leopard", "Rabbit", "Owl", "Panda"];
const COLOURS = ["Blue", "Green", "Golden", "Red", "Purple", "Silver", "Orange", "Happy", "Brave", "Clever"];
// need: { roster: bool, email: bool }
function nameScreen(pin, err = "", need = {}) {
  const roster = !!need.roster;
  phone(`<form class="join" id="nickForm" autocomplete="off">
      <h1>${roster ? "Who are you?" : "Your name"}</h1>
      <p class="muted" style="text-align:center;margin:0">PIN ${pin.slice(0, 3)} ${pin.slice(3)}${roster ? " · this one uses your class list" : ""}</p>
      ${roster ? `<label class="label" for="sno" style="text-align:center">Admission / matric number</label><input id="sno" type="text" maxlength="40" autocomplete="off" required>` : ""}
      <label class="label" for="nick" style="text-align:center">${roster ? "Your surname or first name" : "Name"}</label>
      <input id="nick" type="text" maxlength="24" placeholder="${roster ? "as on the class list" : "e.g. Ada O."}" autocomplete="${roster ? "family-name" : "nickname"}" required>
      ${!roster ? `<button class="btn ghost sm" id="fun" type="button">Pick a fun name for me</button>` : ""}
      ${need.email ? `<label class="label" for="email" style="text-align:center">Email (for your certificate)</label><input id="email" type="email" maxlength="120" autocomplete="email" required>
        <p class="muted" style="text-align:center;font-size:13px;margin:0">Shared only with the organiser of this session. <a href="privacy.html" style="color:var(--stage-muted)">Privacy notice</a></p>` : ""}
      <button class="btn primary" type="submit" id="go">Join</button>
      <p class="status" id="err" role="alert" style="text-align:center;color:#FF8E86">${esc(err)}</p>
      <button class="btn ghost" type="button" id="back">Use a different PIN</button>
    </form>`, false);
  $("#nick").value = need.nick ?? (roster ? "" : store.get("afterclass.nick", ""));
  if (need.sno && $("#sno")) $("#sno").value = need.sno;
  (roster ? $("#sno") : $("#nick")).focus();
  $("#fun")?.addEventListener("click", () => { $("#nick").value = `${COLOURS[Math.random() * COLOURS.length | 0]} ${ANIMALS[Math.random() * ANIMALS.length | 0]}`; });
  $("#back").onclick = () => joinScreen(pin);
  $("#nickForm").onsubmit = async (e) => {
    e.preventDefault();
    const nick = $("#nick").value.trim(), sno = $("#sno")?.value.trim() || null, email = $("#email")?.value.trim() || null;
    if (!nick) return;
    $("#go").disabled = true;
    try {
      me = await rpc("join_session", { p_pin: pin, p_nickname: nick, p_student_no: sno, p_email: email });
      store.set(KEY, me); if (!roster) store.set("afterclass.nick", nick);
      history.replaceState(null, "", location.pathname);
      if (me.resumed) toast(me.finished ? "You have already handed this in. Here is your result." : "Welcome back. Carrying on where you left off.");
      resume();
    } catch (err) {
      const keep = { nick, sno };
      if (err.message === "STUDENT_NO_REQUIRED") return nameScreen(pin, "", { ...need, ...keep, roster: true, nick: "" });
      if (/valid email/i.test(err.message)) return nameScreen(pin, need.email ? err.message : "", { ...need, ...keep, email: true });
      if (/PIN/.test(err.message)) return joinScreen(pin, err.message);
      $("#err").textContent = err.message; $("#go").disabled = false;
    }
  };
}
function leave(msg = "") { store.del(KEY); me = null; goHome(msg); }
function stop() {
  clearInterval(poll); cancelAnimationFrame(timerRAF); clearInterval(sheetTimer);
  if (channel) { sb.removeChannel(channel); channel = null; }
}

/* ================= state ================= */
async function fetchState(fn = "session_state") {
  try {
    const t0 = Date.now();
    state = await rpc(fn, { p_player: me.player_id, p_token: me.token });
    offset = new Date(state.server_now || Date.now()).getTime() - (t0 + Date.now()) / 2;
    return state;
  } catch (e) {
    if (e.code === "REMOVED") { leave("This game has ended or you were removed. Join again with a PIN."); return null; }
    throw e;
  }
}
async function resume() {
  phone(`<div class="wait"><div class="spinner"></div><p class="muted">Connecting…</p></div>`);
  let s;
  try { s = await fetchState(); }
  catch (e) { phone(`<div class="wait"><h2>Can't connect</h2><p class="muted">${esc(e.message)}</p><button class="btn primary" id="retry" type="button">Try again</button><button class="btn ghost" id="quit" type="button">Leave</button></div>`); $("#retry").onclick = resume; $("#quit").onclick = () => leave(); return; }
  if (!s) return;
  if (s.kind === "assignment") return assignment(s);
  // Big audiences: spread requests out so thousands of phones don't hit the server at once.
  const big = () => (state?.players || 0) > 60;
  channel = sb.channel("live-" + me.session_id).on("broadcast", { event: "sync" }, () => setTimeout(refresh, big() ? Math.random() * 1500 : 0)).subscribe();
  const loop = () => { poll = setTimeout(async () => { await refresh(); loop(); }, big() ? 6000 + Math.random() * 4000 : 3000); };
  loop();
  document.onvisibilitychange = () => { if (!document.hidden) refresh(); };
  renderLive(true);
}
async function refresh() {
  if (!me || state?.kind === "assignment") return;
  try { if (await fetchState()) renderLive(); } catch { /* offline for a moment; the next check retries */ }
}

/* ================= live game ================= */
const qaButton = () => state?.settings?.qa ? `<button class="btn sm qa-fab" id="askBtn" type="button">Ask a question</button>` : "";
function bindCommon() {
  $("#quit")?.addEventListener("click", () => leave());
  $("#askBtn")?.addEventListener("click", qaDialog);
  $("#speak")?.addEventListener("click", () => speak(questionSpeech(state.question)));
}
function renderLive(force = false) {
  const s = state;
  const key = `${s.status}:${s.index}:${s.my_answer ? 1 : 0}`;
  if (!force && key === lastKey) return;
  lastKey = key;
  cancelAnimationFrame(timerRAF);
  const web = isWeb();

  if (s.status === "lobby") {
    phone(`<div class="wait"><h1 style="font-size:34px">You're in!</h1><p style="margin:0;font-size:18px">${web ? "The session will start soon." : "See your name on the big screen?"}</p>
      <div class="spinner"></div><p class="muted" style="margin:0">${esc(s.title)}<br>${s.players} ${s.players === 1 ? "person" : "people"} here</p>
      ${qaButton()}<button class="btn ghost sm" id="quit" type="button" style="margin-top:6vh">Leave</button></div>`);
    announce("You're in. Waiting for the start.");
    return bindCommon();
  }
  if (s.status === "question") {
    if (s.my_answer) { phone(`<div class="wait"><h1 style="font-size:30px">Answer sent</h1><div class="spinner"></div><p class="muted">Waiting for everyone else… Look at the screen.</p>${qaButton()}</div>`); return bindCommon(); }
    return questionView(s);
  }
  if (s.status === "reveal" || s.status === "leaderboard") return resultView(s);
  if (s.status === "ended") return finalView(s);
}

function questionView(s) {
  const x = s.question, readBtn = (s.settings?.readAloud || x.type !== "word") && canSpeak() ? `<button class="btn sm" id="speak" type="button" aria-label="Read the question aloud">🔊 Read aloud</button>` : "";
  const head = `<div class="spread"><span class="label">Question ${s.index + 1} of ${s.total}</span><span class="label" id="clock"></span></div><div class="timer"><i id="bar"></i></div>
    <div class="gq">${rt(x.question)}</div>${qimg(x)}${s.settings?.readAloud ? readBtn : ""}`;
  if (x.type === "short" || x.type === "word") {
    const word = x.type === "word";
    phone(`${head}<form id="sf" style="display:grid;gap:12px"><label class="label" for="ta">${word ? "One word or a short phrase" : "Your answer"}</label>
      ${word ? `<input id="ta" type="text" maxlength="40" autocomplete="off">` : `<textarea id="ta" rows="4" maxlength="500" class="answer-box" placeholder="Type your answer…"></textarea>`}
      <button class="btn primary big" type="submit">Send</button></form>${qaButton()}`);
    $("#sf").onsubmit = (e) => { e.preventDefault(); const t = $("#ta").value.trim(); if (!t) return toast("Type an answer first"); send(s.index, null, t); };
  } else {
    phone(`${head}<div class="tiles" role="group" aria-label="Answer options">${x.options.map((o, i) => `<button class="tile o${i}" data-i="${i}" type="button"><span class="bl" aria-hidden="true">${LET[i]}</span><span class="t">${esc(o)}</span></button>`).join("")}</div>${qaButton()}`);
    app.querySelector(".tiles").onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) send(s.index, +b.dataset.i, null, b); };
  }
  bindCommon();
  announce(`Question ${s.index + 1} of ${s.total}. ${x.question}`);
  const limit = s.time_limit;
  if (!limit || !s.started_at) { $("#bar").style.opacity = ".25"; return; }
  const endsAt = new Date(s.started_at).getTime() + limit * 1000;
  const tick = () => {
    if (!$("#bar")) return;
    const left = Math.max(0, endsAt - (Date.now() + offset));
    $("#bar").style.transform = `scaleX(${left / (limit * 1000)})`;
    $("#clock").textContent = Math.ceil(left / 1000) + "s";
    if (left <= 0) { phone(`<div class="wait"><h1 style="font-size:30px">Time's up!</h1><div class="spinner"></div><p class="muted">Look at the screen for the answer.</p></div>`); return; }
    timerRAF = requestAnimationFrame(tick);
  };
  timerRAF = requestAnimationFrame(tick);
}
async function send(index, choice, text, tile) {
  app.querySelectorAll("button, input, textarea").forEach((b) => (b.disabled = true));
  tile?.classList.add("picked");
  try {
    await rpc("submit_answer", { p_player: me.player_id, p_token: me.token, p_index: index, p_choice: choice, p_text: text });
    cancelAnimationFrame(timerRAF);
    state.my_answer = { submitted: true }; lastKey = "";
    renderLive();
  } catch (e) {
    toast(e.message, true);
    if (e.code === "REMOVED") return;
    app.querySelectorAll("button, input, textarea").forEach((b) => (b.disabled = false));
    refresh();
  }
}
function resultView(s) {
  const a = s.my_answer, x = s.question, hide = s.settings?.hideScores;
  if (x.type === "poll" || x.type === "word") {
    phone(`<div class="result none"><div class="verdict">${a ? "Thanks!" : "Missed this one"}</div><div style="font-size:18px">Look at the screen to see what everyone said.</div></div>${qaButton()}`);
    return bindCommon();
  }
  let cls = "none", title = "No answer", sub = "You didn't answer in time.";
  if (a) {
    if (x.type === "short") {
      const c = Number(a.credit);
      cls = c >= 0.5 ? "good" : "bad"; title = c >= 1 ? "Great answer!" : c >= 0.5 ? "Mostly right" : c > 0 ? "Partly right" : "Not quite";
      sub = hide ? "" : `+${a.points} points`;
    } else {
      cls = a.is_correct ? "good" : "bad"; title = a.is_correct ? "Correct!" : "Not this time";
      sub = a.is_correct ? (hide ? "Well done!" : `+${a.points} points`) : `The answer was ${LET[x.answer]}. ${esc(x.options[x.answer])}`;
    }
  }
  if (x.type === "short" && cls !== "good") sub += `<br><span style="font-size:15px">Model answer: ${rt(x.answer)}</span>`;
  phone(`<div class="result ${cls}"><div class="verdict">${title}</div><div style="font-size:18px">${sub}</div>${!hide && a?.is_correct && s.me.streak > 1 ? `<div class="pts">${s.me.streak} in a row</div>` : ""}</div>
    ${x.explanation ? `<p class="muted" style="margin:0;text-align:center">${esc(x.explanation)}</p>` : ""}
    ${hide ? "" : `<div class="rank">You're in ${ordinal(s.me.rank)} place<br><span class="num" style="font-size:28px;font-family:var(--f-display)">${s.me.score.toLocaleString()}</span> <span class="muted">points</span></div>`}
    <p class="muted" style="text-align:center;margin:0">${s.status === "leaderboard" ? "Check the leaderboard on the screen." : "Next question coming up…"}</p>${qaButton()}`);
  announce(title);
  bindCommon();
}
function finalView(s) {
  clearTimeout(poll);
  const hide = s.settings?.hideScores;
  phone(`<div class="wait" style="padding-top:4vh"><span class="label">${esc(s.title)}</span>
    <h1 style="font-size:36px">${hide ? "Thank you for taking part!" : s.me.rank <= 3 ? "On the podium!" : "All done!"}</h1>
    ${hide ? `<p style="margin:0;font-size:18px">${s.me.correct ? `You got ${s.me.correct} answer${s.me.correct === 1 ? "" : "s"} right. Well done!` : "Keep practising. You'll get there!"}</p>` : `<div class="big-score">${ordinal(s.me.rank)}</div><p style="margin:0;font-size:18px">${s.me.score.toLocaleString()} points · ${s.me.correct} correct</p><p class="muted" style="margin:0">out of ${s.players} people</p>`}
    <button class="btn primary big" id="again" type="button" style="margin-top:4vh">Join another</button></div>`);
  $("#again").onclick = () => leave();
  if (!hide && s.me.rank <= 3) confetti();
}

/* ----- Q&A ----- */
async function qaDialog() {
  const d = dialog(`<div class="spread"><h2 style="font-size:20px">Questions</h2><button class="btn sm" data-x type="button">Close</button></div>
    <form id="qaForm" style="display:grid;gap:8px"><label class="label" for="qaText">Ask the ${isWeb() ? "presenter" : "teacher"}</label><textarea id="qaText" rows="3" maxlength="300"></textarea><button class="btn primary sm" type="submit" style="justify-self:start">Send question</button></form>
    <div id="qaList" style="display:grid;gap:8px;max-height:45vh;overflow:auto"><p class="muted">Loading…</p></div>`);
  d.querySelector("[data-x]").onclick = () => d.close();
  const load = async () => {
    try {
      const list = await rpc("aq_list", { p_player: me.player_id, p_token: me.token });
      $("#qaList", d).innerHTML = list.length ? list.map((r) => `<div class="qa-item ${r.answered ? "done" : ""}"><button class="qa-votes" data-v="${r.id}" ${r.voted || r.mine ? "disabled" : ""} type="button" aria-label="Vote for this question">▲ ${r.votes}</button><div class="qa-body">${esc(r.body)}${r.answered ? ` <span class="chip live">ANSWERED</span>` : ""}</div></div>`).join("")
        : `<p class="muted">No questions yet. Be the first!</p>`;
    } catch (e) { $("#qaList", d).innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  };
  $("#qaForm", d).onsubmit = async (e) => {
    e.preventDefault();
    try { await rpc("aq_post", { p_player: me.player_id, p_token: me.token, p_body: $("#qaText", d).value }); $("#qaText", d).value = ""; toast("Question sent"); load(); }
    catch (err) { toast(err.message, true); }
  };
  $("#qaList", d).onclick = async (e) => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    try { await rpc("aq_vote", { p_player: me.player_id, p_token: me.token, p_question: +b.dataset.v }); load(); } catch (err) { toast(err.message, true); }
  };
  load();
}

/* ================= assignment / timed test ================= */

function paper(inner) { document.body.className = "sheetbg"; app.innerHTML = inner; renderMath(app); }
function assignment(s) {
  if (s.finished) return resultScreen(s, s.result);
  if (s.status !== "open") return paperMsg("This has closed", "Ask your teacher if you still need to do it.");
  if (!s.started_at) return startScreen(s);
  return sheet(s);
}
function startScreen(s) {
  const lim = s.settings?.timeLimitMin;
  paper(`<div class="sheet"><div class="sheet-head"><span class="brand">${LOGO} Afterclass</span><span class="label">${esc(me.nickname)}</span><h1>${esc(s.title)}</h1></div>
    <div class="panel" style="gap:10px">
      <p style="margin:0"><b>${s.total} questions.</b> ${lim ? `You have <b>${lim} minutes</b> once you press Start. It hands in by itself when time runs out.` : "No time limit."}${s.closes_at ? ` Closes ${new Date(s.closes_at).toLocaleString()}.` : ""}</p>
      <p style="margin:0">Your answers save on this phone as you go. You can only hand in once.</p>
      ${lim ? `<p style="margin:0">Stay on this page. Leaving it to use other apps is recorded for your teacher.</p>` : ""}
      <button class="btn primary big" id="startBtn" type="button" style="justify-self:start">Start</button></div></div>`);
  $("#startBtn").onclick = async () => {
    $("#startBtn").disabled = true;
    try { const st = await fetchState("start_attempt"); if (st) sheet(st); } catch (e) { toast(e.message, true); $("#startBtn").disabled = false; }
  };
}

// Display order (shuffled per student if the teacher chose it) -> original order for the server.
function layout(s) {
  const Q = s.questions;
  let order = Q.map((_, i) => i), optOrder = Q.map((x) => (x.options || []).map((_, k) => k));
  if (s.settings?.shuffle) {
    const r = rng(me.player_id);
    order = seededShuffle(order, r);
    optOrder = Q.map((x) => (x.type === "mcq" ? seededShuffle(x.options.map((_, k) => k), r) : (x.options || []).map((_, k) => k)));
  }
  return { Q, order, optOrder };
}

function sheet(s) {
  const { Q, order, optOrder } = layout(s);
  const draftKey = "afterclass.draft." + me.player_id, metaKey = "afterclass.meta." + me.player_id;
  const draft = store.get(draftKey, {}), meta = store.get(metaKey, { tabSwitches: 0 });
  const deadline = s.deadline ? new Date(s.deadline).getTime() : null;
  paper(`<div class="sheet" id="sheet"><div class="sheet-head"><span class="brand">${LOGO} Afterclass</span><span class="label">${esc(me.nickname)}</span><h1>${esc(s.title)}</h1>
      <div class="row muted" style="font-size:14px"><span>${Q.length} questions</span>${s.closes_at ? `<span>Due ${new Date(s.closes_at).toLocaleString()}</span>` : ""}<span>Saved on this phone as you type</span></div></div>
    ${deadline ? `<div class="sheet-timer" id="sTimer" role="timer" aria-live="off"></div>` : ""}
    ${order.map((qi, n) => { const x = Q[qi]; return `<div class="sq" data-q="${qi}" role="group" aria-labelledby="ql${qi}"><div class="sq-q" id="ql${qi}"><span class="n">${n + 1}.</span><span class="t">${rt(x.question)}${Number(x.marks) > 0 ? ` <span class="muted">[${x.marks} mark${x.marks == 1 ? "" : "s"}]</span>` : ""}${x.type === "poll" || x.type === "word" ? ` <span class="muted">(not marked)</span>` : ""}</span></div>${qimg(x)}
      ${canSpeak() && s.settings?.readAloud ? `<button class="btn sm ghost" data-say="${qi}" type="button" style="justify-self:start">🔊 Read aloud</button>` : ""}
      ${x.type === "short" || x.type === "word"
        ? `<div class="sq-opts"><label class="label" for="t${qi}">Your answer</label><textarea id="t${qi}" class="lined" maxlength="${x.type === "word" ? 40 : 4000}" rows="${x.type === "word" ? 1 : 5}">${esc(draft[qi]?.text || "")}</textarea></div>`
        : `<div class="sq-opts">${optOrder[qi].map((k, i) => `<label class="sq-opt" data-k="${k}"><input type="radio" name="q${qi}" value="${k}" ${draft[qi]?.choice === k ? "checked" : ""}><span class="omr">${LET[i]}</span><span class="ot">${esc(x.options[k])}</span></label>`).join("")}</div>`}
      <div class="sq-res" hidden></div></div>`; }).join("")}
    </div>
    <div class="sheet-foot"><div><span id="prog"></span><div class="row"><button class="btn primary" id="submit" type="button">Hand in</button></div></div></div>`);
  const collect = () => Q.map((x, qi) => x.type === "short" || x.type === "word"
    ? { text: $(`#t${qi}`).value.trim() }
    : { choice: (() => { const c = app.querySelector(`input[name="q${qi}"]:checked`); return c ? +c.value : null; })() });
  const answeredN = (arr) => arr.filter((a, i) => Q[i].type !== "poll" && Q[i].type !== "word" && ((a.text ?? "") !== "" || a.choice != null)).length;
  const gradableN = Q.filter((x) => x.type !== "poll" && x.type !== "word").length;
  let armed = false;
  const update = () => { const arr = collect(); store.set(draftKey, arr); $("#prog").textContent = `${answeredN(arr)} of ${gradableN} answered`; armed = false; $("#submit").textContent = "Hand in"; };
  $("#sheet").addEventListener("input", update); $("#sheet").addEventListener("change", update); update();
  $("#sheet").addEventListener("click", (e) => { const b = e.target.closest("[data-say]"); if (b) speak(questionSpeech(Q[+b.dataset.say])); });

  // leaving the page during a test is recorded (a hint for the teacher, not proof)
  document.onvisibilitychange = () => {
    if (document.hidden) { meta.tabSwitches++; store.set(metaKey, meta); }
    else if (deadline) toast("Leaving the test page is recorded for your teacher.");
  };

  let sending = false;
  const submit = async (auto = false) => {
    if (sending) return;
    const arr = collect(), left = gradableN - answeredN(arr);
    if (!auto && left && !armed) { armed = true; $("#submit").textContent = `Hand in with ${left} blank?`; return; }
    sending = true; $("#submit").disabled = true; $("#submit").textContent = "Handing in…";
    try {
      const r = await rpc("submit_assignment", { p_player: me.player_id, p_token: me.token, p_answers: arr, p_meta: meta });
      clearInterval(sheetTimer); store.del(draftKey); store.del(metaKey); document.onvisibilitychange = null;
      resultScreen(s, r, { order, optOrder });
    } catch (e) {
      toast(e.message + (auto ? " Your answers are still saved on this phone; tell your teacher." : ""), true);
      sending = false; $("#submit").disabled = false; $("#submit").textContent = "Try again";
    }
  };
  $("#submit").onclick = () => submit(false);

  if (deadline) {
    let warned5 = false, warned1 = false;
    const tick = () => {
      const left = deadline - (Date.now() + offset), m = Math.floor(Math.max(0, left) / 60000), sec = Math.floor((Math.max(0, left) % 60000) / 1000);
      const el = $("#sTimer"); if (!el) return clearInterval(sheetTimer);
      el.textContent = `Time left: ${m}:${String(sec).padStart(2, "0")}`;
      el.classList.toggle("low", left < 5 * 60000);
      if (left < 5 * 60000 && !warned5 && left > 60000) { warned5 = true; toast("5 minutes left"); announce("5 minutes left"); }
      if (left < 60000 && !warned1) { warned1 = true; toast("1 minute left. It will hand in by itself."); announce("1 minute left"); }
      if (left <= 0) { clearInterval(sheetTimer); el.textContent = "Time's up. Handing in…"; submit(true); }
    };
    tick(); sheetTimer = setInterval(tick, 1000);
  }
}

function resultScreen(s, r, lay = null) {
  if (!r) return paperMsg("Handed in", "Your teacher can see your answers.");
  const { Q, order, optOrder } = lay || layout({ ...s, questions: s.questions || [] });
  const pctv = r.total ? Math.round((100 * r.score) / r.total) : 0;
  const when = r.reveal === "close" ? (r.closes_at ? `after the deadline (${new Date(r.closes_at).toLocaleString()})` : "when your teacher closes it") : "";
  const scoreCard = `<div class="score-card"><div class="big">${pctv}%</div><div style="display:grid;gap:4px"><span class="label">Handed in</span><strong>${(+r.score).toFixed(1).replace(/\.0$/, "")} out of ${r.total} marks</strong>
    ${r.pending ? `<span class="muted" style="font-size:14px">${r.pending} written answer${r.pending > 1 ? "s are" : " is"} marked provisionally; your teacher will confirm the final mark.</span>` : ""}
    <span class="muted" style="font-size:14px">${r.available ? "Corrections are shown under each question." : r.reveal === "never" ? "Your teacher has chosen not to show the answers." : `You'll see the correct answers ${when}. Open this link again then.`}</span></div></div>`;
  if (!r.available || !Q?.length) {
    paper(`<div class="sheet"><div class="sheet-head"><span class="brand">${LOGO} Afterclass</span><span class="label">${esc(me.nickname)}</span><h1>${esc(s.title)}</h1></div>${scoreCard}
      <div class="row"><button class="btn" id="another" type="button">Join another quiz</button></div></div>`);
    $("#another").onclick = () => leave();
    if (pctv >= 70 && r.pending === 0) confetti();
    return;
  }
  paper(`<div class="sheet"><div class="sheet-head"><span class="brand">${LOGO} Afterclass</span><span class="label">${esc(me.nickname)}</span><h1>${esc(s.title)}</h1></div>${scoreCard}
    ${order.map((qi, n) => {
      const x = Q[qi], res = r.results[qi] || {};
      let body;
      if (x.type === "short" || x.type === "word") body = `<div class="sq-opts"><div class="answer-given">${esc(res.text || "") || "<i>No answer</i>"}</div></div>`;
      else body = `<div class="sq-opts">${optOrder[qi].map((k, i) => `<div class="sq-opt ${x.type !== "poll" && k === res.answer ? "is-right" : k === res.choice && x.type !== "poll" ? "is-wrong" : ""}"><span class="omr ${k === res.choice ? "filled" : ""}">${LET[i]}</span><span class="ot">${esc(x.options[k])}</span></div>`).join("")}</div>`;
      let note = "";
      if (x.type === "short") note = `<b class="${res.credit >= 0.5 ? "g" : "b"}">${Math.round(res.credit * 100)}%${res.reviewed ? "" : " (provisional)"}.</b> ${res.answer ? "Model answer: " + rt(res.answer) : ""}`;
      else if (x.type === "mcq" || x.type === "tf") note = (res.is_correct ? `<b class="g">Correct.</b> ` : res.choice == null ? `<b class="b">Not answered.</b> ` : `<b class="b">Incorrect.</b> `) + esc(res.explanation || "");
      return `<div class="sq marked"><div class="sq-q"><span class="n">${n + 1}.</span><span class="t">${rt(x.question)}</span></div>${qimg(x)}${body}${note ? `<div class="sq-res">${note}</div>` : ""}</div>`;
    }).join("")}
    <div class="row"><button class="btn" id="another" type="button">Join another quiz</button></div></div>`);
  $("#another").onclick = () => leave();
  if (pctv >= 70) confetti();
}
function paperMsg(h, p) {
  paper(`<div class="sheet"><div class="sheet-head"><span class="brand">${LOGO} Afterclass</span><h1>${h}</h1></div><p>${p}</p><div><button class="btn primary" id="another" type="button">Join another quiz</button></div></div>`);
  $("#another").onclick = () => leave();
}

/* ================= teacher preview (nothing saved) ================= */
async function previewMode(quizId) {
  const { data } = await sb.auth.getSession();
  if (!data.session) return phone(`<div class="wait"><h1 style="font-size:26px">Sign in first</h1><p class="muted">Previews are for the teacher who owns the quiz.</p><a class="btn primary" href="teacher/">Teacher sign in</a></div>`, false);
  const quiz = await q(sb.from("quizzes").select("id,title,questions").eq("id", quizId).maybeSingle()).catch(() => null);
  if (!quiz) return phone(`<div class="wait"><h1 style="font-size:26px">Quiz not found</h1></div>`, false);
  const Q = quiz.questions;
  me = { player_id: "preview", nickname: "Preview" };
  paper(`<div class="sheet"><div class="notice"><b>Preview.</b> This is what students see in an assignment. Nothing is saved.</div>
    <div class="sheet-head"><span class="label">Preview</span><h1>${esc(quiz.title)}</h1></div>
    ${Q.map((x, qi) => `<div class="sq" data-q="${qi}"><div class="sq-q"><span class="n">${qi + 1}.</span><span class="t">${rt(x.question)}</span></div>${qimg(x)}
      ${x.type === "short" || x.type === "word" ? `<div class="sq-opts"><textarea id="t${qi}" class="lined" rows="3"></textarea></div>`
        : `<div class="sq-opts">${x.options.map((o, k) => `<label class="sq-opt" data-k="${k}"><input type="radio" name="q${qi}" value="${k}"><span class="omr">${LET[k]}</span><span class="ot">${esc(o)}</span></label>`).join("")}</div>`}
      <div class="sq-res" hidden></div></div>`).join("")}
    </div><div class="sheet-foot"><div><span>Preview mode</span><button class="btn primary" id="check" type="button">Check answers</button></div></div>`);
  $("#check").onclick = () => {
    Q.forEach((x, qi) => {
      const box = app.querySelector(`.sq[data-q="${qi}"]`), res = box.querySelector(".sq-res"); res.hidden = false;
      if (x.type === "mcq" || x.type === "tf") {
        const c = box.querySelector("input:checked"), ch = c ? +c.value : null;
        box.querySelectorAll(".sq-opt").forEach((l) => { const k = +l.dataset.k; l.classList.toggle("is-right", k === x.answer); l.classList.toggle("is-wrong", k === ch && k !== x.answer); });
        res.innerHTML = (ch === x.answer ? `<b class="g">Correct.</b> ` : `<b class="b">${ch == null ? "Not answered" : "Incorrect"}.</b> `) + esc(x.explanation || "");
      } else if (x.type === "short") res.innerHTML = `<b>Model answer:</b> ${rt(x.answer || "(none yet)")}`;
      else res.textContent = "Not marked (poll / word cloud).";
    });
    renderMath(app);
  };
}
