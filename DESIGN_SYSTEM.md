# Diet Logger — Design System

> **This file is the single source of truth for every visual and interaction
> decision in the Diet Logger app.** Any AI agent or developer modifying the
> frontend MUST read and follow these rules. When a rule here conflicts with a
> quick fix or personal preference, this file wins.

---

## 1. Philosophy

| Principle | Meaning |
|-----------|---------|
| **Dark & Warm** | Deep charcoal backgrounds with warm-muted text. Never use pure white (`#fff`) for backgrounds or large text areas. |
| **Relaxed** | Generous padding, rounded corners, Inter font. The app should feel calm, not clinical. |
| **Information density without clutter** | Use grids, pills, and progress bars to pack data tightly. Never dump raw numbers in paragraphs. |
| **Color = meaning** | Every accent color maps to a specific macro or status. Don't reuse or invent new ones without updating this doc. |

---

## 2. Color Tokens (CSS Custom Properties)

All colors MUST be defined as CSS custom properties in `:root` inside
`static/style.css`. Never hard-code hex values in component styles — reference
the variable instead.

### 2.1 Backgrounds & Surfaces

| Variable | Value | Usage |
|----------|-------|-------|
| `--bg` | `#1c1a19` | Page / body background (warm charcoal) |
| `--bg-raised` | `#242120` | Header, tab bar, inset panels |
| `--card` | `#2c2827` | Cards, inputs, upload area |
| `--card-hover` | `#332f2e` | Card hover state (use sparingly) |

### 2.2 Borders

| Variable | Value | Usage |
|----------|-------|-------|
| `--border` | `#3e3937` | Default border (cards, inputs, dividers) |
| `--border-light` | `#4d4745` | Hover-state borders |

### 2.3 Text

| Variable | Value | Usage |
|----------|-------|-------|
| `--text` | `#e8e4e1` | Primary text (headings, body) |
| `--text-muted` | `#a39c99` | Secondary text (labels, descriptions, food items) |
| `--text-dim` | `#7a7471` | Tertiary text (timestamps, units, disabled) |

> **Rule:** Never use `#fff` / `white` for text except on filled accent
> buttons and the auth sign-in button.

### 2.4 Accent

| Variable | Value | Usage |
|----------|-------|-------|
| `--accent` | `#52a874` | Primary action buttons, active tab, progress bar (fiber), left card borders |
| `--accent-bg` | `rgba(82,168,116,.12)` | Tinted background behind accent elements |
| `--accent-border` | `rgba(82,168,116,.35)` | Border for accent-tinted containers |

Hover state for accent buttons: `#5ebe84`.

### 2.5 Semantic / Status

| Variable | Value | Usage |
|----------|-------|-------|
| `--red` | `#e55b5b` | Destructive actions, delete hover, < 50% progress |

### 2.6 Macro Pill Colors

Each macronutrient has a dedicated color triple (bg / border / text). These
are **ONLY** used for macro pills and progress bars. Do not repurpose.

| Macro | `--pill-*-text` | `--pill-*-border` | `--pill-*-bg` | Bar color |
|-------|----------------|-------------------|--------------|-----------|
| Calories (kcal) | `#dfca92` (bright gold) | `rgba(223,202,146,.35)` | `rgba(223,202,146,.12)` | `#dfca92` |
| Protein | `#8ec8f2` (bright blue) | `rgba(142,200,242,.35)` | `rgba(142,200,242,.12)` | `#8ec8f2` |
| Carbs | `#ebb249` (bright amber) | `rgba(235,178,73,.35)` | `rgba(235,178,73,.12)` | `#ebb249` |
| Fat | `#e0c29b` (bright tan) | `rgba(224,194,155,.35)` | `rgba(224,194,155,.12)` | `#e0c29b` |
| Fiber | — | — | — | `#4a9e6e` (uses accent) |

### 2.7 Micro-Progress Status Colors

| Status | Condition | Color | Background |
|--------|-----------|-------|------------|
| Complete | ≥ 100% of RDA | `#4a9e6e` (green) | `rgba(74,158,110,.12)` |
| Partial | 50–99% of RDA | `#d8a850` (amber) | `rgba(216,168,80,.12)` |
| Low | < 50% of RDA | `#e55b5b` (red) | `rgba(229,91,91,.12)` |

