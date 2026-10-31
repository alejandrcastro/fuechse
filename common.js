/* common.js — code shared by every page of the Club Manager (admin, kapitaen, index, umfrage, lk).
   The TVBB rules live only here, so the player page, the captain page and the Sportwart page can never disagree.
   When you change this file, raise the ?v= number in the <script src="common.js?v=…"> line of every page. */

// ── SUPABASE ── REST helpers. sbGet/sbUpsert stay in each page because the login differs (club account vs. captain/admin).
const SB_URL='https://kepbpcttbvkbcckqoecv.supabase.co';
const SB_KEY='sb_publishable_wDzLASMHgyEcQh8RPmfPRA_HfJotf-n';
// Supabase returns max. 1000 rows per request → always page through big tables (stable order required)
async function sbGetAll(t,p=''){let out=[],off=0;while(true){const b=await sbGet(t,`${p}${p?'&':''}limit=1000&offset=${off}`);out=out.concat(b);if(b.length<1000)break;off+=1000;}return out;}
// Rows whose <col> is one of <ids>, fetched in chunks so the URL stays short (R1: load only the active season)
async function sbGetIn(t,col,ids,p=''){
  const list=[...new Set(ids)].filter(Boolean),out=[];
  for(let i=0;i<list.length;i+=150){
    const chunk=list.slice(i,i+150).map(encodeURIComponent).join(',');
    out.push(...await sbGetAll(t,`${col}=in.(${chunk})${p?'&'+p:''}`));
  }
  return out;
}
async function _readSetting(key){
  try{
    const r=await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.${key}&select=value`,{headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});
    if(!r.ok)return null;const j=await r.json();return j[0]?.value??null;
  }catch(e){console.warn('app_settings',e);return null;}
}

// ── CLUB LOGIN ── One shared account for the player pages (index, umfrage, lk). Session lives in this tab (sessionStorage).
const CLUB_EMAIL='spieler@login.fuechse-berlin-reinickendorf.de';
const CLUB_SESSION_KEY='fcb_club_session';
function _clubRead(){try{return JSON.parse(sessionStorage.getItem(CLUB_SESSION_KEY)||'null');}catch(e){return null;}}
function _clubWrite(s){try{s?sessionStorage.setItem(CLUB_SESSION_KEY,JSON.stringify(s)):sessionStorage.removeItem(CLUB_SESSION_KEY);}catch(e){}}
function _clubStore(j){_clubWrite({access_token:j.access_token,refresh_token:j.refresh_token,expires_at:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600)});}
function clubShowLogin(){const o=document.getElementById('sp-login');o.style.opacity='1';o.style.display='flex';}
// Valid access token for REST calls; refreshes it when it is about to expire (tokens live ~1 h)
let _clubRefreshing=null; // one refresh at a time (refresh tokens are single-use)
function clubToken(){
  const s=_clubRead();if(!s)return Promise.resolve(null);
  if(Date.now()/1000<s.expires_at-60)return Promise.resolve(s.access_token);
  if(!_clubRefreshing)_clubRefreshing=_clubRefresh(s).finally(()=>{_clubRefreshing=null;});
  return _clubRefreshing;
}
async function _clubRefresh(s){
  try{
    const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{'apikey':SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
    if(r.ok){const j=await r.json();_clubStore(j);return j.access_token;}
  }catch(e){console.warn('refresh',e);}
  _clubWrite(null);clubShowLogin();return null;
}
async function clubHDR(extra){const t=await clubToken();return{'apikey':SB_KEY,'Authorization':'Bearer '+(t||SB_KEY),'Content-Type':'application/json',...(extra||{})};}
// Called right after the login overlay: hides it when this tab is already logged in
function clubInitGate(){if(_clubRead())document.getElementById('sp-login').style.display='none';}
window.spLogin=async function(){
  const inp=document.getElementById('sp-pw'),err=document.getElementById('sp-err');
  let ok=false;
  try{
    const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'apikey':SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:CLUB_EMAIL,password:inp.value})});
    if(r.ok){_clubStore(await r.json());ok=true;}
  }catch(e){console.error(e);}
  if(ok){
    const o=document.getElementById('sp-login');
    o.style.opacity='0';o.style.transition='opacity .3s';
    setTimeout(()=>o.style.display='none',300);
    if(typeof onClubLogin==='function')onClubLogin();
  }else{
    err.textContent='Falsches Passwort';
    inp.value='';
    setTimeout(()=>err.textContent='',2000);
  }
};

// ── TEAMS & CATEGORIES ──
function teamNumber(team){
  // state.teams stores teamNumber (camelCase), DB rows have team_number (snake_case)
  const n=parseInt(team.teamNumber||team.team_number||0);
  if(n>0&&n<10)return n;
  // Fallback: roman suffix in name (II, III, IV...)
  const roman={I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8};
  const r=team.name.match(/\b(VIII|VII|VI|IV|V|III|II)\b/);
  if(r)return roman[r[1]]||1;
  return 1;
}
function teamSize(t){return t&&(t.is_4er||t.season==='Winter')?4:6}
// Category order: Herren (0) → Damen (1) → Jugend U.. (2); Jugend: U18 → U10, m → w → gemischt
function catGroup(cat){cat=cat||'';if(/^U\d+/.test(cat))return 2;return /^Damen/i.test(cat)?1:0;}
function catAge(cat){cat=cat||'';const j=cat.match(/^U(\d+)\s*(m|w)?/);if(j)return(100-parseInt(j[1]))+(j[2]==='m'?0:j[2]==='w'?0.1:0.2);return parseInt(cat.replace(/^(Herren|Damen)\s*/,''))||0;}
function catCmp(a,b){return catGroup(a)-catGroup(b)||catAge(a)-catAge(b);}
function catGender(cat){if(!cat)return'M';const j=cat.match(/^U\d+\s*(m|w)?$/);if(j)return j[1]==='w'?'F':j[1]==='m'?'M':'X';return cat.toLowerCase().startsWith('damen')?'F':'M';}
function teamSortKey(t){
  const g=catGroup(t.category);
  const age=catAge(t.category);
  return[g,age,teamNumber(t)];
}
function teamSortCmp(a,b){
  const ka=teamSortKey(a),kb=teamSortKey(b);
  for(let i=0;i<ka.length;i++)if(ka[i]!==kb[i])return ka[i]-kb[i];
  return 0;
}
function teamById(id){return (state.allTeams||state.teams).find(t=>t.id===id)}
function playerById(id){return state.players.find(p=>p.id===id)}
// Spieltag (WSpO TVBB § 10 (3), § 11 (4)): a match moved by the captains keeps the ORIGINAL date as Spieltag
// (unless moved "von Amts wegen" → new date). All same-day rules compare Spieltage, not real dates.
function spieltagOf(m){return (m&&(m.spieltag||m.date))||'';}

// ── TVBB RULES ──
// Rule 1 – Stammkader: position in the Meldung of the category → that team; blocked in all lower teams (higher number)
// Rule 2 – Stammmannschaft: matches played in all higher teams are ADDED UP; 2+ → blocked here, exactly 1 → warning
// The captain page also has state.allTeams (every team of the season); the other pages only state.teams.
function getStammkaderTeam(playerId, catGroup){
  const catTeams=(state.allTeams||state.teams).filter(t=>t.category===catGroup).sort((a,b)=>teamNumber(a)-teamNumber(b));
  if(!catTeams.length)return null;
  // Use category-specific rank from rankByTeam (no fallback - player must have a rank in this category)
  const playerRanks=state.rankByTeam[playerId]||{};
  let rankInCat=null;
  for(const t of catTeams){const r=playerRanks[t.id];if(r!=null){rankInCat=r;break;}}
  if(rankInCat==null)return null;
  let remaining=rankInCat;
  for(const t of catTeams){const gs=teamSize(t);if(remaining<=gs)return t;remaining-=gs;}
  return catTeams[catTeams.length-1];
}
function getPlayerBlockStatus(playerId, catGroup){
  const counts=state.matchCounts[playerId]||{};
  const catTeams=(state.allTeams||state.teams).filter(t=>t.category===catGroup).sort((a,b)=>teamNumber(a)-teamNumber(b));

  // Rule 1: Stammkader
  const stammkaderTeam=getStammkaderTeam(playerId,catGroup);
  const stammkaderTeamNum=stammkaderTeam?teamNumber(stammkaderTeam):null;
  const stammkaderBlocked=stammkaderTeamNum!==null?catTeams.filter(t=>teamNumber(t)>stammkaderTeamNum):[];

  // Rule 2: Stammmannschaft
  // For each team X, sum all matches played in teams with LOWER number (higher rank) than X.
  // If that sum >= 2 → gesperrt in X. If sum == 1 → warned in X.
  const stammmannschaftBlocked=[];
  const stammmannschaftWarned=[];
  let stammmannschaftSource='';
  for(const t of catTeams){
    const tNum=teamNumber(t);
    // Sum matches played in all teams superior to t (lower team number)
    const superiorMatches=catTeams
      .filter(s=>teamNumber(s)<tNum)
      .reduce((sum,s)=>sum+(counts[s.id]||0),0);
    if(superiorMatches>=2){
      stammmannschaftBlocked.push(t);
      // For display: list the superior teams that contributed
      if(!stammmannschaftSource)stammmannschaftSource=catTeams.filter(s=>teamNumber(s)<tNum&&(counts[s.id]||0)>0).map(s=>s.name).join('+');
    } else if(superiorMatches===1){
      stammmannschaftWarned.push(t);
    }
  }

  const allBlockedIds=new Set([...stammkaderBlocked.map(t=>t.id),...stammmannschaftBlocked.map(t=>t.id)]);
  return{stammkaderTeam,stammkaderTeamNum,stammkaderBlocked,stammmannschaftBlocked,stammmannschaftWarned,stammmannschaftSource,blocked:catTeams.filter(t=>allBlockedIds.has(t.id)),warned:stammmannschaftWarned};
}
function playerRankInTeam(playerId, teamId){
  const team=teamById(teamId);if(!team)return 999;
  const cat=team.category;
  const catTeams=(state.allTeams||state.teams).filter(t=>t.category===cat).sort((a,b)=>teamNumber(a)-teamNumber(b));
  // Use the rank from the first team in the category where the player has a rank entry
  // This is the player's global position in the Namentliche Mannschaftsmeldung for this category
  const playerRanks=state.rankByTeam[playerId]||{};
  for(const t of catTeams){const r=playerRanks[t.id];if(r!=null)return r;}
  return playerById(playerId)?.rank||999;
}
function isPlayerBlockedForTeam(playerId,teamId){
  const team=teamById(teamId);if(!team)return false;
  const status=getPlayerBlockStatus(playerId,team.category);
  return status.blocked.some(b=>b.id===teamId);
}
function playedInMatch(m){
  if(!m)return[];
  if(Array.isArray(m.countedPlayers))return m.countedPlayers;
  const size=teamSize(teamById(m.teamId));return (state.lineups[m.id]||[]).slice(0,size).filter(Boolean);
}
// For a verlegt match: the other match of the same Spieltag that this player already played (earlier real date), or null
function playedOnSpieltag(pid,match){
  if(!match)return null;
  const st=spieltagOf(match);if(st===match.date)return null;
  return state.matches.find(om=>om.id!==match.id&&spieltagOf(om)===st&&om.date<match.date&&playedInMatch(om).includes(pid))||null;
}
function isPlayerBlockedForLineup(playerId,teamId,matchId){
  if(matchId&&playedOnSpieltag(playerId,state.matches.find(x=>x.id===matchId)))return true;
  const team=teamById(teamId);if(!team)return false;
  const status=getPlayerBlockStatus(playerId,team.category);
  return status.blocked.some(b=>b.id===teamId);
}

// ── MATCH COUNTS ── counting a match (and undoing it) for the Stammmannschaft rule. Uses getHDR/sbUpsert of the page.
// Always checked against the DATABASE, not the page copy: another tab or a captain may already have counted/undone the match.
// countMatchDB(match, players, includeErsatz) and undoCountDB(match) return 'ok' | 'already'
async function _freshCounts(teamId){
  const rows=await sbGetAll('player_match_counts',`team_id=eq.${teamId}&order=player_id`);
  const m={};for(const r of rows)m[r.player_id]=r.matches_played||0;return m;
}
async function _patchMatchIf(id,cond,fields){
  const r=await fetch(`${SB_URL}/rest/v1/matches?id=eq.${id}&${cond}`,{method:'PATCH',headers:{...getHDR(),'Prefer':'return=representation'},body:JSON.stringify(fields)});
  if(!r.ok)throw new Error(await r.text());
  return (await r.json()).length>0; // false = condition not met (already counted / already undone)
}
async function countMatchDB(match,players,includeErsatz){
  const claimed=await _patchMatchIf(match.id,'counted=not.is.true',{counted:true,ersatz_counted:includeErsatz,counted_players:players});
  if(!claimed)return'already';
  try{
    const cur=await _freshCounts(match.teamId);
    for(const pid of players){
      const next=(cur[pid]||0)+1;
      await sbUpsert('player_match_counts',[{player_id:pid,team_id:match.teamId,matches_played:next}]);
      if(!state.matchCounts[pid])state.matchCounts[pid]={};state.matchCounts[pid][match.teamId]=next;
    }
  }catch(e){ // roll back the claim so it can be retried
    await _patchMatchIf(match.id,'counted=is.true',{counted:false,ersatz_counted:false,counted_players:null}).catch(()=>{});
    throw e;
  }
  match.counted=true;match.ersatzCounted=includeErsatz;match.countedPlayers=players;
  return'ok';
}
async function undoCountDB(match){
  const row=(await sbGet('matches',`id=eq.${match.id}`))[0];
  if(!row||!row.counted)return'already';
  const size=teamSize(teamById(match.teamId));
  const slots=state.lineups[match.id]||[];
  const lineup=slots.slice(0,size).filter(Boolean);
  const players=Array.isArray(row.counted_players)?row.counted_players:(row.ersatz_counted&&slots[size]?[...lineup,slots[size]]:lineup);
  const released=await _patchMatchIf(match.id,'counted=is.true',{counted:false,ersatz_counted:false,counted_players:null});
  if(!released)return'already';
  const cur=await _freshCounts(match.teamId);
  for(const pid of players){
    const next=Math.max(0,(cur[pid]||0)-1);
    await sbUpsert('player_match_counts',[{player_id:pid,team_id:match.teamId,matches_played:next}]);
    if(!state.matchCounts[pid])state.matchCounts[pid]={};state.matchCounts[pid][match.teamId]=next;
  }
  match.counted=false;match.ersatzCounted=false;match.countedPlayers=null;
  return'ok';
}

// ── SPERREN TABLE ── One cell per player and team, saying in words why a player is blocked (admin and kapitaen).
const BLK_T={
  de:{stamm:'Stammkader',played:n=>`${n}× gespielt`,kader:t=>`⛔ Kader ${t}`,sm:(n,ts)=>`⛔ ${n}× in ${ts}`,warn:(n,ts)=>`⚠️ ${n}× in ${ts}`,
      tKader:t=>`Stammkader-Regel: laut Meldeliste gehört der Spieler zu ${t} und darf nicht tiefer spielen`,tSm:(n,ts)=>`Stammmannschaft-Regel: ${n} Einsätze in ${ts} – hier gesperrt`,tWarn:(n,ts)=>`${n} Einsatz in ${ts} – beim nächsten Einsatz oben ist er hier gesperrt`,
      legStamm:'Mannschaft laut Meldeliste',legBlock:'gesperrt, mit Grund',legWarn:'beim nächsten Einsatz oben gesperrt',legPlayed:'Einsätze in dieser Mannschaft'},
  es:{stamm:'Stammkader',played:n=>`${n}× jugados`,kader:t=>`⛔ Kader ${t}`,sm:(n,ts)=>`⛔ ${n}× en ${ts}`,warn:(n,ts)=>`⚠️ ${n}× en ${ts}`,
      tKader:t=>`Regla Stammkader: según la Meldeliste pertenece a ${t} y no puede jugar más abajo`,tSm:(n,ts)=>`Regla Stammmannschaft: ${n} partidos en ${ts} – bloqueado acá`,tWarn:(n,ts)=>`${n} partido en ${ts} – con el próximo arriba queda bloqueado acá`,
      legStamm:'equipo según la Meldeliste',legBlock:'bloqueado, con el motivo',legWarn:'bloqueado con el próximo partido arriba',legPlayed:'partidos en este equipo'},
  en:{stamm:'Stammkader',played:n=>`${n}× played`,kader:t=>`⛔ Kader ${t}`,sm:(n,ts)=>`⛔ ${n}× in ${ts}`,warn:(n,ts)=>`⚠️ ${n}× in ${ts}`,
      tKader:t=>`Stammkader rule: per the Meldeliste the player belongs to ${t} and may not play lower`,tSm:(n,ts)=>`Stammmannschaft rule: ${n} matches in ${ts} – blocked here`,tWarn:(n,ts)=>`${n} match in ${ts} – one more up there blocks him here`,
      legStamm:'team per the Meldeliste',legBlock:'blocked, with the reason',legWarn:'blocked after the next match higher up',legPlayed:'matches in this team'}
};
function bT(k){return(BLK_T[lang]||BLK_T.de)[k];}
const BLK_PILL='display:inline-block;padding:3px 9px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap';
const BLK_STYLE={stamm:'background:#1a2e26;color:#74c69d;box-shadow:inset 0 0 0 1.5px #74c69d',played:'background:#1a2e26;color:#74c69d',block:'background:#3a1b18;color:#ffb3aa',warn:'background:#33260f;color:#f7c48f'};
function blkShort(t){
  let n=(t?.name||'?').replace('Seniorinnen','SenF').replace('Senioren','Sen').replace('Herren','H').replace('Damen','D').trim();
  const siblings=(state.allTeams||state.teams).filter(x=>x.category===t?.category);
  if(t&&siblings.length>1&&teamNumber(t)===1&&!/\b(I|II|III|IV|V|VI|VII|VIII)$/.test(n))n+=' I';
  return n;
}
function blockCell(p,t,catTeams,status,skTeam){
  const counts=state.matchCounts[p.id]||{};
  const c=counts[t.id]||0;
  const higher=catTeams.filter(s=>teamNumber(s)<teamNumber(t));
  const supSum=higher.reduce((a,s)=>a+(counts[s.id]||0),0);
  const supTeams=higher.filter(s=>(counts[s.id]||0)>0).map(blkShort).join('+');
  const isSkBlocked=status.stammkaderBlocked.some(x=>x.id===t.id);
  const isSmBlocked=status.stammmannschaftBlocked.some(x=>x.id===t.id);
  const isSmWarned=status.stammmannschaftWarned.some(x=>x.id===t.id);
  // "Stammkader" only means something where there is a lower team to be blocked from → never on the last team
  const isSk=t.id===skTeam.id&&t.id!==catTeams[catTeams.length-1].id;
  let kind='',label='',title='';
  if(isSkBlocked&&isSmBlocked){kind='block';label=`${bT('kader')(blkShort(skTeam))} · ${supSum}×`;title=bT('tKader')(skTeam.name)+' · '+bT('tSm')(supSum,supTeams);}
  else if(isSmBlocked){kind='block';label=bT('sm')(supSum,supTeams);title=bT('tSm')(supSum,supTeams);}
  else if(isSkBlocked){kind='block';label=bT('kader')(blkShort(skTeam));title=bT('tKader')(skTeam.name);}
  else if(isSmWarned){kind='warn';label=bT('warn')(supSum,supTeams);title=bT('tWarn')(supSum,supTeams);}
  else if(isSk){kind='stamm';label=bT('stamm')+(c>0?` · ${c}×`:'');}
  else if(c>0){kind='played';label=bT('played')(c);}
  // own Stammkader team that is also on warning → one line: the Stammkader pill + just the ⚠️ symbol (reason in the tooltip)
  const skWarn=kind==='warn'&&isSk;
  const inner=skWarn?`<span style="white-space:nowrap"><span style="${BLK_PILL};${BLK_STYLE.stamm}">${bT('stamm')}</span> <span style="font-size:12px;cursor:help">⚠️</span></span>`
    :kind?`<span style="${BLK_PILL};${BLK_STYLE[kind]}">${label}</span>`
    :`<span style="font-size:11px;color:${p.teamIds.includes(t.id)?'var(--muted)':'#3a4a42'}">${p.teamIds.includes(t.id)?'—':'·'}</span>`;
  return`<td style="padding:6px 8px;text-align:center;border-left:1px solid #2e4a4222" title="${title.replace(/"/g,'&quot;')}">${inner}</td>`;
}
function blockLegend(){
  return`<div style="padding:9px 12px;display:flex;gap:8px 14px;flex-wrap:wrap;align-items:center;border-top:1px solid #2e4a42;font-size:11px;color:#c8d2ce">
    <span style="${BLK_PILL};${BLK_STYLE.stamm}">${bT('stamm')}</span>${bT('legStamm')}
    <span style="${BLK_PILL};${BLK_STYLE.block}">⛔ …</span>${bT('legBlock')}
    <span style="${BLK_PILL};${BLK_STYLE.warn}">⚠️ …</span>${bT('legWarn')}
    <span style="${BLK_PILL};${BLK_STYLE.played}">${bT('played')('N')}</span>${bT('legPlayed')}
  </div>`;
}
