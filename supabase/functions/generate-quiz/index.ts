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
        required: ["type", "question", "options", "correct_option", "model_answer", "key_points", "explanation", "source"],
        properties: {
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

const TYPE_TEXT: Record<string, string> = {
  mcq: '"mcq": exactly 4 options, one correct, plausible distractors taken from the material, never "all/none of the above"; correct_option is the 0-based index',
  tf: '"tf": a clear statement; options ["True","False"]; correct_option 0 for true, 1 for false',
  short: '"short": an open theory question; use (a), (b) on new lines for sub-parts when useful; model_answer holds the ideal answer and key_points 2-5 short marking points; options empty, correct_option -1',
};
const DIFFICULTY: Record<string, string> = {
  easy: "mostly direct recall of definitions and facts",
  mixed: "a mix of recall, understanding and application",
  hard: "mostly understanding, application and comparison rather than recall",
};
const LEVEL: Record<string, string> = {
  p13: "pupils aged 6-8 (Primary 1-3): very short sentences, everyday words, one idea per question, friendly tone",
  p46: "pupils aged 9-11 (Primary 4-6): short sentences and simple words",
  jss: "junior secondary students (JSS 1-3, ages 11-14)",
  sss: "senior secondary students (SSS 1-3), in the style of WAEC/NECO questions",
  uni: "university / polytechnic students, in the style of a university examination",
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

  let body: { text?: string; pdfs?: string[]; count?: number; types?: string[]; level?: string; difficulty?: string; language?: string };
  try { body = await req.json(); } catch { return reply({ error: "Send JSON." }, 400); }
  const text = String(body.text ?? "").trim();
  const pdfs = (Array.isArray(body.pdfs) ? body.pdfs : []).filter((p) => typeof p === "string" && p.length > 100).slice(0, 5);
  const count = Math.max(3, Math.min(60, Number(body.count) || 10));
  const types = (body.types ?? ["mcq", "tf", "short"]).filter((t) => t in TYPE_TEXT);
  const level = LEVEL[body.level ?? ""] ?? LEVEL.jss;
  const difficulty = DIFFICULTY[body.difficulty ?? ""] ?? DIFFICULTY.mixed;
  const language = LANGS.includes(body.language ?? "") ? body.language! : "English";
  if (!text && !pdfs.length) return reply({ error: "No lesson notes were sent." }, 400);
  if (!types.length) return reply({ error: "Choose at least one question type." }, 400);

  const instructions = `You are helping a teacher write questions for their class from their own lesson notes.
Use ONLY the teaching material provided${pdfs.length ? " (the attached PDF" + (pdfs.length > 1 ? "s" : "") + (text ? " and the text below" : "") + ")" : " below"}. Every question must be answerable from it; do not add outside facts.

Write exactly ${count} questions, spread across these types:
${types.map((t) => "- " + TYPE_TEXT[t]).join("\n")}

Audience: ${level}. Difficulty: ${difficulty}.
Language: write every question, option, answer and explanation in ${language}${language === "English" ? " (British spelling, as used in Nigerian schools)" : ""}.
Cover all of the material, not just the beginning. Vary the position of the correct option. Do not repeat a question.
Keep wording clear enough to read on a projector and a phone. Each explanation is one sentence that points back to the material.
For maths, write LaTeX between single dollar signs, e.g. $x^2 + 3x$ or $\\frac{1}{2}$; for chemical formulas use $\\ce{H2SO4}$.
"source" says where in the notes the answer is: the page number from the [Page N] markers (e.g. "p. 4"), or the file name shown in "=== name ===" lines plus page, or a short section name. Keep it under 30 characters.
The title names the topic in a few words.`;

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const data of pdfs) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
  content.push({ type: "text", text: text ? `${instructions}\n\nTEACHING MATERIAL:\n"""\n${text}\n"""` : instructions });

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  try {
    // Streaming keeps long exam-sized requests (up to 60 questions) from timing out.
    const response = await client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: count > 30 ? "low" : "medium", format: { type: "json_schema", schema } },
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
    return reply(JSON.parse(out));
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
