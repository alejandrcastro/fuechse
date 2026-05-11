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
- **Hosting:** GitHub Pages at `alejandrcastro.github.io/fuechse/`

---

## Database (Supabase)

Project: `kepbpcttbvkbcckqoecv.supabase.co`

### Tables

| Table | Description |
|---|---|
| `players` | Club roster — LK, birth year, gender, IDnr, global rank |
| `teams` | Mannschaften — category, league, number, season |
| `matches` | Matches — date, time, opponent, venue, counted, ersatz_counted |
| `player_teams` | Player↔team relationship with rank and `is_mainteam` flag |
| `availability` | Availability responses per player and match |
| `lineups` | Starting lineup + Ersatz per match |
| `player_match_counts` | Matches played per team (used for block rules) |

### Key columns

- `players.rank` — global LK rank within the player's primary category; used as fallback
- `players.raw_name` — `"Lastname, Firstname"` format used to generate smart short names
- `player_teams.is_mainteam` — boolean flag marking the Stammmannschaft assigned by the admin
- `player_teams.rank` — player rank within a specific team/category (source of truth for category-specific calculations)
- `teams.season` — `'Sommer'` (6 players) or `'Winter'` (4 players)
- `teams.is_4er` — manual override for 4-player format regardless of season
- `matches.counted` — boolean flag; true if the match counter has been applied (prevents duplicate counting)
- `matches.ersatz_counted` — boolean flag; true if Ersatz was included in the count

### Row-Level Security (RLS)

All tables have RLS enabled with appropriate policies:
- Public `SELECT` for anonymous users (read-only access)
- `INSERT`/`UPDATE` on `availability` table for anonymous users (player responses)
- Full access for authenticated users (admins and captains)

---

## Roles & Features

### `admin.html` — Sportwart

Full club management view. Requires Supabase Auth login.

**Tabs:**
- **PDF importieren** — import players from TVBB Namentliche Mannschaftsmeldung, teams from ResultReport PDF, and matches from Begegnungen PDF
- **Spieler** — full roster with filters; edit team assignments and Stammmannschaft flag
- **Mannschaften** — create and configure teams (league, category, season, 4er format)
- **Spiele & Aufstellung** — match calendar with lineup management (drag & drop, auto-generate, Ersatz slot), availability view, match count confirmation with Ersatz checkbox
- **Sperren** — active blocks table by Stammkader and Stammmannschaft rules
- **Overview** — cross-table teams × dates and players × dates with availability and lineup status, granular filters (Altersklassen + specific teams)
- **Statistiken** — match statistics and LK analysis with category and team filters

**Languages:** DE / ES / EN

**Mobile responsive:** Fully optimized for mobile devices, especially the Spiele & Aufstellung tab.

---

### `kapitaen.html` — Team Captain

Operational view for the captain. Shows only the teams assigned to the logged-in user.

**Tabs:**
- **Spiele & Aufstellung** — availability per match, lineup assignment with drag & drop, LK rule validation, conflict detection badges
- **Overview** — players × dates with availability state and lineup position, granular filters (Altersklassen + specific teams)
- **Sperren** — read-only block view for the category (LK > 20 rule not shown here)

**Special badges in availability list:**
- **(Ja → Team)** — Player has Prio II and confirmed Ja for another match the same day
- **FREI** (subtle gray with green border) — Prio II player not in any lineup that day, available
- **Bereits aufgestellt (HII)** (subtle gray) — Prio II player already in another team's lineup that day

**Languages:** DE / ES / EN

---

### `index.html` — Player

Mobile-first interface for players to confirm availability.

**Flow:**
1. Player enters the club password (SHA-256 hash split into 4 fragments for obfuscation)
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

A player's category-specific rank (from `player_teams.rank`) determines which team they must play for within their category. The top N players are assigned to Mannschaft 1, the next N to Mannschaft 2, etc. A player cannot be fielded in a higher-numbered team than their Stammkader position allows.

- Sommer: blocks of 6 players per team
- Winter: blocks of 4 players per team
- **Important:** The rank used for this calculation is the **category-specific rank** from `rankByTeam`, not the global `p.rank`. This ensures correct Stammkader calculation for secondary categories (Herren 30, Damen, Senioren, etc.)

### Stammmannschaft

If a player plays 2 or more matches for a team in their category, they are blocked from all higher-numbered teams in that same category for the rest of the season.

- The rule applies **per category** independently (Herren, Herren 30, Damen, etc.)
- The admin can manually set `is_mainteam` to highlight the recommended team (gold `★ SM` badge)
- The Ersatz slot is **not counted by default** but can be opted-in per match via checkbox

