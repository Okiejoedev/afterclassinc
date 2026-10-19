// Turns lesson notes into questions: the AI function when enabled, otherwise a
// built-in writer that runs entirely in the browser (free, no account needed).
import { sb } from "./sb.js";
import { shuffle, uid } from "./ui.js";

const MAX_CHARS = 180000;

// Audience levels shared by the AI writer and the exam/quiz settings.
export const LEVELS = [
  ["p13", "Primary 1–3 (short, simple words)"],
  ["p46", "Primary 4–6"],
  ["jss", "Junior secondary (JSS)"],
  ["sss", "Senior secondary (SSS / WAEC level)"],
  ["uni", "University / professional"],
  ["adult", "Workshop / webinar audience"],
];
export const DIFFICULTY = [["easy", "Easy recall"], ["mixed", "Mixed"], ["hard", "Challenging"]];
export const LANGUAGES = ["English", "French", "Hausa", "Igbo", "Yoruba", "Nigerian Pidgin"];

export async function aiGenerate({ text, pdfs = [], count, types, level, difficulty, language }) {
  if (text.length > MAX_CHARS) throw new Error(`Your notes are ${text.length.toLocaleString()} characters. Remove some files or trim the text (limit ${MAX_CHARS.toLocaleString()}).`);
  const { data, error } = await sb.functions.invoke("generate-quiz", {
    body: { text, pdfs: pdfs.map((p) => p.data), count, types, level, difficulty, language },
  });
  if (error) {
    let msg = "The AI writer is not reachable. Check README step 7, or choose the built-in writer.";
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch {}
    throw new Error(msg);
  }
  const qs = normalize(data?.questions || []);
  return { title: String(data?.title || "").slice(0, 90), questions: qs };
}

// Accepts the AI's shape, imported questions and the app's own shape.
export function normalize(list) {
  const out = [];
  for (const q of list) {
    if (!q || typeof q.question !== "string" || !q.question.trim()) continue;
    const base = { id: q.id || uid(), question: q.question.trim(), explanation: String(q.explanation || "") };
    if (q.source) base.source = String(q.source).slice(0, 60);
    if (q.image) base.image = String(q.image);
    if (Number(q.marks) > 0) base.marks = Number(q.marks);
    if (q.compulsory) base.compulsory = true;
    if (q.needsAnswer) base.needsAnswer = true;
    const ans = q.correct_option ?? q.answer;
    const opts = Array.isArray(q.options) ? q.options.map((o) => String(o ?? "").trim()) : [];
    if (q.type === "mcq" && opts.filter(Boolean).length >= 2) {
      const a = Number(ans);
      out.push({ ...base, type: "mcq", options: opts.slice(0, 6), answer: a >= 0 && a < opts.length ? a : 0, ...(a >= 0 && a < opts.length ? {} : { needsAnswer: true }) });
    } else if (q.type === "tf") {
      const truth = ans === true || ans === 0 || String(ans).toLowerCase() === "true";
      out.push({ ...base, type: "tf", options: ["True", "False"], answer: truth ? 0 : 1 });
    } else if (q.type === "short") {
      const model = String(q.model_answer ?? (typeof q.answer === "string" ? q.answer : "") ?? "");
      const kp = q.key_points ?? q.keyPoints;
      out.push({ ...base, type: "short", answer: model, keyPoints: Array.isArray(kp) ? kp.map(String).filter(Boolean) : [] });
    } else if (q.type === "poll" && opts.filter(Boolean).length >= 2) {
      out.push({ ...base, type: "poll", options: opts.slice(0, 6) });
    } else if (q.type === "word") {
      out.push({ ...base, type: "word" });
    }
  }
  return out;
}

// ---------- built-in writer ----------
// Simple fill-in-the-blank, true/false and definition questions. Good enough for
// quick recall checks; the AI writer is much better for exams.
const STOP = new Set(("about above after again against because been before being below between both could does doing down during each from further have having here itself just more most other ought ourselves same should some such than that their theirs them themselves then there these they this those through under until very what when where which while whom would your yours also into only over will with were shall many much like upon used using example called known often however therefore thus within without another different important include includes including following figure chapter lecture section page slide").split(" "));
const VERBS = new Set("absorb allow apply become carry cause change contain control convert create depend describe develop enter explain float form give grow happen help increase keep leave lose make move occur produce provide reduce release remain require speed store take travel".split(" "));

