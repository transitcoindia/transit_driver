# Deploy Transit Driver Service to Production (EC2)

## Quick Deployment Steps

### Option 1: Manual Deployment (Recommended for first time)

1. **SSH into EC2:**
   ```bash
   ssh -i "C:\Users\adity\Downloads\transit-driver-key.pem" ec2-user@3.110.204.165
   ```

2. **Navigate to project directory:**
   ```bash
   cd ~/transit_driver
   ```

3. **Pull latest code from GitHub:**
   ```bash
   git pull origin main
   ```

4. **Install dependencies (if package.json changed):**
   ```bash
   npm install
   ```

5. **Generate Prisma Client (if schema changed):**
   ```bash
   npx prisma generate
   ```

6. **Push database schema (if schema.prisma changed):**
   ```bash
   ./push-schema-ec2.sh
   # OR manually:
   # npx prisma db push --accept-data-loss
   ```

7. **Build TypeScript:**
   ```bash
   npm run build
   ```

8. **Restart PM2 service:**
   ```bash
   pm2 restart transit-driver
   pm2 save  # Save PM2 process list (so it auto-starts on reboot)
   ```

9. **Check service status:**
   ```bash
   pm2 status
   pm2 logs transit-driver --lines 50
   ```

10. **Verify service is running:**
    ```bash
   curl http://localhost:3000/health
   ```

---

## Option 2: One-Line Deployment (After initial setup)

If you're only updating code (no schema changes):

```bash
ssh -i "C:\Users\adity\Downloads\transit-driver-key.pem" ec2-user@3.110.204.165 "cd ~/transit_driver && git pull && npm install && npm run build && pm2 restart transit-driver"
```

---

## Option 3: Using Deployment Script (Recommended)

### On Windows (PowerShell):

1. **Make sure you're in the transit_driver directory:**
   ```powershell
   cd transit_driver
   ```

2. **Run the deployment script:**
   ```powershell
   .\deploy-to-ec2.ps1
   ```

### On EC2 (Bash):

1. **Create a deployment script on EC2:**
   ```bash
   # SSH into EC2 first
   cd ~/transit_driver
   ```

2. **Create deploy.sh:**
   ```bash
   #!/bin/bash
   echo "🚀 Deploying Transit Driver Service..."
   cd ~/transit_driver
   git pull origin main
   npm install
   npx prisma generate
   npm run build
   pm2 restart transit-driver
   pm2 save
   echo "✅ Deployment complete!"
   pm2 status
   ```

3. **Make it executable:**
   ```bash
   chmod +x deploy.sh
   ```

4. **Run it:**
   ```bash
   ./deploy.sh
   ```

---

## Deployment Checklist

Before deploying, make sure:

- [ ] Code is committed and pushed to GitHub
- [ ] All tests pass locally (if you have tests)
- [ ] Environment variables are set correctly on EC2 (`.env` file)
- [ ] Database migrations are tested locally
- [ ] You have SSH access to EC2
- [ ] You know what changes you're deploying

---

## What Happens During Deployment

1. **Code Update**: Latest code is pulled from GitHub
2. **Dependencies**: New npm packages are installed (if `package.json` changed)
3. **Prisma Client**: Generated from latest schema
4. **Database Schema**: Pushed to database (only if `schema.prisma` changed)
5. **Build**: TypeScript is compiled to JavaScript
6. **Restart**: PM2 restarts the service with new code
7. **Verify**: Check logs and health endpoint

---

## Rollback Procedure

If something goes wrong:

1. **SSH into EC2:**
   ```bash
   ssh -i "C:\Users\adity\Downloads\transit-driver-key.pem" ec2-user@3.110.204.165
   ```

2. **Navigate to project:**
   ```bash
   cd ~/transit_driver
   ```

3. **Check git log for previous commit:**
   ```bash
   git log --oneline -10
   ```

4. **Revert to previous commit:**
   ```bash
   git checkout <previous-commit-hash>
   npm run build
   pm2 restart transit-driver
   ```

5. **Or reset to specific branch:**
   ```bash
   git reset --hard origin/main  # or the branch you want
   npm run build
   pm2 restart transit-driver
   ```

---

## Common Issues and Solutions

### Issue: "Permission denied" when pushing code
**Solution:** Make sure your SSH key has correct permissions (Windows: no action needed, Linux/Mac: `chmod 400 key.pem`)

### Issue: "Prisma client not found"
**Solution:** Run `npx prisma generate` before building

### Issue: "Schema drift detected"
**Solution:** Run `./push-schema-ec2.sh` or `npx prisma db push --accept-data-loss`

### Issue: "Port 3000 already in use"
**Solution:** PM2 should handle this, but if not: `pm2 delete transit-driver && pm2 start npm --name transit-driver -- run start`

### Issue: Service crashes after restart
**Solution:** Check logs: `pm2 logs transit-driver --err --lines 100`

---

## Environment-Specific Notes

### EC2 Instance Details:
- **IP Address**: `3.110.204.165`
- **SSH Key**: `C:\Users\adity\Downloads\transit-driver-key.pem`
- **User**: `ec2-user`
- **Service Port**: `3000`
- **PM2 Process Name**: `transit-driver`

### Health Check Endpoints:
- **Local (on EC2)**: `http://localhost:3000/health`
- **External**: `http://3.110.204.165:3000/health`
- **Production Domain** (if configured): `https://api.transitco.in/health`

---

## Database Schema Changes

If you modified `prisma/schema.prisma`:

1. **Test locally first:**
   ```bash
   npx prisma db push --accept-data-loss
   ```

2. **On EC2, run:**
   ```bash
   ./push-schema-ec2.sh
   ```

3. **Restart service:**
   ```bash
   pm2 restart transit-driver
   ```

**⚠️ Warning**: `--accept-data-loss` will drop columns/tables that don't exist in the new schema. Make sure you have backups!

---

## Monitoring After Deployment

1. **Check PM2 status:**
   ```bash
   pm2 status
   pm2 monit
   ```

2. **View logs:**
   ```bash
   pm2 logs transit-driver --lines 100
   pm2 logs transit-driver --err  # Only errors
   ```

3. **Test health endpoint:**
   ```bash
   curl http://localhost:3000/health
   ```

4. **Monitor for a few minutes** to ensure no crashes

---

## Next Steps After Deployment

1. ✅ Verify service is running: `pm2 status`
2. ✅ Check health endpoint responds: `curl http://localhost:3000/health`
3. ✅ Monitor logs for errors: `pm2 logs transit-driver --err`
4. ✅ Test critical endpoints (registration, login, etc.)
5. ✅ Update API Gateway configuration if needed
6. ✅ Notify team of deployment