---

## 3. Typography

| Property | Value |
|----------|-------|
| **Font family** | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| **Import** | `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap')` — always first line of `style.css` |
| **Antialiasing** | `-webkit-font-smoothing: antialiased` on `html, body` |
| **Letter-spacing** | Tight (`-0.02em`) on logo; slight negative (`-0.01em`) on section headers; wide (`0.06em–0.08em`) on uppercase labels |
| **`font-family: inherit`** | MUST be set on every `<button>` and `<input>` so Inter is used everywhere |

### 3.1 Type Scale

| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| Page title (auth) | `1.8rem` | 700 | |
| Logo | `1.15rem` | 700 | `letter-spacing: -.02em` |
| Section header (`h2`) | `1rem` | 600 | |
| Section label (uppercase) | `0.72rem` | 600 | `text-transform: uppercase; letter-spacing: .06em–.08em` |
| Body text / food names | `0.95rem` | 600 (name) / 400 (body) | |
| Labels / descriptions | `0.85rem` | 500 | `color: var(--text-muted)` |
| Macro pills | `0.72rem` | 600 | |
| Micro values | `0.65rem–0.72rem` | 500–700 | |
| Timestamps | `0.78rem` | 400 | `color: var(--text-dim)` |

---

## 4. Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | `10px` | Cards, inputs, upload area, modals |
| `--radius-sm` | `6px` | Small buttons, chips, edit inputs, micro cards |
| Pill radius | `999px` | All pills, meal-type buttons, secondary buttons |
| Card padding | `0.85rem 1rem` | Standard card internal padding |
| Card margin-bottom | `0.5rem–0.65rem` | Gap between stacked cards |
| Main padding | `1rem` sides, `80px` bottom (tab bar clearance) | |
| Header padding | `0.9rem 1.2rem` | |

### 4.1 Grid Patterns

| Pattern | Spec |
|---------|------|
| **Macro dashboard** | `grid-template-columns: 1fr 1fr` — Calories spans full width (`grid-column: span 2`), the rest pair up |
| **Micro dashboard** | `grid-template-columns: 1fr 1fr` with `gap: 0.5rem` |
| **Nutrients dropdown** | `grid-template-columns: 1fr 1fr` with `gap: .2rem .75rem` |
| **Edit grid** | `grid-template-columns: 1fr 1fr` with `gap: .35rem` |

---

## 5. Component Catalog

### 5.1 Cards

```
┌──────────────────────────────────┐
│ bg: var(--card)                  │
│ border: 1px solid var(--border)  │
│ border-radius: var(--radius)     │
│ padding: 0.85rem 1rem            │
└──────────────────────────────────┘
```

**History card variant:** Add `border-left: 3px solid var(--accent)` and
`overflow: hidden; padding: 0` (content goes inside `.history-card-inner`).

### 5.2 Macro Pills

Outlined, not filled. Each macro has its own color triple.

```css
.macro-pill {
  padding: .2rem .55rem;
  border-radius: 999px;
  font-size: .72rem;
  font-weight: 600;
  border: 1px solid <macro-border>;
  background: <macro-bg>;          /* ~12% opacity tint */
  color: <macro-text>;
}
```

Format: `{value}{unit} {letter}` — e.g. `21.5g P`, `99g C`, `17g F`, `635 kcal`.

### 5.3 Meal Icons

Each meal type gets a circular badge:

```css
.history-meal-icon {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
}
```

| Meal | Emoji |
|------|-------|
| Breakfast | ☀️ |
| Lunch | 🍽️ |
| Dinner | 🌙 |
| Snack | 🍎 |
| Other | 📋 |

### 5.4 Progress Bars

**Macro progress bar:**
- Track: `height: 6px; background: var(--bg); border-radius: 3px`
- Fill: matching macro bar color, `transition: width .4s ease`

**Micro progress bar:**
- Track: `height: 3px; background: var(--bg); border-radius: 2px`
- Fill: status color (green/amber/red)

### 5.5 Buttons