// Splits notes into sentences and remembers which page / file each came from.
function sentencesWithSource(text) {
  const out = [];
  let page = "", file = "";
  for (const block of text.split(/\n(?=\[Page \d+\]|=== )/)) {
    const pm = block.match(/^\[Page (\d+)\]/), fm = block.match(/^=== (.+?) ===/);
    if (fm) { file = fm[1].replace(/\.[^.]+$/, ""); page = ""; }
    if (pm) page = pm[1];
    const body = block.replace(/^\[Page \d+\]\n?|^=== .+? ===\n?/gm, "").replace(/\s+/g, " ");
    for (const s of body.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)) {
      const t = s.trim();
      if (t.length > 45 && t.length < 280 && t.split(" ").length >= 7 && /[a-z]/.test(t)) out.push({ s: t, src: [file, page && "p. " + page].filter(Boolean).join(", ") });
    }
  }
  const seen = new Set();
  return out.filter((x) => !seen.has(x.s) && seen.add(x.s));
}

export function basicGenerate(text, n, types) {
  const items = sentencesWithSource(text);
  const clean = items.map((x) => x.s).join(" ");
  const freq = {};
  const verbish = (k) => VERBS.has(k) || /(ed|ing|ly|ise|ize|ate)$/.test(k) || (/s$/.test(k) && VERBS.has(k.slice(0, -1)));
  for (const w of clean.match(/\b[A-Za-z][A-Za-z-]{4,}\b/g) || []) { const k = w.toLowerCase(); if (!STOP.has(k) && !verbish(k)) freq[k] = (freq[k] || 0) + 1; }
  const key = new Set();
  for (const { s } of items) {
    const m = s.match(/^(?:The |An? )?(?:[A-Za-z-]+ )?([A-Za-z][A-Za-z-]{3,})\s+(?:is|are|was|were|contains?|has|have|controls?|moves?|makes?|releases?|absorbs?|consists?|refers?)\b/);
    if (m && !STOP.has(m[1].toLowerCase())) key.add(m[1].toLowerCase());
  }
  const score = (k) => (freq[k] || 0) + (key.has(k) ? 5 : 0);
  const terms = [...new Set([...key, ...Object.keys(freq)])].sort((a, b) => score(b) - score(a)).slice(0, 80);
  const termSet = new Set(terms);
  const findTerm = (s) => { let best = null; for (const w of s.match(/\b[A-Za-z][A-Za-z-]{3,}\b/g) || []) { const k = w.toLowerCase(); if (termSet.has(k) && (!best || score(k) > score(best.toLowerCase()))) best = w; } return best; };
  const others = (t, k) => {
    const tl = t.toLowerCase(), plural = /s$/.test(tl);
    const pool = terms.filter((x) => x !== tl && !tl.includes(x) && !x.includes(tl));
    const rank = (x) => (key.has(x) ? 2 : 0) + (/s$/.test(x) === plural ? 1 : 0) + Math.random();
    return pool.sort((a, b) => rank(b) - rank(a)).slice(0, k);
  };
  const cap = (w, like) => (like[0] === like[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w);
  const wordRe = (t) => new RegExp("\\b" + t.replace(/[-]/g, "\\-") + "\\b");

  const out = [], used = new Set(), pool = shuffle(items);
  let ti = 0, guard = 0;
  while (out.length < n && guard++ < pool.length * 3) {
    const { s, src } = pool[guard % pool.length];
    if (used.has(s)) continue;
    const type = types[ti % types.length];
    const t = findTerm(s);
    const extra = src ? { source: src } : {};
    if (type === "mcq" && t) {
      const ds = others(t, 3); if (ds.length < 3) continue;
      const opts = shuffle([t, ...ds.map((d) => cap(d, t))]);
      out.push({ id: uid(), type: "mcq", question: "Fill in the blank: " + s.replace(wordRe(t), "_____"), options: opts, answer: opts.indexOf(t), explanation: s, ...extra });
    } else if (type === "tf" && t) {
      const d = others(t, 1)[0], makeFalse = !!d && Math.random() < 0.5;
      out.push({ id: uid(), type: "tf", question: makeFalse ? s.replace(wordRe(t), cap(d, t)) : s, options: ["True", "False"], answer: makeFalse ? 1 : 0, explanation: "From the notes: " + s, ...extra });
    } else if (type === "short") {
      const m = s.match(/^(?:The |An? )?([A-Za-z][\w\s-]{2,50}?)\s+(is|are|refers to|means|describes)\s+(.+)$/);
      const question = m ? `What is meant by "${m[1].trim()}"?` : t ? `In your own words, explain the role of ${t.toLowerCase()} as described in the lesson.` : null;
      if (!question) continue;
      out.push({ id: uid(), type: "short", question, answer: s, keyPoints: [], explanation: "", ...extra });
    } else continue;
    used.add(s); ti++;
  }
  return out;
}
