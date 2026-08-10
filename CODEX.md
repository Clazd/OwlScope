# OwlScope - compact project context

## Product

Private, local-only office for an AI writer. It researches, verifies, checks memory, drafts in the owner's voice, critiques itself, and requires human approval before manual publishing to X.

## Non-negotiable rules

- Identity before generation; evidence before assertion; memory before repetition.
- Silence/skip is a valid successful result.
- Human approval is mandatory; never fake evidence or publishing.
- Feedback tunes selection, not identity. Show reasoning. Avoid content-farm behaviour.
- Keep operation cheap.
- Do not use em dashes in generated posts, product copy, docs, or examples.

## Architecture and design

- Next.js/TypeScript app. JSON storage only under `data/`, one file per item, atomic writes, Zod-validated reads, through `createJsonStore`.
- `data/` is private runtime state and is gitignored by default. Git data sync is an explicit private-repository opt-in.
- Saturated colour communicates epistemic status only. Score bars stay ink-coloured.
- IBM Plex Sans for UI, IBM Plex Mono for machine output/measurements; 1px hairlines; no card shadows or gradients.
- Prefer existing primitives/services and preserve compatibility with prior slices.

## Current release: Slices 1–6 complete

- `/memory` uses a validated derived index from content, Today skip days, topics, sources, feedback, and persona labels. A metadata signature reuses it until a source changes; search/filters are pure client-side operations. Never add embeddings for archive search.
- Memory expands to the existing Evidence Margin and stored provenance. JSON and published-markdown exports are written under gitignored `data/exports/` and returned as downloads.
- Optional metrics live one file per content item. Today asks once after seven days; Patterns exists only at ten measured posts and suppresses findings below Settings' confidence floor.
- Evolution runs only on demand, requires 15 feedback events, proposes specific numeric slider changes, and changes nothing until explicit acceptance creates a persona version. Three declines or suppression permanently retires the target.
- `npm run eval` runs named cases A–K in sandbox/pure code with zero network and fails non-zero with the assertion name.
- Error categories include context overflow; retries remain bounded to idempotent provider operations. Sync conflicts print exact paths and never auto-merge.
- DeepSeek uses its Anthropic-compatible endpoint. Schema-bound DeepSeek calls force typed tool input with thinking disabled; open-ended web search retains normal reasoning.
- Radar interleaves enabled-pillar terms and searches native web, Hacker News, Reddit, arXiv, GitHub, DEV Community, Lobsters, OpenAlex, and user RSS. Feed discovery remains keyless; optional GitHub and Reddit credentials only raise limits and reliability.
- Brain's Persona Inbox is the primary empty-Brain path. It accepts prose or JSON as an additive AI proposal, reads at most five exact pasted URLs through the SSRF guard, drops invented URLs, maps voice descriptions into rules/sliders/switches/samples, and can only reach disk through the ordinary reviewed persona-version save. Voice fingerprint remains derived from real samples, never invented from profile prose.
- Settings are written atomically to `data/settings.json` only from the explicit Save Settings action, then the shell refreshes. Starting over with a person clears only Brain/persona files after the typed phrase `start new person`; settings, writing memory, runs, topics, and sources stay intact.
- Persona Inbox ships copyable memory-audit, follow-up interview, and JSON-export prompts. Resetting writing memory requires a typed phrase and deletes content, feedback, metrics, exports, evolution suggestions, and Today cache while preserving Brain, research records, settings, and run audit.
- Today cold opens are locked in process before the day record is written; concurrent requests attach to one run.
- Accessibility invariants: visible focus, labelled epistemic states, no colour-only status, no animation under reduced motion, horizontal Studio stages and card-based Memory at 390px.

## Verification target

Full tests/typecheck/lint/build plus `npm run eval`. Verify Memory archive/filters/expansion/export, conditional Patterns, Brain evolution, Today autopsy, keyboard focus, dark theme, and 390px layout.
