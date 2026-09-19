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

An external model provider is optional. When one is used, the calling module must disclose exactly which fields leave the machine. Identity numbers, authentication state and unrelated profile facts must not be sent by default.

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
