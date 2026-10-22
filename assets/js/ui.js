export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const LET = ["A", "B", "C", "D", "E", "F"];
export const TYPE_NAME = { mcq: "MULTIPLE CHOICE", tf: "TRUE / FALSE", short: "WRITTEN", poll: "POLL", word: "WORD CLOUD" };

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Escaped text that keeps the teacher's line breaks, e.g. "(a) ...\n(b) ..."
export const rt = (s) => esc(s).replace(/\n/g, "<br>");
export const uid = () => Math.random().toString(36).slice(2, 10);
export function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Seeded random numbers, so a shuffled paper or test is the same every time it is shown.
export function rng(seed) { let a = 0; for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 1) >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function seededShuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

let toastEl;
export function toast(msg, isErr = false) {
  if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.toggle("err", isErr); toastEl.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove("show"), isErr ? 4500 : 2400);
}

// In-page confirmation (native confirm() is ugly and blocks).
export function ask(message, okLabel = "Confirm", danger = false) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.innerHTML = `<form method="dialog" class="dlg"><p style="margin:0">${esc(message)}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" value="no">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" value="yes">${esc(okLabel)}</button></div></form>`;
    document.body.appendChild(d);
    let done = false;
    const finish = (yes) => { if (done) return; done = true; resolve(yes); if (d.open) d.close(); d.remove(); };
    // Handle the buttons directly; the dialog's own "close" event covers the Esc key.
    d.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); finish(e.submitter?.value === "yes"); });
    d.addEventListener("close", () => finish(d.returnValue === "yes"));
    d.showModal();
  });
}

// A dialog with custom content. Returns the <dialog>; close it with d.close().
export function dialog(html, wide = false) {
  const d = document.createElement("dialog");
  if (wide) d.style.width = "min(760px, calc(100% - 32px))";
  d.innerHTML = `<div class="dlg">${html}</div>`;
  document.body.appendChild(d);
  d.addEventListener("close", () => d.remove());
  d.showModal();
  return d;
}

const loaded = {};
export function loadScript(src) {
  return (loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res;
    s.onerror = () => { delete loaded[src]; rej(new Error("Could not load a helper library. Check your connection.")); };
    document.head.appendChild(s);
  }));
}
export function loadCss(href) {
  if (loaded[href]) return; loaded[href] = true;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
}

export const fmtDate = (d) => d ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
export const pct = (n, d) => d ? Math.round((100 * n) / d) : 0;

