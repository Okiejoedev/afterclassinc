// Built-in question writer: free, runs in the browser, no AI.
//
// It follows the "over-generate, then rank" approach used in automatic question
// generation research (e.g. Heilman & Smith 2010), shaped by how Nigerian exam
// questions are set (WAEC/NECO command words: define, state, list, explain, distinguish):
//   1. Read the notes' structure: headings, bullet lists and sentences
//      (PDF lines that wrap mid-sentence are joined back together).
//   2. Pull out facts a teacher would examine: definitions, lists ("the functions
//      of X are…", bullet lists under a heading), reasons ("…because…"),
//      causes ("X leads to Y"), dates and quantities.
//   3. Write several exam-style questions for each fact. Wrong options come from
//      facts of the same kind (other definitions, items of other lists, nearby
//      numbers) so they are plausible, not random words.
//   4. Score every candidate and choose a varied set: one question per fact, no
//      term asked twice, no question form overused, spread across the notes.
// Sentences that can't stand alone ("It takes place…", "as shown in the figure")
// are never used, so questions make sense without the notes.

const uid = () => Math.random().toString(36).slice(2, 10);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const words = (s) => String(s).toLowerCase().match(/[a-z0-9]+/g) || [];
const wc = (s) => words(s).length;
const ucfirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const trimEnd = (s) => String(s).trim().replace(/[\s.;:,]+$/, "");

// Words that can't start a term, and openings that need the previous sentence to make sense.
const BAD_START = new Set("it its this that these those they them their there here he she his her we our you your such one some many most each every another other all any both either neither several few also however although though because when while if so thus hence therefore then which who whom whose what where why how first second third finally lastly next only very more less same following above below".split(" "));
const DANGLING = /^(it|its|this|that|these|those|they|their|them|he|she|his|her|such|here|there|also|however|therefore|thus|hence|so|then|similarly|likewise|in addition|on the other hand|as a result|for example|e\.g\.)\b/i;
const NEEDS_FIGURE = /\b(fig\.?|figure|diagram|table|graph|chart|shown above|shown below|the above|the following|see page|as shown)\b/i;
const WEAK_DEF = new Set("very also not used found important made located able usually often more less present responsible good bad easy difficult necessary possible common rare called known divided based different similar same in on at by for to of with from into usually mostly mainly sometimes always never still now then".split(" "));
const STOP = new Set("about above after again against because been before being below between both could does doing down during each from further have having here itself just more most other ought same should some such than that their theirs them then there these they this those through under until very what when where which while whom would your also into only over will with were shall many much like upon used using example called known often however therefore thus within without another different important include includes including following figure chapter lecture section page slide".split(" "));

// Kinds of lists teachers set questions on, with their singular form.
const REL = {
  types: "type", kinds: "kind", forms: "form", classes: "class", categories: "category", branches: "branch",
  functions: "function", roles: "role", uses: "use", importance: null, advantages: "advantage", disadvantages: "disadvantage",
  parts: "part", components: "component", features: "feature", characteristics: "characteristic", properties: "property",
  examples: "example", stages: "stage", steps: "step", phases: "phase", causes: "cause", effects: "effect", factors: "factor",
  sources: "source", methods: "method", reasons: "reason", principles: "principle", organs: "organ", elements: "element",
  sources_: null, structures: "structure", qualities: "quality", duties: "duty", objectives: "objective", problems: "problem",
};
const REL_RE = Object.keys(REL).filter((k) => !k.endsWith("_")).join("|");
const NUMWORD = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const NUMNAME = ["", "one", "two", "three", "four", "five", "six"];

/* ---------------- 1. read the structure ---------------- */
// Lesson notes often end with EVALUATION / ASSIGNMENT questions: those are not facts to ask about.
const NOT_CONTENT = /^(?:evaluation|class\s*work|classwork|assignment|weekend assignment|reading assignment|home\s*work|exercises?|questions?|revision questions?|test yourself|quiz|references?|further reading|bibliography|summary questions?)\b/i;
const ASK_START = /^(?:define|state|list|mention|explain|describe|discuss|give|name|outline|enumerate|highlight|identify|differentiate|distinguish|compare|write|draw|label|calculate|what|why|how|which|who|when|where)\b/i;
const isAsk = (t) => /\?\s*$/.test(t) || ASK_START.test(String(t).trim());
const BULLET = /^\s*(?:[-•●▪◦*·‣⁃–—►✓]|\(?[a-h]\)|\(?(?:i|ii|iii|iv|v|vi|vii|viii)\)|\d{1,2}[.)])\s+/i;

function isHeading(line, prevEndsSentence) {
  const t = line.trim();
  if (!t || t.length > 70 || BULLET.test(t) || !prevEndsSentence) return false;
  if (/[.?!,;]$/.test(t) || wc(t) > 9 || wc(t) === 0) return false;
  return /^[A-Z0-9]/.test(t);
}

// -> [{ heading, sentences: [{s, src}], lists: [{intro, heading, items: [{name, detail}], src}] }]
function parse(text) {
  const segs = [];
  let seg = { heading: "", sentences: [], lists: [] }; segs.push(seg);
  let file = "", page = "", para = [], bullets = [], numbered = 0, intro = "", prevEnds = true;
  const src = () => [file, page && "p. " + page].filter(Boolean).join(", ");
  const flushPara = () => {
    if (!para.length) return;
    const body = para.join(" ").replace(/\s+/g, " ").trim(); para = [];
    for (const s of body.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)) {
      const t = s.trim();
      if (t.length >= 25 && t.length <= 320 && wc(t) >= 5 && /[a-z]/.test(t) && !isAsk(t)) seg.sentences.push({ s: t, src: src() });
    }
  };
  const flushBullets = () => {
    if (bullets.length >= 2) {
      const items = bullets.filter((b) => !isAsk(b)).map(splitItem).filter(Boolean);
      // Long bullets are really sentences.
      const listy = items.filter((x) => wc(x.name) <= 10);
      if (listy.length >= 2) seg.lists.push({ intro, heading: seg.heading, items: listy, src: src(), numbered: numbered === bullets.length });
      for (const b of bullets) if (wc(b) > 12 && !/[–—:]/.test(b)) para.push(/[.!?]$/.test(b) ? b : b + ".");
      flushPara();
    } else if (bullets.length === 1) { para.push(bullets[0]); }
    bullets = []; numbered = 0; intro = "";
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    const fm = line.match(/^=== (.+?) ===$/), pm = line.match(/^\[Page (\d+)\]$/);
    if (fm) { flushBullets(); flushPara(); file = fm[1].replace(/\.[^.]+$/, ""); page = ""; seg = { heading: "", sentences: [], lists: [] }; segs.push(seg); prevEnds = true; continue; }
    if (pm) { page = pm[1]; continue; }
    if (!line) { flushBullets(); flushPara(); prevEnds = true; continue; }
    if (BULLET.test(line)) {
      if (!bullets.length) { // the line before a list is its introduction
        const last = para.length ? para[para.length - 1] : "";
        if (last && (/:$/.test(last) || wc(last) <= 14)) { intro = para.pop(); }
        flushPara();
      }
      bullets.push(line.replace(BULLET, "").trim());
      if (/^\s*\(?\d{1,2}[.)]/.test(line)) numbered++;
      prevEnds = true; continue;
    }
    if (bullets.length) flushBullets();
    if (isHeading(line, prevEnds)) {
      flushPara();
      seg = { heading: line.replace(/:$/, ""), sentences: [], lists: [] }; segs.push(seg);
      // Lesson-note sections that hold questions, not content.
      seg.skip = NOT_CONTENT.test(seg.heading);
      prevEnds = true; continue;
    }
    para.push(line);
    prevEnds = /[.?!:]$/.test(line);
  }
  flushBullets(); flushPara();
  return segs.filter((g) => !g.skip && (g.sentences.length || g.lists.length));
}

