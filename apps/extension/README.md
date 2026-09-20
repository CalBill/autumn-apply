# Browser extension

Chrome Manifest V3 extension for a local candidate profile, job-page analysis and review-first form filling.

## Local development

```bash
npm install
npm run build:extension
```

Open `chrome://extensions`, enable developer mode, choose **Load unpacked**, and select `dist/extension`.

The extension stores profile data with `chrome.storage.local`. It does not request broad host access, and it never clicks a final submission button.

## Current workflow

1. Open the extension options page and save a candidate profile.
2. Start the local service with `npm run start:api`; optionally import a PDF/DOCX resume or configure BYOK AI.
3. Open **找岗位**, refine role/location/required/excluded instructions, and search supported official career systems and public WeChat clues.
4. Optionally run privacy-minimized AI matching or OpenAI hosted web discovery with source verification.
5. Review ranked results and add relevant jobs to the local shortlist.
6. Alternatively, visit a job page and choose **提取并分析**.
7. Review hard requirements, strengths, gaps and extraction quality.
8. Generate a grounded Markdown resume draft.
9. On an application form, choose **填写当前表单**.
10. Review green and orange outlines, submit manually, then optionally mark the record as submitted.

The generic form engine intentionally skips passwords, verification codes, identity documents, financial information, salary history, file inputs, checkboxes and radio buttons.

Base discovery uses explicit host permissions for supported official career systems and Sogou Weixin. It sends no account or full candidate profile to those sources. Optional AI calls go through the loopback-only local service; the UI discloses what leaves the machine and never receives the API key.
