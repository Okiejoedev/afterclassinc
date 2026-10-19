// Game sounds made in the browser (no audio files to download).
// Browsers only allow sound after a click, so call unlock() from a button.
import { store } from "./ui.js";

let ctx = null, musicTimer = 0, musicStep = 0;
export let soundOn = store.get("afterclass.sound", true);
export function setSound(on) { soundOn = on; store.set("afterclass.sound", on); if (!on) stopMusic(); }
export function unlock() {
  try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); } catch {}
}

function tone(freq, start, dur, type = "sine", vol = 0.18) {
  if (!ctx || !soundOn) return;
  const t = ctx.currentTime + start, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  tick: () => tone(1200, 0, 0.05, "square", 0.05),
  count: (last) => tone(last ? 880 : 520, 0, last ? 0.45 : 0.18, "triangle", 0.22),
  reveal: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, "triangle", 0.16)); },
  join: () => tone(660, 0, 0.12, "sine", 0.12),
  timeUp: () => { tone(330, 0, 0.25, "sawtooth", 0.08); tone(247, 0.22, 0.4, "sawtooth", 0.08); },
  fanfare: () => { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.32, "triangle", 0.17)); },
  good: () => { tone(660, 0, 0.12, "sine", 0.15); tone(990, 0.1, 0.25, "sine", 0.15); },
  bad: () => tone(200, 0, 0.3, "triangle", 0.12),
};

// Gentle lobby / thinking music: a looping arpeggio.
const PATTERN = [262, 330, 392, 523, 392, 330, 294, 370, 440, 587, 440, 370];
export function startMusic(fast = false) {
  stopMusic();
  if (!ctx || !soundOn) return;
  musicTimer = setInterval(() => { tone(PATTERN[musicStep++ % PATTERN.length], 0, 0.22, "sine", 0.05); }, fast ? 180 : 300);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = 0; }
