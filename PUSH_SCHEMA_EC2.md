# Push Prisma Schema to Database on EC2

## Quick Steps

### Option 1: SSH into EC2 and Run Commands

1. **SSH into your EC2 instance:**
   ```bash
   ssh -i /path/to/your-key.pem ec2-user@your-ec2-ip
   # or
   ssh -i /path/to/your-key.pem ubuntu@your-ec2-ip
   ```

2. **Navigate to the transit_driver directory:**
   ```bash
   cd /path/to/transit_driver
   # Common paths: /home/ec2-user/transit_driver or /var/www/transit_driver
   ```

3. **Make sure .env file exists with DATABASE_URL:**
   ```bash
   # Check if .env exists
   ls -la .env
   
   # If not, create it from envexample
   cp envexample .env
   # Then edit .env with your database credentials
   nano .env
   ```

4. **Push the schema:**
   ```bash
   # Install dependencies if needed
   npm install
   
   # Generate Prisma client
   npx prisma generate
   
   # Push schema to database
   npx prisma db push --accept-data-loss
   ```

### Option 2: Use the Script

1. **SSH into EC2**

2. **Copy the script to EC2** (if not already there):
   ```bash
   chmod +x push-schema-ec2.sh
   ./push-schema-ec2.sh
   ```

## Verify Schema Push

After pushing, verify the tables exist:

```bash
# Connect to your database and check tables
# Or run this Prisma command:
npx prisma db pull --print
```

## Restart the Service

After pushing the schema, restart your transit_driver service:

```bash
# If using PM2:
pm2 restart transit_driver

# If using systemd:
sudo systemctl restart transit_driver

# If using Docker:
docker restart transit_driver

# If running directly with npm/node:
# Stop the current process (Ctrl+C) and restart:
npm run start
# or
npm run dev
```

## Troubleshooting

### Error: "Table does not exist"
- Make sure you're using the correct DATABASE_URL
- Check if the database connection is working: `npx prisma db pull`

### Error: "Prisma client not generated"
- Run: `npx prisma generate`

### Error: "Permission denied"
- Make sure you have write access to the database
- Check your database user permissions

### Connection Issues
- Verify DATABASE_URL and DIRECT_URL in .env
- Test database connection:
  ```bash
  npx prisma db execute --stdin
  # Then type: SELECT 1;
  ```


