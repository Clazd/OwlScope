# Known limitations — slice 1

Honest accounting of what is not finished, what is deliberately deferred, and the two places
where the implementation differs from the slice 1 brief.

---

## Deliberate deviations from the brief

**1. The bottom bar is in nav order, not the order the brief lists.**
Section H specifies "bottom bar with five items (Today, Radar, Studio, Memory, Brain)". The
bottom bar ships with the same five items in the same order as the sidebar rail — Today,
Brain, Radar, Studio, Memory — because an area moving position between the rail and the bar
costs more than the parenthetical ordering buys. One line in `NavRail.tsx` if you want it the
other way.

**2. Two components exist that the inventory does not list.**
`Field` (label, text input, toggle, radio row) and `PageBody`. Settings needs form controls,
and they belong next to the components that share their tokens rather than inlined into one
page. Both are in `components/common` and both appear in the gallery.

---

## Stubs, as scoped

- `SentenceManuscript` renders the reading surface and the evidence margin, but has no
  click-through to sources, no hover highlighting and no per-sentence source lists. Slice 3.
- `XPreviewCard` renders the frame, the platform type exception and the character count.
  It is not pixel-faithful to X. Slice 3.
- `services/search/provider.ts` is an interface with no implementation. Adding a paid search
  API is explicitly out of scope; the eventual answer is the model's own search capability or
  hand-fetched URLs through the SSRF guard.
- `services/memory/similarity.ts` ships only a lexical Jaccard baseline. The real check lands
  with Memory and will be local — no embedding API, no vector database.
- `personaVersion` on every run is `0`. There is no persona record until slice 2.
- The persona chip in the sidebar shows the product name. It shows the persona's name once
  there is a persona.

## Things that work but would not survive scale

- **`findRunByKey` and `getBudgetStatus` read every run file.** Both are O(all runs) on every
  expensive action. At personal scale — a few runs a day — this is nothing. At tens of
  thousands of runs it wants the cache index, which already exists and is not yet used for it.
- **`pathOf` falls back to a directory scan.** Ids map to files by filename suffix, so a
  content item whose filename carries a date needs one `readdir`. Same trade, same reasoning.
- **The write queue is per process.** Correct because there is exactly one process, by design.
  Two dev servers against the same `/data` would interleave writes. Atomic renames mean you
  would still never see a half-written file, but a lost update is possible.

## Cost estimates are estimates

`services/ai/pricing.ts` carries a small per-model rate table matched by name prefix, with a
fallback for models it has not seen. The figure in the token meter and the inspector is
directionally right and is not a bill. Update the table when prices change.

## Sandbox

- Sandbox mode covers **provider calls only**. Nothing else in the app reaches the network,
  so that is total coverage today, but it will not automatically cover anything added later.
- A fixture that does not match its stage's schema fails loudly and is *not* repaired — a bad
  fixture is an authoring mistake, not a model failure.

## Sync

- `sync:pull` and `sync:push` shell out to `git` and assume the repo already has a remote and
  a tracked branch. There is no first-run setup flow.
- A rebase conflict leaves you mid-rebase in git, exactly as git does. The app reports the
  conflicting paths and stops.

## Testing

- 53 tests cover the storage layer, the Anthropic adapter, the sandbox provider and the SSRF
  guard — the parts where a silent bug would corrupt data or spend money.
- **There are no component or end-to-end tests.** The component gallery is the check for the
  design system, and it is a manual one. Shell rendering, the breakpoints, focus rings and
  reduced-motion behaviour were verified in a real browser during this slice but that
  verification is not automated.

## A sharp edge worth knowing about

The spacing scale is locked to 4/8/12/16/24/32/48/64 by switching off Tailwind's dynamic
scale. That means an off-scale utility like `w-10` **compiles to nothing at all** rather than
erroring — the element silently loses its width. This bit once during slice 1 (the sandbox
toggle collapsed to a hairline). If a component looks structurally wrong, check its spacing
classes against the scale first.

Similarly, `--breakpoint-wide` must stay in `rem`: variants are sorted by value, and a `px`
breakpoint sorts ahead of every `rem` one, which silently emits `wide:` before `md:` and lets
the narrower rule win at wide viewports.

## Security posture

- No authentication, by design. The app binds to `127.0.0.1` and warns loudly at boot if it
  is started anywhere else. Do not put it behind a tunnel or a reverse proxy without adding
  auth first.
- The API key lives only in `.env`, is read only in server code, and is never sent to the
  browser or shown in the UI — not even masked.
