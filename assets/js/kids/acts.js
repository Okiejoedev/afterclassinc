// Learning Corner activities, following the Nigerian primary curriculum (2025 revision):
// English Studies, Mathematics, Basic Science, Social & Citizenship Studies / Nigerian History,
// Cultural & Creative Arts, Physical & Health Education, a Nigerian language, Basic Digital Literacy.
//
// Every activity makes fresh questions at three levels (gen(level), level 1–3); the game moves a
// child up after a run of right answers and down after misses ("teaching at the right level").
// A question: { say, text, show, options: [{ html, value, say? }], answer, explain?, cols? }
//   or a spelling question: { kind: "spell", say, text, show, word }.
import { clock, shape, fractionPie, fractionBar, tenFrame, tensOnes, naira, many, gone, swatch, trafficLight, flagNG } from "./art.js";

/* ---------- helpers ---------- */
export const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (a, n) => shuffle(a).slice(0, n);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
// n options: the answer plus distinct wrong ones from make().
function numOpts(ans, make, n = 4, min = 0) {
  const set = new Set([ans]); let guard = 0;
  while (set.size < n && guard++ < 200) { const v = make(); if (v >= min && Number.isFinite(v)) set.add(v); }
  return shuffle([...set]).map((v) => ({ html: String(v), value: v }));
}
const near = (ans, spread = 3, min = 0) => () => Math.max(min, ans + ri(-spread, spread));
const wordOpts = (ans, wrong, n = 3) => shuffle([ans, ...sample(wrong.filter((w) => w !== ans), n - 1)]).map((w) => ({ html: w, value: w }));
const picOpts = (items, ans) => shuffle(items).map(([e, name]) => ({ html: `<span class="emo">${e}</span>`, value: name, say: name }));
const NAMES = ["Ada", "Musa", "Tunde", "Ngozi", "Aisha", "Emeka", "Bola", "Zainab", "Chidi", "Funke", "Ibrahim", "Kemi", "Uche", "Hauwa", "Segun", "Amaka"];
const THINGS = [["🥭", "mangoes"], ["🍊", "oranges"], ["🍌", "bananas"], ["⚽", "balls"], ["🐟", "fish"], ["🥚", "eggs"], ["🌽", "maize cobs"], ["✏️", "pencils"], ["📚", "books"], ["🍬", "sweets"], ["🐓", "chickens"], ["🐐", "goats"]];

const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const TENS_W = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
export const numWord = (n) => n <= 20 ? NUM_WORDS[n] : n < 100 ? TENS_W[Math.floor(n / 10)] + (n % 10 ? "-" + NUM_WORDS[n % 10] : "") : n === 100 ? "one hundred" : String(n);

/* =====================================================================
   MATHEMATICS
   ===================================================================== */
