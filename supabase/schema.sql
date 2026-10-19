-- =====================================================================
-- Afterclass database
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to run again after updates (it replaces functions and policies).
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- TABLES
-- =====================================================================

-- Schools let several teachers share one logo/heading, and let a Head of
-- Department (HOD) or admin review questions before exams are printed.
create table if not exists public.schools (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  address          text not null default '',
  motto            text not null default '',
  contact          text not null default '',
  logo             text check (logo is null or length(logo) < 600000),
  kind             text not null default 'secondary' check (kind in ('primary', 'secondary', 'university', 'training')),
  require_approval boolean not null default false,
  retention_days   int not null default 365 check (retention_days between 30 and 3650),
  join_code        text not null unique default upper(substr(md5(random()::text), 1, 8)),
  created_by       uuid default auth.uid() references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create table if not exists public.school_members (
  school_id    uuid not null references public.schools(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role         text not null default 'teacher' check (role in ('admin', 'hod', 'teacher')),
  department   text not null default '',
  display_name text not null default '',
  email        text not null default '',
  joined_at    timestamptz not null default now(),
  primary key (school_id, user_id)
);
create unique index if not exists school_members_one_school on public.school_members (user_id);

-- Details for teachers who are not part of a school account.
create table if not exists public.school_profiles (
  owner_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name       text not null default '',
  address    text not null default '',
  motto      text not null default '',
  contact    text not null default '',
  logo       text check (logo is null or length(logo) < 600000),
  updated_at timestamptz not null default now()
);
alter table public.school_profiles add column if not exists kind text not null default 'secondary';
alter table public.school_profiles add column if not exists retention_days int not null default 365;

create table if not exists public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default 'Untitled quiz',
  source_name text,
  questions   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.quizzes add column if not exists exam jsonb;
alter table public.quizzes add column if not exists school_id uuid references public.schools(id) on delete set null;
alter table public.quizzes add column if not exists department text not null default '';
alter table public.quizzes add column if not exists review_status text not null default 'draft';
alter table public.quizzes add column if not exists review_note text not null default '';
alter table public.quizzes add column if not exists reviewed_by text not null default '';
alter table public.quizzes add column if not exists reviewed_at timestamptz;
do $$ begin
  alter table public.quizzes add constraint quizzes_review_status_chk check (review_status in ('draft', 'submitted', 'approved', 'changes'));
exception when duplicate_object then null; end $$;

-- Class lists (rosters): admission / matric numbers for graded work.
create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.students (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_no text not null,
  full_name  text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists students_no_idx on public.students (class_id, lower(student_no));

-- A "session" is one run of a quiz: a live game or a self-paced assignment.
-- Questions are copied in, so editing the quiz later never changes it.
create table if not exists public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quiz_id             uuid references public.quizzes(id) on delete set null,
  kind                text not null check (kind in ('live', 'assignment')),
  pin                 text not null,
  title               text not null,
  questions           jsonb not null,
  time_limit          int not null default 20,
  show_answers        boolean not null default true,   -- kept for older rows; see answer_reveal
  status              text not null default 'lobby',
  current_index       int not null default -1,
  question_started_at timestamptz,
  closes_at           timestamptz,
  created_at          timestamptz not null default now(),
  ended_at            timestamptz
);
alter table public.sessions add column if not exists answer_reveal text not null default 'close';
alter table public.sessions add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.sessions add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.sessions add column if not exists locked boolean not null default false;
do $$ begin
  alter table public.sessions add constraint sessions_answer_reveal_chk check (answer_reveal in ('submit', 'close', 'never'));
exception when duplicate_object then null; end $$;
create index if not exists sessions_pin_idx on public.sessions (pin);
create index if not exists sessions_owner_idx on public.sessions (owner_id, created_at desc);
create index if not exists sessions_quiz_idx on public.sessions (quiz_id);

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  nickname    text not null,
  token       uuid not null default gen_random_uuid(),
  score       int not null default 0,
  correct     int not null default 0,
  streak      int not null default 0,
  finished_at timestamptz,
  joined_at   timestamptz not null default now()
);
alter table public.players add column if not exists student_id uuid references public.students(id) on delete set null;
alter table public.players add column if not exists email text;
alter table public.players add column if not exists started_at timestamptz;
alter table public.players add column if not exists flags jsonb not null default '{}'::jsonb;
create unique index if not exists players_nick_idx on public.players (session_id, lower(nickname));
create unique index if not exists players_student_idx on public.players (session_id, student_id) where student_id is not null;

create table if not exists public.answers (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  q_index     int not null,
  choice      int,
  text_answer text,
  is_correct  boolean not null default false,
  credit      numeric not null default 0,
  points      int not null default 0,
  ms          int,
  created_at  timestamptz not null default now(),
  unique (player_id, q_index)
);
alter table public.answers add column if not exists reviewed boolean not null default true;
create index if not exists answers_session_idx on public.answers (session_id, q_index);

-- Audience questions (Q&A) for live sessions and webinars.
create table if not exists public.audience_questions (
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id  uuid references public.players(id) on delete set null,
  body       text not null check (length(body) between 1 and 300),
  votes      int not null default 0,
  answered   boolean not null default false,
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists aq_session_idx on public.audience_questions (session_id);
create table if not exists public.audience_votes (
  question_id bigint not null references public.audience_questions(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  primary key (question_id, player_id)
);

-- Failed PIN attempts, to slow down anyone guessing PINs.
create table if not exists public.join_attempts (
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists join_attempts_idx on public.join_attempts (ip, at);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists quizzes_touch on public.quizzes;
create trigger quizzes_touch before update on public.quizzes for each row execute function public.touch_updated_at();

-- =====================================================================
-- WHO IS ASKING (helpers used by the security rules)
-- =====================================================================
create or replace function public.my_school() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from school_members where user_id = auth.uid() $$;
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from school_members where user_id = auth.uid() $$;
create or replace function public.my_department() returns text
language sql stable security definer set search_path = public as $$
  select department from school_members where user_id = auth.uid() $$;

-- Can the current teacher read (review) this quiz?
create or replace function public.can_review(p_school uuid, p_department text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_school is not null and exists (
    select 1 from school_members m
     where m.user_id = auth.uid() and m.school_id = p_school
       and (m.role = 'admin' or (m.role = 'hod' and lower(m.department) = lower(coalesce(p_department, '')))))
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- Teachers see their own data; HODs/admins can read quizzes they review.
-- Students never read tables directly; they use the functions further down,
-- which hide correct answers.
-- =====================================================================
alter table public.schools            enable row level security;
alter table public.school_members     enable row level security;
alter table public.school_profiles    enable row level security;
alter table public.quizzes            enable row level security;
alter table public.classes            enable row level security;
alter table public.students           enable row level security;
alter table public.sessions           enable row level security;
alter table public.players            enable row level security;
alter table public.answers            enable row level security;
alter table public.audience_questions enable row level security;
alter table public.audience_votes     enable row level security;
alter table public.join_attempts      enable row level security;

drop policy if exists "members read school" on public.schools;
create policy "members read school" on public.schools for select using (id = public.my_school());
drop policy if exists "admin edits school" on public.schools;
create policy "admin edits school" on public.schools for update
  using (id = public.my_school() and public.my_role() = 'admin') with check (id = public.my_school());

drop policy if exists "members read members" on public.school_members;
create policy "members read members" on public.school_members for select using (school_id = public.my_school());
drop policy if exists "leave or remove members" on public.school_members;
create policy "leave or remove members" on public.school_members for delete
  using (user_id = auth.uid() or (school_id = public.my_school() and public.my_role() = 'admin'));

drop policy if exists "teacher owns school profile" on public.school_profiles;
create policy "teacher owns school profile" on public.school_profiles for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "teacher owns quizzes" on public.quizzes;
drop policy if exists "read own or reviewable quizzes" on public.quizzes;
create policy "read own or reviewable quizzes" on public.quizzes for select
  using (owner_id = auth.uid() or (review_status <> 'draft' and public.can_review(school_id, department)));
drop policy if exists "insert own quizzes" on public.quizzes;
create policy "insert own quizzes" on public.quizzes for insert with check (owner_id = auth.uid());
drop policy if exists "update own quizzes" on public.quizzes;
create policy "update own quizzes" on public.quizzes for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "delete own quizzes" on public.quizzes;
create policy "delete own quizzes" on public.quizzes for delete using (owner_id = auth.uid());

drop policy if exists "teacher owns classes" on public.classes;
create policy "teacher owns classes" on public.classes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "teacher owns students" on public.students;
create policy "teacher owns students" on public.students for all
  using (exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()));

drop policy if exists "teacher owns sessions" on public.sessions;
create policy "teacher owns sessions" on public.sessions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "teacher reads players" on public.players;
create policy "teacher reads players" on public.players for select
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid()));
drop policy if exists "teacher removes players" on public.players;
create policy "teacher removes players" on public.players for delete
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid()));

