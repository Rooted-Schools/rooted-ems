-- Storage RLS policies for the "documents" bucket.
-- Files are stored at: documents/{user_id}/{filename}
-- Authenticated users can upload/read their own files.
-- Staff (is_staff) can read all files in the bucket.

-- Policy: Authenticated users can upload to their own folder
CREATE POLICY "Users can upload their own documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Authenticated users can read their own documents
CREATE POLICY "Users can read their own documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Staff can read all documents
CREATE POLICY "Staff can read all documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.user_profile
      WHERE id = auth.uid() AND is_staff = true
    )
  );

-- Policy: Users can update (overwrite) their own documents
CREATE POLICY "Users can update their own documents"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can delete their own documents
CREATE POLICY "Users can delete their own documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
