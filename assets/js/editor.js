// Quiz editor: build questions from notes (one or many files), import past
// questions, and edit each question (pictures, maths, marks, compulsory).
import { sb, q, rpc } from "./sb.js";
import { AI_ENABLED } from "./config.js";
import { $, esc, rt, LET, TYPE_NAME, uid, shuffle, toast, ask, dialog, qimg, renderMath, symbolBarHTML, store } from "./ui.js";
import { ctx, frame, statusChip } from "./shell.js";
import { readFiles, readFile } from "./extract.js";
import { aiGenerate, aiCheck, aiExpand, basicGenerate, normalize, LEVELS, DIFFICULTY, LANGUAGES } from "./generate.js";
import { checkFacts } from "./factcheck.js";
import { TOPICS, suggestTopics } from "./topics.js";
import { expandFromLesson } from "./expand.js";
import { parseQuestions } from "./import.js";
import { shrinkImage } from "./school.js";

export async function editorView(id, opts = {}) {
  let quiz = { id: null, title: "Untitled quiz", source_name: null, questions: [], review_status: "draft", review_note: "" };
  if (id) {
    const row = await q(sb.from("quizzes").select("*").eq("id", id).eq("owner_id", ctx.user.id).maybeSingle());
    if (!row) { toast("Quiz not found", true); location.hash = "#/quizzes"; return; }
    quiz = row;
  }
  let dirty = false, editing = null, files = [], source = { text: "", pdfs: [] };
  const markDirty = (val = true) => { dirty = val; const s = $("#saveState"); if (s) s.textContent = val ? "Unsaved changes" : "All changes saved"; };
  ctx.leaveGuard = async () => !dirty || await ask("You have unsaved changes. Leave without saving?", "Leave", true);
  window.onbeforeunload = () => (dirty ? true : undefined);
  const defLevel = { primary: "p46", secondary: "jss", university: "uni", polytechnic: "poly", college: "coe", training: "adult" }[ctx.kind] || "jss";
  const inSchool = !!ctx.head?.school;

  const v = frame("quizzes", `
    <div class="page-h"><div><a href="#/quizzes" style="font-size:14px">← Quizzes</a><h1>${id ? "Edit quiz" : "New quiz"} ${statusChip(quiz.review_status)}</h1></div>
      <div class="row"><span class="muted" id="saveState" style="font-size:14px">${id ? "All changes saved" : "Not saved yet"}</span>${id ? `<a class="btn" href="#/print/${id}">Print exam</a>` : ""}
      ${inSchool && id && quiz.review_status !== "submitted" ? `<button class="btn" id="sendReview" type="button">Send for review</button>` : ""}
      <button class="btn big" id="playLive" type="button">▶ Play live</button><button class="btn primary big" id="save" type="button">Save quiz</button></div></div>
    ${quiz.review_status === "changes" && quiz.review_note ? `<div class="notice"><b>Your HOD asked for changes:</b> ${esc(quiz.review_note)}</div>` : ""}
    <div class="bench${opts.blank ? " solo" : ""}" id="bench">
      <section class="panel" aria-labelledby="srcH" id="srcPanel" ${opts.blank ? "hidden" : ""}>
        <div class="spread"><h2 id="srcH" style="font-size:22px">1 · Your material</h2><div class="row"><a class="btn sm" href="#/record">Record a lesson</a><button class="btn sm" id="importBtn" type="button">Import past questions</button></div></div>
        <label class="drop" id="drop" for="file">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3"/></svg>
          <strong>Drop lesson notes here</strong>
          <small>or tap to choose · PDF, Word (.docx), TXT · several files at once for a term exam${AI_ENABLED ? " · scanned PDFs work with the AI writer" : ""}</small>
          <input type="file" id="file" multiple accept=".pdf,.docx,.txt,.md,application/pdf,text/plain" hidden>
        </label>
        <div class="filechips" id="fileChips" hidden></div>
        <div class="field"><label class="label" for="srcText">Text from your files (trim it, or paste notes here)</label>
          <textarea id="srcText" rows="8" placeholder="The text from your files appears here. You can also paste notes directly."></textarea>
          <div class="row"><button class="btn sm" id="checkBtn" type="button">Check facts</button><button class="btn sm" id="expandBtn" type="button">Expand my notes</button></div></div>
        <div class="notes-box" id="factBox" hidden></div>
        <div class="notes-box" id="expandBox" hidden></div>
        <div class="opts">
          <div class="field"><label class="label" for="count">Questions</label><select id="count">${[5, 10, 15, 20, 30, 40, 50, 60].map((n) => `<option ${n === 10 ? "selected" : ""}>${n}</option>`).join("")}</select></div>
          <div class="field"><label class="label" for="level">Level</label><select id="level">${LEVELS.map(([k, l]) => `<option value="${k}" ${k === defLevel ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="field"><label class="label" for="difficulty">Difficulty</label><select id="difficulty">${DIFFICULTY.map(([k, l]) => `<option value="${k}" ${k === "mixed" ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="field"><label class="label" for="language">Language</label><select id="language">${LANGUAGES.map((l) => `<option>${l}</option>`).join("")}</select></div>
          <div class="field"><label class="label" for="engine">Writer</label><select id="engine">${AI_ENABLED ? `<option value="ai">AI (best quality)</option>` : ""}<option value="basic">Built-in (free, simple)</option></select></div>
        </div>
        <div class="field"><span class="label">Question types</span><div class="checks">
          <label class="check"><input type="checkbox" id="tMcq" checked> Multiple choice</label>
          <label class="check"><input type="checkbox" id="tTf" checked> True / False</label>
          <label class="check"><input type="checkbox" id="tShort" checked> Written / theory</label>
        </div></div>
        ${AI_ENABLED ? "" : `<p class="muted" style="margin:0;font-size:13px">The built-in writer asks exam-style questions about what your notes state: definitions, lists, functions, stages, reasons and facts (direct and best-answer questions, NOT questions, matching, correct order, assertion–reason, and structured theory questions with marks). For questions that apply ideas to new situations, other languages and maths, turn on the AI writer (README step 7).</p>`}
        <label class="check" id="appendWrap" style="justify-self:start" hidden><input type="checkbox" id="append"> Add to the current questions instead of replacing them</label>
        <div class="row"><button class="btn primary big" id="gen" type="button">Generate questions</button></div>
        <div class="status" id="status" role="status" aria-live="polite"></div>
      </section>
      <section class="panel" aria-labelledby="qH">
        <div class="spread"><h2 id="qH" style="font-size:22px">${opts.blank ? "Your questions" : "2 · Review questions"}</h2>
          <div class="row">${opts.blank ? `<button class="btn sm ghost" id="showSrc" type="button">Write from notes instead</button>` : ""}<button class="btn sm primary" id="addQ" type="button">+ Add question</button><button class="btn sm" id="shuf" type="button">Shuffle</button></div></div>
        <div class="field"><label class="label" for="title">Quiz title</label><input class="qtitle" id="title" type="text" maxlength="120"></div>
        <div id="fixNote"></div>
        <ol class="qlist" id="qlist"></ol>
      </section>
    </div>`);

  $("#title", v).value = quiz.title;
  $("#title", v).oninput = (e) => { quiz.title = e.target.value; markDirty(); };
  const setStatus = (m, err) => { const s = $("#status", v); s.textContent = m; s.className = "status" + (err ? " err" : ""); };
  // Text from "Record a lesson" arrives here, ready to check and turn into questions.
  if (opts.transcript) {
    const t = store.get("afterclass.transcript", null);
    if (t?.text) {
      $("#srcText", v).value = t.text; quiz.title = t.title; $("#title", v).value = quiz.title;
      store.del("afterclass.transcript"); markDirty();
      setStatus("This is the text of your lesson recording. Read it, correct any words that came out wrong, then press Generate questions.");
      setTimeout(() => $("#srcText", v).scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }

  /* ----- files ----- */
  const renderChips = () => {
    const box = $("#fileChips", v); box.hidden = !files.length;
    box.innerHTML = files.map((f, i) => `<span class="chip">${esc(f.name)} <button type="button" class="chip-x" data-rm="${i}" aria-label="Remove ${esc(f.name)}">×</button></span>`).join("") + (files.length ? `<span class="muted" style="font-size:13px">${source.pages ? source.pages + " pages · " : ""}${(source.text.split(/\s+/).filter(Boolean).length).toLocaleString()} words</span>` : "");
  };
  const loadFiles = async () => {
    if (!files.length) { source = { text: "", pdfs: [] }; $("#srcText", v).value = ""; renderChips(); return; }
    try {
      source = await readFiles(files, setStatus);
      $("#srcText", v).value = source.text;
      renderChips();
      const msgs = [...source.notes];
      if (source.pdfs.length) msgs.push(AI_ENABLED ? `${source.pdfs.length} scanned PDF${source.pdfs.length > 1 ? "s" : ""} will be read by the AI writer.` : "Some PDFs are scanned pictures with no text. Paste their text, or turn on the AI writer (README step 7).");
      setStatus(msgs.join(" ") || "Ready. Pick your settings and generate.", !!source.notes.length);
      if (quiz.title === "Untitled quiz" && files.length === 1) { quiz.title = files[0].name.replace(/\.[^.]+$/, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim(); $("#title", v).value = quiz.title; }
      quiz.source_name = files.map((f) => f.name).join(", ").slice(0, 300);
    } catch (e) { setStatus(e.message || "A file could not be read.", true); }
  };
  const addFiles = (list) => { files.push(...[...list].filter((f) => !files.some((g) => g.name === f.name && g.size === f.size))); loadFiles(); };
  const drop = $("#drop", v);
  $("#file", v).onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  $("#fileChips", v).onclick = (e) => { const b = e.target.closest("[data-rm]"); if (b) { files.splice(+b.dataset.rm, 1); loadFiles(); } };

  /* ----- check facts / expand short notes ----- */
  // Fixes find their text again by its original words, so fixing one doesn't break the others.
  const srcBox = $("#srcText", v);
  if (quiz.notes && !srcBox.value) srcBox.value = quiz.notes;   // notes saved with this quiz
  let checkedText = null, issues = [];
  const applyIssue = (it) => {
    const t = srcBox.value, at = t.indexOf(it.orig, Math.max(0, it.at - 80)), i = at >= 0 ? at : t.indexOf(it.orig);
    if (i < 0) return false;
    srcBox.value = t.slice(0, i) + it.replacement + t.slice(i + it.orig.length);
    it.done = true; return true;
  };
  function showFacts(note = "", thenGenerate = false) {
    const box = $("#factBox", v), open = issues.filter((x) => !x.done && !x.ignored);
    box.hidden = false;
    box.innerHTML = `<div class="spread"><b>${open.length ? `Check ${open.length === 1 ? "this fact" : `these ${open.length} facts`}` : "Fact check"}</b><button class="btn ghost sm" data-close type="button">Close</button></div>
      ${open.length ? `<ul class="todo">${open.map((x) => `<li data-i="${issues.indexOf(x)}"><div><div class="muted" style="font-size:13px">You wrote: “${esc(x.said)}”</div><div><b>Correct:</b> ${esc(x.correct)}${x.ai ? ` <span class="chip">AI</span>` : ""}</div></div>
          <div class="row" style="flex-wrap:nowrap">${x.replacement != null ? `<button class="btn sm primary" data-fix type="button">Fix</button>` : ""}<button class="btn sm ghost" data-ignore type="button">Ignore</button></div></li>`).join("")}</ul>`
        : `<p class="muted" style="margin:0;font-size:14px">No mistakes found${AI_ENABLED ? "." : " in the facts the free check knows (Nigerian dates and numbers, the pledge, anthem, flag and motto). Turn on the AI writer to check every subject."}</p>`}
      ${note ? `<p class="muted" style="margin:0;font-size:13px">${esc(note)}</p>` : ""}
      <div class="row">${open.some((x) => x.replacement != null) ? `<button class="btn sm primary" data-fixall type="button">Fix all</button>` : ""}${thenGenerate ? `<button class="btn sm" data-gen type="button">${open.length ? "Generate anyway" : "Generate questions"}</button>` : ""}</div>`;
    box.onclick = (e) => {
      const li = e.target.closest("[data-i]"), it = li && issues[+li.dataset.i];
      if (e.target.closest("[data-close]")) { box.hidden = true; return; }
      if (e.target.closest("[data-fix]") && it) { applyIssue(it) || toast("That text has changed; fix it by hand.", true); checkedText = srcBox.value; showFacts(note, thenGenerate); }
      if (e.target.closest("[data-ignore]") && it) { it.ignored = true; showFacts(note, thenGenerate); }
      if (e.target.closest("[data-fixall]")) { issues.filter((x) => !x.done && !x.ignored && x.replacement != null).forEach(applyIssue); checkedText = srcBox.value; toast("Fixed"); showFacts(note, thenGenerate); }
      if (e.target.closest("[data-gen]")) { box.hidden = true; checkedText = srcBox.value; $("#gen", v).click(); }
    };
  }
  async function runCheck({ withAI = AI_ENABLED, thenGenerate = false } = {}) {
    const text = srcBox.value;
    issues = checkFacts(text).map((f) => ({ said: f.said, correct: f.correct, orig: f.fix ? text.slice(f.fix.start, f.fix.end) : null, at: f.fix?.start ?? 0, replacement: f.fix ? f.fix.text : null }));
    checkedText = text;
    let note = "";
    if (withAI && text.trim()) {
      showFacts("The AI is checking every subject too…", thenGenerate);
      try {
        for (const i of await aiCheck(text, $("#level", v).value)) {
          const at = text.indexOf(i.quote);
          if (issues.some((x) => x.orig && at >= 0 && Math.abs(x.at - at) < 40)) continue;   // the free check already has it
          issues.push({ said: i.quote, correct: `${i.problem} ${i.correction}`.trim(), orig: at >= 0 && i.replacement ? i.quote : null, at, replacement: at >= 0 && i.replacement ? i.replacement : null, ai: true });
        }
      } catch (e) { note = "The AI check isn't available right now (" + e.message + ")."; }
    }
    showFacts(note, thenGenerate);
    return issues.filter((x) => !x.ignored).length;
  }
  $("#checkBtn", v).onclick = () => runCheck();

  // The teacher's own earlier lessons (notes saved with their quizzes) are a source for expansion too.
  let pastCache = null;
  async function pastLessons() {
    if (pastCache) return pastCache;
    try {
      const rows = await q(sb.from("quizzes").select("id,title,notes").eq("owner_id", ctx.user.id).not("notes", "is", null).order("updated_at", { ascending: false }).limit(30));
      pastCache = rows.filter((r) => r.id !== quiz.id && r.notes).map((r) => ({ from: "Your lesson: " + r.title, text: r.notes }));
    } catch { pastCache = []; }   // older database without saved notes
    return pastCache;
  }

  function showExpand(message = "") {
    const box = $("#expandBox", v), text = srcBox.value;
    const words = (text.match(/\S+/g) || []).length;
    const sug = suggestTopics(text), rest = TOPICS.filter((t) => !sug.includes(t));
    box.hidden = false;
    box.innerHTML = `<div class="spread"><b>Expand my notes</b><button class="btn ghost sm" data-close type="button">Close</button></div>
      <p style="margin:0">${esc(message || `Your notes have ${words} words. Questions come out better from fuller notes.`)}</p>
      <div class="row"><button class="btn sm primary" data-taught type="button">Expand from what I taught</button><span class="muted" style="font-size:13px">Follows your points in your order, and adds only matching facts from checked notes and your earlier lessons.</span></div>
      ${AI_ENABLED ? `<div class="row"><button class="btn sm" data-ai type="button">Expand with AI</button><span class="muted" style="font-size:13px">The AI fills out the same points you taught, correcting mistakes.</span></div>` : ""}
      <div id="taughtPreview"></div>
      ${sug.length ? `<div><span class="label">Or add a whole topic note</span><div class="row" style="margin-top:6px">${sug.map((t) => `<button class="btn sm" data-topic="${t.id}" type="button">+ ${esc(t.title)}</button>`).join("")}</div></div>` : ""}
      <div class="field"><label class="label" for="topicPick">All topic notes</label><select id="topicPick"><option value="">Choose a topic to add…</option>${(sug.length ? rest : TOPICS).map((t) => `<option value="${t.id}">${esc(t.subject)}: ${esc(t.title)}</option>`).join("")}</select></div>
      <p class="muted" style="margin:0;font-size:13px">Topic notes are short, checked notes for common Nigerian school topics. You can also <a href="#/record">record a lesson</a> or paste more of your own notes.</p>`;
    const add = (id) => {
      const t = TOPICS.find((x) => x.id === id); if (!t) return;
      srcBox.value = (srcBox.value.trim() ? srcBox.value.trim() + "\n\n" : "") + t.text;
      toast(`Added notes on ${t.title}`); showExpand("Added. Add more, or press Generate questions.");
    };
    box.onclick = async (e) => {
      if (e.target.closest("[data-close]")) { box.hidden = true; return; }
      const tb = e.target.closest("[data-topic]"); if (tb) add(tb.dataset.topic);
      // Scan what was taught, then show what would be added under each point before changing anything.
      const tt = e.target.closest("[data-taught]");
      if (tt) {
        tt.disabled = true; tt.textContent = "Reading your lesson…";
        const past = await pastLessons();
        const r = expandFromLesson(srcBox.value, [...TOPICS.map((t) => ({ from: "Checked notes: " + t.title, text: t.text, keys: t.keys })), ...past]);
        tt.disabled = false; tt.textContent = "Expand from what I taught";
        const pv = $("#taughtPreview", box);
        if (!r.addedCount) {
          pv.innerHTML = `<p class="notice" style="margin:0">Nothing in the checked notes${past.length ? " or your earlier lessons" : ""} closely matches the points you taught, so nothing was added. ${AI_ENABLED ? "Try <b>Expand with AI</b>, or add" : "Add"} a topic note below, or teach a little more on each point.</p>`;
          return;
        }
        pv.innerHTML = `<div class="taught"><span class="label">What you taught, and what would be added</span>
          <ol>${r.points.map((p) => `<li><b>${esc(p.label || "Your words")}</b><div class="muted" style="font-size:13px">“${esc(p.said.length > 140 ? p.said.slice(0, 140) + "…" : p.said)}”</div>
            ${p.added.length ? `<ul>${p.added.map((a) => `<li>+ ${esc(a.text.split("\n")[0])}${a.text.includes("\n") ? ` <span class="muted">(+${a.text.split("\n").length - 1} points)</span>` : ""} <span class="chip">${esc(a.from.startsWith("Your") ? "your lesson" : "checked notes")}</span></li>`).join("")}</ul>` : `<div class="muted" style="font-size:13px">Nothing matching to add.</div>`}</li>`).join("")}</ol>
          <div class="row"><button class="btn sm primary" data-use type="button">Use these notes</button><button class="btn sm ghost" data-cancel type="button">Cancel</button></div></div>`;
        pv.querySelector("[data-use]").onclick = () => { srcBox.value = r.notes; checkedText = null; showExpand(`Expanded with ${r.addedCount} additions, following your ${r.points.length} points. Read it through, then press Generate questions.`); };
        pv.querySelector("[data-cancel]").onclick = () => (pv.innerHTML = "");
        return;
      }
      const ab = e.target.closest("[data-ai]");
      if (ab) {
        ab.disabled = true; ab.textContent = "Expanding…";
        try {
          const r = await aiExpand(srcBox.value, { level: $("#level", v).value, language: $("#language", v).value });
          srcBox.value = r.notes;
          if (quiz.title === "Untitled quiz" && r.title) { quiz.title = r.title; $("#title", v).value = r.title; }
          showExpand(`Expanded. ${r.additions?.length ? "Added or corrected: " + r.additions.join("; ") + ". " : ""}Read it through, then press Generate questions.`);
        } catch (err) { toast(err.message, true); ab.disabled = false; ab.textContent = "Expand with AI"; }
      }
    };
    $("#topicPick", box).onchange = (e) => add(e.target.value);
  }
  $("#expandBtn", v).onclick = () => showExpand();

  /* ----- generation ----- */
  $("#gen", v).onclick = async () => {
    const text = $("#srcText", v).value.trim();
    const types = [["mcq", "#tMcq"], ["tf", "#tTf"], ["short", "#tShort"]].filter(([, s]) => $(s, v).checked).map(([t]) => t);
    const count = +$("#count", v).value, engine = $("#engine", v).value;
    if (!types.length) return setStatus("Tick at least one question type.", true);
    if (!text && !(engine === "ai" && source.pdfs?.length)) return setStatus("Upload a file or paste your notes first.", true);
    // Correct the facts first (free check; instant). Only asks once per version of the text.
    if (text && checkedText !== srcBox.value && await runCheck({ withAI: false, thenGenerate: true })) {
      return setStatus("Some facts in your notes look wrong. Fix them (or ignore them), then generate.", true);
    }
    if (engine === "basic" && (text.match(/\S+/g) || []).length < 60) {
      showExpand(`Your notes are short (${(text.match(/\S+/g) || []).length} words). Add a checked topic note${AI_ENABLED ? " or expand them with AI" : ""}, then generate.`);
      return setStatus("Add a little more to your notes first.", true);
    }
    $("#gen", v).disabled = true;
    try {
      let result;
      if (engine === "ai") {
        setStatus(`The AI is reading your notes and writing ${count} questions. This usually takes 20–90 seconds…`);
        result = await aiGenerate({ text, pdfs: source.pdfs || [], count, types, level: $("#level", v).value, difficulty: $("#difficulty", v).value, language: $("#language", v).value });
      } else {
        result = { title: "", questions: basicGenerate(text, count, types, { difficulty: $("#difficulty", v).value, level: $("#level", v).value }) };
      }
      if (!result.questions.length) {
        showExpand("No questions could be made: your notes don't yet contain clear definitions, lists or facts. Add a checked topic note" + (AI_ENABLED ? " or expand them with AI" : "") + ", then generate again.");
        throw new Error("Expand your notes first (see the suggestions above).");
      }
      if (engine === "basic" && result.questions.length < Math.max(3, count / 2)) showExpand(`Only ${result.questions.length} questions could be made from these notes. Add a topic note${AI_ENABLED ? " or expand with AI" : ""} for more.`);
      const append = $("#append", v).checked && quiz.questions.length;
      quiz.questions = append ? quiz.questions.concat(result.questions) : result.questions;
      if (result.title && (quiz.title === "Untitled quiz" || !id)) { quiz.title = result.title; $("#title", v).value = quiz.title; }
      markDirty(); renderList();
      setStatus(engine === "basic"
        ? `Wrote ${result.questions.length} questions with the built-in writer. Read each one; fix or delete any that don't make sense, then Save.`
        : `Wrote ${result.questions.length} questions. Each shows the page it came from, so you can check it quickly. Then Save.`);
      if (result.questions.length < count) setStatus($("#status", v).textContent + (engine === "basic"
        ? ` Only ${result.questions.length} of ${count}: the built-in writer only asks about definitions, lists, reasons and facts it can find clearly, rather than pad the quiz with weak questions. Add more notes, add your own questions, or use the AI writer.`
        : ` (Only ${result.questions.length} of ${count}: the notes are too short for more.)`));
    } catch (e) { setStatus(e.message, true); }
    finally { $("#gen", v).disabled = false; }
  };

  /* ----- import past questions ----- */
  const importDialog = () => {
    const d = dialog(`<h2 style="font-size:22px">Import past questions</h2>
      <p class="muted" style="margin:0;font-size:14px">Paste questions typed the usual way, or choose a Word / text / PDF file. Numbered questions with options lettered A–D become objective questions; questions without options become theory. An "Answer: B" line or an answer key at the end sets the correct options.</p>
      <div class="row"><label class="btn sm" for="impFile">Choose file</label><input id="impFile" type="file" accept=".docx,.txt,.pdf,.md" hidden><span class="muted" id="impName" style="font-size:13px"></span></div>
      <textarea id="impText" rows="12" placeholder="1. The capital of Nigeria is&#10;A. Lagos  B. Abuja  C. Kano  D. Ibadan&#10;Answer: B&#10;&#10;SECTION B&#10;1. (a) Define a cell. (b) Name four parts of a cell. [10 marks]"></textarea>
      <div class="status" id="impStatus"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-x type="button">Cancel</button><button class="btn primary" id="impGo" type="button">Add questions</button></div>`, true);
    d.querySelector("[data-x]").onclick = () => d.close();
    const preview = () => {
      const qs = parseQuestions($("#impText", d).value), need = qs.filter((x) => x.needsAnswer).length;
      const c = (t) => qs.filter((x) => x.type === t).length;
      $("#impStatus", d).textContent = qs.length ? `Found ${qs.length} questions: ${c("mcq")} multiple choice, ${c("tf")} true/false, ${c("short")} theory.${need ? ` ${need} need${need === 1 ? "s" : ""} a correct answer or model answer; they'll be highlighted for you to fill in.` : ""}` : "No numbered questions found yet.";
      return qs;
    };
    $("#impText", d).oninput = preview;
    $("#impFile", d).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      $("#impName", d).textContent = "Reading " + f.name + "…";
      try { const r = await readFile(f); $("#impText", d).value = r.text.replace(/\[Page \d+\]\n?/g, ""); $("#impName", d).textContent = f.name; preview(); }
      catch (err) { $("#impName", d).textContent = err.message; }
    };
    $("#impGo", d).onclick = () => {
      const qs = normalize(preview());
      if (!qs.length) return toast("No questions found to import", true);
      quiz.questions = quiz.questions.concat(qs);
      if (quiz.title === "Untitled quiz") { quiz.title = "Imported questions"; $("#title", v).value = quiz.title; }
      markDirty(); renderList(); d.close(); toast(`${qs.length} questions added`);
    };
  };
  $("#importBtn", v).onclick = importDialog;
  if (opts.importNow) importDialog();

  /* ----- saving + review ----- */
  const save = async () => {
    if (editing) { toast("Press Done on the question you're editing first", true); return false; }
    if (!quiz.title.trim()) quiz.title = "Untitled quiz";
    const row = { title: quiz.title.trim(), source_name: quiz.source_name, questions: quiz.questions.map(({ _new, ...x }) => x) };
    if (ctx.head?.school && !quiz.id) row.department = ctx.head.member?.department || "";
    // Keep the lesson notes with the quiz, so later lessons can be expanded from them.
    const notes = srcBox.value.trim();
    if (notes && !ctx.noNotesColumn) row.notes = notes.slice(0, 200000);
    $("#save", v).disabled = true;
    const write = async (r) => {
      if (quiz.id) await q(sb.from("quizzes").update(r).eq("id", quiz.id));
      else { const x = await q(sb.from("quizzes").insert(r).select("id").single()); quiz.id = x.id; ctx.replaceHash("#/edit/" + x.id); }
    };
    try {
      try { await write(row); }
      catch (err) {   // database not updated yet: save without the notes
        if (!("notes" in row) || !/notes/i.test(err.message)) throw err;
        ctx.noNotesColumn = true; delete row.notes; await write(row);
      }
      markDirty(false); toast("Quiz saved"); return true;
    } catch (e) { toast(e.message, true); return false; }
    finally { $("#save", v).disabled = false; }
  };
  $("#save", v).onclick = save;
  // Save first if needed, then open the live game options (teacher.js provides ctx.startLive).
  $("#playLive", v).onclick = async () => {
    if (!quiz.questions.length) return toast("Add some questions first", true);
    if ((dirty || !quiz.id) && !(await save())) return;
    ctx.startLive?.(quiz);
  };
  $("#sendReview", v)?.addEventListener("click", async () => {
    if (dirty && !(await save())) return;
    try { await rpc("submit_for_review", { p_quiz: quiz.id }); markDirty(false); toast("Sent to your HOD for review"); location.hash = "#/quizzes"; } catch (e) { toast(e.message, true); }
  });

  $("#showSrc", v)?.addEventListener("click", (e) => { $("#srcPanel", v).hidden = false; $("#bench", v).classList.remove("solo"); e.target.remove(); });
  $("#shuf", v).onclick = () => { quiz.questions = shuffle(quiz.questions); markDirty(); renderList(); };
  $("#addQ", v).onclick = () => {
    if (editing) return toast("Press Done on the question you're editing first", true);
    const nq = { id: uid(), type: "mcq", question: "", options: ["", "", "", ""], answer: 0, explanation: "", _new: true };
    quiz.questions.push(nq); editing = nq.id; renderList(); $("#ed-q", v)?.focus();
  };

  /* ----- question list ----- */
  const list = $("#qlist", v);
  function renderList() {
    $("#appendWrap", v).hidden = !quiz.questions.length;
    const need = quiz.questions.filter((x) => x.needsAnswer).length;
    $("#fixNote", v).innerHTML = need ? `<div class="notice">${need} question${need > 1 ? "s need" : " needs"} a correct option or model answer (highlighted). You can save now and finish later, but the quiz can't be played until they're done.</div>` : "";
    list.innerHTML = quiz.questions.length
      ? quiz.questions.map((x) => (editing === x.id ? editorHTML(x) : cardHTML(x))).join("")
      : `<li class="empty">No questions yet. Upload notes and press <b>Generate questions</b>, import past questions, or add one by hand.</li>`;
    renderMath(list);
  }
  const readEditor = (x) => {
    x.question = $("#ed-q", v).value.trim();
    const mk = Number($("#ed-marks", v)?.value); if (mk > 0) x.marks = mk; else delete x.marks;
    if (x.type === "short") {
      x.answer = $("#ed-a", v).value.trim(); x.keyPoints = $("#ed-k", v).value.split("\n").map((s) => s.trim()).filter(Boolean);
      if ($("#ed-comp", v)?.checked) x.compulsory = true; else delete x.compulsory;
    } else if (x.type === "word") { /* question only */ }
    else {
      x.options = x.options.map((o, i) => $("#ed-o" + i, v)?.value.trim() ?? o);
      if (x.type !== "poll") { const r = list.querySelector('input[name="ed-ans"]:checked'); x.answer = r ? +r.value : null; x.explanation = $("#ed-e", v).value.trim(); }
    }
  };
  list.addEventListener("change", async (e) => {
    const x = quiz.questions.find((y) => y.id === editing); if (!x) return;
    if (e.target.id === "ed-type") {
      readEditor(x);
      const t = e.target.value; x.type = t;
      if (t === "tf") { x.options = ["True", "False"]; x.answer = typeof x.answer === "number" && x.answer < 2 ? x.answer : 0; }
      if (t === "mcq" || t === "poll") { if (!Array.isArray(x.options) || x.options[0] === "True" || x.options.length < 2) x.options = ["", "", "", ""]; if (typeof x.answer !== "number") x.answer = 0; }
      if (t === "short") { x.answer = typeof x.answer === "string" ? x.answer : ""; x.keyPoints ||= []; }
      if (t === "word") delete x.options;
      renderList();
    }
    if (e.target.id === "ed-img") {
      const f = e.target.files[0]; if (!f) return;
      readEditor(x);
      toast("Uploading picture…");
      try { x.image = await uploadImage(f); renderList(); toast("Picture added"); }
      catch (err) { toast(err.message, true); }
    }
  });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const qid = b.closest(".q").dataset.id, x = quiz.questions.find((y) => y.id === qid), act = b.dataset.act;
    if (act === "edit") { if (editing) return toast("Press Done on the question you're editing first", true); editing = qid; renderList(); $("#ed-q", v)?.focus(); return; }
    if (act === "up" || act === "down") {
      const i = quiz.questions.indexOf(x), j = act === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= quiz.questions.length) return;
      [quiz.questions[i], quiz.questions[j]] = [quiz.questions[j], quiz.questions[i]]; markDirty(); renderList(); return;
    }
    if (act === "del") { quiz.questions = quiz.questions.filter((y) => y.id !== qid); markDirty(); renderList(); return; }
    if (act === "addopt") { readEditor(x); if (x.options.length < 6) x.options.push(""); renderList(); return; }
    if (act === "rmimg") { readEditor(x); delete x.image; renderList(); return; }
    if (act === "cancel") { if (x._new) quiz.questions = quiz.questions.filter((y) => y.id !== qid); editing = null; renderList(); return; }
    if (act === "save") {
      readEditor(x);
      if (!x.question) return toast("Write the question first", true);
      if ((x.type === "mcq" || x.type === "tf") && x.answer == null) return toast("Tick the correct option", true);
      if (x.type === "mcq" || x.type === "poll") {
        const filled = x.options.map((o, i) => [o, i]).filter(([o]) => o);
        if (filled.length < 2) return toast("Give at least two options", true);
        if (x.type === "mcq") { const na = filled.findIndex(([, i]) => i === x.answer); if (na < 0) return toast("The option marked correct is empty", true); x.answer = na; }
        x.options = filled.map(([o]) => o);
      }
      if (x.type === "short" && !x.answer) x.needsAnswer = true; else delete x.needsAnswer;
      if (x.type === "poll" || x.type === "word") { delete x.answer; delete x.explanation; }
      delete x._new; editing = null; markDirty(); renderList();
      if (x.type === "short" && x.needsAnswer) toast("Saved. Add a model answer so it can be marked online; printing works without one.");
    }
  });
  renderList();
  if (opts.blank) $("#addQ", v).click();
}

/* ----- pictures ----- */
async function uploadImage(file) {
  const dataUrl = await shrinkImage(file, 1000, "image/jpeg");
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${ctx.user.id}/${Date.now().toString(36)}-${uid()}.jpg`;
  const { error } = await sb.storage.from("question-images").upload(path, await blob.arrayBuffer(), { contentType: "image/jpeg", upsert: false });
  if (!error) return sb.storage.from("question-images").getPublicUrl(path).data.publicUrl;
  // Storage not set up: keep a small copy inside the quiz instead.
  const small = await shrinkImage(file, 640, "image/jpeg");
  if (small.length > 160000) throw new Error("Couldn't upload the picture. Check README step 2 (storage) and try again.");
  return small;
}

/* ----- question cards ----- */
function cardHTML(x) {
  let body;
  if (x.type === "short") body = `<div class="q-exp">${x.answer ? `<b>Model answer:</b> ${rt(x.answer)}` : `<b class="warn-text">No model answer yet.</b> Needed for online marking.`}${x.keyPoints?.length ? `<br><b>Key points:</b> ${x.keyPoints.map(esc).join(" · ")}` : ""}</div>`;
  else if (x.type === "word") body = `<div class="q-exp">Everyone types a word or short phrase; the answers appear as a word cloud. Live games only.</div>`;
  else body = `<ul class="q-opts">${x.options.map((o, i) => `<li class="${x.type !== "poll" && i === x.answer && !x.needsAnswer ? "ok" : ""}"><span class="bub">${LET[i]}</span><span>${esc(o)}</span></li>`).join("")}</ul>${x.explanation ? `<div class="q-exp">${esc(x.explanation)}</div>` : ""}`;
  const chips = [
    `<span class="chip ${x.type}">${TYPE_NAME[x.type]}</span>`,
    x.marks ? `<span class="chip">${x.marks} MARK${x.marks == 1 ? "" : "S"}</span>` : "",
    x.compulsory ? `<span class="chip warn">COMPULSORY</span>` : "",
    x.source ? `<span class="chip" title="Where this came from in your notes">FROM ${esc(x.source.toUpperCase())}</span>` : "",
    x.needsAnswer && x.type !== "short" ? `<span class="chip warn">SET THE CORRECT ANSWER</span>` : "",
  ].join("");
  return `<li class="q ${x.needsAnswer ? "needs" : ""}" data-id="${x.id}"><div class="q-top"><div style="display:grid;gap:6px;min-width:0"><div class="row" style="gap:6px">${chips}</div><div class="q-text">${rt(x.question)}</div></div>
    <div class="q-actions"><button class="icon-btn" data-act="up" type="button" aria-label="Move up">↑</button><button class="icon-btn" data-act="down" type="button" aria-label="Move down">↓</button><button class="icon-btn" data-act="edit" type="button">Edit</button><button class="icon-btn" data-act="del" type="button">Delete</button></div></div>${qimg(x, "qimg sm")}${body}</li>`;
}
function editorHTML(x) {
  const isOpt = x.type === "mcq" || x.type === "tf" || x.type === "poll";
  const opts = !isOpt ? "" : x.options.map((o, i) => `<div class="opt-row">${x.type !== "poll" ? `<input type="radio" name="ed-ans" value="${i}" ${i === x.answer && !x.needsAnswer ? "checked" : ""} aria-label="Mark ${LET[i]} as correct">` : ""}<span class="bub">${LET[i]}</span><input type="text" id="ed-o${i}" value="${esc(o)}" ${x.type === "tf" ? "readonly" : ""} placeholder="Option ${LET[i]}"></div>`).join("");
  return `<li class="q" data-id="${x.id}"><div class="editor">
    <div class="row"><label class="label" for="ed-type">Type</label><select id="ed-type" style="width:auto">
      <option value="mcq" ${x.type === "mcq" ? "selected" : ""}>Multiple choice</option><option value="tf" ${x.type === "tf" ? "selected" : ""}>True / False</option>
      <option value="short" ${x.type === "short" ? "selected" : ""}>Written / theory</option><option value="poll" ${x.type === "poll" ? "selected" : ""}>Poll (no right answer, live only)</option>
      <option value="word" ${x.type === "word" ? "selected" : ""}>Word cloud (live only)</option></select>
      ${x.type !== "poll" && x.type !== "word" ? `<label class="label" for="ed-marks" style="margin-left:auto">Marks</label><input id="ed-marks" type="number" min="0" step="0.5" style="width:80px" value="${x.marks ?? ""}" placeholder="1">` : ""}</div>
    <label class="label" for="ed-q">Question</label>${symbolBarHTML()}
    <textarea id="ed-q" rows="3" placeholder="For sub-parts, put (a), (b) on new lines. For maths use $x^2$ or the buttons above.">${esc(x.question)}</textarea>
    <div class="row">${x.image ? `${qimg(x, "qimg sm")}<button class="btn sm ghost danger" data-act="rmimg" type="button">Remove picture</button>` : ""}<label class="btn sm" for="ed-img">${x.image ? "Change picture" : "Add picture / diagram"}</label><input id="ed-img" type="file" accept="image/*" hidden></div>
    ${x.type === "short"
      ? `<label class="label" for="ed-a">Model answer</label><textarea id="ed-a" rows="3">${esc(x.answer || "")}</textarea><label class="label" for="ed-k">Key points for marking (one per line)</label><textarea id="ed-k" rows="3">${esc((x.keyPoints || []).join("\n"))}</textarea>
         <label class="check" style="justify-self:start"><input type="checkbox" id="ed-comp" ${x.compulsory ? "checked" : ""}> Compulsory question on printed exams</label>`
      : x.type === "word" ? "" : `<span class="label">Options${x.type === "poll" ? "" : " · tick the correct one"}</span>${opts}${x.type !== "tf" && x.options.length < 6 ? `<button class="btn sm ghost" data-act="addopt" type="button" style="justify-self:start">+ Add option</button>` : ""}
         ${x.type !== "poll" ? `<label class="label" for="ed-e">Explanation shown after the answer</label><textarea id="ed-e" rows="2">${esc(x.explanation || "")}</textarea>` : ""}`}
    <div class="row"><button class="btn primary sm" data-act="save" type="button">Done</button><button class="btn sm" data-act="cancel" type="button">Cancel</button></div></div></li>`;
}
