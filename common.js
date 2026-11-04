/* common.js — code shared by every page of the Club Manager (admin, kapitaen, index, umfrage, lk).
   The TVBB rules live only here, so the player page, the captain page and the Sportwart page can never disagree.
   When you change this file, raise the ?v= number in the <script src="common.js?v=…"> line of every page. */

// ── SUPABASE ── REST helpers. sbGet/sbUpsert stay in each page because the login differs (club account vs. captain/admin).
const SB_URL='https://kepbpcttbvkbcckqoecv.supabase.co';
const SB_KEY='sb_publishable_wDzLASMHgyEcQh8RPmfPRA_HfJotf-n';
// Text from the database (names, opponents, venues, notes, …) goes through esc() before it becomes HTML,
// so a "<" or a quote in a name can never break a page or run code.
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
// the availability answers the pages know; any other value in the database is ignored when loading
const AVAIL_STATES=['yes','conditional','notfall','no'];
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
// Superusers (all teams, admin.html) are decided by the database (fcb_is_admin), so no login names are in the code
async function sbIsAdmin(session){
  if(!session?.access_token)return false;
  try{
    const r=await fetch(`${SB_URL}/rest/v1/rpc/fcb_is_admin`,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'},body:'{}'});
    return r.ok&&(await r.json())===true;
  }catch(e){console.warn('fcb_is_admin',e);return false;}
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
    err.textContent=ct('wrongPw');
    inp.value='';
    setTimeout(()=>err.textContent='',2000);
  }
};

