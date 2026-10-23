// The Learning Corner game engine: question rounds, spelling, memory pairs, letter tracing,
// a drawing pad, rhymes and story reading. Built for small hands and early readers:
// everything is read aloud, buttons are big, one tap does one thing, and mistakes get a
// second try with a kind word. Praise is for effort and thinking, not just being right.
import { $, esc, store, confetti } from "../ui.js";
import { sfx, unlock } from "../sound.js";
import { mbe } from "./art.js";
import { pick, shuffle, ri, LANG } from "./acts.js";

/* ---------- voice ---------- */
export const voice = { on: store.get("afterclass.kids.voice", true) };
const plain = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
export function say(text, rate = 0.85) {
  if (!voice.on || !("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plain(text).replace(/₦\s?(\d+)/g, "$1 naira").replace(/_{2,}/g, " blank ").replace(/×/g, " times ").replace(/÷/g, " divided by ").replace(/−/g, " minus "));
  u.rate = rate; u.pitch = 1.1;
  const vs = speechSynthesis.getVoices();
  const v = vs.find((x) => /en[-_]NG/i.test(x.lang)) || vs.find((x) => /en[-_]GB/i.test(x.lang)) || vs.find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

const PRAISE = ["You worked that out!", "Great thinking!", "Yes! Well done!", "Super effort!", "You got it!", "Brilliant!", "Your brain is growing!", "Excellent!", "Well done for checking!"];
const RETRY = ["Good try! Have another look.", "Nearly! Try again.", "Not quite. Look carefully.", "Keep going, you can do it!"];
const mood = (el, m) => { const box = el.querySelector(".k-mbe"); if (box) box.innerHTML = mbe(m, 96); };

/* =====================================================================
   QUESTION ROUND
   act: { id, title, gen(level) }; opts: { level, count, onDone({ correct, total, level }) , home() }
   ===================================================================== */
export function runRound(root, act, { level = 1, count = 10, onDone, home }) {
  let i = 0, correct = 0, streak = 0, misses = 0, lv = level, tries = 0, q = null, locked = false;
  const dots = () => Array.from({ length: count }, (_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("");
  function next() {
    if (i >= count) return onDone({ correct, total: count, level: lv });
    q = act.gen(lv); tries = 0; locked = false;
    root.innerHTML = `<div class="kq">
      <div class="kq-bar"><button class="k-icon" data-home aria-label="Back">🏠</button><div class="kq-dots" aria-label="Question ${i + 1} of ${count}">${dots()}</div>
        <span class="k-lv" title="Level">${"⭐".repeat(lv)}</span><button class="k-icon" data-say aria-label="Say it again">🔊</button></div>
      <div class="kq-main"><div class="k-mbe">${mbe("think", 96)}</div><h2 class="kq-text">${esc(q.text)}</h2></div>
      ${q.show ? `<div class="kq-show">${q.show}</div>` : ""}
      ${q.kind === "spell" ? spellBoard(q) : `<div class="kq-opts cols-${q.cols || (q.options.length > 3 ? 2 : q.options.length)}">${q.options.map((o, k) => `<button class="kq-opt" data-k="${k}">${o.html}</button>`).join("")}</div>`}
      <div class="kq-foot" id="kqFoot"></div></div>`;
    speakQuestion();
    if (q.kind === "spell") wireSpell();
  }
  const speakQuestion = () => say(q.readOptions && q.options ? `${q.say} ${q.options.map((o) => o.say || plain(o.html)).join(", or ")}?` : q.say);
  function right(btn) {
    locked = true; if (btn) btn.classList.add("right");
    if (tries === 0) { correct++; streak++; misses = 0; } else streak = 0;
    sfx.good(); mood(root, "cheer"); const p = pick(PRAISE); say(p); $("#kqFoot", root).innerHTML = `<p class="praise">${p}</p>`;
    let up = "";
    if (streak >= 3 && lv < 3) { lv++; streak = 0; up = "Level up! ⭐"; }
    if (up) $("#kqFoot", root).innerHTML += `<p class="levelup">${up}</p>`;
    i++; setTimeout(next, 1400);
  }
  function wrong(btn) {
    tries++; streak = 0; sfx.bad(); mood(root, "oops");
    if (btn) { btn.classList.add("wrongx"); btn.disabled = true; setTimeout(() => btn.classList.remove("wrongx"), 500); }
    if (tries < 2) { const r = pick(RETRY); say(r); $("#kqFoot", root).innerHTML = `<p class="retry">${r}</p>`; setTimeout(() => mood(root, "think"), 900); return; }
    // second miss: show the answer kindly, then move on
    locked = true; misses++;
    if (misses >= 2 && lv > 1) { lv--; misses = 0; }
    const ans = q.kind === "spell" ? q.word : q.options.find((o) => o.value === q.answer);
    if (q.kind !== "spell") root.querySelectorAll(".kq-opt").forEach((b) => { if (q.options[+b.dataset.k].value === q.answer) b.classList.add("right"); });
    const ansText = q.kind === "spell" ? q.word : ans.say || plain(ans.html);
    say(`The answer is ${ansText}. ${q.explain || ""}`);
    $("#kqFoot", root).innerHTML = `<p class="retry">The answer is <b>${esc(ansText)}</b>. ${esc(q.explain || "")}</p><button class="k-btn" data-next>Next ➜</button>`;
  }
  root.onclick = (e) => {
    unlock();
    if (e.target.closest("[data-home]")) return home();
    if (e.target.closest("[data-say]")) return speakQuestion();
    const h = e.target.closest("[data-say-text]"); if (h) return say(h.dataset.sayText);
    const hear = e.target.closest(".hear"); if (hear) return say(hear.dataset.say);
    if (e.target.closest("[data-next]")) { i++; return next(); }
    const b = e.target.closest(".kq-opt"); if (!b || locked || b.disabled) return;
    const o = q.options[+b.dataset.k];
    o.value === q.answer ? right(b) : wrong(b);
  };

  /* spelling: tap letter tiles into the boxes */
  function spellBoard(q) {
    const extra = shuffle("abcdefghijklmnopqrstuvwxyz".split("").filter((c) => !q.word.includes(c))).slice(0, Math.min(3, Math.max(1, 6 - q.word.length)));
    q.tiles = shuffle([...q.word.split(""), ...extra]);
    return `<div class="spell-slots">${q.word.split("").map(() => `<span class="slot"></span>`).join("")}</div>
      <div class="spell-tiles">${q.tiles.map((c, k) => `<button class="tile" data-t="${k}">${c}</button>`).join("")}</div>
      <div class="row-c"><button class="k-btn ghost" data-clear>↩ Clear</button><button class="k-icon" data-say-text="${esc(q.word)}" aria-label="Hear the word">🔊</button></div>`;
  }
  function wireSpell() {
    const slots = [...root.querySelectorAll(".slot")], used = [];
    root.querySelector(".spell-tiles").onclick = (e) => {
      const t = e.target.closest(".tile"); if (!t || t.disabled || locked) return;
      const at = used.length; if (at >= slots.length) return;
      used.push(+t.dataset.t); t.disabled = true; slots[at].textContent = t.textContent; sfx.tick?.();
      if (used.length === slots.length) {
        const w = used.map((k) => q.tiles[k]).join("");
        if (w === q.word) { slots.forEach((s) => s.classList.add("ok")); say(q.word); right(null); }
        else { wrong(null); if (!locked) setTimeout(clear, 600); else slots.forEach((s, k) => (s.textContent = q.word[k])); }
      }
    };
    const clear = () => { used.length = 0; slots.forEach((s) => (s.textContent = "")); root.querySelectorAll(".tile").forEach((b) => (b.disabled = false)); };
    root.querySelector("[data-clear]").onclick = clear;
  }
  next();
}

/* ---------- end of a round ---------- */
export function results(root, { correct, total, title, again, home, saved }) {
  const pct = correct / total, stars = pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1;
  const msg = stars === 3 ? "Amazing work!" : stars === 2 ? "Well done! You are getting better and better." : "Good effort! Practice makes progress.";
  root.innerHTML = `<div class="k-done">${mbe(stars === 3 ? "cheer" : "happy", 150)}
    <div class="k-stars">${[1, 2, 3].map((k) => `<span class="${k <= stars ? "on" : ""}">★</span>`).join("")}</div>
    <h2>${msg}</h2><p class="k-score">${correct} out of ${total} right first time · ${esc(title)}</p>
    <p class="k-saved" id="kSaved">${saved || ""}</p>
    <div class="row-c"><button class="k-btn big" data-again>🔁 Play again</button><button class="k-btn ghost big" data-home>🏠 Choose another</button></div></div>`;
  say(`${msg} You got ${correct} out of ${total}.`);
  if (stars === 3) { sfx.fanfare(); confetti(); } else sfx.reveal();
  root.onclick = (e) => { if (e.target.closest("[data-again]")) again(); if (e.target.closest("[data-home]")) home(); };
  return stars;
}

/* =====================================================================
   MEMORY PAIRS
   ===================================================================== */
const MEMORY = {
  animals: { name: "Animals", icon: "🦁", pairs: () => shuffle(["🦁", "🐘", "🦒", "🐢", "🐐", "🐓", "🐟", "🦋", "🐒", "🦓", "🐊", "🦜"]).slice(0, 6).map((e) => [e, e]) },
  fruit: { name: "Fruit & food", icon: "🥭", pairs: () => shuffle(["🥭", "🍊", "🍌", "🍍", "🥥", "🍉", "🌽", "🥚", "🍅", "🥜", "🍠", "🍇"]).slice(0, 6).map((e) => [e, e]) },
  numbers: { name: "Numbers & dots", icon: "🎲", pairs: () => shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 6).map((n) => [String(n), "●".repeat(n)]) },
  letters: { name: "Big & small letters", icon: "🔤", pairs: () => shuffle("ABDEFGHLMNQRT".split("")).slice(0, 6).map((c) => [c, c.toLowerCase()]) },
  yoruba: { name: "Yorùbá numbers", icon: "🥁", pairs: () => shuffle([...Array(10).keys()]).slice(0, 6).map((k) => [String(k + 1), LANG.yoruba.nums[k]]) },
  igbo: { name: "Igbo numbers", icon: "🪘", pairs: () => shuffle([...Array(10).keys()]).slice(0, 6).map((k) => [String(k + 1), LANG.igbo.nums[k]]) },
  hausa: { name: "Hausa numbers", icon: "🐎", pairs: () => shuffle([...Array(10).keys()]).slice(0, 6).map((k) => [String(k + 1), LANG.hausa.nums[k]]) },
};
export const MEMORY_SETS = MEMORY;
export function memoryGame(root, key, { onDone, home }) {
  const set = MEMORY[key], pairs = set.pairs();
  const cards = shuffle(pairs.flatMap(([a, b], k) => [{ k, face: a }, { k, face: b }]));
  let open = [], found = 0, moves = 0, busy = false;
  root.innerHTML = `<div class="kq"><div class="kq-bar"><button class="k-icon" data-home aria-label="Back">🏠</button><h2 class="kq-title">${set.icon} ${set.name}</h2><span class="k-lv" id="mMoves">0 turns</span></div>
    <p class="kq-text small">Turn over two cards. Find the pairs that match!</p>
    <div class="mem">${cards.map((c, i) => `<button class="mcard" data-i="${i}" aria-label="Card ${i + 1}"><span class="back">${mbeMini()}</span><span class="face ${c.face.length > 3 && !/●/.test(c.face) ? "word" : ""}">${esc(c.face)}</span></button>`).join("")}</div></div>`;
  say("Find the pairs that match!");
  root.onclick = (e) => {
    unlock();
    if (e.target.closest("[data-home]")) return home();
    const b = e.target.closest(".mcard"); if (!b || busy || b.classList.contains("up")) return;
    b.classList.add("up"); open.push(b); sfx.tick?.();
    const c = cards[+b.dataset.i]; if (/^[\p{L}\p{M}\d●]+$/u.test(c.face)) say(c.face.replace(/●+/, (m) => String(m.length)));   // words, letters and dots are read out; pictures aren't
    if (open.length < 2) return;
    moves++; $("#mMoves", root).textContent = `${moves} turn${moves === 1 ? "" : "s"}`;
    const [x, y] = open.map((el) => cards[+el.dataset.i]);
    if (x.k === y.k) { open.forEach((el) => el.classList.add("match")); open = []; found++; sfx.good(); if (found === pairs.length) setTimeout(() => onDone({ correct: Math.max(1, Math.min(pairs.length, pairs.length * 2 - Math.max(0, moves - pairs.length))), total: pairs.length, level: 1, moves }), 700); }
    else { busy = true; setTimeout(() => { open.forEach((el) => el.classList.remove("up")); open = []; busy = false; }, 900); }
  };
}
const mbeMini = () => `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M4 30 q2 -20 16 -20 q14 0 16 20z" fill="#B9512B"/><circle cx="20" cy="22" r="4" fill="none" stroke="#E3A835" stroke-width="2"/><rect x="2" y="29" width="36" height="4" rx="2" fill="#23367E"/></svg>`;

/* =====================================================================
   TRACING letters and numbers with a finger
   ===================================================================== */
export const TRACE_SETS = { upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), lower: "abcdefghijklmnopqrstuvwxyz".split(""), numbers: "0123456789".split("") };
export function traceGame(root, setKey, { home, onDone }) {
  const list = TRACE_SETS[setKey]; let idx = 0, done = 0;
  function show() {
    const ch = list[idx];
    root.innerHTML = `<div class="kq"><div class="kq-bar"><button class="k-icon" data-home aria-label="Back">🏠</button><h2 class="kq-title">Trace: ${esc(ch)}</h2><button class="k-icon" data-hear aria-label="Hear it">🔊</button></div>
      <div class="trace-wrap"><canvas id="tc" width="600" height="600" aria-label="Tracing area for ${esc(ch)}"></canvas></div>
      <p class="kq-text small" id="tMsg">Follow the dotted line with your finger.</p>
      <div class="row-c"><button class="k-btn ghost" data-prev>◀</button><button class="k-btn ghost" data-clear>↩ Again</button><button class="k-btn" data-check>✔ Done</button><button class="k-btn ghost" data-skip>▶</button></div></div>`;
    say(/\d/.test(ch) ? `Trace the number ${ch}.` : `Trace the letter ${ch}.`);
    const cv = $("#tc", root), g = cv.getContext("2d");
    const font = `700 470px Andika, "Atkinson Hyperlegible", sans-serif`;
    const guide = () => { g.clearRect(0, 0, 600, 600); g.font = font; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.lineWidth = 7; g.setLineDash([2, 18]); g.lineCap = "round"; g.strokeStyle = "#B9512B"; g.fillStyle = "#F3E6D2"; g.fillText(ch, 300, 470); g.strokeText(ch, 300, 470); g.setLineDash([]); };
    guide();
    // the shape to cover, drawn off-screen
    const off = document.createElement("canvas"); off.width = off.height = 600; const og = off.getContext("2d"); og.font = font; og.textAlign = "center"; og.fillText(ch, 300, 470);
    const target = og.getImageData(0, 0, 600, 600).data;
    const ink = document.createElement("canvas"); ink.width = ink.height = 600; const ig = ink.getContext("2d");
    let drawing = false, last = null;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 600 / r.width, (e.clientY - r.top) * 600 / r.height]; };
    const line = (a, b) => { for (const c of [g, ig]) { c.strokeStyle = c === g ? "#23367E" : "#000"; c.lineWidth = 44; c.lineCap = c.lineJoin = "round"; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); } };
    cv.onpointerdown = (e) => { unlock(); drawing = true; last = pt(e); line(last, last); cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = (e) => { if (!drawing) return; const p = pt(e); line(last, p); last = p; };
    cv.onpointerup = cv.onpointercancel = () => { drawing = false; };
    root.querySelector("[data-clear]").onclick = () => { guide(); ig.clearRect(0, 0, 600, 600); };
    root.querySelector("[data-check]").onclick = () => {
      const inkD = ig.getImageData(0, 0, 600, 600).data; let need = 0, got = 0, stray = 0, drawn = 0;
      for (let p = 3; p < target.length; p += 16) { const t = target[p] > 100, d = inkD[p] > 100; if (t) { need++; if (d) got++; } if (d) { drawn++; if (!t) stray++; } }
      const cover = got / Math.max(1, need), messy = stray / Math.max(1, drawn);
      if (cover > 0.55 && messy < 0.75) { sfx.good(); done++; const p = pick(PRAISE); say(p); $("#tMsg", root).innerHTML = `<span class="praise">${p}</span>`; setTimeout(() => { idx = (idx + 1) % list.length; show(); }, 1300); }
      else { sfx.bad(); const m = cover <= 0.55 ? "Trace over more of the dotted shape." : "Try to stay on the dotted shape."; say(m); $("#tMsg", root).textContent = m; }
    };
    root.querySelector("[data-prev]").onclick = () => { idx = (idx - 1 + list.length) % list.length; show(); };
    root.querySelector("[data-skip]").onclick = () => { idx = (idx + 1) % list.length; show(); };
    root.querySelector("[data-hear]").onclick = () => say(ch);
    root.querySelector("[data-home]").onclick = () => { if (done && onDone) onDone({ correct: done, total: done, level: 1 }, true); else home(); };
  }
  show();
}

/* =====================================================================
   DRAWING PAD
   ===================================================================== */
export function drawPad(root, { home }) {
  const COLORS = ["#1F1B2E", "#23367E", "#2F6FD0", "#2E9A4F", "#8CBF4F", "#F2C230", "#E3A835", "#F28C28", "#E04B3A", "#B9512B", "#8B5A2B", "#A0478C", "#F48FB1", "#FFFFFF"];
  let color = COLORS[1], size = 16;
  root.innerHTML = `<div class="kq"><div class="kq-bar"><button class="k-icon" data-home aria-label="Back">🏠</button><h2 class="kq-title">🎨 Draw a picture</h2><button class="k-icon" data-save aria-label="Save my picture">💾</button></div>
    <div class="pad-tools"><div class="pad-colors">${COLORS.map((c) => `<button class="pc ${c === color ? "on" : ""}" style="--pc:${c}" data-c="${c}" aria-label="colour"></button>`).join("")}</div>
      <div class="pad-sizes">${[8, 16, 32].map((s) => `<button class="ps ${s === size ? "on" : ""}" data-s="${s}" aria-label="brush size ${s}"><i style="width:${s / 1.4 + 4}px;height:${s / 1.4 + 4}px"></i></button>`).join("")}<button class="k-btn ghost" data-wipe>🧽 Clear</button></div></div>
    <div class="pad-wrap"><canvas id="pad" width="1000" height="700" aria-label="Drawing area"></canvas></div>
    <p class="kq-text small">Ideas: your family · your school · a market · your favourite animal · Mbe the tortoise!</p></div>`;
  say("Draw a picture! Choose a colour and draw with your finger.");
  const cv = $("#pad", root), g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 1000, 700);
  let last = null;
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 1000 / r.width, (e.clientY - r.top) * 700 / r.height]; };
  const line = (a, b) => { g.strokeStyle = color; g.lineWidth = size * 1.6; g.lineCap = g.lineJoin = "round"; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); };
  cv.onpointerdown = (e) => { unlock(); last = pt(e); line(last, last); cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = (e) => { if (!last) return; const p = pt(e); line(last, p); last = p; };
  cv.onpointerup = cv.onpointercancel = () => { last = null; };
  root.onclick = (e) => {
    if (e.target.closest("[data-home]")) return home();
    const c = e.target.closest("[data-c]"); if (c) { color = c.dataset.c; root.querySelectorAll(".pc").forEach((b) => b.classList.toggle("on", b === c)); }
    const s = e.target.closest("[data-s]"); if (s) { size = +s.dataset.s; root.querySelectorAll(".ps").forEach((b) => b.classList.toggle("on", b === s)); }
    if (e.target.closest("[data-wipe]")) { g.fillStyle = "#fff"; g.fillRect(0, 0, 1000, 700); }
    if (e.target.closest("[data-save]")) { const a = document.createElement("a"); a.download = "my-drawing.png"; a.href = cv.toDataURL("image/png"); a.click(); say("Saved!"); }
  };
}

