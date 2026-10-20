// School tab: the heading printed on exam papers, school accounts (shared logo,
// members, Head of Department reviews) and data-protection settings.
import { sb, q, rpc } from "./sb.js";
import { $, esc, toast, ask, fmtDate } from "./ui.js";
import { ctx } from "./shell.js";

const KINDS = [["primary", "Primary school"], ["secondary", "Secondary school"], ["university", "University"], ["polytechnic", "Polytechnic / monotechnic"], ["college", "College (education, nursing, health, agriculture…)"], ["training", "Training / webinars / church / NGO"]];

// The heading to use on papers: the school account if the teacher has one,
// otherwise their personal details.
export async function loadHeader() {
  const { data: auth } = await sb.auth.getUser();
  const me = auth.user?.id;
  const member = me ? await q(sb.from("school_members").select("*").eq("user_id", me).maybeSingle()).catch(() => null) : null;
  if (member) {
    const school = await q(sb.from("schools").select("*").eq("id", member.school_id).maybeSingle());
    return { school, member, profile: school };
  }
  const p = me ? await q(sb.from("school_profiles").select("*").maybeSingle()).catch(() => null) : null;
  return { school: null, member: null, profile: p || { name: "", address: "", motto: "", contact: "", logo: null, kind: "secondary", retention_days: 365 } };
}

