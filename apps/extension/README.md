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
2. Open **找岗位**, refine role/location/required/excluded instructions, and search Tencent's public careers API.
3. Review ranked results and add relevant jobs to the local shortlist.
4. Alternatively, visit a job page and choose **提取并分析**.
5. Review hard requirements, strengths, gaps and extraction quality.
6. Generate a grounded Markdown resume draft.
7. On an application form, choose **填写当前表单**.
8. Review green and orange outlines, submit manually, then optionally mark the record as submitted.

The generic form engine intentionally skips passwords, verification codes, identity documents, financial information, salary history, file inputs, checkboxes and radio buttons.

Job discovery currently has one source: the public Tencent Careers API. The exact host permission is declared in `manifest.json`; no account or candidate profile is sent to Tencent.
