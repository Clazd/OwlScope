# OwlScope Visual Redesign Plan

> **Purpose**: A Replit-ready implementation document for rebranding the current "Grounded Voice" application to "OwlScope". This plan covers every file that must change, every color value, every brand reference, and the exact order to apply changes safely.
>
> **Critical constraint**: All existing functionality, routes, data flows, and UX behavior must be preserved exactly. This is a visual reskin, not a feature change.

---

## Table of Contents

1. [Logo Analysis & Color Extraction](#1-logo-analysis--color-extraction)
2. [Global Design System](#2-global-design-system)
3. [OwlScope Identity Motifs](#3-owlscope-identity-motifs)
4. [Theme Cleanup](#4-theme-cleanup)
5. [Per-Page / Per-Component Changes](#5-per-page--per-component-changes)
6. [Files to Change](#6-files-to-change)
7. [Implementation Order](#7-implementation-order)
8. [Validation Checklist](#8-validation-checklist)

---

## 1. Logo Analysis & Color Extraction

![OwlScope Logo](file:///C:/Users/Administrator/.gemini/antigravity/brain/8fa8a487-671d-456f-85bf-31717836d066/media__1786367578110.png)

### Logo Characteristics

| Property | Value |
|---|---|
| Background | Pure black (#000000) to very dark graphite |
| Owl body | White (#FFFFFF) to light gray feathers with dark gray (#3A3D42) shadow layers |
| Scope element | Central reticle/crosshair in vivid green (#39FF14 approximate neon) sitting inside a dark metallic ring |
| Beak | White chevron pointing down |
| Geometric motifs | Concentric circles (scope lens), crosshair lines, arc/radar sweep above the head, chevron/V-shape beak |
| Visual mood | Observant, focused, intelligent, nocturnal, technical precision |

### Extracted Brand Colors

The logo's raw neon green (#39FF14) is too saturated for UI surfaces. It must be toned to a usable accent that reads as the same green without burning the eye or looking like a gaming HUD.

| Role | HEX | Usage |
|---|---|---|
| **Background (deep)** | `#0A0C10` | App body, html background — blends seamlessly with logo's black |
| **Surface** | `#12151A` | Cards, sidebar, panels — just perceptibly lighter than bg |
| **Surface sunken** | `#080A0D` | Inset areas, code blocks, sunken wells |
| **Border (rule)** | `#1E2228` | Default 1px borders, dividers |
| **Border strong** | `#2C3038` | Active/strong borders, input outlines |
| **Ink (primary text)** | `#E8E9EB` | Main body text, headings |
| **Ink 2 (secondary)** | `#8B919A` | Descriptions, secondary labels |
| **Ink 3 (tertiary)** | `#5C6370` | Hints, disabled text, timestamps |
| **Accent green** | `#2ECC71` | Scope-green. Primary accent for interactive focus, active states, the logo scope |
| **Accent green muted** | `rgba(46, 204, 113, 0.12)` | Tinted backgrounds for supported-state chips, subtle highlights |
| **Accent green dim** | `rgba(46, 204, 113, 0.06)` | Very subtle hover tints |

> [!IMPORTANT]
> The accent green (`#2ECC71`) is deliberately **not** the raw logo green (`#39FF14`). The logo green is for the logo only. The UI accent is a calmer, more legible emerald that feels related but does not strain the eye at small sizes or over large areas. Use it sparingly: focus rings, active nav indicators, the loading pulse dot, primary button hovers, and nothing else.

### Epistemic Colors (Preserved Semantic System)

The product's epistemic color system is a core design decision: saturated color only appears to communicate truth-status. These colors must be **re-tuned for the dark background** but keep their semantic meanings identical.

| State | HEX | Tint (12% opacity) |
|---|---|---|
| Supported | `#4FB39A` | `rgba(79, 179, 154, 0.12)` |
| Partial | `#D9A441` | `rgba(217, 164, 65, 0.12)` |
| Unsupported | `#E0685F` | `rgba(224, 104, 95, 0.12)` |
| Opinion | `#8A8DE8` | `rgba(138, 141, 232, 0.12)` |

> [!NOTE]
> These are the same values already used in the existing `[data-theme="dark"]` block. They are proven to work on dark backgrounds.

---

## 2. Global Design System

### 2.1 Color Tokens (CSS Custom Properties)

Replace the entire color section in `tokens.css`. There will be ONE set of values — no light/dark switching.

```css
:root {
  --bg: #0A0C10;
  --surface: #12151A;
  --surface-sunken: #080A0D;
  --rule: #1E2228;
  --rule-strong: #2C3038;
  --ink: #E8E9EB;
  --ink-2: #8B919A;
  --ink-3: #5C6370;

  /* Epistemic — the ONLY saturated colours in the product */
  --supported: #4FB39A;
  --partial: #D9A441;
  --unsupported: #E0685F;
  --opinion: #8A8DE8;

  --supported-tint: rgba(79, 179, 154, 0.12);
  --partial-tint: rgba(217, 164, 65, 0.12);
  --unsupported-tint: rgba(224, 104, 95, 0.12);
  --opinion-tint: rgba(138, 141, 232, 0.12);

  /* Brand accent — derived from the scope reticle */
  --accent: #2ECC71;
  --accent-tint: rgba(46, 204, 113, 0.12);
  --accent-dim: rgba(46, 204, 113, 0.06);

  color-scheme: dark;
}
```

### 2.2 Tailwind Theme Mapping

Update `globals.css` `@theme inline` block to include the new accent tokens:

```css
@theme inline {
  /* ...existing color mappings... */
  --color-accent: var(--accent);
  --color-accent-tint: var(--accent-tint);
  --color-accent-dim: var(--accent-dim);
}
```

### 2.3 Typography

**Keep IBM Plex Sans, IBM Plex Mono, and Newsreader.** They are excellent choices and match the technical-but-readable personality of OwlScope. No font changes needed.

The type ramp stays identical:

| Token | Value | Usage |
|---|---|---|
| `--display` | 600 2rem/1.15 sans | Page titles (rare) |
| `--h1` | 600 1.5rem/1.25 sans | Section headers |
| `--h2` | 600 1.1875rem/1.3 sans | Card labels, subsections |
| `--body` | 400 0.9375rem/1.55 sans | Main body text |
| `--body-strong` | 500 0.9375rem/1.55 sans | Buttons, active nav items |
| `--small` | 400 0.8125rem/1.45 sans | Descriptions, hints |
| `--micro` | 500 0.6875rem/1.3 mono | Labels, badges, uppercase identifiers |
| `--data` | 400 0.8125rem/1.4 mono | Metrics, costs, model names |
| `--manuscript` | 400 1.1875rem/1.65 serif | Draft preview text |

### 2.4 Border-Radius System

**Unchanged.** The existing system is tight and appropriate:

| Token | Value |
|---|---|
| `--radius-control` | `6px` |
| `--radius-card` | `10px` |
| `--radius-pill` | `999px` |

### 2.5 Spacing System

**Unchanged.** The locked scale (4, 8, 12, 16, 24, 32, 48, 64) is well-designed and should not be modified.

### 2.6 Borders

All borders use `border-rule` (1px `#1E2228`) by default. This is slightly lighter than the current dark theme's `#24282c`, making edges more visible on the deeper black background.

### 2.7 Shadows / Elevation

Update the shadow for the darker context:

```css
--shadow-pop: 0 4px 20px rgba(0, 0, 0, 0.45);
```

The existing `0.1` opacity was designed for light mode and is almost invisible on dark. Increase to `0.45` for proper depth perception.

### 2.8 Button Variants

The existing Button component (`src/components/common/Button.tsx`) defines four variants. Update their visual treatment:

| Variant | Current (dark) | OwlScope |
|---|---|---|
| `primary` | `bg-ink text-bg border-ink hover:opacity-90` | **Same**, but `--ink` is now `#E8E9EB` and `--bg` is `#0A0C10`. The white-on-black button already works. |
| `secondary` | `bg-surface border-rule-strong hover:bg-surface-sunken` | **Same.** The token values change underneath. |
| `quiet` | `bg-transparent text-ink-2 hover:bg-surface-sunken` | **Same.** |
| `destructive` | `text-unsupported border-rule-strong hover:bg-unsupported-tint` | **Same.** |

> [!TIP]
> Because the buttons are already token-driven, changing the token values is sufficient. No component code changes needed for Button.tsx.

### 2.9 Input Styles

Inputs (`Field.tsx`, `TextInput`) use `bg-surface`, `border-rule-strong`, and `type-data` for mono fields. These are all token-driven. The only change: slightly increase border visibility on focus.

**Add to `globals.css` base layer:**
```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}
```

This replaces the current `outline: 2px solid var(--ink)` with the OwlScope accent green. This is a subtle but recognizable brand touch: every focused element glows scope-green.

### 2.10 Cards / Panels

`Card.tsx` uses `rounded-card border-rule bg-surface` (or `bg-surface-sunken` for sunken cards). Token-driven, no component changes needed. The new `--surface` (#12151A) on `--bg` (#0A0C10) creates a subtle, premium layering effect.

### 2.11 Badges / Chips

`EpistemicChip.tsx` is the only colored chip. Its colors are already mapped through tokens (`--supported`, `--partial`, `--unsupported`, `--opinion`). The dark-mode values we're adopting are already tested. No changes needed.

### 2.12 Navigation States

The `NavRail.tsx` active state is a 2px left bar in `--ink` plus a font-weight change from 400→500. 

**Change**: Replace the active indicator from `bg-ink` to `bg-accent`. This makes the active nav item marked with a scope-green bar — a subtle brand signal.

```tsx
// NavRail.tsx, line ~70
// Change from:
active ? "bg-ink" : "bg-transparent"
// To:
active ? "bg-accent" : "bg-transparent"
```

The `BottomBar` active text goes from `text-ink` to remain as-is (white text is correct for active on dark).

### 2.13 Loading / Error / Success States

| State | Current | OwlScope Change |
|---|---|---|
| Loading (`StageSpinner`) | Pulsing `bg-ink` dot | Change to `bg-accent` — a gentle pulsing green dot feels like a scope acquiring a target |
| Error (`error.tsx`) | Branded recovery screen | Update text references from "Grounded Voice" to "OwlScope" |
| Global error (`global-error.tsx`) | Inline-styled fallback | Update all inline hex colors to OwlScope dark palette, brand name to "OwlScope" |
| Not found (`not-found.tsx`) | 404 page | No visual changes needed beyond what tokens handle |
| Toast (success) | `bg-ink text-bg` | Same — the inverted treatment works on both palettes |
| Toast (failure) | `border-unsupported` left bar | Same |

### 2.14 Icon Direction

The existing `Glyph.tsx` SVG icons are geometric, stroke-based, drawn in `currentColor`. They are excellent and should **not change**. They work perfectly in the dark theme. The "radar" glyph (concentric circles + sweep line) is a natural OwlScope fit.

### 2.15 Animation Guidelines

| Animation | Current | OwlScope |
|---|---|---|
| `stage-pulse` keyframes | Opacity 1 → 0.45 → 1 | **Same**, but the dot color changes to `--accent` |
| Transition durations | `--dur-state: 120ms`, `--dur-panel: 200ms` | **Same** |
| Easing | `--ease`, `--ease-in`, `--ease-out` | **Same** |
| Reduced motion | All animation disabled | **Same — critical for accessibility** |

---

## 3. OwlScope Identity Motifs

> [!IMPORTANT]
> These motifs should be **subtle and sparse**. The goal is "recognizably OwlScope" without decorative clutter. The product's information-dense UI should always dominate.

### 3.1 The Scope-Green Focus Ring

Every `:focus-visible` element gets a 2px `--accent` outline. This is the most pervasive motif: the user's attention (their "scope") is always marked in the brand color. It replaces the current `--ink`-colored focus ring.

### 3.2 The Scope-Green Active Indicator

The nav rail's 2px left bar changes from ink to accent for the active page. The active page is what you're "scoped on." The same green dot appears in `StageSpinner` when the AI is working — the scope is "tracking" a process.

### 3.3 The Logo as Brand Mark

Replace the current `NovaMark` component (a pill with "N") with the OwlScope logo rendered as a small image:

- **Sidebar (expanded)**: 24×24px owl logo + "OwlScope" text
- **Sidebar (collapsed)**: 24×24px owl logo only
- **Mobile top bar**: 24×24px owl logo + "OwlScope" text

Place the provided logo PNG at `public/owlscope-logo.png`. The `NovaMark` component becomes `OwlMark` and renders an `<img>` instead of a styled `<span>`.

### 3.4 The Chevron Accent

The owl's beak forms a downward chevron (V). This can subtly appear as the caret/arrow in dropdown indicators or expand/collapse toggles, if any exist. Currently the app uses no carets, so this is a future consideration only.

### 3.5 What NOT to Do

- ❌ Do not use owl eyes as loading spinners
- ❌ Do not animate the scope reticle
- ❌ Do not add crosshair lines to the UI
- ❌ Do not add "night vision" green overlays
- ❌ Do not add radar sweep animations to the Radar page
- ❌ Do not use the logo as a watermark
- ❌ Do not apply green glow effects to cards or surfaces

---

## 4. Theme Cleanup

The current app supports three themes: `light`, `dark`, and `system`. All of this infrastructure must be simplified to a single permanent dark theme.

### 4.1 CSS Token Changes

**File: `src/app/tokens.css`**

- **Remove** the entire `:root` color block (lines 70–93) that defines light-mode colors
- **Remove** the entire `[data-theme="dark"]` block (lines 96–117)
- **Remove** the entire `@media (prefers-color-scheme: dark)` block (lines 119–142)
- **Replace** with a single `:root` block containing the OwlScope dark palette (see §2.1)
- Keep `color-scheme: dark;` in `:root`

**File: `src/app/globals.css`**

- Remove the comment about `data-theme` flipping (line 7)
- The `@theme inline` block stays but add the accent color mappings

### 4.2 Layout Changes

**File: `src/app/layout.tsx`**

- Change `const APP_NAME = "Grounded Voice"` → `const APP_NAME = "OwlScope"`
- Change `description` in metadata to: `"A local-first AI writing office. Research, verify, draft, critique."`
- **Remove** `data-theme={settings.appearance.theme}` from the `<html>` tag. Hardcode `data-theme="dark"` or simply remove the attribute entirely (the `:root` block now always provides dark values)
- **Remove** the `theme` prop from `<AppShell>`. It is no longer needed.

### 4.3 AppShell Changes

**File: `src/components/common/AppShell.tsx`**

- Remove `theme` from `ShellState` interface (line 22)
- Remove `theme` prop from `ShellCommands` usage (line 51)
- In `ShellCommands`, remove the `"settings:theme"` command registration (lines 116–121)
- Remove the `updateSetting("theme")` logic — or simplify `updateSetting` to only handle sandbox
- Replace `NovaMark()` with `OwlMark()` that renders the logo image
- Change brand name references from "Grounded Voice" to "OwlScope" (handled by `APP_NAME` prop)

### 4.4 Settings Schema Changes

**File: `src/domain/settings/schema.ts`**

- **Keep** the `ThemeSchema` and `appearance.theme` field in the schema. Do not remove it from the persisted format — existing user data files contain this field and Zod will reject them if it's missing.
- Change the default from `"system"` to `"dark"`: `appearance: { theme: "dark" }`
- The field becomes vestigial but harmless.

### 4.5 Settings UI Changes

**File: `src/components/settings/SettingsForm.tsx`**

- **Remove** the `AppearanceSection` component entirely (lines 423–440)
- **Remove** the `useEffect` that applies `document.documentElement.dataset.theme` (lines 59–63)
- **Remove** the `<AppearanceSection>` render call (line 100)

### 4.6 Icon / Favicon Changes

**File: `src/app/icon.svg`**

- Replace entirely with a simplified OwlScope owl SVG favicon, or convert the PNG logo to a small SVG
- Remove the `prefers-color-scheme` media query — it is dark-only
- Alternative: place a `favicon.ico` or `favicon.png` in `src/app/` and delete `icon.svg`

### 4.7 Command Palette Theme Command

**File: `src/components/common/AppShell.tsx`**

Remove the "Toggle theme" command from the registered commands array (the `settings:theme` entry).

### 4.8 Gallery / Inspector

**File: `src/components/inspect/Gallery.tsx`**

- Remove the theme radio control (`light`/`dark`/`system` selector around line 187)
- Remove any `data-theme` manipulation in the gallery
- The gallery should render everything in the permanent dark theme

### 4.9 Error Pages

**File: `src/app/global-error.tsx`**

This file uses inline styles with hardcoded light-mode hex values (`#fbfbf9`, `#14171a`, `#606872`, `#4a5159`, `#c9c9c1`, `#ffffff`). Update ALL of these to the OwlScope dark palette:

| Current | New |
|---|---|
| `background: "#fbfbf9"` | `background: "#0A0C10"` |
| `color: "#14171a"` | `color: "#E8E9EB"` |
| `color: "#606872"` | `color: "#5C6370"` |
| `color: "#4a5159"` | `color: "#8B919A"` |
| `border: "1px solid #c9c9c1"` | `border: "1px solid #2C3038"` |
| `background: "#ffffff"` | `background: "#12151A"` |

Also change "Grounded Voice could not start" → "OwlScope could not start".

**File: `src/app/error.tsx`**

- Change the `console.error` prefix from `[Grounded Voice]` to `[OwlScope]`

### 4.10 Test File Adjustments

**File: `src/domain/settings/store.test.ts`**

- The test writes `appearance: { theme: "dark" }` — this remains valid

---

## 5. Per-Page / Per-Component Changes

### 5.1 Today Page

**File:** `src/components/today/Today.tsx` (28KB)

| Aspect | What Exists | What Changes | What Stays |
|---|---|---|---|
| Layout | Full-width reading column with pipeline card, recommendation blocks | Nothing | All layout |
| Colors | Token-driven via Tailwind classes | Automatically re-themed by token change | All semantic colors |
| Brand ref | Line ~259: `persona.name \|\| "Nova"` as fallback | Keep — "Nova" is a demo persona name, not the product name | Persona references |
| Typography | `type-h1`, `type-body`, `type-micro`, `type-data` | Nothing | All type classes |
| States | Empty state, loading, pipeline running, recommendation shown, skip, rejected | Nothing | All states |
| Hover/Focus | Standard token-driven hover states | Focus rings become `--accent` green (global change) | Hover states |

### 5.2 Brain Page

**Files:** `src/components/persona/BrainEditor.tsx` (11KB), `IdentitySection.tsx`, `PillarsSection.tsx`, `BeliefsSection.tsx`, `VoiceRulesSection.tsx`, `FingerprintSection.tsx`, `EvolutionPanel.tsx`, `PersonaInbox.tsx`

| Aspect | What Changes |
|---|---|
| Brand refs | Several references to "Nova demo persona" — **keep unchanged**. Nova is the demo persona name. |
| Colors | All token-driven, no changes needed |
| Onboarding | `src/components/persona/Onboarding.tsx`: placeholder text says "Nova" — keep, it's the demo name |

### 5.3 Radar Page

**File:** `src/components/radar/Radar.tsx` (17KB)

| Aspect | Change |
|---|---|
| Colors | Token-driven. Automatically updated. |
| Motif opportunity | The Radar page uses topic cards. The glyph for "radar" is already concentric circles + sweep. No additional changes. |

### 5.4 Studio Page

**Files:** `src/components/studio/Studio.tsx` (16KB), `StageRail.tsx`, `TopicStage.tsx`, `ResearchStage.tsx`, `AnglesStage.tsx`, `DraftsStage.tsx`, `CritiqueStage.tsx`, `FinalStage.tsx`, `SourcePanel.tsx`

| Aspect | Change |
|---|---|
| Pipeline stages | `StageRail.tsx` uses `stage-pulse` animation and `bg-ink` dots. Change active-stage dot to `bg-accent` for the scope-tracking motif. |
| Colors | All token-driven |
| Source panel | Right-side drawer uses `bg-surface` — token handles it |

### 5.5 Memory Page

**File:** `src/components/memory/Memory.tsx` (16KB)

| Aspect | Change |
|---|---|
| Colors | Token-driven |
| Table/card | Uses `bg-surface`, `border-rule` — auto-updated |
| Export links | "grounded-voice-memory-*.json" filenames — update in `src/domain/memory/export.ts` to "owlscope-memory-*.json" |

### 5.6 Settings Page

**File:** `src/components/settings/SettingsForm.tsx` (32KB)

| Aspect | Change |
|---|---|
| Appearance section | **Remove entirely** |
| Theme useEffect | **Remove** |
| Demo persona refs | Keep "Nova demo persona" — it's the persona name |
| All other sections | Token-driven, auto-updated |

### 5.7 Inspector Pages

**Files:** `src/components/inspect/Gallery.tsx`, `src/components/inspect/RunList.tsx`

| Aspect | Change |
|---|---|
| Gallery | Remove theme switcher radio. Update page title from "Nova" to "OwlScope". |
| Gallery metadata | `src/app/inspect/components/page.tsx` line 5: change `"Component gallery - Nova"` → `"Component gallery - OwlScope"` |
| XPreviewCard samples | Gallery uses `handle="nova"` and `displayName="Nova"` — keep, it's simulating the demo persona |

### 5.8 Onboarding Page

**File:** `src/components/persona/Onboarding.tsx` (24KB)

| Aspect | Change |
|---|---|
| Metadata | `src/app/onboarding/page.tsx` line 8: change `"Onboarding - Nova"` → `"Onboarding - OwlScope"` |
| Content | Keep all "Nova" references — they refer to the demo persona |

### 5.9 Common Shared Components

| Component | File | Changes |
|---|---|---|
| `AppShell` | `src/components/common/AppShell.tsx` | Replace `NovaMark` with `OwlMark`, remove theme prop, remove theme command |
| `NavRail` | `src/components/common/NavRail.tsx` | Active indicator: `bg-ink` → `bg-accent` |
| `StageSpinner` | `src/components/common/StageSpinner.tsx` | Pulse dot: `bg-ink` → `bg-accent` |
| `PipelineRail` | `src/components/common/PipelineRail.tsx` | Active stage dot/color: check if using `bg-ink` and change to `bg-accent` |
| `Toast` | `src/components/common/Toast.tsx` | No changes — token-driven |
| `Button` | `src/components/common/Button.tsx` | No changes — token-driven |
| `Card` | `src/components/common/Card.tsx` | No changes — token-driven |
| `Field` | `src/components/common/Field.tsx` | No changes — token-driven |
| `ScoreBar` | `src/components/common/ScoreBar.tsx` | No changes — uses `bg-ink` for filled segments, `bg-rule` for empty. Still correct. |
| `EpistemicChip` | `src/components/common/EpistemicChip.tsx` | No changes — epistemic colors preserved |
| `CommandPalette` | `src/components/common/CommandPalette.tsx` | Remove "Toggle theme" result; otherwise token-driven |
| `TokenMeter` | `src/components/common/TokenMeter.tsx` | No changes — token-driven |
| `SentenceManuscript` | `src/components/common/SentenceManuscript.tsx` | No changes — token-driven |
| `PostVisual` | `src/components/common/PostVisual.tsx` | No changes — token-driven |
| `PostThread` | `src/components/common/PostThread.tsx` | No changes — token-driven |
| `SourceDrawer` | `src/components/common/SourceDrawer.tsx` | No changes — token-driven |
| `XPreviewCard` | `src/components/common/XPreviewCard.tsx` | No changes — token-driven |
| `EmptyState` | `src/components/common/EmptyState.tsx` | No changes — token-driven |
| `Glyph` | `src/components/common/Glyph.tsx` | No changes |
| `MicroLabel` | `src/components/common/MicroLabel.tsx` | No changes |
| `SliderRow` | `src/components/common/SliderRow.tsx` | No changes |
| `DiffList` | `src/components/common/DiffList.tsx` | No changes |
| `ShortcutSheet` | `src/components/common/ShortcutSheet.tsx` | No changes — token-driven |
| `VisualParts` | `src/components/common/VisualParts.tsx` | No changes — token-driven |
| `use-dialog-focus` | `src/components/common/use-dialog-focus.ts` | No changes |
| `command-registry` | `src/components/common/command-registry.tsx` | No changes |

---

## 6. Files to Change

### Brand Name & Content Changes

| # | File | Change |
|---|---|---|
| 1 | `src/app/layout.tsx` | `APP_NAME`, metadata description, remove `data-theme` attribute, remove `theme` prop |
| 2 | `src/app/error.tsx` | Console log prefix `[OwlScope]` |
| 3 | `src/app/global-error.tsx` | All inline hex colors → OwlScope dark palette, brand name |
| 4 | `src/app/icon.svg` | Replace with OwlScope favicon (or swap to PNG) |
| 5 | `src/app/inspect/components/page.tsx` | Page title |
| 6 | `src/app/onboarding/page.tsx` | Page title |
| 7 | `src/app/api/data/export/route.ts` | Export filename `grounded-voice-*` → `owlscope-*` |
| 8 | `src/domain/memory/export.ts` | Export filenames `grounded-voice-*` → `owlscope-*` |
| 9 | `package.json` | `"name": "grounded-voice"` → `"name": "owlscope"` |
| 10 | `README.md` | All "Grounded Voice" references → "OwlScope", update description, replace/update screenshots |
| 11 | `CODEX.md` | Title and product description |
| 12 | `CHANGELOG.md` | Add entry for the rebrand |
| 13 | `CONTRIBUTING.md` | Update project name if referenced |
| 14 | `SECURITY.md` | Update project name if referenced |

### Design Token & Theme Changes

| # | File | Change |
|---|---|---|
| 15 | `src/app/tokens.css` | Collapse to single dark palette, add `--accent` tokens, update `--shadow-pop` |
| 16 | `src/app/globals.css` | Add accent to `@theme inline`, update focus-visible, remove theme-flip comment |

### Component Changes

| # | File | Change |
|---|---|---|
| 17 | `src/components/common/AppShell.tsx` | Replace `NovaMark` → `OwlMark`, remove theme from `ShellState`, remove theme command, remove theme toggle logic |
| 18 | `src/components/common/NavRail.tsx` | Active indicator `bg-ink` → `bg-accent` |
| 19 | `src/components/common/StageSpinner.tsx` | Pulse dot `bg-ink` → `bg-accent` |
| 20 | `src/components/common/PipelineRail.tsx` | Check active dot color, change to `bg-accent` if using `bg-ink` |
| 21 | `src/components/settings/SettingsForm.tsx` | Remove `AppearanceSection`, remove theme `useEffect` |
| 22 | `src/components/inspect/Gallery.tsx` | Remove theme radio control |

### Schema & Domain

| # | File | Change |
|---|---|---|
| 23 | `src/domain/settings/schema.ts` | Change default theme to `"dark"` |

### Static Assets

| # | File | Change |
|---|---|---|
| 24 | `public/owlscope-logo.png` | **NEW** — add the OwlScope logo file |

### Documentation

| # | File | Change |
|---|---|---|
| 25 | `docs/ARCHITECTURE.md` | Update product name references |

---

## 7. Implementation Order

> [!CAUTION]
> Follow this order strictly. The design tokens must change before any component that references them is tested. Brand name changes are independent and can happen at any step.

### Phase 1: Foundation (tokens + globals)

1. **`src/app/tokens.css`** — Collapse light/dark/system into single OwlScope dark palette. Add `--accent`, `--accent-tint`, `--accent-dim`. Update `--shadow-pop`.
2. **`src/app/globals.css`** — Add accent color mappings to `@theme inline`. Change `:focus-visible` outline from `var(--ink)` to `var(--accent)`.
3. **Verify**: Run `npm run build` — confirms all Tailwind utilities still compile.

### Phase 2: Theme cleanup (schema + layout)

4. **`src/domain/settings/schema.ts`** — Change default theme to `"dark"`.
5. **`src/app/layout.tsx`** — Change `APP_NAME`, update metadata, hardcode or remove `data-theme`, remove `theme` prop from `<AppShell>`.
6. **`src/components/common/AppShell.tsx`** — Remove `theme` from `ShellState`, remove theme command, remove theme toggle logic. Replace `NovaMark` with `OwlMark` (img-based).
7. **`src/components/settings/SettingsForm.tsx`** — Remove `AppearanceSection`, remove theme `useEffect`.
8. **`src/components/inspect/Gallery.tsx`** — Remove theme radio.
9. **Verify**: Run `npm run typecheck` and `npm run lint`.

### Phase 3: Brand accent integration

10. **`src/components/common/NavRail.tsx`** — Active indicator `bg-accent`.
11. **`src/components/common/StageSpinner.tsx`** — Pulse dot `bg-accent`.
12. **`src/components/common/PipelineRail.tsx`** — Active stage dot `bg-accent`.
13. **Verify**: Start dev server, navigate all pages, check active nav state and loading states.

### Phase 4: Error pages and fallbacks

14. **`src/app/error.tsx`** — Update console prefix.
15. **`src/app/global-error.tsx`** — Replace all inline hex colors with OwlScope dark values, update brand name.
16. **`src/app/icon.svg`** — Replace with OwlScope favicon.

### Phase 5: Brand name sweep

17. **`src/app/inspect/components/page.tsx`** — Page title.
18. **`src/app/onboarding/page.tsx`** — Page title.
19. **`src/app/api/data/export/route.ts`** — Export filename.
20. **`src/domain/memory/export.ts`** — Export filenames.
21. **`package.json`** — Package name.

### Phase 6: Logo asset

22. **Add `public/owlscope-logo.png`** — Copy the provided logo, crop tightly to the owl, save at suitable size (e.g., 96×96 or 128×128 with transparent or #0A0C10 background).

### Phase 7: Documentation

23. **`CODEX.md`** — Update title and product description.
24. **`README.md`** — Full rebrand. Update title, description, screenshots.
25. **`CHANGELOG.md`** — Add rebrand entry.
26. **`CONTRIBUTING.md`**, **`SECURITY.md`** — Update references if present.
27. **`docs/ARCHITECTURE.md`** — Update references.

### Phase 8: Final verification

28. Run `npm run typecheck`
29. Run `npm run lint`
30. Run `npm test` — all 383 tests must pass
31. Run `npm run eval` — all 11 cases must pass
32. Run `npm run build` — clean production build
33. Manual walkthrough of every page at desktop and 390px mobile

---

## 8. Validation Checklist

### Visual Consistency

- [ ] Every page uses `--bg` (#0A0C10) as its background
- [ ] All cards show `--surface` (#12151A) background
- [ ] All borders are `--rule` (#1E2228) or `--rule-strong` (#2C3038)
- [ ] Primary text is `--ink` (#E8E9EB) — high contrast against dark bg
- [ ] Secondary text is `--ink-2` (#8B919A) — readable but subdued
- [ ] Tertiary text is `--ink-3` (#5C6370) — clearly lower hierarchy
- [ ] No white backgrounds appear anywhere
- [ ] No light-mode color values remain in any file

### Brand Integration

- [ ] Logo appears in sidebar (expanded and collapsed)
- [ ] Logo appears in mobile top bar
- [ ] "OwlScope" appears as the brand name in the sidebar
- [ ] Page title is "OwlScope"
- [ ] Meta description is updated
- [ ] Export filenames say "owlscope"
- [ ] Console error prefix says "[OwlScope]"
- [ ] Global error page says "OwlScope could not start"
- [ ] Favicon shows the owl
- [ ] package.json name is "owlscope"

### Theme Cleanup

- [ ] No `[data-theme="dark"]` CSS block exists in tokens.css
- [ ] No `@media (prefers-color-scheme: dark)` block exists in tokens.css
- [ ] No `:root` light-mode color block exists
- [ ] `<html>` tag does not have a dynamic `data-theme` attribute (either hardcode `data-theme="dark"` or remove entirely)
- [ ] No "Toggle theme" command in the command palette
- [ ] No Appearance section in Settings
- [ ] No `useEffect` setting `document.documentElement.dataset.theme`
- [ ] Settings schema still accepts `appearance.theme` to avoid breaking existing data files
- [ ] Default theme in schema is `"dark"`

### Accent Color

- [ ] Focus rings are `--accent` (#2ECC71) green on all focusable elements
- [ ] Active nav indicator is `--accent` green
- [ ] StageSpinner pulse dot is `--accent` green
- [ ] Pipeline active stage dot is `--accent` green
- [ ] Accent green is NOT used for backgrounds, text color, or large surface fills
- [ ] Epistemic colors (supported/partial/unsupported/opinion) are unchanged

### Functionality Preservation

- [ ] Today page generates recommendations
- [ ] Brain page edits persona
- [ ] Radar page scans topics
- [ ] Studio pipeline runs end-to-end
- [ ] Memory page lists archive
- [ ] Settings saves correctly
- [ ] Onboarding works
- [ ] Command palette opens (⌘K / Ctrl-K)
- [ ] Keyboard shortcuts work
- [ ] Toast notifications appear
- [ ] Loading states show correctly

### Responsive Design

- [ ] Desktop (≥1100px): Full sidebar with labels + logo + "OwlScope"
- [ ] Tablet (768–1100px): Collapsed sidebar with logo only
- [ ] Mobile (<768px): Top bar with logo + "OwlScope", bottom nav bar
- [ ] 390px layout: All content fits without horizontal scroll
- [ ] Memory table collapses to cards on mobile
- [ ] Studio stages layout horizontally at 390px

### Contrast / Accessibility

- [ ] Primary text on background: `#E8E9EB` on `#0A0C10` = contrast ratio ~16:1 ✓
- [ ] Secondary text on background: `#8B919A` on `#0A0C10` = contrast ratio ~5.5:1 ✓
- [ ] Tertiary text on background: `#5C6370` on `#0A0C10` = contrast ratio ~3.2:1 (decorative only, acceptable)
- [ ] Accent on background: `#2ECC71` on `#0A0C10` = contrast ratio ~8:1 ✓
- [ ] All epistemic chip text on tint backgrounds passes 4.5:1
- [ ] Focus rings are visible on every interactive element
- [ ] `prefers-reduced-motion` still disables all animation
- [ ] Skip-to-content link still works

### Build & Tests

- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint` — 0 errors, 0 warnings
- [ ] `npm test` — 383 tests pass
- [ ] `npm run eval` — 11 eval cases pass
- [ ] `npm run build` — clean build, all routes compile