export async function schoolView(frame) {
  const v = frame("school", `<p class="muted">Loading…</p>`);
  const { data: auth } = await sb.auth.getUser();
  const head = await loadHeader();
  const { school, member } = head, p = head.profile;
  const isAdmin = !school || member.role === "admin";
  const members = school ? await q(sb.from("school_members").select("*").eq("school_id", school.id).order("joined_at")) : [];

  v.innerHTML = `
    <div class="page-h"><div><span class="label">${school ? "School account" : "Your details"}</span><h1>${school ? esc(school.name) : "School details"}</h1>
      ${school ? `<p class="muted" style="margin:4px 0 0">You are ${member.role === "admin" ? "an admin" : member.role === "hod" ? `HOD for ${esc(member.department || "all departments")}` : "a teacher"} in this school.</p>` : ""}</div></div>
    <div class="bench">
      <form class="panel" id="schoolForm">
        <h2 style="font-size:20px">Heading on exam papers</h2>
        ${!isAdmin ? `<p class="notice" style="margin:0">Only the school admin can change these details.</p>` : ""}
        <div class="field"><label class="label" for="sName">School name</label><input id="sName" type="text" maxlength="120" placeholder="e.g. Kings College, Lagos" value="${esc(p.name)}"></div>
        <div class="field"><label class="label" for="sAddr">Address</label><input id="sAddr" type="text" maxlength="200" value="${esc(p.address)}"></div>
        <div class="field"><label class="label" for="sMotto">Motto (optional)</label><input id="sMotto" type="text" maxlength="120" value="${esc(p.motto)}"></div>
        <div class="field"><label class="label" for="sContact">Contact line (optional)</label><input id="sContact" type="text" maxlength="160" placeholder="e.g. Tel: 0803 000 0000 · info@school.edu.ng" value="${esc(p.contact)}"></div>
        <div class="field"><label class="label" for="sKind">Type of institution</label><select id="sKind">${KINDS.map(([k, l]) => `<option value="${k}" ${p.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select>
          <small class="muted">Sets sensible defaults: longer timers and no public rankings for primary, matric numbers and course codes for universities, "participants" for webinars.</small></div>
        <div class="field"><span class="label">Logo or crest</span>
          <div class="row"><div id="logoBox" class="logo-box">${p.logo ? `<img src="${p.logo}" alt="School logo">` : `<span class="muted" style="font-size:12px">No logo</span>`}</div>
          <label class="btn sm" for="logoFile">Upload logo</label><input id="logoFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>
          <button class="btn sm ghost danger" id="logoDel" type="button" ${p.logo ? "" : "hidden"}>Remove</button></div></div>
        ${school ? `<label class="check" style="justify-self:start"><input type="checkbox" id="sApproval" ${school.require_approval ? "checked" : ""}> Exams must be approved by an HOD or admin before printing</label>` : ""}
        <div class="row"><button class="btn primary" type="submit" ${isAdmin ? "" : "disabled"}>Save details</button></div>
      </form>
      <div style="display:grid;gap:20px;align-content:start">
        ${school ? schoolPanel(school, member, members, auth.user.id) : joinPanel()}
        <section class="panel"><h2 style="font-size:20px">Data protection</h2>
          <p class="muted" style="margin:0;font-size:14px">Results contain students' names. Under the Nigeria Data Protection Act, keep them only as long as you need them.</p>
          <div class="field"><label class="label" for="sRetain">Automatically delete my results older than</label>
            <select id="sRetain">${[90, 180, 365, 730, 1825].map((d) => `<option value="${d}" ${Number(p.retention_days || 365) === d ? "selected" : ""}>${d < 365 ? Math.round(d / 30) + " months" : d / 365 + (d === 365 ? " year" : " years")}</option>`).join("")}</select></div>
          <div class="row"><button class="btn sm" id="purge" type="button">Delete old results now</button><button class="btn sm ghost danger" id="wipe" type="button">Delete all my data</button></div>
          <p class="muted" style="margin:0;font-size:13px">Students can read the <a href="../privacy.html" target="_blank" rel="noopener">privacy notice</a> from the join page.</p>
        </section>
      </div>
    </div>`;

  // logo + details
  let logo = p.logo;
  $("#logoFile", v).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { logo = await shrinkImage(f, 360); $("#logoBox", v).innerHTML = `<img src="${logo}" alt="School logo">`; $("#logoDel", v).hidden = false; }
    catch { toast("That image could not be read. Try a PNG or JPG.", true); }
  };
  $("#logoDel", v).onclick = () => { logo = null; $("#logoBox", v).innerHTML = `<span class="muted" style="font-size:12px">No logo</span>`; $("#logoDel", v).hidden = true; };
  $("#schoolForm", v).onsubmit = async (e) => {
    e.preventDefault();
    const row = { name: $("#sName", v).value.trim(), address: $("#sAddr", v).value.trim(), motto: $("#sMotto", v).value.trim(), contact: $("#sContact", v).value.trim(), logo, kind: $("#sKind", v).value };
    try {
      if (school) await q(sb.from("schools").update({ ...row, require_approval: $("#sApproval", v).checked }).eq("id", school.id));
      else await q(sb.from("school_profiles").upsert({ owner_id: auth.user.id, ...row, retention_days: Number($("#sRetain", v).value), updated_at: new Date().toISOString() }));
      toast("Saved");
    } catch (err) { toast(err.message, true); }
  };
  $("#sRetain", v).onchange = async (e) => {
    const days = Number(e.target.value);
    try {
      if (school && member.role === "admin") await q(sb.from("schools").update({ retention_days: days }).eq("id", school.id));
      if (!school) await q(sb.from("school_profiles").upsert({ owner_id: auth.user.id, retention_days: days, name: p.name || "", updated_at: new Date().toISOString() }));
      toast("Saved");
    } catch (err) { toast(err.message, true); }
  };
  $("#purge", v).onclick = async () => {
    const days = Number($("#sRetain", v).value);
    if (!(await ask(`Delete all your games and assignments older than ${days} days, with their results?`, "Delete old results", true))) return;
    try { const n = await rpc("purge_old_sessions", { p_days: days }); toast(`${n} old session${n === 1 ? "" : "s"} deleted`); } catch (err) { toast(err.message, true); }
  };
  $("#wipe", v).onclick = async () => {
    if (!(await ask("Delete ALL your quizzes, classes, games and results? This cannot be undone.", "Delete everything", true))) return;
    try { await rpc("delete_my_data", {}); toast("All your data was deleted"); location.hash = "#/quizzes"; } catch (err) { toast(err.message, true); }
  };

  // school account actions
  v.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === "create") {
        const name = $("#cName", v).value.trim() || $("#sName", v).value.trim();
        if (!name) return toast("Type the school name", true);
        await rpc("create_school", { p_name: name, p_kind: $("#sKind", v).value, p_display_name: $("#cMe", v).value.trim() });
        toast("School account created"); ctx.head = await loadHeader(); schoolView(frame);
      }
      if (act === "join") {
        await rpc("join_school", { p_code: $("#jCode", v).value, p_display_name: $("#jName", v).value.trim(), p_department: $("#jDept", v).value.trim() });
        toast("You joined the school"); ctx.head = await loadHeader(); schoolView(frame);
      }
      if (act === "code") { const c = await rpc("new_join_code", {}); toast("New code: " + c); schoolView(frame); }
      if (act === "copycode") { try { await navigator.clipboard.writeText(school.join_code); toast("Code copied"); } catch { toast(school.join_code); } }
      if (act === "leave" && await ask("Leave this school account? Your quizzes stay with you.", "Leave school", true)) { await rpc("leave_school", {}); toast("You left the school"); ctx.head = await loadHeader(); schoolView(frame); }
      if (act === "save-member") {
        const row = b.closest("tr");
        await rpc("set_member", { p_user: row.dataset.uid, p_role: row.querySelector("select").value, p_department: row.querySelector("input").value });
        toast("Updated");
      }
      if (act === "remove-member" && await ask("Remove this teacher from the school?", "Remove", true)) {
        await q(sb.from("school_members").delete().eq("user_id", b.closest("tr").dataset.uid).eq("school_id", school.id)); schoolView(frame);
      }
    } catch (err) { toast(err.message, true); }
  });
}

function joinPanel() {
  return `<section class="panel"><h2 style="font-size:20px">Work with colleagues</h2>
    <p class="muted" style="margin:0;font-size:14px">A school account shares one logo and heading, and lets Heads of Department approve exam questions before printing.</p>
    <details><summary class="btn sm">Create a school account</summary><div style="display:grid;gap:10px;margin-top:12px">
      <div class="field"><label class="label" for="cName">School name</label><input id="cName" type="text" maxlength="120"></div>
      <div class="field"><label class="label" for="cMe">Your name as colleagues know you</label><input id="cMe" type="text" maxlength="60" placeholder="e.g. Mr Adebayo"></div>
      <button class="btn primary sm" data-act="create" type="button" style="justify-self:start">Create school account</button></div></details>
    <details><summary class="btn sm">Join with a school code</summary><div style="display:grid;gap:10px;margin-top:12px">
      <div class="field"><label class="label" for="jCode">School code (from your admin)</label><input id="jCode" type="text" maxlength="12" style="text-transform:uppercase"></div>
      <div class="opts"><div class="field"><label class="label" for="jName">Your name</label><input id="jName" type="text" maxlength="60"></div>
      <div class="field"><label class="label" for="jDept">Department</label><input id="jDept" type="text" maxlength="60" placeholder="e.g. Sciences"></div></div>
      <button class="btn primary sm" data-act="join" type="button" style="justify-self:start">Join school</button></div></details></section>`;
}

function schoolPanel(school, member, members, me) {
  const admin = member.role === "admin";
  return `<section class="panel"><div class="spread"><h2 style="font-size:20px">Teachers</h2>${admin ? `<span class="row"><span class="label">Join code</span><b class="num" style="font:800 18px var(--f-mono)">${esc(school.join_code)}</b><button class="btn sm" data-act="copycode" type="button">Copy</button><button class="btn sm ghost" data-act="code" type="button">New code</button></span>` : ""}</div>
    ${admin ? `<p class="muted" style="margin:0;font-size:14px">Colleagues join from their own School tab with this code. Make Heads of Department "HOD" and set their department; they review quizzes from that department.</p>` : ""}
    <div class="scroll-x"><table class="data"><thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Joined</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>
    ${members.map((m) => `<tr data-uid="${m.user_id}"><td><strong>${esc(m.display_name || m.email || "Teacher")}</strong><div class="muted" style="font-size:12px">${esc(m.email)}</div></td>
      <td>${admin ? `<select style="width:auto">${["teacher", "hod", "admin"].map((r) => `<option value="${r}" ${m.role === r ? "selected" : ""}>${r === "hod" ? "HOD" : r[0].toUpperCase() + r.slice(1)}</option>`).join("")}</select>` : esc(m.role === "hod" ? "HOD" : m.role)}</td>
      <td>${admin ? `<input type="text" value="${esc(m.department)}" style="min-width:120px">` : esc(m.department)}</td><td class="muted">${fmtDate(m.joined_at)}</td>
      ${admin ? `<td><div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="save-member" type="button">Save</button>${m.user_id !== me ? `<button class="btn sm ghost danger" data-act="remove-member" type="button">Remove</button>` : ""}</div></td>` : ""}</tr>`).join("")}
    </tbody></table></div>
    <button class="btn sm ghost danger" data-act="leave" type="button" style="justify-self:start">Leave this school</button></section>`;
}

// Resize an image so it stays small (logos, question pictures).
export function shrinkImage(file, max = 360, type = "image/png") {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k) || max; c.height = Math.round(img.height * k) || max;
      const x = c.getContext("2d");
      if (type === "image/jpeg") { x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let out = c.toDataURL(type, 0.85);
      if (type === "image/png" && out.length > 350000) out = c.toDataURL("image/jpeg", 0.85);
      res(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("bad image")); };
    img.src = url;
  });
}
