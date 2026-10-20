// Printable exam papers. A quiz is laid out as Section A (objectives) and
// Section B (theory) on A4, with a school or university heading, Type A–D
// shuffled papers, an OMR answer sheet, a marking scheme and Word export.
import { sb, q } from "./sb.js";
import { $, esc, rt, toast, qimg, renderMath, rng, seededShuffle, downloadFile, LET } from "./ui.js";
import { loadHeader } from "./school.js";

const ROMAN = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
const WORDS = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE"];
const numWord = (n) => WORDS[n] || String(n);
const fmtMarks = (n) => `${+n % 1 ? n : Math.round(n)} mark${+n === 1 ? "" : "s"}`;

function currentSession() {
  const d = new Date(), y = d.getFullYear(), start = d.getMonth() >= 8 ? y : y - 1; // Nigerian academic year starts in September
  return `${start}/${start + 1} Academic Session`;
}
// University, polytechnic and college papers share a tertiary layout, with their own labels.
export const TERTIARY = ["university", "polytechnic", "college"];
export const tertiary = (ex) => TERTIARY.includes(ex.style);
export const numberLabel = (ex) => ({ university: "Matric No", polytechnic: "Matric / Reg No", college: "Reg No" }[ex.style] || "Exam No");
const levelHint = { university: "e.g. 300 Level", polytechnic: "e.g. ND II / HND I", college: "e.g. NCE 2" };

function defaults(quiz, kind) {
  const uni = TERTIARY.includes(kind);
  return {
    style: uni ? kind : "school", level: "",
    title: uni ? "First Semester Examination" : "First Term Examination", session: currentSession(),
    subject: quiz.title, klass: "", duration: uni ? "2 hours" : "1 hour 30 minutes", date: "",
    faculty: "", department: "", courseCode: "", courseTitle: quiz.title, units: "", examiner: "",
    instrGeneral: uni ? `Answer questions as instructed in each section. Write your ${kind === "university" ? "matriculation" : kind === "polytechnic" ? "matriculation or registration" : "registration"} number on every answer booklet.`
      : "Write your name and examination number in the spaces provided. Do not write anything on this question paper except where you are asked to.",
    headA: uni ? "Section A: Objective Questions" : "Section A: Objective Questions",
    headB: uni ? "Section B: Essay Questions" : "Section B: Theory Questions",
    instrA: "Answer ALL questions in this section. Choose the correct option from the options lettered A to D.",
    instrBExtra: "", answerAny: 0, marksA: 1, marksB: 10,
    candidate: true, omr: true, key: true, cover: uni, lines: 0, versions: 1, fontSize: 12, closing: uni ? "" : "GOOD LUCK!",
  };
}

/* ---------- the paper as data (shared by the screen, print and Word) ---------- */
function paperModel(quiz, ex, vi) {
  const all = quiz.questions.filter((x) => x.type !== "poll" && x.type !== "word");
  let obj = all.filter((x) => x.type === "mcq" || x.type === "tf").map((x) => ({ ...x }));
  let th = all.filter((x) => x.type === "short").map((x) => ({ ...x }));
  // compulsory theory questions come first
  th = [...th.filter((x) => x.compulsory), ...th.filter((x) => !x.compulsory)];
  if (vi > 0) {
    const r = rng(quiz.id + ":" + vi);
    obj = seededShuffle(obj, r).map((x) => {
      if (x.type === "tf") return x;
      const order = seededShuffle(x.options.map((_, i) => i), r);
      return { ...x, options: order.map((i) => x.options[i]), answer: order.indexOf(x.answer) };
    });
    const comp = th.filter((x) => x.compulsory), rest = seededShuffle(th.filter((x) => !x.compulsory), r);
    th = [...comp, ...rest];
  }
  const mA = (x) => Number(x.marks) > 0 ? Number(x.marks) : ex.marksA;
  const mB = (x) => Number(x.marks) > 0 ? Number(x.marks) : ex.marksB;
  obj.forEach((x) => { x.mk = mA(x); });
  th.forEach((x) => { x.mk = mB(x); x.marksLabel = fmtMarks(x.mk); });
  const comp = th.filter((x) => x.compulsory), others = th.filter((x) => !x.compulsory);
  const any = ex.answerAny > 0 && ex.answerAny < others.length ? ex.answerAny : 0;
  const totA = obj.reduce((t, x) => t + x.mk, 0);
  const totB = comp.reduce((t, x) => t + x.mk, 0) + (any ? others.map((x) => x.mk).sort((a, b) => b - a).slice(0, any).reduce((t, m) => t + m, 0) : others.reduce((t, x) => t + x.mk, 0));
  const both = obj.length && th.length;
  const uniform = th.every((x) => x.mk === th[0]?.mk);
  let instrB;
  if (comp.length && any) instrB = `Answer Question${comp.length > 1 ? "s" : ""} ${comp.map((_, i) => i + 1).join(" and ")} and any ${numWord(any)} other question${any > 1 ? "s" : ""}.`;
  else if (comp.length && !any) instrB = "Answer ALL questions in this section.";
  else if (any) instrB = `Answer any ${numWord(any)} question${any > 1 ? "s" : ""} in this section.`;
  else instrB = "Answer ALL questions in this section.";
  if (uniform && th.length) instrB += ` Each question carries ${fmtMarks(th[0].mk)}.`;
  if (ex.instrBExtra) instrB += " " + ex.instrBExtra;
  const sec = (h, fallback) => both ? h : h.replace(/^section [ab]:\s*/i, "") || fallback;
  return {
    typeLabel: ex.versions > 1 ? `Type ${LET[vi]}` : "", obj, th, totA, totB,
    headA: `${sec(ex.headA, "Objective Questions")} (${totA} marks)`, headB: `${sec(ex.headB, "Theory Questions")} (${totB} marks)`,
    instrA: ex.instrA, instrB,
    general: [ex.instrGeneral, both ? `This paper has two sections, A and B. Total: ${totA + totB} marks.` : `Total: ${totA + totB} marks.`].filter(Boolean).join(" "),
  };
}

