-- Grochu life — jednorazowa konfiguracja bazy dla nowych sekcji (Supabase → SQL Editor → New query → wklej → Run).
-- Nawyki, Dieta i Siłownia mają swoje tabele (user_data, makro_data, gym_data). Nowe sekcje (Wersety, Przepisy
-- i kolejne) dzielą jedną tabelę: jeden wiersz na użytkownika i sekcję, więc następne sekcje nie wymagają już SQL.
create table if not exists public.life_data (
  user_id uuid not null references auth.users (id) on delete cascade,
  section text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, section)
);
alter table public.life_data enable row level security;

drop policy if exists "life_data: własne wiersze" on public.life_data;
create policy "life_data: własne wiersze" on public.life_data
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- pełne stare wiersze w zdarzeniach (synchronizacja na żywo wie, której sekcji dotyczy zmiana)
alter table public.life_data replica identity full;

-- synchronizacja na żywo między urządzeniami
do $$ begin
  alter publication supabase_realtime add table public.life_data;
exception when duplicate_object then null; end $$;
