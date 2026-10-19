// Quiz editor: build questions from notes (one or many files), import past
// questions, and edit each question (pictures, maths, marks, compulsory).
import { sb, q, rpc } from "./sb.js";
import { AI_ENABLED } from "./config.js";
import { $, esc, rt, LET, TYPE_NAME, uid, shuffle, toast, ask, dialog, qimg, renderMath, symbolBarHTML, store } from "./ui.js";
import { ctx, frame, statusChip } from "./shell.js";
import { readFiles, readFile } from "./extract.js";
import { aiGenerate, basicGenerate, normalize, LEVELS, DIFFICULTY, LANGUAGES } from "./generate.js";
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
  const defLevel = { primary: "p46", secondary: "jss", university: "uni", training: "adult" }[ctx.kind] || "jss";
  const inSchool = !!ctx.head?.school;

  const v = frame("quizzes", `
    <div class="page-h"><div><a href="#/quizzes" style="font-size:14px">← Quizzes</a><h1>${id ? "Edit quiz" : "New quiz"} ${statusChip(quiz.review_status)}</h1></div>
      <div class="row"><span class="muted" id="saveState" style="font-size:14px">${id ? "All changes saved" : "Not saved yet"}</span>${id ? `<a class="btn" href="#/print/${id}">Print exam</a>` : ""}
      ${inSchool && id && quiz.review_status !== "submitted" ? `<button class="btn" id="sendReview" type="button">Send for review</button>` : ""}
      <button class="btn big" id="playLive" type="button">▶ Play live</button><button class="btn primary big" id="save" type="button">Save quiz</button></div></div>
    ${quiz.review_status === "changes" && quiz.review_note ? `<div class="notice"><b>Your HOD asked for changes:</b> ${esc(quiz.review_note)}</div>` : ""}
    <div class="bench${opts.blank ? " solo" : ""}" id="bench">
      <section class="panel" aria-labelledby="srcH" id="srcPanel" ${opts.blank ? "hidden" : ""}>
        <div class="spread"><h2 id="srcH" style="font-size:22px">1 · Your material</h2><button class="btn sm" id="importBtn" type="button">Import past questions</button></div>
        <label class="drop" id="drop" for="file">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3"/></svg>
          <strong>Drop lesson notes here</strong>
          <small>or tap to choose · PDF, Word (.docx), TXT · several files at once for a term exam${AI_ENABLED ? " · scanned PDFs work with the AI writer" : ""}</small>
          <input type="file" id="file" multiple accept=".pdf,.docx,.txt,.md,application/pdf,text/plain" hidden>
        </label>
        <div class="filechips" id="fileChips" hidden></div>
        <div class="field"><label class="label" for="srcText">Text from your files (trim it, or paste notes here)</label>
          <textarea id="srcText" rows="8" placeholder="The text from your files appears here. You can also paste notes directly."></textarea></div>
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
        ${AI_ENABLED ? "" : `<p class="muted" style="margin:0;font-size:13px">The built-in writer makes simple fill-in-the-blank and definition questions in English. For exam-quality questions, other languages, reading levels and maths, turn on the AI writer (README step 7).</p>`}
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

  /* ----- generation ----- */
  $("#gen", v).onclick = async () => {
    const text = $("#srcText", v).value.trim();
    const types = [["mcq", "#tMcq"], ["tf", "#tTf"], ["short", "#tShort"]].filter(([, s]) => $(s, v).checked).map(([t]) => t);
    const count = +$("#count", v).value, engine = $("#engine", v).value;
    if (!types.length) return setStatus("Tick at least one question type.", true);
    if (!text && !(engine === "ai" && source.pdfs?.length)) return setStatus("Upload a file or paste your notes first.", true);
    $("#gen", v).disabled = true;
    try {
      let result;
      if (engine === "ai") {
        setStatus(`The AI is reading your notes and writing ${count} questions. This usually takes 20–90 seconds…`);
        result = await aiGenerate({ text, pdfs: source.pdfs || [], count, types, level: $("#level", v).value, difficulty: $("#difficulty", v).value, language: $("#language", v).value });
      } else {
        if (text.split(/\s+/).length < 60) throw new Error("The built-in writer needs at least a couple of paragraphs of text.");
        result = { title: "", questions: basicGenerate(text, count, types, { difficulty: $("#difficulty", v).value, level: $("#level", v).value }) };
      }
      if (!result.questions.length) throw new Error("No questions could be made from this text. Try adding more notes.");
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
    $("#save", v).disabled = true;
    try {
      if (quiz.id) await q(sb.from("quizzes").update(row).eq("id", quiz.id));
      else { const r = await q(sb.from("quizzes").insert(row).select("id").single()); quiz.id = r.id; ctx.replaceHash("#/edit/" + r.id); }
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