| Type | Background | Text | Border | Radius |
|------|-----------|------|--------|--------|
| Primary (Analyze, Log) | `var(--accent)` | `#fff` | none | `var(--radius)` |
| Secondary (Camera, Gallery) | `var(--accent-bg)` | `var(--accent)` | `1px solid var(--accent-border)` | `999px` |
| Pill toggle (meal selector) | `var(--card)` / `var(--accent)` when active | `var(--text-muted)` / `#fff` when active | `1px solid var(--border)` | `999px` |
| Ghost (edit, delete) | none | `var(--text-dim)` | none | — |

All buttons: `font-family: inherit; cursor: pointer; transition: all .2s;`

### 5.6 Inputs

```css
input {
  background: var(--card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);      /* var(--radius-sm) for inline/small */
  font-family: inherit;
  padding: .7rem 1rem;
}
input:focus {
  outline: none;
  border-color: var(--accent);
}
```

### 5.7 Food Lists (History)

Each food item is a `<div class="history-food-item">` with a `::before`
pseudo-element that adds `· ` (middle dot + space) in `var(--text-dim)`.
Font-size: `.85rem`. Color: `var(--text-muted)`. Line-height: `1.6`.

### 5.8 Section Labels (Uppercase)

Used for dashboard headers ("TODAY'S PROGRESS", "MICRONUTRIENTS", "PAST MEALS").

```css
.section-label {
  font-size: .72rem;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: .06em–.08em;
}
```

---

## 6. Layout Rules

### 6.1 App Shell

```
┌─────────────────────────────────┐
│  Header (sticky, bg-raised)     │  60px
├─────────────────────────────────┤
│                                 │
│  <main> (scrollable)            │
│    tab-content panels           │
│                                 │
├─────────────────────────────────┤
│    ┌───────────────────────┐    │
│    │ Tab bar (frosted)     │    │
│    └───────────────────────┘    │
└─────────────────────────────────┘
```

- Header: `position: sticky; top: 0; z-index: 10; border-bottom: 1px solid var(--border)`
- Tab bar: `position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 10; border: 1px solid var(--border); border-radius: 999px; background: rgba(36, 33, 32, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);` (floating inset appearance, frosted glass)
- Main: `padding-bottom: 100px` to clear the floating tab bar
- Tab transitions: Animate color and scale smoothly on active tabs. Use smooth cross-fade or slide for panel transitions.

### 6.2 History Card Layout

```
┌ 3px accent ─────────────────────────────────────┐
│  [Icon]  Meal Type        [kcal] [P] [C] [F] 🗑 │
│          Date · Time                             │
│                                                  │
│  · Food item 1                                   │
│  · Food item 2                                   │
│                                                  │
│  ▸ Show full nutrients                           │
│     ┌────────────┬────────────┐                  │
│     │ Label  val │ Label  val │  (2-col grid)    │
│     └────────────┴────────────┘                  │
└──────────────────────────────────────────────────┘
```

### 6.3 Daily Dashboard Layout (Home Tab)

```
TODAY'S PROGRESS (uppercase label)
┌ 3px accent ──────────────────────────────┐
│  Calories    ████████░░░░  1200/2350kcal │  (full width)
│  ┌──────────────┐  ┌──────────────┐      │
│  │ Protein      │  │ Carbs        │      │  (2-col grid)
│  │ ████░░  60g  │  │ ██████░ 180g │      │
│  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐      │
│  │ Fat          │  │ Fiber        │      │
│  │ ███░░░  35g  │  │ ██░░░░  12g  │      │
│  └──────────────┘  └──────────────┘      │
└──────────────────────────────────────────┘

VITAMINS (uppercase label)
┌──────────┐ ┌──────────┐    (2-col grid of micro-cards)
│ Vit C    │ │ Vit A    │
│ ██░░ 45% │ │ ████ 90% │
│ 40/90 mg │ │ 7.2/8 mg │
└──────────┘ └──────────┘

MINERALS (uppercase label)
┌──────────┐ ┌──────────┐
│ Iron     │ │ Calcium  │
│ ██░░ 45% │ │ ████ 90% │
│ 40/90 mg │ │ 7.2/8 mg │
└──────────┘ └──────────┘

FATS & FIBER (uppercase label)
┌──────────┐ ┌──────────┐
│ Omega 3  │ │ Omega 6  │
│ ██░░ 45% │ │ ████ 90% │
│ 40/90 mg │ │ 7.2/8 mg │
└──────────┘ └──────────┘
```

