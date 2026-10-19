// Host screen (projector / screen-share). Two modes:
//   ?s=<session>      live game: phones join with a PIN
//   ?teams=<quiz>     class teams: no phones; the teacher scores teams
import { sb, configured, rpc, q } from "./sb.js";
import { $, esc, rt, LET, TYPE_NAME, toast, ask, loadScript, confetti, store, qimg, renderMath, speak, canSpeak, questionSpeech } from "./ui.js";
import { sfx, unlock, soundOn, setSound, startMusic, stopMusic } from "./sound.js";

const stage = $("#stage"), hud = $("#hud"), tools = $("#tools"), qaPanel = $("#qaPanel");
const params = new URLSearchParams(location.search);
const sid = params.get("s"), teamsQuiz = params.get("teams");
const SITE = new URL("../", location.href).href;
const BIG = 60; // above this many players, show counts instead of every name

let S = null, T = null;                 // live session / teams state
let playerCount = 0, answered = 0, openQs = 0;
let channel = null, poll = 0, timerRAF = 0, busy = false, primary = null, lastTick = -1;
let scale = store.get("afterclass.scale", 1);

const fail = (msg) => { stage.innerHTML = `<div class="center" style="padding-top:12vh"><h1 style="font-size:32px">${esc(msg)}</h1><a class="btn primary" href="index.html">Go to the dashboard</a></div>`; };
const run = (fn) => async () => { if (busy) return; busy = true; try { await fn(); } catch (e) { toast(e.message, true); } finally { busy = false; } };
const gradable = (x) => x && x.type !== "poll" && x.type !== "word";
const settings = () => S?.settings || {};
const qList = () => (S ? S.questions : T.questions);

document.addEventListener("pointerdown", unlock);
applyScale();
if (!configured) fail("Afterclass is not connected to a database yet.");
else if (!sid && !teamsQuiz) fail("No game selected.");
else boot();

async function boot() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return fail("Sign in as the teacher first.");
  if (teamsQuiz) return bootTeams();
  S = await q(sb.from("sessions").select("*").eq("id", sid).maybeSingle()).catch(() => null);
  if (!S) return fail("That game could not be found.");
  if (S.kind !== "live" || S.settings?.teams) { location.href = "index.html#/report/" + sid; return; }

  let deb = 0;
  const soon = (fn) => { clearTimeout(deb); deb = setTimeout(fn, 700); };
  channel = sb.channel("live-" + sid)
    .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `session_id=eq.${sid}` }, () => soon(refresh))
    .on("postgres_changes", { event: "*", schema: "public", table: "audience_questions", filter: `session_id=eq.${sid}` }, () => soon(refreshQa))
    .subscribe();
  // Backup in case realtime is blocked on the network.
  poll = setInterval(() => { if (["lobby", "question"].includes(S.status)) refresh(); if (settings().qa) refreshQa(); }, S.status === "lobby" ? 3000 : 2000);

  renderTools();
  await refresh();
  if (settings().qa) refreshQa();
  if (S.status === "lobby") lobby();
  else if (S.status === "question") showQuestion();
  else if (S.status === "reveal") reveal(true);
  else if (S.status === "leaderboard") leaderboard(true);
  else podium();
}