// ── COMMON TEXTS ── (DE → ES → EN) texts shared by several pages, plus a few that had no translation yet.
// ct(key) uses the page's current language. Elements with data-ct="key" (or data-ct-ph for a placeholder) are filled by applyCT().
const CT={
  de:{nMixed:'Aufstellung (3 Herren + 3 Damen)',nDoppel:'Aufstellung (4 Spieler · 4 Doppel)',ferienLabel:'Mixed & Doppel',mixedMen:'Herren',mixedWomen:'Damen',mixedGender:(pos,want)=>`Pos. ${pos} ist ein ${want}-Platz`,noSperrenFerien:'Mixed & Doppel: keine Sperren (die Regeln der Ferienrunde fehlen noch).',fmAllCats:'Alle Altersklassen',fmAll:'Alle',fmNoneCats:'Keine',fmNoneTeams:'Keine',sortNumber:'Nach Mannschaftsnummer',sortAK:'Nach Altersklasse',sortDate:'Nach Datum',sortTeam:'Nach Mannschaft',noMatchesShort:'Keine Spiele',notInLineup:'Nicht aufgestellt',allTeamsShort:'Alle Teams',ovLegend:['Aufstellung','Ersatz','Verfügbar','Im Notfall','Nein','★ Stammmannschaft'],ovYes:'Ja',ovNotfall:'Notfall',allCategories:'Alle Kategorien',noBlockedShort:'Keine aktiven Sperren.',colYear:'Jg.',ovTitle:'Overview',statsTitle:'Statistiken',lkAnalysis:'📊 LK-Analyse',lkAnalysisNote:'<strong>LK-Analyse:</strong> Durchschnittliche Leistungsklassen pro Position, berechnet aus den tatsächlich gespielten Aufstellungen.',teamCol:'Team',stMatchesCol:'Spiele',autoLineup:'⚡ Auto-Aufstellung',spieltagInfo:d=>`Spieltag laut WSpO: <b>${d}</b> – wer an diesem Tag schon gespielt hat, ist gesperrt.`,moveAmtlich:'Verlegung von Amts wegen (Spielleiter)',moveAmtlichSub:d=>`Nur dann gilt der neue Termin als Spieltag. Sonst bleibt der Spieltag ${d} (WSpO § 11 Abs. 4).`,movedFromInfo:(d,t)=>`<b>Verlegt</b> vom ${d} · ${t}`,movedAnswers:(a,n)=>`${a}/${n} Spieler haben für den neuen Termin geantwortet.`,shareBtn:'Teilen',shareTitle:'Aufstellung teilen',shareSub:'Text vor dem Senden anpassen (z.B. Treffpunkt). Die Nachricht ist immer auf Deutsch.',shareWa:'WhatsApp',shareNative:'Teilen…',shareCopy:'Kopieren',shareCopied:'✓ Kopiert',shareClose:'Schließen',moveBtn:'Verlegen',moveTitle:'Spiel verlegen',moveSub:'Es wird ein neuer Termin angelegt. Der alte bleibt als „verlegt“ sichtbar.',moveDate:'Neues Datum',moveTime:'Uhrzeit',movePlace:'Ort',moveNote:'Hinweis (optional)',moveNotePh:'z. B. Halle belegt, mit Gegner abgesprochen',moveKeepLineup:'Aufstellung übernehmen',moveKeepLineupSub:'Die bisherige Aufstellung wird in den neuen Termin kopiert.',moveKeepAvail:'Verfügbarkeiten übernehmen',moveKeepAvailSub:'Aus: Die Spieler werden für den neuen Termin neu abgefragt (empfohlen, weil sich das Datum ändert).',moveNuliga:'Heimspiel: Die Verlegung muss zusätzlich in <strong>nuLiga</strong> eingetragen werden.',moveCancel:'Abbrechen',moveGo:'Verlegen',moveErrMissing:'Bitte Datum und Uhrzeit angeben.',moveErrSame:'Datum, Uhrzeit und Ort sind unverändert.',moveErrSave:'Fehler beim Speichern',
      countedShort:'Gezählt',movedBadge:'VERLEGT',newBadge:'NEU',movedNewDate:'Neuer Termin',movedOn:(d,u)=>`verlegt am ${d}${u?` von ${u}`:''}`,
      playedOnSpieltag:(n,d,t)=>`⛔ ${n} hat am Spieltag ${d} bereits für ${t} gespielt (WSpO § 10 Abs. 3).`,isBlocked:(n,t)=>`⛔ ${n} ist gesperrt für ${t}`,
      nBlocks:n=>n===1?'1 Sperre in der Aufstellung':`${n} Sperren in der Aufstellung`,nHints:n=>n===1?'1 Hinweis':`${n} Hinweise`,
      rankOrder:(a,ra,b,rb)=>`Pos. ${a} (Rang ${ra}) vor Pos. ${b} (Rang ${rb})`,alsoPlays:(n,t)=>`${n} spielt auch für <strong>${t}</strong> am selben Tag`,
      lineupIncomplete:(f,s)=>`⏳ Aufstellung unvollständig (${f}/${s})`,alreadyErsatz:'⚠️ Bereits Ersatz:',dragHint:'Ziehen zum Umsortieren',
      dropYes:'── ✓ Ja',dropConditional:'── (Ja)',dropNotfall:'── Im Notfall',dropNo:'── ✗ Nein',dropNone:'── ?',
      countedLocked:'Spiel gezählt – Aufstellung gesperrt. Zum Ändern zuerst „Rückgängig“.',
      badgeYes:'✓ Ja',badgeNotfall:'Im Notfall',badgeNo:'Nein',rank:'Rang',condTo:t=>`(Ja → ${t})`,
      inLineupShort:t=>`Bereits aufgestellt (${t})`,inLineupTitle:t=>`Bereits aufgestellt in ${t}`,ersatzTitle:t=>`Ersatz bei ${t}`,
      frei:'FREI',freiTitle:t=>`Aufstellung von ${t} ist voll, Spieler nicht aufgestellt — frei für dieses Spiel`,
      wkPlay:'aufgestellt',wkErsatz:'Ersatz',wkPlayTitle:(d,dt,t,tm)=>`${d} ${dt}: in der Aufstellung von ${t} (${tm})`,wkAnsTitle:(d,dt,t)=>`${d} ${dt}: hat für ${t} zugesagt, noch nicht aufgestellt`,
      countedLabel:e=>`Bereits gezählt${e?' (inkl. Ersatz)':''}`,countAfterMatch:'Bestätigen ist ab dem Spieltag möglich.',countNeedLineup:'Zum Bestätigen muss die Aufstellung vollständig sein.',
      whoPlayed:'Wer hat gespielt?',addDoublesPlayer:'Spieler hinzufügen (nur Doppel)',tooManyPlayed:n=>`Maximal ${n} Spieler.`,
      morePlayed:n=>`Mehr als ${n}: nur wenn jemand nur Doppel gespielt hat. Wurde ein Spieler ersetzt, ihn abwählen.`,countDone:n=>`✓ ${n} Spieler +1`,
      winter4:'Winter-Mannschaften spielen immer zu viert.',to4er:x=>x?'Auf 4er-Mannschaft (4 Spieler) umstellen?':'Auf normale Mannschaft (6 Spieler) umstellen?',storageBlocked:'Der Browser-Speicher ist blockiert – die Ansicht kann nicht gewechselt werden.',
      wd:['So','Mo','Di','Mi','Do','Fr','Sa'],
      groupYes:'✓ Ja',groupConditional:'(Ja) — Prio II',groupNotfall:'Im Notfall',groupNo:'✗ Nein',winter:'Winter',summer:'Sommer',playerCol:'Spieler',
      ruleSK:'Pos. 1–6 (Sommer) / 1–4 (Winter) → Mannschaft 1, usw. Spieler dürfen nicht in niedrigere Mannschaft der Kategorie.',
      ruleSM:'2 Einsätze in höheren Mannschaften (zusammengezählt) → in dieser Mannschaft gesperrt.',
      stDate:'Datum',stMatch:'Partie',stAns:'Antw.',stYes:'Ja',stNotfall:'Notfall',stNo:'Nein',stLK:'LK ⌀<br>Aufstellung',stSM:'Stammsp.<br>Verfügbar',
      stMatches:'Spiele analysiert',stRate:'Antwortquote',stLKAvg:'LK ⌀ Aufstellung:',statsMatches:'🎾 Spiele',
      home:'Heim',away:'Auswärts',available:'verfügbar',open:'⏳ offen',lineupOk:'✓ Aufstellung',lineupWord:'Aufstellung',lineupComplete:'✓ Aufstellung vollständig',
      alreadyLineup:'⚠️ Bereits Aufstellung:',noAnswer:'— Keine Angabe',alreadyCounted:'✓ Bereits gezählt',inclErsatz:' (inkl. Ersatz)',undo:'↶ Rückgängig',
      countBtn:'✔ Spiel bestätigen & Zähler +1',saved:'✓ Gespeichert',saving:'Speichern...',saveErr:'Fehler beim Speichern',
      fullLineup:'Vollständig aufgestellt',partLineup:'Teilweise aufgestellt',stillOpen:'Noch offen',yesPrio1:'Ja (Prio I)',prio2:'Prio II',notfall:'Notfall',
      nPlayers:n=>`${n} Spieler`,nSingles:n=>`Aufstellung (${n} Einzel)`,teams:'Mannschaften',noTeams:'Keine Teams verfügbar',addMatch:'+ Spiel hinzufügen',pickTeamLeft:'← Mannschaft auswählen',
      availability:'Verfügbarkeit',ovMatches:'📋 Spiele',ovPlayers:'👥 Spieler',
      footer1:'Daten basieren auf öffentlichen TVBB-Informationen · Nur für interne Vereinszwecke',footer2:'Sportwart der Tennisabteilung · Füchse Berlin Reinickendorf e.V.',
      playerApp:'Spieler-App',captainApp:'Kapitän-App',playerAppLink:'↗ Spieler-App',username:'Benutzername',password:'Passwort',loginBtn:'Einloggen',
      wrongPw:'Falsches Passwort',wrongLogin:'Falscher Benutzer oder Passwort',
      tooManyWait:s=>`Zu viele Versuche. Bitte ${s}s warten.`,tooManyLocked:m=>`Zu viele Versuche. ${m} Minute${m>1?'n':''} gesperrt.`,
      capOnly:'Angemeldet · darf nur die eigene Mannschaft bearbeiten'},
  es:{nMixed:'Alineación (3 Herren + 3 Damen)',nDoppel:'Alineación (4 jugadores · 4 dobles)',ferienLabel:'Mixed y Doppel',mixedMen:'Herren',mixedWomen:'Damen',mixedGender:(pos,want)=>`La pos. ${pos} es un lugar de ${want}`,noSperrenFerien:'Mixed y Doppel: sin bloqueos (faltan las reglas de la Ferienrunde).',fmAllCats:'Todas las categorías',fmAll:'Todas',fmNoneCats:'Ninguna',fmNoneTeams:'Ninguno',sortNumber:'Por número de equipo',sortAK:'Por categoría (AK)',sortDate:'Por fecha',sortTeam:'Por equipo',noMatchesShort:'No hay partidos',notInLineup:'No alineados',allTeamsShort:'Todos los equipos',ovLegend:['Aufstellung','Ersatz','Disponible','Si es necesario','No','★ Stammmannschaft'],ovYes:'Sí',ovNotfall:'Si nec.',allCategories:'Todas las categorías',noBlockedShort:'Sin bloqueos activos.',colYear:'Año',ovTitle:'Resumen',statsTitle:'Estadísticas',lkAnalysis:'📊 Análisis de LK',lkAnalysisNote:'<strong>Análisis de LK:</strong> LK promedio por posición, calculada con las alineaciones que realmente jugaron.',teamCol:'Equipo',stMatchesCol:'Partidos',autoLineup:'⚡ Alineación automática',spieltagInfo:d=>`Spieltag según la WSpO: <b>${d}</b>: quien ya jugó ese día está bloqueado.`,moveAmtlich:'Movido de oficio (Spielleiter)',moveAmtlichSub:d=>`Solo así la nueva fecha cuenta como Spieltag. Si no, el Spieltag sigue siendo el ${d} (WSpO § 11 Abs. 4).`,movedFromInfo:(d,t)=>`<b>Movido</b> desde el ${d} · ${t}`,movedAnswers:(a,n)=>`${a}/${n} jugadores respondieron para la nueva fecha.`,shareBtn:'Compartir',shareTitle:'Compartir alineación',shareSub:'Podés editar el texto antes de mandarlo (ej. punto de encuentro). El mensaje sale siempre en alemán.',shareWa:'WhatsApp',shareNative:'Compartir…',shareCopy:'Copiar',shareCopied:'✓ Copiado',shareClose:'Cerrar',moveBtn:'Mover',moveTitle:'Mover partido',moveSub:'Se crea una fecha nueva. La anterior queda visible como „verlegt“.',moveDate:'Nueva fecha',moveTime:'Hora',movePlace:'Lugar',moveNote:'Comentario (opcional)',moveNotePh:'p. ej. cancha ocupada, acordado con el rival',moveKeepLineup:'Mantener alineación',moveKeepLineupSub:'La alineación actual se copia a la nueva fecha.',moveKeepAvail:'Mantener disponibilidades',moveKeepAvailSub:'Desactivado: se vuelve a consultar a los jugadores para la nueva fecha (recomendado, porque cambia el día).',moveNuliga:'Partido de local: el cambio también hay que cargarlo en <strong>nuLiga</strong>.',moveCancel:'Cancelar',moveGo:'Mover',moveErrMissing:'Indicá fecha y hora.',moveErrSame:'Fecha, hora y lugar no cambiaron.',moveErrSave:'Error al guardar',
      countedShort:'Contado',movedBadge:'POSTERGADO',newBadge:'NUEVO',movedNewDate:'Nueva fecha',movedOn:(d,u)=>`movido el ${d}${u?` por ${u}`:''}`,
      playedOnSpieltag:(n,d,t)=>`⛔ ${n} ya jugó el Spieltag ${d} para ${t} (WSpO § 10 Abs. 3).`,isBlocked:(n,t)=>`⛔ ${n} está bloqueado para ${t}`,
      nBlocks:n=>n===1?'1 bloqueo en la alineación':`${n} bloqueos en la alineación`,nHints:n=>n===1?'1 aviso':`${n} avisos`,
      rankOrder:(a,ra,b,rb)=>`Pos. ${a} (Rang ${ra}) antes que Pos. ${b} (Rang ${rb})`,alsoPlays:(n,t)=>`${n} también juega para <strong>${t}</strong> el mismo día`,
      lineupIncomplete:(f,s)=>`⏳ Alineación incompleta (${f}/${s})`,alreadyErsatz:'⚠️ Ya es Ersatz en:',dragHint:'Arrastrá para reordenar',
      dropYes:'── ✓ Sí',dropConditional:'── (Sí)',dropNotfall:'── Si es necesario',dropNo:'── ✗ No',dropNone:'── ?',
      countedLocked:'Partido contado: alineación bloqueada. Para cambiarla, primero „Deshacer“.',
      badgeYes:'✓ Sí',badgeNotfall:'Si es necesario',badgeNo:'No',rank:'Rang',condTo:t=>`(Sí → ${t})`,
      inLineupShort:t=>`Ya alineado (${t})`,inLineupTitle:t=>`Ya alineado en ${t}`,ersatzTitle:t=>`Ersatz en ${t}`,
      frei:'LIBRE',freiTitle:t=>`La alineación de ${t} está completa, jugador no alineado — libre para este partido`,
      wkPlay:'alineado',wkErsatz:'Ersatz',wkPlayTitle:(d,dt,t,tm)=>`${d} ${dt}: en la alineación de ${t} (${tm})`,wkAnsTitle:(d,dt,t)=>`${d} ${dt}: confirmó para ${t}, todavía no alineado`,
      countedLabel:e=>`Ya contado${e?' (incl. Ersatz)':''}`,countAfterMatch:'Se puede confirmar a partir del día del partido.',countNeedLineup:'Para confirmar, la alineación tiene que estar completa.',
      whoPlayed:'¿Quién jugó?',addDoublesPlayer:'Agregar jugador (solo dobles)',tooManyPlayed:n=>`Máximo ${n} jugadores.`,
      morePlayed:n=>`Más de ${n}: solo si alguien jugó únicamente el dobles. Si un jugador fue reemplazado, desmarcalo.`,countDone:n=>`✓ ${n} jugadores +1`,
      winter4:'Los equipos de invierno siempre son de 4.',to4er:x=>x?'¿Pasar a equipo de 4 (4 jugadores)?':'¿Pasar a equipo normal (6 jugadores)?',storageBlocked:'El almacenamiento del navegador está bloqueado: no se puede cambiar la vista.',
      wd:['Do','Lu','Ma','Mi','Ju','Vi','Sá'],
      groupYes:'✓ Sí',groupConditional:'(Sí) — Prio II',groupNotfall:'Si es necesario',groupNo:'✗ No',winter:'Invierno',summer:'Verano',playerCol:'Jugador',
      ruleSK:'Pos. 1–6 (verano) / 1–4 (invierno) → Equipo 1, etc. Los jugadores no pueden jugar en equipos de número mayor de la categoría.',
      ruleSM:'2 partidos en equipos superiores (sumados) → bloqueado en este equipo.',
      stDate:'Fecha',stMatch:'Partido',stAns:'Resp.',stYes:'Sí',stNotfall:'Si es nec.',stNo:'No',stLK:'LK ⌀<br>alineación',stSM:'Stammsp.<br>disponibles',
      stMatches:'partidos analizados',stRate:'tasa de respuesta',stLKAvg:'LK ⌀ alineación:',statsMatches:'🎾 Partidos',
      home:'Local',away:'Visitante',available:'disponibles',open:'⏳ pendiente',lineupOk:'✓ Alineación',lineupWord:'alineación',lineupComplete:'✓ Alineación completa',
      alreadyLineup:'⚠️ Ya en la alineación:',noAnswer:'— Sin respuesta',alreadyCounted:'✓ Ya contado',inclErsatz:' (incl. Ersatz)',undo:'↶ Deshacer',
      countBtn:'✔ Confirmar partido y contador +1',saved:'✓ Guardado',saving:'Guardando...',saveErr:'Error al guardar',
      fullLineup:'Alineación completa',partLineup:'Alineación incompleta',stillOpen:'Pendiente',yesPrio1:'Sí (Prio I)',prio2:'Prio II',notfall:'Si es necesario',
      nPlayers:n=>`${n} jugadores`,nSingles:n=>`Alineación (${n} singles)`,teams:'Equipos',noTeams:'No hay equipos',addMatch:'+ Agregar partido',pickTeamLeft:'← Elegí un equipo',
      availability:'Disponibilidad',ovMatches:'📋 Partidos',ovPlayers:'👥 Jugadores',
      footer1:'Datos basados en información pública del TVBB · Solo para uso interno del club',footer2:'Sportwart de la sección de tenis · Füchse Berlin Reinickendorf e.V.',
      playerApp:'App de jugadores',captainApp:'App de capitanes',playerAppLink:'↗ App de jugadores',username:'Usuario',password:'Contraseña',loginBtn:'Entrar',
      wrongPw:'Contraseña incorrecta',wrongLogin:'Usuario o contraseña incorrectos',
      tooManyWait:s=>`Demasiados intentos. Esperá ${s} s.`,tooManyLocked:m=>`Demasiados intentos. Bloqueado por ${m} minuto${m>1?'s':''}.`,
      capOnly:'Conectado · solo puede editar su propio equipo'},
  en:{nMixed:'Lineup (3 Herren + 3 Damen)',nDoppel:'Lineup (4 players · 4 doubles)',ferienLabel:'Mixed & doubles',mixedMen:'Herren',mixedWomen:'Damen',mixedGender:(pos,want)=>`Pos. ${pos} is a ${want} slot`,noSperrenFerien:'Mixed & doubles: no blocks (the Ferienrunde rules are not in yet).',fmAllCats:'All age groups',fmAll:'All',fmNoneCats:'None',fmNoneTeams:'None',sortNumber:'By team number',sortAK:'By age group (AK)',sortDate:'By date',sortTeam:'By team',noMatchesShort:'No matches',notInLineup:'Not in lineup',allTeamsShort:'All teams',ovLegend:['Lineup','Ersatz','Available','If needed','No','★ Stammmannschaft'],ovYes:'Yes',ovNotfall:'If nec.',allCategories:'All categories',noBlockedShort:'No active blocks.',colYear:'Year',ovTitle:'Overview',statsTitle:'Statistics',lkAnalysis:'📊 LK analysis',lkAnalysisNote:'<strong>LK analysis:</strong> average LK per position, from the lineups that actually played.',teamCol:'Team',stMatchesCol:'Matches',autoLineup:'⚡ Auto lineup',spieltagInfo:d=>`Match day per WSpO: <b>${d}</b> – anyone who already played that day is blocked.`,moveAmtlich:'Moved officially (Spielleiter)',moveAmtlichSub:d=>`Only then the new date counts as match day. Otherwise it stays ${d} (WSpO § 11 (4)).`,movedFromInfo:(d,t)=>`<b>Rescheduled</b> from ${d} · ${t}`,movedAnswers:(a,n)=>`${a}/${n} players have answered for the new date.`,shareBtn:'Share',shareTitle:'Share lineup',shareSub:'Edit the text before sending (e.g. meeting point). The message is always in German.',shareWa:'WhatsApp',shareNative:'Share…',shareCopy:'Copy',shareCopied:'✓ Copied',shareClose:'Close',moveBtn:'Reschedule',moveTitle:'Reschedule match',moveSub:'A new date is created. The old one stays visible as “verlegt”.',moveDate:'New date',moveTime:'Time',movePlace:'Venue',moveNote:'Note (optional)',moveNotePh:'e.g. court booked, agreed with opponent',moveKeepLineup:'Keep lineup',moveKeepLineupSub:'The current lineup is copied to the new date.',moveKeepAvail:'Keep availability',moveKeepAvailSub:'Off: players are asked again for the new date (recommended, since the day changes).',moveNuliga:'Home match: the change must also be entered in <strong>nuLiga</strong>.',moveCancel:'Cancel',moveGo:'Reschedule',moveErrMissing:'Please enter date and time.',moveErrSame:'Date, time and venue are unchanged.',moveErrSave:'Error while saving',
      countedShort:'Counted',movedBadge:'RESCHEDULED',newBadge:'NEW',movedNewDate:'New date',movedOn:(d,u)=>`moved on ${d}${u?` by ${u}`:''}`,
      playedOnSpieltag:(n,d,t)=>`⛔ ${n} already played on match day ${d} for ${t} (WSpO § 10 (3)).`,isBlocked:(n,t)=>`⛔ ${n} is blocked for ${t}`,
      nBlocks:n=>n===1?'1 block in the lineup':`${n} blocks in the lineup`,nHints:n=>n===1?'1 note':`${n} notes`,
      rankOrder:(a,ra,b,rb)=>`Pos. ${a} (rank ${ra}) before pos. ${b} (rank ${rb})`,alsoPlays:(n,t)=>`${n} also plays for <strong>${t}</strong> on the same day`,
      lineupIncomplete:(f,s)=>`⏳ Lineup incomplete (${f}/${s})`,alreadyErsatz:'⚠️ Already sub for:',dragHint:'Drag to reorder',
      dropYes:'── ✓ Yes',dropConditional:'── (Yes)',dropNotfall:'── If needed',dropNo:'── ✗ No',dropNone:'── ?',
      countedLocked:'Match counted – lineup locked. Undo first to change it.',
      badgeYes:'✓ Yes',badgeNotfall:'If needed',badgeNo:'No',rank:'Rank',condTo:t=>`(Yes → ${t})`,
      inLineupShort:t=>`In lineup (${t})`,inLineupTitle:t=>`Already in the lineup of ${t}`,ersatzTitle:t=>`Substitute for ${t}`,
      frei:'FREE',freiTitle:t=>`${t} lineup is full, player not in it — free for this match`,
      wkPlay:'in lineup',wkErsatz:'sub',wkPlayTitle:(d,dt,t,tm)=>`${d} ${dt}: in the lineup of ${t} (${tm})`,wkAnsTitle:(d,dt,t)=>`${d} ${dt}: confirmed for ${t}, not in lineup yet`,
      countedLabel:e=>`Already counted${e?' (incl. sub)':''}`,countAfterMatch:'Confirming is possible from match day on.',countNeedLineup:'The lineup must be complete to confirm.',
      whoPlayed:'Who played?',addDoublesPlayer:'Add player (doubles only)',tooManyPlayed:n=>`Max. ${n} players.`,
      morePlayed:n=>`More than ${n}: only if someone played doubles only. If a player was replaced, untick him.`,countDone:n=>`✓ ${n} players +1`,
      winter4:'Winter teams are always 4 players.',to4er:x=>x?'Change to 4er (4 players)?':'Change to standard (6 players)?',storageBlocked:'Browser storage blocked — cannot switch the admin view.',
      wd:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
      groupYes:'✓ Yes',groupConditional:'(Yes) — Prio II',groupNotfall:'If needed',groupNo:'✗ No',winter:'Winter',summer:'Summer',playerCol:'Player',
      ruleSK:'Pos. 1–6 (summer) / 1–4 (winter) → team 1, etc. Players may not play in a lower team (higher number) of the category.',
      ruleSM:'2 matches in higher teams (added up) → blocked in this team.',
      stDate:'Date',stMatch:'Match',stAns:'Ans.',stYes:'Yes',stNotfall:'If needed',stNo:'No',stLK:'LK ⌀<br>lineup',stSM:'Stammsp.<br>available',
      stMatches:'matches analysed',stRate:'response rate',stLKAvg:'LK ⌀ lineup:',statsMatches:'🎾 Matches',
      home:'Home',away:'Away',available:'available',open:'⏳ open',lineupOk:'✓ Lineup',lineupWord:'lineup',lineupComplete:'✓ Lineup complete',
      alreadyLineup:'⚠️ Already in a lineup:',noAnswer:'— No answer',alreadyCounted:'✓ Already counted',inclErsatz:' (incl. sub)',undo:'↶ Undo',
      countBtn:'✔ Confirm match & counter +1',saved:'✓ Saved',saving:'Saving...',saveErr:'Error while saving',
      fullLineup:'Lineup complete',partLineup:'Lineup partly set',stillOpen:'Still open',yesPrio1:'Yes (Prio I)',prio2:'Prio II',notfall:'If needed',
      nPlayers:n=>`${n} players`,nSingles:n=>`Lineup (${n} singles)`,teams:'Teams',noTeams:'No teams available',addMatch:'+ Add match',pickTeamLeft:'← Choose a team',
      availability:'Availability',ovMatches:'📋 Matches',ovPlayers:'👥 Players',
      footer1:'Based on public TVBB information · For internal club use only',footer2:'Sportwart of the tennis section · Füchse Berlin Reinickendorf e.V.',
      playerApp:'Player app',captainApp:'Captain app',playerAppLink:'↗ Player app',username:'Username',password:'Password',loginBtn:'Log in',
      wrongPw:'Wrong password',wrongLogin:'Wrong username or password',
      tooManyWait:s=>`Too many attempts. Please wait ${s}s.`,tooManyLocked:m=>`Too many attempts. Locked for ${m} minute${m>1?'s':''}.`,
      capOnly:'Logged in · may only edit their own team'}
};
function ct(k){const L=(typeof lang==='string'&&CT[lang])?lang:'de';return CT[L][k]??CT.de[k]??k;}
// matches store home/away as 'Heim' / 'Auswärts'; this is only the label shown
function seasonKindLabel(v){return v==='Winter'?ct('winter'):v==='Sommer'?ct('summer'):(v||'');}
function homeAwayLabel(v){return v==='Heim'?ct('home'):v==='Auswärts'?ct('away'):(v||'');}
function applyCT(){
  document.querySelectorAll('[data-ct]').forEach(e=>{e.textContent=ct(e.dataset.ct);});
  document.querySelectorAll('[data-ct-ph]').forEach(e=>{e.placeholder=ct(e.dataset.ctPh);});
  document.querySelectorAll('[data-ct-title]').forEach(e=>{e.title=ct(e.dataset.ctTitle);});
}
// The language chosen last time on this device (all pages share it), so the login screen opens in it too
const LANG_KEY='fcb_lang';
function savedLang(){try{const l=localStorage.getItem(LANG_KEY);return['de','es','en'].includes(l)?l:'de';}catch(e){return'de';}}
function rememberLang(l){try{localStorage.setItem(LANG_KEY,l);}catch(e){}}

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
// Ferienrunde (Mixed- & Doppelrunde, season id F2027): categories "Mixed", "Herren Doppel", "Herren 35 Doppel", "Damen Doppel", …
function isMixedCat(cat){return /^Mixed\b/i.test(cat||'');}
function isFerienCat(cat){return isMixedCat(cat)||/\bDoppel$/i.test(cat||'');}
// players per team: Mixed 6 (3 Herren + 3 Damen), Doppel 4 (4 doubles in 2 rounds), Winter/4er 4, else 6; plus one Ersatz
function teamSize(t){if(!t)return 6;if(isFerienCat(t.category))return isMixedCat(t.category)?6:4;return t.is_4er||t.season==='Winter'?4:6;}
// Category order: Herren (0) → Damen (1) → Jugend U.. (2) → Mixed (3); Jugend: U18 → U10, m → w → gemischt
function catGroup(cat){cat=cat||'';if(isMixedCat(cat))return 3;if(/^U\d+/.test(cat))return 2;return /^Damen/i.test(cat)?1:0;}
function catAge(cat){cat=cat||'';const j=cat.match(/^U(\d+)\s*(m|w)?/);if(j)return(100-parseInt(j[1]))+(j[2]==='m'?0:j[2]==='w'?0.1:0.2);return parseInt(cat.replace(/^(Herren|Damen)\s*/,''))||0;}
function catCmp(a,b){return catGroup(a)-catGroup(b)||catAge(a)-catAge(b);}
function catGender(cat){if(!cat)return'M';if(isMixedCat(cat))return'X';const j=cat.match(/^U\d+\s*(m|w)?$/);if(j)return j[1]==='w'?'F':j[1]==='m'?'M':'X';return cat.toLowerCase().startsWith('damen')?'F':'M';}
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
  // Ferienrunde (Mixed / Doppel): no Sperren until its rules are known — only the same-day hints in the lineup
  if(isFerienCat(catGroup))return{stammkaderTeam:null,stammkaderTeamNum:null,stammkaderBlocked:[],stammmannschaftBlocked:[],stammmannschaftWarned:[],stammmannschaftSource:'',blocked:[],warned:[]};
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
  const team=teamById(teamId);
  if(team&&isFerienCat(team.category))return false; // Ferienrunde: no Sperren (see getPlayerBlockStatus)
  if(matchId&&playedOnSpieltag(playerId,state.matches.find(x=>x.id===matchId)))return true;
  if(!team)return false;
  const status=getPlayerBlockStatus(playerId,team.category);
  return status.blocked.some(b=>b.id===teamId);
}

