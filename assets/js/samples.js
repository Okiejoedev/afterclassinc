// Ready-made quizzes so a new teacher can run a live game in a minute,
// before writing their own. Added to the teacher's library as normal quizzes.
import { sb, q } from "./sb.js";
import { esc, dialog, toast, uid } from "./ui.js";

const mcq = (question, options, answer, explanation = "") => ({ type: "mcq", question, options, answer, explanation });
const tf = (question, isTrue, explanation = "") => ({ type: "tf", question, options: ["True", "False"], answer: isTrue ? 0 : 1, explanation });

export const SAMPLES = [
  {
    key: "ng", title: "General knowledge: Nigeria", blurb: "8 questions · good warm-up for any class",
    questions: [
      mcq("What is the capital of Nigeria?", ["Lagos", "Abuja", "Kano", "Ibadan"], 1, "Abuja replaced Lagos as the capital in 1991."),
      mcq("In which year did Nigeria gain independence?", ["1957", "1960", "1963", "1970"], 1, "Independence day is 1 October 1960."),
      mcq("What are the colours of the Nigerian flag?", ["Green and white", "Green and yellow", "Red and white", "Blue and white"], 0),
      mcq("How many states does Nigeria have?", ["30", "36", "37", "40"], 1, "36 states, plus the Federal Capital Territory."),
      mcq("Which is the largest city in Nigeria by population?", ["Abuja", "Lagos", "Port Harcourt", "Enugu"], 1),
      mcq("Which river gives Nigeria its name?", ["River Benue", "River Niger", "Ogun River", "Cross River"], 1),
      tf("Nigeria became a republic in 1963.", true),
      tf("The naira is the currency of Nigeria.", true),
    ],
  },
  {
    key: "sci", title: "Basic Science: living things", blurb: "8 questions · Primary 5 to JSS 2",
    questions: [
      mcq("Which part of a plant makes its food?", ["Root", "Stem", "Leaf", "Flower"], 2, "Leaves contain chlorophyll, which traps sunlight."),
      mcq("What is the process by which green plants make food?", ["Respiration", "Photosynthesis", "Digestion", "Excretion"], 1),
      mcq("Which gas do plants take in for photosynthesis?", ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], 2),
      mcq("Which of these animals is a mammal?", ["Shark", "Bat", "Frog", "Lizard"], 1, "Bats feed their young with milk."),
      mcq("Which organ pumps blood around the body?", ["Lungs", "Liver", "Heart", "Kidney"], 2),
      mcq("At what temperature does pure water boil at sea level?", ["50 °C", "90 °C", "100 °C", "120 °C"], 2),
      tf("A spider is an insect.", false, "Spiders have 8 legs; insects have 6."),
      tf("The sun is a star.", true),
    ],
  },
  {
    key: "math", title: "Quick maths", blurb: "8 questions · fast mental maths",
    questions: [
      mcq("7 × 8 = ?", ["54", "56", "63", "48"], 1),
      mcq("1/2 + 1/4 = ?", ["3/4", "2/6", "1/8", "2/4"], 0),
      mcq("What is 15% of 200?", ["15", "20", "30", "45"], 2),
      mcq("What is the square root of 81?", ["7", "8", "9", "11"], 2),
      mcq("A square has sides of 5 cm. What is its perimeter?", ["10 cm", "20 cm", "25 cm", "15 cm"], 1, "4 sides × 5 cm = 20 cm."),
      mcq("2 × 2 × 2 = ?", ["6", "8", "9", "5"], 1),
      tf("0 is an even number.", true),
      tf("The angles of a triangle add up to 360°.", false, "They add up to 180°."),
    ],
  },
];

// Dialog to add one of the samples; after(quizRow) runs once it's saved.
export function sampleDialog(after) {
  const d = dialog(`<h2 style="font-size:22px">Add a sample quiz</h2>
    <p class="muted" style="margin:0">Ready to play straight away. You can edit it like any of your own quizzes.</p>
    <div class="sample-list">${SAMPLES.map((s) => `<button type="button" class="sample" data-k="${s.key}"><b>${esc(s.title)}</b><span>${esc(s.blurb)}</span></button>`).join("")}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-x type="button">Cancel</button></div>`);
  d.querySelector("[data-x]").onclick = () => d.close();
  d.querySelector(".sample-list").onclick = async (e) => {
    const b = e.target.closest("[data-k]"); if (!b) return;
    const s = SAMPLES.find((x) => x.key === b.dataset.k);
    b.disabled = true;
    try {
      const r = await q(sb.from("quizzes").insert({ title: s.title, questions: s.questions.map((x) => ({ ...x, id: uid() })) }).select("id,title,questions").single());
      d.close(); toast(`"${s.title}" added`); after?.(r);
    } catch (err) { toast(err.message, true); b.disabled = false; }
  };
}
