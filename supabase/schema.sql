-- TeamChallenge Database Schema
-- Run this in the Supabase SQL Editor to set up the database

-- ============================================
-- STEP 1: CREATE ALL TABLES
-- ============================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'player' check (role in ('admin', 'player')),
  avatar_url text,
  created_at timestamptz default now()
);

create table games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  code text unique not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'active', 'finished')),
  created_by uuid references profiles(id),
  settings jsonb default '{}',
  created_at timestamptz default now(),
  published_at timestamptz
);

create table challenges (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  title text not null,
  description text,
  type text not null check (type in ('multiple_choice', 'free_text', 'photo_upload', 'gps_check')),
  points integer not null default 10,
  time_limit integer,
  hint text,
  sort_order integer not null default 0,
  media_url text,
  media_type text check (media_type in ('image', 'audio', 'video')),
  config jsonb not null default '{}',
  created_at timestamptz default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  name text not null,
  color text not null default '#00f0ff',
  created_at timestamptz default now()
);

create table game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  player_id uuid references profiles(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  invited_at timestamptz default now(),
  joined_at timestamptz,
  unique(game_id, player_id)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references challenges(id) on delete cascade,
  player_id uuid references profiles(id),
  team_id uuid references teams(id),
  game_id uuid references games(id),
  answer jsonb not null,
  is_correct boolean,
  points_awarded integer default 0,
  submitted_at timestamptz default now()
);

-- ============================================
-- STEP 2: FUNCTIONS & TRIGGERS
-- ============================================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), 'player');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_admin()
returns boolean as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$ language sql security definer;

-- ============================================
-- STEP 3: ENABLE RLS ON ALL TABLES
-- ============================================

alter table profiles enable row level security;
alter table games enable row level security;
alter table challenges enable row level security;
alter table teams enable row level security;
alter table game_players enable row level security;
alter table submissions enable row level security;

-- ============================================
-- STEP 4: RLS POLICIES
-- ============================================

-- Profiles
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);
create policy "Admins can read all profiles"
  on profiles for select using (is_admin());
create policy "Admins can update all profiles"
  on profiles for update using (is_admin());
create policy "Admins can insert profiles"
  on profiles for insert with check (is_admin());

-- Games
create policy "Admins can do everything with games"
  on games for all using (is_admin());
create policy "Players can read published/active games they are in"
  on games for select using (
    status in ('published', 'active') and
    exists(select 1 from game_players where game_id = games.id and player_id = auth.uid())
  );

-- Challenges
create policy "Admins can do everything with challenges"
  on challenges for all using (is_admin());
create policy "Players can read challenges for active games they are in"
  on challenges for select using (
    exists(
      select 1 from games g
      join game_players gp on gp.game_id = g.id
      where g.id = challenges.game_id
        and g.status = 'active'
        and gp.player_id = auth.uid()
    )
  );

-- Teams
create policy "Admins can do everything with teams"
  on teams for all using (is_admin());
create policy "Players can read teams for their games"
  on teams for select using (
    exists(select 1 from game_players where game_id = teams.game_id and player_id = auth.uid())
  );

-- Game Players
create policy "Admins can do everything with game_players"
  on game_players for all using (is_admin());
create policy "Players can read their own game_players"
  on game_players for select using (player_id = auth.uid());

-- Submissions
create policy "Players can insert own submissions"
  on submissions for insert with check (player_id = auth.uid());
create policy "Players can read own submissions"
  on submissions for select using (player_id = auth.uid());
create policy "Admins can read all submissions"
  on submissions for select using (is_admin());
