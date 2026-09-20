# Architecture

## System boundary

AutumnApply runs primarily on the candidate's machine. The browser extension reads the active recruitment page and communicates with a local service. The local service owns profile storage, matching, resume generation and the application ledger.

```text
Recruitment page
      │
      ▼
Browser extension ─────► site adapter
      │       │               │
      │       ├── dashboard   ▼
      ▼       └── scheduler ─ generic form engine
Local API ◄─────────────────────────┘
  │       │
  │       ├── job parser and matcher
  │       ├── fact-grounded resume tailor and DOCX exporter
  │       └── application ledger
  ▼
Local encrypted or OS-protected storage
```

Job discovery follows a separate read-only pipeline:

```text
Candidate preferences
      │
      ├── verified company source registry ──► ATS providers
      │                                        (Tencent / Moka / Meituan / ...)
      └── WeChat public search ──────────────► recruitment-article clues
                                                   │
                                                   ▼
                          normalize ── filter ── deduplicate ── rank
                                                   │
                                                   ▼
                                      user-controlled shortlist
```

The Manifest V3 background worker can repeat a saved base search every 12, 24 or 72 hours. It stores bounded seen-job and deadline-notification identifiers, then uses Chrome notifications for new jobs and deadlines within seven days. It does not call the optional AI provider, and it treats browser suspension, network failure and CAPTCHA responses as visible limitations rather than guarantees of real-time delivery.

An official career-system record and a WeChat article have different trust levels. WeChat records remain labeled as unverified clues until the candidate follows the original link and confirms the employer, cohort, deadline and application destination.

WeChat discovery is a bounded batch rather than a general crawler. A planner combines up to three role directions with the graduation cohort, priority account/company terms, locations and industry/company-type preferences, then emits at most six sequential public searches. Results are ranked by recruitment evidence and recency, deduplicated by normalized title/account/date rather than short-lived redirect tokens, and classified as single-company announcements, roundups, internships, early batches or events. CAPTCHA, HTTP 403/429 and unexpected search-home redirects stop the batch without bypass or retry.

An external model provider is optional. When one is used, the calling module must disclose exactly which fields leave the machine. Identity numbers, authentication state and unrelated profile facts must not be sent by default.

The optional local API binds only to `127.0.0.1`. On macOS it stores provider keys in Keychain; on Windows it pipes the secret directly to PowerShell and encrypts it with DPAPI's current-user scope before writing ciphertext under the user's application-data directory. The API returns status metadata, never the secret. Resume file extraction stays local; AI resume structuring is a separate explicit action. Semantic matching removes direct identity/contact fields. Hosted web discovery accepts only cited public HTTPS URLs and revalidates redirects, DNS targets, reachability and page signals before presenting results.

## Core domains

### Candidate profile

The canonical store for user-confirmed facts. Every experience, project and credential receives a stable identifier so generated resume claims can cite their sources.

### Job posting

A normalized representation of a job page. Raw source text is retained alongside extracted requirements so the user can inspect parsing errors.

### Match assessment

Contains hard-condition results, a score, supporting evidence, gaps and warnings. A score without an explanation is not sufficient.

### Resume variant

A job-specific selection and rewriting of confirmed facts. Each generated bullet retains one or more source fact identifiers.

Reviewed variants can be exported through the local service as DOCX or rendered by an extension print page for user-controlled PDF saving. Exporting does not grant permission to submit.

### Application record

Tracks the job URL, selected resume variant, form completion state, submission decision and later recruitment stages.

## Trust boundaries

The following always require direct user action or confirmation:

- login and verification challenges;
- identity, legal declaration and salary-history answers;
- content that cannot be traced to a confirmed fact;
- sending recruiter messages; and
- final application submission.

## Adapter strategy

The generic form engine handles native inputs and accessible labels. A detection layer recognizes Moka, Beisen, Feishu Jobs, Greenhouse and Lever and reports the support level before filling. Platform adapters handle proprietary components and repeated sections for systems such as Beisen, Moka and Nowcoder. Detection alone does not imply full adapter coverage. Adapters must expose capabilities and failures through one shared interface rather than silently guessing.

Each fill run emits a structured result and stores a bounded audit event. Its recovery snapshot contains only the fields changed by that run. Undo restores a field only when its current value still equals the inserted value, which protects edits the candidate made afterward.

Discovery adapters only accept known public career-system URL shapes. A configured URL is not treated as proof of coverage: its company association must come from an official recruitment entry point, and unsupported sites fail visibly. CAPTCHA, rate limits and format changes are surfaced to the user without bypass or silent retry.
