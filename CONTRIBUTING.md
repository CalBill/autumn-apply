# Contributing

Thank you for helping make repetitive job applications safer and less tedious.

## Development rules

- Keep each pull request focused on one independently reviewable change.
- Add or update tests for behavior changes.
- Never commit real candidate data, authentication state, API keys or recruiter messages.
- Generated resume claims must be traceable to confirmed profile facts.
- Browser automation must stop before final submission unless a future policy explicitly defines a safe confirmation flow.
- New website adapters should isolate site-specific selectors from the generic form engine.
- Reused source code must have a compatible license and be recorded in `THIRD_PARTY_NOTICES.md`.

## Commit messages

Use a short imperative summary, for example:

```text
Add candidate profile schema
Support Moka date fields
Document browser data boundaries
```
