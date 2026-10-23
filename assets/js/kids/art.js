// Pictures for the Learning Corner, drawn in code so they load instantly and work offline.
// Mbe the Tortoise is our own mascot, after the clever tortoise of Nigerian folk tales
// (Mbe in Igbo, Ìjàpá in Yoruba, Kunkuru in Hausa). Everything else is simple shapes;
// everyday objects use emoji, which every phone draws as a cartoon.

/* ---------- Mbe the Tortoise ---------- */
// mood: "happy" | "cheer" | "think" | "oops" | "wave" | "sleep"
export function mbe(mood = "happy", size = 140) {
  const mouth = {
    happy: `<path d="M84 74 q8 8 16 0" stroke="#3B2412" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    cheer: `<path d="M82 72 q10 14 20 0 z" fill="#7A2E14" stroke="#3B2412" stroke-width="2.5" stroke-linejoin="round"/>`,
    think: `<path d="M86 76 h12" stroke="#3B2412" stroke-width="3" stroke-linecap="round"/>`,
    oops: `<ellipse cx="92" cy="77" rx="5" ry="6" fill="#7A2E14" stroke="#3B2412" stroke-width="2"/>`,
    wave: `<path d="M84 74 q8 8 16 0" stroke="#3B2412" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    sleep: `<path d="M86 76 q6 4 12 0" stroke="#3B2412" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  }[mood] || "";
  const eyes = mood === "sleep"
    ? `<path d="M80 60 q5 4 10 0 M96 60 q5 4 10 0" stroke="#3B2412" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<circle cx="84" cy="60" r="6.5" fill="#fff"/><circle cx="102" cy="60" r="6.5" fill="#fff"/><circle cx="${mood === "think" ? 86 : 85}" cy="${mood === "think" ? 58 : 61}" r="3.4" fill="#1F1B2E"/><circle cx="${mood === "think" ? 104 : 103}" cy="${mood === "think" ? 58 : 61}" r="3.4" fill="#1F1B2E"/>`;
  const arm = mood === "cheer" || mood === "wave"
    ? `<path d="M118 92 q18 -14 22 -34" stroke="#6E9F3A" stroke-width="11" fill="none" stroke-linecap="round"/>${mood === "cheer" ? `<path d="M34 96 q-16 -12 -18 -32" stroke="#6E9F3A" stroke-width="11" fill="none" stroke-linecap="round"/>` : ""}`
    : mood === "think" ? `<path d="M116 98 q10 -10 -2 -24" stroke="#6E9F3A" stroke-width="10" fill="none" stroke-linecap="round"/>` : "";
  const extra = mood === "sleep" ? `<text x="120" y="34" font-size="20" font-weight="700" fill="#23367E">z z</text>`
    : mood === "think" ? `<text x="124" y="40" font-size="26" font-weight="800" fill="#E3A835">?</text>`
    : mood === "cheer" ? `<path d="M128 18 l3 7 7 1 -5 5 1 7 -6 -4 -6 4 1 -7 -5 -5 7 -1z" fill="#E3A835"/><path d="M20 30 l2 5 5 1 -4 3 1 5 -4 -3 -4 3 1 -5 -4 -3 5 -1z" fill="#E3A835"/>` : "";
  return `<svg class="mbe mbe-${mood}" width="${size}" height="${size}" viewBox="0 0 160 150" role="img" aria-label="Mbe the tortoise">
    <ellipse cx="78" cy="138" rx="58" ry="7" fill="#000" opacity=".12"/>
    <path d="M30 126 q-4 10 6 12 h14 q6 -2 4 -12z M98 126 q-4 10 6 12 h14 q6 -2 4 -12z" fill="#6E9F3A" stroke="#3E6420" stroke-width="2"/>
    ${arm}
    <path d="M14 122 q4 -66 66 -70 q60 4 64 70 z" fill="#B9512B" stroke="#7A2E14" stroke-width="3"/>
    <path d="M26 120 q6 -52 54 -56 q48 4 52 56" fill="none" stroke="#E3A835" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round"/>
    <circle cx="80" cy="92" r="13" fill="none" stroke="#E3A835" stroke-width="3"/><circle cx="80" cy="92" r="4" fill="#E3A835"/>
    <circle cx="48" cy="104" r="9" fill="none" stroke="#F5EEE2" stroke-width="2.5"/><circle cx="112" cy="104" r="9" fill="none" stroke="#F5EEE2" stroke-width="2.5"/>
    <path d="M56 78 l8 -10 M104 78 l-8 -10" stroke="#F5EEE2" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="10" y="116" width="140" height="12" rx="6" fill="#23367E"/>
    <path d="M22 122 h116" stroke="#E3A835" stroke-width="2" stroke-dasharray="6 6"/>
    <path d="M68 40 q24 -22 46 2 q8 22 -8 40 q-14 10 -30 0 q-14 -16 -8 -42z" fill="#8CBF4F" stroke="#3E6420" stroke-width="3"/>
    ${eyes}${mouth}<circle cx="76" cy="70" r="4" fill="#E58C6A" opacity=".55"/><circle cx="110" cy="70" r="4" fill="#E58C6A" opacity=".55"/>${extra}
  </svg>`;
}

/* ---------- pupils' own pictures (animals they choose) ---------- */
export const AVATARS = ["🦁", "🐘", "🦒", "🐢", "🐐", "🐓", "🐟", "🦋", "🐝", "🐒", "🦓", "🐊", "🦜", "🐇", "🐈", "🐕", "🐄", "🐑", "🦉", "🐸", "🦔", "🐞", "🦩", "🐬"];
export const avatarFor = (p, i = 0) => p.avatar || AVATARS[(hash(p.id || p.name || "") + i) % AVATARS.length];
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

/* ---------- maths pictures ---------- */
// An analogue clock. minutes 0–59.
export function clock(h, m, size = 220) {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i * 6 - 90) * Math.PI / 180, big = i % 5 === 0, r1 = big ? 82 : 87;
    return `<line x1="${100 + r1 * Math.cos(a)}" y1="${100 + r1 * Math.sin(a)}" x2="${100 + 92 * Math.cos(a)}" y2="${100 + 92 * Math.sin(a)}" stroke="#1F1B2E" stroke-width="${big ? 3 : 1}"/>`;
  }).join("");
  const nums = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1, a = (n * 30 - 90) * Math.PI / 180;
    return `<text x="${100 + 70 * Math.cos(a)}" y="${100 + 70 * Math.sin(a) + 7}" text-anchor="middle" font-size="20" font-weight="700" fill="#1F1B2E">${n}</text>`;
  }).join("");
  const ha = ((h % 12) * 30 + m * 0.5 - 90) * Math.PI / 180, ma = (m * 6 - 90) * Math.PI / 180;
  return `<svg width="${size}" height="${size}" viewBox="0 0 200 200" role="img" aria-label="A clock">
    <circle cx="100" cy="100" r="96" fill="#FFFCF6" stroke="#23367E" stroke-width="7"/>${ticks}${nums}
    <line x1="100" y1="100" x2="${100 + 46 * Math.cos(ha)}" y2="${100 + 46 * Math.sin(ha)}" stroke="#B9512B" stroke-width="8" stroke-linecap="round"/>
    <line x1="100" y1="100" x2="${100 + 74 * Math.cos(ma)}" y2="${100 + 74 * Math.sin(ma)}" stroke="#23367E" stroke-width="5" stroke-linecap="round"/>
    <circle cx="100" cy="100" r="6" fill="#E3A835" stroke="#1F1B2E" stroke-width="2"/></svg>`;
}

// A flat shape for "name the shape".
export function shape(name, size = 150, fill = "#E3A835") {
  const s = `fill="${fill}" stroke="#1F1B2E" stroke-width="4" stroke-linejoin="round"`;
  const poly = (n, r = 62, rot = -90) => Array.from({ length: n }, (_, i) => { const a = (rot + i * 360 / n) * Math.PI / 180; return `${80 + r * Math.cos(a)},${80 + r * Math.sin(a)}`; }).join(" ");
  const body = {
    circle: `<circle cx="80" cy="80" r="62" ${s}/>`,
    square: `<rect x="22" y="22" width="116" height="116" ${s}/>`,
    rectangle: `<rect x="8" y="40" width="144" height="80" ${s}/>`,
    triangle: `<polygon points="${poly(3, 70, -90)}" ${s} transform="translate(0 10)"/>`,
    oval: `<ellipse cx="80" cy="80" rx="72" ry="46" ${s}/>`,
    pentagon: `<polygon points="${poly(5)}" ${s}/>`,
    hexagon: `<polygon points="${poly(6, 64, 0)}" ${s}/>`,
    octagon: `<polygon points="${poly(8, 64, 22.5)}" ${s}/>`,
    star: `<polygon points="${Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 28 : 70, a = (-90 + i * 36) * Math.PI / 180; return `${80 + r * Math.cos(a)},${84 + r * Math.sin(a)}`; }).join(" ")}" ${s}/>`,
    heart: `<path d="M80 136 C20 96 12 54 40 36 C58 26 74 36 80 50 C86 36 102 26 120 36 C148 54 140 96 80 136z" ${s}/>`,
    diamond: `<polygon points="80,8 146,80 80,152 14,80" ${s}/>`,
  }[name] || "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 160 160" role="img" aria-label="a shape">${body}</svg>`;
}

// A fraction picture: a circle cut into `parts`, `shaded` of them coloured.
export function fractionPie(shaded, parts, size = 170) {
  if (parts === 1) return `<svg width="${size}" height="${size}" viewBox="0 0 160 160"><circle cx="80" cy="80" r="70" fill="#E3A835" stroke="#1F1B2E" stroke-width="4"/></svg>`;
  const slices = Array.from({ length: parts }, (_, i) => {
    const a0 = (i / parts) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / parts) * 2 * Math.PI - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `<path d="M80 80 L${80 + 70 * Math.cos(a0)} ${80 + 70 * Math.sin(a0)} A70 70 0 ${large} 1 ${80 + 70 * Math.cos(a1)} ${80 + 70 * Math.sin(a1)} Z" fill="${i < shaded ? "#E3A835" : "#FFFCF6"}" stroke="#1F1B2E" stroke-width="4" stroke-linejoin="round"/>`;
  }).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 160 160" role="img" aria-label="${shaded} of ${parts} parts shaded">${slices}</svg>`;
}