/* ---------- toolbar ---------- */
function renderTools() {
  tools.innerHTML = `
    <button class="btn sm" id="tSound" type="button" aria-pressed="${soundOn}">${soundOn ? "Sound on" : "Sound off"}</button>
    <button class="btn sm" id="tSmall" type="button" aria-label="Smaller text">A−</button><button class="btn sm" id="tBig" type="button" aria-label="Bigger text">A+</button>
    ${canSpeak() ? `<button class="btn sm" id="tRead" type="button" title="Read the question aloud (R)">Read aloud</button>` : ""}
    ${S ? `<button class="btn sm" id="tLock" type="button" aria-pressed="${!!S.locked}">${S.locked ? "Locked" : "Lock entry"}</button>` : ""}
    ${S && settings().qa ? `<button class="btn sm" id="tQa" type="button">Q&amp;A <span class="badge" id="qaCount">${openQs || ""}</span></button>` : ""}
    <button class="btn sm" id="tFs" type="button">Full screen</button>
    <button class="btn sm" id="tEnd" type="button">End</button>`;
  $("#tSound").onclick = () => { setSound(!soundOn); unlock(); renderTools(); if (soundOn && S?.status === "lobby") startMusic(); };
  $("#tSmall").onclick = () => { scale = Math.max(0.7, +(scale - 0.1).toFixed(2)); applyScale(); };
  $("#tBig").onclick = () => { scale = Math.min(1.8, +(scale + 0.1).toFixed(2)); applyScale(); };
  $("#tRead")?.addEventListener("click", readAloud);
  $("#tLock")?.addEventListener("click", run(async () => { await rpc("host_set_lock", { p_session: sid, p_locked: !S.locked }); S.locked = !S.locked; renderTools(); toast(S.locked ? "Locked: nobody new can join" : "Unlocked: new people can join"); }));
  $("#tQa")?.addEventListener("click", () => { qaPanel.hidden = !qaPanel.hidden; refreshQa(); });
  $("#tFs").onclick = toggleFs;
  $("#tEnd").onclick = async () => {
    if (S && S.status !== "ended" && await ask("End the game now and show the final results?", "End game")) run(async () => { await setState("ended"); podium(); })();
    if (T && await ask("End the team game now?", "End game")) run(teamsEnd)();
  };
}
function applyScale() { document.documentElement.style.setProperty("--scale", scale); store.set("afterclass.scale", scale); }
const toggleFs = () => { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())?.catch?.(() => {}); };
function readAloud() { const i = S ? S.current_index : T?.i; const x = qList()?.[i]; if (x && (S ? ["question", "reveal"].includes(S.status) : T.phase !== "lobby")) speak(questionSpeech(x)); }
addEventListener("keydown", (e) => {
  if (e.target.closest("input,textarea,select,dialog")) return;
  if ((e.key === " " || e.key === "Enter") && primary) { e.preventDefault(); primary(); }
  else if (e.key.toLowerCase() === "f") toggleFs();
  else if (e.key.toLowerCase() === "r") readAloud();
  else if (e.key === "+" || e.key === "=") $("#tBig").click();
  else if (e.key === "-") $("#tSmall").click();
  else if (e.key.toLowerCase() === "q" && $("#tQa")) $("#tQa").click();
});

/* ---------- live plumbing ---------- */
async function setState(status, index = null) {
  const keep = { locked: S.locked };
  S = { ...(await rpc("host_set_state", { p_session: sid, p_status: status, p_index: index })), ...keep };
  channel?.send({ type: "broadcast", event: "sync", payload: { status: S.status, index: S.current_index } });
}
async function refresh() {
  const c = await rpc("host_counts", { p_session: sid }).catch(() => null);
  if (!c) return;
  const before = playerCount;
  playerCount = c.players; answered = c.answered; openQs = c.questions;
  if (S.status === "lobby" && playerCount > before && before > 0) sfx.join();
  renderHud();
  const badge = $("#qaCount"); if (badge) badge.textContent = openQs || "";
  if (S.status === "lobby") renderLobbyPlayers();
  if (S.status === "question") updateAnswered();
}
function renderHud() {
  const total = qList().length, i = S ? S.current_index : T.i;
  hud.innerHTML = (S ? `<div><span class="label">PIN</span><span class="v">${S.pin}</span></div><div><span class="label">${settings().audience === "webinar" ? "Joined" : "Players"}</span><span class="v">${playerCount}</span></div>` : `<div><span class="label">Teams</span><span class="v">${T.teams.length}</span></div>`)
    + (i >= 0 ? `<div><span class="label">Question</span><span class="v">${Math.min(i + 1, total)}/${total}</span></div>` : "");
}

