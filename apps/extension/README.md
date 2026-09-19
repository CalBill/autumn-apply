# Browser extension

Chrome Manifest V3 extension for a local candidate profile, job-page analysis and review-first form filling.

## Local development

```bash
npm install
npm run build:extension
```

Open `chrome://extensions`, enable developer mode, choose **Load unpacked**, and select `dist/extension`.

The extension stores profile data with `chrome.storage.local`. It does not request broad host access, and it never clicks a final submission button.