const metaFields = (ex) => tertiary(ex)
  ? [[ex.style === "university" ? "Faculty" : "School", ex.faculty], ["Department", ex.department], [ex.style === "university" ? "Level" : "Programme", ex.level], ["Course", [ex.courseCode, ex.courseTitle].filter(Boolean).join(": ")], [ex.style === "polytechnic" ? "Credit units" : "Units", ex.units], ["Time", ex.duration], ["Date", ex.date], ["Examiner", ex.examiner]]
  : [["Subject", ex.subject], ["Class", ex.klass], ["Time", ex.duration], ["Date", ex.date]];

export function headerHTML(school, ex, typeLabel = "") {
  const logo = school.logo ? `<img class="ph-logo" src="${school.logo}" alt="">` : "";
  const meta = metaFields(ex).filter(([, v]) => v);
  return `<header class="ph">
      <div class="ph-top">${logo}<div class="ph-text">
        <div class="ph-name">${esc(school.name || "YOUR SCHOOL NAME")}</div>
        ${school.address ? `<div class="ph-addr">${esc(school.address)}</div>` : ""}
        ${school.motto ? `<div class="ph-motto">Motto: ${esc(school.motto)}</div>` : ""}
        ${school.contact ? `<div class="ph-addr">${esc(school.contact)}</div>` : ""}
      </div>${logo ? `<div class="ph-logo-pad"></div>` : ""}</div>
      <div class="ph-exam">${esc(ex.title)}${ex.session ? ` <span>·</span> ${esc(ex.session)}` : ""}</div>
      <div class="ph-meta">${meta.map(([k, v]) => `<span><b>${k}:</b> ${esc(v)}</span>`).join("")}${typeLabel ? `<span class="ph-type">${typeLabel}</span>` : ""}</div>
    </header>`;
}

function candHTML(ex) {
  return ex.candidate ? `<div class="cand"><span>Name: <i></i></span><span class="sm">${numberLabel(ex)}: <i></i></span></div>` : "";
}

