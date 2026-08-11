# Changelog

All notable changes will be documented here. The project follows [Semantic Versioning](https://semver.org/) from its first tagged release.

## [Unreleased]

### Added

- Open-source release documentation, architecture and AI pipeline guides, security policy, contribution guide, and GitHub templates.
- Public-release privacy defaults for local application data and an explicit private-repository Git sync opt-in.
- Post images: each source page is read for the image it nominates for sharing, shown with its domain and credit, and served from the app's own origin so the browser never requests it from a publisher directly. Copy, save, or open the source. When no source offers one, a fast-tier stage writes a prompt for generating an image instead — on demand only, never during a daily run.
- Threads: a finalised post can be expanded into an X thread. The first post ships unchanged; the continuation is written in one call and then checked by the validator, so every post carries its own typed, cited sentences, its own character count and its own findings. Images are assigned from each post's own citations — one per post before any post gets two, four at most — and every post can be given its own image prompt, so a five-post thread is not a five-post thread with one picture.

### Changed

- Rebranded from Grounded Voice to OwlScope
- Single permanent dark theme — removed light/dark/system switcher
- UI accent color derived from OwlScope logo scope-green (#2ECC71)
- Deeper background (#0A0C10) to blend with logo identity
- Focus rings now use accent green for brand consistency
- Active nav indicator uses accent green

### Fixed

- Persona Inbox: a long paste no longer fails with a truncated proposal. The import stage sized its reply against a fixed 2,800-token cap while the paste it had to restate could run to 50,000 characters, so large profiles were cut off mid-JSON and rejected as invalid. The output budget now scales with the paste, up to a ceiling every configured model accepts. A paste beyond even that ceiling is answered with a request to import it in smaller pieces rather than with a note about a token setting.

## [0.1.0] - Unreleased

Initial pre-release implementation: versioned Brain, multi-source Radar, evidence-locked Studio, cadence-aware Today, indexed Memory, sandbox fixtures, deterministic evals, and local JSON storage.
