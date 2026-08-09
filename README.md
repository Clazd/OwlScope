# Nova

A private, local-only web app that acts as the office of an AI writer.

You define who the writer is. It finds one thing worth saying, checks whether it is true,
checks whether you already said it, writes it in your voice, criticises its own work, and
hands you a finished post with its reasoning attached. You approve and publish by hand.

**It is not a tweet generator.** A tweet generator answers "give me something to post."
This answers "is there anything worth posting today, and if so, why this."

> **Status: slice 6 — complete local product.**
> Slice 1 shipped the shell, design system, storage layer, provider adapter, sandbox mode,
> settings and run inspector. Slice 2 added Brain: the structured, versioned source of truth
> for the AI identity. Slice 3 added the evidence-locked Studio pipeline. Slice 4 adds Radar:
> cached keyless discovery, transparent scoring, deliberate skip outcomes, seed handoff, and an
> expiring idea bank. Slice 5 composes those stages into the cached, cadence-aware Today loop.
> Slice 6 adds indexed Memory, portable exports, guarded feedback/evolution, optional metrics
> observations, deterministic evals, and the final reliability/accessibility pass.

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
| `AI_API_KEY` | Required outside sandbox for model stages and native model search. Never reaches the browser or UI. |
| `AI_MODEL_STRONG` | Optional. Overrides the strong model from Settings. |
| `AI_MODEL_FAST` | Optional. Overrides the fast model from Settings. |
| `AI_BASE_URL` | Optional. Defaults to the Anthropic API. |
| `GITHUB_TOKEN` | Optional. Raises GitHub Radar rate limits; anonymous search remains available. |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Optional Reddit script-app credentials. Radar falls back to anonymous public feeds when both are blank. |
| `REDDIT_USER_AGENT` | Identifies authenticated Reddit requests; include your Reddit username. |
| `SANDBOX_MODE` | `true` pins sandbox on and disables the Settings toggle. |

You can run the whole app with no API key at all by setting `SANDBOX_MODE=true`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server, bound to `127.0.0.1` |
| `npm run build` / `npm start` | Production build and serve, also localhost-only |
| `npm test` | Storage, provider, sandbox, SSRF-guard, persona, Studio and full-pipeline tests |
| `npm run eval` | Eleven named deterministic safety cases in sandbox mode; non-zero on any failure |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including the "no `fs` outside `services/storage`" rule |
| `npm run sync:pull` | `git pull --rebase`, then drop the derived cache index |
| `npm run sync:push` | Stage `/data`, commit with a timestamp, push |
| `npm run fonts` | Re-copy fonts into `public/fonts` |

---

## How it is built

### Memory, feedback, and exports

Memory is a derived, validated index over every content item plus honest Today skip days. Keyword
search and pillar, status, angle, date, and feedback filters run in the browser over that cache,
so they make no model calls. Expanded rows show the full sentence-level Evidence Margin, stored
sources, feedback, persona version, and originating run.

The header exports all Memory entries as JSON or published posts as readable markdown. A copy is
also written to `/data/exports/`; that folder and every derived cache are gitignored. Rejections
are explicit feedback under `/data/feedback/`. Radar dismissals are kept as separate weak signals.

Seven days after publication, Today can ask once for optional manual metrics. Patterns remains
absent until ten measured posts exist, suppresses observations below the configured confidence
floor, states its sample size, and never phrases an observation as an instruction.

### One process, no services

Next.js App Router with TypeScript. Route handlers do the server work, so the API key never
reaches the browser. No ORM, no database, no auth library, no state management library —
React state and route handlers are enough for one user on one machine.

### Brain: the persona record

Brain is a structured record, not one giant system-prompt textarea. It holds identity,
weighted pillars, beliefs, boundaries, voice rules, an experience log, writing samples and a
derived voice fingerprint — each with its own Zod schema under `/data/persona/`.

The **Persona Inbox** accepts a self-profile from ChatGPT or any other source as prose,
Markdown, valid JSON, or broken JSON. One structured strong-model call turns it into an
additive proposal across identity, knowledge pillars, beliefs, boundaries, voice preferences,
and first-hand experience. Exact links in the paste are read through the same SSRF-safe,
cached URL fetcher as Studio (five maximum); model-invented links are dropped. The proposal
must still pass through Brain's normal field-level diff and version save, so an import can
never silently overwrite the active persona.

Three copyable ChatGPT prompts cover a memory-based profile, a memory audit followed by a
one-question-at-a-time interview, and a strict JSON export. Every prompt requires ChatGPT to
name the context it could actually access, separate explicit facts from inference, and avoid
claiming it reviewed every chat. Reset Inbox clears only the unsaved paste. Settings also has
a typed-confirmation **Reset writing memory** action: it removes published/draft content,
feedback, metrics, exports, pending evolution suggestions, and Today history while preserving
Brain identity, experience, samples, research sources, topics, settings, and run audit.

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

