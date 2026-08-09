# Fixtures

Recorded provider responses. With sandbox mode on, every AI call is served from
this directory instead of the network: the full pipeline runs, the full UI
renders, zero API calls, zero cost.

This is how the app is meant to be developed, and it is how the tests run.

## Naming

```
fixtures/<stage>/<case>.json
```

`<stage>` is the pipeline stage name passed to the provider (`connection`,
`research`, `angle`, `write`, `critique`, …). `<case>` is the scenario. Every
stage needs a `default.json`; other cases are requested explicitly with
`fixtureCase` and exist to exercise the paths that are hard to trigger on
purpose — a timeout, a malformed response, an empty result.

## File shape

```json
{
  "text": "the raw text the model returned",
  "model": "sandbox-fast",
  "tokensIn": 820,
  "tokensOut": 96,
  "latencyMs": 610,
  "error": null
}
```

| Field | Required | Notes |
|---|---|---|
| `text` | yes | The raw completion. For structured stages this is a JSON string, exactly as a model would emit it — including any code fence you want the parser to survive. |
| `model` | no | Reported in the Inspector. Defaults to the configured model for the tier. |
| `tokensIn` / `tokensOut` | no | Defaults to a length estimate. Set them when you want the token meter to be realistic. |
| `latencyMs` | no | Reported as the stage latency. The sandbox sleeps for up to 120ms of it so loading states stay honest without slowing the tests down. |
| `error` | no | `{ "category": "...", "message": "..." }`. When present the call throws instead of returning, which is how error states get built without unplugging anything. |
| `hits` | no | Web-search stages only: `[{ "url", "title", "pageAge" }]`, standing in for what the provider's search tool returned. |
| `searchCount` / `toolError` | no | Web-search stages only. `toolError` exercises the `max_uses_exceeded` path. |

### Search fixtures are a different shape

`fixtures/search/*.json` are read by the **search provider**, not by the AI
provider, so they do not have a `text` field:

```json
{ "results": [ { "title": "…", "url": "https://…", "snippet": "…", "publishedAt": "…" } ] }
```

This is what makes "the whole flow runs with zero network calls" true rather
than aspirational — with sandbox on, the search half of research is a fixture
too. It is also the only way to build the awkward cases at all: an empty result
set, a single thin forum link, a source published six hours ago.

**Source ids are derived from the URL** (`src_` plus the first six hex
characters of its SHA-256), so a fixture in a later stage can cite `src_ca5dcd`
and actually match the source the search fixture produced. Compute one with:

```bash
node -e 'console.log("src_"+require("crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0,6))' "https://example.com/thing"
```

## Rules

- Fixtures are committed. They are part of the test surface, not scratch data.
- A fixture for a structured stage must be valid against that stage's schema,
  unless it is deliberately a malformed-response case.
- Never paste a real API response containing anything private into a fixture.
  These files are in git.
- Sandbox mode is always visible in the sidebar, so fixture output can never be
  mistaken for real output.

## Current fixtures

| Stage | Case | Purpose |
|---|---|---|
| `connection` | `default` | The Settings "test connection" happy path |
| `connection` | `slow` | A response that reports 4.2s latency |
| `connection` | `unreachable` | Provider network failure |
| `fingerprint` | `default` | A qualitative voice fingerprint for the demo samples |
| `fingerprint` | `malformed` | Preamble plus broken JSON, for the repair path |
| `persona-import` | `default` | A self-profile converted into additive Brain changes |
| `test-voice` | `default` | Three posts that match the demo fingerprint and score 100 |
| `test-voice` | `off-voice` | Three posts that break it, so the deviation UI has something to show |
| `search` | `default` | Three sources: one secondary outlet, one paper, one forum thread |
| `search` | `empty` | No results, for the "research is unavailable" path |
| `boundary` | `default` | A topic that touches nothing |
| `boundary` | `blocked` | A topic inside the politics boundary |
| `research` | `default` | Facts, inferences, uncertainties and a freshness read over the search fixture |
| `research` | `insufficient` | Evidence that will not carry a factual post |
| `research` | `malformed` | Preamble plus broken JSON, for the repair path |
| `angles` | `default` | Five angles across five kinds |
| `angle-pick` | `default` | The AI choosing one, with its reasoning |
| `drafts` | `default` | Three drafts; the third deliberately claims an uncited fact |
| `revise` | `default` | One revised draft, for every revision action |
| `validate` | `default` | Per-sentence verdicts that clear the first draft |
| `critique` | `default` | One warn and one note, recommendation `accept` |
| `similarity` | `default` | An empty L3 judgement |
| `reasoning` | `default` | The first-person reasoning block |
| `radar-hacker-news` | `default` | A Hacker News candidate |
| `radar-reddit` | `default` | A Reddit candidate that duplicates the HN story by title |
| `radar-arxiv` | `default` | An arXiv primary-source candidate |
| `radar-github` | `default` | A public GitHub repository candidate |
| `radar-dev-community` | `default` | A DEV Community article candidate |
| `radar-lobsters` | `default` | A Lobsters discussion candidate |
| `radar-openalex` | `default` | An OpenAlex academic-work candidate |
| `radar-rss` | `default` | An RSS candidate that duplicates the same story |
| `radar-evergreen` | `default` | Evergreen topics and angles, never post text |
| `radar-fast-score` | `default` | Persona fit and inverted claim-risk scores |
| `radar-strong-score` | `default` | Usefulness and angle strength for the top five only |
| `today` | `success` | The complete cached daily loop ending in an accepted recommendation |
| `today` | `skip` | A threshold-driven skip with real candidate counts |

The Studio fixtures are internally consistent: `research` cites the source ids
that `search` produces, and `drafts` cites the same ones. `src/domain/studio/
pipeline.test.ts` runs the entire six-stage pipeline against them with no
network access, which is what keeps them honest — a fixture that drifts out of
step with its schema or its source ids fails that test.

Only `default` is reachable through the UI. To exercise another case, swap it
over `default.json` temporarily, or pass `fixtureCase` from the calling domain
service.