/* ---------- lobby ---------- */
async function lobby() {
  renderHud();
  const joinUrl = `${SITE}?pin=${S.pin}`, web = settings().audience === "webinar";
  stage.innerHTML = `<div class="center"><span class="label">${esc(S.title)}</span>
      <div class="join-card"><div class="center" style="gap:6px"><span class="label">On your phone, go to</span><div class="join-url">${esc(SITE.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</div>
        <span class="label" style="margin-top:10px">and enter game PIN</span><div class="big-pin">${S.pin.slice(0, 3)} ${S.pin.slice(3)}</div>
        ${S.class_id ? `<span class="muted">Use your admission / matric number and your name as on the class list</span>` : ""}</div>
        <div class="qr" id="qr" aria-label="QR code to join"></div></div>
      <div class="row" style="justify-content:center"><span class="muted" id="pc"></span><button class="btn primary big" id="start" type="button">Start</button></div>
      <p class="muted" style="margin:0;font-size:14px">${web ? "Share this screen in Zoom / Google Meet, or paste the link in the chat. " : ""}Click a name to remove someone. Press Space to start.</p>
      <div class="players" id="plist"></div></div>`;
  renderLobbyPlayers();
  if (soundOn) startMusic();
  primary = run(startGame);
  $("#start").onclick = primary;
  $("#plist").onclick = async (e) => {
    const b = e.target.closest("[data-pid]"); if (!b) return;
    if (await ask(`Remove ${b.dataset.name}?`, "Remove", true)) { await sb.from("players").delete().eq("id", b.dataset.pid); refresh(); }
  };
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js");
    const qr = window.qrcode(0, "M"); qr.addData(joinUrl); qr.make();
    $("#qr").innerHTML = `<img alt="Scan to join" src="${qr.createDataURL(6, 0)}">`;
  } catch { $("#qr")?.remove(); }
}
let lobbyFetch = 0;
async function renderLobbyPlayers() {
  const box = $("#plist"); if (!box) return;
  $("#pc").textContent = playerCount ? `${playerCount} joined` : "Waiting for people to join…";
  if (Date.now() - lobbyFetch < 2500) return;
  lobbyFetch = Date.now();
  const rows = await q(sb.from("players").select("id,nickname").eq("session_id", sid).order("joined_at", { ascending: false }).limit(playerCount > BIG ? 30 : 200)).catch(() => []);
  box.innerHTML = rows.map((p) => `<button class="pl" data-pid="${p.id}" data-name="${esc(p.nickname)}" type="button">${esc(p.nickname)}</button>`).join("")
    + (playerCount > rows.length ? `<span class="pl more">+${playerCount - rows.length} more</span>` : "");
}
async function startGame() {
  if (!playerCount && !(await ask("No one has joined yet. Start anyway?", "Start"))) return;
  stopMusic();
  await nextQuestion(0);
}

/* ---------- countdown + question ---------- */
async function countdown(i) {
  const x = qList()[i];
  stage.innerHTML = `<div class="center countdown"><span class="label">Question ${i + 1} of ${qList().length}</span>
    <span class="chip ${x.type}">${TYPE_NAME[x.type]}</span><div class="gq">${rt(x.question)}</div><div class="cd-num" id="cd">3</div></div>`;
  renderMath(stage);
  for (const n of [3, 2, 1]) { $("#cd").textContent = n; sfx.count(n === 1); await new Promise((r) => setTimeout(r, 900)); }
}
async function nextQuestion(i) {
  primary = null;
  await countdown(i);
  answered = 0;
  await setState("question", i);
  S._localStart = Date.now(); // this laptop's clock may differ from the server's
  showQuestion();
}
function tilesHTML(x, reveal = null) {
  if (x.type === "short") return `<div class="panel-dark center"><span class="label">Written answer</span><p style="margin:0;font-size:1.4em">Type your answer on your phone.</p></div>`;
  if (x.type === "word") return `<div class="panel-dark center"><span class="label">Word cloud</span><p style="margin:0;font-size:1.4em">Type one word or a short phrase on your phone.</p></div>`;
  return `<div class="tiles">${x.options.map((o, k) => `<div class="tile o${k} ${reveal && gradable(x) ? (k === x.answer ? "right" : "dim") : ""}"><span class="bl">${LET[k]}</span><span class="t">${esc(o)}</span>${reveal ? `<span class="cnt">${reveal[k] ?? 0}</span>` : ""}</div>`).join("")}</div>`;
}
function showQuestion() {
  renderHud();
  const x = qList()[S.current_index];
  stage.innerHTML = `<div class="timer"><i id="bar"></i></div>
    <div class="spread"><span class="chip ${x.type}">${TYPE_NAME[x.type]}</span><span class="clock" id="clock"></span></div>
    <div class="gq">${rt(x.question)}</div>${qimg(x, "qimg host")}${tilesHTML(x)}
    <div class="spread"><span class="label" id="ans">0 answers</span><button class="btn primary" id="rev" type="button">${gradable(x) ? "Reveal answer" : "Show results"}</button></div>`;
  renderMath(stage);
  updateAnswered();
  primary = run(() => reveal());
  $("#rev").onclick = primary;
  if (soundOn) startMusic(true);
  startTimer(S.time_limit, S._localStart ?? new Date(S.question_started_at).getTime(), () => run(() => reveal())());
}
function startTimer(limit, start, onEnd) {
  cancelAnimationFrame(timerRAF); lastTick = -1;
  const bar = $("#bar"), clock = $("#clock");
  if (!limit) { bar.style.opacity = ".25"; clock.textContent = ""; return; }
  const endsAt = start + limit * 1000;
  const tick = () => {
    if (!$("#bar")) return;
    const left = Math.max(0, endsAt - Date.now()), secs = Math.ceil(left / 1000);
    bar.style.transform = `scaleX(${left / (limit * 1000)})`;
    bar.style.background = left < limit * 250 ? "var(--a)" : "var(--hi)";
    clock.textContent = secs;
    if (secs <= 5 && secs !== lastTick && secs > 0) sfx.tick();
    lastTick = secs;
    if (left <= 0) { sfx.timeUp(); return onEnd(); }
    timerRAF = requestAnimationFrame(tick);
  };
  timerRAF = requestAnimationFrame(tick);
}
function updateAnswered() {
  const el = $("#ans"); if (!el || S.status !== "question") return;
  el.textContent = `${answered} of ${playerCount} answered`;
  if (playerCount && answered >= playerCount && !busy) run(() => reveal())();
}

