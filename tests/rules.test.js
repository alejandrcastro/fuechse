// Tests for the TVBB rules in common.js (Stammkader, Stammmannschaft, Spieltag) and the Sperren table cell.
// Run:  node tests/rules.test.js      (no install needed; also runs on GitHub on every push)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'common.js'), 'utf8');
// a fresh copy of common.js for every case, with the club data in `state`
function load(state, lang = 'de') {
  const ctx = { window: {}, document: {}, console, state, lang };
  vm.createContext(ctx);
  vm.runInContext(src + '\n;this.state=state;', ctx);
  return ctx;
}
// ── test data helpers ──
const team = (id, name, category, n, season = 'Winter', extra = {}) => ({ id, name, category, teamNumber: n, season, ...extra });
const herren = (season = 'Winter') => [team('h1', 'Herren', 'Herren', 1, season), team('h2', 'Herren II', 'Herren', 2, season),
  team('h3', 'Herren III', 'Herren', 3, season), team('h4', 'Herren IV', 'Herren', 4, season)];
function club({ teams = herren(), rank = {}, counts = {}, matches = [], lineups = {} } = {}) {
  // rank: {player: number} → rank entry in the first team of the category; counts: {player: {team: matches}}
  const rankByTeam = {};
  for (const [p, r] of Object.entries(rank)) rankByTeam[p] = { [teams[0].id]: r };
  const players = [...new Set([...Object.keys(rank), ...Object.keys(counts)])].map(id => ({ id, name: id, teamIds: teams.map(t => t.id) }));
  return { teams, players, rankByTeam, matchCounts: counts, matches, lineups };
}
const ids = list => list.map(t => t.id).join(',');

