-- Create RLS policies for social_media storage bucket
-- Allows authenticated users to upload images for comment attachments
-- Allows public read access for viewing comment images

DO $$ 
BEGIN
  BEGIN
    CREATE POLICY "social_media_insert" ON storage.objects 
      FOR INSERT TO authenticated 
      WITH CHECK (bucket_id = 'social_media');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    CREATE POLICY "social_media_select" ON storage.objects 
      FOR SELECT TO public 
      USING (bucket_id = 'social_media');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