// "Nucleus – controls the cell" -> { name: "Nucleus", detail: "controls the cell" }
function splitItem(b) {
  const t = trimEnd(b);
  const m = t.match(/^(.{2,60}?)\s*(?:\s[–—-]\s|:\s)\s*(.{3,})$/);
  if (m && wc(m[1]) <= 6) return { name: trimEnd(m[1]), detail: trimEnd(m[2]) };
  const p = t.match(/^(.{2,50}?)\s*\((.{3,})\)$/);
  if (p) return { name: trimEnd(p[1]), detail: trimEnd(p[2]) };
  return t ? { name: t, detail: "" } : null;
}

/* ---------------- 2. pull out facts ---------------- */
function cleanTerm(t) {
  let s = trimEnd(String(t)).replace(/^(?:the|an?)\s+/i, "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (!s || s.length < 3 || wc(s) > 6 || !/^[A-Za-z]/.test(s)) return null;
  if (BAD_START.has(s.split(/\s+/)[0].toLowerCase())) return null;
  if (/\b(is|are|was|were|has|have|can|will|would|should|must|do|does)\b/i.test(s)) return null;
  return s;
}
function cleanDef(d) {
  const s = trimEnd(d);
  return wc(s) >= 3 && wc(s) <= 45 ? s : null;
}
const usable = (s) => !DANGLING.test(s) && !NEEDS_FIGURE.test(s);
// "Cells with a nucleus are called eukaryotic, while cells without one are called prokaryotic."
function clauses(s) {
  const parts = s.split(/,?\s+(?:while|whereas)\s+|;\s+/i).map((x) => x.trim()).filter((x) => wc(x) >= 4);
  return parts.length > 1 ? parts.map((x) => ucfirst(x.replace(/\.?$/, "."))) : [s];
}
// The article the notes use before a term ("The cell is…", "is known as an argument").
function articleOf(s, term) {
  const m = s.match(new RegExp("\\b(the|an?)\\s+" + esc(term) + "\\b", "i"));
  return m ? m[1].toLowerCase() + " " : "";
}
const named = (f) => (f.art || "") + lc(f.term);           // "the cell", "a variable", "diffusion"
// "separation of powers" is singular, "arms of government" plural: look at the word before "of".
const isAre = (t) => { const h = String(t).split(/\s+of\s+/)[0].trim().split(" ").pop(); return /s$/.test(h) && !/(ss|us|is)$/.test(h) ? "are" : "is"; };

function extract(segs) {
  const facts = [];
  const add = (f) => { f.id = facts.length; facts.push(f); };
  segs.forEach((g, gi) => {
    // Lists written as bullets.
    for (const L of g.lists) {
      const hdr = parseListHead(L.intro) || parseListHead(L.heading) || parseListHead(L.intro + " " + L.heading);
      const items = L.items.map((x) => x.name);
      // Numbered stages / steps of a process can be asked about in order.
      const ordered = L.numbered && (/^(?:stages|steps|phases)$/.test(hdr?.rel || "") || /\b(stages?|steps?|phases?|process|procedure|sequence|order|how to)\b/i.test(`${L.intro} ${L.heading}`));
      if (hdr) add({ kind: "list", rel: hdr.rel, conn: hdr.conn, topic: hdr.topic, items, ordered, seg: gi, src: L.src, text: `${hdr.rel} of ${hdr.topic}: ${items.join(", ")}` });
      else add({ kind: "group", items, seg: gi, src: L.src, text: items.join(", ") });   // distractor pool only
      // "Nucleus – controls the activities of the cell": a fact about each item.
      for (const it of L.items) if (it.detail && wc(it.detail) >= 2) {
        const term = cleanTerm(it.name);
        if (term) add({ kind: "role", term, desc: it.detail, siblings: items, topic: hdr?.topic || "", rel: hdr?.rel || "", seg: gi, src: L.src, text: `${term}: ${it.detail}` });
      }
    }
    for (const { s: whole, src } of g.sentences) for (const s of clauses(whole)) {
      const base = { seg: gi, src, sentence: s };
      let m, f = null;
      const plain = s.replace(/\.$/, "");
      // Lists inside a sentence ("The features of federalism are…"). A list is not also a definition.
      const L = sentenceList(plain);
      if (L) add({ ...base, kind: "list", ...L, ordered: /^(?:stages|steps|phases)$/.test(L.rel), text: s });
      // Definitions.
      if (L) { /* already used as a list */ }
      else if ((m = plain.match(/^(.{8,160}?)\s+(?:is|are)\s+(?:called|known as|termed|referred to as)\s+(?:an?\s+|the\s+)?(.{2,50})$/i)) && cleanTerm(m[2]) && cleanDef(m[1]) && !DANGLING.test(m[1]))
        f = { kind: "def", term: cleanTerm(m[2]), def: lcfirstIfCommon(cleanDef(m[1])) };
      else if ((m = plain.match(/^(?:the\s+|an?\s+)?(.{2,60}?)\s+(?:is|are)\s+(?:defined|described)\s+as\s+(.+)$/i)) || (m = plain.match(/^(?:the\s+|an?\s+)?(.{2,60}?)\s+(?:can|may)\s+be\s+defined\s+as\s+(.+)$/i)) || (m = plain.match(/^(?:the\s+|an?\s+)?(.{2,60}?)\s+(?:refers? to|means)\s+(.+)$/i)))
        // "Separation of powers means that the arms…" explains an idea: good for "What is meant by…?" only.
        f = cleanTerm(m[1]) && cleanDef(m[2]) ? { kind: /^that\s/i.test(m[2]) ? "meaning" : "def", term: cleanTerm(m[1]), def: cleanDef(m[2].replace(/^that\s+/i, "")) } : null;
      else if ((m = plain.match(/^(?:the\s+|an?\s+)?(.{2,50}?)\s+(is|are)\s+((?:an?|the|one of the)\s+.+)$/i)) && cleanTerm(m[1]) && cleanDef(m[3]) && wc(m[3]) >= 4)
        f = { kind: "def", term: cleanTerm(m[1]), def: cleanDef(m[3]) };
      else if ((m = plain.match(/^([A-Za-z][\w-]*(?:\s[a-z][\w-]*)?s)\s+are\s+([a-z][\w-]*\s.+)$/)) && cleanTerm(m[1]) && !WEAK_DEF.has(m[2].split(" ")[0]) && !/(ed|ly|en|wn)$/.test(m[2].split(" ")[0]) && wc(m[2]) >= 3 && wc(m[2]) <= 30)
        f = { kind: "def", term: cleanTerm(m[1]), def: cleanDef(m[2]) };
      // "Small talk is light conversation about … that helps …": a longer description with a noun phrase.
      else if ((m = plain.match(/^([A-Z][\w-]*(?:\s[a-z][\w-]*){0,2})\s+is\s+([a-z][\w-]*\s[a-z][\w-]*\s.+)$/)) && cleanTerm(m[1]) && !WEAK_DEF.has(m[2].split(" ")[0]) && !/(ed|ly|en|wn|ing|ful|ive|ous|able|ible|ant|ent)$/.test(m[2].split(" ")[0]) && wc(m[2]) >= 6 && wc(m[2]) <= 30 && /\b(that|which|who|of|for|about|used|by)\b/.test(m[2]))
        f = { kind: "def", term: cleanTerm(m[1]), def: cleanDef(m[2]) };
      if (f) {
        f.art = articleOf(plain, f.term);
        // "High-level languages are languages that…" says nothing on its own: keep the clause.
        f.def = f.def.replace(new RegExp("^" + esc(f.term) + "\\s+(that|which|who)\\s+", "i"), "$1 ");
        if (f.def && !new RegExp("\\b" + esc(f.term) + "\\b", "i").test(f.def)) add({ ...base, ...f, text: s });
      }
      // Reasons: "Plant cells do not burst in water because…"
      const why = whyQuestion(plain);
      if (why && usable(s)) add({ ...base, kind: "why", q: why.q, clause: why.clause, reason: why.reason, text: s });
      // Causes: "X causes / leads to / results in Y".
      if ((m = plain.match(/^(?:the\s+)?(.{3,60}?)\s+(causes|leads to|results in|brings about|is caused by|are caused by)\s+(.{3,80})$/i)) && usable(s) && !BAD_START.has(m[1].split(" ")[0].toLowerCase())) {
        const passive = /caused by/i.test(m[2]);
        add({ ...base, kind: "cause", cause: trimEnd(passive ? m[3] : m[1]), effect: trimEnd(passive ? m[1] : m[3]), verb: passive ? "causes" : m[2].toLowerCase(), text: s });
      }
      // Dates and quantities.
      if (usable(s) && (m = s.match(/\b(1[5-9]\d\d|20\d\d)\b/))) add({ ...base, kind: "num", value: m[1], year: true, text: s });
      else if (usable(s) && (m = s.match(/\b(\d{1,6}(?:\.\d+)?)\s?(%|°C|°F|km|kg|cm|mm|m|g|ml|l|litres?|metres?|hours?|minutes?|seconds?|days?|years?|times|states|percent)\b/i)) && +m[1] > 1)
        add({ ...base, kind: "num", value: m[1], unit: m[2], text: s });
      // Any clear sentence can still become a gap-fill if it holds a key term.
      if (usable(s) && wc(s) >= 7 && wc(s) <= 40) add({ ...base, kind: "sent", text: s });
    }
  });
  return facts;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Words seen capitalised in the middle of a sentence are names (Nigeria, Robert Hooke);
// everything else is lower-cased when it moves away from the start of a sentence.
let proper = new Set();
const isProper = (w) => proper.has(w) || /^[A-Z]{2,}$/.test(w);
function lcfirstIfCommon(s) { const w = String(s).split(" ")[0]; return isProper(w) ? s : w.toLowerCase() + s.slice(w.length); }
const commonWords = { has: (w) => !proper.has(ucfirst(w)) };

// "Types of X", "The main functions of the heart are:", "Reasons for the adoption of federalism".
function parseListHead(t) {
  if (!t) return null;
  const s = trimEnd(t).replace(/:$/, "");
  let m = s.match(new RegExp(`\\b(?:the\\s+)?(?:(?:main|major|basic|different|various|important|key|${Object.keys(NUMWORD).join("|")}|\\d+)\\s+)*(${REL_RE})\\s+(of|for|affecting|influencing)\\s+((?:an?\\s+|the\\s+)?.{2,60}?)(?:\\s+(?:are|include|includes|is|are as follows|consist of))?$`, "i"));
  if (m) return { rel: m[1].toLowerCase(), conn: m[2].toLowerCase(), topic: trimEnd(m[3]) };
  m = s.match(/^(?:the\s+)?(?:main\s+|major\s+)?(.{2,40}?)\s+(?:of|in)\s+(?:an?\s+|the\s+)?(.{2,40})$/i);
  if (m && /s$/.test(m[1]) && wc(m[1]) <= 2 && !BAD_START.has(m[1].split(" ")[0].toLowerCase())) return { rel: m[1].toLowerCase(), topic: trimEnd(m[2]) };
  return null;
}
function sentenceList(s) {
  const split = (rest) => trimEnd(rest).replace(/^(?:namely|such as|the following|as follows)[:,]?\s*/i, "")
    .split(/\s*[,;]\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+/).map((x) => trimEnd(x.replace(/^(?:the|an?)\s+/i, ""))).filter(Boolean);
  const ok = (items) => items.length >= 2 && items.length <= 10 && items.every((x) => wc(x) >= 1 && wc(x) <= 5 && !/\b(is|are|was|were)\b/i.test(x));
  let m = s.match(new RegExp(`^(?:the\\s+)?(?:(?:main|major|basic|different|various|important|key|${Object.keys(NUMWORD).join("|")}|\\d+)\\s+)*(${REL_RE})\\s+(of|for|affecting|influencing)\\s+((?:an?\\s+|the\\s+)?.{2,60}?)\\s+(?:are|include|includes|is|consist of|comprise)\\s*:?\\s*(.+)$`, "i"));
  if (m) { const items = split(m[4]); if (ok(items)) return { rel: m[1].toLowerCase(), conn: m[2].toLowerCase(), topic: trimEnd(m[3]), items }; }
  // Any plural heading word with three or more items: "The three arms of government are A, B and C".
  m = s.match(new RegExp(`^(?:the\\s+)?(?:(?:main|major|${Object.keys(NUMWORD).join("|")}|\\d+)\\s+)*([a-z]+s)\\s+(of|for)\\s+((?:an?\\s+|the\\s+)?.{2,50}?)\\s+(?:are|include)\\s*:?\\s*(.+)$`, "i"));
  if (m && !/(ss|us|is)$/.test(m[1])) { const items = split(m[4]); if (ok(items) && items.length >= 3) return { rel: m[1].toLowerCase(), conn: m[2].toLowerCase(), topic: trimEnd(m[3]), items }; }
  m = s.match(new RegExp(`^(?:there are\\s+)(${Object.keys(NUMWORD).join("|")}|\\d+)\\s+(?:main\\s+|major\\s+)?(${REL_RE})\\s+of\\s+(.{2,50}?)\\s*:\\s*(.+)$`, "i"));
  if (m) { const items = split(m[4]); if (ok(items)) return { rel: m[2].toLowerCase(), topic: trimEnd(m[3]), items }; }
  m = s.match(new RegExp(`^(?:the\\s+|an?\\s+)?(.{2,50}?)\\s+(has|have|consists? of|is made up of|are made up of|is divided into|can be divided into|can be classified into|is classified into|comprises?)\\s+(?:(${Object.keys(NUMWORD).join("|")}|several|the following)\\s+)?(?:main\\s+|major\\s+|basic\\s+)?(?:(${REL_RE})|[a-z]+s)?(\\s+(?:not\\s+)?(?:found|present)\\s+in\\s+[^:]{3,40})?\\s*:?\\s*(?:namely,?\\s*)?(.+)$`, "i"));
  // "has/have" only makes a list with a list word ("has three parts: …"); "is made up of / is divided into" always does.
  if (m && cleanTerm(m[1]) && (m[4] || !/^ha(s|ve)$/i.test(m[2]))) { const items = split(m[6]); if (ok(items)) return { rel: (m[4] || "parts").toLowerCase(), topic: articleOf(s, cleanTerm(m[1])) + cleanTerm(m[1]), qual: (m[5] || "").trim(), items }; }
  return null;
}
// "Plant cells do not burst in water because the cell wall resists…" -> "Why do plant cells not burst in water?"
function whyQuestion(s) {
  const m = s.match(/^(.{4,140}?)\s*,?\s+because\s+(.{5,})$/i);
  if (!m) return null;
  const clause = m[1], reason = trimEnd(m[2]);
  // "Food that is not chewed properly is difficult…" can't be turned around safely: ask "Explain why…".
  if (/\b(?:that|which|who|whose|when|if|whereas)\b/i.test(clause)) return DANGLING.test(clause) ? null : { q: `Explain why ${lc(clause)}.`, clause, reason };
  let k = clause.match(/^((?:the\s+|an?\s+)?[A-Za-z][\w-]*(?:\s[a-z][\w-]*){0,3}?)\s+(is|are|was|were|can|could|will|would|should|must|has|have|had|do|does|did)\s+(not\s+)?(.+)$/i);
  if (k && !DANGLING.test(k[1])) return { q: `Why ${k[2].toLowerCase()} ${lc(k[1])} ${k[3] || ""}${k[4]}?`.replace(/\s+/g, " "), clause, reason };
  k = clause.match(/^((?:the\s+|an?\s+)?[A-Za-z][\w-]*(?:\s[a-z][\w-]*){0,2}?)\s+([a-z]+)\s+(.+)$/);
  if (!k || DANGLING.test(k[1]) || BAD_START.has(k[1].split(" ")[0].toLowerCase())) return null;
  const subj = k[1], verb = k[2], plural = /s$/i.test(subj.split(" ").pop()) && !/ss$/i.test(subj);
  if (/(ed|ing|ly)$/.test(verb) || STOP.has(verb)) return null;
  if (plural && !/s$/.test(verb)) return { q: `Why do ${lc(subj)} ${verb} ${k[3]}?`, clause, reason };
  if (!plural && /[^s]s$/.test(verb)) return { q: `Why does ${lc(subj)} ${base(verb)} ${k[3]}?`, clause, reason };
  return null;
}
const lc = (s) => lcfirstIfCommon(s);
// Every word, for topics taken from Title Case headings ("Stages of Nutrition in Man").
const lcAll = (s) => String(s).split(" ").map((w) => (isProper(w.replace(/[^A-Za-z]/g, "")) ? w : w.toLowerCase())).join(" ");
const base = (v) => /(ss|sh|ch|x|z)es$/.test(v) ? v.slice(0, -2) : /ies$/.test(v) ? v.slice(0, -3) + "y" : v.slice(0, -1);
// "release energy" -> "releases energy" after "Which part … ?" (one thing is asked for).
function thirdPerson(phrase) {
  const [v, ...rest] = phrase.split(" ");
  if (/s$/.test(v) || rest[0] === "and") return phrase;
  const w = /[^aeiou]y$/.test(v) ? v.slice(0, -1) + "ies" : /(s|sh|ch|x|z|o)$/.test(v) ? v + "es" : v + "s";
  return [w, ...rest].join(" ");
}
const singular = (rel) => REL[rel] ?? (rel.endsWith("ies") ? rel.slice(0, -3) + "y" : rel.endsWith("s") ? rel.slice(0, -1) : rel);
const article = (w) => (/^[aeiou]/i.test(w) ? "an " : "a ");

/* ---------------- 3. write candidate questions ---------------- */
// Options for a multiple-choice question: the answer plus 3 of the most similar wrong ones.
// Phrases that start with a verb ("controls the…") and noun phrases ("the jelly-like…")
// are never mixed in one question, so no option gives itself away by its grammar.
const verbFirst = (s) => { const w = String(s).split(" ")[0]; return /^[a-z]+s$/.test(w) && !/(ss|us|is|ous)$/.test(w) && !/^(?:cells|plants|animals|organs|parts|things)$/.test(w); };
// prio(p) > 0 marks the best wrong answers (e.g. the other classes of food for "carbohydrates").
function options(answer, pool, n = 3, prio = () => 0) {
  const a = answer.toLowerCase(), aw = wc(answer), plural = /s$/i.test(answer);
  const seen = new Set([a]);
  const cand = [];
  if (!/\d/.test(answer)) pool = pool.filter((p) => !/\d/.test(p));     // no "36 states" among words
  const sameShape = pool.filter((p) => verbFirst(p) === verbFirst(answer));
  if (sameShape.length >= n) pool = sameShape;
  for (const p of pool) {
    const k = String(p).toLowerCase().trim();
    if (!k || seen.has(k) || k.includes(a) || a.includes(k)) continue;
    seen.add(k);
    const lenFit = 1 - Math.min(1, Math.abs(wc(p) - aw) / Math.max(aw, 3));
    cand.push({ p, r: prio(p) * 3 + lenFit * 2 + (/s$/i.test(p) === plural ? 0.5 : 0) + Math.random() * 0.8 });
  }
  if (cand.length < 2) return null;       // a 3-option question beats no question when the notes are short
  n = Math.min(n, cand.length);
  const opts = shuffle([answer, ...cand.sort((x, y) => y.r - x.r).slice(0, n).map((x) => matchCase(x.p, answer))]);
  return { options: opts, answer: opts.indexOf(answer) };
}
const matchCase = (w, like) => (/^[A-Z]/.test(like) ? ucfirst(w) : /^[a-z]/.test(like) && commonWords.has(w.split(" ")[0].toLowerCase()) ? w.charAt(0).toLowerCase() + w.slice(1) : w);

function nearNumbers(v, year) {
  const n = Number(v), out = new Set();
  const steps = year ? [-10, -5, -3, -2, -1, 1, 2, 3, 5, 10] : null;
  if (year) for (const d of shuffle(steps)) { if (out.size >= 3) break; out.add(String(n + d)); }
  else for (const f of shuffle([0.5, 0.75, 1.25, 1.5, 2, 0.8, 1.2])) {
    if (out.size >= 3) break;
    const x = Number.isInteger(n) ? Math.round(n * f) : +(n * f).toFixed(1);
    if (x !== n && x > 0) out.add(String(x));
  }
  return [...out];
}

function candidates(facts, opts) {
  const defs = facts.filter((f) => f.kind === "def");
  const roles = facts.filter((f) => f.kind === "role");
  const lists = facts.filter((f) => f.kind === "list" || f.kind === "group");
  const terms = [...new Set([...defs.map((f) => f.term), ...roles.map((f) => f.term), ...lists.flatMap((f) => f.items)])];
  const defPool = defs.map((f) => f.def).concat(roles.map((f) => f.desc));
  // Items of other lists, nearest part of the notes first (a plant-cell part is a better wrong answer for "parts of an animal cell" than a word from another topic).
  const itemPool = (exclude) => lists.filter((l) => l !== exclude).sort((a, b) => Math.abs(a.seg - exclude.seg) - Math.abs(b.seg - exclude.seg)).flatMap((l) => l.items).concat(defs.map((f) => f.term));
  const termPool = (T) => terms.filter((x) => x.toLowerCase() !== T.toLowerCase() && wc(x) <= 4);
  // Terms that sit in the same list as T ("carbohydrates" -> proteins, vitamins, fats…).
  const siblingsOf = (T) => new Set(lists.filter((l) => l.items.some((x) => x.toLowerCase() === T.toLowerCase())).flatMap((l) => l.items.map((x) => x.toLowerCase())));
  const segOf = new Map([...defs, ...roles].map((f) => [f.term.toLowerCase(), f.seg]).concat(lists.flatMap((l) => l.items.map((x) => [x.toLowerCase(), l.seg]))));
  const sameSeg = (f, p) => segOf.get(String(p).toLowerCase()) === f.seg;
  const defTerms = new Set(defs.map((f) => f.term.toLowerCase()));   // other concepts make better wrong answers than examples
  const young = opts.level === "p13" || opts.level === "p46";
  const senior = ["sss", "uni", "poly", "coe", "adult"].includes(opts.level) || (opts.level === "jss" && opts.difficulty === "hard");
  const out = [];
  // An option that appears in the question gives the game away (or makes no sense): drop the question.
  const inStem = (o, stem) => new RegExp("\\b" + esc(String(o).toLowerCase()) + "\\b").test(stem.toLowerCase());
  const push = (fact, c) => {
    if (c.type === "mcq" && c.options.some((o) => inStem(o, c.question.replace(/_____/g, " ")))) return;
    out.push({ fact: fact.id, seg: fact.seg, src: fact.src, ...c });
  };

  for (const f of facts) {
    if (f.kind === "def") {
      const T = f.term, D = f.def, tlc = named(f), be = isAre(T);
      let o = options(D, defPool);
      if (o) push(f, { key: T, form: "describes", type: "mcq", question: pick([`Which of the following best describes ${tlc}?`, `What ${be} ${tlc}?`, `${ucfirst(tlc)} can best be described as`, `Which statement correctly defines ${tlc}?`, `${ucfirst(tlc)} ${be} best defined as`]), ...o, explanation: `${ucfirst(T)}: ${D}.`, score: 6 });
      o = options(T, termPool(T), 3, (p) => (siblingsOf(T).has(p.toLowerCase()) ? 2 : 0) + (sameSeg(f, p) ? 1 : 0) + (defTerms.has(p.toLowerCase()) ? 1.5 : 0));
      if (o) push(f, { key: T, form: "name", type: "mcq", question: pick([`What is the name given to ${D}?`, `Which term describes ${D}?`, `${ucfirst(D)} ${/^(?:the|an?)\s/i.test(D) ? isAre(D.split(" ").slice(1, 3).join(" ")) : be} known as`, `The term for ${D} is`]), ...o, explanation: `${ucfirst(tlc)} ${be} ${D}.`, score: 6 + (opts.difficulty === "hard" ? 1 : 0) });
      push(f, { key: T, form: "tf-copy", type: "tf", question: `${ucfirst(tlc)} ${be} ${D}.`, options: ["True", "False"], answer: 0, explanation: "", score: 3 });
      // A false statement is only worth asking if it is plausible: swap in a related definition.
      const near = defs.filter((d) => d !== f && related(f, d));
      if (near.length) { const d = pick(near); push(f, { key: T, form: "tf", type: "tf", question: `${ucfirst(tlc)} ${be} ${d.def}.`, options: ["True", "False"], answer: 1, explanation: `That describes ${named(d)}. ${ucfirst(tlc)} ${be} ${D}.`, score: 5 }); }
      push(f, { key: T, form: "define", type: "short", marks: 2, question: young ? `What ${be} ${tlc}?` : pick([`Define ${tlc}.`, `What is meant by ${tlc}?`, `Explain the term "${lc(T)}".`, `Give the meaning of ${tlc}.`]), answer: `${ucfirst(tlc)} ${be} ${D}.`, keyPoints: keyPoints(D), score: 5 });
      // Two closely related definitions (diffusion / osmosis, compiler / interpreter): compare them.
      const pair = defs.find((d) => d.id > f.id && related(f, d));
      if (pair && !young) push(f, { key: T + "|" + pair.term, keys: [T, pair.term], form: "distinguish", type: "short", marks: 4, question: `Distinguish between ${lc(T)} and ${lc(pair.term)}.`, answer: `${ucfirst(tlc)} ${be} ${D}. ${ucfirst(named(pair))} ${isAre(pair.term)} ${pair.def}.`, keyPoints: [`${lc(T)}: ${D}`, `${lc(pair.term)}: ${pair.def}`], score: 7 + (opts.difficulty === "hard" ? 2 : 0) });
    }
    if (f.kind === "meaning") push(f, { key: f.term, form: "define", type: "short", marks: 2, question: `What is meant by ${named(f)}?`, answer: `${ucfirst(named(f))} means that ${f.def}.`, keyPoints: keyPoints(f.def), score: 5 });
    if (f.kind === "role") {
      const sib = f.siblings.filter((x) => x.toLowerCase() !== f.term.toLowerCase());
      // "controls the cell" / "make proteins" describe what it does; "the jelly-like substance…" what it is.
      const w0 = f.desc.split(" ")[0].toLowerCase();
      const verbish = /^[a-z]/.test(f.desc) && !/^(?:is|are|has|was|a|an|the|one|part|site|place|area|region|layer|organ|organelle|structure|store|source|centre|center|unit|small|large|thin|thick|long|short|main)$/.test(w0) && !/(tion|sion|ment|ness|ity|ance|ence|ure|ism|ous|al|ic|ive|ed)$/.test(w0);
      const o = options(f.term, sib.length >= 3 ? sib : sib.concat(terms));
      const where = f.topic ? ` ${/^(?:parts|organs|components|structures|organelles|elements)$/.test(f.rel || "") ? "in" : "of"} ${lcAll(f.topic.replace(/^(The|An?)\s/, (x) => x.toLowerCase()))}` : "";
      // Name the kind of thing when the notes say it: "Which organ of the digestive system absorbs water…?"
      const kind = f.rel && REL[f.rel] && !/^(?:function|role|use|feature|characteristic|property|advantage|disadvantage|reason|effect|cause|duty|objective|problem|quality|principle|factor)$/.test(REL[f.rel]) ? REL[f.rel] : "";
      const topicL = f.topic ? lcAll(f.topic.replace(/^(The|An?)\s/, (x) => x.toLowerCase())) : "";
      const who = kind && topicL && sib.length >= 3 && (f.siblings.length >= 4 || Math.random() < 0.7) ? `Which ${kind} ${/^(?:an?|the)\s/.test(topicL) ? "of " + topicL : "of the " + topicL}` : "Which of the following";
      // "food is chewed and mixed with saliva" -> "In which organ … is food chewed and mixed with saliva?"
      const clause = f.desc.match(/^((?:the\s+)?[a-z]+(?:\s[a-z]+)?)\s+(is|are|was|were)\s+(.+)$/i);
      const stem = clause ? `In ${who.charAt(0).toLowerCase() + who.slice(1)} ${clause[2]} ${clause[1]} ${clause[3]}?`
        : verbish ? `${who} ${thirdPerson(f.desc)}?` : `${who} is ${f.desc.replace(/^(?:an?|the)\s+/i, (x) => x.toLowerCase())}?`;
      if (o) push(f, { key: f.term, form: "role", type: "mcq", question: stem, ...o, explanation: `${f.term}: ${f.desc}.`, score: 6 });
      // Matching: "Which of the following pairs is correctly matched?" (the other pairs swap descriptions).
      const mates = roles.filter((r) => r !== f && r.siblings === f.siblings);
      if (mates.length >= 3) {
        const group = [f, ...shuffle(mates).slice(0, 3)];
        // Rotate the descriptions so every wrong pair is wrong and no description is shown twice.
        const mates3 = group.slice(1);
        const wrong = mates3.map((r, i) => `${r.term} — ${mates3[(i + 1) % 3].desc}`);
        const right = `${f.term} — ${f.desc}`, os = shuffle([right, ...wrong]);
        push(f, { key: f.term, form: "match", type: "mcq", question: pick(["Which of the following pairs is correctly matched?", `Which of the following correctly matches ${kind ? "the " + kind : "each item"} to its ${/^(?:organ|part|organelle|component|structure)$/.test(kind) ? "function" : "description"}?`]), options: os, answer: os.indexOf(right), explanation: group.map((r) => `${r.term}: ${r.desc}`).join("; ") + ".", score: 6 });
      }
      push(f, { key: f.term, form: "state-role", type: "short", marks: 2, question: young ? `What does the ${f.term.toLowerCase()} do?` : pick([`State the function of the ${f.term.toLowerCase()}${where}.`, `What is the role of the ${f.term.toLowerCase()}${where}?`]), answer: `${f.term}: ${f.desc}.`, keyPoints: keyPoints(f.desc), score: 5 });
      const o2 = roles.filter((r) => r !== f && r.seg === f.seg);
      if (o2.length) { const r = pick(o2); push(f, { key: f.term, form: "tf", type: "tf", question: `The ${f.term.toLowerCase()} ${verbish ? r.desc : "is " + r.desc}.`, options: ["True", "False"], answer: 1, explanation: `That is the ${r.term.toLowerCase()}. The ${f.term.toLowerCase()} ${verbish ? f.desc : "is " + f.desc}.`, score: 4 }); }
    }
    if (f.kind === "list" && f.items.length >= 2) {
      const C = f.conn || "of", R = f.rel, one = singular(R), topic = lcAll(f.topic.replace(/^(The|An?)\s/, (x) => x.toLowerCase())), Q = f.qual ? " " + f.qual : "";
      // "a type of programming error", not "a type of programming errors"
      const topic1 = /^(types|kinds|forms|classes|categories)$/.test(R) ? topic.replace(/([^s])s$/, "$1") : topic;
      const k = Math.min(f.items.length, young ? 2 : 3), kw = NUMNAME[k] || String(k);
      const others = itemPool(f).filter((x) => !f.items.some((y) => y.toLowerCase() === x.toLowerCase()));
      if (one) {
        const right = pick(f.items);
        const o = options(right, others);
        if (o) push(f, { key: topic, form: "list-which", type: "mcq", question: pick([`Which of the following is ${article(one)}${one} ${C} ${topic1}${Q}?`, `${ucfirst(article(one))}${one} ${C} ${topic1}${Q} is`, `Which of these is one of the ${R} ${C} ${topic}${Q}?`]), ...o, explanation: `The ${R} ${C} ${topic} are: ${f.items.join(", ")}.`, score: 6 });
        if (f.items.length >= 3 && others.length && !young && !Q) {
          // The odd one out should look like the real items (about as long), or it gives itself away.
          const len = f.items.reduce((a, x) => a + wc(x), 0) / f.items.length;
          const outsider = pick(others.slice(0, 10).sort((a, b) => Math.abs(wc(a) - len) - Math.abs(wc(b) - len)).slice(0, 3)), three = shuffle(f.items).slice(0, 3);
          const opts4 = shuffle([...three, matchCase(outsider, three[0])]);
          push(f, { key: topic, form: "list-not", type: "mcq", question: `Which of the following is NOT ${article(one)}${one} ${C} ${topic1}?`, options: opts4, answer: opts4.indexOf(matchCase(outsider, three[0])), explanation: `The ${R} ${C} ${topic} are: ${f.items.join(", ")}.`, score: 6 + (opts.difficulty !== "easy" ? 1 : 0) });
        }
        if (others.length) {
          const fake = Math.random() < 0.5, item = fake ? pick(others) : pick(f.items);
          push(f, { key: topic, form: "tf", type: "tf", question: `${ucfirst(item)} is one of the ${R} ${C} ${topic}${Q}.`, options: ["True", "False"], answer: fake ? 1 : 0, explanation: `The ${R} ${C} ${topic} are: ${f.items.join(", ")}.`, score: 3 });
        }
      }
      const verb = R === "examples" ? "Give" : R === "stages" || R === "steps" ? (young ? "Name" : "Outline") : pick(young ? ["Name", "List"] : ["State", "List", "Mention"]);
      // Correct order of numbered stages / steps.
      if (f.ordered && f.items.length >= 3) {
        const seq = f.items.slice(0, 5), right = seq.join(" → "), wrongs = new Set();
        for (let t = 0; t < 40 && wrongs.size < 3; t++) {
          const s2 = seq.slice();
          for (let sw = 0; sw < 1 + (t % 2); sw++) { const i = Math.floor(Math.random() * (s2.length - 1)); [s2[i], s2[i + 1]] = [s2[i + 1], s2[i]]; }
          if (s2.join(" → ") !== right) wrongs.add(s2.join(" → "));
        }
        if (wrongs.size === 3) { const os = shuffle([right, ...wrongs]); push(f, { key: topic, form: "order", type: "mcq", question: `Which of the following shows the correct order of the ${R} ${C} ${topic}?`, options: os, answer: os.indexOf(right), explanation: `In order: ${seq.join(", ")}.`, score: 7 }); }
        if (!young) push(f, { key: topic, form: "describe-order", type: "short", marks: seq.length, question: `Describe, in order, the ${R} ${C} ${topic}.`, answer: seq.map((x, i) => `${i + 1}. ${x}`).join("\n"), keyPoints: seq, score: 6 });
      }
      // WAEC-style "I, II, III, IV" item. Item-writing research prefers single-answer items,
      // so this is kept to senior classes and used sparingly (see the cap in choose()).
      if (one && senior && f.items.length >= 3 && others.length >= 2) {
        const nTrue = Math.random() < 0.5 ? 2 : 3;
        const stmts = shuffle([...shuffle(f.items).slice(0, nTrue).map((x) => [x, true]), ...shuffle(others.slice(0, 8)).slice(0, 4 - nTrue).map((x) => [x, false])]);
        const RN = ["I", "II", "III", "IV"];
        const label = (ix) => (ix.length === 4 ? "I, II, III and IV" : `${ix.slice(0, -1).map((i) => RN[i]).join(", ")} and ${RN[ix[ix.length - 1]]} only`);
        const right = label(stmts.map((x, i) => (x[1] ? i : -1)).filter((i) => i >= 0));
        const combos = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3], [0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 1, 2, 3]].map(label).filter((x) => x !== right);
        const os = shuffle([right, ...shuffle(combos).slice(0, 3)]);
        push(f, { key: topic, form: "multi", type: "mcq", question: `Which of the following are ${R} ${C} ${topic}${Q}?\n${stmts.map((x, i) => `${RN[i]}. ${ucfirst(x[0])}`).join("\n")}`, options: os, answer: os.indexOf(right), explanation: `The ${R} ${C} ${topic}${Q} are: ${f.items.join(", ")}.`, score: opts.difficulty === "easy" ? 4 : 6.5 });
      }
      push(f, { key: topic, form: "state-list", type: "short", marks: k, question: f.items.length > k ? `${verb} ${kw} ${R} ${C} ${topic}${Q}.` : `${verb} the ${R} ${C} ${topic}${Q}.`, answer: (f.items.length > k ? `Any ${kw} of: ` : "") + f.items.join("; ") + ".", keyPoints: f.items.slice(0, 8), score: 6 });
    }
    if (f.kind === "why") {
      const reasons = facts.filter((x) => x.kind === "why" && x !== f).map((x) => x.reason);
      const o = reasons.length >= 3 ? options(f.reason, reasons) : null;
      if (o && Math.random() < 0.5) push(f, { key: f.q, form: "why-mcq", type: "mcq", question: f.q, ...o, explanation: f.sentence, score: 5 });
      // Assertion–reason: is each statement true, and does the reason explain the assertion?
      if (!young) {
        const others = facts.filter((x) => x.kind === "why" && x !== f);
        const swap = others.length > 0 && Math.random() < 0.35;
        const reason = swap ? pick(others).reason : f.reason;
        push(f, { key: f.q, form: "assert", type: "mcq", question: `Assertion: ${ucfirst(f.clause)}.\nReason: ${ucfirst(reason)}.`, options: [
          "Both are true, and the reason correctly explains the assertion",
          "Both are true, but the reason does not explain the assertion",
          "The assertion is true, but the reason is false",
          "The assertion is false, but the reason is true"], answer: swap ? 1 : 0, explanation: `${ucfirst(f.clause)} because ${f.reason}.`, score: 6 + (opts.difficulty !== "easy" ? 1 : 0) });
      }
      push(f, { key: f.q, form: "why", type: "short", marks: 2, question: young || Math.random() < 0.5 ? f.q : `Explain why ${lc(f.clause)}.`, answer: ucfirst(f.reason) + ".", keyPoints: keyPoints(f.reason, 3), score: 6 + (opts.difficulty === "hard" ? 1 : 0) });
    }
    if (f.kind === "cause") {
      const causes = facts.filter((x) => x.kind === "cause" && x !== f).map((x) => x.cause).concat(terms);
      const o = options(f.cause, causes);
      if (o) push(f, { key: f.cause, form: "cause", type: "mcq", question: `Which of the following ${f.verb} ${f.effect}?`, ...o, explanation: f.sentence, score: 5 });
    }
    if (f.kind === "num") {
      const near = nearNumbers(f.value, f.year);
      if (near.length >= 3) {
        const shown = f.unit ? `${f.value}${/^[%°]/.test(f.unit) ? "" : " "}${f.unit}` : f.value;
        const opt = (v) => (f.unit ? `${v}${/^[%°]/.test(f.unit) ? "" : " "}${f.unit}` : v);
        const re = f.unit ? new RegExp(esc(f.value) + "\\s?" + esc(f.unit)) : new RegExp("\\b" + esc(f.value) + "\\b");
        const gap = f.sentence.replace(re, "_____");
        if (gap !== f.sentence) {
          const os = shuffle([shown, ...near.map(opt)]);
          push(f, { key: f.sentence, form: "num", type: "mcq", question: `Fill in the gap: ${gap}`, options: os, answer: os.indexOf(shown), explanation: f.sentence, score: 4 });
          push(f, { key: f.sentence, form: "tf", type: "tf", question: f.sentence.replace(re, opt(near[0])), options: ["True", "False"], answer: 1, explanation: `Correct: ${f.sentence}`, score: 3 });
        }
      }
    }
    if (f.kind === "sent") {
      // Gap-fill only on a real key term from the notes, never on a random common word.
      const hit = terms.filter((t) => wc(t) <= 4 && new RegExp("\\b" + esc(t) + "\\b", "i").test(f.text)).sort((a, b) => b.length - a.length)[0];
      if (hit) {
        const real = f.text.match(new RegExp("\\b" + esc(hit) + "\\b", "i"))[0];
        const o = options(real, terms.filter((t) => t.toLowerCase() !== hit.toLowerCase()));
        const gap = f.text.replace(new RegExp("\\b" + esc(hit) + "\\b", "i"), "_____");
        // Never blank part of a name ("the Lyttleton _____").
        const inName = /^[A-Z]/.test(real) && /[A-Z][a-z]+\s+_____|_____\s+[A-Z][a-z]+/.test(gap);
        if (o && !inName && gap.indexOf("_____") > 0) push(f, { key: hit, form: "gap", type: "mcq", question: `${pick(["Complete the statement:", "Fill in the gap:", "Supply the missing word:"])} ${gap}`, ...o, explanation: f.text, score: 2 });
      }
    }
  }
  // Structured theory question (WAEC/NECO style): one topic, parts that build up from
  // recall to reasoning, with marks per part. Built from the topic's single questions.
  if (!young && opts.difficulty !== "easy") {
    const order = ["define", "state-list", "state-role", "describe-order", "why", "distinguish"];
    const bySeg = new Map();
    for (const c of out) if (c.type === "short" && order.includes(c.form)) bySeg.set(c.seg, [...(bySeg.get(c.seg) || []), c]);
    for (const [seg, list] of bySeg) {
      const parts = [], used = new Set(), keys = new Set();
      for (const form of order) for (const c of shuffle(list)) {
        if (parts.length >= 4 || c.form !== form || used.has(c.fact)) continue;
        if ((c.keys || [c.key]).some((k) => keys.has(String(k).toLowerCase()))) continue;
        if (parts.some((x) => x.form === form)) continue;      // one part of each kind, so the parts build up
        parts.push(c); used.add(c.fact); (c.keys || [c.key]).forEach((k) => keys.add(String(k).toLowerCase()));
      }
      if (parts.length < 2) continue;
      const mk = (x) => x.marks || 2, abc = "abcd";
      out.push({ fact: parts[0].fact, facts: parts.map((x) => x.fact), keys: [...keys], seg, src: parts[0].src, form: "structured", type: "short",
        question: parts.map((x, i) => `(${abc[i]}) ${x.question} [${mk(x)} mark${mk(x) > 1 ? "s" : ""}]`).join("\n"),
        answer: parts.map((x, i) => `(${abc[i]}) ${x.answer}`).join("\n"), keyPoints: parts.flatMap((x) => x.keyPoints || []).slice(0, 10),
        marks: parts.reduce((a, x) => a + mk(x), 0), score: 7 + parts.length + (opts.difficulty === "hard" ? 2 : 0) });
    }
  }
  return out;
}
// Two definitions are related when they open the same way ("the movement of…"),
// share key words, or name the same kind of thing (eukaryotic / prokaryotic cells).
function related(a, b) {
  if (Math.abs(a.seg - b.seg) > 1) return false;
  const da = words(a.def), db = words(b.def);
  if (da.slice(0, 3).join(" ") === db.slice(0, 3).join(" ")) return true;
  const ca = new Set(da.filter((w) => w.length > 4 && !STOP.has(w)));
  if (db.filter((w) => ca.has(w)).length >= 3) return true;
  const ta = words(a.term), tb = words(b.term);
  return ta.length > 1 && tb.length > 1 && ta[ta.length - 1] === tb[tb.length - 1];
}
// Marking points for a written answer: the main content words / phrases.
// "the movement of particles from a region of higher concentration…" ->
// ["higher concentration", "lower concentration", "movement", "particles"]
function keyPoints(text, max = 4) {
  const parts = String(text).split(/\s*(?:,|;|\b(?:and|or|which|that|where|whose|by|using|with|from|to|of|in|into|on|for|through|against|during|when|while|is|are|can|be|a|an|the|its|their|what|who|how|why|it|they|them|this|these|such as|e\.g)\b)\s*/i)
    .map(trimEnd).filter((p) => wc(p) >= 1 && wc(p) <= 5 && words(p).some((w) => w.length >= 4 && !STOP.has(w)));
  const seen = new Set();
  return parts.filter((p) => !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase())).sort((a, b) => wc(b) - wc(a)).slice(0, max);
}