// ── tiny runner ──
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function eq(actual, expected, what = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what} expected ${b}, got ${a}`);
}

console.log('\nTeam basics');
test('team number from the field, or from the roman numeral in the name', () => {
  const c = load(club());
  eq(c.teamNumber({ teamNumber: 2, name: 'x' }), 2);
  eq(c.teamNumber({ team_number: 3, name: 'x' }), 3);
  eq(c.teamNumber({ name: 'Herren III' }), 3);
  eq(c.teamNumber({ name: 'Damen' }), 1);
});
test('team size: Winter 4, Sommer 6, 4er team in Sommer 4', () => {
  const c = load(club());
  eq(c.teamSize({ season: 'Winter' }), 4);
  eq(c.teamSize({ season: 'Sommer' }), 6);
  eq(c.teamSize({ season: 'Sommer', is_4er: true }), 4);
});
test('category order: Herren, Herren 30, Damen, then youth U18 → U10, m → w', () => {
  const c = load(club());
  const cats = ['U10', 'Damen', 'U18 w', 'Herren 30', 'U18 m', 'Herren'];
  eq([...cats].sort(c.catCmp), ['Herren', 'Herren 30', 'Damen', 'U18 m', 'U18 w', 'U10']);
});

console.log('\nStammkader (position in the Meldeliste → team; blocked in all lower teams)');
test('Winter: ranks 1–4 → Herren, 5–8 → Herren II, 9–12 → Herren III', () => {
  const c = load(club({ rank: { a: 4, b: 5, c: 9 } }));
  eq(c.getStammkaderTeam('a', 'Herren').id, 'h1');
  eq(c.getStammkaderTeam('b', 'Herren').id, 'h2');
  eq(c.getStammkaderTeam('c', 'Herren').id, 'h3');
});
test('Sommer: 6 per team, rank 7 → Herren II; a 4er team counts 4', () => {
  const t = herren('Sommer'); t[0].is_4er = true;   // Herren is a 4er team
  const c = load(club({ teams: herren('Sommer'), rank: { a: 6, b: 7 } }));
  eq(c.getStammkaderTeam('a', 'Herren').id, 'h1');
  eq(c.getStammkaderTeam('b', 'Herren').id, 'h2');
  const c4 = load(club({ teams: t, rank: { a: 5 } }));
  eq(c4.getStammkaderTeam('a', 'Herren').id, 'h2', '4er Herren, rank 5:');
});
test('a rank beyond all teams → the last team', () => {
  const c = load(club({ rank: { z: 40 } }));
  eq(c.getStammkaderTeam('z', 'Herren').id, 'h4');
});
test('Stammkader Herren II → blocked in Herren III and IV, free in Herren and Herren II', () => {
  const c = load(club({ rank: { b: 6 } }));
  eq(ids(c.getPlayerBlockStatus('b', 'Herren').stammkaderBlocked), 'h3,h4');
  eq(['h1', 'h2', 'h3', 'h4'].map(t => c.isPlayerBlockedForTeam('b', t)), [false, false, true, true]);
});
test('no rank in the category → no Stammkader, nothing blocked by it', () => {
  const c = load(club({ counts: { x: {} } }));
  eq(c.getStammkaderTeam('x', 'Herren'), null);
  eq(ids(c.getPlayerBlockStatus('x', 'Herren').blocked), '');
});
test('the rank comes from the first team of the category where the player is listed', () => {
  const s = club({ rank: {} }); s.players.push({ id: 'y', name: 'y', teamIds: [] });
  s.rankByTeam.y = { h3: 10, h4: 30 };   // listed in Herren III with 10 → Herren III
  const c = load(s);
  eq(c.getStammkaderTeam('y', 'Herren').id, 'h3');
});

console.log('\nStammmannschaft (matches in all higher teams are ADDED UP: 2 → blocked, 1 → warning)');
test('1 match in Herren → warning in Herren II–IV, not blocked', () => {
  const c = load(club({ counts: { p: { h1: 1 } } }));
  const s = c.getPlayerBlockStatus('p', 'Herren');
  eq(ids(s.stammmannschaftWarned), 'h2,h3,h4'); eq(ids(s.blocked), '');
});
test('2 matches in Herren → blocked in Herren II–IV', () => {
  const c = load(club({ counts: { p: { h1: 2 } } }));
  eq(ids(c.getPlayerBlockStatus('p', 'Herren').stammmannschaftBlocked), 'h2,h3,h4');
});
test('1 in Herren + 1 in Herren II → blocked in Herren III and IV, warning in Herren II (the E1 case)', () => {
  const c = load(club({ counts: { p: { h1: 1, h2: 1 } } }));
  const s = c.getPlayerBlockStatus('p', 'Herren');
  eq(ids(s.stammmannschaftBlocked), 'h3,h4'); eq(ids(s.stammmannschaftWarned), 'h2');
  eq(c.isPlayerBlockedForTeam('p', 'h3'), true); eq(c.isPlayerBlockedForTeam('p', 'h2'), false);
});
test('matches in the own or lower teams do not block upwards', () => {
  const c = load(club({ counts: { p: { h3: 5, h4: 2 } } }));
  eq(ids(c.getPlayerBlockStatus('p', 'Herren').stammmannschaftBlocked), 'h4');
  eq(c.isPlayerBlockedForTeam('p', 'h1'), false); eq(c.isPlayerBlockedForTeam('p', 'h3'), false);
});
test('categories are independent: matches in Herren 30 do not count for Herren', () => {
  const teams = [...herren(), team('s1', 'Herren 30', 'Herren 30', 1), team('s2', 'Herren 30 II', 'Herren 30', 2)];
  const c = load(club({ teams, counts: { p: { s1: 3 } } }));
  eq(ids(c.getPlayerBlockStatus('p', 'Herren').blocked), '');
  eq(ids(c.getPlayerBlockStatus('p', 'Herren 30').blocked), 's2');
});
test('both rules together: Stammkader Herren II + 2 matches in Herren', () => {
  const c = load(club({ rank: { p: 6 }, counts: { p: { h1: 2 } } }));
  const s = c.getPlayerBlockStatus('p', 'Herren');
  eq(ids(s.blocked), 'h2,h3,h4'); eq(ids(s.stammkaderBlocked), 'h3,h4'); eq(ids(s.stammmannschaftBlocked), 'h2,h3,h4');
});

console.log('\nSpieltag (WSpO § 10 (3), § 11 (4)): a moved match keeps its original Spieltag');
test('a player who already played that Spieltag cannot play the moved match', () => {
  const matches = [
    { id: 'm1', teamId: 'h1', date: '2026-11-07', countedPlayers: ['p'] },                   // played on Saturday
    { id: 'm2', teamId: 'h2', date: '2026-11-12', spieltag: '2026-11-07' }];                  // moved from the same Spieltag
  const c = load(club({ counts: { p: {} }, matches }));
  eq(c.isPlayerBlockedForLineup('p', 'h2', 'm2'), true);
  eq(c.playedOnSpieltag('p', matches[1]).id, 'm1');
});
test('a moved match with a new Spieltag ("von Amts wegen") is free', () => {
  const matches = [
    { id: 'm1', teamId: 'h1', date: '2026-11-07', countedPlayers: ['p'] },
    { id: 'm2', teamId: 'h2', date: '2026-11-12', spieltag: '2026-11-12' }];
  const c = load(club({ counts: { p: {} }, matches }));
  eq(c.isPlayerBlockedForLineup('p', 'h2', 'm2'), false);
});
test('who played: the counted players, otherwise the first 4 (Winter) of the lineup', () => {
  const c = load(club({ matches: [], lineups: { m: ['a', 'b', 'c', 'd', 'e'] } }));
  eq(c.playedInMatch({ id: 'm', teamId: 'h1' }), ['a', 'b', 'c', 'd']);
  eq(c.playedInMatch({ id: 'm', teamId: 'h1', countedPlayers: ['a', 'e'] }), ['a', 'e']);
});

console.log('\nSperren table cell (what admin and kapitaen show)');
const cell = (c, p, t) => {
  const status = c.getPlayerBlockStatus(p, 'Herren'), catTeams = c.state.teams;
  return c.blockCell(c.state.players.find(x => x.id === p), catTeams.find(x => x.id === t), catTeams, status, status.stammkaderTeam || catTeams[0])
    .replace(/<[^>]+>/g, '').trim();
};
test('Stammkader block names the team, Stammmannschaft block names count and teams', () => {
  const c = load(club({ rank: { a: 6, k: 1 }, counts: { a: {}, b: { h1: 1, h2: 1 }, k: { h1: 2 } } }));
  eq(cell(c, 'a', 'h3'), '⛔ Kader H II');
  eq(cell(c, 'b', 'h3'), '⛔ 2× in H I+H II');
  eq(cell(c, 'b', 'h2'), '⚠️ 1× in H I');
  eq(cell(c, 'k', 'h2'), '⛔ Kader H I · 2×', 'both rules:');
});
test('"Stammkader" is shown on the own team, but never on the last team', () => {
  const c = load(club({ rank: { a: 6, z: 40 } }));
  eq(cell(c, 'a', 'h2'), 'Stammkader');
  eq(cell(c, 'z', 'h4'), '—');
});
test('the cell speaks the page language', () => {
  const c = load(club({ rank: { a: 6 } }), 'es');
  eq(cell(c, 'a', 'h3'), '⛔ Kader H II');
  const e = load(club({ counts: { b: { h1: 1 } } }), 'en');
  eq(cell(e, 'b', 'h2'), '⚠️ 1× in H I');
});

console.log('\nFerienrunde (Mixed & Doppel)');
const ferien = () => [team('mx', 'Mixed', 'Mixed', 1, 'Sommer'), team('mx2', 'Mixed II', 'Mixed', 2, 'Sommer'),
  team('hd', 'Herren Doppel', 'Herren Doppel', 1, 'Sommer'), team('hd2', 'Herren Doppel II', 'Herren Doppel', 2, 'Sommer'),
  team('dd', 'Damen 40 Doppel', 'Damen 40 Doppel', 1, 'Sommer')];
test('sizes: Mixed 6, Doppel 4 (even in a Winter-like setup); Mixed is gender X', () => {
  const c = load(club({ teams: ferien() }));
  eq(c.state.teams.map(t => c.teamSize(t)), [6, 6, 4, 4, 4]);
  eq(['Mixed', 'Herren Doppel', 'Damen 40 Doppel'].map(c.catGender), ['X', 'M', 'F']);
  eq(c.teamSize(team('w', 'Herren', 'Herren', 1, 'Winter')), 4, 'Winter unchanged:');
});
test('no Sperren in the Ferienrunde, whatever the ranks and counts say', () => {
  const t = ferien();
  const c = load(club({ teams: t, rank: { a: 1 }, counts: { a: { mx: 3, hd: 3 } } }));
  eq(c.getPlayerBlockStatus('a', 'Mixed').blocked, []);
  eq(c.getPlayerBlockStatus('a', 'Herren Doppel').warned, []);
  eq([c.isPlayerBlockedForTeam('a', 'mx2'), c.isPlayerBlockedForTeam('a', 'hd2'), c.isPlayerBlockedForLineup('a', 'hd2', null)], [false, false, false]);
});
test('Sommer rules still apply next to a Ferienrunde', () => {
  const c = load(club({ teams: [...herren('Sommer'), ...ferien()], rank: { a: 7 }, counts: { a: { mx: 5 } } }));
  eq(ids(c.getPlayerBlockStatus('a', 'Herren').blocked), 'h3,h4');
});
test('Mixed lineup order: 3 Herren, then 3 Damen', () => {
  const st = club({ teams: ferien() });
  st.players = ['m1', 'f1', 'm2', 'f2', 'm3', 'f3', 'm4'].map(id => ({ id, name: id, gender: id[0] === 'f' ? 'F' : 'M', teamIds: ['mx'] }));
  const c = load(st);
  eq(c.mvOrderedSlots(c.teamById('mx'), ['f1', 'm1', 'f2', 'm2', 'm3', 'm4']), ['m1', 'm2', 'm3', 'f1', 'f2', null]);
  eq(c.mvOrderedSlots(c.teamById('hd'), ['m1', 'm2', 'm3', 'm4', 'f1']), ['m1', 'm2', 'm3', 'm4']);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
