// Free fact check for the Nigerian facts teachers state most often (dates, numbers, the
// National Pledge…). It only knows these facts; anything else needs the AI writer.
// Each finding: { said, correct, fix?: { start, end, text } } where fix replaces text[start..end].

export const PLEDGE = "I pledge to Nigeria my country, to be faithful, loyal and honest, to serve Nigeria with all my strength, to defend her unity and uphold her honour and glory, so help me God.";

// Rules: a keyword, then the right year or number somewhere near it in the same stretch of text.
const YEAR_RULES = [
  { key: /\bindependen(?:ce|t)\b/i, year: 1960, fact: "Nigeria became independent on 1 October 1960." },
  { key: /\brepublic\b/i, year: 1963, fact: "Nigeria became a republic on 1 October 1963." },
  { key: /\bamalgamat/i, year: 1914, fact: "The Northern and Southern Protectorates were amalgamated on 1 January 1914, by Lord Lugard." },
  { key: /\bnaira\b/i, year: 1973, fact: "The naira replaced the Nigerian pound on 1 January 1973." },
  { key: /\babuja\b.{0,60}\bcapital\b|\bcapital\b.{0,60}\babuja\b/i, year: 1991, fact: "Abuja became Nigeria's capital on 12 December 1991." },
  { key: /\bpledge\b.{0,80}\b(?:written|wrote|composed|introduced)\b/i, year: 1976, fact: "The National Pledge was written by Felicia Adebola Adeyoyin in 1976." },
];
const NUM_WORDS = { six: 6, twelve: 12, nineteen: 19, "twenty-one": 21, "twenty one": 21, thirty: 30, "thirty-six": 36, "thirty six": 36, "thirty-seven": 37, "thirty seven": 37 };
const NUM = `(\\d{1,3}|${Object.keys(NUM_WORDS).map((k) => k.replace(" ", "[ -]")).join("|")})`;
const toNum = (s) => NUM_WORDS[String(s).toLowerCase().replace("-", " ")] ?? NUM_WORDS[String(s).toLowerCase()] ?? Number(s);

// The sentence around a keyword; spoken notes often have no full stops, so long
// "sentences" fall back to a few words either side.
function windowAt(text, i, len, span = 90) {
  const before = text.slice(0, i), after = text.slice(i + len);
  const s = Math.max(before.lastIndexOf(". "), before.lastIndexOf("? "), before.lastIndexOf("! "), before.lastIndexOf("\n")) + 1;
  const e = after.search(/[.!?](?:\s|$)|\n/);
  const a = Math.max(s, i - span), b = e < 0 ? Math.min(text.length, i + len + span) : Math.min(i + len + e + 1, i + len + span);
  return { a, b };
}
const quote = (text, a, b) => (a > 0 ? "…" : "") + text.slice(a, b).replace(/\s+/g, " ").trim() + (b < text.length ? "…" : "");

