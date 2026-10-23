// The Learning Corner (kids/): a child-friendly app for primary pupils.
// Three ways in:
//  • Class tablet: the teacher opens the class-tablet link once (kids/#t=…). From then on
//    pupils tap their own picture (no codes, no passwords) and their stars are saved.
//  • Whole class on the board: kids/?board=1 from the teacher's dashboard. Nothing is saved.
//  • At home: kids/ on any phone. Pick your class and play; nothing is saved.
import { configured, rpc } from "../sb.js";
import { $, esc, store, toast } from "../ui.js";
import { unlock, setSound, soundOn } from "../sound.js";
import { mbe, AVATARS, avatarFor } from "./art.js";
import { SUBJECTS, ACTS, startLevel } from "./acts.js";
import { STORIES } from "./stories.js";
import { voice, say, runRound, results, memoryGame, MEMORY_SETS, traceGame, drawPad, RHYME_LIST, rhymeView, storyView } from "./play.js";

const app = $("#kapp");
const TOKEN_KEY = "afterclass.kids.token", GRADE_KEY = "afterclass.kids.grade";
const params = new URLSearchParams(location.search);
const board = params.get("board") === "1";
let token = store.get(TOKEN_KEY, "");
let klass = null;        // { class, pupils, live }
let pupil = null;        // the child playing now (tablet mode)
let grade = store.get(GRADE_KEY, 0);

// A tablet link arrives as kids/#t=<token>: keep it on this device and tidy the address bar.
const m = location.hash.match(/t=([a-f0-9]{40,})/);
if (m) { token = m[1]; store.set(TOKEN_KEY, token); history.replaceState(null, "", location.pathname + location.search); }
if (board) document.body.classList.add("board");

const levelKey = (id) => `afterclass.kids.lv.${pupil?.id || "guest"}.${id}`;
const firstName = (n) => { const parts = String(n || "").trim().split(/\s+/); return parts.length > 1 ? parts[1] : parts[0] || ""; };   // registers list "Surname Firstname"
const gradeFromClass = (name) => { const d = String(name || "").match(/\b([1-6])\b|([1-6])/); return d ? +(d[1] || d[2]) : 0; };

/* ---------- frame ---------- */
function frame(inner, { back = null } = {}) {
  app.innerHTML = `<header class="k-top">
      ${back ? `<button class="k-icon" data-go="${back}" aria-label="Back">⬅</button>` : `<span class="k-logo">${mbe("happy", 46)}<b>Learning Corner</b></span>`}
      <div class="k-who">${pupil ? `<span class="k-ava">${avatarFor(pupil)}</span><b>${esc(firstName(pupil.name))}</b><span class="k-star">★ ${pupil.stars || 0}</span>` : board ? `<b>Whole class</b>` : ""}${grade ? `<button class="k-chip" data-go="grade">Primary ${grade}</button>` : ""}</div>
      <div class="k-tools"><button class="k-icon" data-voice aria-label="Read aloud on or off">${voice.on ? "🗣️" : "🤫"}</button><button class="k-icon" data-sound aria-label="Sounds on or off">${soundOn ? "🔔" : "🔕"}</button>
        ${pupil ? `<button class="k-btn ghost sm" data-go="pupils">Change child</button>` : ""}</div>
    </header><main id="kmain" class="k-main">${inner}</main>`;
  return $("#kmain");
}
app.addEventListener("click", (e) => {
  unlock();
  const go = e.target.closest("[data-go]"); if (go) { e.preventDefault(); return nav(go.dataset.go); }
  if (e.target.closest("[data-voice]")) { voice.on = !voice.on; store.set("afterclass.kids.voice", voice.on); speechSynthesis?.cancel(); e.target.closest("[data-voice]").textContent = voice.on ? "🗣️" : "🤫"; if (voice.on) say("I will read to you."); }
  if (e.target.closest("[data-sound]")) { setSound(!soundOn); e.target.closest("[data-sound]").textContent = soundOn ? "🔔" : "🔕"; }
});
function nav(where) {
  speechSynthesis?.cancel();
  const [k, arg] = where.split(":");
  if (k === "hub") return hub();
  if (k === "pupils") { pupil = null; return pupils(); }
  if (k === "grade") return gradePick();
  if (k === "subject") return subject(arg);
  if (k === "act") return playAct(arg);
  if (k === "stories") return storiesList();
  if (k === "story") return story(arg);
  if (k === "games") return games();
  if (k === "memory") return memoryGame(frame("", { back: "games" }), arg, { home: () => nav("games"), onDone: (r) => finish({ id: "memory-" + arg, title: MEMORY_SETS[arg].name, subject: "games" }, r, () => nav("memory:" + arg), () => nav("games")) });
  if (k === "trace") return traceGame(frame("", { back: "games" }), arg, { home: () => nav("games"), onDone: (r) => finish({ id: "trace-" + arg, title: "Tracing", subject: "english" }, r, () => nav("trace:" + arg), () => nav("games")) });
  if (k === "draw") return drawPad(frame("", { back: "games" }), { home: () => nav("games") });
  if (k === "rhymes") return rhymes();
  if (k === "rhyme") return rhymeView(frame("", { back: "rhymes" }), RHYME_LIST[+arg], { home: () => nav("rhymes") });
  if (k === "live") return joinLive();
}

