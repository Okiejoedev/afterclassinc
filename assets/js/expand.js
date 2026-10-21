// "Expand from what I taught": the teacher's own lesson is the yardstick. It is split into
// the points they made (in their order, chatter dropped); each point is then filled out with
// the closest-matching facts from checked notes and from the teacher's own earlier lessons.
// Nothing is added that doesn't relate to a point they actually taught.

const STOP = new Set(("the a an and or but of to in on at for with from by as is are was were be been being this that these those it its they them their there here we you your our us i me my he she his her him who whom which what when where why how not no yes so very also just than then too can could will would should must may might do does did have has had get got make made one two three four five first second third number thing things lot lots people person something very really okay ok right now today let us know like want need see say said tell tells told come go going am thank thanks please allow because about into over under more most some any all each every other such only own same both few many much basic amount especially area actually enjoy kind part way ways use used good great important main also well child children promise promised").split(" "));
// British spelling for matching: "neighbors" = "neighbours", "socialization" = "socialisation".
const UK = { neighbor: "neighbour", color: "colour", honor: "honour", behavior: "behaviour", favor: "favour", labor: "labour", center: "centre", program: "programme" };
// Spoken filler that carries no lesson content.
const CHATTER = /^(?:thank(?:s| you)\b|good (?:morning|afternoon)|okay\b|ok\b|alright\b|right\b|allow me\b|class\b|everyone\b|so\b|now\b)[\s,!.]*$/i;
const MARKERS = /\b(?:number (?:one|two|three|four|five|six)|firstly|secondly|thirdly|lastly|finally|next|another (?:thing|point)|moving on|so now)\b/gi;

