# Supabase Storage Setup Guide

This guide will help you set up Supabase Storage for the transit driver service.

## Prerequisites

1. A Supabase project (create one at https://supabase.com)
2. Access to your Supabase project dashboard

## Step 1: Create the Storage Bucket

### Option A: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Configure the bucket:
   - **Name**: `driver-files`
   - **Public bucket**: ✅ **Enable** (checked)
   - **File size limit**: `10 MB` (or your preferred limit)
   - **Allowed MIME types**: 
     - `image/jpeg`
     - `image/jpg`
     - `image/png`
     - `image/webp`
     - `image/gif`
     - `application/pdf`
5. Click **Create bucket**

### Option B: Using SQL Editor

Run the SQL from `SUPABASE_STORAGE_POLICY.sql` in your Supabase SQL Editor.

## Step 2: Set Up Storage Policies

1. Go to **Storage** → **Policies** in your Supabase dashboard
2. Select the `driver-files` bucket
3. Click **New Policy**

### Required Policies:

#### Policy 1: Allow Authenticated Uploads
- **Policy name**: `Allow authenticated users to upload files`
- **Allowed operation**: `INSERT`
- **Target roles**: `authenticated`
- **USING expression**: `bucket_id = 'driver-files'`
- **WITH CHECK expression**: 
  ```sql
  bucket_id = 'driver-files' AND
  (storage.foldername(name))[1] IN ('driver-documents', 'vehicle-images')
  ```

#### Policy 2: Allow Public Read Access
- **Policy name**: `Allow public read access to driver files`
- **Allowed operation**: `SELECT`
- **Target roles**: `public`
- **USING expression**: `bucket_id = 'driver-files'`

#### Policy 3: Allow Authenticated Updates (Optional)
- **Policy name**: `Allow authenticated users to update files`
- **Allowed operation**: `UPDATE`
- **Target roles**: `authenticated`
- **USING expression**: `bucket_id = 'driver-files'`
- **WITH CHECK expression**: 
  ```sql
  bucket_id = 'driver-files' AND
  (storage.foldername(name))[1] IN ('driver-documents', 'vehicle-images')
  ```

#### Policy 4: Allow Authenticated Deletes (Optional)
- **Policy name**: `Allow authenticated users to delete files`
- **Allowed operation**: `DELETE`
- **Target roles**: `authenticated`
- **USING expression**: 
  ```sql
  bucket_id = 'driver-files' AND
  (storage.foldername(name))[1] IN ('driver-documents', 'vehicle-images')
  ```

**OR** simply run all the SQL commands from `SUPABASE_STORAGE_POLICY.sql` in the SQL Editor.

## Step 3: Get Your Supabase Credentials

1. Go to **Project Settings** → **API** in your Supabase dashboard
2. Copy the following:
   - **Project URL** (this is your `SUPABASE_URL`)
   - **Service Role Key** (this is your `SUPABASE_SERVICE_ROLE_KEY`)
     - ⚠️ **Important**: Keep this key secret! Never expose it in client-side code.

## Step 4: Configure Environment Variables

Add these to your `.env` file:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**For production (EC2):**
- SSH into your EC2 instance
- Edit your `.env` file or PM2 ecosystem file
- Add the Supabase credentials
- Restart your service

## Step 5: Test the Setup

After setting up, test the file upload:

1. Start your service
2. Try uploading a driver document or vehicle image
3. Check the response - it should contain a Supabase URL
4. Visit the URL in a browser to verify the file is accessible

## Folder Structure

Files will be organized in the bucket as follows:

```
driver-files/
├── driver-documents/
│   ├── driving-license-1234567890.pdf
│   ├── vehicle-registration-1234567891.pdf
│   └── insurance-1234567892.pdf
└── vehicle-images/
    ├── cover-1234567893.jpg
    ├── interior-1234567894.jpg
    └── exterior-1234567895.jpg
```

## Troubleshooting

### Error: "Bucket not found"
- Make sure you created the bucket named exactly `driver-files`
- Check that the bucket name matches in both Supabase and your code

### Error: "New row violates row-level security policy"
- Check that your storage policies are correctly set up
- Verify the service role key has proper permissions
- Ensure the folder name matches: `driver-documents` or `vehicle-images`

### Error: "Supabase client not initialized"
- Verify your `.env` file has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Restart your service after adding environment variables
- Check for typos in the environment variable names

### Files not publicly accessible
- Ensure the bucket is set to **Public**
- Check that the "Allow public read access" policy is active
- Verify the file URL is correct

## Security Notes

1. **Service Role Key**: This key has admin-level access. Never commit it to version control or expose it in client-side code.

2. **File Size Limits**: The default limit is 10MB. Adjust in the bucket settings if needed.

3. **MIME Type Restrictions**: Only specified file types can be uploaded. Add more types in the bucket settings if needed.

4. **Folder Restrictions**: The policies restrict uploads to specific folders (`driver-documents` and `vehicle-images`). This prevents unauthorized file uploads to other locations.

## Next Steps

After setup:
1. Test file uploads from the driver registration flow
2. Verify files are accessible via the returned URLs
3. Monitor storage usage in the Supabase dashboard
4. Set up automatic cleanup policies if needed (for old/temporary files)
