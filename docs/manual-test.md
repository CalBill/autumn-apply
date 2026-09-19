# Manual acceptance test

This checklist exercises the complete MVP without using a real recruitment website or real personal data.

## 1. Build and load

```bash
npm ci
npm test
npm run check
npm run build
```

Open `chrome://extensions`, enable developer mode, choose **Load unpacked**, and select `dist/extension`.

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

## 3. Discover public jobs

1. Open the extension popup and choose **找岗位**.
2. Search for `数据分析`, optionally select a city, set the maximum to 3 and keep the minimum score low for the smoke test.
3. Confirm the page reports `腾讯招聘` as the only current source.
4. Confirm each result links to an official Tencent job and contains a score, strengths and warnings.
5. Add one result to the shortlist and confirm the button changes to `已加入候选`.

This step uses Tencent's public careers API and therefore requires network access. It sends search terms, not the candidate profile.

## 4. Open the synthetic job page

Run:

```bash
npm run preview:fixture
```

Open `http://127.0.0.1:4173/test-fixtures/generic-job-form.html`.

## 5. Analyze and tailor

1. Open the AutumnApply popup.
2. Choose **提取并分析**.
3. Confirm the result identifies the job as `数据分析实习生`, the company as `秋招科技`, and the location as `上海`.
4. Confirm Python, SQL and data analysis appear as strengths.
5. Generate the resume and confirm every bullet is copied from the synthetic profile rather than invented.

## 6. Fill and review

1. Choose **填写当前表单**.
2. Confirm ordinary fields receive green outlines.
3. Confirm the identity-number field, file upload and declaration checkbox receive orange outlines and remain unfilled.
4. Confirm the pre-filled referral field is not overwritten.
5. Confirm AutumnApply does not click the final submit button.

## 7. Track

1. Save the job as `待提交`.
2. Open the options page and confirm it appears in the application ledger.
3. Only for this synthetic page, choose `标记已投递` and accept the confirmation.
4. Confirm the ledger status changes to `已投递`.

## Expected safety properties

- No network request is made by the extension.
- No broad host permission is requested.
- No real candidate data is used.
- No existing form value is overwritten.
- No final submission is triggered.