function paperHTML(school, ex, m, draft) {
  const short = m.obj.every((x) => x.options.every((o) => o.length <= 26) && !x.image);
  const cover = ex.cover ? `<article class="paper cover${draft}" style="font-size:${ex.fontSize}pt">${headerHTML(school, ex, m.typeLabel)}${candHTML(ex)}
      <div class="cover-box"><h2>Instructions to candidates</h2><p>${esc(m.general)}</p>
      ${m.obj.length ? `<p><b>${esc(m.headA)}:</b> ${esc(m.instrA)}</p>` : ""}${m.th.length ? `<p><b>${esc(m.headB)}:</b> ${esc(m.instrB)}</p>` : ""}</div>
      <p class="cover-warn">DO NOT OPEN THIS QUESTION PAPER UNTIL YOU ARE TOLD TO DO SO</p></article>` : "";
  return cover + `<article class="paper${draft}" style="font-size:${ex.fontSize}pt">
    ${ex.cover ? `<div class="ph-mini">${esc(school.name || "")} · ${esc(tertiary(ex) ? [ex.courseCode, ex.title].filter(Boolean).join(" · ") : [ex.subject, ex.klass].filter(Boolean).join(" · "))}${m.typeLabel ? " · " + m.typeLabel : ""}</div>`
      : `${headerHTML(school, ex, m.typeLabel)}${candHTML(ex)}<p class="instr"><b>Instructions:</b> ${esc(m.general)}</p>`}
    ${m.obj.length ? `<section><h2 class="sec">${esc(m.headA)}</h2>${m.instrA ? `<p class="instr">${esc(m.instrA)}</p>` : ""}
      <ol class="obj">${m.obj.map((x) => `<li><div class="qt">${rt(x.question)}${Number(x.marks) > 0 ? ` <span class="mk">[${fmtMarks(x.mk)}]</span>` : ""}</div>${qimg(x, "pimg")}
        <div class="op ${x.options.length === 2 ? "two" : short ? "four" : ""}">${x.options.map((o, i) => `<span><b>${LET[i]}.</b> ${esc(o)}</span>`).join("")}</div></li>`).join("")}</ol></section>` : ""}
    ${m.th.length ? `<section${m.obj.length ? ` class="secB"` : ""}><h2 class="sec">${esc(m.headB)}</h2><p class="instr">${esc(m.instrB)}</p>
      <ol class="theory">${m.th.map((x) => `<li><div class="qt">${rt(x.question)} <span class="mk">[${x.marksLabel}]</span>${x.compulsory ? ` <span class="mk">(compulsory)</span>` : ""}</div>${qimg(x, "pimg")}${ex.lines ? `<div class="lines" style="height:${ex.lines * 2.1}em"></div>` : ""}</li>`).join("")}</ol></section>` : ""}
    ${ex.closing ? `<p class="closing">${esc(ex.closing)}</p>` : ""}
  </article>`;
}

function omrHTML(school, ex, m, draft) {
  const per = Math.ceil(m.obj.length / 3), cols = [0, 1, 2].map((c) => m.obj.slice(c * per, c * per + per).map((x, i) => [c * per + i + 1, x]));
  return `<article class="paper${draft}" style="font-size:${ex.fontSize}pt">
    <header class="ph"><div class="ph-name" style="text-align:center">${esc(school.name || "YOUR SCHOOL NAME")}</div>
      <div class="ph-exam">Objective Answer Sheet${m.typeLabel ? ` · ${m.typeLabel}` : ""}</div>
      <div class="ph-meta">${metaFields(ex).slice(0, 3).filter(([, v]) => v).map(([k, v]) => `<span><b>${k}:</b> ${esc(v)}</span>`).join("")}<span>${esc(ex.title)}</span></div></header>
    ${candHTML({ ...ex, candidate: true })}
    <p class="instr">Shade ONE bubble for each question using HB pencil. Shade completely. Erase cleanly to change an answer.</p>
    <div class="omr">${cols.map((col) => `<div>${col.map(([n, x]) => `<div class="omr-row"><b>${n}</b>${x.options.map((_, i) => `<span>${LET[i]}</span>`).join("")}</div>`).join("")}</div>`).join("")}</div>
  </article>`;
}

function keyHTML(school, ex, m) {
  return `<article class="paper key" style="font-size:${ex.fontSize}pt">
    <header class="ph"><div class="ph-name" style="text-align:center">${esc(school.name || "YOUR SCHOOL NAME")}</div>
      <div class="ph-exam">Marking Scheme${m.typeLabel ? ` · ${m.typeLabel}` : ""} <span>·</span> Teacher's Copy</div>
      <div class="ph-meta">${metaFields(ex).slice(0, 3).filter(([, v]) => v).map(([k, v]) => `<span><b>${k}:</b> ${esc(v)}</span>`).join("")}<span>${esc(ex.title)}</span>${ex.session ? `<span>${esc(ex.session)}</span>` : ""}</div></header>
    ${m.obj.length ? `<h2 class="sec">${esc(m.headA)}</h2><div class="keygrid">${m.obj.map((x, i) => `<span><b>${i + 1}.</b> ${LET[x.answer]}</span>`).join("")}</div>` : ""}
    ${m.th.length ? `<h2 class="sec">${esc(m.headB)}</h2>
      <ol class="theory">${m.th.map((x) => `<li><div class="qt">${rt(x.question)} <span class="mk">[${x.marksLabel}]</span></div>${x.answer ? `<div><b>Model answer:</b> ${rt(x.answer)}</div>` : `<div class="muted"><i>No model answer added.</i></div>`}
        ${x.keyPoints?.length ? `<div><b>Award marks for:</b><ul class="kp">${x.keyPoints.map((k, i) => `<li>(${ROMAN[i + 1] || i + 1}) ${esc(k)}</li>`).join("")}</ul></div>` : ""}</li>`).join("")}</ol>` : ""}
  </article>`;
}

