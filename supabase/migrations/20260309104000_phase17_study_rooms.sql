/* PHASE 17 SQL MIGRATION: STUDY ROOMS */
/* Supports the collaborative /study-group.js training feature */

-- 1. Create study_rooms table
CREATE TABLE IF NOT EXISTS public.study_rooms (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    hand_data JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create study_room_members table
CREATE TABLE IF NOT EXISTS public.study_room_members (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    room_id UUID REFERENCES public.study_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'MEMBER' CHECK (role IN ('ADMIN', 'MEMBER', 'VIEWER')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

-- 3. Create study_room_messages table for realtime chat
CREATE TABLE IF NOT EXISTS public.study_room_messages (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    room_id UUID REFERENCES public.study_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_room_messages ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Rooms: Anyone can view an active room, but only owner/members can update
CREATE POLICY "Anyone can view study rooms"
ON public.study_rooms FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create study rooms"
ON public.study_rooms FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Room owner can update study room"
ON public.study_rooms FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id OR EXISTS (SELECT 1 FROM public.study_room_members WHERE room_id = public.study_rooms.id AND user_id = auth.uid() AND role = 'ADMIN'));

CREATE POLICY "Room owner can delete study room"
ON public.study_rooms FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

-- Members: Anyone can view members, authenticated users can insert themselves
CREATE POLICY "Anyone can view room members"
ON public.study_room_members FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can join rooms"
ON public.study_room_members FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can leave rooms"
ON public.study_room_members FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.study_rooms WHERE id = room_id AND owner_id = auth.uid()));

-- Messages: Anyone in the room can view/insert messages
CREATE POLICY "Anyone can view room messages"
ON public.study_room_messages FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can send messages"
ON public.study_room_messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Add helper function to add tables to publication if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'study_rooms'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.study_rooms;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'study_room_members'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.study_room_members;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'study_room_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.study_room_messages;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping realtime publication additions due to error: %', SQLERRM;
END $$;
