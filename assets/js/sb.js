import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// Only the address itself is needed (https://abcd.supabase.co). People often paste
// the "RESTful endpoint" (…/rest/v1/) or a dashboard link, so clean it up here.
function cleanUrl(raw) {
  try {
    const s = String(raw).trim();
    const u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s);
    if (/(^|\.)supabase\.com$/i.test(u.hostname)) return null; // dashboard link, not the project address
    return u.origin;
  } catch { return null; }
}
const URL_OK = cleanUrl(SUPABASE_URL);
const KEY = String(SUPABASE_ANON_KEY).trim();

export const configured = !!URL_OK && !SUPABASE_URL.includes("YOUR-PROJECT") && !KEY.includes("YOUR-") && KEY.length > 5;
export const configProblem = configured ? "" : !URL_OK && !SUPABASE_URL.includes("YOUR-PROJECT")
  ? `The SUPABASE_URL in assets/js/config.js is not a project address. It should look like https://abcdefgh.supabase.co (Supabase → Project Settings → API → Project URL), not a link to the Supabase dashboard.`
  : "";
export const sb = configured ? createClient(URL_OK, KEY) : null;

// Calls a database function and turns errors into plain messages.
export async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    const e = new Error(friendly(error.message));
    e.code = error.message === "REMOVED" ? "REMOVED" : error.code;
    throw e;
  }
  return data;
}

export function friendly(msg = "") {
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "No connection. Check your internet and try again.";
  if (/Invalid path specified/i.test(msg)) return "Afterclass can't reach your database. In assets/js/config.js, SUPABASE_URL must be just https://your-project.supabase.co with nothing after it.";
  if (/Invalid API key|No API key|apikey/i.test(msg)) return "The SUPABASE_ANON_KEY in assets/js/config.js is wrong. Copy the Publishable key (or anon public key) from Supabase → Project Settings → API Keys.";
  if (/relation .* does not exist|Could not find the (function|table)/i.test(msg)) return "The database isn't set up yet. Run supabase/schema.sql in Supabase → SQL Editor (README step 2).";
  if (msg === "REMOVED") return "You were removed from this game.";
  return msg;
}

// Unwraps { data, error } from table queries.
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(friendly(error.message));
  return data;
}
