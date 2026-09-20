import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MIME_TYPES = Object.freeze({
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  text: "text/plain",
});

const SKILL_SIGNALS = [
  "Excel", "PowerPoint", "Word", "Python", "SQL", "Java", "JavaScript", "TypeScript",
  "英语", "德语", "法语", "西班牙语", "日语", "韩语", "国际仲裁", "合规", "反洗钱",
  "法律检索", "数据分析", "项目管理", "人力资源", "党务", "合同审查",
];

function normalizedMimeType(filename = "", mimeType = "") {
  const lower = filename.toLocaleLowerCase();
  if (mimeType === MIME_TYPES.pdf || lower.endsWith(".pdf")) return MIME_TYPES.pdf;
  if (mimeType === MIME_TYPES.docx || lower.endsWith(".docx")) return MIME_TYPES.docx;
  if (mimeType === MIME_TYPES.text || lower.endsWith(".txt") || lower.endsWith(".md")) return MIME_TYPES.text;
  return "";
}

export function normalizeExtractedText(value) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(buffer) {
  const document = await getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = [];
    let previousY = null;
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const y = item.transform?.[5] ?? null;
      if (previousY !== null && y !== null && Math.abs(y - previousY) > 2) lines.push("\n");
      lines.push(item.str, item.hasEOL ? "\n" : " ");
      previousY = y;
    }
    pages.push(normalizeExtractedText(lines.join("")));
  }
  return { text: normalizeExtractedText(pages.join("\n\n")), pageCount: document.numPages };
}

async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return {
    text: normalizeExtractedText(result.value),
    pageCount: null,
    warnings: result.messages.map((message) => message.message).filter(Boolean),
  };
}

function firstMatch(text, expression) {
  return text.match(expression)?.[0] ?? "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function inferResumeProfile(text) {
  const normalized = normalizeExtractedText(text);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const likelyName = lines.find((line) => /^[\p{Script=Han}·]{2,8}$/u.test(line)) ?? "";
  const email = firstMatch(normalized, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  const phone = firstMatch(normalized, /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/);
  const years = unique([...normalized.matchAll(/20\d{2}/g)].map((match) => match[0]));
  const education = unique(lines.filter((line) => /大学|学院|University|College/i.test(line)).slice(0, 12));
  const skills = SKILL_SIGNALS.filter((skill) => normalized.toLocaleLowerCase().includes(skill.toLocaleLowerCase()));
  const sectionHeadings = unique(lines.filter((line) => line.length <= 14 && /教育|实习|工作|项目|技能|证书|获奖|竞赛|校园|经历|实践/.test(line)));

  return {
    personal: { fullName: likelyName, email, phone },
    educationSignals: education,
    yearSignals: years,
    skills,
    sectionHeadings,
  };
}

export async function parseResumeBuffer({ buffer, filename = "resume", mimeType = "" }) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) throw new TypeError("buffer must be a Buffer or Uint8Array");
  const detectedType = normalizedMimeType(filename, mimeType);
  if (!detectedType) throw new Error("仅支持 PDF、DOCX、TXT 和 Markdown 简历");
  if (buffer.byteLength > 15 * 1024 * 1024) throw new Error("简历文件不能超过 15 MB");

  let extracted;
  if (detectedType === MIME_TYPES.pdf) extracted = await extractPdf(buffer);
  else if (detectedType === MIME_TYPES.docx) extracted = await extractDocx(buffer);
  else extracted = { text: normalizeExtractedText(Buffer.from(buffer).toString("utf8")), pageCount: null, warnings: [] };

  if (!extracted.text) throw new Error("未能从简历中提取文字；扫描版 PDF 需要后续 OCR 支持");
  return {
    filename,
    mimeType: detectedType,
    text: extracted.text,
    pageCount: extracted.pageCount,
    warnings: extracted.warnings ?? [],
    profileDraft: inferResumeProfile(extracted.text),
  };
}
