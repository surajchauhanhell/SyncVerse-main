/*
  # SyncVerse - Watch Party Platform Schema

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `username` (text, unique)
      - `avatar_url` (text)
      - `status` (text: online/offline/away)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `rooms`
      - `id` (uuid, primary key)
      - `name` (text)
      - `description` (text)
      - `invite_code` (text, unique)
      - `is_public` (boolean)
      - `video_url` (text)
      - `video_title` (text)
      - `created_by` (uuid, references profiles)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `room_participants`
      - `id` (uuid, primary key)
      - `room_id` (uuid, references rooms)
      - `user_id` (uuid, references profiles)
      - `role` (text: owner/moderator/member)
      - `is_muted` (boolean)
      - `is_deafened` (boolean)
      - `is_video_on` (boolean)
      - `is_screen_sharing` (boolean)
      - `joined_at` (timestamptz)
    - `messages`
      - `id` (uuid, primary key)
      - `room_id` (uuid, references rooms)
      - `user_id` (uuid, references profiles)
      - `content` (text)
      - `type` (text: text/emoji/system)
      - `created_at` (timestamptz)
    - `friendships`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `friend_id` (uuid, references profiles)
      - `status` (text: pending/accepted/blocked)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Profiles: users can read all, update own
    - Rooms: authenticated users can read public rooms and rooms they belong to; creators can insert; participants can update
    - Room participants: participants can read in their rooms; users can insert themselves; users can update own state
    - Messages: participants can read messages in their rooms; participants can insert messages; only message author can delete
    - Friendships: users can read own friendships; users can create friend requests; users can update own friendships

  3. Indexes
    - rooms.invite_code (unique)
    - room_participants on (room_id, user_id) (unique composite)
    - messages on room_id and created_at
    - friendships on (user_id, friend_id) (unique composite)
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  avatar_url text DEFAULT '',
  status text DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away', 'dnd')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  invite_code text UNIQUE NOT NULL DEFAULT upper(substr(md5(random()::text), 1, 8)),
  is_public boolean DEFAULT false,
  video_url text DEFAULT '',
  video_title text DEFAULT '',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Room participants table
CREATE TABLE IF NOT EXISTS room_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
  is_muted boolean DEFAULT false,
  is_deafened boolean DEFAULT false,
  is_video_on boolean DEFAULT false,
  is_screen_sharing boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  type text DEFAULT 'text' CHECK (type IN ('text', 'emoji', 'system')),
  created_at timestamptz DEFAULT now()
);

-- Friendships table
CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Anyone can view profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Rooms policies
CREATE POLICY "Users can view public rooms"
  ON rooms FOR SELECT
  TO authenticated
  USING (is_public = true OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM room_participants WHERE room_id = rooms.id AND user_id = auth.uid()));

CREATE POLICY "Authenticated users can create rooms"
  ON rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Room creators can update their rooms"
  ON rooms FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM room_participants WHERE room_id = rooms.id AND user_id = auth.uid() AND role IN ('owner', 'moderator')))
  WITH CHECK (created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM room_participants WHERE room_id = rooms.id AND user_id = auth.uid() AND role IN ('owner', 'moderator')));

-- Room participants policies
CREATE POLICY "Participants can view room members"
  ON room_participants FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM room_participants WHERE room_id = room_participants.room_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM rooms WHERE id = room_participants.room_id AND is_public = true));

CREATE POLICY "Users can join rooms"
  ON room_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own participant state"
  ON room_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave rooms"
  ON room_participants FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Messages policies
CREATE POLICY "Room participants can view messages"
  ON messages FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM room_participants WHERE room_id = messages.room_id AND user_id = auth.uid()));

CREATE POLICY "Room participants can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM room_participants WHERE room_id = messages.room_id AND user_id = auth.uid()));

CREATE POLICY "Message authors can delete own messages"
  ON messages FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Friendships policies
CREATE POLICY "Users can view own friendships"
  ON friendships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "Users can send friend requests"
  ON friendships FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own friendships"
  ON friendships FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR friend_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR friend_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_invite_code ON rooms(invite_code);
CREATE INDEX IF NOT EXISTS idx_room_participants_room_user ON room_participants(room_id, user_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_friendships_user_friend ON friendships(user_id, friend_id);
