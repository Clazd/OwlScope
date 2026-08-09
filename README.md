# Persona Studio

A private, local-only web app that acts as the office of an AI writer.

You define who the writer is. It finds one thing worth saying, checks whether it is true,
checks whether you already said it, writes it in your voice, criticises its own work, and
hands you a finished post with its reasoning attached. You approve and publish by hand.

**It is not a tweet generator.** A tweet generator answers "give me something to post."
This answers "is there anything worth posting today, and if so, why this."

> **Status: slice 2 of 3 — Brain.**
> Slice 1 shipped the shell, design system, storage layer, provider adapter, sandbox mode,
> settings and run inspector. Slice 2 adds Brain: the structured, versioned source of truth
> for the AI identity, plus onboarding, the voice fingerprint and a working voice test.
> Radar, Studio, Today and Memory arrive in slice 3; those pages are deliberately finished
> frames with empty states, not stubs waiting to be styled.

---

## Setup

```bash
npm install
cp .env.example .env      # then fill in AI_API_KEY, or set SANDBOX_MODE=true
npm run dev               # http://127.0.0.1:3000
```

Node 20.9 or newer. Nothing else to install, no database to start, no account to create.

`npm install` also copies the three fonts out of `node_modules` into `public/fonts`, so the
app serves its own type and works with no network.

### Environment

`.env` is gitignored. `.env.example` lists exactly these keys and no others:

| Key | Notes |
|---|---|
| `AI_PROVIDER` | `anthropic`. One adapter ships in this build. |
| `AI_API_KEY` | The only credential. Never reaches the browser, never shown in the UI. |
| `AI_MODEL_STRONG` | Optional. Overrides the strong model from Settings. |
| `AI_MODEL_FAST` | Optional. Overrides the fast model from Settings. |
| `AI_BASE_URL` | Optional. Defaults to the Anthropic API. |
| `SANDBOX_MODE` | `true` pins sandbox on and disables the Settings toggle. |

You can run the whole app with no API key at all by setting `SANDBOX_MODE=true`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server, bound to `127.0.0.1` |
| `npm run build` / `npm start` | Production build and serve, also localhost-only |
| `npm test` | Storage, provider, sandbox, SSRF-guard and persona-domain tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including the "no `fs` outside `services/storage`" rule |
| `npm run sync:pull` | `git pull --rebase`, then drop the derived cache index |
| `npm run sync:push` | Stage `/data`, commit with a timestamp, push |
| `npm run fonts` | Re-copy fonts into `public/fonts` |

---

## How it is built

### One process, no services

Next.js App Router with TypeScript. Route handlers do the server work, so the API key never
reaches the browser. No ORM, no database, no auth library, no state management library —
React state and route handlers are enough for one user on one machine.

### Brain: the persona record

Brain is a structured record, not one giant system-prompt textarea. It holds identity,
weighted pillars, beliefs, boundaries, voice rules, an experience log, writing samples and a
derived voice fingerprint — each with its own Zod schema under `/data/persona/`.

Three parts of it are load-bearing for everything later:

- **The voice fingerprint.** Sliders alone produce beige output. Paste 15–40 real posts and
  the fingerprint learns the rhythm sliders cannot express. Everything countable — sentence
  and post length, punctuation frequency, emoji and hashtag use — is **computed in code and
  never by the model**, because models are bad at counting; the model receives those numbers
  as grounding and returns only the qualitative read. Every field is editable, and once you
  touch one, re-analysis asks before replacing your edits.
- **The experience log.** The writer may only claim first-hand experience that appears here.
  Everything else is written as observation. That closes the fake-experience hole
  structurally rather than with a prompt line a model can drift past.
- **Versioning.** Every save is a full snapshot at `/data/persona/versions/vNNN.json`, and
  every generated post records the version that wrote it. Saving shows a field-level diff
  first — "6 changes will create version 4" — and restoring an old version writes it forward
  as a new one. History is append-only and never overwritten.

Two functions are exported for slice 3 to call without touching Brain's internals:

```ts
getFingerprintPromptBlock(fingerprint)   // constraint block for the writer prompt
scoreAgainstFingerprint(text, fingerprint) // 0–100 plus named deviations, zero model calls
```

`scoreAgainstFingerprint` is entirely mechanical, so it costs nothing and can run on every
draft. Its deviations are specific enough to act on: not "the tone is off" but
`Sentence 2 is 41 words, outside your p90 of 24.` or
`Opening matches your avoided pattern "Here's the thing".`

**Test voice** takes a topic and returns two or three sample posts, each scored against the
fingerprint with its deviations named. Nothing is saved to content history — it is a tuning
surface, and the only way to validate a persona before slice 3 exists.

**Onboarding** is eleven steps, one question per screen, about five minutes. It is resumable
(partial state saves at every step), re-runnable from Settings without wiping anything, and
never asks for an account on any platform. The first screen offers the **Nova demo persona**,
a complete worked example with twenty writing samples, so you can see the product working
before investing in configuration. It loads and deletes cleanly and nothing in the app
branches on whether the persona is Nova.

### Storage is git-tracked JSON files

There is no database. All application data lives under `/data`, one file per item:

```
/data
  settings.json
  persona/     persona.json, fingerprint.json, samples.json, experience.json, versions/vNNN.json
  topics/      topic-<id>.json
  content/     2026-08-09-<id>.json
  sources/     source-<id>.json
  runs/        2026-08-09/run-<id>.json
  metrics/     <contentId>.json
  .cache/      gitignored. derived indexes, quarantined files
```

One file per item makes git diffs readable and makes merge conflicts almost impossible when
syncing between two machines.

Everything goes through `createJsonStore<T>(dir, schema)` in
`src/services/storage/json-store.ts`. Feature code never touches `fs` — a lint rule enforces
it. If a real database is ever needed, that one file changes.

The rules it implements:

- **Atomic writes.** Write to `<file>.tmp`, then `rename()`. A reader sees the whole old file
  or the whole new one, never a half-written document.
- **Validated reads.** Every file is parsed against a Zod schema. A file that fails is moved
  to `/data/.cache/quarantine/` with a `.reason.txt` beside it — never silently dropped, and
  never allowed to crash a list view.
- **Sortable ids.** `<unix-ms>-<6 random base36 chars>`, so `ls` reads chronologically.
- **One write queue.** A single in-process queue serialises every write. No file locking, and
  nothing to clean up after a crash.
- **Derived indexes are disposable.** `/data/.cache/` is rebuilt from the source files on
  every boot and is never the source of truth.

### Syncing between machines

Data is in the repo, so syncing is git.

```bash
npm run sync:pull    # git pull --rebase, then drop the derived index
npm run sync:push    # stage /data, commit with a timestamp, push
```

Both are also buttons in Settings, with the last sync time. **Conflicts are reported, never
merged automatically** — two machines editing the same persona is a decision you have to
make, and a tool that guesses at it is worse than one that stops. You get the list of
conflicting paths and resolve them in git.

### No auth

The app binds to `127.0.0.1` only. There is no login screen, no session and no passcode. If
the server is started on any other host, it logs a loud warning at boot explaining that
anyone who can reach the host can read and edit everything.

### Sandbox mode

A settings toggle and an env flag. When on, every provider call is served from `/fixtures`
instead of the network: the full pipeline runs, the full UI renders, zero API calls, zero
cost. This is how the app is meant to be developed and how the tests run.

Sandbox state is always visible as a mono label in the sidebar, so fixture output can never
be mistaken for real output. See `fixtures/README.md` for the naming convention.

### The run inspector

`/inspect`, also in the command palette, deliberately not in the nav. Every run in
`/data/runs/` expands to its stages: the exact rendered prompt, the raw response, the parsed
output, schema validation errors, latency, token counts and cost.

It exists from slice 1 rather than the end because it is what makes prompt work debuggable
at all. `/inspect/components` is the component gallery — every component in the inventory, in
every state it has.

**Chain of thought is never stored and never displayed.** Structured decisions, scores,
critiques and operational metadata only. That rule is enforced by the run schema having
nowhere to put reasoning text.

### Cost control