// A bar cut into equal parts (for fractions of a length).
export function fractionBar(shaded, parts, width = 300) {
  const w = 280 / parts;
  return `<svg width="${width}" height="70" viewBox="0 0 300 70" role="img" aria-label="${shaded} of ${parts} parts shaded">${Array.from({ length: parts }, (_, i) =>
    `<rect x="${10 + i * w}" y="10" width="${w}" height="50" fill="${i < shaded ? "#2E7A4F" : "#FFFCF6"}" stroke="#1F1B2E" stroke-width="3"/>`).join("")}</svg>`;
}

// A ten-frame showing n (0–10) counters: how primary teachers show numbers to 10.
export function tenFrame(n, color = "#B9512B") {
  return `<svg width="250" height="104" viewBox="0 0 250 104" role="img" aria-label="${n} counters">${Array.from({ length: 10 }, (_, i) => {
    const x = 6 + (i % 5) * 48, y = 6 + Math.floor(i / 5) * 48;
    return `<rect x="${x}" y="${y}" width="46" height="46" fill="#FFFCF6" stroke="#23367E" stroke-width="3"/>${i < n ? `<circle cx="${x + 23}" cy="${y + 23}" r="16" fill="${color}"/>` : ""}`;
  }).join("")}</svg>`;
}

// Tens and ones: bundles of 10 sticks and loose sticks.
export function tensOnes(tens, ones) {
  const bundle = (x) => `<g transform="translate(${x} 0)">${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 4}" y="6" width="3" height="96" rx="1.5" fill="#C98A2B"/>`).join("")}<rect x="-2" y="44" width="44" height="10" rx="3" fill="#B9512B"/></g>`;
  const w = tens * 54 + ones * 12 + 20;
  return `<svg width="${Math.min(w, 520)}" height="110" viewBox="0 0 ${w} 110" role="img" aria-label="${tens} tens and ${ones} ones">${Array.from({ length: tens }, (_, i) => bundle(6 + i * 54)).join("")}
    ${Array.from({ length: ones }, (_, i) => `<rect x="${tens * 54 + 14 + i * 12}" y="6" width="4" height="96" rx="2" fill="#C98A2B"/>`).join("")}</svg>`;
}

// Naira notes as simple labelled cards (not copies of the real notes).
const NOTE_COLOR = { 5: "#9C6FB6", 10: "#C0533A", 20: "#3E8F6A", 50: "#3C7DB8", 100: "#5B7FA6", 200: "#8C6A3C", 500: "#4B8B8B", 1000: "#8A5A44" };
export const naira = (v) => `<span class="note" style="--c:${NOTE_COLOR[v] || "#2E7A4F"}"><b>₦${v}</b></span>`;