- The SSRF guard in `lib/net/safe-fetch.ts` is built and tested but **not yet used by
  anything**, because nothing fetches user-supplied URLs until slice 3. It blocks private,
  loopback, link-local and carrier-grade-NAT ranges on every redirect hop, caps redirects at
  3, caps the body at 2MB and times out at 10s.
- `/api/data` `delete-all` re-checks the typed confirmation on the server, not only in the UI,
  and every delete path asserts the target is inside `/data`.

---

# Known limitations — slice 2 (Brain)

## Deliberate deviations from the brief

**1. The brief points at `src/styles/tokens.css`; the tokens are at `src/app/tokens.css`.**
That is where slice 1 put them, next to `globals.css` which imports them. Nothing moved.

**2. More than sentence and post length is computed in code.**
The brief requires that the model never compute `sentenceLength` or `postLength`. The same
reasoning — models are bad at counting — applies to punctuation frequency, emoji use and
hashtag use, so those are counted in code too and handed to the model as grounding. The model
is left with the five fields that genuinely need judgement: `openingPatterns`,
`avoidedOpenings`, `capitalisation`, `vocabulary` and `structuralHabits`. Computed values
always win over anything the model says about them.

**3. Fingerprint statistics come from your own posts only.**
"Admired" samples are a cadence reference, but they are somebody else's sentence lengths, and
letting them move your p90 would make the writer chase a rhythm you have never written in.
They are used for statistics only when there are no owned samples at all, and the UI reports
which set was used. They are never a source of vocabulary, opinions or claims — the prompt
says so explicitly and separately from the owned samples.

**4. Weight editing is a range input, not a bespoke drag handle.**
It redistributes live and always sums to 100, which is what the brief asks for. A range input
is keyboard-operable and screen-reader-legible for free; a custom drag handle would have to
re-earn both.

**5. Two extra sections exist in `components/persona`.**
`section-chrome.tsx` (the section shell, index and list row) and `SentenceHistogram.tsx`.
Neither is in an inventory; both are shared by three or more sections.

## Stubs and scope

- The voice preview in onboarding step 10 and Test voice are the same call. Neither saves
  anything to content history, which is correct until Studio exists.
- `getFingerprintPromptBlock`, `getPersonaPromptBlock` and `getExperiencePromptBlock` are
  written and exported but only consumed by Test voice so far. Slice 3's writer and critic are
  their real callers.
- Boundaries are stored so a classifier stage can check a topic against them, but **nothing
  checks them yet** — there is no topic pipeline until slice 3. The block is in the prompt.
- `onboardingComplete` is recorded but nothing redirects a new user into onboarding. Brain's
  empty state and a Settings button are the two entry points.

## Sharp edges

- **Onboarding's "things to avoid" step overwrites its own rules on every keystroke.**
  Rules it adds are keyed `onboarding-N` and rebuilt from the textarea each time, so editing
  the textarea replaces them wholesale. Seeded rules are untouched. It is the simplest correct
  behaviour for a one-shot wizard field, but it means you cannot edit those rules individually
  until you reach Brain.
- **Onboarding autosaves create a version per step.** Resumability is per-step persistence, and
  every persistence goes through the same save path, so a full run leaves ~10 versions behind.
  They are all restorable and cost a few KB each; it is noisier than a human would be.
- **`previewChanges` and the client-side diff can disagree by one render.** The client computes
  the change count from its own state; the server recomputes from disk at save time and the
  version record stores the server's count. If another tab saved in between, the dialog's
  number is the stale one. Single user, single process — but it is not impossible.
- Restoring a version restores the *whole* snapshot, including its fingerprint and samples. If
  you restore a version that predates your fingerprint, the fingerprint goes with it. That is
  what a full-snapshot restore means, and the confirm dialog says a new version is created,
  but it can still surprise.

## Testing

- 80 new tests cover the parts where a silent bug corrupts data or lies to the user: statistics
  (including a hand-counted fixture and an independent percentile check), weight redistribution
  (including a 200-drag invariant run), fingerprint scoring, diff generation and versioning.
- **There are still no component or end-to-end tests.** The Brain layout, the section index,
  the save dialog and the onboarding flow were driven in a real browser during this slice at
  1440/1100/768/390 in both themes, but that verification is not automated.
- `analyseFingerprint` and `runTestVoice` are exercised through the sandbox provider by hand,
  not by a unit test. Their pure parts — prompt construction and scoring — are covered.