/* =====================================================================
   RHYMES (traditional, read aloud line by line)
   ===================================================================== */
export const RHYME_LIST = [
  { title: "Twinkle, Twinkle, Little Star", pic: "⭐", lines: ["Twinkle, twinkle, little star,", "How I wonder what you are!", "Up above the world so high,", "Like a diamond in the sky.", "Twinkle, twinkle, little star,", "How I wonder what you are!"] },
  { title: "Head, Shoulders, Knees and Toes", pic: "🧍", lines: ["Head, shoulders, knees and toes, knees and toes.", "Head, shoulders, knees and toes, knees and toes.", "And eyes and ears and mouth and nose.", "Head, shoulders, knees and toes, knees and toes."] },
  { title: "One, Two, Buckle My Shoe", pic: "👞", lines: ["One, two, buckle my shoe;", "Three, four, knock at the door;", "Five, six, pick up sticks;", "Seven, eight, lay them straight;", "Nine, ten, a big fat hen!"] },
  { title: "Rain, Rain, Go Away", pic: "🌧️", lines: ["Rain, rain, go away,", "Come again another day.", "All the children want to play.", "Rain, rain, go away."] },
  { title: "Hickory Dickory Dock", pic: "🐭", lines: ["Hickory, dickory, dock,", "The mouse ran up the clock.", "The clock struck one,", "The mouse ran down,", "Hickory, dickory, dock."] },
  { title: "Baa, Baa, Black Sheep", pic: "🐑", lines: ["Baa, baa, black sheep, have you any wool?", "Yes sir, yes sir, three bags full.", "One for the master, and one for the dame,", "And one for the little boy who lives down the lane."] },
  { title: "Row, Row, Row Your Boat", pic: "🛶", lines: ["Row, row, row your boat,", "Gently down the stream.", "Merrily, merrily, merrily, merrily,", "Life is but a dream."] },
  { title: "Five Little Ducks", pic: "🦆", lines: ["Five little ducks went out one day,", "Over the hill and far away.", "Mother duck said, “Quack, quack, quack, quack!”", "But only four little ducks came back."] },
];
export function rhymeView(root, r, { home }) {
  let k = -1, timer = 0;
  root.innerHTML = `<div class="kq"><div class="kq-bar"><button class="k-icon" data-home aria-label="Back">🏠</button><h2 class="kq-title">${r.pic} ${esc(r.title)}</h2><span></span></div>
    <div class="rhyme">${r.lines.map((l, i) => `<p data-l="${i}">${esc(l)}</p>`).join("")}</div>
    <div class="row-c"><button class="k-btn big" data-play>▶ Say it with me</button></div></div>`;
  const step = () => {
    root.querySelectorAll("[data-l]").forEach((p) => p.classList.toggle("on", +p.dataset.l === k));
    if (k >= r.lines.length) { k = -1; return; }
    if (!("speechSynthesis" in window) || !voice.on) { timer = setTimeout(() => { k++; step(); }, 2200); return; }
    const u = new SpeechSynthesisUtterance(r.lines[k]); u.rate = 0.8; u.pitch = 1.15; u.onend = () => { k++; timer = setTimeout(step, 250); };
    const v = speechSynthesis.getVoices().find((x) => /en[-_](NG|GB)/i.test(x.lang)); if (v) u.voice = v; speechSynthesis.speak(u);
  };
  root.onclick = (e) => {
    unlock();
    if (e.target.closest("[data-home]")) { clearTimeout(timer); speechSynthesis?.cancel(); return home(); }
    if (e.target.closest("[data-play]")) { clearTimeout(timer); speechSynthesis?.cancel(); k = 0; step(); }
  };
}