const maths = [
  { id: "count", title: "Count them", icon: "🔢", grades: [1, 2], gen(l) {
    const [e, name] = pick(THINGS), n = l === 1 ? ri(1, 5) : l === 2 ? ri(4, 10) : ri(10, 20);
    return { say: `How many ${name}? Count them.`, text: `How many ${name}?`, show: many(e, n, n > 10 ? "small" : ""), options: numOpts(n, near(n, 3, 1), 4, 1), answer: n };
  } },
  { id: "frame", title: "Ten-frame", icon: "🟧", grades: [1, 2], gen(l) {
    const n = l === 1 ? ri(1, 5) : ri(3, 10), ask10 = l === 3;
    return ask10 ? { say: "How many more make ten?", text: "How many more to make 10?", show: tenFrame(n), options: numOpts(10 - n, near(10 - n, 2), 4), answer: 10 - n }
      : { say: "How many counters are there?", text: "How many counters?", show: tenFrame(n), options: numOpts(n, near(n, 2, 1), 4, 1), answer: n };
  } },
  { id: "findnum", title: "Find the number", icon: "🎯", grades: [1, 3], gen(l) {
    const n = l === 1 ? ri(0, 10) : l === 2 ? ri(11, 50) : ri(51, 100);
    return { say: `Tap the number ${numWord(n)}.`, text: "Tap the number you hear", show: `<button class="hear" data-say="${numWord(n)}">🔊</button>`, options: numOpts(n, l === 1 ? () => ri(0, 10) : () => pick([(n % 10) * 10 + Math.floor(n / 10), n + 10, n - 10, n + 1, n - 1, n + 2]), 4, 0), answer: n };
  } },
  { id: "words2num", title: "Number words", icon: "🔤", grades: [1, 4], gen(l) {
    const n = l === 1 ? ri(1, 10) : l === 2 ? ri(11, 20) : ri(21, 100);
    return { say: `Which number is ${numWord(n)}?`, text: `Which number is “${numWord(n)}”?`, show: "", options: numOpts(n, near(n, l === 3 ? 10 : 3, 0), 4), answer: n };
  } },
  { id: "more", title: "More or fewer", icon: "⚖️", grades: [1, 2], gen(l) {
    const [e, name] = pick(THINGS), a = ri(1, l === 1 ? 6 : 12); let b = ri(1, l === 1 ? 6 : 12); while (b === a) b = ri(1, l === 1 ? 6 : 12);
    const fewer = l > 1 && Math.random() < 0.5, ans = fewer ? (a < b ? "A" : "B") : (a > b ? "A" : "B");
    return { say: `Which box has ${fewer ? "fewer" : "more"} ${name}?`, text: `Which has ${fewer ? "FEWER" : "MORE"} ${name}?`, show: "", cols: 2,
      options: [{ html: many(e, a, "small"), value: "A", say: `${a}` }, { html: many(e, b, "small"), value: "B", say: `${b}` }], answer: ans };
  } },
  { id: "add", title: "Adding", icon: "➕", grades: [1, 4], gen(l) {
    if (l === 1) { const [e, name] = pick(THINGS), a = ri(1, 4), b = ri(1, 4);
      return { say: `${a} ${name} and ${b} more. How many altogether?`, text: `${a} + ${b} = ?`, show: `<div class="sum">${many(e, a, "small")}<b>+</b>${many(e, b, "small")}</div>`, options: numOpts(a + b, near(a + b, 2, 1), 4, 1), answer: a + b }; }
    const a = l === 2 ? ri(2, 9) : ri(10, 60), b = l === 2 ? ri(1, 10 - Math.min(a, 9)) || 1 : ri(5, 39), s = a + b;
    return { say: `${a} plus ${b}`, text: `${a} + ${b} = ?`, show: "", options: numOpts(s, near(s, l === 2 ? 2 : 10, 0), 4), answer: s };
  } },
  { id: "sub", title: "Taking away", icon: "➖", grades: [1, 4], gen(l) {
    if (l === 1) { const [e, name] = pick(THINGS), a = ri(3, 8), b = ri(1, a - 1);
      return { say: `There are ${a} ${name}. ${b} go away. How many are left?`, text: `${a} − ${b} = ?`, show: `<div class="many small">${Array.from({ length: a - b }, () => `<span>${e}</span>`).join("")}${gone(e, b)}</div>`, options: numOpts(a - b, near(a - b, 2), 4), answer: a - b }; }
    const a = l === 2 ? ri(6, 20) : ri(30, 99), b = l === 2 ? ri(1, a - 1) : ri(11, a - 5), d = a - b;
    return { say: `${a} take away ${b}`, text: `${a} − ${b} = ?`, show: "", options: numOpts(d, near(d, l === 2 ? 2 : 10), 4), answer: d };
  } },
  { id: "bonds", title: "Make 10, make 20", icon: "🔟", grades: [1, 3], gen(l) {
    const target = l === 3 ? 20 : 10, a = ri(1, target - 1), ans = target - a;
    return { say: `${a} and what make ${target}?`, text: `${a} + ? = ${target}`, show: l === 1 ? tenFrame(a) : "", options: numOpts(ans, near(ans, 2), 4), answer: ans };
  } },
  { id: "story", title: "Story sums", icon: "📖", grades: [2, 5], gen(l) {
    const n1 = pick(NAMES), n2 = pick(NAMES.filter((x) => x !== n1)), [, name] = pick(THINGS);
    const t = l === 1 ? ri(0, 1) : ri(0, 3);
    if (t === 0) { const a = ri(2, l === 3 ? 40 : 9), b = ri(1, l === 3 ? 30 : 9); return { say: `${n1} has ${a} ${name}. ${n2} gives ${n1} ${b} more. How many ${name} does ${n1} have now?`, text: `${n1} has ${a} ${name}. ${n2} gives ${b} more. How many now?`, show: "", options: numOpts(a + b, near(a + b, 3, 1), 4, 1), answer: a + b }; }
    if (t === 1) { const a = ri(5, l === 3 ? 60 : 12), b = ri(1, a - 1); return { say: `${n1} had ${a} ${name}. ${n1} gave ${b} to ${n2}. How many are left?`, text: `${n1} had ${a} ${name} and gave away ${b}. How many are left?`, show: "", options: numOpts(a - b, near(a - b, 3), 4), answer: a - b }; }
    if (t === 2) { const g = ri(2, 6), each = ri(2, 6); return { say: `There are ${g} bags. Each bag has ${each} ${name}. How many ${name} altogether?`, text: `${g} bags with ${each} ${name} in each. How many altogether?`, show: "", options: numOpts(g * each, near(g * each, 4, 1), 4, 1), answer: g * each }; }
    const kids = ri(2, 5), each = ri(2, 6), tot = kids * each; return { say: `${tot} ${name} are shared equally by ${kids} children. How many does each child get?`, text: `${tot} ${name} shared equally by ${kids} children. How many each?`, show: "", options: numOpts(each, near(each, 2, 1), 4, 1), answer: each };
  } },
  { id: "skip", title: "Counting in steps", icon: "🦘", grades: [1, 3], gen(l) {
    const step = l === 1 ? pick([1, 2]) : l === 2 ? pick([2, 5, 10]) : pick([3, 4, 5, 10, 100]), start = step * ri(0, 5);
    const seq = [0, 1, 2, 3].map((i) => start + i * step), ans = start + 4 * step;
    return { say: `Count on in ${step}s. What comes next?`, text: `${seq.join(", ")}, ?`, show: "", options: numOpts(ans, () => ans + pick([-step, step, 1, -1, step * 2]), 4), answer: ans };
  } },
  { id: "pattern", title: "What comes next?", icon: "🔁", grades: [1, 2], gen(l) {
    const set = sample(["🔴", "🔵", "🟡", "🟢", "⭐", "🌙", "🍊", "🥭", "🐟", "🐓"], 3);
    const unit = l === 1 ? [set[0], set[1]] : l === 2 ? [set[0], set[1], set[2]] : [set[0], set[0], set[1]];
    const len = unit.length * 2 + 1, row = Array.from({ length: len }, (_, i) => unit[i % unit.length]), ans = unit[len % unit.length];
    return { say: "Look at the pattern. What comes next?", text: "What comes next?", show: `<div class="many">${row.map((x) => `<span>${x}</span>`).join("")}<span class="blank">?</span></div>`,
      options: shuffle([...new Set([...set])]).map((x) => ({ html: `<span class="emo">${x}</span>`, value: x })), answer: ans };
  } },
  { id: "compare", title: "Bigger or smaller", icon: "🐊", grades: [2, 4], gen(l) {
    const max = l === 1 ? 20 : l === 2 ? 100 : 1000, a = ri(0, max); let b = Math.random() < 0.15 ? a : ri(0, max);
    const ans = a > b ? ">" : a < b ? "<" : "=";
    return { say: `Which sign goes between ${a} and ${b}?`, text: `${a}  ?  ${b}`, show: `<p class="hint">The crocodile’s mouth opens to the bigger number.</p>`, cols: 3,
      options: [">", "<", "="].map((s) => ({ html: s, value: s, say: { ">": "greater than", "<": "less than", "=": "equal to" }[s] })), answer: ans };
  } },
  { id: "place", title: "Tens and ones", icon: "🪵", grades: [2, 3], gen(l) {
    const t = ri(1, l === 1 ? 4 : 9), o = ri(0, 9), n = t * 10 + o;
    if (l === 3) { const which = pick(["tens", "ones"]); const ans = which === "tens" ? t : o; return { say: `In the number ${n}, what is the ${which} digit?`, text: `In ${n}, what is the ${which.toUpperCase()} digit?`, show: "", options: numOpts(ans, () => ri(0, 9), 4), answer: ans }; }
    return { say: "Each bundle is ten. How many sticks altogether?", text: "How many sticks? (each bundle = 10)", show: tensOnes(t, o), options: numOpts(n, () => pick([n + 10, n - 10, o * 10 + t, n + 1, n - 1]), 4, 1), answer: n };
  } },
  { id: "oddeven", title: "Odd or even", icon: "🧦", grades: [2, 4], gen(l) {
    const n = ri(1, l === 1 ? 10 : l === 2 ? 50 : 999), ans = n % 2 ? "odd" : "even";
    return { say: `Is ${n} odd or even?`, text: `Is ${n} odd or even?`, show: l === 1 ? `<div class="pairs">${Array.from({ length: n }, () => "<span>🧦</span>").join("")}</div><p class="hint">Even numbers make pairs with none left over.</p>` : "", cols: 2,
      options: [{ html: "Odd", value: "odd" }, { html: "Even", value: "even" }], answer: ans };
  } },
  { id: "times", title: "Times tables", icon: "✖️", grades: [2, 6], gen(l) {
    const t = l === 1 ? pick([2, 5, 10]) : l === 2 ? pick([3, 4, 6]) : pick([7, 8, 9, 11, 12]), n = ri(1, 12), p = t * n;
    return { say: `${n} times ${t}`, text: `${n} × ${t} = ?`, show: "", options: numOpts(p, () => pick([p + t, p - t, p + 1, p - 1, (n + 1) * (t - 1), p + 10]), 4, 0), answer: p };
  } },
  { id: "divide", title: "Sharing and dividing", icon: "➗", grades: [3, 6], gen(l) {
    const d = l === 1 ? pick([2, 5, 10]) : l === 2 ? pick([3, 4, 6]) : pick([7, 8, 9, 11, 12]), q = ri(1, 12), n = d * q;
    return { say: `${n} divided by ${d}`, text: `${n} ÷ ${d} = ?`, show: "", options: numOpts(q, near(q, 2, 1), 4, 1), answer: q };
  } },
  { id: "fractions", title: "Fractions", icon: "🍕", grades: [2, 5], gen(l) {
    const parts = l === 1 ? pick([2, 4]) : pick([2, 3, 4, 5, 6, 8]), shaded = l === 1 ? 1 : ri(1, parts - 1), ans = `${shaded}/${parts}`;
    const opts = new Set([ans]); while (opts.size < 4) { const p = pick([2, 3, 4, 5, 6, 8]), k = ri(1, p - 1); if (k * parts !== shaded * p) opts.add(`${k}/${p}`); }   // never an equal fraction (2/4 = 1/2)
    const frac = (s) => { const [a, b] = s.split("/"); return `<span class="frac"><i>${a}</i><i>${b}</i></span>`; };
    return { say: "What fraction is coloured?", text: "What fraction is coloured?", show: Math.random() < 0.5 ? fractionPie(shaded, parts) : fractionBar(shaded, parts),
      options: shuffle([...opts]).map((s) => ({ html: frac(s), value: s, say: s.replace("/", " out of ") })), answer: ans };
  } },
  { id: "halfof", title: "Half and quarter of", icon: "🍉", grades: [2, 4], gen(l) {
    const f = l === 1 ? 2 : pick([2, 4, 3]), n = f * ri(1, l === 3 ? 12 : 6), ans = n / f, name = { 2: "half", 3: "a third", 4: "a quarter" }[f];
    return { say: `What is ${name} of ${n}?`, text: `What is ${name} of ${n}?`, show: "", options: numOpts(ans, near(ans, 3, 1), 4, 1), answer: ans };
  } },
  { id: "clock", title: "Telling the time", icon: "🕒", grades: [1, 4], gen(l) {
    const h = ri(1, 12), m = l === 1 ? 0 : l === 2 ? pick([0, 30, 15, 45]) : 5 * ri(0, 11);
    const say = (H, M) => M === 0 ? `${numWord(H)} o'clock` : M === 30 ? `half past ${numWord(H)}` : M === 15 ? `quarter past ${numWord(H)}` : M === 45 ? `quarter to ${numWord(H % 12 + 1)}` : M < 30 ? `${numWord(M)} past ${numWord(H)}` : `${numWord(60 - M)} to ${numWord(H % 12 + 1)}`;
    const digital = (H, M) => `${H}:${String(M).padStart(2, "0")}`;
    const opts = new Map([[digital(h, m), say(h, m)]]);
    while (opts.size < 4) { const H = ri(1, 12), M = l === 1 ? 0 : l === 2 ? pick([0, 30, 15, 45]) : 5 * ri(0, 11); opts.set(digital(H, M), say(H, M)); }
    return { readOptions: true, say: "What time does the clock show?", text: "What time is it?", show: clock(h, m), options: shuffle([...opts]).map(([d, s]) => ({ html: `${d}<small>${s}</small>`, value: d, say: s })), answer: digital(h, m) };
  } },
  { id: "money", title: "Naira and kobo", icon: "💵", grades: [2, 6], gen(l) {
    if (l === 3) { const price = 10 * ri(2, 45), paid = price <= 100 ? 100 : price <= 200 ? 200 : 500, ch = paid - price;
      return { say: `A loaf of bread costs ${price} naira. You pay with ${paid} naira. How much change do you get?`, text: `Bread costs ₦${price}. You pay ₦${paid}. Change?`, show: naira(paid), options: numOpts(ch, () => ch + pick([-10, 10, -50, 50, 20]), 4, 0).map((o) => ({ ...o, html: "₦" + o.value })), answer: ch }; }
    const notes = l === 1 ? [5, 10, 20] : [10, 20, 50, 100, 200], k = l === 1 ? ri(2, 3) : ri(2, 4), list = Array.from({ length: k }, () => pick(notes)).sort((a, b) => b - a), sum = list.reduce((a, b) => a + b, 0);
    return { say: "How much money is this altogether?", text: "How much altogether?", show: `<div class="notes">${list.map(naira).join("")}</div>`, options: numOpts(sum, () => sum + pick([-10, 10, -5, 5, 20, -20, 50]), 4, 5).map((o) => ({ ...o, html: "₦" + o.value })), answer: sum };
  } },
  { id: "shapes", title: "Shapes", icon: "🔷", grades: [1, 3], gen(l) {
    const easy = ["circle", "square", "triangle", "rectangle"], more = [...easy, "oval", "star", "pentagon", "hexagon", "heart", "diamond"];
    const SIDES = { triangle: 3, square: 4, rectangle: 4, pentagon: 5, hexagon: 6, octagon: 8, diamond: 4 };
    if (l === 3) { const s = pick(Object.keys(SIDES)); return { say: `How many sides does this ${s} have?`, text: "How many sides?", show: shape(s, 160, pick(["#E3A835", "#7FB3E0", "#9BCB6B", "#F2A07B"])), options: numOpts(SIDES[s], () => ri(3, 8), 4, 3), answer: SIDES[s] }; }
    const pool = l === 1 ? easy : more, s = pick(pool);
    return { say: "What is the name of this shape?", text: "What shape is this?", show: shape(s, 160, pick(["#E3A835", "#7FB3E0", "#9BCB6B", "#F2A07B"])), options: wordOpts(s, pool, 3).map((o) => ({ ...o, html: cap(o.html) })), answer: s };
  } },
  { id: "measure", title: "Big, long, heavy", icon: "📏", grades: [1, 2], gen() {
    const Q = [
      ["Which is HEAVIER?", "Which is heavier?", [["🐘", "elephant"], ["🐭", "mouse"]], "elephant"], ["Which is LIGHTER?", "Which is lighter?", [["🪶", "feather"], ["🧱", "brick"]], "feather"],
      ["Which is TALLER?", "Which is taller?", [["🦒", "giraffe"], ["🐈", "cat"]], "giraffe"], ["Which is BIGGER?", "Which is bigger?", [["🚌", "bus"], ["🚲", "bicycle"]], "bus"],
      ["Which is SMALLER?", "Which is smaller?", [["🐜", "ant"], ["🐄", "cow"]], "ant"], ["Which holds MORE water?", "Which holds more water?", [["🪣", "bucket"], ["🥄", "spoon"]], "bucket"],
      ["Which is LONGER?", "Which is longer?", [["🐍", "snake"], ["🐛", "caterpillar"]], "snake"], ["Which is HEAVIER?", "Which is heavier?", [["🎃", "pumpkin"], ["🍒", "cherries"]], "pumpkin"],
      ["Which is SHORTER?", "Which is shorter?", [["🦔", "hedgehog"], ["🌴", "palm tree"]], "hedgehog"], ["Which is FASTER?", "Which is faster?", [["✈️", "aeroplane"], ["🐢", "tortoise"]], "aeroplane"],
    ];
    const [text, say, items, ans] = pick(Q);
    return { readOptions: true, say, text, show: "", cols: 2, options: picOpts(items, ans), answer: ans };
  } },
  { id: "days", title: "Days and months", icon: "📅", grades: [1, 3], gen(l) {
    const D = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    if (l < 3) { const i = ri(0, 6), after = Math.random() < 0.5, ans = after ? D[(i + 1) % 7] : D[(i + 6) % 7];
      return { say: `What day comes ${after ? "after" : "before"} ${D[i]}?`, text: `What day comes ${after ? "AFTER" : "BEFORE"} ${D[i]}?`, show: "", options: wordOpts(ans, D, 3), answer: ans }; }
    const t = ri(0, 2);
    if (t === 0) { const i = ri(0, 11), ans = M[(i + 1) % 12]; return { say: `What month comes after ${M[i]}?`, text: `What month comes after ${M[i]}?`, show: "", options: wordOpts(ans, M, 3), answer: ans }; }
    if (t === 1) return { say: "How many days are in a week?", text: "How many days are in a week?", show: "", options: numOpts(7, () => ri(5, 12), 4), answer: 7 };
    return { say: "How many months are in a year?", text: "How many months are in a year?", show: "", options: numOpts(12, () => ri(7, 14), 4), answer: 12 };
  } },
  { id: "mental", title: "Quick maths", icon: "⚡", grades: [4, 6], gen(l) {
    const t = ri(0, 3);
    if (t === 0) { const a = ri(100, l === 3 ? 9999 : 999), b = ri(10, l === 3 ? 999 : 99); return { say: `${a} plus ${b}`, text: `${a} + ${b}`, show: "", options: numOpts(a + b, () => a + b + pick([10, -10, 100, -100, 1, -1]), 4), answer: a + b }; }
    if (t === 1) { const a = ri(100, 999), b = ri(10, a - 1); return { say: `${a} minus ${b}`, text: `${a} − ${b}`, show: "", options: numOpts(a - b, () => a - b + pick([10, -10, 100, -100, 1, -1]), 4), answer: a - b }; }
    if (t === 2) { const a = ri(11, l === 3 ? 99 : 30), b = ri(2, 9); return { say: `${a} times ${b}`, text: `${a} × ${b}`, show: "", options: numOpts(a * b, () => a * b + pick([b, -b, 10, -10, 1]), 4), answer: a * b }; }
    const b = ri(2, 9), q = ri(11, 60), n = b * q; return { say: `${n} divided by ${b}`, text: `${n} ÷ ${b}`, show: "", options: numOpts(q, near(q, 3, 1), 4, 1), answer: q };
  } },
  { id: "decimals", title: "Percent and decimals", icon: "💯", grades: [5, 6], gen(l) {
    const t = l === 1 ? 0 : ri(0, 2);
    if (t === 0) { const P = [[50, "1/2"], [25, "1/4"], [75, "3/4"], [10, "1/10"], [20, "1/5"]], [p, f] = pick(P); return { say: `What is ${f.replace("/", " over ")} as a percentage?`, text: `${f} = ?%`, show: "", options: shuffle([p, ...sample(P.map(([x]) => x).filter((x) => x !== p), 3)]).map((v) => ({ html: v + "%", value: v })), answer: p }; }
    if (t === 1) { const p = pick([10, 20, 25, 50]), n = pick([100, 200, 400, 1000, 60, 80]), ans = (p * n) / 100; return { say: `What is ${p} percent of ${n}?`, text: `${p}% of ${n} = ?`, show: "", options: numOpts(ans, () => ans + pick([5, -5, 10, -10, 20]), 4, 1), answer: ans }; }
    const a = ri(1, 9) / 10, b = ri(1, 9) / 10, s = Math.round((a + b) * 10) / 10; return { say: `${a} plus ${b}`, text: `${a} + ${b} = ?`, show: "", options: numOpts(s, () => Math.round((s + pick([0.1, -0.1, 1, 0.2])) * 10) / 10, 4, 0), answer: s };
  } },
];