---

## 7. Interaction Patterns

### 7.1 Transitions

- All interactive elements: `transition: all .2s` or `transition: color .2s`
- Progress bar fills: `transition: width .4s ease`
- Layout shifts are generally avoided (no transform on cards), EXCEPT for:
  - **Tab-panel switching**: Smooth cross-fade or slide.
  - **"Show full nutrients" expand/collapse**: Smooth animation using max-height/measured-height and opacity, avoiding raw `height: auto` jumps.

### 7.2 Hover States

| Element | Hover effect |
|---------|-------------|
| Primary button | Background lightens to `#5ab87e` |
| Secondary button | Background fills to `var(--accent)`, text goes `white` |
| Ghost button (edit) | Color changes to `var(--accent)` |
| Delete button | Color changes to `var(--red)` |
| Card | No hover effect (cards are not clickable) |
| Upload area | `border-color: var(--accent)` |
| Input focus | `border-color: var(--accent); outline: none` |

### 7.3 Empty States

Centered text in `var(--text-dim)`, `font-size: .85rem–.9rem`, inside a card
with `padding: 1.25rem–2rem`. Use plain text, not icons.

---

## 8. Data Formatting Rules

### 8.1 Numbers

- **Calories**: Round to integer. Display as `635 kcal`.
- **Macro grams**: 1 decimal if < 10, integer if ≥ 10. Display as `21.5g P`.
- **Micro values**: Round to 1 decimal place (fixes floating-point noise like `1.79999...`). Display unit alongside.
- **Percentages**: Round to integer. Display as `45%`.

### 8.2 Micro Label Formatting

Strip the unit suffix from the key name before display:
- `vitamin_b6_mg` → `Vitamin B6` (remove `_mg`)
- `omega_3_g` → `Omega 3` (remove `_g`)
- Title-case each word

### 8.3 Dates & Times

- History cards: `{weekday short}, {month short} {day} · {HH:MM AM/PM}`
  - Example: `Thu, Sep 17 · 07:44 PM`
- Use browser locale for formatting (`toLocaleDateString`, `toLocaleTimeString`)

---

## 9. Don'ts (Anti-Patterns)

| ❌ Don't | ✅ Do instead |
|---------|-------------|
| Use pure white (`#ffffff`) backgrounds | Use `var(--bg)`, `var(--bg-raised)`, or `var(--card)` |
| Use inline styles for colors or spacing | Use CSS classes and custom properties |
| Use `box-shadow` for card elevation | Use `border: 1px solid var(--border)` |
| Dump raw nutrient numbers in prose | Use the 2-column nutrients grid with label/value pairs |
| Create new colors without documenting here | Add to Section 2 first |
| Use filled/solid macro pills | Use outlined pills (border + tinted bg at ~12% opacity) |
| Show micro values with floating-point noise | Round to 1 decimal place |
| Group nutrients per-food in history | Aggregate per-meal, show one combined grid |
| Use serif or monospace fonts | Stick to Inter stack |
| Add light/white theme elements | Everything is dark theme only |

---

## 10. File Reference

| File | Role |
|------|------|
| `static/style.css` | All styles. Variables in `:root`. |
| `static/index.html` | Structure. Link CSS, set `theme-color` meta to `#141414`. |
| `static/app.js` | Rendering logic. Card templates, dashboard builder. |
| `static/sw.js` | Service worker. Bump `CACHE` version string on every deploy. |
| `static/manifest.json` | PWA manifest. `theme_color` and `background_color` must be `#141414`. |
| `DESIGN_SYSTEM.md` | **This file. The canonical design reference.** |

---

## 11. Versioning

When making visual changes:
1. Update `style.css` using only the tokens defined here.
2. Bump the `?v=N` query parameter on the `<script>` tag in `index.html`.
3. Bump the `CACHE` constant in `sw.js` to match.
4. If you add a new token, color, or component pattern — update this file first.
