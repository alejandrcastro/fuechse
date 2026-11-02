# Club Manager — Füchse Berlin Reinickendorf e.V.

Tennis club management system for tracking availability, lineups, and TVBB Berlin regulatory blocks.

---

## Overview

Club Manager is a standalone web application made up of three independent HTML files, each targeting a different role within the club. No framework, bundler, or dedicated server required — everything runs directly in the browser, connected to a Supabase backend.

---

## Files

| File | Role |
|---|---|
| `admin.html` | Sportwart (full admin) |
| `kapitaen.html` | Team captain |
| `index.html` | Player (confirm availability) |
| `umfrage.html` | Player (participation survey per season) |
| `lk.html` | Player (LK calculator: how much a win improves the LK) |

`common.js` holds the code all pages share: the TVBB blocking rules (Stammkader, Stammmannschaft, Spieltag), the Supabase helpers, the club login and the Sperren table cell. A rule changed there applies everywhere at once. After editing it, raise the `?v=` number in the `<script src="common.js?v=…">` line of every page so browsers fetch the new file.

`match.css` + the MATCH VIEW part of `common.js` draw one match (warnings, lineup, "Wer hat gespielt?", availability) — the same in `kapitaen.html` and in admin → Spiele & Aufstellung. Admin adds the Ja / Notfall / Nein buttons per player.

The Overview tables, the Sperren table and the filter menus above Overview and Statistiken (age groups, teams, order) also come from `common.js`, so admin and kapitaen show them the same way.

The rules have tests: `node tests/rules.test.js` (no install needed). They also run on GitHub on every push; if one fails, the site is not updated.

---

## Tech Stack

- **Frontend:** Plain HTML, CSS and JavaScript — no frameworks, no build step
- **Backend:** [Supabase](https://supabase.com) — PostgreSQL with direct REST API
- **PDF parsing:** PDF.js — import of official TVBB Berlin documents
- **Libraries:** supabase-js 2.118.0 and PDF.js 3.11.174 are stored in `vendor/` (fixed versions, each loaded with an `integrity` hash). To update one, replace the file, put the new version in its name and in the page, and recompute the hash: `openssl dgst -sha384 -binary FILE | base64`.
- **Fonts:** Bebas Neue + DM Sans, stored in `fonts/` — no request goes to Google Fonts (GDPR)
- **Hosting:** GitHub Pages at `alejandrcastro.github.io/fuechse/`

---

## Database (Supabase)

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
| `survey_responses` | Umfrage answers — one row per person per survey (`season_id` + `competition`); created with `sql/survey_responses.sql` |

### Key columns

- `players.rank` — global LK rank within the player's primary category; used as fallback
- `players.raw_name` — `"Lastname, Firstname"` format used to generate smart short names
- `player_teams.is_mainteam` — boolean flag marking the Stammmannschaft assigned by the admin
- `player_teams.rank` — player rank within a specific team/category (source of truth for category-specific calculations)
- `teams.season` — `'Sommer'` (6 players) or `'Winter'` (4 players)
- `teams.is_4er` — manual override for 4-player format regardless of season
- `matches.counted` — boolean flag; true if the match counter has been applied (prevents duplicate counting)
- `matches.ersatz_counted` — boolean flag; true if Ersatz was included in the count

---

## Roles & Features

### `admin.html` — Sportwart

Full club management view.

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
1. Searches their name in the roster
2. Selects a match and confirms availability

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

### `umfrage.html` — Participation survey

Players answer whether they want to play in the next competition.

- **Active survey** (season ID, competition `sommer` | `ferienrunde` | `winter`, AK year, deadline) is set in **admin.html → Umfrage**.
- Name search uses the roster of the active season; people not on the list enter name, Jahrgang, Herren/Damen and LK manually.
- Categories offered = Herren/Damen + the Altersklassen the person is eligible for (AK X = turns X in `SURVEY.year`), configured in `AK`. Ferienrunde shows Mixed + Doppel categories.
- Answering again with the same name overwrites the previous answer (unique on `season_id, competition, name_key`).
- Results: **admin.html → Umfrage** tab (summary per category, full list, delete, CSV export).

### Seasons

The season selector in the **admin.html header** only changes what admin shows (this browser), so a new season can be prepared (`S2027` = Sommer 2027, `W2027` = Winter 2027/28). **⇪ … für alle aktivieren** then switches kapitaen, index and umfrage to it. Older seasons stay archived. Requires `sql/app_settings.sql` once.

## TVBB Berlin Rules

### Stammkader

A player's category-specific rank (from `player_teams.rank`) determines which team they must play for within their category. The top N players are assigned to Mannschaft 1, the next N to Mannschaft 2, etc. A player cannot be fielded in a higher-numbered team than their Stammkader position allows.

- Sommer: blocks of 6 players per team
- Winter: blocks of 4 players per team
- **Important:** The rank used for this calculation is the **category-specific rank** from `rankByTeam`, not the global `p.rank`. This ensures correct Stammkader calculation for secondary categories (Herren 30, Damen, Senioren, etc.)

### Stammmannschaft

Matches played in **all higher teams** of the category are **added up**: 2 or more → the player is blocked in this team for the rest of the season; exactly 1 → warning. Example: 1 match in Herren I and 1 in Herren II → blocked in Herren III.

- The rule applies **per category** independently (Herren, Herren 30, Damen, etc.)
- The admin can manually set `is_mainteam` to highlight the recommended team (gold `★ SM` badge)
- The Ersatz slot is **not counted by default** but can be opted-in per match via checkbox

### Spieltag (WSpO § 10 (3), § 11 (4))

A match moved by the captains keeps its **original date as Spieltag** (unless the Spielleiter moves it "von Amts wegen"; then the new date counts). A player who already played on that Spieltag cannot be fielded in the moved match.

### Import cut (local club rule)

Not a TVBB rule. When the Meldeliste is imported, players with an LK worse than 18 are **not put on the Herren I list**, unless Herren I is their own Stammkader team (`H1_MAX_LK` in `admin.html`). It only decides which team lists a player lands in; it does not block anyone.

All blocking rules live in `common.js` and are checked by `tests/rules.test.js`.

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