/* =====================================================================
   ENGLISH STUDIES
   ===================================================================== */
const ABC = "abcdefghijklmnopqrstuvwxyz".split("");
// Start-sound pictures, chosen to be familiar in Nigeria.
const SOUNDS = { a: [["🐜", "ant"], ["🍎", "apple"]], b: [["⚽", "ball"], ["🍌", "banana"], ["🚌", "bus"]], c: [["🐈", "cat"], ["🚗", "car"], ["🥥", "coconut"]], d: [["🐕", "dog"], ["🦆", "duck"], ["🥁", "drum"]],
  e: [["🥚", "egg"], ["🐘", "elephant"]], f: [["🐟", "fish"], ["🐸", "frog"], ["🌸", "flower"]], g: [["🐐", "goat"], ["🍇", "grapes"]], h: [["🎩", "hat"], ["🐔", "hen"], ["🏠", "house"]],
  i: [["🐛", "insect"]], j: [["🧃", "juice"]], k: [["🪁", "kite"], ["🔑", "key"]], l: [["🦁", "lion"], ["🍋", "lemon"], ["🍃", "leaf"]], m: [["🥭", "mango"], ["🐒", "monkey"], ["🌙", "moon"]],
  n: [["👃", "nose"], ["🥜", "nuts"]], o: [["🍊", "orange"], ["🦉", "owl"]], p: [["🖊️", "pen"], ["🐷", "pig"], ["🍍", "pineapple"]], q: [["👸", "queen"]], r: [["🐇", "rabbit"], ["🌧️", "rain"], ["🌹", "rose"]],
  s: [["☀️", "sun"], ["🐍", "snake"], ["⭐", "star"]], t: [["🌳", "tree"], ["🐢", "tortoise"], ["🍅", "tomato"]], u: [["☂️", "umbrella"]], v: [["🚐", "van"], ["🎻", "violin"]],
  w: [["⌚", "watch"], ["🍉", "watermelon"], ["🪟", "window"]], y: [["🍠", "yam"], ["🪀", "yo-yo"]], z: [["🦓", "zebra"]] };
