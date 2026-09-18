# Diet Logger — Project Rules

## Design System

Before making ANY changes to the frontend (HTML, CSS, or JavaScript that generates UI),
you MUST read and follow the design system document:

📄 **[DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)**

This file defines every color token, typography rule, component pattern, spacing value,
and interaction behavior used in this app. It is the single source of truth.

### Key rules (always apply):
- **Dark theme only** — backgrounds use `#141414`, `#1c1c1c`, `#232323`. Never use white backgrounds.
- **Inter font** — loaded via Google Fonts. Set `font-family: inherit` on all buttons and inputs.
- **CSS custom properties** — all colors come from `:root` variables in `style.css`. Never hard-code hex values in component styles.
- **Outlined macro pills** — each macro (kcal, protein, carbs, fat) has its own color triple. Pills use tinted background (~12% opacity) + border, never solid fill.
- **History cards** — green left-border accent, circular meal icon, bulleted food list, 2-column nutrients grid.
- **Progress bars** — macro bars are 6px tall with macro-specific colors. Micro bars are 3px tall with status colors (green ≥100%, amber 50–99%, red <50%).
- **Round micros to 1 decimal** — never display raw floating-point values.
- **Aggregate nutrients per meal** — never group per individual food item.
- **Version bumping** — when changing `app.js` or `style.css`, bump the `?v=N` query param in `index.html` AND the `CACHE` constant in `sw.js`.

## Architecture

- **Backend**: Flask (`server.py`), deployed on Railway
- **Frontend**: Vanilla HTML/CSS/JS PWA (`static/`)
- **Data**: Google Fit API (nutrition data source)
- **AI**: Gemini API for food image analysis
- **Auth**: Google OAuth 2.0

## Safe Deletion

When deleting Google Fit data points, ALWAYS use the "surgical deletion" pattern:
delete a 1-nanosecond window (`start_ns` to `start_ns + 1`) to avoid wiping
overlapping meals. Never delete by a wide time range.
