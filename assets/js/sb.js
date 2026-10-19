import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const configured = !SUPABASE_URL.includes("YOUR-PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR-");
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

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
  if (/Failed to fetch|NetworkError/i.test(msg)) return "No connection. Check your internet and try again.";
  if (msg === "REMOVED") return "You were removed from this game.";
  return msg;
}

// Unwraps { data, error } from table queries.
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(friendly(error.message));
  return data;
}
