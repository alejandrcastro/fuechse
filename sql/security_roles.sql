-- ════════════════════════════════════════════════════════════════
-- security_roles.sql — S2: captains may only write their own teams
-- Run AFTER security.sql. Undo: security_roles_rollback.sql
--
-- Same rule as kapitaen.html canEditTeam():
--   • superusers (fcb_is_admin)  → everything
--   • a team login (e.g. "herrenii" = team "Herren II") → only that team:
--       lineups, matches (count, verlegen), player_match_counts, availability
--   • players, teams, player_teams, survey answers → only admins
--   • club account (spieler) → unchanged: availability + survey answers
-- ════════════════════════════════════════════════════════════════

-- login name of the current user ("herrenii"), or '' for anything else
create or replace function public.fcb_username() returns text
language sql stable as $$
  select case when lower(coalesce(auth.jwt()->>'email','')) like '%@login.fuechse-berlin-reinickendorf.de'
              then split_part(lower(auth.jwt()->>'email'),'@',1) else '' end
$$;

-- may the current user edit this team? (admins: all, team login: its own team)
create or replace function public.fcb_can_team(tid text) returns boolean
language sql stable as $$
  select public.fcb_is_admin()
      or exists (select 1 from public.teams t
                 where t.id = tid
                   and lower(regexp_replace(t.name, '\s+', '', 'g')) = public.fcb_username()
                   and public.fcb_username() <> '')
$$;

-- may the current user edit this match? (= may edit the match's team)
create or replace function public.fcb_can_match(mid text) returns boolean
language sql stable as $$
  select public.fcb_is_admin()
      or exists (select 1 from public.matches m where m.id = mid and public.fcb_can_team(m.team_id))
$$;

-- replace the blanket staff policy from security.sql
do $$
declare t text;
begin
  foreach t in array array['players','teams','matches','player_teams','availability',
                           'lineups','player_match_counts','survey_responses']
  loop
    execute format('drop policy if exists fcb_staff_write on public.%I', t);
    execute format('drop policy if exists fcb_admin_write on public.%I', t);
    execute format('drop policy if exists fcb_team_write on public.%I', t);
    execute format('drop policy if exists fcb_team_insert on public.%I', t);
    execute format('drop policy if exists fcb_team_update on public.%I', t);
  end loop;
end $$;

-- admins: full write everywhere
do $$
declare t text;
begin
  foreach t in array array['players','teams','matches','player_teams','availability',
                           'lineups','player_match_counts','survey_responses']
  loop
    execute format('create policy fcb_admin_write on public.%I for all to authenticated
                    using (public.fcb_is_admin()) with check (public.fcb_is_admin())', t);
  end loop;
end $$;

-- team logins: their own team only
create policy fcb_team_write  on public.lineups             for all    to authenticated using (public.fcb_can_match(match_id)) with check (public.fcb_can_match(match_id));
create policy fcb_team_write  on public.availability        for all    to authenticated using (public.fcb_can_match(match_id)) with check (public.fcb_can_match(match_id));
create policy fcb_team_write  on public.player_match_counts for all    to authenticated using (public.fcb_can_team(team_id))   with check (public.fcb_can_team(team_id));
create policy fcb_team_insert on public.matches             for insert to authenticated with check (public.fcb_can_team(team_id));
create policy fcb_team_update on public.matches             for update to authenticated using (public.fcb_can_team(team_id)) with check (public.fcb_can_team(team_id));
