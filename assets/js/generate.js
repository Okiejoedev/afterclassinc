// Turns lesson notes into questions: the AI function when enabled, otherwise a
// built-in writer that runs entirely in the browser (free, no account needed).
import { sb } from "./sb.js";
import { uid } from "./ui.js";
import { writeQuestions } from "./writer.js";

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
// The free writer that runs in the browser lives in writer.js.
export function basicGenerate(text, n, types, opts = {}) {
  return writeQuestions(text, { count: n, types, ...opts });
}
