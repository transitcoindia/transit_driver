# ✅ Elastic Beanstalk Platform Update - Action Checklist

## 🎯 Issue Fixed
Your EB environment was showing "Platform version not recommended" alerts due to running on outdated version 6.6.8.

## ✅ What Was Done

### Files Changed:
- ✅ `.elasticbeanstalk/config.yml` - Updated platform_version to 6.7.2
- ✅ `.github/workflows/deploy.yml` - Added automatic platform update step
- ✅ `.ebextensions/04_platform_settings.config` - Added managed platform updates
- ✅ `scripts/update-eb-platform.sh` - Created manual update script (Linux/Mac)
- ✅ `scripts/update-eb-platform.ps1` - Created manual update script (Windows)
- ✅ `EB_PLATFORM_UPDATE_GUIDE.md` - Full documentation

## 🚀 Next Steps (Choose One)

### Option A: Quick Update via Script (Recommended for Immediate Fix)

**On Windows PowerShell:**
```powershell
cd e:\transitDriver\transitDriver\transit_driver
.\scripts\update-eb-platform.ps1 transit-driver-prod
```

**On Linux/Mac:**
```bash
cd transit_driver
chmod +x scripts/update-eb-platform.sh
./scripts/update-eb-platform.sh transit-driver-prod
```

This will:
- ✅ Check your current platform version
- ✅ Update to latest recommended version (6.7.2+)
- ✅ Monitor the update progress
- ✅ Verify health status
- ⏱️ Takes ~5-15 minutes

### Option B: Update via GitHub Push (Automatic)

```bash
git add .
git commit -m "fix: Update EB platform to latest recommended version"
git push origin main  # or your branch
```

This will:
- ✅ Automatically check and update platform version
- ✅ Deploy your application
- ✅ Run health checks
- ⏱️ Takes ~15-20 minutes

### Option C: Manual via AWS Console

1. Go to [AWS EB Console](https://console.aws.amazon.com/elasticbeanstalk)
2. Select `transit_driver` application
3. Select `transit-driver-prod` environment
4. Click **Configuration** → **Platform** → **Edit**
5. Select latest Node.js 22 on AL2023 version
6. Click **Apply**

## 📋 Verification Steps

After update completes, verify:

### 1. Check Platform Version
```bash
aws elasticbeanstalk describe-environments \
  --application-name transit_driver \
  --environment-names transit-driver-prod \
  --region ap-south-1 \
  --query 'Environments[0].[PlatformArn,Status,Health]' \
  --output table
```

Expected output:
- ✅ Platform version: 6.7.2 or higher
- ✅ Status: Ready
- ✅ Health: Green

### 2. Check AWS Console
- ✅ No "Platform version not recommended" alerts
- ✅ Environment health is Green
- ✅ Application is responding

### 3. Test Health Endpoint
```bash
curl https://your-eb-url.ap-south-1.elasticbeanstalk.com/health
```

Expected: Status 200 OK

## ⚠️ Important Notes

### For Staging Environment:
If you also have a staging environment, update it too:
```powershell
# Windows
.\scripts\update-eb-platform.ps1 transit-driver-staging

# Linux/Mac
./scripts/update-eb-platform.sh transit-driver-staging
```

### Downtime:
- Platform updates typically have **minimal downtime** (1-2 minutes)
- Uses rolling deployment by default
- Application remains available during update

### Rollback:
If issues occur, you can rollback through AWS Console:
1. Go to Environment
2. Click **Actions** → **Restore** 
3. Select previous configuration

## 🔄 Automatic Updates Going Forward

With `.ebextensions/04_platform_settings.config`, your environment will:
- ✅ Auto-update to latest minor versions
- ✅ Run updates every Sunday at 10:00 UTC
- ✅ Use rolling deployments (zero downtime)
- ✅ Automatically rollback if health fails

To disable auto-updates, edit `.ebextensions/04_platform_settings.config`:
```yaml
ManagedActionsEnabled: false
```

## 📊 Expected Results

### Before Fix:
- ❌ Platform version: 6.6.8 (outdated)
- ⚠️ Alert: "Platform version not recommended"
- ⚠️ Inconsistent Ready status
- ⚠️ Health check issues

### After Fix:
- ✅ Platform version: 6.7.2+ (latest)
- ✅ No platform alerts
- ✅ Consistent Ready status
- ✅ Healthy environment

## 📞 Need Help?

1. **Check logs**: AWS Console → Environment → Logs
2. **Check events**: AWS Console → Environment → Events  
3. **Read guide**: See `EB_PLATFORM_UPDATE_GUIDE.md` for detailed troubleshooting
4. **AWS Support**: Open ticket if issues persist

---

**Ready to proceed?** Choose Option A, B, or C above and follow the steps! 🚀

**Estimated Time**: 5-20 minutes depending on chosen method