/* ---------- reveal ---------- */
async function reveal(resumed = false) {
  cancelAnimationFrame(timerRAF); stopMusic(); window.speechSynthesis?.cancel();
  if (!resumed) await setState("reveal");
  renderHud();
  const i = S.current_index, x = qList()[i];
  const d = await rpc("host_reveal_data", { p_session: sid, p_index: i });
  sfx.reveal();
  let body;
  if (x.type === "short") {
    const shown = d.texts.slice(0, 40);
    body = `<div class="panel-dark"><span class="label">Model answer</span><p style="margin:0;font-size:1.3em">${rt(x.answer)}</p>
        ${x.keyPoints?.length ? `<span class="label">Key points</span><p style="margin:0">${x.keyPoints.map(esc).join(" · ")}</p>` : ""}</div>
      <div class="panel-dark"><span class="label">${d.total} answers (shown without names)</span><div class="answers-list">
        ${shown.map((t) => `<div><span>${esc(t.text)}</span></div>`).join("") || '<p class="muted" style="margin:0">No answers.</p>'}</div>
        ${d.texts.length > shown.length ? `<span class="muted">and ${d.texts.length - shown.length} more</span>` : ""}</div>`;
  } else if (x.type === "word") {
    body = wordCloud(d.texts.map((t) => t.text));
  } else {
    const max = Math.max(1, ...d.dist);
    body = `<div class="dist" style="--n:${x.options.length}">${d.dist.map((c, k) => `<div><span class="n">${c}</span><div class="col" style="height:${Math.max(6, Math.round((120 * c) / max))}px;background:var(--${"abcd"[k] || "b"});opacity:${!gradable(x) || k === x.answer ? 1 : 0.35}"></div><span class="label">${LET[k]}${gradable(x) && k === x.answer ? " ✓" : ""}</span></div>`).join("")}</div>${tilesHTML(x, d.dist)}`;
  }
  const last = i >= qList().length - 1;
  const skipBoard = settings().hideScores || !gradable(x);
  const rate = d.total ? Math.round((100 * d.correct) / d.total) : 0;
  stage.innerHTML = `<div class="gq" style="font-size:calc(clamp(20px,3vw,34px) * var(--scale,1))">${rt(x.question)}</div>${qimg(x, "qimg host small")}${body}
    ${x.explanation ? `<p class="muted" style="text-align:center;max-width:70ch;margin:0 auto">${esc(x.explanation)}</p>` : ""}
    <div class="spread"><span class="label">${gradable(x) ? (settings().hideScores ? `${rate}% of the class got it right` : `${d.correct} of ${d.total} correct`) : `${d.total} responses`}</span>
      <button class="btn primary big" id="nx" type="button">${last ? "Finish" : skipBoard ? "Next question" : "Leaderboard"}</button></div>`;
  renderMath(stage);
  primary = run(async () => { if (last) { await setState("ended"); podium(); } else if (skipBoard) nextQuestion(i + 1); else leaderboard(); });
  $("#nx").onclick = primary;
}
function wordCloud(words) {
  const c = {}; words.forEach((w) => w && (c[w] = (c[w] || 0) + 1));
  const list = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 50);
  if (!list.length) return `<div class="panel-dark center"><p class="muted">No words yet.</p></div>`;
  const max = list[0][1];
  const cols = ["var(--hi)", "#8FB4FF", "#7FE0C6", "#FF9E8F", "#F5D06A", "#C9B3FF"];
  return `<div class="wordcloud">${list.sort(() => Math.random() - 0.5).map(([w, n], k) => `<span style="font-size:${(1 + 2.6 * (n / max)).toFixed(2)}em;color:${cols[k % cols.length]}" title="${n}">${esc(w)}</span>`).join("")}</div>`;
}