drop policy if exists "teacher reads answers" on public.answers;
create policy "teacher reads answers" on public.answers for select
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid()));

drop policy if exists "teacher manages audience questions" on public.audience_questions;
create policy "teacher manages audience questions" on public.audience_questions for all
  using (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid()));

-- =====================================================================
-- QUESTION HELPERS
-- Question JSON: {type: mcq|tf|short|poll|word, question, options, answer,
--   explanation, keyPoints, marks, compulsory, image, source}
-- =====================================================================

-- A question as students may see it.
create or replace function public._public_q(q jsonb) returns jsonb
language sql immutable as $$ select q - 'answer' - 'explanation' - 'keyPoints' - 'source' $$;

-- How much a question counts towards an assignment mark.
create or replace function public._q_weight(q jsonb) returns numeric
language sql immutable as $$
  select case when q ->> 'type' in ('poll', 'word') then 0
              else greatest(0, coalesce(nullif(q ->> 'marks', '')::numeric, 1)) end $$;

create or replace function public._kw_score(pts text[], ans text, ratio numeric)
returns numeric language plpgsql immutable as $$
declare
  words text[]; pt text; w text;
  hits numeric := 0; total int := 0; found int; need int;
  stop text[] := array['that','this','with','from','have','they','their','there','which','what','when',
    'where','because','into','than','then','them','were','been','also','only','such','some','more','most',
    'very','will','would','could','should','does','each','other','about','these','those','being','while'];
begin
  foreach pt in array pts loop
    select coalesce(array_agg(distinct (r.m)[1]), '{}') into words
      from regexp_matches(lower(pt), '([a-z0-9]{4,})', 'g') as r(m);
    words := array(select unnest(words) except select unnest(stop));
    if coalesce(array_length(words, 1), 0) = 0 then continue; end if;
    total := total + 1;
    found := 0;
    foreach w in array words loop
      if position(left(w, greatest(4, length(w) - 2)) in ans) > 0 then found := found + 1; end if;
    end loop;
    need := greatest(1, ceil(array_length(words, 1) * ratio)::int);
    if found >= need then hits := hits + 1;
    elsif found > 0 then hits := hits + (found::numeric / need) * 0.5; end if;
  end loop;
  if total = 0 then return 0; end if;
  return least(1, hits / total);
end $$;