// "neighbours" -> "neighbour", "studies" -> "study", "taught" stays.
const stem = (w) => w.replace(/ies$/, "y").replace(/(?:ss)$/, "ss").replace(/(?<=[^s])s$/, "").replace(/(?<=\w{3})ing$/, "");
const words = (s) => (String(s).toLowerCase().replace(/iz(e|ing|ation)/g, "is$1").match(/[a-z][a-z'-]{2,}/g) || [])
  .map((w) => w.replace(/'s?$/, "")).filter((w) => !STOP.has(w)).map(stem).map((w) => UK[w] || w);

// Notes split into units: a sentence, or a list introduction together with its bullet lines.
function units(text, from, keys = []) {
  const out = [];
  let heading = "", cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { cur = null; continue; }
    if (/^[A-Z0-9][A-Z0-9 ,:'’()&/-]{3,}$/.test(line) && !/[.?!]$/.test(line)) { heading = line.replace(/:$/, ""); cur = null; continue; }
    if (/^[-•*]\s+/.test(line) && cur) { cur.text += "\n" + line; continue; }
    for (const s of line.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
      const u = { text: s, heading, from };
      out.push(u);
      cur = /:$/.test(s) ? u : null;    // "The values taught by the pledge are:" collects the bullets that follow
    }
  }
  // "head": words that say what the sub-topic is (its heading, plus the topic note's keywords).
  return out.map((u) => ({ ...u, w: new Set(words(u.text + " " + u.heading)), head: new Set(words(u.heading + " " + keys.join(" "))) }));
}

// The lesson split into the points the teacher made.
function lessonPoints(text) {
  const sentences = String(text).replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const pts = [];
  for (const s of sentences) {
    // Long unpunctuated speech: split where a new thought starts ("number one…", "secondly…",
    // "…I pledge", "…so", "…now"); only very long stretches are cut by length (at a comma if possible).
    const parts = s.split(MARKERS).flatMap((x) => (x.split(" ").length > 25 ? x.split(/\s+(?=(?:I|so|now|right)\s)/) : [x])).map((x) => x.trim()).filter(Boolean);
    const merged = [];
    for (const p of parts) (merged.length && p.split(" ").length < 5 ? (merged[merged.length - 1] += " " + p) : merged.push(p));
    for (const p of merged) {
      let rest = p;
      while (rest.split(" ").length > 45) {
        const cut = rest.slice(0, rest.split(" ").slice(0, 45).join(" ").length);
        const at = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", ") > 60 ? cut.lastIndexOf(", ") : -1);
        const i = at > 60 ? at + 1 : cut.length;
        pts.push(rest.slice(0, i).trim()); rest = rest.slice(i).trim();
      }
      if (rest) pts.push(rest);
    }
  }
  return pts.filter((c) => !CHATTER.test(c) && words(c).length >= 2);
}

const tidy = (s) => { const t = s.trim().replace(/\s+/g, " "); return t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.?!:]$/.test(t) ? "" : ".") : ""; };
const sentenceCase = (s) => { const t = s.toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const titleCase = (s) => s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// sources: [{ title, from, text }]  ->  { points: [{ label, said, added: [{ text, from }] }], notes, addedCount }
export function expandFromLesson(lesson, sources) {
  const pool = sources.flatMap((s) => units(s.text, s.from, s.keys || []));
  const pts = lessonPoints(lesson);
  // How rare a word is across everything: rare shared words ("pledge") count for more than common ones ("nigeria").
  const df = {};
  for (const u of pool) for (const w of u.w) df[w] = (df[w] || 0) + 1;
  const idf = (w) => Math.log((pool.length + 1) / ((df[w] || 0) + 0.5));
  const used = new Set();
  const points = [];
  for (const said of pts) {
    const pw = new Set(words(said));
    const flat = (x) => x.toLowerCase().replace(/[^a-z]+/g, " ").trim();
    const saidFlat = flat(said);
    const scored = pool.map((u, i) => {
      const shared = [...pw].filter((w) => u.w.has(w));
      const head = u.head;
      const score = shared.reduce((a, w) => a + idf(w) * (head.has(w) ? 1.5 : 1), 0);
      // One shared word is enough only if it names the sub-topic ("pledge" under THE NATIONAL PLEDGE).
      // Words found all over the notes ("Nigeria", "country") don't show what a point is about.
      const telling = shared.filter((w) => idf(w) >= 2);
      const onTopic = telling.some((w) => head.has(w));
      const strong = onTopic ? score >= 3.5 : telling.length >= 3 && score >= 6;
      return { i, u, shared, score, strong };
    }).filter((r) => !used.has(r.i) && r.strong && !saidFlat.includes(flat(r.u.text)))   // nothing the teacher already said
      .sort((a, b) => b.score - a.score);
    // Take the best unit, then others from the same heading (the same sub-topic), up to 5.
    const best = scored[0];
    const group = (top, n) => scored.filter((r) => r === top || (r.u.heading === top.u.heading && r.u.from === top.u.from && r.score >= top.score * 0.45)).slice(0, n);
    const pick = best ? group(best, 5) : [];
    // A point can touch a second sub-topic ("…love your friends and neighbours… social studies").
    const second = best && scored.find((r) => r.u.heading !== best.u.heading && [...r.u.head].some((w) => pw.has(w)));
    if (second) pick.push(...group(second, 3).filter((r) => !pick.includes(r)));
    pick.sort((a, b) => a.i - b.i).forEach((r) => used.add(r.i));
    // A point with matches is named after its sub-topic; one without keeps the teacher's words and no heading.
    const label = pick.length && best.u.heading ? sentenceCase(best.u.heading) : "";
    const prev = points[points.length - 1];
    const added = pick.map((r) => ({ text: r.u.text, from: r.u.from }));
    // Same sub-topic, or a short aside with nothing to add: keep it with the point before.
    if (prev && ((label && prev.label === label) || (!added.length && (!prev.added.length || said.split(" ").length < 12)))) { prev.said += " " + said; prev.added.push(...added); }
    else points.push({ label, said, added });
  }
  const notes = points.map((p) => [p.label ? p.label.toUpperCase() : "", tidy(p.said), ...p.added.map((a) => a.text)].filter(Boolean).join("\n")).join("\n\n");
  return { points, notes, addedCount: points.reduce((a, p) => a + p.added.length, 0) };
}
