# Club Manager — Füchse Berlin Reinickendorf e.V.

Tennis club management system for tracking availability, lineups, and TVBB Berlin regulatory blocks.

---

## Overview

Club Manager is a standalone web application made up of three independent HTML files, each targeting a different role within the club. No framework, bundler, or dedicated server required — everything runs directly in the browser, connected to a Supabase backend.

---

## Files

| File | Role | Access |
|---|---|---|
| `admin.html` | Sportwart (full admin) | Login with email/password |
| `kapitaen.html` | Team captain | Login with email/password |
| `index.html` | Player (confirm availability) | Shared club password |

---

## Tech Stack

- **Frontend:** Plain HTML, CSS and JavaScript — no frameworks, no build step
- **Backend:** [Supabase](https://supabase.com) — PostgreSQL with direct REST API
- **PDF parsing:** PDF.js — import of official TVBB Berlin documents
- **Fonts:** Bebas Neue + DM Sans (Google Fonts)

---

## Database (Supabase)

Project: `kepbpcttbvkbcckqoecv.supabase.co`

### Tables

| Table | Description |
|---|---|
| `players` | Club roster — LK, birth year, gender, IDnr, global rank |
| `teams` | Mannschaften — category, league, number, season |
| `matches` | Matches — date, time, opponent, venue |
| `player_teams` | Player↔team relationship with rank and `is_mainteam` flag |
| `availability` | Availability responses per player and match |
| `lineups` | Starting lineup + Ersatz per match |
| `player_match_counts` | Matches played per team (used for block rules) |

### Key columns

- `players.rank` — global LK rank; **source of truth** for ordering in all views
- `players.raw_name` — `"Lastname, Firstname"` format used to generate smart short names
- `player_teams.is_mainteam` — boolean flag marking the Stammmannschaft assigned by the admin
- `player_teams.rank` — player rank within a specific team
- `teams.season` — `'Sommer'` (6 players) or `'Winter'` (4 players)
- `teams.is_4er` — manual override for 4-player format regardless of season

---

## Roles & Features

### `admin.html` — Sportwart

Full club management view. Requires Supabase Auth login.

**Tabs:**
- **PDF importieren** — import players from TVBB Namentliche Mannschaftsmeldung, teams from ResultReport PDF, and matches from Begegnungen PDF
- **Spieler** — full roster with filters; edit team assignments and Stammmannschaft flag
- **Mannschaften** — create and configure teams (league, category, season, 4er format)
- **Spiele & Aufstellung** — match calendar with lineup management (drag & drop, auto-generate, Ersatz slot) and availability view
- **Sperren** — active blocks table by Stammkader and Stammmannschaft rules (includes LK > 20 rule for Herren I/II)
- **Overview** — cross-table teams × dates and players × dates with availability and lineup status

**Languages:** DE / ES / EN

---

### `kapitaen.html` — Team Captain

Operational view for the captain. Shows only the teams assigned to the logged-in user.

**Tabs:**
- **Spiele & Aufstellung** — availability per match, lineup assignment with drag & drop, LK rule validation
- **Overview** — players × dates with availability state and lineup position
- **Sperren** — read-only block view for the category (LK > 20 rule not shown here)

**Languages:** DE / ES / EN

---

### `index.html` — Player

Mobile-first interface for players to confirm availability.

**Flow:**
1. Player enters the club password
2. Searches their name in the roster
3. Selects a match and confirms availability

**Availability states:**

| State | DE label | Description |
|---|---|---|
| `yes` | ✓ Ja | Available — solid green |
| `conditional` | (Ja) | Available, lower priority — auto-assigned when player already has a `yes` that day |
| `notfall` | Im Notfall | Only if necessary — orange |
| `no` | ✗ Nein | Not available — red |

When a player confirms for two matches on the same day, a priority modal appears to choose the main match — the other becomes `conditional` automatically.

**Languages:** DE / ES / EN

---

## TVBB Berlin Rules

### Stammkader

A player's global LK rank determines which team they must play for within their category. The top N players (by `players.rank`) are assigned to Mannschaft 1, the next N to Mannschaft 2, etc. A player cannot be fielded in a higher-numbered team than their Stammkader position allows.

- Sommer: blocks of 6 players per team
- Winter: blocks of 4 players per team

### Stammmannschaft

If a player plays 2 or more matches for a team in their category, they are blocked from all higher-numbered teams in that same category for the rest of the season.

- The rule applies **per category** independently (Herren, Herren 30, Damen, etc.)
- The admin can manually set `is_mainteam` to highlight the recommended team (gold `★ SM` badge)
- The captain view **does not** apply the LK > 20 rule in the lineup view — only visible in the admin Sperren tab

---

## PDF Import

Three types of official TVBB Berlin documents are parsed using PDF.js:

| Document | What it imports | Order |
|---|---|---|
| Namentliche Mannschaftsmeldung | Players — name, LK, birth year, IDnr | 1st |
| ResultReport | Teams — name, league, category | 2nd |
| Begegnungen | Matches — date, time, home/away, opponent. Filters juniors automatically. | 3rd |

Teams must be imported before matches. Each import shows a preview before confirming.

---

## Internationalisation (i18n)

All three files support three languages with a visible toggle in the header:

- 🇩🇪 **DE** — German (default)
- 🇦🇷 **ES** — Spanish
- 🇬🇧 **EN** — English

Language changes are instant and re-render all active views without a page reload. Translations live in `const T = {de, es, en}` inside each file. Fallback is always `de`.

---

## Development Conventions

- One file = one role. No imports between files.
- All Supabase calls go through `sbGet()`, `sbUpsert()` and `sbDelete()`.
- `admin.html` and `kapitaen.html` use `getHDR()` which injects the authenticated user's JWT.
- `index.html` uses the anon key directly (players do not have Supabase accounts).
- Short player names are derived from `raw_name` (`"Lastname, Firstname"` format).
- `teamSize(team)` returns 4 or 6 based on season and `is_4er` flag.
- The Ersatz slot is always index `size` of the `lineup` array.
- Translation order: DE → ES → EN