-- Provisional mark for a written answer (teachers confirm it in the report).
-- Matches key points or the model answer, whichever is better. A bare list of
-- keywords much shorter than the model answer is capped at half marks.
create or replace function public.grade_short(p_model text, p_points jsonb, p_answer text)
returns numeric language plpgsql immutable as $$
declare
  ans text := lower(coalesce(p_answer, '')); pts text[]; a numeric := 0; b numeric := 0; c numeric;
  ans_words int; model_words int;
begin
  if length(trim(ans)) = 0 then return 0; end if;
  select coalesce(array_agg(x), '{}') into pts
    from jsonb_array_elements_text(coalesce(p_points, '[]'::jsonb)) as x where length(trim(x)) > 0;
  if coalesce(array_length(pts, 1), 0) > 0 then a := public._kw_score(pts, ans, 0.5); end if;
  if length(trim(coalesce(p_model, ''))) > 0 then b := public._kw_score(array[p_model], ans, 0.4); end if;
  c := least(1, greatest(a, b));
  select count(*) into ans_words from regexp_matches(ans, '[a-z0-9]+', 'g');
  select count(*) into model_words from regexp_matches(lower(coalesce(p_model, '')), '[a-z0-9]+', 'g');
  if model_words >= 8 and ans_words < model_words * 0.3 then c := least(c, 0.5); end if;
  return round(c, 2);
end $$;

-- Rejects rude or misleading nicknames before they reach the projector.
create or replace function public.name_ok(p text) returns boolean
language plpgsql immutable as $$
declare
  n text := lower(coalesce(p, ''));
  squashed text;
  -- matched anywhere, even with l33t spelling ("f*ck", "sh1t")
  strong text[] := array['fuck','fuk','fck','phuck','shit','cunt','bitch','pussy','porn','whore','slut','nigga','nigger',
    'penis','vagina','boob','ashawo','oloshi','bastard','asshole'];
  w text;
begin
  squashed := translate(n, '01345@$!|', 'oieasasil');
  squashed := regexp_replace(squashed, '[^a-z]', '', 'g');
  foreach w in array strong loop
    if position(w in squashed) > 0 then return false; end if;
  end loop;
  -- matched as whole words only, so real names like "Dickson" or "Mumuni" still work
  if translate(n, '01345@$', 'oieasas') ~ '(^|[^a-z])(ass|ode|idiot|stupid|fool|mumu|olodo|werey|dick|rape|sex|sexy|teacher|admin|host|moderator|lecturer)([^a-z]|$)' then
    return false;
  end if;
  return true;
end $$;

create or replace function public._client_ip() returns text
language sql stable as $$
  select coalesce(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1), '') $$;

create or replace function public._too_many_attempts() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from join_attempts where at < now() - interval '1 hour';
  return (select count(*) from join_attempts where ip = public._client_ip() and at > now() - interval '10 minutes') >= 30;
end $$;

-- Recomputes an assignment player's weighted mark from their answers.
create or replace function public._assignment_score(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s sessions; got numeric := 0; tot numeric := 0; i int; q jsonb; a answers;
begin
  select se.* into s from sessions se join players p on p.session_id = se.id where p.id = p_player;
  for i in 0 .. jsonb_array_length(s.questions) - 1 loop
    q := s.questions -> i;
    tot := tot + public._q_weight(q);
    select * into a from answers where player_id = p_player and q_index = i;
    if a.id is not null then got := got + a.credit * public._q_weight(q); end if;
  end loop;
  update players set
    score = case when tot > 0 then round(1000 * got / tot) else 0 end,
    correct = (select count(*) from answers where player_id = p_player and is_correct)
  where id = p_player;
end $$;

-- =====================================================================
-- SCHOOL ACCOUNTS
-- =====================================================================
create or replace function public.create_school(p_name text, p_kind text default 'secondary', p_display_name text default '')
returns public.schools language plpgsql security definer set search_path = public as $$
declare sc schools; pr school_profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from school_members where user_id = auth.uid()) then raise exception 'You are already in a school account. Leave it first.'; end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Enter the school name.'; end if;
  select * into pr from school_profiles where owner_id = auth.uid();
  insert into schools (name, kind, address, motto, contact, logo)
  values (trim(p_name), coalesce(nullif(p_kind, ''), 'secondary'), coalesce(pr.address, ''), coalesce(pr.motto, ''), coalesce(pr.contact, ''), pr.logo)
  returning * into sc;
  insert into school_members (school_id, user_id, role, display_name, email)
  values (sc.id, auth.uid(), 'admin', coalesce(p_display_name, ''), coalesce((select email from auth.users where id = auth.uid()), ''));
  update quizzes set school_id = sc.id where owner_id = auth.uid();
  return sc;
end $$;

create or replace function public.join_school(p_code text, p_display_name text, p_department text default '')
returns public.schools language plpgsql security definer set search_path = public as $$
declare sc schools;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from school_members where user_id = auth.uid()) then raise exception 'You are already in a school account. Leave it first.'; end if;
  select * into sc from schools where join_code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'That school code is not correct. Ask your school admin for it.'; end if;
  insert into school_members (school_id, user_id, role, department, display_name, email)
  values (sc.id, auth.uid(), 'teacher', trim(coalesce(p_department, '')), trim(coalesce(p_display_name, '')),
          coalesce((select email from auth.users where id = auth.uid()), ''));
  update quizzes set school_id = sc.id where owner_id = auth.uid();
  return sc;
end $$;

create or replace function public.set_member(p_user uuid, p_role text, p_department text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Only the school admin can change roles.'; end if;
  if p_role not in ('admin', 'hod', 'teacher') then raise exception 'Unknown role.'; end if;
  if p_user = auth.uid() and p_role <> 'admin' and (select count(*) from school_members where school_id = public.my_school() and role = 'admin') = 1 then
    raise exception 'The school needs at least one admin.';
  end if;
  update school_members set role = p_role, department = trim(coalesce(p_department, ''))
   where school_id = public.my_school() and user_id = p_user;
  update quizzes set department = trim(coalesce(p_department, '')) where owner_id = p_user and school_id = public.my_school() and department = '';
end $$;

create or replace function public.new_join_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(md5(random()::text), 1, 8));
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Only the school admin can do this.'; end if;
  update schools set join_code = c where id = public.my_school();
  return c;
