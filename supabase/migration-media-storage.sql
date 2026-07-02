-- Migration: Supabase Storage bucket for WhatsApp media
-- Run once via Supabase SQL editor or psql

-- Create the marpe-media bucket (public read, auth write via service_role)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marpe-media',
  'marpe-media',
  true,
  52428800,  -- 50MB per file
  ARRAY['image/jpeg','image/png','image/webp','image/gif','audio/ogg','audio/mpeg','audio/mp4','audio/m4a','video/mp4','video/quicktime','application/pdf','application/octet-stream','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read (GET) on all objects in marpe-media
CREATE POLICY IF NOT EXISTS "marpe-media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'marpe-media');

-- Allow service_role (server-side) to insert/update/delete
-- (service_role bypasses RLS by default, so this is just for documentation)
-- No additional INSERT policy needed when using service_role key.
