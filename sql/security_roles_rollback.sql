-- ════════════════════════════════════════════════════════════════
-- security_roles_rollback.sql — back to security.sql (every captain may write everything)
-- ════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['players','teams','matches','player_teams','availability',
                           'lineups','player_match_counts','survey_responses']
  loop
    execute format('drop policy if exists fcb_admin_write on public.%I', t);
    execute format('drop policy if exists fcb_team_write on public.%I', t);
    execute format('drop policy if exists fcb_team_insert on public.%I', t);
    execute format('drop policy if exists fcb_team_update on public.%I', t);
    execute format('drop policy if exists fcb_staff_write on public.%I', t);
    execute format('create policy fcb_staff_write on public.%I for all to authenticated
                    using (not public.fcb_is_club()) with check (not public.fcb_is_club())', t);
  end loop;
end $$;