/* ---------------- 4. choose a varied set ---------------- */
function choose(cands, n, types, opts) {
  const want = {};
  types.forEach((t, i) => (want[t] = Math.floor(n / types.length) + (i < n % types.length ? 1 : 0)));
  const usedFact = new Set(), usedKey = new Map(), usedForm = {}, segCount = {}, out = [];
  const formCap = Math.max(2, Math.ceil(n / 5));
  const diffBonus = { easy: { define: 2, describes: 1, gap: 1, "list-which": 1 }, mixed: {}, hard: { distinguish: 2, "list-not": 2, why: 2, name: 1, "why-mcq": 1 } }[opts.difficulty] || {};
  const rank = (c, strict) => {
    if ((c.facts || [c.fact]).some((x) => usedFact.has(x)) && strict) return -1;
    const keys = c.keys || [c.key];
    if (keys.some((k) => (usedKey.get(String(k).toLowerCase()) || 0) >= (strict ? 1 : 2))) return -1;
    const cap = c.form === "tf" ? Infinity : c.form === "tf-copy" ? Math.max(1, Math.ceil(n / 10)) : c.form === "distinguish" || c.form === "assert" ? Math.max(1, Math.ceil(n / 8)) : c.form === "multi" ? Math.max(1, Math.floor(n / 12)) : c.form === "structured" ? Math.max(1, Math.ceil(n / 6)) : formCap;
    if ((usedForm[c.form] || 0) >= (strict ? cap : cap * 2)) return -1;
    return c.score + (diffBonus[c.form] || 0) - (segCount[c.seg] || 0) * 1.5 - (usedForm[c.form] || 0) * 0.8 + Math.random() * 1.5;
  };
  const take = (c) => {
    out.push(c); (c.facts || [c.fact]).forEach((x) => usedFact.add(x));
    for (const k of c.keys || [c.key]) usedKey.set(String(k).toLowerCase(), (usedKey.get(String(k).toLowerCase()) || 0) + 1);
    usedForm[c.form] = (usedForm[c.form] || 0) + 1; segCount[c.seg] = (segCount[c.seg] || 0) + 1;
    want[c.type]--;
  };
  // Pass 1: the asked-for mix of types, every question on a different fact and term.
  // Pass 2: still no repeats, but any type (a varied quiz matters more than the exact mix).
  // Pass 3: only if the notes are short, allow a second question on a fact.
  const fill = (strict, anyType) => {
    let progress = true;
    while (out.length < n && progress) {
      progress = false;
      for (const t of shuffle(types)) {
        if (out.length >= n || (!anyType && want[t] <= 0)) continue;
        const best = cands.filter((c) => (anyType || c.type === t) && !out.includes(c) && !nearDuplicate(c, out)).map((c) => [c, rank(c, strict)]).filter(([, r]) => r >= 0).sort((a, b) => b[1] - a[1])[0];
        if (best) { take(best[0]); progress = true; }
      }
    }
  };
  fill(true, false); fill(true, true); fill(false, true);
  // Keep the order of the notes, so the quiz follows the lesson.
  return out.sort((a, b) => a.fact - b.fact);
}
function nearDuplicate(c, list) {
  const a = new Set(words(c.question).filter((w) => w.length > 3 && !STOP.has(w)));
  return list.some((x) => {
    if (x.question === c.question) return true;
    const b = new Set(words(x.question).filter((w) => w.length > 3 && !STOP.has(w)));
    const inter = [...a].filter((w) => b.has(w)).length;
    return inter / Math.max(1, Math.min(a.size, b.size)) > 0.75 && a.size > 2;
  });
}

