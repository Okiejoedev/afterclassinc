// "Report a problem": a short message to the site owner, readable on the admin page.
// Works signed in or not; records the page it was sent from so problems can be found.
import { rpc } from "./sb.js";
import { $, dialog, toast } from "./ui.js";

export function openFeedback() {
  const d = dialog(`<form id="fbForm" style="display:grid;gap:12px">
    <div class="spread"><h2 style="font-size:22px">Report a problem</h2><button class="btn ghost sm" type="button" data-x aria-label="Close">✕</button></div>
    <p class="muted" style="margin:0">Tell us what happened or what you need. Every message is read.</p>
    <div class="field"><label class="label" for="fbMsg">What happened?</label>
      <textarea id="fbMsg" rows="5" maxlength="2000" required placeholder="e.g. My students can't join with the PIN. They see 'No open game'."></textarea></div>
    <div class="field"><label class="label" for="fbContact">Phone or email for a reply (optional)</label>
      <input id="fbContact" type="text" maxlength="120" autocomplete="email"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" id="fbGo" type="submit">Send</button></div>
    <p class="status" id="fbStatus" role="status"></p></form>`);
  d.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => d.close()));
  $("#fbForm", d).onsubmit = async (e) => {
    e.preventDefault();
    $("#fbGo", d).disabled = true;
    try {
      await rpc("send_feedback", { p_message: $("#fbMsg", d).value, p_contact: $("#fbContact", d).value, p_page: (location.pathname + location.search + location.hash).slice(0, 200) });
      d.close(); toast("Thank you. Your message was sent.");
    } catch (err) {
      const st = $("#fbStatus", d); st.className = "status err";
      st.textContent = /Could not find the function|database isn't set up/i.test(err.message) ? "Problem reports aren't switched on yet (the site's database needs its latest update)." : err.message;
      $("#fbGo", d).disabled = false;
    }
  };
  $("#fbMsg", d).focus();
}
