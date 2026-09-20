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

1. Double-click `AutumnApply.command` on macOS, or run `npm run launch`, then load `dist/extension` when Chrome asks on first use.
2. Open **工作台**, follow the onboarding checklist, and save a candidate profile; optionally import a PDF/DOCX resume or configure BYOK AI.
3. Open **找岗位**, refine role/location/required/excluded instructions, optionally add priority WeChat account/company terms, and search supported official career systems and public WeChat clues.
4. Optionally run privacy-minimized AI matching or OpenAI hosted web discovery with source verification.
5. Choose **要投** or **不投** for each result.
6. For an application, answer missing-fact questions, generate a local or AI-assisted job-specific resume, then download Word or inspect the PDF print view.
7. Choose review-only submission or authorize one guarded submission attempt for this job.
8. Open the job page, choose **提取并分析**, and review the extracted facts.
9. Choose **填写当前表单** and resolve every orange field.
10. Run the final check. Submit manually, or explicitly confirm the one-time authorized click, then verify the website result.

After a successful non-AI search, it can be saved as a 12, 24 or 72-hour monitor. The background worker uses only base discovery providers, reports new jobs and separately alerts for deadlines within seven days. It never spends a BYOK model request automatically.

The popup reports the detected recruitment platform and every filled, review-required or skipped field. It stores a bounded local audit event and a recoverable snapshot. **撤销上次自动填写** restores only values that are still exactly what AutumnApply inserted, so subsequent user edits are not overwritten.

The generic form engine intentionally skips passwords, verification codes, identity documents, financial information, salary history, file inputs, checkboxes and radio buttons.

Platform detection is a safety and diagnostics layer, not a promise of full Moka or Beisen automation. Custom widgets, repeated education/work sections, uploads and multi-page flows may remain manual until a dedicated adapter is added.

Base discovery uses explicit host permissions for supported official career systems and Sogou Weixin. It sends no account or full candidate profile to those sources. Optional AI calls go through the loopback-only local service; the UI discloses what leaves the machine and never receives the API key.

WeChat discovery builds at most six sequential queries from roles, cohort, locations, industry/company preferences and user-entered priority terms. It uses no retry loop, stops on CAPTCHA or temporary access restrictions, deduplicates reposts with a stable title/account/date key, and keeps a title-search fallback for expiring Sogou article links. Every article remains unverified until the user checks the employer and application destination.
