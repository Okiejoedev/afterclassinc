// Record a lesson: the browser's own speech recognition (Google Chrome) writes down
// what the teacher says, live, while they teach. When they stop, the text goes to the
// quiz editor to make questions. Free: no audio is stored or sent to Afterclass
// (Chrome's speech service does the listening). The text is saved on this device as it
// arrives, so a refresh or a dropped connection doesn't lose the lesson.
import { $, esc, toast, ask, store } from "./ui.js";
import { ctx, frame } from "./shell.js";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const DRAFT = "afterclass.recording";       // the lesson being recorded
export const TRANSCRIPT = "afterclass.transcript";   // handed to the quiz editor
const LANGS = [["en-NG", "English (Nigeria)"], ["en-GB", "English (UK)"], ["en-US", "English (US)"], ["fr-FR", "French"]];

// Speech comes without full stops. Each pause in speech is treated as the end of a
// sentence, so the question writer can find definitions and lists in it.
function tidy(chunk) {
  let t = String(chunk).replace(/\b(?:um+|uh+|erm+|er|ehm+)\b[,.]?\s*/gi, "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.?!]$/.test(t) ? t : t + ".";
}
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ":" : ""}${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const wordCount = (t) => (t.match(/\S+/g) || []).length;

export function recordView() {
  const draft = store.get(DRAFT, null);
  const v = frame("quizzes", `
    <div class="page-h"><div><a href="#/quizzes" style="font-size:14px">← Quizzes</a><h1>Record a lesson</h1>
      <p class="muted" style="margin:4px 0 0">Teach as normal. Afterclass writes down what you say, then makes questions from it when you stop.</p></div></div>
    ${SR ? "" : `<div class="notice"><b>This browser can't turn speech into text.</b> Open Afterclass in <b>Google Chrome</b> on an Android phone or a computer, then come back to this page. You can still <a href="#/new">paste your notes</a> instead.</div>`}
    ${draft?.text ? `<div class="notice" id="recovered">A recording from ${esc(new Date(draft.at).toLocaleString())} (${wordCount(draft.text)} words) wasn't finished.
      <div class="row" style="margin-top:8px"><button class="btn sm primary" id="useDraft" type="button">Make questions from it</button><button class="btn sm" id="contDraft" type="button">Continue recording</button><button class="btn sm ghost danger" id="dropDraft" type="button">Discard</button></div></div>` : ""}
    <div class="bench">
      <section class="panel rec-panel">
        <div class="rec-top">
          <button class="rec-btn" id="recBtn" type="button" ${SR ? "" : "disabled"} aria-label="Start recording"><span></span></button>
          <div><div class="rec-time num" id="recTime">00:00</div><div class="muted" id="recState" aria-live="polite">Ready</div></div>
        </div>
        <div class="row">
          <button class="btn" id="pauseBtn" type="button" disabled>Pause</button>
          <button class="btn primary" id="stopBtn" type="button" disabled>Stop &amp; make questions</button>
        </div>
        <div class="field"><label class="label" for="recLang">Language you're teaching in</label>
          <select id="recLang">${LANGS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
        <div class="rec-tips">
          <b>For the best results</b>
          <ul>
            <li>Keep this page open and the phone unlocked. The screen stays on by itself while recording.</li>
            <li>Put the phone close to you, or use a clip-on microphone. Classroom noise lowers accuracy.</li>
            <li>Say key points clearly, as you would for notes: “Photosynthesis is the process by which…”, “The three types of rocks are…”, “…because…”.</li>
            <li>Tell your class you are recording. Only the text is kept on this device; no audio is saved.</li>
          </ul>
        </div>
      </section>
      <section class="panel">
        <div class="spread"><h2 style="font-size:20px">What you've said</h2><span class="muted num" id="recWords" style="font-size:13px">0 words</span></div>
        <textarea id="recText" rows="16" placeholder="Your words appear here as you speak. You can correct them at any time."></textarea>
        <p class="muted rec-interim" id="recInterim" aria-live="off"></p>
      </section>
    </div>`);

  const text = $("#recText", v), lang = $("#recLang", v);
  lang.value = store.get("afterclass.recLang", "en-NG");
  if (draft?.lang) lang.value = draft.lang;
  let rec = null, running = false, paused = false, startedAt = 0, elapsed = draft?.elapsed || 0, timer = 0, lock = null, netWait = false;

  const save = () => store.set(DRAFT, { text: text.value, lang: lang.value, at: Date.now(), elapsed: elapsed + (running && !paused ? Date.now() - startedAt : 0) });
  const setState = (s) => ($("#recState", v).textContent = s);
  const showWords = () => ($("#recWords", v).textContent = `${wordCount(text.value)} words`);
  const tick = () => ($("#recTime", v).textContent = clock(elapsed + (running && !paused ? Date.now() - startedAt : 0)));
  text.addEventListener("input", () => { showWords(); save(); });

  async function keepAwake() {
    try { if ("wakeLock" in navigator && !lock) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => (lock = null)); } } catch { /* not supported */ }
  }
  const letSleep = () => { lock?.release().catch(() => {}); lock = null; };

  function listen() {
    rec = new SR();
    rec.lang = lang.value; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onstart = () => { netWait = false; setState("Listening…"); $("#recBtn", v).classList.add("on"); };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { const t = tidy(r[0].transcript); if (t) { text.value += (text.value && !/\s$/.test(text.value) ? " " : "") + t; text.scrollTop = text.scrollHeight; showWords(); save(); } }
        else interim += r[0].transcript;
      }
      $("#recInterim", v).textContent = interim;
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { finish(false); setState("Microphone blocked"); toast("Allow the microphone for this site (tap the lock icon in the address bar), then press Record again.", true); }
      else if (e.error === "audio-capture") { finish(false); setState("No microphone found"); toast("No microphone was found. Check that one is connected.", true); }
      else if (e.error === "network") { netWait = true; setState("No internet. Waiting to reconnect…"); }
      // "no-speech" and "aborted" just restart below
    };
    // Chrome stops listening after pauses or a few minutes; keep going until the teacher stops.
    rec.onend = () => {
      $("#recInterim", v).textContent = "";
      if (running && !paused && !document.hidden) setTimeout(() => { if (running && !paused) try { rec.start(); } catch { /* already running */ } }, netWait ? 3000 : 200);
    };
    rec.start();
  }

  function begin() {
    store.set("afterclass.recLang", lang.value);
    running = true; paused = false; startedAt = Date.now();
    lang.disabled = true;
    listen(); keepAwake();
    timer = setInterval(tick, 500);
    $("#pauseBtn", v).disabled = false; $("#stopBtn", v).disabled = false;
    $("#recBtn", v).setAttribute("aria-label", "Recording");
    ctx.leaveGuard = async () => !running || await ask("You're still recording. Stop and leave this page? What you've said so far is kept.", "Leave", true);
    window.onbeforeunload = () => (running ? true : undefined);
  }
  function pause() {
    if (!running) return;
    paused = !paused;
    if (paused) { elapsed += Date.now() - startedAt; try { rec.stop(); } catch {} setState("Paused"); $("#pauseBtn", v).textContent = "Resume"; $("#recBtn", v).classList.remove("on"); letSleep(); }
    else { startedAt = Date.now(); listen(); keepAwake(); $("#pauseBtn", v).textContent = "Pause"; }
    save();
  }
  function finish(keepGoing = true) {
    if (running && !paused) elapsed += Date.now() - startedAt;
    running = false; paused = false; clearInterval(timer); tick();
    try { rec?.stop(); } catch {}
    letSleep(); lang.disabled = false;
    $("#recBtn", v).classList.remove("on"); $("#pauseBtn", v).disabled = true; $("#pauseBtn", v).textContent = "Pause";
    window.onbeforeunload = null; ctx.leaveGuard = null;
    save();
    return keepGoing;
  }
  function toEditor(words) {
    const t = words.trim();
    if (wordCount(t) < 40) { toast("That's too little to make questions from. Keep teaching, or add notes in the box.", true); return; }
    const when = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" });
    store.set(TRANSCRIPT, { text: t, title: `Lesson recording, ${when}` });
    store.del(DRAFT);
    location.hash = "#/new?transcript";
  }

  $("#recBtn", v).onclick = () => { if (!running) begin(); else if (paused) pause(); };
  $("#pauseBtn", v).onclick = pause;
  $("#stopBtn", v).onclick = () => { finish(); setState("Stopped"); toEditor(text.value); };

  // Phones stop listening when the screen goes off or the teacher switches apps.
  document.addEventListener("visibilitychange", function onVis() {
    if (!document.body.contains(v)) return document.removeEventListener("visibilitychange", onVis);
    if (!running || paused) return;
    if (document.hidden) setState("Paused while the screen was off");
    else { keepAwake(); try { rec.start(); } catch {} toast("Recording again. Keep this page open while you teach."); }
  });

  if (draft?.text) {
    text.value = draft.text; showWords(); tick();
    $("#useDraft", v).onclick = () => toEditor(text.value);
    $("#contDraft", v).onclick = () => { $("#recovered", v).remove(); begin(); };
    $("#dropDraft", v).onclick = async () => { if (await ask("Discard this unfinished recording?", "Discard", true)) { store.del(DRAFT); recordView(); } };
  }
}