function buildPapers(quiz, school, ex, draft) {
  const usable = quiz.questions.filter((x) => x.type !== "poll" && x.type !== "word");
  if (!usable.length) return `<div class="paper"><p>This quiz has no exam questions yet. <a href="#/edit/${quiz.id}">Add questions</a> first.</p></div>`;
  const n = Math.max(1, Math.min(4, ex.versions || 1)), out = [], models = [];
  for (let vi = 0; vi < n; vi++) {
    const m = paperModel(quiz, ex, vi); models.push(m);
    out.push(paperHTML(school, ex, m, draft));
    if (ex.omr && m.obj.length) out.push(omrHTML(school, ex, m, draft));
  }
  if (ex.key) for (const m of models) out.push(keyHTML(school, ex, m));
  return out.join("");
}

/* ---------- the exam builder page ---------- */
export async function examView(id, frame) {
  const v = frame("quizzes", `<p class="muted">Loading…</p>`);
  const [{ data: auth }, quiz, head] = await Promise.all([sb.auth.getUser(), q(sb.from("quizzes").select("id,owner_id,title,questions,exam,review_status,review_note").eq("id", id).maybeSingle()), loadHeader()]);
  if (!quiz) { v.innerHTML = `<div class="notice">Quiz not found. <a href="#/quizzes">Back to quizzes</a></div>`; return; }
  const school = head.profile, mine = quiz.owner_id === auth.user?.id;
  const ex = { ...defaults(quiz, school.kind), ...(quiz.exam || {}) };
  if (quiz.exam?.instrB && !quiz.exam.instrBExtra) ex.instrBExtra = ""; // older saved format
  const usable = quiz.questions.filter((x) => x.type !== "poll" && x.type !== "word");
  const nObj = usable.filter((x) => x.type !== "short").length, nTh = usable.length - nObj;
  const nOptional = usable.filter((x) => x.type === "short" && !x.compulsory).length;
  const needsApproval = head.school?.require_approval && quiz.review_status !== "approved";
  const draft = needsApproval ? " draft" : "";

  v.innerHTML = `
    <div class="page-h no-print"><div><a href="${mine ? "#/quizzes" : "#/reviews"}" style="font-size:14px">← ${mine ? "Quizzes" : "Reviews"}</a><h1>Print exam paper</h1>
      <p class="muted" style="margin:4px 0 0">${esc(quiz.title)} · ${nObj} objective, ${nTh} theory questions</p></div>
      <div class="row">${mine ? `<a class="btn" href="#/edit/${quiz.id}">Edit questions</a>` : ""}<button class="btn" id="word" type="button">Download Word file</button><button class="btn primary big" id="print" type="button">Print / Save as PDF</button></div></div>
    ${needsApproval ? `<div class="notice no-print"><b>Not approved yet.</b> Your school requires HOD approval before exams are printed, so the paper is marked DRAFT. ${quiz.review_status === "submitted" ? "It is waiting for review." : quiz.review_status === "changes" ? "Your HOD asked for changes: " + esc(quiz.review_note) : mine ? `Use <b>Send for review</b> on the Quizzes page.` : ""}</div>` : ""}
    ${school.name ? "" : `<div class="notice no-print">Add your school name and logo once under <a href="#/school">School</a> so they appear on every paper.</div>`}
    <div class="exam-layout">
      <form class="panel no-print" id="exForm" style="gap:14px">
        <div class="field"><label class="label" for="ex-style">Paper style</label><select id="ex-style"><option value="school">Primary / secondary school</option><option value="university">University</option><option value="polytechnic">Polytechnic</option><option value="college">College of Education / other college</option></select></div>
        <h2 style="font-size:18px">Paper heading</h2>
        ${fld("title", "Examination", "text", `list="examTitles"`)}
        <datalist id="examTitles"><option>First Term Examination</option><option>Second Term Examination</option><option>Third Term Examination</option><option>Mid-Term Test</option><option>Continuous Assessment Test</option><option>Mock Examination</option><option>Promotion Examination</option><option>First Semester Examination</option><option>Second Semester Examination</option><option>Resit Examination</option></datalist>
        ${fld("session", "Academic session")}
        <div data-style="school" class="opts">${fld("subject", "Subject")}${fld("klass", "Class", "text", `placeholder="e.g. JSS 2 / SS 1"`)}</div>
        <div data-style="tertiary" style="display:grid;gap:12px">
          <div class="opts">${fld("faculty", "Faculty / School")}${fld("department", "Department")}</div>
          ${fld("level", "Level / programme", "text", `placeholder="${levelHint[ex.style] || "e.g. 300 Level / ND II / NCE 2"}"`)}
          <div class="opts">${fld("courseCode", "Course code", "text", `placeholder="e.g. BIO 201"`)}${fld("units", "Units", "text", `placeholder="e.g. 3"`)}</div>
          ${fld("courseTitle", "Course title")}${fld("examiner", "Examiner(s)")}
        </div>
        <div class="opts">${fld("duration", "Time allowed")}${fld("date", "Date (optional)", "text", `placeholder="e.g. 12th December, 2026"`)}</div>
        <h2 style="font-size:18px">Sections and instructions</h2>
        <div class="field"><label class="label" for="ex-instrGeneral">General instructions</label><textarea id="ex-instrGeneral" rows="2">${esc(ex.instrGeneral)}</textarea></div>
        ${fld("headA", "Section A heading")}
        <div class="field"><label class="label" for="ex-instrA">Section A instructions</label><textarea id="ex-instrA" rows="2">${esc(ex.instrA)}</textarea></div>
        ${fld("headB", "Section B heading")}
        <div class="opts">
          <div class="field"><label class="label" for="ex-answerAny">Section B: answer any</label><select id="ex-answerAny"><option value="0">ALL</option>${Array.from({ length: Math.max(0, nOptional - 1) }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select></div>
          ${fld("marksA", "Default marks per objective", "number", `min="0" step="0.5"`)}${fld("marksB", "Default marks per theory question", "number", `min="0" step="1"`)}
        </div>
        <p class="muted" style="margin:-4px 0 0;font-size:13px">Give individual questions their own marks, or make one compulsory, in <b>Edit questions</b>.</p>
        ${fld("instrBExtra", "Extra note for Section B (optional)")}
        <h2 style="font-size:18px">Layout</h2>
        <div class="opts">
          <div class="field"><label class="label" for="ex-versions">Paper types</label><select id="ex-versions"><option value="1">One paper</option><option value="2">Type A and B</option><option value="3">Types A, B, C</option><option value="4">Types A–D</option></select></div>
          <div class="field"><label class="label" for="ex-lines">Answer lines per theory question</label><select id="ex-lines"><option value="0">None (answer booklet)</option><option value="4">4 lines</option><option value="8">8 lines</option><option value="14">14 lines</option></select></div>
          <div class="field"><label class="label" for="ex-fontSize">Text size</label><select id="ex-fontSize"><option value="11">Small (11pt)</option><option value="12">Normal (12pt)</option><option value="13">Large (13pt)</option><option value="14">Extra large (14pt)</option></select></div>
        </div>
        <div class="checks">
          <label class="check"><input type="checkbox" id="ex-candidate"> Candidate name / number</label>
          <label class="check"><input type="checkbox" id="ex-cover"> Cover page</label>
          <label class="check"><input type="checkbox" id="ex-omr"> OMR answer sheet</label>
          <label class="check"><input type="checkbox" id="ex-key"> Marking scheme</label>
        </div>
        ${fld("closing", "Closing line")}
        <p class="muted" style="margin:0;font-size:13px">Paper types shuffle the question and option order so neighbours can't copy; each has its own marking scheme. ${mine ? "Settings save automatically." : "You are previewing a colleague's paper; settings are not saved."}</p>
      </form>
      <div class="paper-wrap" id="paperWrap"><div id="papers"></div></div>
    </div>`;

  for (const k of ["style", "title", "session", "subject", "klass", "faculty", "department", "level", "courseCode", "units", "courseTitle", "examiner", "duration", "date", "headA", "headB", "instrBExtra", "marksA", "marksB", "closing", "answerAny", "versions", "lines", "fontSize"])
    $("#ex-" + k, v).value = String(ex[k] ?? "");
  for (const k of ["candidate", "omr", "key", "cover"]) $("#ex-" + k, v).checked = !!ex[k];
  const NUM = new Set(["answerAny", "versions", "lines", "fontSize", "marksA", "marksB"]);
  const read = () => {
    for (const k of Object.keys(ex)) {
      const el = $("#ex-" + k, v); if (!el) continue;
      ex[k] = el.type === "checkbox" ? el.checked : NUM.has(k) ? Number(el.value) || 0 : el.value;
    }
  };
  const fit = () => { // shrink the A4 preview to fit narrow screens
    const wrap = $("#paperWrap", v), papers = $("#papers", v);
    const k = Math.min(1, (wrap.clientWidth - 24) / 794);
    papers.style.zoom = k < 1 ? String(k) : "";
  };
  const render = () => {
    read();
    v.querySelectorAll("[data-style]").forEach((el) => (el.hidden = el.dataset.style !== (tertiary(ex) ? "tertiary" : "school")));
    $("#papers", v).innerHTML = buildPapers(quiz, school, ex, draft);
    renderMath($("#papers", v));
    fit();
  };
  addEventListener("resize", fit);
  let saveT;
  $("#exForm", v).addEventListener("input", () => {
    render();
    if (!mine) return;
    clearTimeout(saveT);
    saveT = setTimeout(() => sb.from("quizzes").update({ exam: ex }).eq("id", quiz.id).then(({ error }) => error && toast("Couldn't save settings: " + error.message, true)), 800);
  });
  $("#exForm", v).addEventListener("submit", (e) => e.preventDefault());
  // Changing school <-> university/polytechnic/college: swap the wording the teacher hasn't changed.
  $("#ex-style", v).addEventListener("change", () => {
    const now = defaults(quiz, TERTIARY.includes(ex.style) ? ex.style : school.kind === "primary" ? "primary" : "secondary");
    const swaps = { "First Term Examination": "First Semester Examination", "Second Term Examination": "Second Semester Examination", "First Semester Examination": "First Term Examination", "Second Semester Examination": "Second Term Examination" };
    const term = /Term/.test(ex.title), sem = /Semester/.test(ex.title);
    if ((tertiary(ex) && term) || (!tertiary(ex) && sem)) $("#ex-title", v).value = swaps[ex.title] || now.title;
    const known = new Set(TERTIARY.concat("school").map((st) => defaults(quiz, st === "school" ? "secondary" : st).instrGeneral));
    if (known.has(ex.instrGeneral)) $("#ex-instrGeneral", v).value = now.instrGeneral;
    const lv = $("#ex-level", v); if (lv) lv.placeholder = levelHint[ex.style] || "";
    $("#exForm", v).dispatchEvent(new Event("input"));
  });
  const fileName = () => [tertiary(ex) ? ex.courseCode || ex.courseTitle : ex.subject, tertiary(ex) ? ex.level : ex.klass, ex.title].filter(Boolean).join(" - ");
  $("#print", v).onclick = () => {
    if (!usable.length) return toast("This quiz has no exam questions yet", true);
    const old = document.title, z = $("#papers", v).style.zoom;
    document.title = fileName(); // becomes the PDF file name
    $("#papers", v).style.zoom = "";
    window.print();
    document.title = old; $("#papers", v).style.zoom = z;
  };
  $("#word", v).onclick = async () => {
    if (!usable.length) return toast("This quiz has no exam questions yet", true);
    const b = $("#word", v); b.disabled = true; b.textContent = "Preparing…";
    try {
      const { buildExamDocx } = await import("./docx.js");
      const n = Math.max(1, Math.min(4, ex.versions || 1));
      const papers = Array.from({ length: n }, (_, vi) => paperModel(quiz, ex, vi));
      const shownSchool = needsApproval ? { ...school, name: (school.name || "SCHOOL NAME") + " — DRAFT, NOT APPROVED" } : school;
      const blob = await buildExamDocx({ school: shownSchool, ex, papers, key: ex.key, headerFields: metaFields(ex) });
      downloadFile((fileName() || "Exam paper") + ".docx", blob);
      toast("Word file downloaded");
    } catch (e) { toast("Couldn't make the Word file: " + e.message, true); }
    finally { b.disabled = false; b.textContent = "Download Word file"; }
  };
  render();
}

function fld(k, label, type = "text", extra = "") {
  return `<div class="field"><label class="label" for="ex-${k}">${label}</label><input id="ex-${k}" type="${type}" ${extra}></div>`;
}
