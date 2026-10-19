// Builds an editable Word (.docx) exam paper in the browser.
// Exam officers and typists can then adjust it in Microsoft Word or Google Docs.
import { loadScript, plainMath } from "./ui.js";

const JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
const LET = ["A", "B", "C", "D", "E", "F"];
const ROMAN = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
const xml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const txt = (s) => plainMath(s);

function run(text, o = {}) {
  const props = [o.b && "<w:b/>", o.i && "<w:i/>", o.u && '<w:u w:val="single"/>', o.size && `<w:sz w:val="${o.size * 2}"/><w:szCs w:val="${o.size * 2}"/>`, o.caps && "<w:caps/>"].filter(Boolean).join("");
  return String(text ?? "").split("\n").map((part, i) => `${i ? "<w:r><w:br/></w:r>" : ""}<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${part.split("\t").map((t, j) => `${j ? "<w:tab/>" : ""}<w:t xml:space="preserve">${xml(t)}</w:t>`).join("")}</w:r>`).join("");
}
function para(runs, o = {}) {
  const pp = [
    o.pageBreak && "<w:pageBreakBefore/>", o.keepNext && "<w:keepNext/>", o.keepLines && "<w:keepLines/>",
    o.tabs && `<w:tabs>${o.tabs.map((t) => `<w:tab w:val="left" w:pos="${t}"/>`).join("")}</w:tabs>`,
    o.border && '<w:pBdr><w:bottom w:val="double" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>',
    o.rule && '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>',
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 80}"/>`,
    o.indent != null && `<w:ind w:left="${o.indent}" w:hanging="${o.hanging ?? 0}"/>`,
    o.align && `<w:jc w:val="${o.align}"/>`,
  ].filter(Boolean).join("");
  return `<w:p><w:pPr>${pp}</w:pPr>${runs}</w:p>`;
}

// Images are converted to PNG through a canvas so every version of Word can show them.
async function toPng(src) {
  const img = new Image(); img.crossOrigin = "anonymous";
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  return { data: await blob.arrayBuffer(), w: img.naturalWidth, h: img.naturalHeight };
}