export function checkFacts(text) {
  const out = [], seen = new Set();
  const add = (f) => { if (!seen.has(f.correct)) { seen.add(f.correct); out.push(f); } };

  for (const r of YEAR_RULES) {
    for (const m of text.matchAll(new RegExp(r.key.source, "gi"))) {
      const w = windowAt(text, m.index, m[0].length), part = text.slice(w.a, w.b);
      const years = [...part.matchAll(/\b(1[89]\d\d|20\d\d)\b/g)];
      if (!years.length) continue;
      // Only the year closest to the keyword is about it ("independence in 1963 and a republic in 1960").
      const pos = m.index - w.a, y = years.sort((p, q) => Math.abs(p.index - pos) - Math.abs(q.index - pos))[0];
      if (+y[1] === r.year || Math.abs(y.index - pos) > 70) continue;
      add({ said: quote(text, w.a + Math.max(0, y.index - 60), w.a + y.index + 30), correct: r.fact, fix: { start: w.a + y.index, end: w.a + y.index + 4, text: String(r.year) } });
    }
  }

  // Number of states (unless the notes are talking about history: 12 states in 1967, 19 in 1976…).
  for (const m of text.matchAll(new RegExp(`\\b${NUM}\\s+states\\b`, "gi"))) {
    const n = toNum(m[1]), w = windowAt(text, m.index, m[0].length), near = text.slice(w.a, w.b);
    if (n === 36 || !/nigeria/i.test(text) || /\b(19[5-9]\d)\b|\b(?:was|were|had|created|then|old)\b/i.test(near)) continue;
    if (n < 6 || n > 60) continue;
    add({ said: quote(text, m.index - 40, m.index + m[0].length + 30), correct: "Nigeria has 36 states and the Federal Capital Territory (since 1996).", fix: { start: m.index, end: m.index + m[1].length, text: "36" } });
  }
  for (const m of text.matchAll(new RegExp(`\\b${NUM}\\s+local\\s+government`, "gi")))
    if (toNum(m[1]) !== 774) add({ said: quote(text, m.index - 30, m.index + 40), correct: "Nigeria has 774 local government areas.", fix: { start: m.index, end: m.index + m[1].length, text: "774" } });
  for (const m of text.matchAll(new RegExp(`\\b${NUM}\\s+geo-?\\s?political\\s+zones`, "gi")))
    if (toNum(m[1]) !== 6) add({ said: quote(text, m.index - 30, m.index + 40), correct: "Nigeria has six geopolitical zones.", fix: { start: m.index, end: m.index + m[1].length, text: "six" } });

  // Capital
  for (const m of text.matchAll(/\bcapital\b[^.]{0,40}\b(?:is|of nigeria is)\s+lagos\b|\blagos\s+is\s+(?:the\s+)?capital\b/gi))
    add({ said: quote(text, m.index - 20, m.index + m[0].length + 10), correct: "Abuja is the capital of Nigeria (since 12 December 1991). Lagos was the capital before then." });

  // Flag
  for (const m of text.matchAll(/\bflag\b[^.]{0,80}\b(red|blue|yellow|black)\b/gi))
    if (!/coat of arms/i.test(m[0])) add({ said: quote(text, m.index - 10, m.index + m[0].length + 10), correct: "The Nigerian flag is green, white and green (vertical bands)." });
  for (const m of text.matchAll(/\bflag\b[^.]{0,60}\bdesigned by\s+([A-Z][\w.]*(?:\s+[A-Z][\w.]*){0,3})/g))
    if (!/akinkunmi/i.test(m[1])) add({ said: quote(text, m.index, m.index + m[0].length), correct: "The Nigerian flag was designed by Michael Taiwo Akinkunmi." });

  // Motto and anthem
  for (const m of text.matchAll(/\bmotto\b[^.]{0,60}\bunity and faith\b(?![, ]*peace)/gi))
    add({ said: quote(text, m.index, m.index + m[0].length + 20), correct: "Nigeria's motto is “Unity and Faith, Peace and Progress”." });
  for (const m of text.matchAll(/\barise,?\s+o\s+compatriots\b/gi))
    if (!/\b(?:former|old|was|1978|replaced)\b/i.test(text.slice(Math.max(0, m.index - 80), m.index + 120)))
      add({ said: quote(text, m.index - 40, m.index + 40), correct: "Since May 2024 Nigeria's national anthem is “Nigeria, We Hail Thee” again. “Arise, O Compatriots” was the anthem from 1978 to 2024." });

  // The National Pledge, often misremembered or mis-heard when recorded.
  const p = findPledge(text);
  if (p) add({ said: quote(text, p.start, p.end), correct: `The National Pledge: “${PLEDGE}”`, fix: { start: p.start, end: p.end, text: PLEDGE } });

  return out.sort((a, b) => (a.fix?.start ?? 1e9) - (b.fix?.start ?? 1e9));
}

// Finds an attempt at the pledge ("I pledge to Nigeria my country…") and says whether it's wrong.
const PLEDGE_WORDS = new Set("i pledge to in nigeria my country be faithful faithfully loyal loyally and honest honestly serve with all strength might defend defender her his unity uphold honour honor glory so help me god you need".split(" "));
function findPledge(text) {
  const m = text.match(/\bI\s+pledge\b|\bpledge\s+(?:to|in)\s+nigeria\b/i);
  if (!m) return null;
  const start = m.index;
  // Extend while the words still sound like the pledge (allow small gaps for mis-heard words).
  const re = /[A-Za-z']+/g; re.lastIndex = start;
  let end = start, miss = 0, w;
  while ((w = re.exec(text))) {
    if (PLEDGE_WORDS.has(w[0].toLowerCase())) { end = w.index + w[0].length; miss = 0; }
    else if (++miss > 2) break;
  }
  const said = text.slice(start, end).toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  const right = PLEDGE.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  if (said.split(" ").length < 6 || said === right) return null;
  // Is it complete and correct? Check the key phrases in order.
  const phrases = ["to nigeria my country", "faithful loyal and honest", "serve nigeria with all my strength", "defend her unity", "uphold her honour and glory", "so help me god"];
  if (phrases.every((ph) => said.includes(ph))) return null;
  return { start, end: /[.!]/.test(text[end] || "") ? end + 1 : end };
}

// Apply a list of fixes (from the end backwards so positions stay valid).
export function applyFixes(text, fixes) {
  return fixes.slice().sort((a, b) => b.start - a.start).reduce((t, f) => t.slice(0, f.start) + f.text + t.slice(f.end), text);
}
