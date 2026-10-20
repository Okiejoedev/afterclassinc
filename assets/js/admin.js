// Site owner's page: is the MVP being used, and what problems are people reporting?
// Only accounts listed in app_admins can open it (checked in the database).
import { rpc } from "./sb.js";
import { $, esc, toast, fmtDate } from "./ui.js";
import { frame } from "./shell.js";

export async function adminView() {
  const v = frame("admin", `<p class="muted">Loading…</p>`);
  let d;
  try { d = await rpc("admin_stats", {}); }
  catch (err) { v.innerHTML = `<div class="notice">${esc(err.message)}</div>`; return; }
  const tile = (label, val, sub = "") => `<div class="stat"><span class="label">${label}</span><b>${val}</b>${sub ? `<span class="muted" style="font-size:13px">${sub}</span>` : ""}</div>`;
  const open = d.feedback.filter((f) => !f.handled);
  v.innerHTML = `
    <div class="page-h"><div><span class="label">Site owner</span><h1>How Afterclass is doing</h1></div></div>
    <div class="stat-row">
      ${tile("Accounts", d.accounts, `+${d.signups_7d} this week`)}
      ${tile("Teachers", d.teachers)}
      ${tile("Students", d.students)}
      ${tile("Active teachers", d.active_teachers_7d, "ran a game or test this week")}
    </div>
    <div class="stat-row">
      ${tile("Quizzes", d.quizzes)}
      ${tile("Live games", d.live_games)}
      ${tile("Tests & assignments", d.assignments)}
      ${tile("Took part", d.players, `+${d.players_7d} this week`)}
    </div>
    <div class="dash">
      <section class="panel"><div class="spread"><h2 class="h2">Problem reports</h2><span class="chip ${open.length ? "warn" : ""}">${open.length} open</span></div>
        ${d.feedback.length ? `<ul class="todo" id="fb">${d.feedback.map((f) => `<li data-id="${f.id}" style="${f.handled ? "opacity:.55" : ""}"><div>
            <div style="white-space:pre-wrap">${esc(f.message)}</div>
            <div class="muted" style="font-size:13px">${esc(fmtDate(f.at))}${f.email ? " · " + esc(f.email) : ""}${f.contact ? " · reply to: <b>" + esc(f.contact) + "</b>" : ""}${f.page ? " · on " + esc(f.page) : ""}</div></div>
            <button class="btn sm ${f.handled ? "ghost" : ""}" data-done="${f.handled ? 0 : 1}" type="button">${f.handled ? "Reopen" : "Mark done"}</button></li>`).join("")}</ul>`
          : `<p class="muted" style="margin:0">No reports yet. People send them with “Report a problem” at the bottom of every page.</p>`}
      </section>
      <aside class="dash-side"><section class="panel"><h2 class="h2">Last 14 days</h2>
        <div class="scroll-x"><table class="data"><thead><tr><th>Day</th><th>Sign-ups</th><th>Games &amp; tests</th></tr></thead><tbody>
          ${d.by_day.slice().reverse().map((r) => `<tr><td>${esc(new Date(r.day).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }))}</td><td class="num">${r.signups}</td><td class="num">${r.sessions}</td></tr>`).join("")}</tbody></table></div>
        <p class="muted" style="margin:0;font-size:13px">${d.classes} class lists · ${d.schools} school accounts</p></section></aside>
    </div>`;
  $("#fb", v)?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-done]"); if (!b) return;
    try { await rpc("admin_feedback_done", { p_id: +b.closest("li").dataset.id, p_done: b.dataset.done === "1" }); adminView(); }
    catch (err) { toast(err.message, true); }
  });
}