export async function buildExamDocx({ school, ex, papers, key, headerFields }) {
  await loadScript(JSZIP);
  const zip = new window.JSZip();
  const media = [];
  async function picture(src, maxWcm, maxHcm) {
    try {
      const im = await toPng(src);
      const n = media.length + 1;
      media.push({ name: `image${n}.png`, data: im.data });
      const k = Math.min((maxWcm * 360000) / im.w, (maxHcm * 360000) / im.h);
      const cx = Math.round(im.w * k), cy = Math.round(im.h * k);
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.png"/><pic:cNvPicPr/></pic:nvPicPr>
        <pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
        <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
        </a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    } catch { return ""; }
  }

  const body = [];
  const fs = ex.fontSize || 12;
  const header = async (first, typeLabel, title) => {
    if (school.logo) body.push(para(await picture(school.logo, 2.2, 2.2), { align: "center", pageBreak: !first, after: 40 }));
    body.push(para(run(school.name || "SCHOOL NAME", { b: true, size: fs + 5, caps: true }), { align: "center", pageBreak: !first && !school.logo, after: 0 }));
    if (school.address) body.push(para(run(school.address, { size: fs - 1 }), { align: "center", after: 0 }));
    if (school.motto) body.push(para(run("Motto: " + school.motto, { i: true, size: fs - 1 }), { align: "center", after: 0 }));
    if (school.contact) body.push(para(run(school.contact, { size: fs - 1 }), { align: "center", after: 0 }));
    body.push(para(run(title, { b: true, caps: true }), { align: "center", before: 80, after: 40 }));
    const meta = headerFields.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
    if (typeLabel) meta.push(typeLabel.toUpperCase());
    body.push(para(run(meta.join("     "), { size: fs }), { align: "center", border: true, after: 160 }));
  };
  const blank = (label) => para(run(label + "  ", { b: true }) + run("_".repeat(label.length > 6 ? 46 : 60)), { after: 120 });

  for (const [pi, p] of papers.entries()) {
    await header(pi === 0, p.typeLabel, [ex.title, ex.session].filter(Boolean).join(" · "));
    if (ex.candidate) { body.push(blank("Name:")); body.push(blank(ex.style === "university" ? "Matric No:" : "Exam No:")); }
    if (p.general) body.push(para(run("Instructions: ", { b: true, i: true }) + run(p.general, { i: true }), { after: 160 }));
    if (p.obj.length) {
      body.push(para(run(p.headA, { b: true, caps: true }), { rule: true, keepNext: true, before: 120 }));
      if (p.instrA) body.push(para(run(p.instrA, { i: true }), { after: 120 }));
      for (const [i, q] of p.obj.entries()) {
        body.push(para(run(`${i + 1}.\t`) + run(txt(q.question)) + (q.marks ? run(`  [${q.marks}]`, { i: true }) : ""), { indent: 567, hanging: 567, keepNext: true, keepLines: true, tabs: [567], after: 40 }));
        if (q.image) body.push(para(await picture(q.image, 9, 6), { indent: 567, keepNext: true }));
        const short = q.options.every((o) => txt(o).length <= 22);
        if (short) body.push(para(q.options.map((o, k) => run(`${k ? "\t" : ""}${LET[k]}. ${txt(o)}`)).join(""), { indent: 567, tabs: [567 + 2300, 567 + 4600, 567 + 6900], after: 140, keepLines: true }));
        else for (const [k, o] of q.options.entries()) body.push(para(run(`${LET[k]}. ${txt(o)}`), { indent: 567, after: k === q.options.length - 1 ? 140 : 20, keepNext: k < q.options.length - 1 }));
      }
    }
    if (p.th.length) {
      body.push(para(run(p.headB, { b: true, caps: true }), { rule: true, keepNext: true, before: 240 }));
      if (p.instrB) body.push(para(run(p.instrB, { i: true }), { after: 120 }));
      for (const [i, q] of p.th.entries()) {
        body.push(para(run(`${i + 1}.\t`) + run(txt(q.question)) + run(`  [${q.marksLabel}]`, { i: true }), { indent: 567, hanging: 567, tabs: [567], keepLines: true, keepNext: !!q.image || ex.lines > 0, after: 120 }));
        if (q.image) body.push(para(await picture(q.image, 10, 7), { indent: 567 }));
        for (let l = 0; l < (ex.lines || 0); l++) body.push(para(run("_".repeat(78), { size: fs }), { indent: 567, after: 60 }));
      }
    }
    if (ex.closing) body.push(para(run(ex.closing, { b: true }), { align: "center", before: 240 }));
  }

  if (key) for (const [pi, p] of papers.entries()) {
    await header(false, p.typeLabel, "Marking scheme · Teacher's copy");
    if (p.obj.length) {
      body.push(para(run(p.headA.replace(/questions?/i, "answers"), { b: true, caps: true }), { rule: true }));
      const cells = p.obj.map((q, i) => `${i + 1}. ${q.type === "tf" ? (q.answer === 0 ? "True" : "False") : LET[q.answer]}`);
      for (let r = 0; r < cells.length; r += 6) body.push(para(cells.slice(r, r + 6).map((c, j) => run((j ? "\t" : "") + c)).join(""), { tabs: [1500, 3000, 4500, 6000, 7500], after: 40 }));
    }
    if (p.th.length) {
      body.push(para(run(p.headB.replace(/questions?/i, "marking guide"), { b: true, caps: true }), { rule: true, before: 200 }));
      for (const [i, q] of p.th.entries()) {
        body.push(para(run(`${i + 1}.\t`) + run(txt(q.question), { b: true }) + run(`  [${q.marksLabel}]`), { indent: 567, hanging: 567, tabs: [567], keepNext: true, after: 40 }));
        if (q.answer) body.push(para(run("Model answer: ", { b: true }) + run(txt(q.answer)), { indent: 567, after: 40 }));
        for (const [k, pt] of (q.keyPoints || []).entries()) body.push(para(run(`(${ROMAN[k + 1] || k + 1}) ${txt(pt)}`), { indent: 850, after: 20 }));
        body.push(para("", { after: 80 }));
      }
    }
  }

  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>${body.join("")}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="1000" w:left="992" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">Page </w:t></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve"> of </w:t></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="${fs * 2}"/><w:szCs w:val="${fs * 2}"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
${media.map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join("")}</Relationships>`);
  zip.file("word/document.xml", doc);
  zip.file("word/styles.xml", styles);
  zip.file("word/footer1.xml", footer);
  for (const m of media) zip.file("word/media/" + m.name, m.data);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