/* ---------- leaderboard + end ---------- */
async function leaderboard(resumed = false) {
  if (!resumed) await setState("leaderboard");
  renderHud();
  const top = await q(sb.from("players").select("nickname,score,streak").eq("session_id", sid).order("score", { ascending: false }).limit(5));
  stage.innerHTML = `<div class="center"><span class="label">After question ${S.current_index + 1} of ${qList().length}</span><h1 style="font-size:calc(clamp(30px,5vw,52px) * var(--scale,1))">Leaderboard</h1></div>
    <div class="board">${top.map((p, k) => `<div class="ln"><span class="rk">${k + 1}</span><span class="nm">${esc(p.nickname)}${p.streak > 1 ? ` <span class="pts">${p.streak} in a row</span>` : ""}</span><span class="sc">${p.score.toLocaleString()}</span></div>`).join("") || '<p class="muted" style="text-align:center">No players.</p>'}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary big" id="nx" type="button">Next question</button></div>`;
  primary = run(() => nextQuestion(S.current_index + 1));
  $("#nx").onclick = primary;
}
async function podium() {
  cancelAnimationFrame(timerRAF); clearInterval(poll); stopMusic();
  renderHud();
  const rows = await q(sb.from("players").select("nickname,score,correct").eq("session_id", sid).order("score", { ascending: false }).limit(10));
  const graded = qList().filter(gradable).length;
  primary = null;
  if (settings().hideScores || !graded) {
    const all = await q(sb.from("players").select("correct").eq("session_id", sid).limit(5000)).catch(() => []);
    const avg = all.length && graded ? Math.round((100 * all.reduce((t, p) => t + p.correct, 0)) / (all.length * graded)) : 0;
    stage.innerHTML = `<div class="end"><span class="label">${esc(S.title)}</span><h1>${graded ? (avg >= 70 ? "Brilliant work, everyone!" : avg >= 50 ? "Well done, everyone!" : "Good effort, everyone!") : "Thank you for taking part!"}</h1>
      ${graded ? `<div class="big-score">${avg}%</div><p class="muted" style="margin:0">of answers were correct across the whole ${settings().audience === "webinar" ? "audience" : "class"}</p>` : ""}
      <div class="row" style="justify-content:center"><a class="btn primary big" href="index.html#/report/${sid}">Open full report</a><a class="btn big" href="index.html#/quizzes">Back to quizzes</a></div></div>`;
    sfx.fanfare(); confetti(); return;
  }
  const [a, b, c] = rows;
  const spot = (p, k) => p ? `<div class="p${k}"><div class="who">${esc(p.nickname)}</div><div class="pts">${p.score.toLocaleString()} pts</div><div class="blk">${k}</div></div>` : "";
  stage.innerHTML = `<div class="center"><span class="label">${esc(S.title)}</span><h1 style="font-size:calc(clamp(34px,6vw,64px) * var(--scale,1))">Final results</h1></div>
    <div class="podium">${spot(b, 2)}${spot(a, 1)}${spot(c, 3)}</div>
    ${rows.length > 3 ? `<div class="board">${rows.slice(3).map((p, k) => `<div class="ln"><span class="rk">${k + 4}</span><span class="nm">${esc(p.nickname)}</span><span class="sc">${p.score.toLocaleString()}</span></div>`).join("")}</div>` : ""}
    <div class="row" style="justify-content:center"><a class="btn primary big" href="index.html#/report/${sid}">Open full report</a><a class="btn big" href="index.html#/quizzes">Back to quizzes</a></div>`;
  if (rows.length) { sfx.fanfare(); confetti(); }
}

