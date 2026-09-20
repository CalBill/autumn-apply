import assert from "node:assert/strict";
import test from "node:test";
import { inferResumeProfile, normalizeExtractedText, parseResumeBuffer } from "../src/resume-parser.js";

test("normalizes extracted text without joining paragraphs", () => {
  assert.equal(normalizeExtractedText("姓名  \r\n\r\n\r\n技能\t\tExcel"), "姓名\n\n技能 Excel");
});

test("infers safe profile signals without inventing facts", () => {
  const draft = inferResumeProfile("唐奕滢\n清华大学 法律硕士 2027\n13800138000 · test@example.com\n英语 德语 国际仲裁 合规");
  assert.deepEqual(draft.personal, { fullName: "唐奕滢", email: "test@example.com", phone: "13800138000" });
  assert.deepEqual(draft.yearSignals, ["2027"]);
  assert.ok(draft.skills.includes("德语"));
  assert.ok(draft.skills.includes("合规"));
});

test("parses plain text resumes locally", async () => {
  const result = await parseResumeBuffer({ buffer: Buffer.from("李明\n北京大学\nPython SQL"), filename: "resume.txt" });
  assert.equal(result.mimeType, "text/plain");
  assert.equal(result.profileDraft.personal.fullName, "李明");
  assert.ok(result.profileDraft.skills.includes("Python"));
});

test("rejects unsupported formats", async () => {
  await assert.rejects(() => parseResumeBuffer({ buffer: Buffer.from("x"), filename: "resume.pages" }), /仅支持/);
});
