import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

function clean(value, limit) {
  return String(value ?? "").replace(/\r/g, "").slice(0, limit);
}

function inlineRuns(value, options = {}) {
  const parts = String(value).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    return new TextRun({ text: bold ? part.slice(2, -2) : part, bold, font: "Arial" , ...options });
  });
}

export async function markdownResumeToDocx(markdown, title = "AutumnApply 岗位版简历") {
  const value = clean(markdown, 120_000).trim();
  if (!value) throw Object.assign(new Error("简历内容不能为空"), { statusCode: 400 });
  const paragraphs = [];
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ spacing: { after: 80 } }));
      continue;
    }
    if (line.startsWith("### ")) {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: inlineRuns(line.slice(4)), spacing: { before: 180, after: 70 } }));
    } else if (line.startsWith("## ")) {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: inlineRuns(line.slice(3)), spacing: { before: 240, after: 90 } }));
    } else if (line.startsWith("# ")) {
      paragraphs.push(new Paragraph({ heading: HeadingLevel.TITLE, children: inlineRuns(line.slice(2)), spacing: { after: 140 } }));
    } else if (line.startsWith("- ")) {
      paragraphs.push(new Paragraph({ bullet: { level: 0 }, children: inlineRuns(line.slice(2)), spacing: { after: 55 }, indent: { hanging: 280 } }));
    } else if (line.startsWith("> ")) {
      paragraphs.push(new Paragraph({ children: inlineRuns(line.slice(2), { italics: true, color: "445047" }), spacing: { after: 90 } }));
    } else {
      paragraphs.push(new Paragraph({ children: inlineRuns(line), spacing: { after: 55 } }));
    }
  }
  const document = new Document({
    title: clean(title, 300),
    description: "Generated locally by AutumnApply from user-confirmed application material",
    styles: {
      default: { document: { run: { size: 20, font: "Arial" }, paragraph: { spacing: { line: 260 } } } },
    },
    sections: [{
      properties: { page: { margin: { top: 720, right: 780, bottom: 720, left: 780 } } },
      children: paragraphs,
    }],
  });
  return Packer.toBuffer(document);
}
