// Reads existing exam questions typed the usual way, e.g.
//   1. The capital of Nigeria is
//   A. Lagos  B. Abuja  C. Kano  D. Ibadan
//   Answer: B
//   SECTION B
//   1. (a) Define a cell. (b) Name four parts of a cell. [10 marks]
//   ANSWERS: 1. B  2. C  3. A
// Questions without options become written (theory) questions.

const RE_Q = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-]\s*(.*)$/i;
const RE_OPT_START = /^\(?([A-Fa-f])\s*[.)]\s*(.*)$/;
const RE_ANS = /^(?:ans(?:wer)?|correct(?:\s+answer)?|key|soln?)\s*[:.\-]\s*\(?([A-Fa-f]|true|false)\)?\b/i;
const RE_MARKS = /[[(]\s*(\d{1,3})\s*marks?\s*[\])]\s*$/i;
const RE_THEORY = /^(section\s*b\b|part\s*b\b|theory|essay|subjective|structured)/i;
const RE_OBJ = /^(section\s*a\b|part\s*a\b|objectives?|multiple[\s-]*choice)/i;
const RE_KEY = /^(answers?|answer\s*key|marking\s*(scheme|guide)|solutions?|key)\s*:?\s*(.*)$/i;
const IDX = (l) => "abcdef".indexOf(l.toLowerCase());

// Splits "A. Lagos B. Abuja C. Kano" into options when the letters run in order.
function splitOptions(s) {
  const marks = [...s.matchAll(/(?:^|\s)\(?([A-Fa-f])\s*[.)]\s+/g)];
  const seq = [];
  for (const m of marks) if (IDX(m[1]) === seq.length) seq.push(m);
  if (seq.length < 2) return null;
  const before = s.slice(0, seq[0].index).trim();
  const opts = seq.map((m, i) => s.slice(m.index + m[0].length, i + 1 < seq.length ? seq[i + 1].index : undefined).trim());
  return { before, opts };
}

export function parseQuestions(raw) {
  const lines = String(raw || "").replace(/\r/g, "").split("\n").map((l) => l.replace(/ /g, " ").trim());
  const out = [], key = {};
  let cur = null, theory = false, keyMode = false, objNo = 0;

  const finish = () => {
    if (!cur) return;
    const m = cur.question.match(RE_MARKS);
    if (m) { cur.marks = Number(m[1]); cur.question = cur.question.replace(RE_MARKS, "").trim(); }
    const tf = cur.options.length === 2 && /^true$/i.test(cur.options[0]) && /^false$/i.test(cur.options[1]);
    if (cur.options.length >= 2 && !cur.theory) {
      cur.type = tf ? "tf" : "mcq";
      if (tf) cur.options = ["True", "False"];
      if (cur.answer == null) cur.needsAnswer = true;
    } else {
      cur.type = "short";
      cur.question = [cur.question, ...cur.options.map((o, i) => `(${"abcdef"[i]}) ${o}`)].join("\n").trim();
      cur.options = [];
      cur.answer = ""; cur.keyPoints = []; cur.needsAnswer = true;
    }
    if (cur.question) out.push(cur);
    cur = null;
  };

  for (const line of lines) {
    if (!line) continue;
    // "Answer: B" right after a question belongs to that question, not an answer key
    const am0 = !keyMode && cur && line.match(RE_ANS);
    if (am0 && /^[a-f]$|^true$|^false$/i.test(am0[1]) && line.replace(RE_ANS, "").trim().length < 3) {
      const v = am0[1].toLowerCase();
      cur.answer = v === "true" ? 0 : v === "false" ? 1 : IDX(v);
      continue;
    }
    const km = line.match(RE_KEY);
    if (km && !RE_Q.test(line)) { finish(); keyMode = true; if (km[3]) parseKeyLine(km[3], key); continue; }
    if (keyMode) { if (parseKeyLine(line, key)) continue; keyMode = false; }
    if (RE_THEORY.test(line)) { finish(); theory = true; continue; }
    if (RE_OBJ.test(line)) { finish(); theory = false; continue; }
    if (/^instructions?\b|^time\s*(allowed)?\s*:|^answer (all|any)\b/i.test(line)) continue;

    const am = line.match(RE_ANS);
    if (am && cur) {
      const v = am[1].toLowerCase();
      cur.answer = v === "true" ? 0 : v === "false" ? 1 : IDX(v);
      continue;
    }
    const qm = line.match(RE_Q);
    if (qm && !(cur && !cur.theory && cur.options.length && RE_OPT_START.test(line))) {
      finish();
      cur = { question: "", options: [], answer: null, theory, num: theory ? null : ++objNo, srcNum: Number(qm[1]) };
      const sp = theory ? null : splitOptions(qm[2]);
      if (sp) { cur.question = sp.before; cur.options = sp.opts; } else cur.question = qm[2];
      continue;
    }
    if (!cur) continue;
    const om = line.match(RE_OPT_START);
    if (om && !cur.theory && (IDX(om[1]) === cur.options.length)) {
      const sp = splitOptions(line);
      if (sp && !sp.before) cur.options.push(...sp.opts); else cur.options.push(om[2]);
      continue;
    }
    if (om && cur.theory) { cur.question += "\n" + line; continue; }
    // continuation of the question or of the last option
    if (cur.options.length && !cur.theory) cur.options[cur.options.length - 1] += " " + line;
    else cur.question += (cur.question ? (cur.theory ? "\n" : " ") : "") + line;
  }
  finish();

  // apply a separate answer key to the objective questions (by their printed number)
  for (const q of out) {
    if ((q.type === "mcq" || q.type === "tf") && q.needsAnswer && key[q.srcNum] != null) {
      const v = key[q.srcNum];
      q.answer = q.type === "tf" ? (v === "true" || v === "a" ? 0 : 1) : IDX(v);
      if (q.answer >= 0 && q.answer < q.options.length) delete q.needsAnswer;
    }
    delete q.num; delete q.srcNum; delete q.theory;
  }
  return out;
}

// "1. B  2. C 3-A 4)d" or "1 B" -> {1:"b", 2:"c", ...}. Returns true if anything was found.
function parseKeyLine(line, key) {
  let found = false;
  for (const m of line.matchAll(/(\d{1,3})\s*[.):\-]?\s*\(?([A-Fa-f]|true|false)\)?(?![A-Za-z])/gi)) { key[Number(m[1])] = m[2].toLowerCase(); found = true; }
  return found;
}
