// Class lists (rosters): admission / matric numbers and names, so graded
// tests have one attempt per student and results carry real names.
import { sb, q } from "./sb.js";
import { $, esc, toast, ask, fmtDate } from "./ui.js";
import { ctx, frame, words } from "./shell.js";

export async function classesView() {
  const w = words();
  const v = frame("classes", `<div class="page-h"><div><span class="label">Rosters</span><h1>Class lists</h1>
    <p class="muted" style="margin:4px 0 0">Add a class once, then pick it when you start a test. ${w.Learners} join with their admission / matric number, so each gets one attempt and results show real names.</p></div></div>
    <form class="panel" id="newClass" style="grid-template-columns:minmax(0,1fr) auto;align-items:end">
      <div class="field"><label class="label" for="cName">New class</label><input id="cName" type="text" maxlength="80" placeholder="e.g. JSS 2A, SS 3 Science, BIO 201 (2026/27)"></div>
      <button class="btn primary" type="submit">Create class</button></form>
    <div id="list"><p class="muted">Loading…</p></div>`);
  const sel = (cols) => q(sb.from("classes").select(cols).eq("owner_id", ctx.user.id).order("name"));
  const rows = await sel("id,name,created_at,join_code,students(count)").catch(() => sel("id,name,created_at,students(count)"));
  $("#list", v).innerHTML = rows.length ? `<div class="grid-cards">${rows.map((c) => `<a class="qcard" href="#/class/${c.id}" style="text-decoration:none;color:inherit"><h3>${esc(c.name)}</h3>
      <div class="meta"><span class="num">${c.students?.[0]?.count ?? 0} ${w.learners}</span><span>Created ${fmtDate(c.created_at)}</span></div>
      ${c.join_code ? `<div class="meta">Class code <span class="code-pill" style="cursor:inherit">${esc(c.join_code)}</span></div>` : ""}</a>`).join("")}</div>`
    : `<div class="empty">No class lists yet. Create one above, then paste names from Excel or your register.</div>`;
  $("#newClass", v).onsubmit = async (e) => {
    e.preventDefault();
    const name = $("#cName", v).value.trim(); if (!name) return;
    try { const c = await q(sb.from("classes").insert({ name }).select("id").single()); location.hash = "#/class/" + c.id; }
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

export async function classView(id) {
  const w = words();
  const v = frame("classes", `<p class="muted">Loading…</p>`);
  const cls = await q(sb.from("classes").select("*").eq("id", id).maybeSingle());
  if (!cls) { v.innerHTML = `<div class="notice">Class not found. <a href="#/classes">Back</a></div>`; return; }
  const students = await q(sb.from("students").select("*").eq("class_id", id).order("full_name"));
  v.innerHTML = `
    <div class="page-h"><div><a href="#/classes" style="font-size:14px">← Class lists</a><h1>${esc(cls.name)}</h1><p class="muted" style="margin:4px 0 0">${students.length} ${w.learners}${students.some((s) => s.user_id) ? ` · ${students.filter((s) => s.user_id).length} registered` : ""}</p></div>
      <div class="row"><button class="btn" id="rename" type="button">Rename</button><button class="btn ghost danger" id="delClass" type="button">Delete class</button></div></div>
    ${cls.join_code ? `<section class="panel" style="grid-template-columns:auto minmax(0,1fr);align-items:center">
      <button class="code-pill" id="code" type="button" style="font-size:26px;padding:12px 16px" title="Copy code">${esc(cls.join_code)}</button>
      <div><b>Class code</b><p class="muted" style="margin:2px 0 0;font-size:14px">${w.Learners} register on the home page (${esc(new URL("../", location.href).href)}) and enter this code to join. They're added to the list below, and tests you set for this class show up on their dashboard.</p></div></section>` : ""}
    <div class="bench">
      <section class="panel"><h2 style="font-size:20px">Add ${w.learners}</h2>
        <p class="muted" style="margin:0;font-size:14px">Paste one per line: admission / matric number and full name. You can copy two columns straight from Excel or Google Sheets.</p>
        <textarea id="paste" rows="10" placeholder="ADM/2024/001, Okafor Adaeze&#10;ADM/2024/002, Bello Musa&#10;ADM/2024/003, Adeyemi Tolu"></textarea>
        <div class="row"><label class="btn sm" for="csv">Open CSV file</label><input id="csv" type="file" accept=".csv,.txt" hidden><span class="muted" id="pv" style="font-size:13px"></span></div>
        <button class="btn primary" id="add" type="button" style="justify-self:start">Add to class</button>
      </section>
      <section class="panel"><h2 style="font-size:20px">On the list</h2>
        ${students.length ? `<div class="scroll-x"><table class="data"><thead><tr><th>Number</th><th>Name</th><th></th></tr></thead><tbody>
          ${students.map((s) => `<tr data-sid="${s.id}"><td class="num">${esc(s.student_no)}</td><td>${esc(s.full_name)}${s.user_id ? ` <span class="chip live" title="Has a student account">REGISTERED</span>` : ""}</td><td><button class="btn sm ghost danger" data-del type="button">Remove</button></td></tr>`).join("")}</tbody></table></div>`
          : `<div class="empty">Nobody yet. Paste your list on the left.</div>`}
      </section>
    </div>`;
  $("#code", v)?.addEventListener("click", () => navigator.clipboard?.writeText(cls.join_code).then(() => toast("Class code copied"), () => {}));
  const preview = () => { const r = parseRoster($("#paste", v).value); $("#pv", v).textContent = r.length ? `${r.length} ${w.learners} found` : ""; return r; };
  $("#paste", v).oninput = preview;
  $("#csv", v).onchange = async (e) => { const f = e.target.files[0]; if (f) { $("#paste", v).value = await f.text(); preview(); } };
  $("#add", v).onclick = async () => {
    const rows = preview();
    if (!rows.length) return toast("Paste at least one line: number, name", true);
    const existing = new Set(students.map((s) => s.student_no.toLowerCase()));
    const fresh = rows.filter((r) => !existing.has(r.student_no.toLowerCase())).map((r) => ({ ...r, class_id: id }));
    if (!fresh.length) return toast("Everyone in that list is already in the class", true);
    try { await q(sb.from("students").insert(fresh)); toast(`${fresh.length} added${rows.length > fresh.length ? `, ${rows.length - fresh.length} already on the list` : ""}`); classView(id); }
    catch (err) { toast(err.message, true); }
  };
  v.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-del]")) return;
    const sid = e.target.closest("tr").dataset.sid;
    if (!(await ask("Remove this student from the class list? Their past results stay.", "Remove", true))) return;
    await q(sb.from("students").delete().eq("id", sid)); classView(id);
  });
  $("#rename", v).onclick = async () => {
    const d = document.createElement("dialog");
    d.innerHTML = `<form method="dialog" class="dlg"><label class="label" for="rn">Class name</label><input id="rn" type="text" value="${esc(cls.name)}" maxlength="80"><div class="row" style="justify-content:flex-end"><button class="btn" value="no">Cancel</button><button class="btn primary" value="yes">Save</button></div></form>`;
    document.body.appendChild(d); d.showModal();
    d.addEventListener("close", async () => {
      const name = d.querySelector("#rn").value.trim(); d.remove();
      if (d.returnValue === "yes" && name) { await q(sb.from("classes").update({ name }).eq("id", id)); classView(id); }
    });
  };
  $("#delClass", v).onclick = async () => {
    if (!(await ask(`Delete the class "${cls.name}" and its list? Past results stay.`, "Delete class", true))) return;
    await q(sb.from("classes").delete().eq("id", id)); location.hash = "#/classes";
  };
}
