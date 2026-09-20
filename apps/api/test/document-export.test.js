import assert from "node:assert/strict";
import test from "node:test";
import { markdownResumeToDocx } from "../src/document-export.js";

test("exports a Chinese Markdown resume as a real DOCX archive", async () => {
  const output = await markdownResumeToDocx("# 测试用户\n\n## 教育经历\n\n### 测试大学 · 本科\n\n- 使用 Python 完成数据分析");
  assert.ok(Buffer.isBuffer(output));
  assert.equal(output.subarray(0, 2).toString("utf8"), "PK");
  assert.ok(output.length > 1_000);
});

test("rejects empty document exports", async () => {
  await assert.rejects(() => markdownResumeToDocx(""), /不能为空/);
});
