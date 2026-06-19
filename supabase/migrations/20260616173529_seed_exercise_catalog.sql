-- F-01: Seed exercise catalog
--
-- Establishes the project's first domain schema: a read-only, shared exercise
-- catalog organised by muscle group. Seeded here (not in seed.sql) so the data
-- ships to production via `supabase db push` / CI, not just local `db reset`.
--
-- Access posture: shared reference data. RLS is enabled on both tables with a
-- single SELECT policy granting read access to authenticated users. No write
-- policies exist, so the catalog is immutable from clients (anon/authenticated
-- keys cannot insert/update/delete). Every later table will instead be
-- private-per-user; this is the only shared-readable table.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table muscle_groups (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null
);

comment on table muscle_groups is 'Read-only lookup of muscle groups. slug is the stable machine key; name is the Polish display label.';

create table exercises (
  id bigint generated always as identity primary key,
  muscle_group_id bigint not null references muscle_groups (id),
  name text not null,
  unique (muscle_group_id, name)
);

comment on table exercises is 'Read-only built-in exercise catalog. Each exercise belongs to exactly one muscle group.';

create index exercises_muscle_group_id_idx on exercises (muscle_group_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: read-only for authenticated users, no client writes
-- ---------------------------------------------------------------------------

alter table muscle_groups enable row level security;
alter table exercises enable row level security;

create policy "Authenticated users can read muscle groups"
  on muscle_groups
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read exercises"
  on exercises
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Seed: 6 muscle groups (minimal taxonomy covering the hobbyist-lifter persona)
-- ---------------------------------------------------------------------------

insert into muscle_groups (slug, name) values
  ('chest',     'Klatka piersiowa'),
  ('back',      'Plecy'),
  ('legs',      'Nogi'),
  ('shoulders', 'Barki'),
  ('arms',      'Ramiona'),
  ('core',      'Brzuch');

-- ---------------------------------------------------------------------------
-- Seed: exercises. Groups are referenced by slug (no hardcoded ids).
-- ---------------------------------------------------------------------------

insert into exercises (muscle_group_id, name)
select g.id, e.name
from (values
  ('chest',     'Wyciskanie sztangi na ławce płaskiej'),
  ('chest',     'Wyciskanie hantli na ławce skośnej'),
  ('chest',     'Rozpiętki z hantlami'),
  ('chest',     'Pompki'),

  ('back',      'Martwy ciąg'),
  ('back',      'Podciąganie na drążku'),
  ('back',      'Wiosłowanie sztangą'),
  ('back',      'Ściąganie drążka wyciągu górnego'),

  ('legs',      'Przysiad ze sztangą'),
  ('legs',      'Wykroki z hantlami'),
  ('legs',      'Wyciskanie nogami na suwnicy'),
  ('legs',      'Uginanie nóg leżąc'),

  ('shoulders', 'Wyciskanie żołnierskie'),
  ('shoulders', 'Wznosy bokiem z hantlami'),
  ('shoulders', 'Wznosy w opadzie tułowia'),

  ('arms',      'Uginanie ramion ze sztangą'),
  ('arms',      'Uginanie hantli z supinacją'),
  ('arms',      'Wyciskanie francuskie'),
  ('arms',      'Prostowanie ramion na wyciągu'),

  ('core',      'Plank (deska)'),
  ('core',      'Unoszenie nóg w zwisie'),
  ('core',      'Spięcia brzucha')
) as e(group_slug, name)
join muscle_groups g on g.slug = e.group_slug;