// Books and slides repeat a header or footer on every page ("How to Talk to Anyone 19",
// "Copyright 2003 by …"). Lines that recur on many pages, page numbers and copyright /
// web-address lines are not lesson content.
const BOILER = /copyright|©|all rights reserved|\bisbn\b|printed in|www\.|https?:\/\/|^\s*(?:page\s*)?\d+\s*(?:of\s*\d+)?\s*$|^\s*[☆★*]+\s*\d/i;
function stripPageFurniture(text) {
  const lines = text.split(/\r?\n/);
  const pages = (text.match(/^\[Page \d+\]$/gm) || []).length;
  const norm = (l) => l.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  const count = new Map();
  for (const l of lines) { const k = norm(l); if (k && k.length < 90 && !/^\[page #\]$/.test(k)) count.set(k, (count.get(k) || 0) + 1); }
  const limit = Math.max(3, Math.ceil(pages * 0.3));
  return lines.filter((l) => {
    if (/^\[Page \d+\]$/.test(l.trim())) return true;
    return !BOILER.test(l) && !(pages >= 3 && (count.get(norm(l)) || 0) >= limit);
  }).join("\n");
}

/* ---------------- entry point ---------------- */
// opts: { count, types: ["mcq","tf","short"], difficulty: "easy"|"mixed"|"hard", level }
export function writeQuestions(text, opts) {
  const o = { count: 10, types: ["mcq", "tf", "short"], difficulty: "mixed", level: "jss", ...opts };
  proper = new Set();
  // Learn names from running sentences only: headings are written in Title Case.
  const prose = String(text).split(/\r?\n/).filter((l) => wc(l) >= 8 || /[.!?]$/.test(l.trim())).join("\n");
  for (const m of prose.matchAll(/(?<=[a-z0-9,;)][ \t]+)([A-Z][a-z]+)/g)) proper.add(m[1]);
  for (const m of prose.matchAll(/\b([A-Z][a-z]+)[ \t]+([A-Z][a-z]+)\b/g)) if (!/^(The|A|An|In|On|At|For|And|But|Of|It|This|These)$/.test(m[1])) { proper.add(m[1]); proper.add(m[2]); }
  // A word the notes also write in lower case is not a name ("Federalism" heading, "federalism" in text).
  for (const w of String(text).match(/\b[a-z][a-z-]+\b/g) || []) proper.delete(ucfirst(w));
  const segs = parse(stripPageFurniture(String(text)));
  const facts = extract(segs);
  const cands = candidates(facts, o).filter((c) => o.types.includes(c.type));
  const chosen = choose(cands, o.count, o.types.filter((t) => cands.some((c) => c.type === t)), o);
  return chosen.map((c) => {
    const q = { id: uid(), type: c.type, question: tidy(c.question), explanation: c.explanation ? tidy(c.explanation) : "" };
    if (c.src) q.source = c.src;
    if (c.marks) q.marks = c.marks;
    if (c.type === "short") return { ...q, answer: tidy(c.answer), keyPoints: c.keyPoints || [] };
    return { ...q, options: c.options.map((x) => tidy(x)), answer: c.answer };
  });
}
// Keeps line breaks: structured parts (a), (b) and Assertion / Reason sit on their own lines.
const tidy = (s) => String(s).split("\n").map((l) => l.replace(/[ \t]+([,.;:?])/g, "$1").replace(/[ \t]+/g, " ").replace(/\.\.+/g, ".").trim()).filter(Boolean).join("\n");