const CVC = [["🐈", "cat"], ["🐕", "dog"], ["☀️", "sun"], ["🖊️", "pen"], ["🎩", "hat"], ["🚌", "bus"], ["🦇", "bat"], ["🐷", "pig"], ["🐔", "hen"], ["🛏️", "bed"], ["📦", "box"], ["☕", "cup"], ["🦊", "fox"], ["🗺️", "map"], ["🥅", "net"], ["🐜", "ant"], ["🐀", "rat"], ["🎒", "bag"], ["🍠", "yam"], ["🦵", "leg"]];
const WORDS4 = [["🐟", "fish"], ["🐸", "frog"], ["🥛", "milk"], ["🎂", "cake"], ["🐐", "goat"], ["🌧️", "rain"], ["🌳", "tree"], ["📕", "book"], ["⚽", "ball"], ["🪁", "kite"], ["🌙", "moon"], ["⭐", "star"], ["🦆", "duck"], ["🥁", "drum"], ["🚢", "ship"], ["👃", "nose"], ["🔔", "bell"], ["🦶", "foot"], ["🍃", "leaf"], ["🏠", "home"]];
const WORDS6 = [["🍊", "orange"], ["🍌", "banana"], ["🏫", "school"], ["✏️", "pencil"], ["🐔", "chicken"], ["🐇", "rabbit"], ["🐒", "monkey"], ["🥭", "mango"], ["🍅", "tomato"], ["🌸", "flower"], ["🐢", "turtle"], ["🦁", "lion"], ["🪟", "window"], ["🚗", "car"], ["🐘", "elephant"], ["☂️", "umbrella"], ["🍍", "pineapple"], ["🦒", "giraffe"]];
const RHYMES = [["cat", ["hat", "mat", "bat", "rat"]], ["dog", ["frog", "log", "fog"]], ["sun", ["run", "bun", "fun"]], ["pen", ["hen", "ten", "men"]], ["cake", ["lake", "make", "bake"]], ["book", ["look", "cook", "hook"]], ["ball", ["tall", "wall", "call"]], ["bed", ["red", "fed", "head"]], ["pig", ["big", "dig", "wig"]], ["night", ["light", "kite", "white"]], ["star", ["car", "far", "jar"]], ["goat", ["boat", "coat", "float"]], ["tree", ["bee", "see", "three"]], ["rain", ["train", "pain", "chain"]]];
const SIGHT = ["the", "and", "is", "it", "in", "to", "was", "said", "you", "they", "have", "are", "we", "my", "here", "go", "come", "like", "she", "he", "for", "with", "this", "what", "where", "there", "one", "all", "some", "little", "look", "play", "big", "can", "see", "out", "down", "up", "went", "saw"];
const OPPOSITES = [["big", "small"], ["hot", "cold"], ["up", "down"], ["happy", "sad"], ["fast", "slow"], ["open", "close"], ["day", "night"], ["tall", "short"], ["full", "empty"], ["old", "new"], ["wet", "dry"], ["clean", "dirty"], ["in", "out"], ["light", "heavy"], ["early", "late"], ["rich", "poor"], ["strong", "weak"], ["thick", "thin"], ["loud", "quiet"], ["push", "pull"]];
const PLURALS = [["cat", "cats"], ["book", "books"], ["box", "boxes"], ["bus", "buses"], ["baby", "babies"], ["child", "children"], ["man", "men"], ["woman", "women"], ["foot", "feet"], ["tooth", "teeth"], ["mouse", "mice"], ["sheep", "sheep"], ["knife", "knives"], ["leaf", "leaves"], ["tomato", "tomatoes"], ["goose", "geese"], ["city", "cities"], ["church", "churches"], ["dish", "dishes"], ["ox", "oxen"]];
const PAST = [["go", "went"], ["eat", "ate"], ["see", "saw"], ["run", "ran"], ["come", "came"], ["write", "wrote"], ["sing", "sang"], ["swim", "swam"], ["give", "gave"], ["take", "took"], ["make", "made"], ["sit", "sat"], ["drink", "drank"], ["buy", "bought"], ["bring", "brought"], ["teach", "taught"], ["play", "played"], ["jump", "jumped"], ["walk", "walked"], ["cry", "cried"], ["sleep", "slept"], ["read", "read"]];
const SENTENCES = [
  ["The sun ___ hot today.", "is", ["are", "am"]], ["Ada and Musa ___ friends.", "are", ["is", "am"]], ["I ___ seven years old.", "am", ["is", "are"]],
  ["I saw ___ elephant at the zoo.", "an", ["a", "the"]], ["She has ___ orange.", "an", ["a", "two"]], ["We eat ___ mango every day.", "a", ["an", "two"]],
  ["Yesterday, we ___ to the market.", "went", ["go", "goes"]], ["The birds ___ in the sky.", "fly", ["flies", "flying"]], ["Tunde ___ his teeth every morning.", "brushes", ["brush", "brushing"]],
  ["Chidi is taller ___ Emeka.", "than", ["then", "that"]], ["The book is ___ the table.", "on", ["at", "of"]], ["Please, can I ___ some water?", "have", ["has", "having"]],
  ["They ___ playing football now.", "are", ["is", "was"]], ["My mother ___ cooking jollof rice.", "is", ["are", "am"]], ["There ___ three goats in the field.", "are", ["is", "am"]],
];
const CAPS = [["Lagos is a big city.", ["lagos is a big city.", "Lagos is a big city", "lagos Is a big city."]], ["My name is Ngozi.", ["my name is ngozi.", "My name is ngozi.", "my Name is Ngozi"]],
  ["We go to school on Monday.", ["we go to school on monday.", "We go to School on monday", "we Go to school on Monday."]], ["Is it raining?", ["Is it raining.", "is it raining?", "Is it raining"]],
  ["Musa and I live in Kano.", ["musa and i live in kano.", "Musa and i live in Kano.", "musa and I live in Kano"]], ["Nigeria is in Africa.", ["nigeria is in africa.", "Nigeria is in africa", "nigeria is in Africa."]]];
const SYLL = [["cat", 1], ["dog", 1], ["sun", 1], ["mango", 2], ["pencil", 2], ["monkey", 2], ["teacher", 2], ["window", 2], ["banana", 3], ["elephant", 3], ["tomato", 3], ["umbrella", 3], ["pineapple", 3], ["crocodile", 3], ["watermelon", 4], ["caterpillar", 4], ["helicopter", 4], ["television", 4]];

