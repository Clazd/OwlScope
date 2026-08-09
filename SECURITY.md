# Security policy

## Supported versions

Grounded Voice is pre-release software. Security fixes currently target the latest commit on the default development branch; no older release line is maintained.

## Reporting a vulnerability

Do not open a public issue for a vulnerability or suspected data exposure. Use GitHub’s private vulnerability reporting for this repository when available, or contact the repository owner privately.

Include reproduction steps, affected files or routes, impact, and a minimal proof of concept. Do **not** include real API keys, `.env` contents, persona data, writing samples, prompts, run records, or private source material.

## Security model

- The app is designed for one trusted user on `127.0.0.1`.
- There is no authentication or authorization layer.
- Do not bind it to a public interface, expose it through a tunnel, or place it behind a reverse proxy without adding authentication and reviewing every data route.
- Provider keys belong in `.env`, which is gitignored and read server-side only.
- `data/` contains private runtime state and is gitignored by default.
- Git data sync is an explicit opt-in for private repositories only.
- User-supplied URLs must use the centralized SSRF-protected fetch service.
- Sandbox mode is the expected environment for untrusted development and test fixtures.

## If a credential is committed

1. Revoke or rotate it immediately at the provider.
2. Remove it from the current tree without printing it in logs, issues, or commits.
3. Review all repository history and remote copies.
4. Coordinate history rewriting separately; deleting the current file is not sufficient.
5. Notify anyone who may have cloned the affected history.
