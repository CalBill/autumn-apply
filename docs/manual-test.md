# Manual acceptance test

This checklist exercises the complete MVP without using a real recruitment website or real personal data.

## 1. Launch, build and load

On macOS, double-click `AutumnApply.command`. On Windows, double-click `AutumnApply.cmd`. Confirm it checks Node.js, installs dependencies on first use, builds the extension, reports the local API version, opens `chrome://extensions`, and reveals `dist/extension`. If Chrome is not in a standard Windows install location, confirm the launcher gives manual loading instructions instead of failing. On any supported development system, the equivalent command is:

```bash
npm run launch
```

For a complete clean verification, run:

```bash
npm ci
npm test
npm run check
npm run build
npm run start:api
```

Open `chrome://extensions`, enable developer mode, choose **Load unpacked**, and select `dist/extension`.

Open **工作台** and confirm the local-service step is complete while profile, preferences and first application are initially incomplete. AI should be shown as optional.

## 2. Create a synthetic profile

Open the AutumnApply options page and use fictional data such as:

- name: 测试用户
- email: test@example.com
- school: 测试大学
- degree: 本科
- major: 统计学
- graduation: 2027-06
- full-time experience: 0
- skills: Python、SQL、数据分析
- target role: 数据分析
- target city: 上海

Add one project highlight: `使用 Python 和 SQL 清洗公开销售数据`.

Save the profile. Reload the options page and confirm the values remain available.

Return to **工作台** and confirm profile completeness and onboarding progress increase without requiring AI.

Optionally import a text-based PDF or DOCX resume. Confirm local parsing fills only blank fields and does not overwrite saved facts. AI structuring must remain disabled until a resume has been parsed and must clearly disclose that extracted text will be sent to the configured provider.

## 3. Configure optional BYOK AI

1. Keep this step skipped to confirm the rest of the extension works without any API key.
2. If testing BYOK, choose OpenAI, 智谱 GLM or DeepSeek in the options page and enter a test key.
3. Confirm the key is not shown again after saving and is present in macOS Keychain or Windows current-user DPAPI storage rather than Chrome storage.
4. Click **测试连接** and confirm the provider/model result is displayed.
5. Delete the key and confirm AI requests fail with a clear configuration message.

## 4. Discover public jobs

1. Open the extension popup and choose **找岗位**.
2. Search for `数据分析`, optionally select a city, set the maximum to 3 and keep the minimum score low for the smoke test.
3. Add a fictional or public priority term such as `某集团招聘`; confirm the status says it is performing a multi-angle WeChat search and never exceeds six sequential query variants.
4. Confirm the source summary includes multiple company career sites and `微信公众号`.
5. Confirm official results have an `企业官网岗位` label and article results have a `公众号招聘信息` label.
6. Confirm article results display the publishing account, article category, date/deadline when present, a verification warning, the original link and a title-search fallback.
7. Confirm the same repost found by multiple query variants appears only once.
8. Choose `不投` for one result and confirm the decision is retained.
9. Choose `要投 · 准备材料` for another result and confirm the application preparation page opens.
10. Enable search monitoring, choose a 12, 24 or 72-hour interval, rerun the base search, and confirm the saved-monitor status appears. Do not expect an immediate notification when there are no newly discovered jobs.

Optionally add one extra official source using `公司名 | https://官方招聘入口`. Use a supported Moka, Feishu Jobs, Greenhouse, Lever or Ashby URL that you independently verified from the company's website. Confirm an unsupported URL is rejected rather than treated as connected.

This step uses public career APIs and Sogou Weixin, so it requires network access. It sends search terms and the graduation cohort used to refine article search—not the candidate's name, contact details or resume. Sogou may request a CAPTCHA; confirm the extension reports that condition and stops.

With OpenAI or 智谱 GLM BYOK configured, click **AI联网补充搜索**. Confirm returned links carry a verification status. With 智谱 GLM, confirm the search succeeds through `web-search-pro` and no API key appears in the browser. With DeepSeek selected, confirm the UI explains that hosted web search is unavailable instead of silently pretending to search.

## 5. Prepare one application

1. On the application preparation page, answer any missing-information question and tick `我确认以上回答真实`.
2. Generate a non-AI resume and confirm it only reorders existing facts.
3. If BYOK is configured, generate an AI version and confirm every rewritten story maps to an existing experience or project.
4. Confirm the application remains `准备材料` while questions or the resume are missing, and becomes `待提交` only when both are ready.
5. Keep `审核提交` selected for the first pass.
6. Click **下载 Word** and confirm the `.docx` opens with the candidate name, education and selected stories.
7. Click **打印 / 存为 PDF**, inspect the print-only layout, and cancel or save a synthetic PDF.

## 6. Open the synthetic job page

Run:

```bash
npm run preview:fixture
```

Open `http://127.0.0.1:4173/test-fixtures/generic-job-form.html`.

## 7. Analyze and tailor

1. Open the AutumnApply popup.
2. Choose **提取并分析**.
3. Confirm the result identifies the job as `数据分析实习生`, the company as `秋招科技`, and the location as `上海`.
4. Confirm Python, SQL and data analysis appear as strengths.
5. Generate the resume and confirm every bullet is copied from the synthetic profile rather than invented.
6. On a discovered job, click **AI深度分析** and confirm the result lists hard requirements as met, not met or unknown. Inspect the request fixture or logs to confirm name, email and phone were omitted.

## 8. Fill and review

1. Choose **填写当前表单**.
2. Confirm ordinary fields receive green outlines.
3. Confirm the identity-number field, file upload and declaration checkbox receive orange outlines and remain unfilled.
4. Confirm the pre-filled referral field is not overwritten.
5. Confirm the popup names the detected platform and reports counts for filled, review and skipped fields.
6. Click **撤销上次自动填写** and confirm automatically inserted values are restored while pre-existing content remains unchanged; fill again before continuing.
7. Click `检查最终提交条件` and confirm the unhandled identity, file and declaration controls block submission.
8. Resolve the synthetic fields manually and confirm review-only mode still does not display an execution button.

## 9. Test one-time submission on the synthetic page

1. From the popup on the synthetic page, save this synthetic job as `待提交`.
2. Open the options-page ledger, choose `准备申请` for `秋招科技 · 数据分析实习生`, and select `授权本次自动提交`.
3. Return to the synthetic form, fill it again, manually choose a test file and tick the declaration.
4. Click `检查最终提交条件`; confirm any unresolved field stops the flow.
5. Click `执行本次授权提交`, read the job-specific confirmation, and approve it only on this fixture.
6. Confirm the fixture reports receipt and the ledger status becomes `已发起提交`, not `已投递`.
7. Confirm the one-time authorization has been consumed.

## 10. Track

1. Save the job as `待提交`.
2. Open the options page and confirm it appears in the application ledger.
3. Only for this synthetic page, choose `标记已投递` and accept the confirmation.
4. Confirm the ledger status changes to `已投递`.

## Expected safety properties

- Discovery network requests are limited to declared public career-system and Sogou Weixin hosts.
- No unrestricted all-sites host permission is requested.
- No real candidate data is used.
- No existing form value is overwritten.
- Review-only mode never triggers final submission.
- One-time submission requires per-job authorization, a second confirmation and a clean final check.
- A click attempt is never treated as proof that the recruiting site accepted the application.
- Background monitoring never invokes the optional AI provider.
- Deadline reminders are supplemental; the original employer page remains authoritative.
- Undo restores only unchanged values inserted by the latest autofill run.
