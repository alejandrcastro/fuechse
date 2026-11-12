-- survey_new_people.sql — Umfrage: people who are not in the list give their full date of birth and nationality
-- (needed to register them). Run once in Supabase → SQL Editor. Safe to run again.
alter table public.survey_responses
  add column if not exists birth_date date,
  add column if not exists nationality text check (nationality ~ '^[A-Z]{3}$'); -- ISO 3166-1 alpha-3, e.g. DEU