const english = [
  { id: "letters", title: "Find the letter", icon: "🔠", grades: [1, 1], gen(l) {
    const c = pick(ABC), upper = l !== 1 && Math.random() < 0.5, shown = upper ? c.toUpperCase() : c;
    if (l === 3) return { say: `Find the small letter that matches big ${c.toUpperCase()}.`, text: `Match: ${c.toUpperCase()}`, show: `<div class="giant">${c.toUpperCase()}</div>`, options: shuffle([c, ...sample(ABC.filter((x) => x !== c), 3)]).map((x) => ({ html: x, value: x, say: x })), answer: c };
    return { say: `Tap the letter ${c.toUpperCase()}.`, text: "Tap the letter you hear", show: `<button class="hear" data-say="the letter ${c.toUpperCase()}">🔊</button>`, options: shuffle([shown, ...sample(ABC.filter((x) => x !== c), 3).map((x) => upper ? x.toUpperCase() : x)]).map((x) => ({ html: x, value: x, say: x })), answer: shown };
  } },
  { id: "firstsound", title: "First sound", icon: "👄", grades: [1, 2], gen() {
    const c = pick(Object.keys(SOUNDS)), [e, word] = pick(SOUNDS[c]);
    return { say: `${word}. What letter does ${word} start with?`, text: `What does it start with?`, show: `<div class="emo big">${e}</div><p class="word-under">${word}</p>`, options: shuffle([c, ...sample(Object.keys(SOUNDS).filter((x) => x !== c), 3)]).map((x) => ({ html: x, value: x, say: x })), answer: c };
  } },
  { id: "abc", title: "Alphabet order", icon: "🚂", grades: [1, 2], gen(l) {
    const i = ri(1, 24), after = l === 1 || Math.random() < 0.6, ans = after ? ABC[i + 1] : ABC[i - 1];
    return { say: `Which letter comes ${after ? "after" : "before"} ${ABC[i].toUpperCase()}?`, text: after ? `${ABC[i - 1]}  ${ABC[i]}  ?` : `?  ${ABC[i]}  ${ABC[i + 1]}`, show: "", options: shuffle([ans, ...sample(ABC.filter((x) => x !== ans), 3)]).map((x) => ({ html: x, value: x, say: x })), answer: ans };
  } },
  { id: "spell", title: "Spell it", icon: "🧩", grades: [1, 4], gen(l) {
    const [e, word] = pick(l === 1 ? CVC : l === 2 ? WORDS4 : WORDS6);
    return { kind: "spell", say: `Spell ${word}.`, text: "Spell the word", show: `<div class="emo big">${e}</div>`, word };
  } },
  { id: "missing", title: "Missing letter", icon: "🕳️", grades: [1, 3], gen(l) {
    const [e, word] = pick(l === 1 ? CVC : l === 2 ? WORDS4 : WORDS6), idx = l === 1 ? 1 : ri(0, word.length - 1), c = word[idx];
    const pool = /[aeiou]/.test(c) ? "aeiou".split("") : ABC.filter((x) => !"aeiou".includes(x));
    return { say: `${word}. Which letter is missing?`, text: word.slice(0, idx) + "_" + word.slice(idx + 1), show: `<div class="emo big">${e}</div>`, options: shuffle([c, ...sample(pool.filter((x) => x !== c), 3)]).map((x) => ({ html: x, value: x, say: x })), answer: c };
  } },
  { id: "readpic", title: "Read and find", icon: "👀", grades: [1, 3], gen(l) {
    const pool = l === 1 ? CVC : l === 2 ? WORDS4 : WORDS6, items = sample(pool, 4), [, word] = items[0];
    return { say: "Read the word. Tap its picture.", text: word, show: "", options: picOpts(items, word), answer: word, readFirst: true };
  } },
  { id: "rhyme", title: "Rhyming words", icon: "🎵", grades: [1, 3], gen() {
    const [w, rhymes] = pick(RHYMES), ans = pick(rhymes), wrong = sample(RHYMES.filter(([x]) => x !== w).map(([x]) => x), 2);
    return { readOptions: true, say: `Which word rhymes with ${w}?`, text: `What rhymes with “${w}”?`, show: "", options: shuffle([ans, ...wrong]).map((x) => ({ html: x, value: x, say: x })), answer: ans };
  } },
  { id: "sight", title: "Tricky words", icon: "🌟", grades: [1, 2], gen() {
    const w = pick(SIGHT);
    return { say: `Tap the word: ${w}.`, text: "Tap the word you hear", show: `<button class="hear" data-say="${w}">🔊</button>`, options: shuffle([w, ...sample(SIGHT.filter((x) => x !== w), 3)]).map((x) => ({ html: x, value: x })), answer: w };
  } },
  { id: "syllables", title: "Clap the beats", icon: "👏", grades: [1, 3], gen() {
    const [w, n] = pick(SYLL);
    return { say: `${w}. Clap it! How many beats?`, text: `Clap “${w}”. How many beats?`, show: "", cols: 4, options: [1, 2, 3, 4].map((x) => ({ html: "👏".repeat(x) + `<small>${x}</small>`, value: x, say: String(x) })), answer: n };
  } },
  { id: "opposites", title: "Opposites", icon: "🔄", grades: [1, 4], gen() {
    const [a, b] = pick(OPPOSITES), flip = Math.random() < 0.5, w = flip ? b : a, ans = flip ? a : b;
    return { readOptions: true, say: `What is the opposite of ${w}?`, text: `The opposite of “${w}” is…`, show: "", options: wordOpts(ans, OPPOSITES.flat().filter((x) => x !== w), 3), answer: ans };
  } },
  { id: "plurals", title: "One and many", icon: "👥", grades: [2, 5], gen(l) {
    const pool = l === 1 ? PLURALS.slice(0, 5) : PLURALS, [one, many_] = pick(pool);
    const wrong = [one + "s", one + "es", one.replace(/y$/, "ies"), one + "en"].filter((x) => x !== many_);
    return { say: `One ${one}. Two…?`, text: `One ${one}, two ___`, show: "", options: shuffle([many_, ...sample([...new Set(wrong)], 2)]).map((x) => ({ html: x, value: x, say: x })), answer: many_ };
  } },
  { id: "pasttense", title: "Yesterday words", icon: "⏪", grades: [3, 6], gen() {
    const [now, past] = pick(PAST), wrong = [now + "ed", now + "d", now.replace(/e$/, "") + "ed", now + "s", now + "ing"].filter((x) => x !== past);
    return { say: `Today I ${now}. Yesterday I…?`, text: `Today I ${now}. Yesterday I ___.`, show: "", options: shuffle([past, ...sample([...new Set(wrong)], 2)]).map((x) => ({ html: x, value: x, say: x })), answer: past };
  } },
  { id: "grammar", title: "Fill the gap", icon: "✍️", grades: [2, 6], gen() {
    const [s, ans, wrong] = pick(SENTENCES);
    return { readOptions: true, say: s.replace("___", "blank"), text: s, show: "", options: shuffle([ans, ...wrong]).map((x) => ({ html: x, value: x, say: x })), answer: ans };
  } },
  { id: "capitals", title: "Capital letters and full stops", icon: "🅰️", grades: [2, 5], gen() {
    const [right, wrongs] = pick(CAPS);
    return { say: "Which sentence is written correctly?", text: "Which one is written correctly?", show: "", cols: 1, options: shuffle([right, ...wrongs.slice(0, 2)]).map((x) => ({ html: x, value: x })), answer: right };
  } },
];

/* =====================================================================
   BASIC SCIENCE, HEALTH, OUR WORLD
   ===================================================================== */
