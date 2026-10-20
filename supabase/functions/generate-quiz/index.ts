// Optional AI question writer for Afterclass.
// Runs on Supabase Edge Functions so your Anthropic API key never reaches the browser.
// Secrets it reads: ANTHROPIC_API_KEY (required), ALLOWED_EMAILS (optional, comma separated).
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Every field is required by structured outputs; unused ones come back empty.
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "questions"],
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["concept", "skill", "type", "question", "options", "correct_option", "model_answer", "key_points", "explanation", "source"],
        properties: {
          // The one idea this question tests; used to drop repeats.
          concept: { type: "string" },
          skill: { type: "string", enum: ["recall", "understand", "apply", "analyse"] },
          type: { type: "string", enum: ["mcq", "tf", "short"] },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_option: { type: "integer" },
          model_answer: { type: "string" },
          key_points: { type: "array", items: { type: "string" } },
          explanation: { type: "string" },
          source: { type: "string" },
        },
      },
    },
  },
};

// Question methods teachers and exam bodies (WAEC, NECO, JAMB) use, with item-writing
// research rules (Haladyna, Downing & Rodriguez 2002) for writing them well.
const TYPE_TEXT: Record<string, string> = {
  mcq: `"mcq": exactly 4 options, one correct; correct_option is the 0-based index. Mix these objective methods:
    - direct question ("Which organ of the digestive system absorbs water?") and incomplete statement ("Peristalsis is best defined as");
    - best answer, application to a new example or short scenario ("A pupil's gums bleed and he eats no fruit. Which vitamin is lacking?");
    - matching ("Which of the following pairs is correctly matched?" with term — function pairs);
    - correct order of stages or steps ("A → B → C → D");
    - assertion–reason (question text "Assertion: …" and "Reason: …" on separate lines; options exactly: "Both are true, and the reason correctly explains the assertion" / "Both are true, but the reason does not explain the assertion" / "The assertion is true, but the reason is false" / "The assertion is false, but the reason is true");
    - for senior classes only and at most one or two per set, statements numbered I, II, III, IV on new lines with options such as "I and II only", "I, II and III only";
    - calculation or reading of a value, where the material has numbers.
    Wrong options are real terms or statements from the same topic (other organelles, other arms of government), the same kind of thing as the answer, of similar length and grammar, and based on likely misconceptions, so none can be ruled out by its form. Never "all/none of the above". Avoid negative stems; when one is needed write NOT in capitals.`,
  tf: '"tf": one clear, checkable statement; a false one should be a believable mistake (a swapped term, wrong figure or wrong cause), not nonsense; options ["True","False"]; correct_option 0 for true, 1 for false',
  short: `"short": a theory question. Use the command word that matches the depth wanted: Define / State / List / Name (recall, 1 mark per point), Describe / Outline (features or steps, in order where relevant), Explain / Give reasons why (cause and effect), Distinguish between / Compare (two ideas side by side), Calculate, Discuss / Evaluate (senior classes). Write some as structured questions: parts (a), (b), (c) on new lines that build from recall to reasoning on one topic, each ending with its marks in square brackets, e.g. "(a) Define digestion. [2 marks]". model_answer answers each part on its own line; key_points 2-8 short marking points (the words a marker looks for); options empty, correct_option -1`,
};
const DIFFICULTY: Record<string, string> = {
  easy: "mostly recall (about 60%) with some understanding (40%)",
  mixed: "about 30% recall, 40% understanding, 30% application or analysis",
  hard: "about 10% recall, 40% understanding, 50% application or analysis (worked problems, unfamiliar examples, cause and effect, comparison)",
};
const LEVEL: Record<string, string> = {
  p13: "pupils aged 6-8 (Primary 1-3): very short sentences, everyday words, one idea per question, friendly tone",
  p46: "pupils aged 9-11 (Primary 4-6): short sentences and simple words",
  jss: "junior secondary students (JSS 1-3, ages 11-14)",
  sss: "senior secondary students (SSS 1-3), in the style of WAEC/NECO questions",
  uni: "university undergraduates, in the style of a Nigerian university semester examination: theory, analysis and evaluation as well as recall",
  poly: "polytechnic students (ND / HND), in the style of a polytechnic semester examination: practical and applied, with procedures, calculations, tools, materials and workplace situations",
  coe: "College of Education students (NCE) and students of other colleges (nursing, health technology, agriculture), in the style of their semester examinations: sound subject knowledge plus how it is taught or applied in practice (for NCE, include questions on teaching the topic to pupils)",
  adult: "adult professionals at a workshop, seminar or webinar",
};
const LANGS = ["English", "French", "Hausa", "Igbo", "Yoruba", "Nigerian Pidgin"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);

  // Only signed-in teachers may spend your API credit.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: auth } = await supabase.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return reply({ error: "Sign in as a teacher first." }, 401);
  const allowed = (Deno.env.get("ALLOWED_EMAILS") ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes((user.email ?? "").toLowerCase())) {
    return reply({ error: "This account is not allowed to use AI question writing." }, 403);
  }

  let body: { mode?: string; text?: string; pdfs?: string[]; count?: number; types?: string[]; level?: string; difficulty?: string; language?: string };
  try { body = await req.json(); } catch { return reply({ error: "Send JSON." }, 400); }
  const text = String(body.text ?? "").trim();
  const pdfs = (Array.isArray(body.pdfs) ? body.pdfs : []).filter((p) => typeof p === "string" && p.length > 100).slice(0, 5);
  const count = Math.max(3, Math.min(60, Number(body.count) || 10));
  const types = (body.types ?? ["mcq", "tf", "short"]).filter((t) => t in TYPE_TEXT);
  const level = LEVEL[body.level ?? ""] ?? LEVEL.jss;
  const difficulty = DIFFICULTY[body.difficulty ?? ""] ?? DIFFICULTY.mixed;
  const language = LANGS.includes(body.language ?? "") ? body.language! : "English";
  if (!text && !pdfs.length) return reply({ error: "No lesson notes were sent." }, 400);
  // "check": find factual errors and mis-heard words; "expand": turn short notes into full notes.
  const mode = body.mode === "check" || body.mode === "expand" ? body.mode : "generate";
  if (mode === "generate" && !types.length) return reply({ error: "Choose at least one question type." }, 400);

  const instructions = `You are helping a teacher write questions for their class from their own lesson notes.
Use ONLY the teaching material provided${pdfs.length ? " (the attached PDF" + (pdfs.length > 1 ? "s" : "") + (text ? " and the text below" : "") + ")" : " below"}. Every question must be answerable from it; do not add outside facts.

Write exactly ${count} questions, spread across these types:
${types.map((t) => "- " + TYPE_TEXT[t]).join("\n")}

Audience: ${level}. Difficulty: ${difficulty}.
Language: write every question, option, answer and explanation in ${language}${language === "English" ? " (British spelling, as used in Nigerian schools)" : ""}.

Write the questions the way an experienced subject teacher sets a school or WAEC/NECO-style paper:
- First list the key concepts in the material (definitions, processes, causes and effects, classifications, functions, dates and figures, comparisons), then write each question on a different concept. "concept" names it in a few words; no two questions share a concept, and never ask the same fact twice in different words.
- Spread the questions across the whole material in proportion to its sections, not just the beginning, and keep them in the order the material teaches them.
- "skill" says what the question tests: recall (state a fact), understand (explain or describe in other words), apply (use the idea in a new example or calculation), analyse (compare, give reasons, predict).
- Every question stands on its own: name the subject in full; never "it", "this process", "the above", "the passage", "the lesson", "according to the notes" or "as described in the text", and never refer to a figure the student cannot see.
- Ask about the subject matter, never about the notes themselves, and never with empty templates such as "In your own words, explain the role of X" or "What do you understand by X as used in the lesson".
- Vary how questions open; do not start more than two questions the same way.
- Use precise subject vocabulary at the stated level. Each question has one clearly correct answer that the material supports.

Vary the position of the correct option. Keep wording clear enough to read on a projector and a phone. Each explanation is one sentence that points back to the material.
For maths, write LaTeX between single dollar signs, e.g. $x^2 + 3x$ or $\\frac{1}{2}$; for chemical formulas use $\\ce{H2SO4}$.
"source" says where in the notes the answer is: the page number from the [Page N] markers (e.g. "p. 4"), or the file name shown in "=== name ===" lines plus page, or a short section name. Keep it under 30 characters.
The title names the topic in a few words.`;

  const checkInstructions = `You are checking a teacher's lesson notes before they become questions for students. The notes may be a transcript of the teacher speaking, so expect missing punctuation and words the speech recogniser mis-heard.
List every statement that is factually wrong (dates, years, numbers, names, places, definitions, formulas, scientific or historical facts) and every passage that is clearly mis-heard or garbled (for example a misremembered pledge, anthem, poem or definition).
For each one give:
- "quote": the exact words copied from the notes, as short as possible but long enough to find (copy them character for character);
- "problem": what is wrong, in one plain sentence a teacher will understand;
- "correction": the correct fact, with its date or source where useful;
- "replacement": text that can replace the quote word for word in the notes.
Judge facts as they stand today for Nigeria (for example, the national anthem changed back to "Nigeria, We Hail Thee" in May 2024). Do not report style, grammar or opinions, and do not report things that are merely incomplete. If nothing is wrong, return an empty list.`;
  const expandInstructions = `A teacher's lesson notes below are too short to make a good set of questions from. Expand them into complete, accurate lesson notes on the same topic(s) for ${level}, in ${language}${language === "English" ? " (British spelling, as used in Nigerian schools)" : ""}, following the Nigerian curriculum.
- Keep every correct point the teacher made, correct anything that is wrong, and drop filler and chatter.
- Add what a good lesson on this topic covers: clear definitions ("X is …"), lists ("The types of X are:" followed by "- " bullet lines), causes and reasons ("… because …"), examples from Nigerian life, and important dates or figures only when you are certain of them.
- Use short headings in capital letters and plain sentences. No markdown symbols other than "- " bullets.
- About 300 to 600 words. Do not invent statistics, quotations or people.
"title" names the topic in a few words; "notes" is the full expanded text; "additions" lists, in a few words each, the main points you added or corrected.`;
  const checkSchema = { type: "object", additionalProperties: false, required: ["issues"], properties: { issues: { type: "array", items: { type: "object", additionalProperties: false, required: ["quote", "problem", "correction", "replacement"], properties: { quote: { type: "string" }, problem: { type: "string" }, correction: { type: "string" }, replacement: { type: "string" } } } } } };
  const expandSchema = { type: "object", additionalProperties: false, required: ["title", "notes", "additions"], properties: { title: { type: "string" }, notes: { type: "string" }, additions: { type: "array", items: { type: "string" } } } };
  const job = mode === "check" ? { prompt: checkInstructions, schema: checkSchema, effort: "medium", max: 8000 }
    : mode === "expand" ? { prompt: expandInstructions, schema: expandSchema, effort: "medium", max: 8000 }
    : { prompt: instructions, schema, effort: count > 30 ? "low" : "medium", max: 32000 };

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const data of pdfs) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
  content.push({ type: "text", text: text ? `${job.prompt}\n\n${mode === "generate" ? "TEACHING MATERIAL" : "THE TEACHER'S NOTES"}:\n"""\n${text}\n"""` : job.prompt });

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  try {
    // Streaming keeps long exam-sized requests (up to 60 questions) from timing out.
    const response = await client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: job.max,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: job.effort, format: { type: "json_schema", schema: job.schema } },
      messages: [{ role: "user", content }],
    } as Anthropic.Beta.MessageCreateParamsStreaming).finalMessage();

    if (response.stop_reason === "refusal") {
      return reply({ error: "The AI declined this material. Try a different section of your notes." }, 422);
    }
    if (response.stop_reason === "max_tokens") {
      return reply({ error: "The set was too long to finish. Ask for fewer questions, or generate in two batches." }, 422);
    }
    const out = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text).join("");
    if (mode !== "generate") return reply(JSON.parse(out));
    // Safety net against repeats: keep the first question per concept and per wording.
    const parsed = JSON.parse(out) as { title: string; questions: { concept?: string; question: string }[] };
    const seen = new Set<string>();
    const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    parsed.questions = parsed.questions.filter((q) => {
      const keys = [key(q.question), q.concept ? "c:" + key(q.concept) : ""].filter(Boolean);
      if (keys.some((k) => seen.has(k))) return false;
      keys.forEach((k) => seen.add(k));
      return true;
    });
    return reply(parsed);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return reply({ error: "The AI is busy. Try again in a minute." }, 429);
    if (err instanceof Anthropic.AuthenticationError) return reply({ error: "The ANTHROPIC_API_KEY secret is missing or wrong." }, 500);
    if (err instanceof Anthropic.BadRequestError) return reply({ error: "The AI could not read this material: " + err.message }, 400);
    if (err instanceof Anthropic.APIError) return reply({ error: "The AI service had a problem. Try again." }, 502);
    if (err instanceof SyntaxError) return reply({ error: "The AI reply was not valid. Try again." }, 502);
    console.error(err);
    return reply({ error: "Unexpected error while writing questions." }, 500);
  }
});
