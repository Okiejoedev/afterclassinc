// Class lists (rosters): admission / matric numbers and names, so graded
// tests have one attempt per student and results carry real names.
import { sb, q, rpc } from "./sb.js";
import { $, esc, toast, ask, fmtDate, waButton, loadScript } from "./ui.js";
import { ctx, frame, words } from "./shell.js";

// Words and examples for each section's "classes" page.
const INTRO = {
  primary: { label: "Classes & star chart", text: "Add your class and its pupils once. Award stars for good work and behaviour, and pick the class when you run a game or test so results show real names. Pupils don't need accounts.", example: "e.g. Primary 4 Blue, Basic 2A" },
  secondary: { label: "Rosters", text: "Add a class once, then pick it when you start a test. Students join with their admission number, so each gets one attempt and results show real names.", example: "e.g. JSS 2A, SS 3 Science" },
  higher: { label: "Courses", text: "Add each course you teach. Students join with the course code and their matric number, so each gets one attempt at CA tests and results show real names.", example: "e.g. BIO 201 Cell Biology (2026/27)" },
};
export async function classesView() {
  const w = words(), sec = ctx.section, intro = INTRO[sec];
  const v = frame("classes", `<div class="page-h"><div><span class="label">${intro.label}</span><h1>${w.Classes}</h1>
    <p class="muted" style="margin:4px 0 0">${intro.text}</p></div></div>
    <form class="panel" id="newClass" style="grid-template-columns:minmax(0,1fr) auto;align-items:end">
      <div class="field"><label class="label" for="cName">New ${w.klass}</label><input id="cName" type="text" maxlength="80" placeholder="${intro.example}"></div>
      <button class="btn primary" type="submit">Create ${w.klass}</button></form>
    <div id="list"><p class="muted">Loading…</p></div>`);
  const sel = (cols) => q(sb.from("classes").select(cols).eq("owner_id", ctx.user.id).order("name"));
  const rows = await sel("id,name,created_at,join_code,students(count)").catch(() => sel("id,name,created_at,students(count)"));
  $("#list", v).innerHTML = rows.length ? `<div class="grid-cards">${rows.map((c) => `<a class="qcard" href="#/class/${c.id}" style="text-decoration:none;color:inherit"><h3>${esc(c.name)}</h3>
      <div class="meta"><span class="num">${c.students?.[0]?.count ?? 0} ${w.learners}</span><span>Created ${fmtDate(c.created_at)}</span></div>
      ${c.join_code && sec !== "primary" ? `<div class="meta">${w.Klass} code <span class="code-pill" style="cursor:inherit">${esc(c.join_code)}</span></div>` : ""}</a>`).join("")}</div>`
    : `<div class="empty">No ${w.classes.toLowerCase()} yet. Create one above, then paste names from Excel or your register.</div>`;
  $("#newClass", v).onsubmit = async (e) => {
    e.preventDefault();
    const name = $("#cName", v).value.trim(); if (!name) return;
    try {
      // Young pupils don't see rankings: primary classes start with the leaderboard off.
      const row = sec === "primary" ? { name, leaderboard: false } : { name };
      const c = await q(sb.from("classes").insert(row).select("id").single()).catch(() => q(sb.from("classes").insert({ name }).select("id").single()));
      location.hash = "#/class/" + c.id;
    }
    catch (err) { toast(err.message, true); }
  };
}

// "ADM001, Okafor Adaeze" / "ADM001<TAB>Okafor Adaeze" / "Okafor Adaeze, ADM001" (Excel copy works)
export function parseRoster(text) {
  const out = [], seen = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    let parts = line.split(/\t|,|;/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) {
      // no separator: "MAT 19/0045 Nwosu Chidi" or "Nwosu Chidi MAT/19/0045"
      const t = line.split(/\s+/), lastNum = t.slice(0, 3).map((x) => /\d/.test(x)).lastIndexOf(true);
      if (lastNum >= 0 && lastNum < t.length - 1) parts = [t.slice(0, lastNum + 1).join(""), t.slice(lastNum + 1).join(" ")];
      else { const m = line.match(/^(.+?)\s+(\S*\d\S*)$/); if (!m) continue; parts = [m[1], m[2]]; }
    }
    if (/^(s\/?n|no\.?|number|adm|admission|matric|reg)/i.test(parts[0]) && !/\d/.test(parts[0])) continue; // header row
    if (/^\d{1,3}$/.test(parts[0]) && parts.length >= 3) parts = parts.slice(1); // leading serial number column
    let [a, b] = parts;
    if (!/\d/.test(a) && /\d/.test(b)) [a, b] = [b, a]; // name first
    const no = a.replace(/\s+/g, ""), name = parts.slice(1).length > 1 && /\d/.test(parts[0]) ? parts.slice(1).join(" ") : b;
    if (!no || !name || seen.has(no.toLowerCase())) continue;
    seen.add(no.toLowerCase());
    out.push({ student_no: no.slice(0, 40), full_name: name.replace(/\s+/g, " ").slice(0, 80) });
  }
  return out;
}

