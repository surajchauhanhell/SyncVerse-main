-- ====================================================
-- SYNCVERSE SUPABASE SCHEMA
-- Please run this entire file in the Supabase SQL Editor
-- ====================================================

-- 1. PROFILES
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone." 
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile." 
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile." 
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. ROOMS
CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  invite_code TEXT UNIQUE,
  host_id UUID REFERENCES profiles(id) NOT NULL,
  current_video_url TEXT,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rooms are viewable by everyone." 
  ON rooms FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create rooms." 
  ON rooms FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Host can update their room." 
  ON rooms FOR UPDATE USING (auth.uid() = host_id);

CREATE POLICY "Host can delete their room." 
  ON rooms FOR DELETE USING (auth.uid() = host_id);


-- 3. ROOM MEMBERS
CREATE TABLE room_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(room_id, user_id)
);

ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Room members are viewable by everyone." 
  ON room_members FOR SELECT USING (true);

CREATE POLICY "Users can join rooms." 
  ON room_members FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave rooms." 
  ON room_members FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can update their room membership." 
  ON room_members FOR UPDATE USING (auth.uid() = user_id);


-- 4. MESSAGES
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages are viewable by everyone." 
  ON messages FOR SELECT USING (true);

CREATE POLICY "Users can insert messages in rooms they joined." 
  ON messages FOR INSERT WITH CHECK (
    auth.uid() = user_id AND 
    EXISTS (SELECT 1 FROM room_members WHERE room_id = messages.room_id AND user_id = auth.uid())
  );


-- 5. REACTIONS
CREATE TABLE reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reactions viewable by everyone" ON reactions FOR SELECT USING (true);
CREATE POLICY "Users can add reactions" ON reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove reactions" ON reactions FOR DELETE USING (auth.uid() = user_id);


-- 6. PLAYBACK STATE
CREATE TABLE playback_state (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE PRIMARY KEY,
  is_playing BOOLEAN DEFAULT false,
  timestamp_seconds FLOAT DEFAULT 0.0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_by UUID REFERENCES profiles(id) NOT NULL
);

ALTER TABLE playback_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Playback state is viewable by everyone." 
  ON playback_state FOR SELECT USING (true);

CREATE POLICY "Only host can update playback state." 
  ON playback_state FOR ALL USING (
    EXISTS (SELECT 1 FROM rooms WHERE id = playback_state.room_id AND host_id = auth.uid())
  );


-- 7. CALL SESSIONS (For WebRTC active tracking, though we will mainly use Realtime Presence)
CREATE TABLE call_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(room_id, user_id)
);

ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Call sessions viewable by everyone" ON call_sessions FOR SELECT USING (true);
CREATE POLICY "Users can join calls" ON call_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave calls" ON call_sessions FOR DELETE USING (auth.uid() = user_id);


-- Enable Realtime for all interactive tables
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table room_members;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table reactions;
alter publication supabase_realtime add table playback_state;
alter publication supabase_realtime add table call_sessions;

-- STORAGE: Avatars
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

create policy "Avatar images are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'avatars' );

create policy "Anyone can upload an avatar."
  on storage.objects for insert
  with check ( bucket_id = 'avatars' );