Two models, routed per stage: **fast** for scoring, classification and similarity triage;
**strong** for angle generation, writing, critique and fact validation.

The token meter in the sidebar shows today's spend against the daily budget, derived from the
run files rather than a counter that could drift. At 80% the meter fills to `--partial`. At
100% expensive actions are disabled with an explicit override. Sandbox runs never count
against a real budget.

Every expensive action takes an idempotency key, so a double click or a refresh mid-run
resolves to the run that already exists instead of paying for a second one. The cooldown
between runs is the one limit that is never overridable, because it exists to stop
double-fires.

---

## The design system

**The organising idea: saturated colour means epistemic status and nothing else.**

Four saturated hues exist in the entire application — supported, partly supported,
unsupported, opinion — and each means exactly one thing. Buttons are ink. Selection is ink.
Scores are ink. When you see colour, you are looking at a claim about truth.

All tokens live in `src/app/tokens.css` and are mapped into the Tailwind theme in
`globals.css`. **No component contains a raw hex value**, which is what makes the theme
switch work and what keeps colour meaning one thing.

- **Type.** IBM Plex Sans for interface, IBM Plex Mono for anything that is machine output or
  a measurement, Newsreader for manuscript prose. That distinction is absolute.
- **Space.** 4, 8, 12, 16, 24, 32, 48, 64 and nothing else. Tailwind's dynamic spacing scale
  is switched off, so `p-5` fails to compile rather than quietly shipping.
- **Shape.** 6px controls, 10px cards, 999px pills. Cards are defined by 1px borders, never
  shadows. Shadows exist only on popovers, drawers and toasts, at one elevation.
- **Motion.** 120ms for state, 200ms for panels. The only ambient animation in the product is
  the 1.6s pulse on the active pipeline stage. `prefers-reduced-motion` removes all of it.
- **Focus.** A 2px ink outline at 2px offset, on everything, never removed.

### Keyboard

| Key | Action |
|---|---|
| `Cmd/Ctrl K` | Command palette |
| `G` then `T` / `B` / `R` / `S` / `M` | Go to Today, Brain, Radar, Studio, Memory |
| `Esc` | Close drawer, sheet, or palette |
| `?` | Show the shortcut list |

The palette is registry-based: a later slice registers its commands with
`useRegisterCommands` from its own page and the palette picks them up with no edits to the
palette itself.

---

## Project layout

```
src/
  app/            routes, api handlers, tokens.css, globals.css
  components/
    common/       the component inventory — later slices import, and build nothing
    persona/ settings/ inspect/
  domain/         persona (schema, statistics, fingerprint, weights, diff, versions), settings, budget
  services/
    ai/           provider.ts, anthropic.ts, sandbox.ts, pricing.ts
    storage/      json-store.ts, atomic-write.ts, index-cache.ts, quarantine.ts, zip.ts
    runs/         recorder.ts, schema.ts
    search/       provider.ts (stub until slice 3)
    memory/       similarity.ts (stub)
    sync/         git.ts
  lib/            validation, logging, format, net (SSRF guard), boot
data/             application data, one file per item
fixtures/         recorded provider responses for sandbox mode
```

The AI workflow never lives inside React components or route handlers. Route handlers call
domain services and nothing else.

---

## Ten rules that never bend

1. Identity before generation. Output is grounded in the persona record, not the last prompt.
2. Evidence before assertion. Current factual claims come from retrieved sources or they do not ship.
3. Silence is a valid output. "Nothing worth posting" is a designed success state.
4. Memory before repetition. Every candidate is checked against what was already said.
5. Human approval is mandatory. No autonomous publishing.
6. Feedback tunes selection, not identity. Only the user changes the persona, and changes are versioned.
7. Show the reasoning. Every recommendation explains its topic choice and angle choice.
8. Never fake anything. No invented sources, statistics, quotations, URLs, or personal experience.
9. No content-farm behaviour. No engagement bait, hook templates, manufactured outrage, hashtag stuffing.
10. Cheap to run. Every pipeline run has a visible token budget.

---

## Known limitations

See [`LIMITATIONS.md`](./LIMITATIONS.md).
