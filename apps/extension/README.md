# Browser extension

Chrome Manifest V3 extension for a local candidate profile, job-page analysis and review-first form filling.

## Local development

```bash
npm install
npm run build:extension
```

Open `chrome://extensions`, enable developer mode, choose **Load unpacked**, and select `dist/extension`.

The extension stores profile data with `chrome.storage.local` and does not request broad host access. Final submission defaults to review-only. A user can authorize one click for one job; the extension rechecks blockers and consumes that authorization after the attempt.

## Current workflow

1. Open the extension options page and save a candidate profile.
2. Start the local service with `npm run start:api`; optionally import a PDF/DOCX resume or configure BYOK AI.
3. Open **找岗位**, refine role/location/required/excluded instructions, and search supported official career systems and public WeChat clues.
4. Optionally run privacy-minimized AI matching or OpenAI hosted web discovery with source verification.
5. Choose **要投** or **不投** for each result.
6. For an application, answer missing-fact questions and generate a local or AI-assisted job-specific resume.
7. Choose review-only submission or authorize one guarded submission attempt for this job.
8. Open the job page, choose **提取并分析**, and review the extracted facts.
9. Choose **填写当前表单** and resolve every orange field.
10. Run the final check. Submit manually, or explicitly confirm the one-time authorized click, then verify the website result.

The generic form engine intentionally skips passwords, verification codes, identity documents, financial information, salary history, file inputs, checkboxes and radio buttons.

Base discovery uses explicit host permissions for supported official career systems and Sogou Weixin. It sends no account or full candidate profile to those sources. Optional AI calls go through the loopback-only local service; the UI discloses what leaves the machine and never receives the API key.
