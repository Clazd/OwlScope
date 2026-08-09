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
| `research` | `default` | A minimal structured response |
| `research` | `malformed` | Preamble plus broken JSON, for the repair path |
