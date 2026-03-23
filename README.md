# Füchse Berlin Reinickendorf — Club Manager

A lightweight tennis club management tool built for [Füchse Berlin Reinickendorf e.V.](https://www.fuechse-berlin-reinickendorf.de), designed to handle team rosters, match scheduling, player availability, and lineup planning according to TVBB Berlin competition rules.

---

## Overview

The app consists of two single-file HTML applications that run entirely in the browser and connect to a [Supabase](https://supabase.com) backend.

| File | Purpose | Access |
|------|---------|--------|
| `admin.html` | Club administrator view — import, manage, plan | Login required (Supabase Auth) |
| `index.html` | Player availability app — find yourself, confirm matches | Password protected |

No build step, no framework, no server required. Deploy to any static host (e.g. GitHub Pages).

---

## Features

### Admin (`admin.html`)

**PDF Import**
- **Namentliche Mannschaftsmeldung** — imports players and team assignments directly from the official TVBB PDF. Automatically assigns each player to all teams they are eligible for within their category (Stammkader rule).
- **ResultReport** — imports teams and leagues from the Ergebnistabellen PDF.
- **Begegnungen** — imports the full match schedule, filtering out junior matches automatically.

**Players**
- Full roster view sorted by LK, filterable by team, gender, and blocking status.
- Manual team assignment and match count adjustment.

**Teams**
- Manage teams with category, league, season (Sommer/Winter), and group size (6er/4er).

**Matches**
- Full schedule view with availability progress per match.
- Opens the player availability view inline.

**Verfügbarkeit (Availability)**
- Per-match availability overview, filterable by category.
- Players grouped by response (Ja → Vielleicht → Nein), sorted by rank within each group.

**Aufstellung (Lineup)**
- Assign players to lineup slots, filterable by category.
- Auto-generate lineup from available, non-blocked players.
- LK order validation and blocking warnings.
- Dropdown menus grouped by availability.

**Sperren (Blocking)**
- Cross-table view of all players × teams per category.
- Implements both TVBB blocking rules:
  - **Stammkader** (§10 Abs. 1): based on position in the Namentliche Mannschaftsmeldung.
  - **Stammmannschaft** (§10 Abs. 2): cumulative matches played across superior teams within a category.

---

### Player App (`index.html`)

- Search by name with autocomplete.
- See all matches across all eligible teams.
- Toggle team chips to filter which matches are shown (multi-select).
- Confirm availability directly from the match list (Ja / Vielleicht / Nein).
- Download individual matches as `.ics` calendar events.
- Conflict detection: same time → auto-downgrade to Vielleicht; same day different time → warning with option to confirm.
- Available in German, Spanish, and English.

---

## Rules Implemented

The blocking logic follows the TVBB Wettspielordnung (April 2024):

**§10 Abs. 1 — Stammkader**
Players are assigned to teams by their position in the Namentliche Mannschaftsmeldung. Positions 1–6 (or 1–4 for 4er-teams) belong to team 1, the next group to team 2, and so on. A Stammspieler of a higher team has no Spielberechtigung for lower-numbered teams within the same category.

**§10 Abs. 2 — Stammmannschaft**
A player may be used as a substitute (Ersatzspieler) in a higher team only once. The blocking threshold is cumulative: the sum of all matches played in teams with a lower team number than team X determines eligibility for team X. Two or more such matches → gesperrt. One match → Verwarnung (⚠).

---

## Database

Powered by [Supabase](https://supabase.com). The schema includes the following tables:

`teams` · `players` · `player_teams` · `matches` · `availability` · `lineups` · `player_match_counts`

Key columns:
- `teams.is_4er` — boolean, marks Sommer teams with 4-player groups (Damen 55+, Herren 65+, etc.)
- `player_teams.rank` — the player's position within their category from the Namentliche Mannschaftsmeldung

Row Level Security (RLS) can be configured to allow public reads and restrict writes to authenticated users only.

---

## Tech Stack

- Vanilla HTML/CSS/JavaScript — no framework, no build step
- [PDF.js](https://mozilla.github.io/pdf.js/) 3.11.174 — PDF parsing
- [Supabase JS](https://supabase.com/docs/reference/javascript) — database and authentication
- [Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue) + [DM Sans](https://fonts.google.com/specimen/DM+Sans) — typography

---

## Deployment

The two files can be deployed to any static host. GitHub Pages works out of the box:

1. Push `admin.html` and `index.html` to a repository.
2. Enable GitHub Pages from the repository settings.
3. `index.html` is the public player URL; `admin.html` requires login.

---

## Configuration

Connection details (Supabase URL and publishable API key) are defined at the top of each HTML file. The publishable key is safe to expose — write access is controlled by Supabase Auth and Row Level Security policies.

Admin access is managed through Supabase Authentication. Create users via the Supabase dashboard under **Authentication → Users**.

---

## License

MIT