// Primary rosters are often names only: number them P001, P002…
function parseNames(text, existing) {
  let n = existing;
  return String(text).split(/\r?\n/).map((l) => l.trim().replace(/^\d+[.)]\s*/, "")).filter((l) => l && !/\d{2,}/.test(l))
    .map((name) => ({ student_no: "P" + String(++n).padStart(3, "0"), full_name: name.replace(/\s+/g, " ").slice(0, 80) }));
}

export async function classView(id) {
  const w = words(), sec = ctx.section, primary = sec === "primary";
  const v = frame("classes", `<p class="muted">Loading…</p>`);
  const cls = await q(sb.from("classes").select("*").eq("id", id).maybeSingle());
  if (!cls) { v.innerHTML = `<div class="notice">Class not found. <a href="#/classes">Back</a></div>`; return; }
  const students = await q(sb.from("students").select("*").eq("class_id", id).order("full_name"));
  const hasStars = students.length ? "stars" in students[0] : true;   // older database: no star chart yet
  v.innerHTML = `
    <div class="page-h"><div><a href="#/classes" style="font-size:14px">← ${w.Classes}</a><h1>${esc(cls.name)}</h1><p class="muted" style="margin:4px 0 0">${students.length} ${w.learners}${students.some((s) => s.user_id) ? ` · ${students.filter((s) => s.user_id).length} registered` : ""}</p></div>
      <div class="row"><button class="btn" id="rename" type="button">Rename</button><button class="btn ghost danger" id="delClass" type="button">Delete ${w.klass}</button></div></div>
    ${cls.join_code && !primary ? `<section class="panel" style="grid-template-columns:auto minmax(0,1fr);align-items:center">
      <button class="code-pill" id="code" type="button" style="font-size:26px;padding:12px 16px" title="Copy code">${esc(cls.join_code)}</button>
      <div><b>${w.Klass} code</b><p class="muted" style="margin:2px 0 0;font-size:14px">${w.Learners} register on the home page (${esc(new URL("../", location.href).href)}) and enter this code to join. They're added to the list below, and tests you set for this ${w.klass} show up on their dashboard.</p>
        <div class="row" style="margin-top:8px">${waButton(`Join our ${w.klass} "${cls.name}" on Afterclass: register at ${new URL("../", location.href).href} and enter the ${w.klass} code ${cls.join_code}.`, "Send code on WhatsApp", "btn sm")}</div></div></section>` : ""}
    ${cls.leaderboard !== undefined && !primary ? `<section class="panel"><div class="spread"><h2 style="font-size:20px">Leaderboard</h2>
      <label class="check"><input type="checkbox" id="lbShow" ${cls.leaderboard ? "checked" : ""}> Show top 10 to ${w.learners}</label></div>
      <p class="muted" style="margin:0;font-size:14px">Average score over this class's tests and live games (games with hidden scores don't count). ${w.Learners} see the top 10 and their own place, never the bottom of the list.</p>
      <div id="lbList"><p class="muted">Loading…</p></div></section>` : ""}
    ${primary ? `<section class="panel"><div class="spread"><h2 style="font-size:20px">📱 Class tablet</h2><a class="btn sm" href="../kids/?board=1" target="_blank" rel="noopener">Learning Corner on the board</a></div>
      <p class="muted" style="margin:0;font-size:14px">Pupils don't type codes or passwords. Open the class-tablet link once on each tablet or phone the class shares. After that, each pupil just taps their own picture and plays reading, maths, science, story and drawing games, all read aloud. Stars they earn land on the star chart below, and you see their progress here.</p>
      <div id="tabletBox">${cls.device_token !== undefined ? `<button class="btn primary" id="tabletGo" type="button" style="justify-self:start">${cls.device_token ? "Show the class-tablet link" : "Set up a class tablet"}</button>` : `<p class="muted" style="margin:0">Class tablets need the latest database update (run supabase/schema.sql).</p>`}</div></section>
      <section class="panel"><h2 style="font-size:20px">Learning progress</h2><div id="progBox"><p class="muted">Loading…</p></div></section>` : ""}
    <div class="bench">
      <section class="panel"><h2 style="font-size:20px">Add ${w.learners}</h2>
        <p class="muted" style="margin:0;font-size:14px">${primary ? "Paste one pupil's name per line (or number and name). You can copy straight from Excel or your register." : `Paste one per line: ${w.number} and full name. You can copy two columns straight from Excel or Google Sheets.`}</p>
        <textarea id="paste" rows="10" placeholder="${primary ? "Okafor Adaeze&#10;Bello Musa&#10;Adeyemi Tolu" : sec === "higher" ? "BIO/22/0145, Okafor Adaeze&#10;BIO/22/0146, Bello Musa&#10;BIO/22/0147, Adeyemi Tolu" : "ADM/2024/001, Okafor Adaeze&#10;ADM/2024/002, Bello Musa&#10;ADM/2024/003, Adeyemi Tolu"}"></textarea>
        <div class="row"><label class="btn sm" for="csv">Open CSV file</label><input id="csv" type="file" accept=".csv,.txt" hidden><span class="muted" id="pv" style="font-size:13px"></span></div>
        <button class="btn primary" id="add" type="button" style="justify-self:start">Add to ${w.klass}</button>
      </section>
      <section class="panel"><div class="spread"><h2 style="font-size:20px">${primary && hasStars ? "Star chart" : "On the list"}</h2>${primary && hasStars && students.some((s) => s.stars) ? `<button class="btn sm ghost" id="resetStars" type="button">Start a new term</button>` : ""}</div>
        ${students.length ? `<div class="scroll-x"><table class="data"><thead><tr>${primary ? "" : `<th>${sec === "higher" ? "Matric no." : "Number"}</th>`}<th>Name</th>${primary && hasStars ? "<th>Stars</th>" : ""}<th></th></tr></thead><tbody>
          ${(primary && hasStars ? students.slice().sort((a, b) => b.stars - a.stars || a.full_name.localeCompare(b.full_name)) : students).map((s) => `<tr data-sid="${s.id}">${primary ? "" : `<td class="num">${esc(s.student_no)}</td>`}<td>${esc(s.full_name)}${s.user_id ? ` <span class="chip live" title="Has a student account">REGISTERED</span>` : ""}</td>
            ${primary && hasStars ? `<td><div class="stars-cell"><button class="btn sm ghost" data-star="-1" type="button" aria-label="Take a star from ${esc(s.full_name)}">−</button><span class="stars num" aria-live="polite">★ ${s.stars}</span><button class="btn sm star-btn" data-star="1" type="button" aria-label="Give ${esc(s.full_name)} a star">+★</button></div></td>` : ""}
            <td><button class="btn sm ghost danger" data-del type="button">Remove</button></td></tr>`).join("")}</tbody></table></div>`
          : `<div class="empty">Nobody yet. Paste your list on the left.</div>`}
      </section>
    </div>`;
  if (primary) { tabletPanel(v, cls); progressPanel(v, cls, students); }
  $("#code", v)?.addEventListener("click", () => navigator.clipboard?.writeText(cls.join_code).then(() => toast("Class code copied"), () => {}));
  if (cls.leaderboard !== undefined && !primary) {   // primary classes have no leaderboard
    rpc("class_leaderboard", { p_class: id }).then((b) => {
      $("#lbList", v).innerHTML = b.top.length ? `<div class="scroll-x"><table class="data"><thead><tr><th>#</th><th>Name</th><th>Average</th><th>Taken</th></tr></thead><tbody>
        ${b.top.map((r) => `<tr><td class="num">${r.pos}</td><td>${esc(r.name)}</td><td class="num"><b>${r.avg}%</b></td><td class="num">${r.taken}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted" style="margin:0">No scores yet. Start a test or live game with this class list and the ranking appears here.</p>`;
    }, (err) => ($("#lbList", v).innerHTML = `<p class="status err">${esc(err.message)}</p>`));
    $("#lbShow", v).onchange = async (e) => {
      try { await q(sb.from("classes").update({ leaderboard: e.target.checked }).eq("id", id)); toast(e.target.checked ? `${w.Learners} can see the leaderboard` : "Leaderboard hidden from " + w.learners); }
      catch (err) { e.target.checked = !e.target.checked; toast(err.message, true); }
    };
  }
  const preview = () => {
    const text = $("#paste", v).value, r = parseRoster(text);
    const rows = primary && r.length < text.split(/\n/).filter((l) => l.trim()).length / 2 ? parseNames(text, students.length) : r;
    $("#pv", v).textContent = rows.length ? `${rows.length} ${w.learners} found` : ""; return rows;
  };
  $("#paste", v).oninput = preview;
  $("#csv", v).onchange = async (e) => { const f = e.target.files[0]; if (f) { $("#paste", v).value = await f.text(); preview(); } };
  $("#add", v).onclick = async () => {
    const rows = preview();
    if (!rows.length) return toast(primary ? "Paste at least one name" : "Paste at least one line: number, name", true);
    const existing = new Set(students.map((s) => s.student_no.toLowerCase()));
    const fresh = rows.filter((r) => !existing.has(r.student_no.toLowerCase())).map((r) => ({ ...r, class_id: id }));
    if (!fresh.length) return toast("Everyone in that list is already in the class", true);
    try { await q(sb.from("students").insert(fresh)); toast(`${fresh.length} added${rows.length > fresh.length ? `, ${rows.length - fresh.length} already on the list` : ""}`); classView(id); }
    catch (err) { toast(err.message, true); }
  };
  v.addEventListener("click", async (e) => {
    // Star chart: tap to give or take a star; saved straight away.
    const sb2 = e.target.closest("[data-star]");
    if (sb2) {
      const tr = sb2.closest("tr"), st = students.find((x) => x.id === tr.dataset.sid);
      const next = Math.max(0, (st.stars || 0) + Number(sb2.dataset.star));
      if (next === st.stars) return;
      try { await q(sb.from("students").update({ stars: next }).eq("id", st.id)); st.stars = next; tr.querySelector(".stars").textContent = `★ ${next}`; if (sb2.dataset.star === "1") tr.querySelector(".stars").classList.add("pop"); setTimeout(() => tr.querySelector(".stars")?.classList.remove("pop"), 400); }
      catch (err) { toast(err.message, true); }
      return;
    }
    if (!e.target.closest("[data-del]")) return;
    const sid = e.target.closest("tr").dataset.sid;
    if (!(await ask(`Remove this ${w.learner} from the ${w.klass}? Their past results stay.`, "Remove", true))) return;
    await q(sb.from("students").delete().eq("id", sid)); classView(id);
  });
  $("#resetStars", v)?.addEventListener("click", async () => {
    if (!(await ask("Start a new term? Every pupil's stars go back to 0.", "Reset stars", true))) return;
    try { await q(sb.from("students").update({ stars: 0 }).eq("class_id", id)); toast("Stars reset"); classView(id); } catch (err) { toast(err.message, true); }
  });
  $("#rename", v).onclick = async () => {
    const d = document.createElement("dialog");
    d.innerHTML = `<form method="dialog" class="dlg"><label class="label" for="rn">${w.Klass} name</label><input id="rn" type="text" value="${esc(cls.name)}" maxlength="80"><div class="row" style="justify-content:flex-end"><button class="btn" value="no">Cancel</button><button class="btn primary" value="yes">Save</button></div></form>`;
    document.body.appendChild(d); d.showModal();
    d.addEventListener("close", async () => {
      const name = d.querySelector("#rn").value.trim(); d.remove();
      if (d.returnValue === "yes" && name) { await q(sb.from("classes").update({ name }).eq("id", id)); classView(id); }
    });
  };
  $("#delClass", v).onclick = async () => {
    if (!(await ask(`Delete the ${w.klass} "${cls.name}" and its list? Past results stay.`, `Delete ${w.klass}`, true))) return;
    await q(sb.from("classes").delete().eq("id", id)); location.hash = "#/classes";
  };
}

