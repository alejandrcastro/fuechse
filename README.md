# 🎾 Füchse Berlin Reinickendorf e.V. — Club Manager

Tennis club management system for Füchse Berlin Reinickendorf e.V. (TVBB Berlin). Two self-contained HTML web apps, no installation required, powered by Supabase.

---

## 📁 Files

| File | Description | Access |
|---|---|---|
| `index.html` | Player app — availability management | Public |
| `admin.html` | Full admin panel | Login required |
| `docs.html` | Documentation site | Public |

---

## 🚀 Deploy to GitHub Pages

1. Create a new repository on GitHub (public)
2. Upload `index.html`, `admin.html` and `docs.html`
3. Go to **Settings → Pages → Branch: main → Save**
4. After ~1 minute, the app is live at:
   - `https://username.github.io/repo/` → player app
   - `https://username.github.io/repo/admin.html` → admin panel
   - `https://username.github.io/repo/docs.html` → documentation

---

## 🔐 Admin Access

- **Username:** `admin`
- **Password:** `argentina`
- Session lasts while the tab is open (sessionStorage — clears on tab close)

---

## 🗄️ Backend — Supabase

- **URL:** `https://kepbpcttbvkbcckqoecv.supabase.co`
- **Key:** publishable key (included in HTML)

### Table schema

```
teams               — Club teams (Mannschaften)
players             — Club roster
player_teams        — Player ↔ team relationship
matches             — Matches (Begegnungen)
availability        — Player availability per match
lineups             — Match lineups (slots array)
player_match_counts — Matches played counter per player/team
```

---

## 📋 Features

### Admin (`admin.html`)

#### PDF Import
- **Namentliche Mannschaftsmeldung** → imports players with LK, birth year, IDnr and team assignment
- **ResultReport PDF** → auto-detects adult teams (Herren/Damen + category + roman suffix I–IV) with their leagues. Ignores juniors (U12/U15/U18/Midcourt)
- **Begegnungen PDF** → imports match schedule, automatically links each match to the correct team

#### Management
- **Teams** — create/edit/delete teams, configure league and season (Sommer/Winter)
- **Players** — full roster sorted by LK, filters by team/gender/blocking status, manual team assignment and match count adjustment
- **Matches** — schedule with availability bar and lineup status
- **Availability** — admin table with Ja/Vielleicht/Nein buttons per match
- **Lineup** — manual or auto player assignment by position (Singles + Doubles), LK order validation
- **Blocking** — cross-table players × teams showing Stammkader/Stammmannschaft status and warnings

#### Player View
Overlay within the admin panel for a player to confirm availability without leaving the admin.

---

### Players (`index.html`)

1. Search your name in the club roster (autocomplete)
2. See your team's upcoming matches
3. Confirm availability: ✓ Yes / ? Maybe / ✗ No

---

## ⚖️ TVBB Berlin Rules

### Stammkader
- Players are ranked by LK within each category
- Positions 1–6 (Sommer) or 1–4 (Winter) → Team 1 Stammkader
- Positions 7–12 / 5–8 → Team 2 Stammkader, etc.
- A player **cannot** play in a team with a higher number than their Stammkader team

### Stammmannschaft
- 2+ matches played in team X → blocked for all teams with a higher number, within the same category
- The rule applies **independently** per category (Herren, Herren 30, Damen, etc.)
- 1 match → warning only (⚠)

Both rules are independent and applied simultaneously. The **Blocking** tab shows the full cross-table with each player's status per team.

---

## 🌍 Languages

The interface supports **DE / ES / EN**. Language is changed with the header buttons and saved to localStorage.

---

## 🛠️ Tech stack

- **Frontend:** Plain HTML + CSS + vanilla JavaScript (no frameworks, no build step)
- **PDF parsing:** PDF.js 3.11.174 (cdnjs)
- **Backend:** Supabase (direct REST API, no SDK)
- **Fonts:** Bebas Neue + DM Sans (Google Fonts)
- **Deploy:** GitHub Pages (static files)

---

## 📄 PDF Parsers

### ResultReport (teams)
The PDF uses a 4-column layout with X ≈ 28, 227, 427, 626 px.
- PDF.js returns each table cell as a complete string (e.g. `"Herren 70 Ostliga Gruppe B"`)
- Header rows detected by presence of `"Gruppe"` → registers category+league per column
- Juvenile columns (U\d+, Midcourt) → deactivated
- In data rows, finds items containing `"Reinickendorf"` → extracts roman suffix (II/III/IV/V) from the same string

### Begegnungen (matches)
- Groups items by Y coordinate (4px tolerance)
- Detects date/time in format `Mo. DD.MM.YYYY HH:MM`
- Detects league from prefix (H, H30, D40, M70OL, etc.) and maps to category
- Determines home/away by position of the club name in the line
- Ignores juvenile categories

---

## 📝 Notes

- Admin password is hardcoded in plain text in the HTML (client-side). Sufficient to keep players out of the admin, but not cryptographic security.
- `spieler.html` included in the repo is identical to `index.html`.
- The "↓ Spieler-App" button in the admin points to `spieler.html` in the same folder.