// A row of pictures, wrapped in lines of five so children can count in fives.
export const many = (emoji, n, cls = "") => `<div class="many ${cls}">${Array.from({ length: n }, (_, i) => `<span${(i + 1) % 5 === 0 ? ' class="five"' : ""}>${emoji}</span>`).join("")}</div>`;

// A crossed-out picture (taking away).
export const gone = (emoji, n) => Array.from({ length: n }, () => `<span class="gone">${emoji}</span>`).join("");

// Colour swatch.
export const swatch = (hex, label = "") => `<span class="swatch" style="--sw:${hex}" aria-label="${label}"></span>`;

// Traffic light.
export function trafficLight(on) {
  const c = (k, col) => `<circle cx="40" cy="${{ red: 34, amber: 84, green: 134 }[k]}" r="20" fill="${on === k ? col : "#3a3a3a"}" stroke="#111" stroke-width="2"/>`;
  return `<svg width="80" height="170" viewBox="0 0 80 170" role="img" aria-label="traffic light"><rect x="10" y="6" width="60" height="158" rx="14" fill="#1F1B2E"/>${c("red", "#E04B3A")}${c("amber", "#F2B33D")}${c("green", "#3DBE5B")}</svg>`;
}

// The Nigerian flag: green, white, green in three upright bands.
export const flagNG = (w = 180) => `<svg width="${w}" height="${w * 2 / 3}" viewBox="0 0 3 2" role="img" aria-label="Flag of Nigeria"><rect width="1" height="2" fill="#008751"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#008751"/><rect width="3" height="2" fill="none" stroke="#1F1B2E" stroke-width=".04"/></svg>`;