### Studio: the six stages

Studio is the pipeline. You type a topic and it comes out the other end as a post, having
been checked at every step by a stage that can only do one thing.

```
Persona context ──→ Research ──→ Angles ──→ Fact validation ──→ Writing
                                                                   │
                                    Similarity check ←── Style critique
                                            │
                                    Final candidate ──→ HUMAN ──→ manual post on X
```

**Stage separation is the whole design.** The researcher never writes posts. The writer never
searches. The critic never rewrites. The validator never invents. This is not enforced by
asking nicely in a prompt — it is enforced by the output schemas. `ResearchOutput` has nowhere
to put a draft. `CritiqueOutput` has nowhere to put a rewritten post. A model cannot drift past
a field that does not exist.

Every stage output is Zod-validated before the next one consumes it. On failure: one repair
attempt with the schema error fed back, then the stage fails loudly with a usable error and
the work already done is preserved.

**The boundary check runs first.** A topic that touches a persona boundary is blocked in stage
one, and there is no code path from there to the writer. Two passes, cheapest first: a free
keyword check, then a fast-model classifier only when the keyword pass found nothing — because
"is this political" needs judgement, and a keyword list pretending to have judgement is how you
block an article about software licensing. If the check cannot run, it fails closed.

### The Evidence Lock

**A draft is an array of sentences, not a blob of text.** Everything in Studio depends on it:

```json
{
  "id": "s1",
  "text": "Most agent frameworks fail on long tasks because context windows are not memory.",
  "claimType": "fact",
  "sourceIds": ["src_ca5dcd"],
  "support": "supported"
}
```

- The fact validator works per sentence instead of on a wall of text, which is why it works at
  all. Asked to check a paragraph, a model produces a paragraph of hedging. Asked "does
  `src_83a6b4` carry sentence s1", it answers.
- Finalisation is blocked by any sentence that states a fact nothing supports.
- The margin can annotate sentence by sentence, which is the app's signature interaction.

A flattened `text` is stored alongside for copying, and it must be exactly the sentences joined
with spaces. That check lives *in the Zod schema*, so a draft that disagrees with itself fails
validation like any other malformed response and goes down the same repair-once-then-fail path.
Character counts and sentence ids are recomputed in code, never trusted — models cannot count,
and a duplicated sentence id would silently break every cross-reference in the UI.

### Research, and what happens when there is nothing

Research goes through a `SearchProvider`. Three ship in this slice:

- **`native-model-search`** uses the AI provider's own web search tool. Billed through the
  existing key: no second secret, no search vendor. The interesting part is not the call. The
  search tool returns URLs and the model returns snippets; those are two different kinds of
  thing and they are kept apart. **A URL the model produced that no search returned is dropped
  and logged.** That is rule 8 made mechanical rather than requested politely.
- **`manual-url`** fetches a link you paste, through the SSRF guard from slice 1 — private and
  loopback ranges blocked on every redirect hop, three redirects, 2MB, ten seconds. Pages are
  cached in `/data/.cache/pages/` for 24 hours.
- **`fixture`** serves `/fixtures/search/*.json` in sandbox mode, so the whole of research —
  not just the model call — runs with zero network.

If no provider returns anything for a current-events topic, the pipeline says so and refuses to
write as if it had evidence. "Nothing worth posting" is a designed success state; filling the
gap from model recall is not.

### Similarity, without an embedding API

Three layers, cheapest first, no external call until layer three:

| Layer | Method | Cost | Catches |
|---|---|---|---|
| L1 | Stemmed token Jaccard over topic and thesis | Free | Obvious duplicates |
| L2 | Character-trigram cosine over the post, plus a separate opening comparison | Free | Reworded repeats and reused hooks |
| L3 | Fast model over the closest survivors | One cheap call | The same argument in different words |

Character trigrams rather than word tokens, because that is what survives a rewrite: "context
windows are not memory" and "context windows aren't memory" share almost every trigram and
about half their word tokens.

**L3 never sees more than eight prior posts, and often does not run at all** — not when the
free layers are already certain, and not when nothing is remotely close. L1 and L2 vectors are
stored on each content item so the check is computed once. If an embedding service is ever
added it becomes a fourth implementation behind `SimilarityService` and no caller changes.

### Quality gates

Blocking: an unsupported factual claim, high similarity, a boundary violation, fabricated
experience, a materially inconsistent voice, stale information presented as current, or a
critic recommendation of reject. Warnings never block — a product that blocks on "the opening
is weak" teaches its user to click through blocks.