/* ---------- Q&A panel ---------- */
async function refreshQa() {
  if (!S || !settings().qa) return;
  const rows = await q(sb.from("audience_questions").select("*").eq("session_id", sid).eq("hidden", false).order("votes", { ascending: false }).limit(100)).catch(() => null);
  if (!rows) return;
  openQs = rows.filter((r) => !r.answered).length;
  const badge = $("#qaCount"); if (badge) badge.textContent = openQs || "";
  if (qaPanel.hidden) return;
  const sorted = [...rows.filter((r) => !r.answered), ...rows.filter((r) => r.answered)];
  qaPanel.innerHTML = `<div class="spread"><h2 style="font-size:20px">Questions from the audience</h2><button class="btn sm" id="qaClose" type="button">Close</button></div>
    ${sorted.length ? sorted.map((r) => `<div class="qa-item ${r.answered ? "done" : ""}" data-id="${r.id}"><div class="qa-votes">▲ ${r.votes}</div><div class="qa-body">${esc(r.body)}</div>
      <div class="row">${r.answered ? `<span class="chip live">ANSWERED</span>` : `<button class="btn sm" data-qa="answered" type="button">Mark answered</button>`}<button class="btn sm ghost" data-qa="hide" type="button">Hide</button></div></div>`).join("")
      : `<p class="muted">No questions yet. People can ask from their phones at any time.</p>`}`;
  $("#qaClose").onclick = () => (qaPanel.hidden = true);
}
qaPanel.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-qa]"); if (!b) return;
  const id = b.closest("[data-id]").dataset.id;
  await sb.from("audience_questions").update(b.dataset.qa === "answered" ? { answered: true } : { hidden: true }).eq("id", id);
  refreshQa();
});

/* =================================================================
   CLASS TEAMS MODE (no phones)
   ================================================================= */
