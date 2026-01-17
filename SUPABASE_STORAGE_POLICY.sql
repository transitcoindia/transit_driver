-- ============================================
-- Supabase Storage Policies for driver-files
-- ============================================
-- Run these commands in your Supabase SQL Editor
-- Make sure the bucket 'driver-files' exists first

-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-files',
  'driver-files',
  true, -- Public bucket so files are accessible via public URLs
  10485760, -- 10MB file size limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Storage Policies for driver-files bucket
-- ============================================

-- 2. Policy: Allow authenticated users to upload files
CREATE POLICY "Allow authenticated users to upload files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'driver-files' AND
  (storage.foldername(name))[1] IN ('driver-documents', 'vehicle-images')
);

-- 3. Policy: Allow public read access to all files
CREATE POLICY "Allow public read access to driver files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'driver-files');

-- 4. Policy: Allow authenticated users to update their own files (optional)
CREATE POLICY "Allow authenticated users to update files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'driver-files')
WITH CHECK (
  bucket_id = 'driver-files' AND
  (storage.foldername(name))[1] IN ('driver-documents', 'vehicle-images')
);

-- 5. Policy: Allow authenticated users to delete files (optional)
CREATE POLICY "Allow authenticated users to delete files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'driver-files' AND
  (storage.foldername(name))[1] IN ('driver-documents', 'vehicle-images')
);

-- ============================================
-- Alternative: Service Role Policy (if using service role key)
-- ============================================
-- If you're using SUPABASE_SERVICE_ROLE_KEY, you might want to allow service role full access:

-- Policy: Allow service role full access
-- Note: Service role bypasses RLS by default, but you can still add this for clarity
CREATE POLICY "Allow service role full access"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'driver-files')
WITH CHECK (bucket_id = 'driver-files');

-- ============================================
-- To verify policies are created:
-- ============================================
-- Run this query to see all policies:
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';

-- To see the bucket:
-- SELECT * FROM storage.buckets WHERE id = 'driver-files';