const quiz = (items) => () => { const [say, text, opts, ans, explain] = pick(items); return { say, text, show: "", readOptions: true, options: shuffle(opts).map((x) => typeof x === "string" ? { html: x, value: x, say: x } : { html: `<span class="emo">${x[0]}</span><small>${x[1]}</small>`, value: x[1], say: x[1] }), answer: ans, explain }; };
const science = [
  { id: "homes", title: "Where do animals live?", icon: "🏡", grades: [1, 3], gen: quiz([
    ["Where does a fish live?", "🐟 lives in…", [["🌊", "water"], ["🌳", "tree"], ["🏜️", "desert"]], "water"], ["Where does a bird make its home?", "🐦 lives in a…", [["🪺", "nest"], ["🌊", "river"], ["🕳️", "hole"]], "nest"],
    ["Where does a bee live?", "🐝 lives in a…", [["🍯", "hive"], ["🪺", "nest"], ["🌊", "pond"]], "hive"], ["Where does a cow live?", "🐄 lives on a…", [["🏡", "farm"], ["🌊", "sea"], ["🌳", "tree"]], "farm"],
    ["Where does a camel live?", "🐪 lives in the…", [["🏜️", "desert"], ["🌊", "sea"], ["❄️", "snow"]], "desert"], ["Where does a monkey like to live?", "🐒 lives in…", [["🌳", "trees"], ["🌊", "the sea"], ["🏜️", "the desert"]], "trees"],
    ["Where does a crocodile live?", "🐊 lives in…", [["🏞️", "a river"], ["🌳", "a tree"], ["🏜️", "the desert"]], "a river"], ["Where does a spider live?", "🕷️ lives in a…", [["🕸️", "web"], ["🍯", "hive"], ["🌊", "pond"]], "web"]]) },
  { id: "babies", title: "Animal babies", icon: "🐣", grades: [1, 3], gen: quiz([
    ["What is a baby cat called?", "A baby 🐈 is a…", ["kitten", "puppy", "calf"], "kitten"], ["What is a baby dog called?", "A baby 🐕 is a…", ["puppy", "kitten", "chick"], "puppy"],
    ["What is a baby hen called?", "A baby 🐔 is a…", ["chick", "lamb", "kid"], "chick"], ["What is a baby cow called?", "A baby 🐄 is a…", ["calf", "foal", "cub"], "calf"],
    ["What is a baby goat called?", "A baby 🐐 is a…", ["kid", "lamb", "puppy"], "kid"], ["What is a baby sheep called?", "A baby 🐑 is a…", ["lamb", "kid", "calf"], "lamb"],
    ["What is a baby lion called?", "A baby 🦁 is a…", ["cub", "kitten", "foal"], "cub"], ["What is a baby horse called?", "A baby 🐎 is a…", ["foal", "calf", "cub"], "foal"],
    ["What is a baby frog called?", "A baby 🐸 is a…", ["tadpole", "chick", "kid"], "tadpole"], ["What is a baby duck called?", "A baby 🦆 is a…", ["duckling", "kitten", "lamb"], "duckling"]]) },
  { id: "body", title: "My body", icon: "🧍", grades: [1, 2], gen: quiz([
    ["Which part of the body do we use to see?", "We see with our…", [["👁️", "eyes"], ["👂", "ears"], ["👃", "nose"]], "eyes"], ["Which part do we use to hear?", "We hear with our…", [["👂", "ears"], ["👁️", "eyes"], ["🦶", "feet"]], "ears"],
    ["Which part do we use to smell?", "We smell with our…", [["👃", "nose"], ["👂", "ears"], ["✋", "hands"]], "nose"], ["Which part do we use to taste?", "We taste with our…", [["👅", "tongue"], ["👁️", "eyes"], ["🦵", "legs"]], "tongue"],
    ["Which part do we use to walk?", "We walk with our…", [["🦶", "feet"], ["👂", "ears"], ["👃", "nose"]], "feet"], ["Which part do we use to hold a pencil?", "We hold a pencil with our…", [["✋", "hand"], ["🦶", "foot"], ["👂", "ear"]], "hand"],
    ["Which part do we use to chew food?", "We chew with our…", [["🦷", "teeth"], ["👂", "ears"], ["👁️", "eyes"]], "teeth"], ["Which part do we use to think?", "We think with our…", [["🧠", "brain"], ["🦵", "leg"], ["👃", "nose"]], "brain"]]) },
  { id: "senses", title: "Five senses", icon: "✋", grades: [1, 3], gen: quiz([
    ["How do you know a song is playing?", "🎶 We ___ music.", ["hear", "smell", "taste"], "hear"], ["How do you know the soup is salty?", "🍲 We ___ salt.", ["taste", "hear", "see"], "taste"],
    ["How do you know bread is baking?", "🍞 We ___ fresh bread.", ["smell", "hear", "touch"], "smell"], ["How do you know a stone is hard?", "🪨 We ___ it is hard.", ["touch", "smell", "hear"], "touch"],
    ["How do you know the sky is blue?", "🌤️ We ___ the blue sky.", ["see", "taste", "smell"], "see"], ["How many senses do we have?", "How many senses?", ["5", "3", "7"], "5"]]) },
  { id: "food", title: "Good food", icon: "🍲", grades: [2, 5], gen: quiz([
    ["Beans help us grow and build our body. Beans are…", "🫘 Beans give us…", ["body-building food (protein)", "energy food (carbohydrate)", "water"], "body-building food (protein)", "Beans, eggs, fish and meat are body-building foods (protein)."],
    ["Yam gives us energy to play. Yam is…", "🍠 Yam gives us…", ["energy food (carbohydrate)", "body-building food (protein)", "protective food (vitamins)"], "energy food (carbohydrate)", "Yam, rice, garri and bread are energy foods (carbohydrates)."],
    ["Oranges help keep us from getting sick. Oranges are…", "🍊 Oranges give us…", ["protective food (vitamins)", "energy food (carbohydrate)", "body-building food (protein)"], "protective food (vitamins)", "Fruits and vegetables are protective foods (vitamins and minerals)."],
    ["Which of these is a body-building food?", "Which builds the body?", [["🐟", "fish"], ["🍬", "sweets"], ["🥤", "soft drink"]], "fish"], ["Which of these is an energy food?", "Which gives energy?", [["🍚", "rice"], ["🥬", "vegetable"], ["🐟", "fish"]], "rice"],
    ["Which of these is healthier for a snack?", "Healthy snack?", [["🍌", "banana"], ["🍭", "lollipop"], ["🍟", "chips"]], "banana"], ["What should we drink every day?", "Drink plenty of…", [["💧", "clean water"], ["🥤", "soft drinks"], ["☕", "coffee"]], "clean water"],
    ["Eating many kinds of food in the right amounts is called…", "Many kinds of food =", ["a balanced diet", "a snack", "a feast"], "a balanced diet"]]) },
  { id: "living", title: "Living or non-living", icon: "🌱", grades: [1, 3], gen() {
    const L = [["🐐", "goat"], ["🌳", "tree"], ["🐟", "fish"], ["👧", "girl"], ["🐓", "cock"], ["🌻", "sunflower"], ["🐜", "ant"], ["🐄", "cow"]], N = [["🪨", "stone"], ["🚗", "car"], ["🪑", "chair"], ["📱", "phone"], ["⚽", "ball"], ["🏠", "house"], ["✏️", "pencil"], ["🧱", "brick"]];
    const living = Math.random() < 0.5, [e, w] = pick(living ? L : N);
    return { say: `Is a ${w} living or non-living?`, text: `${w}: living or non-living?`, show: `<div class="emo big">${e}</div>`, cols: 2, options: [{ html: "Living 🌱", value: "living", say: "living" }, { html: "Non-living 🪨", value: "non-living", say: "non-living" }], answer: living ? "living" : "non-living", explain: "Living things grow, breathe, feed and have young ones." };
  } },
  { id: "plants", title: "Parts of a plant", icon: "🌿", grades: [2, 5], gen: quiz([
    ["Which part of the plant takes in water from the soil?", "Takes in water from the soil:", ["root", "flower", "leaf"], "root"], ["Which part holds the plant up and carries water?", "Holds the plant up:", ["stem", "root", "fruit"], "stem"],
    ["Which part makes food for the plant using sunlight?", "Makes food using sunlight:", ["leaf", "root", "seed"], "leaf"], ["Which part grows into a new plant?", "Grows into a new plant:", ["seed", "leaf", "stem"], "seed"],
    ["What do plants need to grow?", "Plants need…", ["water, air and sunlight", "only sand", "only darkness"], "water, air and sunlight"], ["A mango is which part of the plant?", "🥭 A mango is a…", ["fruit", "root", "stem"], "fruit"],
    ["Cassava we eat is which part of the plant?", "Cassava is a…", ["root", "flower", "leaf"], "root"]]) },
  { id: "weather", title: "Weather and seasons", icon: "🌦️", grades: [1, 4], gen: quiz([
    ["What do we use when it is raining?", "When it rains we use…", [["☂️", "umbrella"], ["🕶️", "sunglasses"], ["🧤", "gloves"]], "umbrella"], ["What are the two main seasons in Nigeria?", "Nigeria's two seasons:", ["rainy and dry", "summer and winter", "spring and autumn"], "rainy and dry"],
    ["The cold, dry, dusty wind in the dry season is called…", "Cold dusty wind =", ["harmattan", "rainbow", "flood"], "harmattan"], ["What gives us light and heat during the day?", "Light and heat by day:", [["☀️", "the sun"], ["🌙", "the moon"], ["⭐", "the stars"]], "the sun"],
    ["Which shows a rainy day?", "Rainy day:", [["🌧️", "rain"], ["☀️", "sun"], ["🌈", "rainbow"]], "rain"], ["What do we see in the sky at night?", "At night we see…", [["🌙", "the moon"], ["🌈", "a rainbow"], ["☀️", "the sun"]], "the moon"]]) },
  { id: "safety", title: "Staying safe", icon: "🦺", grades: [1, 4], gen() {
    if (Math.random() < 0.4) { const k = pick(["red", "amber", "green"]), m = { red: "stop", amber: "get ready", green: "go" }[k];
      return { say: `The traffic light is ${k}. What should cars do?`, text: "What does this light mean?", show: trafficLight(k), options: shuffle(["stop", "get ready", "go"]).map((x) => ({ html: cap(x), value: x, say: x })), answer: m }; }
    return quiz([
      ["Where should we cross the road?", "Cross the road at the…", ["zebra crossing", "middle of a bend", "behind a bus"], "zebra crossing"], ["Before we eat, we should…", "Before eating:", [["🧼", "wash our hands"], ["📺", "watch TV"], ["🏃", "run"]], "wash our hands"],
      ["How many times a day should we brush our teeth?", "Brush our teeth…", ["two times", "never", "once a week"], "two times"], ["A stranger offers you a sweet. What should you do?", "A stranger offers a sweet:", ["say no and tell an adult", "take it", "follow them"], "say no and tell an adult"],
      ["We should keep our surroundings…", "Keep our surroundings…", ["clean", "dirty", "smelly"], "clean"], ["What do we do with rubbish?", "Rubbish goes in the…", [["🗑️", "dustbin"], ["🌊", "gutter"], ["🛣️", "road"]], "dustbin"]])();
  } },
  { id: "feelings", title: "Feelings", icon: "😊", grades: [1, 2], gen: quiz([
    ["Which face is happy?", "Find HAPPY", [["😀", "happy"], ["😢", "sad"], ["😠", "angry"]], "happy"], ["Which face is sad?", "Find SAD", [["😢", "sad"], ["😀", "happy"], ["😮", "surprised"]], "sad"],
    ["Which face is angry?", "Find ANGRY", [["😠", "angry"], ["😀", "happy"], ["😴", "sleepy"]], "angry"], ["Which face is scared?", "Find SCARED", [["😨", "scared"], ["😀", "happy"], ["😋", "hungry"]], "scared"],
    ["Which face is surprised?", "Find SURPRISED", [["😮", "surprised"], ["😢", "sad"], ["😴", "sleepy"]], "surprised"], ["Your friend falls down and cries. What can you do?", "A friend is hurt:", ["help and tell the teacher", "laugh", "walk away"], "help and tell the teacher"]]) },
  { id: "transport", title: "Ways to travel", icon: "🚌", grades: [1, 3], gen: quiz([
    ["Which one travels on water?", "Travels on WATER", [["🛶", "canoe"], ["🚗", "car"], ["✈️", "aeroplane"]], "canoe"], ["Which one flies in the air?", "Travels in the AIR", [["✈️", "aeroplane"], ["🚌", "bus"], ["🚢", "ship"]], "aeroplane"],
    ["Which one runs on rails?", "Runs on RAILS", [["🚆", "train"], ["🚲", "bicycle"], ["⛵", "boat"]], "train"], ["Which one travels on land?", "Travels on LAND", [["🛺", "keke"], ["🚢", "ship"], ["🚁", "helicopter"]], "keke"],
    ["Which one has two wheels?", "Has TWO wheels", [["🏍️", "okada"], ["🚌", "bus"], ["🚂", "train"]], "okada"]]) },
  { id: "jobs", title: "People who help us", icon: "👩🏾‍⚕️", grades: [1, 3], gen: quiz([
    ["Who looks after sick people?", "Looks after the sick:", [["👩🏾‍⚕️", "doctor"], ["👨🏾‍🌾", "farmer"], ["👨🏾‍🍳", "cook"]], "doctor"], ["Who grows our food?", "Grows our food:", [["👨🏾‍🌾", "farmer"], ["👮🏾", "police officer"], ["👩🏾‍🏫", "teacher"]], "farmer"],
    ["Who teaches us in school?", "Teaches in school:", [["👩🏾‍🏫", "teacher"], ["👨🏾‍🔧", "mechanic"], ["🧑🏾‍✈️", "pilot"]], "teacher"], ["Who keeps us safe on the road?", "Keeps us safe:", [["👮🏾", "police officer"], ["🧑🏾‍🎨", "artist"], ["👨🏾‍🍳", "cook"]], "police officer"],
    ["Who repairs cars?", "Repairs cars:", [["👨🏾‍🔧", "mechanic"], ["👩🏾‍⚕️", "nurse"], ["👨🏾‍🌾", "farmer"]], "mechanic"], ["Who flies an aeroplane?", "Flies an aeroplane:", [["🧑🏾‍✈️", "pilot"], ["👩🏾‍🏫", "teacher"], ["👨🏾‍🍳", "cook"]], "pilot"],
    ["Who puts out fires?", "Puts out fires:", [["🧑🏾‍🚒", "firefighter"], ["🧑🏾‍🎨", "artist"], ["👨🏾‍🌾", "farmer"]], "firefighter"], ["Who sews clothes?", "Sews clothes:", [["🧵", "tailor"], ["🔧", "mechanic"], ["🩺", "doctor"]], "tailor"]]) },
];

