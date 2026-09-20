import assert from "node:assert/strict";
import test from "node:test";
import { detectFormAdapter } from "./form-adapters.js";

test("detects common China recruitment form platforms", () => {
  assert.equal(detectFormAdapter("https://app.mokahr.com/apply/1").id, "moka");
  assert.equal(detectFormAdapter("https://example.beisen.com/campus/apply").id, "beisen");
  assert.equal(detectFormAdapter("https://acme.jobs.feishu.cn/1").id, "feishu");
  assert.equal(detectFormAdapter("https://company.example/jobs").id, "generic");
});