/* ---------- start ---------- */
start();
async function start() {
  if (token && configured) {
    frame(`<div class="k-center">${mbe("happy", 140)}<p>Getting your class…</p></div>`);
    try {
      klass = await rpc("kid_class", { p_token: token });
      grade = gradeFromClass(klass.class) || grade;
      return pupils();
    } catch (err) {
      return frame(`<div class="k-center">${mbe("oops", 140)}<h2>${esc(err.message)}</h2>
        <div class="row-c"><button class="k-btn big" data-retry>Try again</button><button class="k-btn ghost big" data-guest>Play without saving</button></div></div>`)
        .addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) start(); if (e.target.closest("[data-guest]")) { token = ""; grade ? hub() : gradePick(); } });
    }
  }
  grade ? hub() : gradePick();
}

/* ---------- choose class year (home / board) ---------- */
function gradePick() {
  const v = frame(`<div class="k-center"><div class="k-hello">${mbe("wave", 150)}<div><h1>Hello! I am Mbe.</h1><p>Which class are you in?</p></div></div>
    <div class="k-grid six">${[1, 2, 3, 4, 5, 6].map((g) => `<button class="k-tile grade" data-g="${g}"><b>${g}</b><span>Primary ${g}</span></button>`).join("")}</div></div>`);
  say("Hello! I am Mbe the tortoise. Which class are you in?");
  v.onclick = (e) => { const b = e.target.closest("[data-g]"); if (!b) return; grade = +b.dataset.g; store.set(GRADE_KEY, grade); hub(); };
}

