# Roadmap

## Milestone 0 — Foundation

- [x] MIT repository and contribution rules
- [x] Monorepo boundaries
- [x] Shared domain contracts
- [x] Privacy and third-party attribution policy
- [x] Automated tests and CI
- [ ] Automated formatting and linting

## Milestone 1 — Review-first MVP

- [x] Local candidate profile editor
- [x] Provider interface for automatic job discovery
- [x] Tencent public-careers provider
- [x] Official company source registry
- [x] Meituan and Moka public-careers providers
- [x] Shared adapters for Feishu Jobs, Greenhouse, Lever and Ashby
- [x] User-maintained official source watchlist
- [x] WeChat public-article discovery with CAPTCHA stop
- [x] Source trust labels for official jobs and unverified article clues
- [x] User-directed role, location, include and exclude filters
- [x] Fetch job details, rank matches and save a shortlist
- [ ] Expand the curated official-source catalog
- [x] Import a text-based PDF or DOCX resume
- [x] Extract a job description from the active browser tab
- [x] Explain hard-condition and relevance matching
- [x] Generate a fact-grounded resume draft
- [x] Fill standard form controls
- [x] Highlight uncertain or unfilled fields
- [x] Stop before final submission

## Milestone 1.5 — Optional BYOK intelligence

- [x] Loopback-only local API service
- [x] macOS Keychain storage and environment-variable fallback
- [x] OpenAI and DeepSeek Responses-compatible clients
- [x] Explicit AI resume structuring with strict schemas
- [x] Privacy-minimized semantic matching and hard-requirement extraction
- [x] OpenAI hosted web search with citation and public-URL verification
- [x] Grounded AI application package with source-id validation
- [ ] OCR for scanned resumes
- [ ] Linux Secret Service and Windows Credential Manager persistence

## Milestone 2 — China recruitment adapters

- [ ] Beisen adapter
- [x] Moka discovery adapter
- [ ] Nowcoder adapter
- [ ] Zhaopin and 51job research
- [ ] Synthetic regression fixtures for each adapter

## Milestone 3 — Application workspace

- [x] Local application dashboard and per-job preparation page
- [x] Current per-job resume version tracking
- [x] Duplicate detection by normalized job URL and source id
- [x] Missing-information questions with explicit fact confirmation
- [x] Review-only and one-time-authorized submission modes
- [x] Submission-attempt state separated from confirmed submission
- [ ] Interview-stage tracking
- [ ] Export and encrypted backup

## Milestone 4 — Assisted batches

- [x] User-approved apply / skip decisions
- [ ] Batch preparation with per-job review
- [ ] Failure recovery and audit log
- [ ] Rate limits and platform-policy controls
