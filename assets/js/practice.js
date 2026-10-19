// Practice mode: a signed-in student replays a quiz they already took, on their
// own, with instant feedback. Uses the game look (phone + answer tiles).
// Nothing here reaches the teacher's results; only a private score is kept.
import { sb, rpc } from "./sb.js";
import { $, esc, rt, LET, shuffle, toast, confetti, qimg, renderMath, LOGO } from "./ui.js";

const app = $("#app");

export async function practise(sessionId, onExit) {
  screen(`<div class="wait"><div class="spinner"></div><p class="muted">Getting your quiz…</p></div>`);
  let quiz;
  try { quiz = await rpc("practice_quiz", { p_session: sessionId }); }
  catch (err) { toast(err.message, true); return onExit(); }
  if (!quiz.questions.length) { toast("This quiz has no questions to practise", true); return onExit(); }
  run(quiz, onExit);
}

function screen(inner, title = "") {
  document.body.className = "stage";
  app.innerHTML = `<div class="phone"><div class="top"><span class="brand" style="color:var(--stage-ink)">${LOGO} Practice</span>
    <button class="btn sm" id="exit" type="button">Exit</button></div>${title ? `<p class="label" style="margin:0">${esc(title)}</p>` : ""}${inner}</div>`;
  renderMath(app);
}

function run(quiz, onExit) {
  const qs = shuffle(quiz.questions);
  let i = 0, got = 0;
  const bindExit = () => ($("#exit").onclick = onExit);

  function show() {
    const x = qs[i];
    const head = `<div class="spread"><span class="label">Question ${i + 1} of ${qs.length}</span><span class="label">Score ${got}</span></div>
      <div class="progress"><i style="width:${(100 * i) / qs.length}%"></i></div>
      ${qimg(x)}<h1 class="gq">${rt(x.question)}</h1>`;
    if (x.type === "short") {
      screen(`${head}<textarea id="ans" rows="4" placeholder="Type your answer, then check it" style="background:#fff;color:#111;border:0;border-radius:12px;padding:12px;font-size:17px"></textarea>
        <button class="btn primary" id="check" type="button">Check my answer</button>`, quiz.title);
      bindExit();
      $("#check").onclick = () => {
        const model = String(x.answer || "");
        const kp = (x.keyPoints || []).filter(Boolean);
        $("#check").remove();
        $("#ans").readOnly = true;
        $("#ans").insertAdjacentHTML("afterend", `<div class="pq-model"><span class="label">Model answer</span><div>${rt(model) || "<i>No model answer given</i>"}</div>
          ${kp.length ? `<span class="label">Key points</span><ul>${kp.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : ""}
          ${x.explanation ? `<p class="muted" style="margin:0">${rt(x.explanation)}</p>` : ""}</div>
          <p style="margin:0;text-align:center"><b>Did you get it?</b></p>
          <div class="row" style="justify-content:center"><button class="btn primary" data-self="1" type="button">Yes, I got it</button><button class="btn" data-self="0" type="button">Not quite</button></div>`);
        renderMath(app);
        app.querySelectorAll("[data-self]").forEach((b) => (b.onclick = () => { if (b.dataset.self === "1") got++; next(); }));
      };
      return;
    }
    screen(`${head}<div class="tiles" role="group" aria-label="Answer options">${x.options.map((o, k) => `<button class="tile o${k}" data-k="${k}" type="button"><span class="bl" aria-hidden="true">${LET[k]}</span><span class="t">${esc(o)}</span></button>`).join("")}</div>
      <div id="fb" aria-live="polite"></div>`, quiz.title);
    bindExit();
    app.querySelector(".tiles").onclick = (e) => {
      const b = e.target.closest("[data-k]"); if (!b) return;
      const pick = +b.dataset.k, right = pick === Number(x.answer);
      if (right) got++;
      app.querySelectorAll(".tile").forEach((t) => { t.disabled = true; const k = +t.dataset.k; t.classList.add(k === Number(x.answer) ? "right" : "dim"); if (k === pick && !right) t.classList.add("picked"); });
      $("#fb").innerHTML = `<div class="pq-fb ${right ? "ok" : "no"}"><b>${right ? "Correct!" : `Not quite. The answer is ${LET[x.answer]}: ${esc(x.options[x.answer])}`}</b>
        ${x.explanation ? `<p style="margin:6px 0 0">${rt(x.explanation)}</p>` : ""}</div>
        <button class="btn primary" id="next" type="button" style="width:100%;margin-top:12px">${i + 1 < qs.length ? "Next question" : "See my score"}</button>`;
      renderMath($("#fb"));
      $("#next").onclick = next; $("#next").focus();
    };
  }

  function next() { i++; i < qs.length ? show() : finish(); }

  async function finish() {
    const pct = Math.round((100 * got) / qs.length);
    if (pct >= 80) confetti();
    screen(`<div class="wait">
        <span class="label">Practice finished</span>
        <div class="big-pin" style="font-size:72px">${pct}%</div>
        <h1 style="font-size:28px">${got} of ${qs.length} correct</h1>
        <p class="muted" style="margin:0">${pct >= 80 ? "Excellent work!" : pct >= 50 ? "Good effort. Practise again to beat your score." : "Keep going. Each try helps you learn it."}</p>
        <div class="row" style="justify-content:center"><button class="btn primary" id="again" type="button">Practise again</button><button class="btn" id="done" type="button">Back to dashboard</button></div>
        <p class="muted" style="font-size:13px;margin:0">Practice scores are private. They don't change your class results.</p></div>`, quiz.title);
    bindExit();
    $("#again").onclick = () => run(quiz, onExit);
    $("#done").onclick = onExit;
    try { await sb.from("practice_runs").insert({ session_id: quiz.session_id, score: got, total: qs.length }); } catch { /* not critical */ }
  }

  show();
}