/* =====================================================================
   NIGERIA: SOCIAL & CITIZENSHIP STUDIES, NIGERIAN HISTORY
   ===================================================================== */
const world = [
  { id: "nigeria", title: "My country Nigeria", icon: flagNG(60), grades: [1, 6], gen(l) {
    const easy = [
      ["What are the colours of the Nigerian flag?", "Our flag's colours:", ["green and white", "red and blue", "yellow and black"], "green and white", "The flag is green, white, green."],
      ["What is the capital city of Nigeria?", "Capital of Nigeria:", ["Abuja", "Lagos", "Kano"], "Abuja", "Abuja became the capital in 1991."],
      ["What is the money of Nigeria called?", "Nigeria's money:", ["Naira", "Dollar", "Cedi"], "Naira"],
      ["On which continent is Nigeria?", "Nigeria is in…", ["Africa", "Europe", "Asia"], "Africa"],
    ];
    const hard = [
      ["In what year did Nigeria become independent?", "Independence year:", ["1960", "1963", "1914"], "1960", "Nigeria became independent on 1 October 1960."],
      ["On which day do we celebrate Independence Day?", "Independence Day:", ["1 October", "12 June", "25 December"], "1 October"],
      ["How many states does Nigeria have?", "Number of states:", ["36", "30", "19"], "36", "36 states and the Federal Capital Territory, Abuja."],
      ["In what year did Nigeria become a republic?", "Republic year:", ["1963", "1960", "1999"], "1963"],
      ["In what year were the Northern and Southern Protectorates joined (amalgamation)?", "Amalgamation year:", ["1914", "1960", "1900"], "1914"],
      ["Which is the longest river in Nigeria?", "Longest river:", ["River Niger", "River Benue", "Ogun River"], "River Niger", "The Niger and the Benue meet at Lokoja."],
      ["Where do the rivers Niger and Benue meet?", "The Niger and Benue meet at…", ["Lokoja", "Lagos", "Kaduna"], "Lokoja"],
      ["What is Nigeria's Democracy Day?", "Democracy Day:", ["12 June", "1 October", "29 May"], "12 June"],
    ];
    if (l === 1 && Math.random() < 0.4) return { say: "Which one is the flag of Nigeria?", text: "Which is the Nigerian flag?", show: "", cols: 3,
      options: shuffle([["ng", flagNG(110)], ["a", `<svg width="110" height="73" viewBox="0 0 3 2"><rect width="3" height="2" fill="#C8102E"/><rect y=".66" width="3" height=".68" fill="#fff"/></svg>`], ["b", `<svg width="110" height="73" viewBox="0 0 3 2"><rect width="1" height="2" fill="#1E5AA8"/><rect x="1" width="1" height="2" fill="#F2C230"/><rect x="2" width="1" height="2" fill="#1E5AA8"/></svg>`]]).map(([v, h]) => ({ html: h, value: v })), answer: "ng" };
    const [say, text, opts, ans, explain] = pick(l === 1 ? easy : l === 2 ? easy.concat(hard.slice(0, 3)) : hard);
    return { readOptions: true, say, text, show: "", options: shuffle(opts).map((x) => ({ html: x, value: x, say: x })), answer: ans, explain };
  } },
  { id: "family", title: "Family and home", icon: "👨‍👩‍👧", grades: [1, 3], gen: quiz([
    ["Your father's mother is your…", "Father's mother:", ["grandmother", "aunt", "sister"], "grandmother"], ["Your mother's brother is your…", "Mother's brother:", ["uncle", "cousin", "grandfather"], "uncle"],
    ["Your uncle's child is your…", "Uncle's child:", ["cousin", "nephew", "sister"], "cousin"], ["A family with father, mother and their children only is a…", "Father, mother and children:", ["nuclear family", "extended family", "class"], "nuclear family"],
    ["A family that also has grandparents, aunts and uncles is an…", "With grandparents, uncles, aunts:", ["extended family", "nuclear family", "club"], "extended family"], ["How should we greet our elders?", "Greeting elders:", ["politely and with respect", "by shouting", "we don't greet"], "politely and with respect"]]) },
  { id: "values", title: "Good citizens", icon: "🤝", grades: [2, 6], gen: quiz([
    ["You find a purse on the way to school. What should you do?", "Found a purse:", ["give it to a teacher", "keep it", "throw it away"], "give it to a teacher"], ["Telling the truth all the time is called…", "Always telling the truth:", ["honesty", "pride", "laziness"], "honesty"],
    ["Waiting for your turn in a line shows…", "Waiting your turn:", ["patience", "anger", "greed"], "patience"], ["Helping to clean your community is…", "Cleaning your community:", ["good citizenship", "bad behaviour", "a punishment"], "good citizenship"],
    ["When adults choose leaders, they…", "Choosing leaders:", ["vote", "fight", "sleep"], "vote"], ["Living peacefully with people of other tribes and religions is called…", "Living peacefully together:", ["unity", "quarrel", "war"], "unity"],
    ["Nigeria has many ethnic groups. Three big ones are…", "Three big ethnic groups:", ["Hausa, Igbo and Yoruba", "Zulu, Xhosa and Swazi", "Ashanti, Ewe and Fante"], "Hausa, Igbo and Yoruba"]]) },
  { id: "computer", title: "Computers", icon: "💻", grades: [3, 6], gen: quiz([
    ["Which part do we type with?", "We type with the…", [["⌨️", "keyboard"], ["🖥️", "monitor"], ["🖨️", "printer"]], "keyboard"], ["Which part shows pictures and words?", "Shows pictures and words:", [["🖥️", "monitor"], ["🖱️", "mouse"], ["⌨️", "keyboard"]], "monitor"],
    ["Which part do we use to point and click?", "Point and click:", [["🖱️", "mouse"], ["🖨️", "printer"], ["🔈", "speaker"]], "mouse"], ["Which part puts our work on paper?", "Puts work on paper:", [["🖨️", "printer"], ["🖱️", "mouse"], ["🖥️", "monitor"]], "printer"],
    ["Which part gives us sound?", "Gives us sound:", [["🔈", "speaker"], ["⌨️", "keyboard"], ["🖨️", "printer"]], "speaker"], ["Someone online asks for your home address. You should…", "A stranger online asks your address:", ["not tell them and tell an adult", "tell them", "send a photo"], "not tell them and tell an adult"],
    ["A secret word that keeps your account safe is a…", "A secret word for your account:", ["password", "picture", "game"], "password"]]) },
];

