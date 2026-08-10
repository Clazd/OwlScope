# Contributing

Thank you for considering a contribution to OwlScope. The project is pre-release and has not selected a license yet, so external contributions should wait until a `LICENSE` file is present.

## Before opening a change

- Search existing issues and keep the proposed slice narrow.
- Do not attach real personas, prompts, run records, provider responses, source archives, or credentials.
- Discuss large provider, storage, publishing, or multi-user changes before implementation.
- Preserve the core invariants: identity before generation, evidence before assertion, memory before repetition, skip as success, and human approval.

## Local setup

```bash
npm install
cp .env.example .env
```

Set `SANDBOX_MODE=true`; contributor workflows should not require paid APIs or network access.

## Development expectations

- Keep route handlers thin and workflow rules outside React components.
- Access the filesystem only through `src/services/storage/`.
- Validate persisted data and structured model output with Zod.
- Add a deterministic regression test or eval for behavioral fixes.
- Do not weaken SSRF checks, evidence gates, publishing state transitions, or secret boundaries.
- Avoid major refactors in feature changes unless the issue explicitly calls for one.

Run all release checks before opening a pull request:

```bash
npm run typecheck
npm run lint
npm test
npm run eval
npm run build
```

## Pull requests

Describe the user-visible outcome, affected trust boundaries, tests run, and any migration impact on files under `data/`. Screenshots are useful for UI changes, but use only the Nova demo persona and sandbox fixtures.

By contributing, you agree that your contribution can be distributed under the project license selected before public contributions are accepted.