export const LOGO = `<svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="21" cy="9" r="6.5" fill="#E3A835"/><circle cx="9" cy="21" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="21" cy="21" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

/* ---------- pictures in questions ---------- */
export const qimg = (q, cls = "qimg") => q?.image ? `<img class="${cls}" src="${esc(q.image)}" alt="Picture for this question" loading="lazy">` : "";

/* ---------- maths and chemistry ----------
   Teachers type $x^2$ or $\frac{1}{2}$ for maths and $\ce{H2SO4}$ for chemistry.
   KaTeX turns them into proper notation; it only loads when a page needs it. */
const KATEX = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/";
export const hasMath = (s) => /\$[^$]+\$/.test(String(s || ""));
export async function renderMath(el) {
  if (!el || !hasMath(el.textContent)) return;
  try {
    loadCss(KATEX + "katex.min.css");
    await loadScript(KATEX + "katex.min.js");
    await Promise.all([loadScript(KATEX + "contrib/auto-render.min.js"), loadScript(KATEX + "contrib/mhchem.min.js")]);
    window.renderMathInElement(el, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }], throwOnError: false, ignoredClasses: ["no-math"] });
  } catch { /* offline: the raw text stays readable */ }
}

// Plain-text version of maths, for Word files and read-aloud.
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", n: "ⁿ" };
const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉" };
const SYM = { times: "×", div: "÷", pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", pi: "π", theta: "θ", alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", lambda: "λ", mu: "µ", Omega: "Ω", omega: "ω", sigma: "σ", infty: "∞", rightarrow: "→", to: "→", leftarrow: "←", rightleftharpoons: "⇌", degree: "°", circ: "°", cdot: "·", approx: "≈" };
export function plainMath(s) {
  return String(s ?? "").replace(/\$\$?([^$]+)\$\$?/g, (_, m) => {
    let t = m;
    t = t.replace(/\\ce\{([^}]*)\}/g, (_, c) => c.replace(/([A-Za-z)\]])(\d+)/g, (__, a, d) => a + [...d].map((x) => SUB[x]).join("")).replace(/<=>/g, "⇌").replace(/->/g, "→").replace(/\^\{?([0-9+-]+)\}?/g, (__, e) => [...e].map((x) => SUP[x] || x).join("")));
    for (let i = 0; i < 3; i++) t = t.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
    t = t.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)").replace(/\\sqrt\s*(\w)/g, "√$1");
    t = t.replace(/\^\{([^{}]*)\}/g, (_, e) => [...e].map((x) => SUP[x] ?? x).join("")).replace(/\^(\w)/g, (_, e) => SUP[e] ?? "^" + e);
    t = t.replace(/_\{([^{}]*)\}/g, (_, e) => [...e].map((x) => SUB[x] ?? x).join("")).replace(/_(\d)/g, (_, e) => SUB[e]);
    t = t.replace(/\\([a-zA-Z]+)/g, (_, w) => SYM[w] ?? w).replace(/[{}]/g, "").replace(/\\,|\\;|\\!/g, " ");
    return t;
  });
}

// Symbol buttons for teachers who don't know LaTeX. Inserts into the last focused field.
export const SYMBOLS = ["²", "³", "½", "¼", "√", "π", "×", "÷", "±", "≤", "≥", "≠", "°", "→", "⇌", "α", "β", "θ", "Δ", "Ω", "µ", "₂", "₃", "₄"];
let lastField = null;
document.addEventListener("focusin", (e) => { if (e.target.matches?.("textarea, input[type=text]")) lastField = e.target; });
export const symbolBarHTML = () => `<div class="symbar" role="toolbar" aria-label="Insert symbol">${SYMBOLS.map((s) => `<button type="button" class="sym" data-sym="${s}">${s}</button>`).join("")}
  <button type="button" class="sym wide" data-sym="$\\frac{a}{b}$" title="Fraction">a⁄b</button><button type="button" class="sym wide" data-sym="$x^{2}$" title="Power">xⁿ</button>
  <button type="button" class="sym wide" data-sym="$\\ce{H2SO4}$" title="Chemical formula">H₂SO₄</button></div>`;
document.addEventListener("mousedown", (e) => { if (e.target.closest?.(".sym")) e.preventDefault(); }); // keep focus in the field
document.addEventListener("click", (e) => {
  const b = e.target.closest?.(".sym"); if (!b || !lastField || !document.contains(lastField)) return;
  const f = lastField, s = b.dataset.sym, a = f.selectionStart ?? f.value.length, z = f.selectionEnd ?? a;
  f.value = f.value.slice(0, a) + s + f.value.slice(z);
  f.selectionStart = f.selectionEnd = a + s.length;
  f.dispatchEvent(new Event("input", { bubbles: true })); f.focus();
});

/* ---------- read aloud ---------- */
export const canSpeak = () => "speechSynthesis" in window;
export function speak(text) {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plainMath(text).replace(/_{3,}/g, " blank "));
  u.rate = 0.9;
  const v = speechSynthesis.getVoices().find((x) => /en[-_](NG|GB)/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
export const questionSpeech = (q) => [q.question, ...(q.options || []).map((o, i) => `${LET[i]}: ${o}`)].join(". ");

/* ---------- CSV that is safe to open in Excel ---------- */
export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stops "=HYPERLINK(...)" nicknames running as formulas
  return `"${s.replace(/"/g, '""')}"`;
}
export function downloadFile(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Confetti burst for good results.
let confRAF = 0;
export function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let c = document.getElementById("confetti");
  if (!c) { c = document.createElement("canvas"); c.id = "confetti"; document.body.appendChild(c); }
  c.hidden = false;
  const x = c.getContext("2d"), dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = ["#DD4F3A", "#2D6BDB", "#C98A06", "#15917E", "#FFE15A"];
  const ps = Array.from({ length: 170 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 15, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4, c: cols[(Math.random() * 5) | 0], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3 }));
  const t0 = performance.now();
  const step = (t) => {
    x.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) { p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore(); }
    if (t - t0 < 3200) confRAF = requestAnimationFrame(step); else c.hidden = true;
  };
  cancelAnimationFrame(confRAF); confRAF = requestAnimationFrame(step);
}

// "Share on WhatsApp": most teachers send links to class groups this way.
// wa.me opens the app on phones and WhatsApp Web on computers.
export const waLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const waButton = (text, label = "Share on WhatsApp", cls = "btn") => `<a class="${cls} wa" href="${waLink(text)}" target="_blank" rel="noopener">${label}</a>`;