/* =====================================================================
   CULTURAL & CREATIVE ARTS
   ===================================================================== */
const COLOURS = [["#E04B3A", "red"], ["#2F6FD0", "blue"], ["#F2C230", "yellow"], ["#2E9A4F", "green"], ["#F28C28", "orange"], ["#8E4FB8", "purple"], ["#8B5A2B", "brown"], ["#F48FB1", "pink"], ["#1F1B2E", "black"], ["#FFFFFF", "white"]];
const arts = [
  { id: "colours", title: "Colours", icon: "🎨", grades: [1, 1], gen(l) {
    const set = sample(COLOURS, l === 1 ? 3 : 4), [hex, name] = set[0];
    return { say: `Tap the colour ${name}.`, text: "Tap the colour you hear", show: `<button class="hear" data-say="${name}">🔊</button>`, cols: set.length, options: shuffle(set).map(([h, n]) => ({ html: swatch(h, n), value: n, say: n })), answer: name };
  } },
  { id: "mixing", title: "Mixing colours", icon: "🖌️", grades: [1, 4], gen: quiz([
    ["Red and yellow make…", "🔴 + 🟡 =", [["🟠", "orange"], ["🟢", "green"], ["🟣", "purple"]], "orange"], ["Blue and yellow make…", "🔵 + 🟡 =", [["🟢", "green"], ["🟠", "orange"], ["🟤", "brown"]], "green"],
    ["Red and blue make…", "🔴 + 🔵 =", [["🟣", "purple"], ["🟢", "green"], ["🟠", "orange"]], "purple"], ["Red, blue and yellow are called…", "Red, blue and yellow are…", ["primary colours", "secondary colours", "dark colours"], "primary colours"],
    ["Black and white make…", "⚫ + ⚪ =", ["grey", "pink", "gold"], "grey"], ["Red and white make…", "🔴 + ⚪ =", ["pink", "blue", "black"], "pink"]]) },
  { id: "craft", title: "Nigerian arts and crafts", icon: "🧺", grades: [2, 6], gen: quiz([
    ["Adire is cloth dyed with which colour, traditionally?", "Adire is dyed with…", ["indigo (blue)", "bright pink", "silver"], "indigo (blue)", "Adire is the indigo-dyed cloth of the Yoruba people."],
    ["Which cloth is woven on a loom by weavers in Nigeria?", "Woven cloth:", ["aso-oke", "plastic", "paper"], "aso-oke"], ["What is a talking drum used for?", "The talking drum…", ["making music that sounds like speech", "cooking", "carrying water"], "making music that sounds like speech"],
    ["Pots are made by moulding…", "Pots are moulded from…", ["clay", "glass", "metal sheets"], "clay"], ["Baskets are made by…", "Baskets are made by…", ["weaving", "painting", "baking"], "weaving"],
    ["Which is a musical instrument you shake?", "An instrument you shake:", ["shekere", "piano", "trumpet"], "shekere"]]) },
];

/* =====================================================================
   NIGERIAN LANGUAGES (Hausa, Igbo, Yoruba)
   ===================================================================== */
export const LANG = {
  yoruba: { name: "Yorùbá", nums: ["ọ̀kan", "èjì", "ẹ̀ta", "ẹ̀rin", "àrún", "ẹ̀fà", "èje", "ẹ̀jọ", "ẹ̀sán", "ẹ̀wá"], words: [["good morning", "Ẹ káàárọ̀"], ["thank you", "Ẹ ṣé"], ["welcome", "Ẹ káàbọ̀"], ["water", "omi"], ["mother", "ìyá"], ["father", "bàbá"], ["house", "ilé"], ["dog", "ajá"]] },
  igbo: { name: "Igbo", nums: ["otu", "abụọ", "atọ", "anọ", "ise", "isii", "asaa", "asatọ", "itoolu", "iri"], words: [["good morning", "Ụtụtụ ọma"], ["thank you", "Daalụ"], ["welcome", "Nnọọ"], ["water", "mmiri"], ["mother", "nne"], ["father", "nna"], ["house", "ụlọ"], ["dog", "nkịta"]] },
  hausa: { name: "Hausa", nums: ["ɗaya", "biyu", "uku", "huɗu", "biyar", "shida", "bakwai", "takwas", "tara", "goma"], words: [["good morning", "Ina kwana"], ["thank you", "Na gode"], ["welcome", "Sannu da zuwa"], ["water", "ruwa"], ["mother", "uwa"], ["father", "uba"], ["house", "gida"], ["dog", "kare"]] },
};
const langs = Object.entries(LANG).map(([key, L]) => ({ id: "lang-" + key, title: `${L.name}: numbers and words`, icon: key === "yoruba" ? "🥁" : key === "igbo" ? "🪘" : "🐎", grades: [1, 6], gen(l) {
  if (l === 3) { const [en, w] = pick(L.words); return { say: `What is ${en} in ${L.name}?`, text: `“${en}” in ${L.name}:`, show: "", options: shuffle([w, ...sample(L.words.filter(([e]) => e !== en).map(([, x]) => x), 2)]).map((x) => ({ html: x, value: x })), answer: w }; }
  const n = ri(1, 10), w = L.nums[n - 1];
  if (l === 1) return { say: `How many? Find the ${L.name} word.`, text: `How many? (${L.name})`, show: many("🥭", n, "small"), options: shuffle([w, ...sample(L.nums.filter((x) => x !== w), 2)]).map((x) => ({ html: x, value: x })), answer: w };
  return { say: `Which number is this?`, text: `${w} = ?`, show: "", options: numOpts(n, () => ri(1, 10), 4, 1), answer: n };
} }));

/* ---------- catalogue ---------- */
export const SUBJECTS = [
  { id: "maths", name: "Numbers", full: "Mathematics", icon: "🔢", color: "#23367E", acts: maths },
  { id: "english", name: "Letters & words", full: "English Studies", icon: "🔤", color: "#B9512B", acts: english },
  { id: "science", name: "Science & me", full: "Basic Science · Health", icon: "🔬", color: "#2E7A4F", acts: science },
  { id: "world", name: "Our Nigeria", full: "Social Studies · History · Digital", icon: flagNG(64), color: "#0F7B5F", acts: world },
  { id: "arts", name: "Art & colours", full: "Cultural & Creative Arts", icon: "🎨", color: "#A0478C", acts: arts },
  { id: "langs", name: "Our languages", full: "Hausa · Igbo · Yorùbá", icon: "🗣️", color: "#A97810", acts: langs },
];
export const ACTS = Object.fromEntries(SUBJECTS.flatMap((s) => s.acts.map((a) => [a.id, { ...a, subject: s.id }])));
// Starting level for a class year: Primary 1–2 start easy, 5–6 start hard.
export const startLevel = (act, grade) => !grade ? 1 : grade <= act.grades[0] ? 1 : grade >= act.grades[1] ? 3 : 2;