end $$;

create or replace function public.leave_school() returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() = 'admin' and (select count(*) from school_members where school_id = public.my_school() and role = 'admin') = 1
     and (select count(*) from school_members where school_id = public.my_school()) > 1 then
    raise exception 'Make another teacher an admin before you leave.';
  end if;
  update quizzes set school_id = null where owner_id = auth.uid();
  delete from school_members where user_id = auth.uid();
end $$;

-- Teacher sends a quiz to their HOD; HOD/admin approves or asks for changes.
create or replace function public.submit_for_review(p_quiz uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_school() is null then raise exception 'Join a school account to use reviews.'; end if;
  update quizzes set review_status = 'submitted', review_note = '', school_id = public.my_school(),
         department = coalesce(nullif(department, ''), public.my_department(), '')
   where id = p_quiz and owner_id = auth.uid();
  if not found then raise exception 'Quiz not found.'; end if;
end $$;

create or replace function public.review_quiz(p_quiz uuid, p_decision text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare qz quizzes;
begin
  select * into qz from quizzes where id = p_quiz;
  if not found or not public.can_review(qz.school_id, qz.department) then raise exception 'You cannot review this quiz.'; end if;
  if p_decision not in ('approved', 'changes') then raise exception 'Unknown decision.'; end if;
  update quizzes set review_status = p_decision, review_note = left(coalesce(p_note, ''), 2000),
         reviewed_by = coalesce((select nullif(display_name, '') from school_members where user_id = auth.uid()), 'HOD'),
         reviewed_at = now()
   where id = p_quiz;
end $$;

-- Editing an approved quiz sends it back to draft so changes get reviewed.
create or replace function public.quiz_edit_resets_review() returns trigger language plpgsql as $$
begin
  if new.questions is distinct from old.questions and old.review_status in ('approved', 'submitted')
     and new.review_status = old.review_status then
    new.review_status := 'draft';
  end if;
  return new;
end $$;
drop trigger if exists quizzes_review_reset on public.quizzes;
create trigger quizzes_review_reset before update on public.quizzes for each row execute function public.quiz_edit_resets_review();

-- =====================================================================
-- TEACHER FUNCTIONS
-- =====================================================================
drop function if exists public.create_session(uuid, text, int, boolean, timestamptz);
create or replace function public.create_session(
  p_quiz uuid, p_kind text, p_time_limit int default 20, p_reveal text default 'close',
  p_closes_at timestamptz default null, p_class uuid default null, p_settings jsonb default '{}'::jsonb)
returns public.sessions language plpgsql security definer set search_path = public as $$
declare qz quizzes; s sessions; new_pin text; tries int := 0;
begin
  select * into qz from quizzes where id = p_quiz and owner_id = auth.uid();
  if not found then raise exception 'Quiz not found.'; end if;
  if jsonb_array_length(qz.questions) = 0 then raise exception 'This quiz has no questions yet.'; end if;
  if p_kind not in ('live', 'assignment') then raise exception 'Unknown session type.'; end if;
  if p_reveal not in ('submit', 'close', 'never') then raise exception 'Unknown answer setting.'; end if;
  if p_class is not null and not exists (select 1 from classes where id = p_class and owner_id = auth.uid()) then
    raise exception 'Class not found.';
  end if;
  loop
    new_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from sessions where pin = new_pin and status not in ('ended', 'closed'));
    tries := tries + 1;
    if tries > 50 then raise exception 'Could not create a PIN. Try again.'; end if;
  end loop;
  insert into sessions (owner_id, quiz_id, kind, pin, title, questions, time_limit, answer_reveal, show_answers,
                        status, closes_at, class_id, settings)
  values (auth.uid(), qz.id, p_kind, new_pin, qz.title, qz.questions,
          greatest(0, least(coalesce(p_time_limit, 20), 300)), p_reveal, p_reveal = 'submit',
          case when p_kind = 'live' then 'lobby' else 'open' end, p_closes_at, p_class, coalesce(p_settings, '{}'::jsonb))
  returning * into s;
  return s;
end $$;

create or replace function public.host_set_state(p_session uuid, p_status text, p_index int default null)
returns public.sessions language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = p_session and owner_id = auth.uid() for update;
  if not found then raise exception 'Session not found.'; end if;
  if p_status not in ('lobby', 'question', 'reveal', 'leaderboard', 'ended', 'open', 'closed') then
    raise exception 'Unknown status.';
  end if;
  if p_status = 'reveal' and coalesce(s.questions -> s.current_index ->> 'type', '') not in ('poll', 'word') then
    update players pl set streak = 0
     where pl.session_id = s.id
       and not exists (select 1 from answers a where a.player_id = pl.id and a.q_index = s.current_index);
  end if;
  update sessions set
    status = p_status,
    current_index = coalesce(p_index, current_index),
    question_started_at = case when p_status = 'question' then now() else question_started_at end,
    ended_at = case when p_status in ('ended', 'closed') then now() when p_status in ('open', 'lobby') then null else ended_at end
  where id = s.id
  returning * into s;
  return s;
end $$;

create or replace function public.host_set_lock(p_session uuid, p_locked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update sessions set locked = coalesce(p_locked, false) where id = p_session and owner_id = auth.uid();
  if not found then raise exception 'Session not found.'; end if;
end $$;

-- Counts for the host screen. One call instead of reading every answer, so
-- big audiences (webinars) stay fast.
create or replace function public.host_counts(p_session uuid) returns json
language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = p_session and owner_id = auth.uid();
  if not found then raise exception 'Session not found.'; end if;
  return json_build_object(
    'players', (select count(*) from players where session_id = s.id),
    'answered', (select count(*) from answers where session_id = s.id and q_index = s.current_index),
    'questions', (select count(*) from audience_questions where session_id = s.id and not answered and not hidden));
end $$;

-- What the host shows when a question is revealed. Written answers come back
-- without names so nobody is embarrassed on the projector.
create or replace function public.host_reveal_data(p_session uuid, p_index int) returns json
language plpgsql security definer set search_path = public as $$
declare s sessions; q jsonb;
begin
  select * into s from sessions where id = p_session and owner_id = auth.uid();
  if not found then raise exception 'Session not found.'; end if;
  q := s.questions -> p_index;
  return json_build_object(
    'total', (select count(*) from answers where session_id = s.id and q_index = p_index),
    'correct', (select count(*) from answers where session_id = s.id and q_index = p_index and is_correct),
    'dist', (select coalesce(json_agg(c order by k), '[]'::json) from (
               select k, (select count(*) from answers where session_id = s.id and q_index = p_index and choice = k) as c
                 from generate_series(0, greatest(coalesce(jsonb_array_length(q -> 'options'), 0) - 1, 0)) as k) d),
    'texts', (select coalesce(json_agg(json_build_object('text', text_answer, 'ok', is_correct)), '[]'::json) from (
               select text_answer, is_correct from answers
                where session_id = s.id and q_index = p_index and coalesce(text_answer, '') <> ''
                order by random() limit 300) t));
end $$;

-- Teacher confirms or changes the mark on one written answer.
create or replace function public.set_answer_credit(p_answer bigint, p_credit numeric)
returns void language plpgsql security definer set search_path = public as $$
declare a answers; s sessions; c numeric := greatest(0, least(1, p_credit));
begin
  select * into a from answers where id = p_answer;
  if not found then raise exception 'Answer not found.'; end if;
  select * into s from sessions where id = a.session_id and owner_id = auth.uid();
  if not found then raise exception 'Answer not found.'; end if;
  update answers set credit = c, is_correct = c >= 0.5, reviewed = true where id = a.id;
  if s.kind = 'assignment' then perform public._assignment_score(a.player_id); end if;
end $$;

-- Accept all automatic marks for one question (or the whole session when p_index is null).
create or replace function public.accept_marks(p_session uuid, p_index int default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from sessions where id = p_session and owner_id = auth.uid()) then raise exception 'Session not found.'; end if;
  update answers set reviewed = true where session_id = p_session and not reviewed and (p_index is null or q_index = p_index);
  get diagnostics n = row_count;
  return n;
end $$;

-- Deletes the teacher's own results older than p_days (data protection).
create or replace function public.purge_old_sessions(p_days int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from sessions where owner_id = auth.uid() and created_at < now() - make_interval(days => greatest(30, p_days));
  get diagnostics n = row_count;
  return n;
end $$;

-- Deletes everything the teacher created (account data request).
create or replace function public.delete_my_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.leave_school();
  delete from sessions where owner_id = auth.uid();
  delete from quizzes where owner_id = auth.uid();
  delete from classes where owner_id = auth.uid();
  delete from school_profiles where owner_id = auth.uid();
end $$;

-- Keeps a free Supabase project awake (called by the GitHub keep-alive job).
create or replace function public.ping() returns timestamptz language sql stable as $$ select now() $$;

-- =====================================================================
-- STUDENT FUNCTIONS (no login needed)
-- =====================================================================
drop function if exists public.join_session(text, text);
create or replace function public.join_session(p_pin text, p_nickname text, p_student_no text default null, p_email text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  s sessions; p players; st students;
  nick text := left(regexp_replace(trim(coalesce(p_nickname, '')), '\s+', ' ', 'g'), 24);
  em text := lower(trim(coalesce(p_email, '')));
begin
  if public._too_many_attempts() then raise exception 'Too many tries. Wait a few minutes and try again.'; end if;
  select * into s from sessions
   where pin = regexp_replace(coalesce(p_pin, ''), '\D', '', 'g') and status not in ('ended', 'closed')
   order by created_at desc limit 1;
  if not found then
    -- A closed class-list test: students who took it may come back to see corrections.
    select * into s from sessions
     where pin = regexp_replace(coalesce(p_pin, ''), '\D', '', 'g') and kind = 'assignment' and class_id is not null
       and status = 'closed' and created_at > now() - interval '120 days'
     order by created_at desc limit 1;
  end if;
  if not found then
    insert into join_attempts (ip) values (public._client_ip());
    raise exception 'No open game with that PIN. Check the number on the screen.';
  end if;
  if s.class_id is null and s.kind = 'assignment' and s.closes_at is not null and s.closes_at < now() then raise exception 'This assignment has closed.'; end if;

  -- Class list: identify by admission / matric number and a name on the list.
  if s.class_id is not null then
    if length(trim(coalesce(p_student_no, ''))) = 0 then raise exception 'STUDENT_NO_REQUIRED'; end if;
    select * into st from students where class_id = s.class_id
       and lower(regexp_replace(student_no, '\s', '', 'g')) = lower(regexp_replace(p_student_no, '\s', '', 'g'));
    if not found then
      insert into join_attempts (ip) values (public._client_ip());
      raise exception 'That number is not on the class list for this test. Check it, or ask your teacher.';
    end if;
    if not exists (select 1 from regexp_split_to_table(lower(st.full_name), '[^a-z]+') w
                    where length(w) >= 2 and w = any (regexp_split_to_array(lower(nick), '[^a-z]+'))) then
      insert into join_attempts (ip) values (public._client_ip());
      raise exception 'The name does not match the class list. Type your surname or first name as your teacher has it.';
    end if;
    select * into p from players where session_id = s.id and student_id = st.id;
    if found then
      -- Same student again (new phone, or coming back for corrections): reopen the same
      -- attempt. A finished attempt can only be viewed; submit_assignment refuses a second one.
      return json_build_object('player_id', p.id, 'token', p.token, 'session_id', s.id, 'kind', s.kind,
                               'title', s.title, 'nickname', p.nickname, 'resumed', true, 'finished', p.finished_at is not null);
    end if;
    if s.status = 'closed' or (s.kind = 'assignment' and s.closes_at is not null and s.closes_at < now()) then
      raise exception 'This assignment has closed.';
    end if;
    if s.locked then raise exception 'This game is locked. Ask your teacher to unlock it.'; end if;
    insert into players (session_id, nickname, student_id) values (s.id, left(st.full_name, 40), st.id) returning * into p;
  else
    if s.locked then raise exception 'This game is locked. Ask your teacher to unlock it.'; end if;
    if length(nick) < 2 then raise exception 'Enter a name with at least 2 letters.'; end if;
    if not public.name_ok(nick) then raise exception 'Please choose a different name.'; end if;
    if coalesce((s.settings ->> 'collectEmail')::boolean, false) and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Enter a valid email address.';
    end if;
    if exists (select 1 from players where session_id = s.id and lower(nickname) = lower(nick)) then
      raise exception 'That name is taken. Add your surname initial, e.g. "Ada O."';
    end if;
    if (select count(*) from players where session_id = s.id) >= 5000 then raise exception 'This session is full.'; end if;
    insert into players (session_id, nickname, email) values (s.id, nick, nullif(em, '')) returning * into p;
  end if;
  return json_build_object('player_id', p.id, 'token', p.token, 'session_id', s.id, 'kind', s.kind,
                           'title', s.title, 'nickname', p.nickname, 'resumed', false);
end $$;

-- Results a student may see after handing in (depends on the teacher's setting).
create or replace function public._assignment_results(p players, s sessions) returns json
language plpgsql stable security definer set search_path = public as $$
declare allowed boolean; got numeric := 0; tot numeric := 0; i int; q jsonb; a answers; results jsonb := '[]'::jsonb; pending int := 0;
begin
  allowed := p.finished_at is not null and (s.answer_reveal = 'submit'
             or (s.answer_reveal = 'close' and (s.status = 'closed' or (s.closes_at is not null and s.closes_at < now()))));
  for i in 0 .. jsonb_array_length(s.questions) - 1 loop
    q := s.questions -> i;
    select * into a from answers where player_id = p.id and q_index = i;
    tot := tot + public._q_weight(q);
    if a.id is not null then got := got + a.credit * public._q_weight(q); if not a.reviewed then pending := pending + 1; end if; end if;
    if allowed then
      results := results || jsonb_build_array(jsonb_build_object(
        'is_correct', coalesce(a.is_correct, false), 'credit', coalesce(a.credit, 0), 'choice', a.choice, 'text', a.text_answer,
        'reviewed', coalesce(a.reviewed, true), 'answer', q -> 'answer', 'explanation', q -> 'explanation', 'keyPoints', q -> 'keyPoints'));
    end if;
  end loop;
  return json_build_object('score', round(got, 2), 'total', tot, 'pending', pending,
    'available', allowed, 'reveal', s.answer_reveal, 'closes_at', s.closes_at,
    'results', case when allowed then results end);
end $$;

create or replace function public.session_state(p_player uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare p players; s sessions; q jsonb; a answers; total int; rnk int; cnt int; answered int; lim int; deadline timestamptz;
  pub jsonb;
begin
  select * into p from players where id = p_player and token = p_token;
  if not found then raise exception 'REMOVED'; end if;
  select * into s from sessions where id = p.session_id;
  total := jsonb_array_length(s.questions);
  pub := jsonb_build_object('hideScores', coalesce((s.settings ->> 'hideScores')::boolean, false),
                            'audience', coalesce(s.settings ->> 'audience', 'class'),
                            'qa', coalesce((s.settings ->> 'qa')::boolean, false),
                            'shuffle', coalesce((s.settings ->> 'shuffle')::boolean, false),
                            'readAloud', coalesce((s.settings ->> 'readAloud')::boolean, false),
                            'timeLimitMin', coalesce((s.settings ->> 'timeLimitMin')::int, 0));

  if s.kind = 'assignment' then
    lim := coalesce((s.settings ->> 'timeLimitMin')::int, 0);
    deadline := s.closes_at;
    if lim > 0 and p.started_at is not null then
      deadline := least(coalesce(s.closes_at, 'infinity'::timestamptz), p.started_at + make_interval(mins => lim));
    end if;
    return json_build_object(
      'kind', 'assignment', 'title', s.title, 'nickname', p.nickname, 'total', total, 'settings', pub,
      'status', case when s.status = 'open' and (s.closes_at is null or s.closes_at > now()) then 'open' else 'closed' end,
      'closes_at', s.closes_at, 'started_at', p.started_at, 'deadline', deadline, 'server_now', now(),
      'finished', p.finished_at is not null,
      'result', case when p.finished_at is not null then public._assignment_results(p, s) end,
      'questions', case when p.started_at is not null or p.finished_at is not null then
                    (select coalesce(jsonb_agg(public._public_q(x) order by i), '[]'::jsonb)
                       from jsonb_array_elements(s.questions) with ordinality as t(x, i)) end);
  end if;

  select count(*) into cnt from players where session_id = s.id;
  select count(*) + 1 into rnk from players where session_id = s.id and score > p.score;
  if s.current_index >= 0 and s.current_index < total then q := s.questions -> s.current_index; end if;
  select * into a from answers where player_id = p.id and q_index = s.current_index;
  select count(*) into answered from answers where session_id = s.id and q_index = s.current_index;

  return json_build_object(
    'kind', 'live', 'title', s.title, 'status', s.status, 'index', s.current_index, 'total', total, 'settings', pub,
    'time_limit', s.time_limit, 'started_at', s.question_started_at, 'server_now', now(),
    'players', cnt, 'answered', answered,
    'question', case when q is null then null
                     when s.status in ('reveal', 'leaderboard', 'ended') then q - 'keyPoints' - 'source'
                     else public._public_q(q) end,
    'my_answer', case when a.id is null then null
                      when s.status in ('reveal', 'leaderboard', 'ended') then
                        json_build_object('choice', a.choice, 'text', a.text_answer, 'is_correct', a.is_correct,
                                          'points', a.points, 'credit', a.credit)
                      else json_build_object('submitted', true) end,
    'me', json_build_object('nickname', p.nickname, 'score', p.score, 'rank', rnk,
                            'streak', p.streak, 'correct', p.correct));
end $$;

create or replace function public.submit_answer(
  p_player uuid, p_token uuid, p_index int, p_choice int default null, p_text text default null)
returns json language plpgsql security definer set search_path = public as $$
declare p players; s sessions; q jsonb; qt text; elapsed numeric; ok boolean := false; cr numeric := 0; pts int := 0; ins int;
begin
  select * into p from players where id = p_player and token = p_token for update;
  if not found then raise exception 'REMOVED'; end if;
  select * into s from sessions where id = p.session_id;
  if s.kind <> 'live' then raise exception 'This is not a live game.'; end if;
  if s.status <> 'question' or s.current_index <> p_index then raise exception 'Too late, this question has closed.'; end if;
  elapsed := extract(epoch from (now() - s.question_started_at));
  if s.time_limit > 0 and elapsed > s.time_limit + 1.5 then raise exception 'Too late, time ran out.'; end if;

  q := s.questions -> p_index;
  qt := q ->> 'type';
  if qt in ('poll', 'word') then
    if qt = 'word' and length(trim(coalesce(p_text, ''))) = 0 then raise exception 'Type a word first.'; end if;
    if qt = 'word' and not public.name_ok(p_text) then raise exception 'Please choose a different word.'; end if;
    insert into answers (session_id, player_id, q_index, choice, text_answer, is_correct, credit, points, ms)
    values (s.id, p.id, p_index, p_choice, left(lower(trim(p_text)), 40), false, 0, 0, (elapsed * 1000)::int)
    on conflict (player_id, q_index) do nothing;
    get diagnostics ins = row_count;
    if ins = 0 then raise exception 'You already answered this one.'; end if;
    return json_build_object('accepted', true);
  end if;

  if qt = 'short' then
    cr := public.grade_short(q ->> 'answer', q -> 'keyPoints', p_text);
    ok := cr >= 0.5;
  else
    ok := p_choice is not null and p_choice = (q ->> 'answer')::int;
    cr := case when ok then 1 else 0 end;
  end if;
  if cr > 0 then
    pts := round(cr * (500 + 500 * case when s.time_limit > 0 then greatest(0, 1 - elapsed / s.time_limit) else 1 end));
  end if;
  if ok then pts := pts + least(p.streak, 5) * 100; end if;

  insert into answers (session_id, player_id, q_index, choice, text_answer, is_correct, credit, points, ms, reviewed)
  values (s.id, p.id, p_index, p_choice, left(p_text, 500), ok, cr, pts, (elapsed * 1000)::int, qt <> 'short')
  on conflict (player_id, q_index) do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then raise exception 'You already answered this one.'; end if;

  update players set
    score = score + pts,
    correct = correct + case when ok then 1 else 0 end,
    streak = case when ok then streak + 1 else 0 end
  where id = p.id;
  return json_build_object('accepted', true);
end $$;

-- Starts the clock on a (timed) assignment when the student presses Start.
create or replace function public.start_attempt(p_player uuid, p_token uuid) returns json
language plpgsql security definer set search_path = public as $$
declare p players;
begin
  update players set started_at = coalesce(started_at, now()) where id = p_player and token = p_token returning * into p;
  if not found then raise exception 'REMOVED'; end if;
  return public.session_state(p_player, p_token);
end $$;

drop function if exists public.submit_assignment(uuid, uuid, jsonb);
create or replace function public.submit_assignment(p_player uuid, p_token uuid, p_answers jsonb, p_meta jsonb default '{}'::jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  p players; s sessions; q jsonb; ans jsonb; i int; total int; lim int; deadline timestamptz;
  ch int; txt text; ok boolean; cr numeric; qt text;
begin
  select * into p from players where id = p_player and token = p_token for update;
  if not found then raise exception 'REMOVED'; end if;
  if p.finished_at is not null then raise exception 'You have already submitted this. Only one attempt is allowed.'; end if;
  select * into s from sessions where id = p.session_id;
  if s.kind <> 'assignment' then raise exception 'This is not an assignment.'; end if;
  -- 2 minutes of grace for slow networks at the deadline
  if s.status <> 'open' or (s.closes_at is not null and s.closes_at + interval '2 minutes' < now()) then
    raise exception 'This assignment has closed.';
  end if;
  lim := coalesce((s.settings ->> 'timeLimitMin')::int, 0);
  if lim > 0 and p.started_at is not null and p.started_at + make_interval(mins => lim) + interval '2 minutes' < now() then
    raise exception 'Your time for this test has run out.';
  end if;

  total := jsonb_array_length(s.questions);
  for i in 0 .. total - 1 loop
    q := s.questions -> i; qt := q ->> 'type';
    ans := coalesce(p_answers -> i, '{}'::jsonb);
    ch := case when jsonb_typeof(ans -> 'choice') = 'number' then (ans ->> 'choice')::int end;
    txt := left(ans ->> 'text', 4000);
    if qt = 'short' then
      cr := public.grade_short(q ->> 'answer', q -> 'keyPoints', txt);
      ok := cr >= 0.5;
    elsif qt in ('poll', 'word') then
      ok := false; cr := 0;
    else
      ok := ch is not null and ch = (q ->> 'answer')::int;
      cr := case when ok then 1 else 0 end;
    end if;
    insert into answers (session_id, player_id, q_index, choice, text_answer, is_correct, credit, points, reviewed)
    values (s.id, p.id, i, ch, txt, ok, cr, round(cr * 100), not (qt = 'short' and coalesce(txt, '') <> ''))
    on conflict (player_id, q_index) do nothing;
  end loop;

  update players set finished_at = now(),
         flags = flags || jsonb_build_object('tabSwitches', least(999, greatest(0, coalesce((p_meta ->> 'tabSwitches')::int, 0))))
   where id = p.id returning * into p;
  perform public._assignment_score(p.id);
  return public._assignment_results(p, s);
end $$;

-- Q&A: students post and upvote questions; everyone sees the list.
create or replace function public.aq_post(p_player uuid, p_token uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare p players; s sessions;
begin
  select * into p from players where id = p_player and token = p_token;
  if not found then raise exception 'REMOVED'; end if;
  select * into s from sessions where id = p.session_id;
  if not coalesce((s.settings ->> 'qa')::boolean, false) then raise exception 'Questions are turned off for this session.'; end if;
  if length(trim(coalesce(p_body, ''))) < 3 then raise exception 'Type your question first.'; end if;
  if not public.name_ok(p_body) then raise exception 'Please rephrase your question.'; end if;
  if (select count(*) from audience_questions where player_id = p.id and created_at > now() - interval '1 minute') >= 3 then
    raise exception 'Please wait a moment before asking another question.';
  end if;
  insert into audience_questions (session_id, player_id, body) values (s.id, p.id, left(trim(p_body), 300));
end $$;

create or replace function public.aq_vote(p_player uuid, p_token uuid, p_question bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p players; n int;
begin
  select * into p from players where id = p_player and token = p_token;
  if not found then raise exception 'REMOVED'; end if;
  if not exists (select 1 from audience_questions where id = p_question and session_id = p.session_id) then raise exception 'Question not found.'; end if;
  insert into audience_votes (question_id, player_id) values (p_question, p.id) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then update audience_questions set votes = votes + 1 where id = p_question; end if;
end $$;

create or replace function public.aq_list(p_player uuid, p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare p players;
begin
  select * into p from players where id = p_player and token = p_token;
  if not found then raise exception 'REMOVED'; end if;
  return (select coalesce(json_agg(json_build_object('id', q.id, 'body', q.body, 'votes', q.votes, 'answered', q.answered,
            'mine', q.player_id = p.id, 'voted', exists (select 1 from audience_votes v where v.question_id = q.id and v.player_id = p.id))
            order by q.answered, q.votes desc, q.created_at), '[]'::json)
            from audience_questions q where q.session_id = p.session_id and not q.hidden);
end $$;

-- =====================================================================
-- PERMISSIONS
-- =====================================================================
do $$
declare f text;
begin
  -- student functions: anyone with a PIN / player token
  foreach f in array array[
    'public.join_session(text, text, text, text)', 'public.session_state(uuid, uuid)',
    'public.submit_answer(uuid, uuid, int, int, text)', 'public.submit_assignment(uuid, uuid, jsonb, jsonb)',
    'public.start_attempt(uuid, uuid)', 'public.aq_post(uuid, uuid, text)', 'public.aq_vote(uuid, uuid, bigint)',
    'public.aq_list(uuid, uuid)', 'public.ping()'] loop
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  -- teacher functions: signed-in only
  foreach f in array array[
    'public.create_session(uuid, text, int, text, timestamptz, uuid, jsonb)', 'public.host_set_state(uuid, text, int)',
    'public.host_set_lock(uuid, boolean)', 'public.host_counts(uuid)', 'public.host_reveal_data(uuid, int)',
    'public.set_answer_credit(bigint, numeric)', 'public.accept_marks(uuid, int)', 'public.purge_old_sessions(int)',
    'public.delete_my_data()', 'public.create_school(text, text, text)', 'public.join_school(text, text, text)',
    'public.set_member(uuid, text, text)', 'public.new_join_code()', 'public.leave_school()',
    'public.submit_for_review(uuid)', 'public.review_quiz(uuid, text, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- internal helpers are not callable from the website
  foreach f in array array['public._assignment_score(uuid)', 'public._too_many_attempts()',
    'public._assignment_results(public.players, public.sessions)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- PICTURES IN QUESTIONS (Supabase Storage)
-- =====================================================================
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('question-images', 'question-images', true)
    on conflict (id) do nothing;
    execute 'drop policy if exists "afterclass teachers upload images" on storage.objects';
    execute $p$create policy "afterclass teachers upload images" on storage.objects for insert to authenticated
      with check (bucket_id = 'question-images' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute 'drop policy if exists "afterclass teachers delete images" on storage.objects';
    execute $p$create policy "afterclass teachers delete images" on storage.objects for delete to authenticated
      using (bucket_id = 'question-images' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

-- =====================================================================
-- REALTIME (instant updates on the host screen)
-- =====================================================================
do $$
begin
  begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.answers; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.audience_questions; exception when duplicate_object then null; end;
end $$;