async function bootTeams() {
  const cfg = store.get("afterclass.teams", null);
  const quiz = await q(sb.from("quizzes").select("id,title,questions").eq("id", teamsQuiz).maybeSingle()).catch(() => null);
  if (!quiz) return fail("That quiz could not be found.");
  if (!cfg || cfg.quiz !== teamsQuiz) return fail("Start class teams from the Quizzes page.");
  T = { quiz, questions: quiz.questions.filter((x) => !x.needsAnswer), teams: cfg.teams.map((name) => ({ name, score: 0, right: 0 })), time: cfg.time, i: -1, phase: "lobby", played: 0 };
  renderTools(); renderHud();
  stage.innerHTML = `<div class="center"><span class="label">Class teams</span><h1 style="font-size:calc(clamp(30px,5vw,56px) * var(--scale,1))">${esc(quiz.title)}</h1>
    <div class="team-row">${T.teams.map((t, k) => `<div class="team-card t${k % 6}">${esc(t.name)}</div>`).join("")}</div>
    <p class="muted" style="margin:0">Each team agrees on one answer. After the reveal, tap the teams that got it right.</p>
    <button class="btn primary big" id="start" type="button">Start</button></div>`;
  if (soundOn) startMusic();
  primary = run(() => { stopMusic(); return teamsQuestion(0); });
  $("#start").onclick = primary;
}
async function teamsQuestion(i) {
  T.i = i; T.phase = "question"; primary = null;
  renderHud();
  await countdown(i);
  const x = T.questions[i];
  stage.innerHTML = `<div class="timer"><i id="bar"></i></div>
    <div class="spread"><span class="chip ${x.type}">${TYPE_NAME[x.type]}</span><span class="clock" id="clock"></span></div>
    <div class="gq">${rt(x.question)}</div>${qimg(x, "qimg host")}
    ${x.type === "short" || x.type === "word" ? `<div class="panel-dark center"><p style="margin:0;font-size:1.3em">Teams: agree on your answer and write it down.</p></div>` : tilesHTML(x)}
    <div class="row" style="justify-content:flex-end"><button class="btn primary" id="rev" type="button">${gradable(x) ? "Reveal answer" : "Next"}</button></div>`;
  renderMath(stage);
  speak(questionSpeech(x));
  if (soundOn) startMusic(true);
  primary = run(() => teamsReveal());
  $("#rev").onclick = primary;
  startTimer(T.time, Date.now(), () => run(() => teamsReveal())());
}
async function teamsReveal() {
  cancelAnimationFrame(timerRAF); stopMusic(); window.speechSynthesis?.cancel();
  const x = T.questions[T.i]; T.phase = "reveal"; T.played = T.i + 1;
  if (!gradable(x)) return teamsNext();
  sfx.reveal();
  const answer = x.type === "short" ? `<div class="panel-dark"><span class="label">Model answer</span><p style="margin:0;font-size:1.3em">${rt(x.answer)}</p></div>` : tilesHTML(x, null).replace(/class="tile o(\d)/g, (m, k) => `${m} ${+k === x.answer ? "right" : "dim"}`);
  stage.innerHTML = `<div class="gq" style="font-size:calc(clamp(20px,3vw,34px) * var(--scale,1))">${rt(x.question)}</div>${answer}
    ${x.explanation ? `<p class="muted" style="text-align:center;margin:0">${esc(x.explanation)}</p>` : ""}
    <div class="center"><span class="label">Tap the teams that got it right</span><div class="team-row" id="pick">${T.teams.map((t, k) => `<button class="team-card t${k % 6}" data-k="${k}" aria-pressed="false" type="button">${esc(t.name)}</button>`).join("")}</div>
    <button class="btn primary big" id="award" type="button">Award points</button></div>`;
  renderMath(stage);
  $("#pick").onclick = (e) => { const b = e.target.closest("[data-k]"); if (b) b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true"); };
  primary = run(async () => {
    const pts = Number(x.marks) > 0 ? Number(x.marks) * 100 : 100;
    $("#pick").querySelectorAll('[aria-pressed="true"]').forEach((b) => { const t = T.teams[+b.dataset.k]; t.score += pts; t.right++; });
    sfx.good();
    teamsBoard();
  });
  $("#award").onclick = primary;
}
function teamsBoard() {
  T.phase = "board";
  const max = Math.max(1, ...T.teams.map((t) => t.score));
  const last = T.i >= T.questions.length - 1;
  stage.innerHTML = `<div class="center"><span class="label">After question ${T.i + 1} of ${T.questions.length}</span><h1 style="font-size:calc(clamp(28px,4.5vw,48px) * var(--scale,1))">Scores</h1></div>
    <div class="board">${[...T.teams].sort((a, b) => b.score - a.score).map((t) => `<div class="ln"><span class="nm">${esc(t.name)}</span><span class="tbar"><i style="width:${(100 * t.score) / max}%"></i></span><span class="sc">${t.score}</span></div>`).join("")}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary big" id="nx" type="button">${last ? "Final results" : "Next question"}</button></div>`;
  primary = run(teamsNext);
  $("#nx").onclick = primary;
}
async function teamsNext() { if (T.i >= T.questions.length - 1) return teamsEnd(); return teamsQuestion(T.i + 1); }
async function teamsEnd() {
  cancelAnimationFrame(timerRAF); stopMusic();
  T.phase = "end"; primary = null;
  const sorted = [...T.teams].sort((a, b) => b.score - a.score);
  const [a, b, c] = sorted;
  const spot = (p, k) => p ? `<div class="p${k}"><div class="who">${esc(p.name)}</div><div class="pts">${p.score} pts</div><div class="blk">${k}</div></div>` : "";
  const tied = sorted.filter((t) => t.score === a.score);
  const headline = a.score === 0 ? "Thanks for playing!" : tied.length > 1 ? `It's a tie: ${tied.map((t) => esc(t.name)).join(" and ")}!` : `${esc(a.name)} wins!`;
  stage.innerHTML = `<div class="center"><span class="label">${esc(T.quiz.title)}</span><h1 style="font-size:calc(clamp(34px,6vw,64px) * var(--scale,1))">${headline}</h1></div>
    <div class="podium">${spot(b, 2)}${spot(a, 1)}${spot(c, 3)}</div>
    <div class="row" style="justify-content:center"><a class="btn primary big" href="index.html#/sessions">See results</a><a class="btn big" href="index.html#/quizzes">Back to quizzes</a></div>`;
  sfx.fanfare(); confetti();
  // keep a record under Results
  try {
    await q(sb.from("sessions").insert({ quiz_id: T.quiz.id, kind: "live", pin: "TEAMS", title: T.quiz.title, questions: T.questions, time_limit: T.time,
      status: "ended", ended_at: new Date().toISOString(), settings: { teams: T.teams, played: T.questions.slice(0, T.played || T.questions.length).filter(gradable).length } }));
  } catch (e) { toast("Couldn't save the scores: " + e.message, true); }
}