/* ---------- tablet: tap your picture ---------- */
function pupils() {
  if (!klass) return hub();
  const list = klass.pupils;
  const v = frame(`<div class="k-center"><h1 class="k-h1">${esc(klass.class)}</h1><p class="k-sub">Find your picture and tap it!</p>
    ${list.length ? `<div class="k-grid pupils">${list.map((p, i) => `<button class="k-tile pupil" data-p="${i}"><span class="ava">${avatarFor(p)}</span><b>${esc(firstName(p.name))}</b><small>${esc(p.name)}</small></button>`).join("")}</div>`
      : `<p>Your teacher hasn't added the class list yet.</p>`}
    <p class="k-small"><button class="k-link" data-guest>Play without a name</button></p></div>`);
  say("Find your picture and tap it!");
  v.onclick = (e) => {
    if (e.target.closest("[data-guest]")) { pupil = null; return hub(); }
    const b = e.target.closest("[data-p]"); if (!b) return;
    pupil = list[+b.dataset.p];
    pupil.avatar ? hub() : chooseAvatar();
  };
}
function chooseAvatar() {
  const v = frame(`<div class="k-center"><h1 class="k-h1">Hello, ${esc(firstName(pupil.name))}!</h1><p class="k-sub">Choose your animal. It will be your picture.</p>
    <div class="k-grid avatars">${AVATARS.map((a) => `<button class="k-tile ava-pick" data-a="${a}">${a}</button>`).join("")}</div></div>`, { back: "pupils" });
  say(`Hello, ${firstName(pupil.name)}! Choose your animal.`);
  v.onclick = async (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    pupil.avatar = b.dataset.a;
    try { await rpc("kid_avatar", { p_token: token, p_student: pupil.id, p_avatar: pupil.avatar }); } catch { /* the picture still shows on this tablet */ }
    hub();
  };
}

/* ---------- the hub ---------- */
function hub() {
  if (!grade) return gradePick();
  const name = pupil ? firstName(pupil.name) : "";
  const live = klass?.live && pupil;
  const v = frame(`
    <div class="k-hello">${mbe("wave", 130)}<div><h1>${name ? `Hello, ${esc(name)}!` : "Let's learn!"}</h1><p>What shall we do today?</p></div></div>
    ${live ? `<button class="k-live" data-go="live"><span>🎮</span><div><b>Your teacher's game is on!</b><small>${esc(klass.live.title)} · tap to join</small></div></button>` : ""}
    <div class="k-grid subjects">${SUBJECTS.map((s) => `<button class="k-tile subj" style="--sc:${s.color}" data-go="subject:${s.id}"><span class="ic">${s.icon}</span><b>${s.name}</b><small>${s.full}</small></button>`).join("")}
      <button class="k-tile subj" style="--sc:#7A4A1E" data-go="stories"><span class="ic">📚</span><b>Stories</b><small>Folk tales and read-alongs</small></button>
      <button class="k-tile subj" style="--sc:#C2410C" data-go="games"><span class="ic">🧩</span><b>Games & drawing</b><small>Memory, tracing, drawing, rhymes</small></button></div>`);
  say(name ? `Hello, ${name}! What shall we do today?` : "Let's learn! What shall we do today?");
  return v;
}

/* ---------- a subject's activities, for this class year ---------- */
function subject(id) {
  const s = SUBJECTS.find((x) => x.id === id);
  const fits = s.acts.filter((a) => grade >= a.grades[0] && grade <= a.grades[1] + 1);
  const rest = s.acts.filter((a) => !fits.includes(a));
  const tile = (a) => { const lv = store.get(levelKey(a.id), 0); return `<button class="k-tile act" style="--sc:${s.color}" data-go="act:${a.id}"><span class="ic">${a.icon}</span><b>${esc(a.title)}</b>${lv ? `<small>${"⭐".repeat(lv)}</small>` : ""}</button>`; };
  frame(`<h1 class="k-h1">${s.icon} ${s.name}</h1><p class="k-sub">${s.full}</p>
    <div class="k-grid acts">${fits.map(tile).join("")}</div>
    ${rest.length ? `<details class="k-more"><summary>More ${s.name.toLowerCase()} for other classes</summary><div class="k-grid acts">${rest.map(tile).join("")}</div></details>` : ""}`, { back: "hub" });
  say(`${s.name}. Choose a game.`);
}

function playAct(id) {
  const a = ACTS[id]; if (!a) return hub();
  const level = store.get(levelKey(id), 0) || startLevel(a, grade);
  const count = grade <= 2 ? 8 : 10;
  runRound(frame("", { back: "subject:" + a.subject }), a, { level, count, home: () => nav("subject:" + a.subject),
    onDone: (r) => { store.set(levelKey(id), r.level); finish(a, r, () => playAct(id), () => nav("subject:" + a.subject)); } });
}

/* ---------- save and show stars ---------- */
async function finish(a, r, again, home, quiet = false) {
  const root = $("#kmain") || frame("");
  results(root, { correct: r.correct, total: r.total, title: a.title, again, home, saved: pupil && token ? "Saving your stars…" : "" });
  if (!(pupil && token)) return;
  try {
    const out = await rpc("kid_save", { p_token: token, p_student: pupil.id, p_activity: a.id, p_subject: a.subject || "", p_level: r.level || 1, p_correct: r.correct, p_total: r.total });
    pupil.stars = out.total_stars;
    const el = $("#kSaved"); if (el) el.textContent = `+${out.stars} ★ on the class star chart! You have ${out.total_stars} stars.`;
    const st = document.querySelector(".k-star"); if (st) st.textContent = `★ ${out.total_stars}`;
  } catch (err) { const el = $("#kSaved"); if (el) el.textContent = "Couldn't save the stars this time. " + err.message; }
}

/* ---------- stories ---------- */
function storiesList() {
  const fit = STORIES.filter((s) => grade >= s.grades[0] - 1 && grade <= s.grades[1] + 1);
  frame(`<h1 class="k-h1">📚 Stories</h1><p class="k-sub">Listen, read along, then answer three questions.</p>
    <div class="k-grid acts">${(fit.length ? fit : STORIES).map((s) => `<button class="k-tile act story-tile" style="--sc:#7A4A1E" data-go="story:${s.id}"><span class="ic">${s.cover}</span><b>${esc(s.title)}</b><small>${esc(s.from)}</small></button>`).join("")}</div>`, { back: "hub" });
  say("Stories. Choose one and I will read it to you.");
}
function story(id) {
  const st = STORIES.find((s) => s.id === id);
  storyView(frame("", { back: "stories" }), st, { home: () => nav("stories"), onQuizDone: (r, act) => finish({ ...act, subject: "english" }, r, () => story(id), () => nav("stories")) });
}

/* ---------- games ---------- */
function games() {
  const mem = Object.entries(MEMORY_SETS).filter(([k]) => grade >= 3 || !["yoruba", "igbo", "hausa"].includes(k));
  frame(`<h1 class="k-h1">🧩 Games & drawing</h1>
    <h2 class="k-h2">Memory pairs</h2><div class="k-grid acts">${mem.map(([k, s]) => `<button class="k-tile act" style="--sc:#C2410C" data-go="memory:${k}"><span class="ic">${s.icon}</span><b>${esc(s.name)}</b></button>`).join("")}</div>
    <h2 class="k-h2">Trace with your finger</h2><div class="k-grid acts">
      <button class="k-tile act" style="--sc:#23367E" data-go="trace:upper"><span class="ic">🅰️</span><b>Big letters</b></button>
      <button class="k-tile act" style="--sc:#23367E" data-go="trace:lower"><span class="ic">🔡</span><b>Small letters</b></button>
      <button class="k-tile act" style="--sc:#23367E" data-go="trace:numbers"><span class="ic">🔢</span><b>Numbers</b></button></div>
    <h2 class="k-h2">Make and sing</h2><div class="k-grid acts">
      <button class="k-tile act" style="--sc:#A0478C" data-go="draw"><span class="ic">🎨</span><b>Drawing pad</b></button>
      <button class="k-tile act" style="--sc:#A97810" data-go="rhymes"><span class="ic">🎶</span><b>Rhymes</b></button></div>`, { back: "hub" });
  say("Games and drawing. What would you like to play?");
}
function rhymes() {
  frame(`<h1 class="k-h1">🎶 Rhymes</h1><p class="k-sub">Tap a rhyme. Say it with Mbe!</p>
    <div class="k-grid acts">${RHYME_LIST.map((r, i) => `<button class="k-tile act" style="--sc:#A97810" data-go="rhyme:${i}"><span class="ic">${r.pic}</span><b>${esc(r.title)}</b></button>`).join("")}</div>`, { back: "games" });
}

/* ---------- join the teacher's live game: no PIN, no typing ---------- */
async function joinLive() {
  if (!klass?.live || !pupil) return hub();
  frame(`<div class="k-center">${mbe("cheer", 140)}<p>Joining your teacher's game…</p></div>`);
  try {
    const me = await rpc("join_session", { p_pin: klass.live.pin, p_nickname: firstName(pupil.name).slice(0, 24) || "Pupil", p_student_no: pupil.no || null, p_email: null });
    store.set("afterclass.player", me);
    location.href = "../";   // the normal game screen picks up the saved player
  } catch (err) {
    toast(err.message, true);
    try { klass = await rpc("kid_class", { p_token: token }); } catch {}
    hub();
  }
}