The unsupported-claim gate is the only one an override can clear, the override is recorded on
the content item, and it names the sentences it covers — so confirming one unsupported claim
does not silently clear the next one the writer produces.

### The Evidence Margin

The Final stage renders the post as an annotated manuscript: Newsreader at 19px, a 200px right
margin, and a 3px rule per sentence in its epistemic colour. Hovering or focusing a sentence
raises its annotation and dims the others; arrow keys move between sentences; clicking a margin
annotation opens the source.

**It is a persistent margin, not a tooltip.** A tooltip would mean you can only see one claim's
provenance at a time, which is the opposite of what the screen is for. On mobile it collapses to
a tappable epistemic dot that opens a bottom sheet.

A sentence nothing supports is underlined in `--unsupported`, and **nothing else in the product
is underlined**, so it cannot be missed.

The Preview toggle shows an X-accurate card: the platform's own sans stack at 15px — the one
deliberate type exception in the product — and the platform's character weighting, where a URL
counts as 23 characters however long it is. No like buttons, no engagement counts. It is a
preview, not a simulation, and an invented number of likes is the same class of lie as an
invented source.

### Publishing is a state machine, enforced server-side

```
draft → reviewing → accepted → published
alternates: rejected · archived
```

Generated is never treated as published: a finalised post starts at `draft` and nothing moves it
on its own. **Copying is not a transition and is not in that file** — the copy button writes to
the clipboard and touches no route at all, so it cannot change a status by accident. Only "Mark
published" sets `publishedAt`, and it optionally records the public URL.

### Prompt architecture

Composable modules assembled per task, never one concatenated blob — because the stages
genuinely need different subsets. The researcher gets no voice fingerprint. The writer gets the
experience log only when the topic could invite a first-hand claim; sending it to a model
writing about something abstract is an invitation to work one in.

The truthfulness core is a single exported constant included verbatim in every factual task, so
"identical everywhere" is a fact about the code rather than a promise in a document.

A context assembler gives each section an explicit token budget — persona 800, memory 1500,
evidence 2500, instructions 1200, output 800 — trims at a labelled boundary rather than
silently, and logs what each stage actually spent. Memory is capped at 30 posts by the loader,
so no prompt can accidentally carry the whole archive.

### Storage is git-tracked JSON files

There is no database. All application data lives under `/data`, one file per item:

```
/data
  settings.json
  persona/     persona.json, fingerprint.json, samples.json, experience.json, versions/vNNN.json
  topics/      topic-<id>.json
  studio/      session-<id>.json — in-progress Studio runs
  content/     2026-08-09-<id>.json
  sources/     source-<id>.json
  runs/        2026-08-09/run-<id>.json
  metrics/     <contentId>.json
  feedback/    <contentId>.json and radar-<topicId>.json
  exports/     portable JSON and markdown exports (gitignored)
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

For the second machine: clone the same private repository, run `npm install`, copy its local
`.env`, then run `npm run sync:pull` before opening the app. During normal use, pull before a
session and push after it. If a rebase conflicts, the command stops and prints every conflicting
path; resolve those JSON files deliberately, continue or abort the rebase in git, and rerun pull.

### Deterministic evals

`npm run eval` runs cases A–K against fixtures and pure domain checks. The command names every
case and failing assertion, performs no external network requests, and exits non-zero on any
failure. Add a named case whenever a production bug is fixed so prompt and gate changes cannot
quietly reintroduce it.

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
| `C` | Copy the final post |
| `P` | Mark published |
| `X` | Reject |
| `↑ ↓` | Move between sentences in the manuscript |
| `1`–`6` | Jump to a completed Studio stage |

The palette is registry-based: each feature page registers its commands with
`useRegisterCommands`, and the palette picks them up with no central switch statement.

---

## Project layout

```
src/
  app/            routes, api handlers, tokens.css, globals.css
  components/
    common/       shared accessible primitives and the component inventory
    persona/ radar/ studio/ today/ memory/ settings/ inspect/
  domain/         persona, radar, studio, today, memory, feedback, metrics, evolution,
                  settings and budget — schemas and workflow rules, independent of React
  services/
    ai/           provider.ts, anthropic.ts, sandbox.ts, pricing.ts
    storage/      JSON stores, atomic writes, source signatures, caches, quarantine and export
    runs/         recorder.ts, schema.ts
    search/       native/model, manual URL, fixture, HN, Reddit, arXiv, GitHub and RSS/Atom
    orchestration/ Today’s idempotent, cadence-aware daily pipeline
    memory/       similarity.ts — the three-layer check
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