### LK > 20 Rule (Local Club Rule)

This is a **local club rule**, not an official TVBB rule. Its purpose is to keep the rosters of higher-ranked teams (Herren I / II) shorter and to concentrate new players (typically those with LK > 20) in the entry-level teams (Mannschaft 3 onwards), unless explicitly declared otherwise by the club and the coaches.

In practice, players with LK > 20 can only play in Herren team #3 or higher. This rule:
- **Only applies** in the admin Sperren tab view
- **Does not** generate warnings in lineup views (kapitaen and admin)
- **Does not** affect the `isPlayerBlockedForLineup()` check used in warnings
- Can be **overridden manually** when the club and coaches declare otherwise

### Rank Warnings (LK Order)

Lineups must respect category-specific rank order. The system shows warnings when:
- Position N has a higher rank number than position N+1 (out of order)
- Uses `playerRankInTeam(playerId, teamId)` which respects category-specific ranks
- Visual: warning text + red border on the offending slot

---

## Match Count Feature

When a match is completed, the admin can confirm it to update player match counters (used for Stammmannschaft rule):

**Workflow:**
1. Complete the lineup (all main slots filled)
2. Click **"✔ Spiel bestätigen & Zähler +1"**
3. Optional checkbox **"Ersatz hat gespielt"** — when checked, also counts the Ersatz player
4. After confirming:
   - Match is marked as `counted = true` in the database
   - Button changes to **"✓ Bereits gezählt"** (disabled)
   - **"↶ Rückgängig"** button appears for undoing the count

**Protections against duplicate counting:**
- Alert message if attempting to count an already-counted match
- Button visually disabled when match is counted
- Undo button respects the original `ersatz_counted` state

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

## Filters (Overview & Statistics)

Both admin and kapitaen Overview tabs (and admin Statistics) have a three-level filter system:

1. **Alle Altersklassen** — multi-select dropdown for categories (Herren, Damen, Herren 30, etc.)
2. **Alle Teams** — multi-select dropdown for specific teams within selected categories
3. **Nach Altersklasse / Nach Nummer** — sort option

**Behavior:**
- Selecting categories filters the teams dropdown to show only relevant teams
- All filters use custom dropdowns appended to `document.body` with `position: fixed` and `z-index: 99999` (to escape stacking context issues)
- **Herren-first sorting:** Always sorts Herren categories before Damen, regardless of selected sort option

---

## Internationalisation (i18n)

All three files support three languages with a visible toggle in the header:

- 🇩🇪 **DE** — German (default)
- 🇦🇷 **ES** — Spanish
- 🇬🇧 **EN** — English

Language changes are instant and re-render all active views without a page reload. Translations live in `const T = {de, es, en}` inside each file. Fallback is always `de`.

---

## Color Scheme

Consistent color usage across all files to differentiate states:

| Color | Hex | Meaning |
|---|---|---|
| 🟢 Green | `var(--court)` | Vollständig, Ja, OK |
| 🟡 Yellow | `#ffd700` | Teilweise aufgestellt, Noch offen, Aufstellung unvollständig |
| 🟠 Orange | `var(--warn)` | Im Notfall |
| 🔴 Red | `var(--danger)` | Nein, Gesperrt, errors |
| 🔵 Blue | `#6b7cff` (reserved) | Information badges |
| ⚪ Gray | `#bbb` | FREI, Bereits aufgestellt (subtle) |

---

## Development Conventions

- One file = one role. No imports between files.
- All Supabase calls go through `sbGet()`, `sbUpsert()` and `sbDelete()`.
- `admin.html` and `kapitaen.html` use `getHDR()` which injects the authenticated user's JWT.
- `index.html` uses the anon key directly (players do not have Supabase accounts).
- Short player names are derived from `raw_name` (`"Lastname, Firstname"` format).
- Short team names: `Herren` → `H`, `Damen` → `D`, `Senioren` → `Sen`, etc.
- `teamSize(team)` returns 4 or 6 based on season and `is_4er` flag.
- The Ersatz slot is always index `size` of the `lineup` array.
- `playerRankInTeam(playerId, teamId)` returns category-specific rank from `rankByTeam`.
- `isPlayerBlockedForLineup()` excludes the LK > 20 rule (for lineup warnings).
- `isPlayerBlockedForTeam()` includes all rules (for Sperren tab).
- Translation order: DE → ES → EN
- No personal data is stored beyond what TVBB publishes publicly (GDPR compliance)
- No email/notification features (privacy by design)
