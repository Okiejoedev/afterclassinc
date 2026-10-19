// Reads text out of PDF, Word (.docx) and plain text files in the browser.
// Several files can be combined (e.g. a whole term's notes for an exam).
// PDF text is tagged with [Page N] so questions can say where they came from.
import { loadScript } from "./ui.js";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
const MAMMOTH = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
const MAX_PDF_BYTES = 8 * 1024 * 1024;     // largest single scanned PDF sent to the AI
const MAX_TOTAL_PDF_BYTES = 20 * 1024 * 1024;

export async function readFiles(files, onProgress = () => {}) {
  const list = [...files];
  const parts = [], pdfs = [], notes = [];
  let pages = 0, pdfBytes = 0;
  for (const [i, file] of list.entries()) {
    const label = list.length > 1 ? `(${i + 1}/${list.length}) ` : "";
    const r = await readFile(file, (m) => onProgress(label + m));
    pages += r.pages || 0;
    if (r.text) parts.push(list.length > 1 ? `=== ${file.name} ===\n${r.text}` : r.text);
    if (r.scanned) {
      if (r.pdfBase64 && pdfBytes + r.bytes <= MAX_TOTAL_PDF_BYTES) { pdfs.push({ name: file.name, data: r.pdfBase64 }); pdfBytes += r.bytes; }
      else notes.push(`${file.name} is a scanned PDF that is too large to send to the AI (limit 8 MB each, 20 MB in total).`);
    }
  }
  return { text: parts.join("\n\n").trim(), pages, pdfs, notes, names: list.map((f) => f.name) };
}

export async function readFile(file, onProgress = () => {}) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || file.type === "application/pdf") return readPdf(file, onProgress);
  if (ext === "docx") return readDocx(file);
  if (ext === "doc") throw new Error(`"${file.name}" is an old .doc file. Open it in Word and save it as .docx or PDF first.`);
  if (ext === "pptx" || ext === "ppt") throw new Error(`"${file.name}" is a slide show. Export it as PDF first (File > Export > PDF).`);
  return { text: (await file.text()).trim(), pages: null, pdfBase64: null, scanned: false, bytes: file.size };
}

async function readPdf(file, onProgress) {
  await loadScript(PDFJS + "pdf.min.js");
  await loadScript(PDFJS + "pdf.worker.min.js"); // runs pdf.js on the main thread, no worker file needed
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  let pdf;
  try { pdf = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise; }
  catch (e) { throw new Error(/password/i.test(e?.message || "") ? `"${file.name}" is password-protected. Remove the password first.` : `"${file.name}" could not be read as a PDF.`); }
  let text = "", chars = 0;
  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress(`Reading ${file.name}, page ${p} of ${pdf.numPages}…`);
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    let line = "";
    for (const it of tc.items) line += it.str + (it.hasEOL ? "\n" : " ");
    line = line.replace(/[ \t]+/g, " ").trim();
    chars += line.replace(/\s/g, "").length;
    if (line) text += `[Page ${p}]\n${line}\n\n`;
  }
  const scanned = chars / pdf.numPages < 80;
  let pdfBase64 = null;
  if (scanned && buf.byteLength <= MAX_PDF_BYTES) pdfBase64 = await toBase64(buf);
  return { text: scanned ? "" : text.trim(), pages: pdf.numPages, pdfBase64, scanned, bytes: buf.byteLength };
}

async function readDocx(file) {
  await loadScript(MAMMOTH);
  const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { text: r.value.trim(), pages: null, pdfBase64: null, scanned: false, bytes: file.size };
}

function toBase64(buf) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(new Blob([buf], { type: "application/pdf" }));
  });
}
