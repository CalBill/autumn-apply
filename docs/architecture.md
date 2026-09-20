# Architecture

## System boundary

AutumnApply runs primarily on the candidate's machine. The browser extension reads the active recruitment page and communicates with a local service. The local service owns profile storage, matching, resume generation and the application ledger.

```text
Recruitment page
      │
      ▼
Browser extension ─────► site adapter
      │                       │
      ▼                       ▼
Local API ◄────────── generic form engine
  │       │
  │       ├── job parser and matcher
  │       ├── fact-grounded resume tailor
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

An official career-system record and a WeChat article have different trust levels. WeChat records remain labeled as unverified clues until the candidate follows the original link and confirms the employer, cohort, deadline and application destination.

An external model provider is optional. When one is used, the calling module must disclose exactly which fields leave the machine. Identity numbers, authentication state and unrelated profile facts must not be sent by default.

The optional local API binds only to `127.0.0.1`. On macOS it stores provider keys in Keychain and returns status metadata, never the secret. Resume file extraction stays local; AI resume structuring is a separate explicit action. Semantic matching removes direct identity/contact fields. Hosted web discovery accepts only cited public HTTPS URLs and revalidates redirects, DNS targets, reachability and page signals before presenting results.

## Core domains

### Candidate profile

The canonical store for user-confirmed facts. Every experience, project and credential receives a stable identifier so generated resume claims can cite their sources.

### Job posting

A normalized representation of a job page. Raw source text is retained alongside extracted requirements so the user can inspect parsing errors.

### Match assessment

Contains hard-condition results, a score, supporting evidence, gaps and warnings. A score without an explanation is not sufficient.

### Resume variant

A job-specific selection and rewriting of confirmed facts. Each generated bullet retains one or more source fact identifiers.

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

The generic form engine handles native inputs and accessible labels. Platform adapters handle proprietary components and repeated sections for systems such as Beisen, Moka and Nowcoder. Adapters must expose capabilities and failures through one shared interface rather than silently guessing.

Discovery adapters only accept known public career-system URL shapes. A configured URL is not treated as proof of coverage: its company association must come from an official recruitment entry point, and unsupported sites fail visibly. CAPTCHA, rate limits and format changes are surfaced to the user without bypass or silent retry.