// ── MATCH VIEW ── one match: warnings, lineup, who played, availability. The same in kapitaen and in
// admin → Spiele & Aufstellung. The page passes what differs: may it edit, and the names of its handlers.
function todayISO(){return new Date().toLocaleDateString('sv-SE');}
function _wdOf(date){return date?new Date(date+'T12:00:00').getDay():null;}
function _addDays(date,n){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}
function weekendOtherDate(match){
  const wd=_wdOf(match.date);
  if(wd===6)return _addDays(match.date,1); // Sa → So
  if(wd===0)return _addDays(match.date,-1); // So → Sa
  return null; // weekday match: no weekend check
}
function weekendMatches(match){
  const other=weekendOtherDate(match);if(!other)return[];
  return state.matches.filter(m=>m.id!==match.id&&m.date===other)
    .sort((a,b)=>(a.time||'').localeCompare(b.time||'')||teamNumber(teamById(a.teamId)||{name:''})-teamNumber(teamById(b.teamId)||{name:''}));
}
function _teamShort(t){
  let n=(t?.name||'?').replace('Seniorinnen','SenF').replace('Senioren','Sen').replace('Herren','H').replace('Damen','D').trim();
  // first team of a category with more than one team → "H I" (plain "H" is ambiguous)
  const siblings=(state.allTeams||state.teams).filter(x=>x.category===t?.category);
  if(t&&siblings.length>1&&teamNumber(t)===1&&!/\b(I|II|III|IV|V|VI|VII|VIII)$/.test(n))n+=' I';
  return n;
}
// the other day of the weekend: in a lineup there (beats) or said yes there
function weekendBadges(pid,match){
  const play=[],ans=[];
  for(const om of weekendMatches(match)){
    const ot=teamById(om.teamId);const sz=teamSize(ot);
    const slots=state.lineups[om.id]||[];
    const day=ct('wd')[_wdOf(om.date)];
    const inMain=slots.slice(0,sz).includes(pid),inErsatz=slots[sz]===pid;
    if(inMain||inErsatz){
      const lbl=inMain?ct('wkPlay'):ct('wkErsatz');
      play.push(`<span class="wk-badge play" title="${esc(ct('wkPlayTitle')(day,fmtDate(om.date),ot?.name||'?',om.time||''))}">${day}: ${lbl} ${esc(_teamShort(ot))}</span>`);
    }else{
      const st=state.availability[om.id]?.[pid];
      if(st==='yes'||st==='conditional')
        ans.push(`<span class="wk-badge ans" title="${esc(ct('wkAnsTitle')(day,fmtDate(om.date),ot?.name||'?'))}">${day}: ${st==='yes'?ct('stYes'):'('+ct('stYes')+')'} ${esc(_teamShort(ot))}</span>`);
    }
  }
  return play[0]||ans[0]||''; // only one badge: aufgestellt beats zugesagt
}
const MV_ORDER={yes:0,conditional:1,notfall:2,'':3,no:4};
// players of the match's team: Ja, (Ja), Notfall, no answer, Nein — then by rank
function mvTeamPlayers(match){
  const avail=state.availability[match.id]||{};
  return state.players.filter(p=>p.teamIds.includes(match.teamId)).sort((a,b)=>{
    const ao=MV_ORDER[avail[a.id]||'']??3,bo=MV_ORDER[avail[b.id]||'']??3;
    return ao-bo||playerRankInTeam(a.id,match.teamId)-playerRankInTeam(b.id,match.teamId);
  });
}
// the other match of the same Spieltag where the player is in the lineup (main = singles, or the Ersatz slot)
function mvOtherLineup(pid,match,ersatz){
  return state.matches.find(om=>{
    if(om.id===match.id||spieltagOf(om)!==spieltagOf(match))return false;
    const sz=teamSize(teamById(om.teamId)),sl=state.lineups[om.id]||[];
    return ersatz?sl[sz]===pid:sl.slice(0,sz).includes(pid);
  })||null;
}
// grouped boxes above the lineup: ⛔ Sperren (red, open) and ⚠️ Hinweise (amber)
function mvWarningsHtml(match){
  const team=teamById(match.teamId),size=teamSize(team),lineup=state.lineups[match.id]||[];
  const hints=[];
  for(let i=0;i<size-1;i++){
    const p1=lineup[i]?playerById(lineup[i]):null,p2=lineup[i+1]?playerById(lineup[i+1]):null;
    if(p1&&p2&&playerRankInTeam(p1.id,match.teamId)>playerRankInTeam(p2.id,match.teamId))
      hints.push(ct('rankOrder')(i+1,playerRankInTeam(p1.id,match.teamId),i+2,playerRankInTeam(p2.id,match.teamId)));
  }
  const blocked=lineup.filter(Boolean).map(pid=>{
    const p=playerById(pid);if(!p)return null;
    const sp=playedOnSpieltag(pid,match);
    if(sp)return ct('playedOnSpieltag')(esc(p.name),fmtDate(spieltagOf(match)),esc(teamById(sp.teamId)?.name||'?'));
    if(isPlayerBlockedForLineup(pid,match.teamId,match.id))return ct('isBlocked')(esc(p.name),esc(team?.name||'?'));
    return null;
  }).filter(Boolean);
  for(const pid of lineup.slice(0,size).filter(Boolean)){
    const p=playerById(pid);if(!p||playedOnSpieltag(pid,match))continue; // a Spieltag block is already listed
    const om=mvOtherLineup(pid,match,false);
    if(om)hints.push(ct('alsoPlays')(esc(p.name),esc(teamById(om.teamId)?.name||'?')));
  }
  if(isMixedCat(team?.category))lineup.slice(0,size).forEach((pid,i)=>{
    const p=pid?playerById(pid):null;
    if(p&&mvGender(p)!==mvSlotGender(i))hints.push(ct('mixedGender')(i+1,ct(mvSlotGender(i)==='M'?'mixedMen':'mixedWomen')));
  });
  const filled=lineup.slice(0,size).filter(Boolean).length;
  const li=arr=>arr.map(w=>`<li>${w.replace(/^⛔\s*/,'')}</li>`).join('');
  let html='';
  if(blocked.length)html+=`<details class="warn-group red" open><summary>⛔ ${ct('nBlocks')(blocked.length)}</summary><ul>${li(blocked)}</ul></details>`;
  if(hints.length)html+=`<details class="warn-group amber"${window.innerWidth>700?' open':''}><summary>⚠️ ${ct('nHints')(hints.length)}</summary><ul>${li(hints)}</ul></details>`;
  if(!blocked.length&&!hints.length){
    if(filled>=size)html=`<div class="ok-banner">${ct('lineupComplete')}</div>`;
    else if(filled>0)html=`<div class="mx-incomplete">${ct('lineupIncomplete')(filled,size)}</div>`;
  }
  return html;
}
// lineup slots + Ersatz. o = {ro, lockMsg, set:'setSlot', drag:'onSlot'} → handlers set(i,value), <drag>DragStart/DragOver/DragLeave/Drop/DragEnd
// the title above a lineup: "Aufstellung (6 Einzel)"; Mixed and Doppel say what they are
function lineupTitle(team){return isMixedCat(team?.category)?ct('nMixed'):isFerienCat(team?.category)?ct('nDoppel'):ct('nSingles')(teamSize(team));}
// what kind of round a team plays: "Sommer" / "Winter", or "Mixed & Doppel" for the Ferienrunde
function teamKindLabel(team){return isFerienCat(team?.category)?ct('ferienLabel'):seasonKindLabel(team?.season);}
// Mixed: places 1–3 are for Herren, 4–6 for Damen
function mvSlotGender(i){return i<3?'M':'F';}
function mvGender(p){return p?.gender==='F'?'F':'M';}
// a lineup in the team's order: Mixed keeps 3 Herren, then 3 Damen (each block in the given order); others just fill up
function mvOrderedSlots(team,ids){
  const size=teamSize(team);
  if(!isMixedCat(team?.category))return ids.slice(0,size);
  const ps=ids.map(playerById).filter(Boolean),h=ps.filter(p=>mvGender(p)==='M').slice(0,3),d=ps.filter(p=>mvGender(p)==='F').slice(0,3);
  return[0,1,2].map(i=>h[i]?.id||null).concat([0,1,2].map(i=>d[i]?.id||null));
}
function mvSlotsHtml(match,o){
  const team=teamById(match.teamId),size=teamSize(team),lineup=state.lineups[match.id]||[],avail=state.availability[match.id]||{};
  const sorted=mvTeamPlayers(match);
  const gl={yes:ct('dropYes'),conditional:ct('dropConditional'),notfall:ct('dropNotfall'),no:ct('dropNo'),'':ct('dropNone')};
  const mixed=isMixedCat(team?.category);
  const opts=(sel,g)=>{ // g: 'M' / 'F' = only that gender (Mixed); the chosen player always stays in the list
    let h='<option value="">—</option>',last;
    for(const tp of sorted){
      if(g&&tp.id!==sel&&mvGender(tp)!==g)continue;
      const bl=isPlayerBlockedForLineup(tp.id,match.teamId,match.id),grp=avail[tp.id]||'';
      if(grp!==last){last=grp;h+=`<option disabled class="opt-group">${gl[grp]}</option>`;}
      h+=`<option value="${tp.id}" ${sel===tp.id?'selected':''}>${bl?'⛔ ':''}${esc(tp.name)} (${esc(tp.lkStr)}) ${avail[tp.id]==='yes'?'✓':avail[tp.id]==='no'?'✗':'?'} ${esc(tp.year||'')}</option>`;
    }
    return h;
  };
  const dis=o.ro?'disabled':'',d=o.drag;
  let html=o.ro?`<div class="mx-locked">🔒 ${o.lockMsg}</div>`:'';
  for(let i=0;i<size;i++){
    if(mixed&&(i===0||i===3))html+=`<div class="mx-label">${ct(i===0?'mixedMen':'mixedWomen')}</div>`;
    const pid=lineup[i]||'',p=pid?playerById(pid):null;
    const prev=i>0&&!(mixed&&i===3)&&lineup[i-1]?playerById(lineup[i-1]):null;
    const rankOk=!p||!prev||playerRankInTeam(p.id,match.teamId)>=playerRankInTeam(prev.id,match.teamId);
    const cls=p?(isPlayerBlockedForLineup(pid,match.teamId,match.id)?'blocked-slot':rankOk?'ok':'warning'):'';
    html+=`<div class="lineup-slot ${cls}" ${o.ro?'':'draggable="true"'} data-slot-index="${i}"
      ondragstart="${d}DragStart(event,${i})" ondragover="${d}DragOver(event)" ondragleave="${d}DragLeave(event)" ondrop="${d}Drop(event,${i})" ondragend="${d}DragEnd(event)">
      <span class="drag-handle" title="${ct('dragHint')}">⠿</span>
      <div class="lineup-pos">${i+1}</div>
      <select ${dis} onchange="${o.set}(${i},this.value)">${opts(pid,mixed?mvSlotGender(i):null)}</select>
    </div>`;
  }
  const ePid=lineup[size]||'',eP=ePid?playerById(ePid):null;
  const eBlocked=ePid?isPlayerBlockedForLineup(ePid,match.teamId,match.id):false;
  let eWarn='';
  if(ePid){
    const oL=mvOtherLineup(ePid,match,false),oE=oL?null:mvOtherLineup(ePid,match,true);
    if(oL)eWarn=`${ct('alreadyLineup')} <strong>${esc(teamById(oL.teamId)?.name||'?')}</strong>`;
    else if(oE)eWarn=`${ct('alreadyErsatz')} <strong>${esc(teamById(oE.teamId)?.name||'?')}</strong>`;
  }
  html+=`<div class="mx-ersatz">
    <div class="mx-label">Ersatz</div>
    <div class="lineup-slot is-ersatz ${eP?(eBlocked?'blocked-slot':'ok'):''}">
      <div class="lineup-pos is-e">E</div>
      <select ${dis} onchange="${o.set}(${size},this.value)">${opts(ePid)}</select>
    </div>
    ${eWarn?`<div class="warn-banner small">${eWarn}</div>`:''}
  </div>`;
  return html;
}
// one row per player. o.actions(p,status) → html for the right side (admin: Ja/Notfall/Nein buttons); without it the status badge
function mvAvailHtml(match,o={}){
  const avail=state.availability[match.id]||{};
  const label={yes:ct('groupYes'),conditional:ct('groupConditional'),notfall:ct('groupNotfall'),no:ct('groupNo'),'':ct('noAnswer')};
  const tag=(title,text,extra='')=>`<span title="${esc(title)}" class="mx-tag${extra}">${text}</span>`;
  let last,html='';
  for(const p of mvTeamPlayers(match)){
    const s=avail[p.id]||'';
    if(s!==last){last=s;html+=`<div class="avail-group-label is-${s||'none'}">${label[s]}</div>`;}
    const blocked=isPlayerBlockedForLineup(p.id,match.teamId,match.id);
    const sm=!!(state.mainTeam[p.id]?.[match.teamId]);
    const r=playerRankInTeam(p.id,match.teamId);
    let badge=s==='yes'?ct('badgeYes'):s==='notfall'?ct('badgeNotfall'):s==='no'?ct('badgeNo'):'—',extra='';
    if(s==='conditional'||s==='notfall'){
      const yesMatch=s==='conditional'?state.matches.find(om=>om.id!==match.id&&spieltagOf(om)===spieltagOf(match)&&state.availability[om.id]?.[p.id]==='yes'):null;
      const yesTeam=yesMatch?teamById(yesMatch.teamId):null;
      if(s==='conditional')badge=yesTeam?ct('condTo')(esc(yesTeam.name)):'('+ct('stYes')+')';
      const inL=mvOtherLineup(p.id,match,false),inE=inL?null:mvOtherLineup(p.id,match,true);
      if(inL){const t=teamById(inL.teamId);extra=tag(ct('inLineupTitle')(t.name),ct('inLineupShort')(esc(_teamShort(t))));}
      else if(inE){const t=teamById(inE.teamId);extra=tag(ct('ersatzTitle')(t.name),`Ersatz (${esc(_teamShort(t))})`,' dashed');}
      else if(yesTeam){ // the other team's lineup is full without him → free for this match
        const sz=teamSize(yesTeam),sl=state.lineups[yesMatch.id]||[];
        if(sl.slice(0,sz).filter(Boolean).length>=sz&&!sl.slice(0,sz).includes(p.id)&&sl[sz]!==p.id)extra=tag(ct('freiTitle')(yesTeam.name),ct('frei'),' frei');
      }
    }
    if(!extra)extra=weekendBadges(p.id,match); // max. one extra badge: same-day beats the weekend hint
    const right=o.actions?o.actions(p,s):`<span class="avail-badge mx-badge is-${s||'none'}">${badge}</span>`;
    html+=`<div class="avail-row">
      <div class="avail-avatar${sm?' sm':''}">${esc(initials(p.name))}</div>
      <div class="avail-info">
        <div class="avail-name">${esc(p.name)}${sm?' <span class="sm-badge">★ SM</span>':''}${blocked?' <span class="blocked-badge">⛔</span>':''}</div>
        <div class="avail-meta">${esc(p.lkStr||'')} · Jg. ${esc(p.year||'—')} · ${ct('rank')} ${r<999?r:'—'}</div>
      </div>
      <span class="avail-tags">${extra}</span>${right}
    </div>`;
  }
  return html||`<div class="empty">—</div>`;
}
// "Who played?" under a complete lineup → count the match. o = {canEdit, confirm:'fnName', undo:'fnName'}
function mvCountHtml(match,o){
  if(isFerienCat(teamById(match.teamId)?.category))return''; // Ferienrunde: no Sperren, nothing to count
  const size=teamSize(teamById(match.teamId)),lineup=state.lineups[match.id]||[],filled=lineup.slice(0,size).filter(Boolean).length;
  if(match.counted){
    const who=(match.countedPlayers||[]).map(pid=>playerById(pid)?.name).filter(Boolean);
    return`<span class="match-status status-ready big">✔ ${ct('countedLabel')(match.ersatzCounted)}</span>`+
      (who.length?`<span class="mx-note">${who.map(esc).join(' · ')}</span>`:'')+
      (o.canEdit?`<button class="auto-btn undo" onclick="${o.undo}()">${ct('undo')}</button>`:'');
  }
  if(!o.canEdit)return'';
  if(match.date>todayISO())return`<span class="mx-note">${ct('countAfterMatch')}</span>`;
  if(filled<size)return`<span class="mx-note">${ct('countNeedLineup')}</span>`;
  // lineup ticked, Ersatz not; if the Ersatz came in, untick the player he replaced
  const cand=[...lineup.slice(0,size).map((pid,i)=>({pid,pos:String(i+1),on:true})),...(lineup[size]?[{pid:lineup[size],pos:'E',on:false}]:[])].filter(c=>c.pid);
  return`<div class="mx-count" id="mx-count" data-mid="${match.id}">
      <div class="mx-label">${ct('whoPlayed')} <span id="mx-played-count"></span></div>
      <div id="mx-played-list" class="mx-played-list">${cand.map(c=>mvPlayedChip(c.pid,c.pos,c.on)).join('')}</div>
      <select id="mx-played-add" class="mx-add" onchange="mvAddPlayedChip(this.value)">
        <option value="">＋ ${ct('addDoublesPlayer')}</option>
        ${state.players.filter(p=>p.teamIds.includes(match.teamId)&&!cand.some(c=>c.pid===p.id))
          .sort((a,b)=>playerRankInTeam(a.id,match.teamId)-playerRankInTeam(b.id,match.teamId))
          .map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.lkStr||'–')})</option>`).join('')}
      </select>
      <div class="mx-confirm-row">
        <button class="auto-btn" id="mx-confirm-btn" onclick="${o.confirm}()">${ct('countBtn')}</button>
        <span id="mx-confirm-status" class="mx-note"></span>
      </div></div>`;
}
function mvPlayedChip(pid,pos,on){
  return`<label class="mx-chip"><input type="checkbox" class="mx-played" value="${pid}" ${on?'checked':''} onchange="mvUpdatePlayedCount()">
    <span class="mx-note">${pos}</span> ${esc(playerById(pid)?.name||'?')}</label>`;
}
function mvAddPlayedChip(pid){ // a player who only played Doppel
  if(!pid)return;
  const list=document.getElementById('mx-played-list');
  if(list&&!list.querySelector(`.mx-played[value="${pid}"]`))list.insertAdjacentHTML('beforeend',mvPlayedChip(pid,'D',true));
  const sel=document.getElementById('mx-played-add');
  if(sel){const op=sel.querySelector(`option[value="${pid}"]`);if(op)op.remove();sel.value='';}
  mvUpdatePlayedCount();
}
function mvPlayedSelection(){return[...document.querySelectorAll('.mx-played:checked')].map(x=>x.value);}
function mvUpdatePlayedCount(){
  const m=state.matches.find(x=>x.id===document.getElementById('mx-count')?.dataset.mid);if(!m)return;
  const size=teamSize(teamById(m.teamId)),n=mvPlayedSelection().length,max=size*2; // every Doppel can be played by others
  const c=document.getElementById('mx-played-count');if(c){c.textContent=`(${n})`;c.className=n>max?'c-danger':n>=size?'c-court':'c-warn';}
  const b=document.getElementById('mx-confirm-btn');if(b)b.disabled=n===0||n>max;
  const st=document.getElementById('mx-confirm-status');
  if(st){
    st.textContent=n>max?ct('tooManyPlayed')(max):n>size?ct('morePlayed')(size):'';
    st.classList.toggle('c-danger',n>max);st.classList.toggle('c-warn',n>size&&n<=max);
  }
}
// match cards of one team (moved matches crossed out). o = {selected, open:'fnName'}
function mvMatchCardsHtml(team,matches,o){
  if(!matches.length)return`<div class="empty">—</div>`;
  return matches.map(m=>{
    const opp=esc(m.opponent);
    if(m.status==='verlegt'){
      const nm=state.matches.find(x=>x.id===m.movedTo);
      return`<div class="match-card moved">
        <div class="match-header"><div>
          <div class="match-title">${esc(team.name)} vs ${opp}</div>
          <div class="match-meta">📅 ${fmtDate(m.date)} · ${esc(m.time)} · ${homeAwayLabel(m.home)}</div>
        </div><span class="match-status status-moved">⇄ ${ct('movedBadge')}</span></div>
        ${nm?`<div class="moved-link">→ ${ct('movedNewDate')}: <b>${fmtDate(nm.date)} · ${esc(nm.time)}</b>${m.movedAt?` · ${ct('movedOn')(fmtDate(m.movedAt.slice(0,10)),esc(m.movedBy))}`:''}</div>`:''}
      </div>`;
    }
    const avail=state.availability[m.id]||{},tp=state.players.filter(p=>p.teamIds.includes(m.teamId));
    const yes=tp.filter(p=>avail[p.id]==='yes').length,pct=tp.length?Math.round(yes/tp.length*100):0;
    const sz=teamSize(teamById(m.teamId)),hasLineup=(state.lineups[m.id]||[]).slice(0,sz).filter(Boolean).length>=sz;
    return`<div class="match-card ${o.selected===m.id?'active':''}" onclick="${o.open}('${m.id}')">
      <div class="match-header"><div>
        <div class="match-title">${esc(team.name)} vs ${opp}${m.movedFrom?`<span class="status-new">${ct('newBadge')}</span>`:''}</div>
        <div class="match-meta">📅 ${fmtDate(m.date)} · ${esc(m.time)} · ${homeAwayLabel(m.home)}</div>
      </div><span class="match-status ${hasLineup||m.counted?'status-ready':'status-open'}">${m.counted?'✔ '+ct('countedShort'):hasLineup?ct('lineupOk'):ct('open')}</span></div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
      <div class="mc-avail">${yes}/${tp.length} ${ct('available')}</div>
    </div>`;
  }).join('');
}

// ── MOVE A MATCH (Verlegen) + SHARE THE LINEUP ── kapitaen and admin. The page defines onMatchMoved(newId) to reload.
function _mvModal(id){
  let el=document.getElementById(id);
  if(!el){document.body.insertAdjacentHTML('beforeend',`<div class="mv-bg" id="${id}" onclick="if(event.target===this)this.classList.remove('open')"><div class="mv" id="${id}-box"></div></div>`);el=document.getElementById(id);}
  return el;
}
function mvUser(){
  if(typeof currentUsername==='function')return currentUsername();
  return((window._sbAuth?._session?.user?.email)||'').split('@')[0];
}
// "moved from …" note above the lineup of a moved match
function mvMoveInfoHtml(match){
  const orig=match.movedFrom?(state.movedMatches||[]).find(x=>x.id===match.movedFrom):null;
  if(!orig)return'';
  const tp=state.players.filter(p=>p.teamIds.includes(match.teamId));
  const answered=tp.filter(p=>(state.availability[match.id]||{})[p.id]).length;
  const note=orig.moveNote?` — <i>${esc(orig.moveNote)}</i>`:'';
  const st=spieltagOf(match)!==match.date?`<br>${ct('spieltagInfo')(fmtDate(spieltagOf(match)))}`:'';
  return`<div class="info-banner">⇄ ${ct('movedFromInfo')(fmtDate(orig.date),esc(orig.time))}${note}${st}<br>${ct('movedAnswers')(answered,tp.length)}</div>`;
}
let _mvMoveId=null;
function mvOpenMove(matchId){
  const m=state.matches.find(x=>x.id===matchId);if(!m)return;
  _mvMoveId=matchId;
  const team=teamById(m.teamId),hasLineup=(state.lineups[m.id]||[]).some(Boolean);
  const modal=_mvModal('move-modal');
  document.getElementById('move-modal-box').innerHTML=`
    <h2>⇄ ${ct('moveTitle')}</h2>
    <div class="mv-sub">${ct('moveSub')}</div>
    <div class="orig"><b>${esc(team?.name)} vs ${esc(m.opponent)}</b>${fmtDate(m.date)} · ${esc(m.time)} · ${homeAwayLabel(m.home)}</div>
    <div class="row2">
      <div class="field"><label>${ct('moveDate')}</label><input type="date" id="mv-date" value="${m.date}"></div>
      <div class="field"><label>${ct('moveTime')}</label><input type="time" id="mv-time" value="${esc(m.time||'')}"></div>
    </div>
    <div class="field"><label>${ct('movePlace')}</label>
      <select id="mv-home" onchange="document.getElementById('mv-nuliga').style.display=this.value==='Heim'?'':'none'"><option value="Heim" ${m.home==='Heim'?'selected':''}>${ct('home')}</option><option value="Auswärts" ${m.home!=='Heim'?'selected':''}>${ct('away')}</option></select>
    </div>
    <div class="field"><label>${ct('moveNote')}</label><input type="text" id="mv-note" maxlength="140" placeholder="${esc(ct('moveNotePh'))}"></div>
    <label class="check"><input type="checkbox" id="mv-amtlich"><span>${ct('moveAmtlich')}<small>${ct('moveAmtlichSub')(fmtDate(spieltagOf(m)))}</small></span></label>
    <label class="check"><input type="checkbox" id="mv-lineup" ${hasLineup?'checked':''}><span>${ct('moveKeepLineup')}<small>${ct('moveKeepLineupSub')}</small></span></label>
    <label class="check"><input type="checkbox" id="mv-avail"><span>${ct('moveKeepAvail')}<small>${ct('moveKeepAvailSub')}</small></span></label>
    <div class="rule-box warn mv-nuliga" id="mv-nuliga"${m.home==='Heim'?'':' style="display:none"'}>${ct('moveNuliga')}</div>
    <div class="mv-err" id="mv-err"></div>
    <div class="mv-actions">
      <button class="mv-ghost" onclick="mvCloseMove()">${ct('moveCancel')}</button>
      <button class="mv-go" id="mv-go" onclick="mvDoMove()">${ct('moveGo')}</button>
    </div>`;
  modal.classList.add('open');
}
function mvCloseMove(){document.getElementById('move-modal')?.classList.remove('open');}
// a new match with the new date/time; the original is marked 'verlegt'
async function mvDoMove(){
  const m=state.matches.find(x=>x.id===_mvMoveId);if(!m)return;
  const date=document.getElementById('mv-date').value,time=document.getElementById('mv-time').value,home=document.getElementById('mv-home').value;
  const note=document.getElementById('mv-note').value.trim();
  const keepLineup=document.getElementById('mv-lineup').checked,keepAvail=document.getElementById('mv-avail').checked,amtlich=document.getElementById('mv-amtlich').checked;
  const err=document.getElementById('mv-err');
  if(!date||!time){err.textContent=ct('moveErrMissing');return;}
  if(date===m.date&&time===m.time&&home===m.home){err.textContent=ct('moveErrSame');return;}
  const btn=document.getElementById('mv-go');btn.disabled=true;btn.textContent='...';
  if(typeof setSync==='function')setSync('ing','⟳');
  const newId=uid();
  try{
    // Spieltag stays the original one (WSpO § 11 (4)) unless moved "von Amts wegen"
    await sbUpsert('matches',[{id:newId,team_id:m.teamId,opponent:m.opponent,date,time,home,venue:m.venue,moved_from:m.id,spieltag:amtlich?date:spieltagOf(m)}]);
    if(keepLineup&&(state.lineups[m.id]||[]).some(Boolean))await sbUpsert('lineups',[{match_id:newId,slots:state.lineups[m.id]}]);
    if(keepAvail){
      const rows=Object.entries(state.availability[m.id]||{}).map(([pid,status])=>({match_id:newId,player_id:pid,status}));
      for(let i=0;i<rows.length;i+=100)await sbUpsert('availability',rows.slice(i,i+100));
    }
    const r=await fetch(`${SB_URL}/rest/v1/matches?id=eq.${m.id}`,{method:'PATCH',headers:getHDR(),
      body:JSON.stringify({status:'verlegt',moved_to:newId,move_note:note||null,moved_at:new Date().toISOString(),moved_by:mvUser()})});
    if(!r.ok)throw new Error(await r.text());
    mvCloseMove();
    if(typeof onMatchMoved==='function')await onMatchMoved(newId);
  }catch(e){
    console.error(e);if(typeof setSync==='function')setSync('err','✕ '+ct('saveErr'));
    err.textContent=ct('saveErr');btn.disabled=false;btn.textContent=ct('moveGo');
  }
}
// plain text of the match + lineup for the team chat. Always German.
function mvShareText(m){
  const team=teamById(m.teamId),size=teamSize(team),slots=state.lineups[m.id]||[];
  const WD=['So','Mo','Di','Mi','Do','Fr','Sa'],d=m.date?new Date(m.date+'T12:00:00'):null;
  const L=[];
  L.push(`🎾 *${team?.name||'?'} – ${m.opponent}*`);
  if(team?.liga)L.push(team.liga);
  L.push('');
  L.push(`📅 ${d?WD[d.getDay()]+', ':''}${fmtDate(m.date)} · ${m.time||'?'} Uhr`);
  L.push(m.home==='Heim'?'🏠 Heimspiel':'🚗 Auswärtsspiel');
  if(m.venue){L.push(`📍 ${m.venue}`);L.push(`https://maps.google.com/?q=${encodeURIComponent(m.venue)}`);}
  const orig=m.movedFrom?(state.movedMatches||[]).find(x=>x.id===m.movedFrom):null;
  if(orig)L.push(`⇄ Verlegt vom ${fmtDate(orig.date)} ${orig.time||''}`.trim());
  if(spieltagOf(m)!==m.date)L.push(`(Spieltag ${fmtDate(spieltagOf(m))})`);
  L.push('');
  L.push('*Aufstellung*');
  for(let i=0;i<size;i++){const p=slots[i]?playerById(slots[i]):null;L.push(`${i+1}. ${p?p.name+(p.lkStr?` (${p.lkStr})`:''):'— offen —'}`);}
  const e=slots[size]?playerById(slots[size]):null;
  L.push(`Ersatz: ${e?e.name+(e.lkStr?` (${e.lkStr})`:''):'—'}`);
  return L.join('\n');
}
function mvOpenShare(matchId){
  const m=state.matches.find(x=>x.id===matchId);if(!m)return;
  const modal=_mvModal('share-modal');
  document.getElementById('share-modal-box').innerHTML=`
    <h2 class="share">📤 ${ct('shareTitle')}</h2>
    <div class="mv-sub spaced">${ct('shareSub')}</div>
    <textarea class="share-text" id="share-text"></textarea>
    <div class="mv-err ok" id="share-msg"></div>
    <div class="mv-actions wrap">
      <button class="mv-ghost" onclick="mvCloseShare()">${ct('shareClose')}</button>
      <button class="mv-ghost" onclick="mvShareCopy()">${ct('shareCopy')}</button>
      ${navigator.share?`<button class="mv-ghost" onclick="mvShareNative()">${ct('shareNative')}</button>`:''}
      <button class="mv-wa" onclick="mvShareWa()">${ct('shareWa')}</button>
    </div>`;
  document.getElementById('share-text').value=mvShareText(m);
  modal.classList.add('open');
}
function mvCloseShare(){document.getElementById('share-modal')?.classList.remove('open');}
function _mvShareVal(){return document.getElementById('share-text').value;}
function mvShareWa(){window.open('https://wa.me/?text='+encodeURIComponent(_mvShareVal()),'_blank');}
async function mvShareNative(){try{await navigator.share({text:_mvShareVal()});}catch(e){if(e.name!=='AbortError')console.error(e);}}
async function mvShareCopy(){
  const t=_mvShareVal();
  try{await navigator.clipboard.writeText(t);}
  catch(e){const ta=document.getElementById('share-text');ta.select();document.execCommand('copy');}
  const msg=document.getElementById('share-msg');msg.textContent=ct('shareCopied');setTimeout(()=>msg.textContent='',2000);
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

// ── OVERVIEW ── (admin + kapitaen) one table: teams × match days with the lineups, or players × match days.
// The page decides which teams (filters, scope, order) and passes the function that opens a match.
// first names; first name + initials of the surname when the first name is used twice in these teams
function ovNamer(teams){
  const first=p=>{const rn=p.rawName||p.raw_name||p.name;return rn.includes(',')?rn.split(',')[1].trim().split(' ')[0]:p.name.trim().split(' ')[0];};
  const initials=p=>{const rn=p.rawName||p.raw_name||p.name;const sur=rn.includes(',')?rn.split(',')[0].trim():p.name.trim().split(' ').slice(1).join(' ');return sur.split(/[ -]+/).map(w=>w[0]).join('.')+'.';};
  const counts={};
  for(const p of state.players.filter(p=>p.teamIds.some(tid=>teams.find(t=>t.id===tid)))){const f=first(p);counts[f]=(counts[f]||0)+1;}
  return p=>{if(!p)return'—';const f=first(p);return counts[f]>1?`${f} ${initials(p)}`:f;};
}
const OV_EMPTY_TD='<td class="ov-empty">—</td>';
function ovPlayerLine(label,p,name,ersatz){
  return ersatz
    ?`<div class="ov-line is-ersatz">
          <span class="ov-pos">${label}</span>
          <span title="${esc(p.name)}">${esc(name(p))}</span>
        </div>`
    :`<div class="ov-line${p?'':' is-none'}">
          <span class="ov-pos">${label}</span>
          <span title="${esc(p?p.name:'')}">${esc(name(p))}</span>
        </div>`;
}
// one match: status colour, opponent, time · H/A · filled, then the lineup and the Ersatz
// one match: status colour (is-full / is-part / is-open), opponent, time · H/A · filled, then the lineup and the Ersatz
function ovMatchCell(m,team,name,open){
  const sz=teamSize(team),slots=state.lineups[m.id]||[],main=slots.slice(0,sz);
  const filled=main.filter(Boolean).length,complete=filled>=sz,partial=filled>0&&!complete;
  const st=complete?'is-full':partial?'is-part':'is-open',icon=complete?'✓':partial?'⏳':'·';
  let lines='';
  for(let i=0;i<sz;i++){const pid=main[i];lines+=ovPlayerLine(`${i+1}.`,pid?playerById(pid):null,name,false);}
  const ep=slots[sz]?playerById(slots[sz]):null;
  if(ep)lines+=ovPlayerLine('E.',ep,name,true);
  return`<td class="ov-cell">
        <div onclick="${open}('${m.id}')" class="ov-match ${st}">
          <div class="ov-opp" title="${esc(m.opponent)}">${icon} ${esc(m.opponent)}</div>
          <div class="ov-meta">${esc(m.time)} · ${m.home==='Heim'?'H':'A'} · ${filled}/${sz}</div>
          <div class="ov-lines">${lines}</div>
        </div>
      </td>`;
}
// "Nicht aufgestellt": who said Ja / (Ja) / Notfall for a match that day and is in no lineup that day
// "Nicht aufgestellt": who said Ja / (Ja) / Notfall for a match that day and is in no lineup that day
function ovFreeCell(dayMatches,name){
  const busy=new Set();
  for(const dm of dayMatches){const sz=teamSize(teamById(dm.teamId)),sl=state.lineups[dm.id]||[];sl.slice(0,sz).filter(Boolean).forEach(pid=>busy.add(pid));if(sl[sz])busy.add(sl[sz]);}
  const ord={yes:0,conditional:1,notfall:2},free=new Map();
  for(const dm of dayMatches)for(const p of state.players.filter(p=>p.teamIds.includes(dm.teamId))){
    if(busy.has(p.id))continue;
    const a=state.availability[dm.id]?.[p.id]||'';
    if(a!=='yes'&&a!=='conditional'&&a!=='notfall')continue;
    const old=free.get(p.id);if(!old||ord[a]<ord[old.a])free.set(p.id,{p,a});
  }
  if(!free.size)return OV_EMPTY_TD;
  const list=[...free.values()].sort((x,y)=>ord[x.a]-ord[y.a]||(x.p.rank||999)-(y.p.rank||999));
  return'<td class="ov-cell">'+list.map(x=>{
    const mark=x.a==='yes'?'✓':x.a==='conditional'?'(✓)':'!';
    return`<div class="ov-free is-${x.a}">
        <span class="ov-mark">${mark}</span>
        <span title="${esc(x.p.name)}">${esc(name(x.p))}</span>
      </div>`;}).join('')+'</td>';
}
// color = one of the c-… classes in ui.css
function ovLegendItem(color,mark,label){
  return`<div class="ov-legend-item">
          <span class="ov-legend-mark ${color}">${mark}</span>
          <span class="c-muted">${label}</span>
        </div>`;
}
function ovMatchesLegend(){
  return`<div class="ov-legend">
    <div class="ov-legend-grid">
      <div>${ovLegendItem('c-court','●',ct('fullLineup'))}${ovLegendItem('c-partial','●',ct('partLineup'))}${ovLegendItem('c-muted','●',ct('stillOpen'))}</div>
      <div>${ovLegendItem('c-yes','✓',ct('yesPrio1'))}${ovLegendItem('c-yes-soft','(✓)',ct('prio2'))}${ovLegendItem('c-warn','!',ct('notfall'))}</div>
    </div>
  </div>`;
}
// "Spiele" mode: a row per team, a column per match day, plus the "Nicht aufgestellt" row
// "Spiele" mode: a row per team, a column per match day, plus the "Nicht aufgestellt" row
function ovMatchesHtml(teams,o){
  const matches=state.matches.filter(m=>teams.find(t=>t.id===m.teamId)).sort((a,b)=>a.date.localeCompare(b.date));
  if(!matches.length)return`<div class="empty">${ct('noMatchesShort')}</div>`;
  const dates=[...new Set(matches.map(m=>m.date))].sort(),name=ovNamer(teams);
  let html=`<table class="ov-table">
    <thead><tr class="ov-head">
      <th class="ov-th-first">${ct('teamCol')}</th>
      ${dates.map(d=>`<th class="ov-th">${fmtDate(d)}</th>`).join('')}
    </tr></thead><tbody>`;
  for(const team of teams){
    html+=`<tr class="ov-row">
      <td class="ov-team">${esc(team.name)}</td>`;
    for(const d of dates){const m=matches.find(x=>x.teamId===team.id&&x.date===d);html+=m?ovMatchCell(m,team,name,o.open):OV_EMPTY_TD;}
    html+='</tr>';
  }
  html+=`<tr class="ov-row free">
    <td class="ov-team">${ct('notInLineup')}</td>`;
  for(const d of dates){const dm=matches.filter(x=>x.date===d);html+=dm.length?ovFreeCell(dm,name):OV_EMPTY_TD;}
  return html+'</tr></tbody></table>'+ovMatchesLegend();
}
// "Spieler" mode: a row per player; per match day what he does in each of his teams
function ovTeamShort(t){return t?t.name.replace('Herren','H').replace('Damen','D').replace('Senioren','Sen').replace('Seniorinnen','SenF').trim():'?';}
// what the player does that day in each of his teams: in the lineup, Ersatz, or his answer
function ovPlayerDayCell(p,dayMatches){
  if(!dayMatches.length)return'<td class="ov-day-empty">—</td>';
  return'<td class="ov-day"><div class="ov-day-list">'+dayMatches.map(m=>{
    const team=teamById(m.teamId),sz=teamSize(team),slots=state.lineups[m.id]||[],avail=state.availability[m.id]?.[p.id]||'';
    const [st,icon]=slots.slice(0,sz).includes(p.id)?['lineup','✓']:slots[sz]===p.id?['ersatz','E']
      :avail==='yes'?['yes',ct('ovYes')]:avail==='conditional'?['conditional','('+ct('ovYes')+')']
      :avail==='notfall'?['notfall',ct('ovNotfall')]:avail==='no'?['no','✗']:['none','?'];
    return`<div class="ov-chip is-${st}">
            <span class="ov-chip-team">${esc(ovTeamShort(team))}</span>
            <span>${icon}</span>
          </div>`;}).join('')+'</div></td>';
}
function ovPlayersLegend(){
  const colors=['c-court','c-muted','c-yes','c-warn','c-danger','c-gold'];
  return`<div class="ov-plegend">
    ${ct('ovLegend').map((l,i)=>`<span class="${colors[i]}">■ ${l}</span>`).join('')}
  </div>`;
}
function ovPlayersHtml(teams){
  const matches=state.matches.filter(m=>teams.find(t=>t.id===m.teamId)).sort((a,b)=>a.date.localeCompare(b.date));
  if(!matches.length)return ovPlayersLegend()+`<div class="empty">${ct('noMatchesShort')}</div>`;
  const dates=[...new Set(matches.map(m=>m.date))].sort();
  const players=state.players.filter(p=>p.teamIds.some(tid=>teams.find(t=>t.id===tid))).sort((a,b)=>(a.rank||999)-(b.rank||999));
  let html=`<table class="ov-table players">
      <thead><tr class="ov-head">
        <th class="ov-th-first player">${ct('playerCol')}</th>
        <th class="th-small">LK</th>
        ${dates.map(d=>`<th class="ov-th">${fmtDate(d)}</th>`).join('')}
      </tr></thead><tbody>`;
  for(const p of players){
    const sm=teams.filter(t=>state.mainTeam[p.id]?.[t.id]).map(t=>t.name).join(', ');
    html+=`<tr>
        <td class="td-name">
          <span class="b">${esc(p.name)}</span>
          ${sm?`<span class="ov-sm">★ ${esc(sm)}</span>`:''}
        </td>
        <td class="td-lk"><span class="lk-badge sm">${esc(p.lkStr||'?')}</span></td>`;
    for(const d of dates)html+=ovPlayerDayCell(p,matches.filter(m=>m.date===d&&p.teamIds.includes(m.teamId)).sort((a,b)=>teamNumber(teamById(a.teamId)||{})-teamNumber(teamById(b.teamId)||{})));
    html+='</tr>';
  }
  return ovPlayersLegend()+html+'</tbody></table>';
}
// Overview team order: Herren → Damen → Jugend, then by team number ('number') or by age group first ('altersklasse')
function ovSortTeams(teams,mode){
  const ts=[...teams];
  if(mode==='altersklasse'){
    return ts.sort((a,b)=>{
      const ga=catGroup(a.category),gb=catGroup(b.category);
      if(ga!==gb)return ga-gb;
      if(a.category!==b.category)return catCmp(a.category,b.category)||a.category.localeCompare(b.category);
      return teamNumber(a)-teamNumber(b);
    });
  }
  return ts.sort((a,b)=>{
    const ga=catGroup(a.category),gb=catGroup(b.category);
    if(ga!==gb)return ga-gb;
    const na=teamNumber(a),nb=teamNumber(b);
    if(na!==nb)return na-nb;
    return a.category.localeCompare(b.category);
  });
}

// ── FILTER MENUS ── (admin + kapitaen) the small dropdowns above Overview and Statistiken: age groups, teams, order.
// one menu: a floating panel under its button, filled by o.build(panel) each time it opens; a click outside o.wrap closes it.
// o = {btn, wrap (element ids), width?, nowrap?, build(panel)}
function dropMenu(o){
  const m={el:null};
  m.panel=()=>{
    if(!m.el){m.el=document.createElement('div');m.el.className='fm-panel'+(o.nowrap?' nowrap':'');m.el.style.display='none';document.body.appendChild(m.el);}
    return m.el;
  };
  m.toggle=e=>{
    if(e)e.stopPropagation();
    const p=m.panel();
    if(p.style.display!=='none'){p.style.display='none';return;}
    o.build(p);
    const r=document.getElementById(o.btn).getBoundingClientRect();
    p.style.top=(r.bottom+4)+'px';
    p.style.left=r.left+'px';
    if(o.width)p.style.width=o.width;
    p.style.display='block';
  };
  m.drop=()=>{if(m.el){m.el.remove();m.el=null;}}; // the next open starts from scratch
  document.addEventListener('click',e=>{
    if(!m.el||m.el.style.display==='none')return;
    const wrap=document.getElementById(o.wrap);
    if(!m.el.contains(e.target)&&(!wrap||!wrap.contains(e.target)))m.el.style.display='none';
  });
  return m;
}
// one line of a menu: a checkbox (or radio) and its text. r = {type?, name?, checked, bold?, plain?, id?, data?: [key,value], change(input)}
function fmRow(panel,text,r){
  const lbl=document.createElement('label');
  lbl.className='fm-row'+(r.bold?' all':'')+(r.plain?' plain':'');
  const cb=document.createElement('input');
  cb.type=r.type||'checkbox';if(r.name)cb.name=r.name;
  cb.className='fm-check';
  cb.checked=r.checked;if(r.id)cb.id=r.id;if(r.data)cb.dataset[r.data[0]]=r.data[1];
  cb.addEventListener('change',()=>r.change(cb));
  const span=document.createElement('span');span.textContent=text;
  lbl.appendChild(cb);lbl.appendChild(span);panel.appendChild(lbl);
}
// "all" + one line per item. o = {items: [{id,label}], allLabel, allId, data (dataset key), plain?, selected: ()=>ids|null (null = all), set(ids|null), changed()}
function checkList(panel,o){
  const sel=o.selected(),all=!sel,attr=o.data.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
  panel.innerHTML='';
  fmRow(panel,o.allLabel,{checked:all,bold:true,id:o.allId,change:cb=>{o.set(cb.checked?null:[]);o.changed();}});
  const div=document.createElement('div');div.className='fm-sep';panel.appendChild(div);
  for(const it of o.items)fmRow(panel,it.label,{checked:all||!!(sel&&sel.includes(it.id)),plain:o.plain,data:[o.data,it.id],change:()=>{
    const checked=[...panel.querySelectorAll(`input[data-${attr}]:checked`)].map(i=>i.dataset[o.data]);
    o.set(checked.length===o.items.length?null:checked);
    const a=panel.querySelector('#'+o.allId);if(a)a.checked=!o.selected();
    o.changed();
  }});
}
// the "Altersklassen" menu. o = {cats, allId, selected, set, changed} as in checkList
function catMenuList(panel,o){
  checkList(panel,{items:o.cats.map(c=>({id:c,label:c})),allLabel:ct('fmAll'),data:'cat',plain:true,allId:o.allId,selected:o.selected,set:o.set,changed:o.changed});
}
// the "Mannschaften" menu. o = {teams (sorted), allId, selected, set, changed} as in checkList
function ovTeamsPanel(panel,o){
  if(!o.teams.length){panel.innerHTML='<div class="fm-empty">'+ct('noTeams')+'</div>';return;}
  checkList(panel,{items:o.teams.map(t=>({id:t.id,label:t.name})),allLabel:ct('allTeamsShort'),data:'teamId',allId:o.allId,selected:o.selected,set:o.set,changed:o.changed});
}
// an order menu: picking a line sets the button text, closes the menu and calls o.pick(key). o = {keys, name, current, labelId, pick(key)}
function sortList(panel,o){
  panel.innerHTML='';
  for(const key of o.keys)fmRow(panel,sortLabel(key),{type:'radio',name:o.name,checked:o.current===key,change:cb=>{
    if(!cb.checked)return;
    document.getElementById(o.labelId).textContent=sortLabel(key);
    panel.style.display='none';
    o.pick(key);
  }});
}
// button texts
function sortLabel(key){return ct({number:'sortNumber',altersklasse:'sortAK',date:'sortDate',team:'sortTeam'}[key]);}
function catFilterLabel(sel){return !sel?ct('fmAllCats'):!sel.length?ct('fmNoneCats'):sel.join(', ');}
function teamFilterLabel(sel){
  if(!sel)return ct('allTeamsShort');
  if(!sel.length)return ct('fmNoneTeams');
  if(sel.length===1){const t=teamById(sel[0]);return t?t.name:'?';}
  return `${sel.length} Teams`;
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
  const inner=skWarn?`<span class="nowrap"><span class="blk-pill stamm">${bT('stamm')}</span> <span class="blk-hint">⚠️</span></span>`
    :kind?`<span class="blk-pill ${kind}">${esc(label)}</span>`
    :`<span class="blk-dash${p.teamIds.includes(t.id)?'':' is-out'}">${p.teamIds.includes(t.id)?'—':'·'}</span>`;
  return`<td class="blk-td" title="${esc(title)}">${inner}</td>`;
}
function blockLegend(){
  return`<div class="blk-legend">
    <span class="blk-pill stamm">${bT('stamm')}</span>${bT('legStamm')}
    <span class="blk-pill block">⛔ …</span>${bT('legBlock')}
    <span class="blk-pill warn">⚠️ …</span>${bT('legWarn')}
    <span class="blk-pill played">${bT('played')('N')}</span>${bT('legPlayed')}
  </div>`;
}

// The whole Sperren view (rule boxes + one table per category). teams = the teams this page may show.
function blockingRuleBoxes(){
  return`<div class="blk-rules">
    <div class="rule-box"><strong>Stammkader:</strong> ${ct('ruleSK')}</div>
    <div class="rule-box warn"><strong>Stammmannschaft:</strong> ${ct('ruleSM')}</div>
  </div>`;
}
function blockingRow(p,cat,catTeams){
  const status=getPlayerBlockStatus(p.id,cat),skTeam=getStammkaderTeam(p.id,cat)||catTeams[catTeams.length-1];
  return`<tr class="blk-row${status.blocked.length>0?' is-blocked':''}">
        <td class="td-name"><div class="blk-name">${esc(p.name)}</div></td>
        <td class="td-lk"><span class="lk-badge sm">${esc(p.lkStr||'?')}</span></td>
        <td class="td-year">${esc(p.year||'—')}</td>
        ${catTeams.map(t=>blockCell(p,t,catTeams,status,skTeam)).join('')}
      </tr>`;
}
function blockingCategoryHtml(cat,catTeams){
  // sorted by the rank in THIS category's Meldung (p.rank is only the rank of the first list the player was imported from)
  const players=state.players.filter(p=>p.teamIds.some(tid=>catTeams.find(t=>t.id===tid))).sort((a,b)=>playerRankInTeam(a.id,catTeams[0].id)-playerRankInTeam(b.id,catTeams[0].id));
  if(!players.length)return'';
  return`<div class="blk-cat">${esc(cat)}</div>`+
    `<div class="card blk-card">`+
    `<table class="blk-table">
      <thead><tr class="blk-head">
        <th class="blk-th-player">${ct('playerCol')}</th>
        <th class="th-small">LK</th>
        <th class="th-small">${ct('colYear')}</th>
        ${catTeams.map(t=>`<th class="blk-th-team">${esc(t.name)}${t.is_4er?' <span class="blk-4er">(4er)</span>':''}</th>`).join('')}
      </tr></thead><tbody>`+players.map(p=>blockingRow(p,cat,catTeams)).join('')+`</tbody></table>
      ${blockLegend()}</div>`;
}
// fills #block-cat-filter and #blocking-content (same ids in admin and kapitaen)
function renderBlockingView(teams){
  const ferien=teams.some(t=>isFerienCat(t.category));
  teams=teams.filter(t=>!isFerienCat(t.category)); // Ferienrunde: no Sperren (yet)
  const cats=[...new Set(teams.map(t=>t.category))].sort();
  const catSel=document.getElementById('block-cat-filter');
  const curCat=catSel?.value||(cats.includes('Herren')?'Herren':'');
  if(catSel){catSel.innerHTML=`<option value="">${ct('allCategories')}</option>`+cats.map(c=>`<option value="${esc(c)}" ${curCat===c?'selected':''}>${esc(c)}</option>`).join('');catSel.value=curCat;}
  const filterCat=catSel?.value||'';
  let body='';
  for(const cat of filterCat?[filterCat]:cats){
    const catTeams=teams.filter(t=>t.category===cat).sort((a,b)=>teamNumber(a)-teamNumber(b));
    if(catTeams.length)body+=blockingCategoryHtml(cat,catTeams);
  }
  document.getElementById('blocking-content').innerHTML=(teams.length||!ferien?blockingRuleBoxes():'')+(body||(ferien?'':`<div class="empty">${ct('noBlockedShort')}</div>`))
    +(ferien?`<div class="empty">${ct('noSperrenFerien')}</div>`:'');
}