/* =====================================================================
   STORY READER
   ===================================================================== */
export function storyView(root, st, { home, onQuizDone }) {
  let p = 0;
  function page() {
    if (p >= st.pages.length) return quizPart();
    const [pic, text] = st.pages[p];
    root.innerHTML = `<div class="kq story"><div class="kq-bar"><button class="k-icon" data-home aria-label="Back">🏠</button><h2 class="kq-title">${esc(st.title)}</h2><button class="k-icon" data-say aria-label="Read it again">🔊</button></div>
      <div class="story-pic">${pic}</div><p class="story-text">${esc(text)}</p>
      <div class="row-c"><button class="k-btn ghost" data-back ${p ? "" : "disabled"}>◀ Back</button><span class="k-page">${p + 1} / ${st.pages.length}</span><button class="k-btn" data-fwd>Next ▶</button></div></div>`;
    say(text, 0.82);
  }
  function quizPart() {
    const act = { id: "story-" + st.id, title: st.title, gen: (() => { let n = 0; return () => { const [qq, opts, ans] = st.quiz[n++ % st.quiz.length]; return { say: qq, text: qq, show: "", readOptions: true, options: shuffle(opts).map((x) => ({ html: x, value: x, say: x })), answer: ans }; }; })() };
    runRound(root, act, { level: 1, count: st.quiz.length, home, onDone: (r) => onQuizDone(r, act) });
  }
  root.innerHTML = `<div class="k-cover"><div class="story-pic big">${st.cover}</div><h2>${esc(st.title)}</h2><p class="muted">${esc(st.from)}</p><button class="k-btn big" data-start>📖 Read with me</button><button class="k-btn ghost" data-home>🏠 Back</button></div>`;
  root.onclick = (e) => { unlock(); if (e.target.closest("[data-home]")) return home(); if (e.target.closest("[data-start]")) { root.onclick = null; bindStory(); page(); } };
  const bindStory = () => {
    root.onclick = (e) => {
      if (e.target.closest("[data-home]")) { speechSynthesis?.cancel(); return home(); }
      if (e.target.closest("[data-say]")) return say(st.pages[p][1], 0.82);
      if (e.target.closest("[data-back]")) { p = Math.max(0, p - 1); return page(); }
      if (e.target.closest("[data-fwd]")) { p++; return page(); }
    };
  };
}