/* ---------- Primary: class tablet link (pupils tap their picture, no codes) ---------- */
function tabletPanel(v, cls) {
  const box = $("#tabletBox", v);
  const show = async (fresh = false) => {
    let t;
    try { t = await rpc("class_device_link", { p_class: cls.id, p_new: fresh }); } catch (err) { return toast(err.message, true); }
    const url = new URL(`../kids/#t=${t}`, location.href).href;
    box.innerHTML = `<div class="tablet-link"><div id="tabQr" class="qr-box"></div><div style="display:grid;gap:10px;align-content:start">
      <ol style="margin:0;padding-left:20px;font-size:14px"><li>On the class tablet, scan this QR code with the camera, or open the link.</li><li>The tablet remembers the class. Add it to the home screen if you like.</li><li>Pupils tap their own picture, then choose a game.</li></ol>
      <input type="text" readonly value="${esc(url)}" id="tabUrl" aria-label="Class-tablet link" style="font-size:13px">
      <div class="row"><button class="btn sm" id="tabCopy" type="button">Copy link</button><a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">Open on this device</a>${waButton(`Class tablet for ${cls.name} (Afterclass Learning Corner). Open this on the tablet: ${url}`, "Send to my phone", "btn sm")}</div>
      <p class="muted" style="margin:0;font-size:13px">Keep this link with the class tablets: anyone with it can play as your pupils. Lost a tablet? <button class="btn sm ghost danger" id="tabNew" type="button">Make a new link</button> (every tablet then needs the new one).</p></div></div>`;
    $("#tabCopy", box).onclick = () => navigator.clipboard?.writeText(url).then(() => toast("Link copied"), () => $("#tabUrl", box).select());
    $("#tabNew", box).onclick = async () => { if (await ask("Make a new class-tablet link? Tablets using the old link will stop working until you open the new one on them.", "Make a new link", true)) show(true); };
    try { await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"); const qr = window.qrcode(0, "M"); qr.addData(url); qr.make(); $("#tabQr", box).innerHTML = `<img alt="QR code for the class tablet" src="${qr.createDataURL(5, 2)}">`; }
    catch { $("#tabQr", box).remove(); }
  };
  $("#tabletGo", v)?.addEventListener("click", () => show(false));
}

/* ---------- Primary: what each pupil has been practising (last 30 days) ---------- */
async function progressPanel(v, cls, students) {
  const box = $("#progBox", v);
  let rows;
  try { rows = await q(sb.from("pupil_activity").select("student_id,activity,subject,correct,total,stars,created_at").eq("class_id", cls.id).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(3000)); }
  catch { box.innerHTML = `<p class="muted" style="margin:0">Progress needs the latest database update (run supabase/schema.sql).</p>`; return; }
  if (!rows.length) { box.innerHTML = `<p class="muted" style="margin:0">Nothing yet. When pupils play on the class tablet, you'll see here what each one practised, how they did, and which subject needs more practice.</p>`; return; }
  const { ACTS, SUBJECTS } = await import("./kids/acts.js");
  const SUBJ = Object.fromEntries(SUBJECTS.map((s) => [s.id, s.name])); SUBJ.games = "Games"; SUBJ.english ||= "Letters & words";
  const title = (id) => ACTS[id]?.title || (id.startsWith("story-") ? "Story" : id.startsWith("memory-") ? "Memory pairs" : id.startsWith("trace-") ? "Tracing" : id);
  const by = new Map(students.map((s) => [s.id, { s, n: 0, ok: 0, tot: 0, subj: {}, last: null }]));
  for (const r of rows) {
    const p = by.get(r.student_id); if (!p) continue;
    p.n++; p.ok += r.correct; p.tot += r.total; p.last ||= r.created_at;
    const k = r.subject || "games"; (p.subj[k] ||= { ok: 0, tot: 0 }); p.subj[k].ok += r.correct; p.subj[k].tot += r.total;
  }
  const pct = (a, b) => b ? Math.round((100 * a) / b) : 0;
  const list = [...by.values()].sort((a, b) => b.n - a.n || a.s.full_name.localeCompare(b.s.full_name));
  const best = (p, dir) => { const e = Object.entries(p.subj).filter(([k, x]) => x.tot >= 5 && k !== "games"); if (!e.length) return ""; e.sort((a, b) => dir * (pct(a[1].ok, a[1].tot) - pct(b[1].ok, b[1].tot))); const [k, x] = e[0]; return `${esc(SUBJ[k] || k)} <span class="muted">${pct(x.ok, x.tot)}%</span>`; };
  box.innerHTML = `<p class="muted" style="margin:0;font-size:14px">Last 30 days on the class tablet. "Right first time" counts answers before any second try.</p>
    <div class="scroll-x"><table class="data"><thead><tr><th>Pupil</th><th>Games played</th><th>Right first time</th><th>Strongest</th><th>Needs practice</th><th>Last played</th></tr></thead><tbody>
    ${list.map((p) => `<tr><td>${esc(p.s.avatar || "")} ${esc(p.s.full_name)}</td><td class="num">${p.n}</td><td class="num">${p.tot ? `<b>${pct(p.ok, p.tot)}%</b>` : "–"}</td><td>${best(p, -1)}</td><td>${p.n ? best(p, 1) : `<span class="muted">hasn't played yet</span>`}</td><td>${p.last ? esc(fmtDate(p.last)) : ""}</td></tr>`).join("")}</tbody></table></div>
    <details><summary class="muted" style="cursor:pointer">Latest activities</summary><ul class="todo" style="margin-top:8px">${rows.slice(0, 15).map((r) => `<li><div><b>${esc(by.get(r.student_id)?.s.full_name || "")}</b> · ${esc(title(r.activity))} · ${r.correct}/${r.total} · ${"★".repeat(r.stars)}<div class="muted" style="font-size:13px">${esc(fmtDate(r.created_at))}</div></div></li>`).join("")}</ul></details>`;
}
