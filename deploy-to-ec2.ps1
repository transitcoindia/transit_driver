# PowerShell script to deploy transit_driver service to EC2
# Usage: .\deploy-to-ec2.ps1

param(
    [string]$EC2_IP = "3.110.204.165",
    [string]$SSH_KEY = "C:\Users\adity\Downloads\transit-driver-key.pem",
    [string]$BRANCH = "main",
    [switch]$SkipSchema = $false,
    [switch]$SkipInstall = $false,
    [switch]$TestConnection = $false,
    [switch]$VerboseSSH = $false,
    [switch]$SkipConnectionTest = $false
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🚀 Transit Driver Deployment to EC2" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "EC2 IP: $EC2_IP" -ForegroundColor Yellow
Write-Host "Branch: $BRANCH" -ForegroundColor Yellow
Write-Host "SSH Key: $SSH_KEY" -ForegroundColor Yellow
Write-Host ""

# Check if SSH key exists
if (-not (Test-Path $SSH_KEY)) {
    Write-Host "❌ Error: SSH key not found at: $SSH_KEY" -ForegroundColor Red
    Write-Host "Please update the SSH_KEY path in the script or pass it as parameter" -ForegroundColor Yellow
    exit 1
}

Write-Host "Step 1: Checking git status..." -ForegroundColor Cyan
$gitStatus = git status --short
if ($gitStatus) {
    Write-Host "⚠️  Warning: You have uncommitted changes:" -ForegroundColor Yellow
    Write-Host $gitStatus -ForegroundColor Gray
    $confirm = Read-Host "Do you want to continue anyway? (y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Deployment cancelled" -ForegroundColor Yellow
        exit 0
    }
} else {
    Write-Host "✅ Working directory is clean" -ForegroundColor Green
}
Write-Host ""

Write-Host "Step 2: Pushing code to GitHub..." -ForegroundColor Cyan
$currentBranch = git branch --show-current
if ($currentBranch -ne $BRANCH) {
    Write-Host "⚠️  Warning: You're not on '$BRANCH' branch (currently on '$currentBranch')" -ForegroundColor Yellow
    $confirm = Read-Host "Do you want to continue? (y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        exit 0
    }
}

# Check if there are commits to push
$unpushedCommits = git log origin/$BRANCH..HEAD --oneline
if ($unpushedCommits) {
    Write-Host "You have unpushed commits. Consider pushing to GitHub first:" -ForegroundColor Yellow
    Write-Host $unpushedCommits -ForegroundColor Gray
    $confirm = Read-Host "Push to GitHub now? (y/n)"
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        git push origin $BRANCH
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to push to GitHub" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ Code pushed to GitHub" -ForegroundColor Green
    }
} else {
    Write-Host "✅ All commits are pushed to GitHub" -ForegroundColor Green
}
Write-Host ""

Write-Host "Step 3: Connecting to EC2 and deploying..." -ForegroundColor Cyan
Write-Host ""

# Show user's public IP (for security group whitelist)
try {
    $myIp = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing -TimeoutSec 5).Content.Trim()
    Write-Host "Your public IP: $myIp" -ForegroundColor Gray
    Write-Host "  (Add inbound SSH port 22 from $myIp in EC2 Security Group)" -ForegroundColor DarkGray
} catch { Write-Host "  (Could not fetch your IP)" -ForegroundColor DarkGray }
Write-Host ""

# Quick connectivity test before full deploy (skip with -SkipConnectionTest)
if (-not $SkipConnectionTest) {
    Write-Host "Testing SSH connection..." -ForegroundColor Gray
    $null = ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o ServerAliveInterval=5 ec2-user@$EC2_IP "echo OK"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Pre-check failed. Try: .\deploy-to-ec2.ps1 -SkipConnectionTest" -ForegroundColor Red
        Write-Host "   Or fix: Security group port 22, instance running, PEM key." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✅ SSH connection OK" -ForegroundColor Green
} else {
    Write-Host "⏭️  Skipping connection test" -ForegroundColor Yellow
}
Write-Host ""

# Test connection only (for troubleshooting)
if ($TestConnection) {
    Write-Host "Testing SSH connection (verbose)..." -ForegroundColor Cyan
    & ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=60 ec2-user@$EC2_IP "echo OK"
    exit $LASTEXITCODE
}

# Use SCP + SSH with short commands to avoid "banner exchange" timeouts
$remoteScript = "/tmp/deploy-transit.sh"
$localScript = Join-Path $env:TEMP "deploy-transit-$(Get-Date -Format 'yyyyMMddHHmmss').sh"

$installBlock = if (-not $SkipInstall) { @"
echo '[INFO] Installing dependencies...'
npm install

"@ } else { "" }
$schemaBlock = if (-not $SkipSchema) { @"
if [ -f push-schema-ec2.sh ]; then bash push-schema-ec2.sh; else echo '[WARN] Schema script not found'; fi

"@ } else { "" }

$scriptContent = @"
#!/bin/bash
set -e
cd ~/transit_driver
echo '[INFO] Pulling latest code...'
git fetch origin
git checkout $BRANCH
git reset --hard origin/$BRANCH
git clean -fd

$installBlock
echo '[INFO] Generating Prisma client...'
npx prisma generate
echo '[INFO] Building TypeScript...'
npm run build

$schemaBlock
echo '[INFO] Restarting service...'
pm2 restart transit-driver
pm2 save
echo '[SUCCESS] Deployment complete!'
pm2 status
pm2 logs transit-driver --lines 20 --nostream
"@

# Unix line endings for bash on EC2
[System.IO.File]::WriteAllText($localScript, ($scriptContent -replace "`r`n","`n"))

Write-Host "Copying deploy script to EC2..." -ForegroundColor Gray
$scpArgs = @("-i", $SSH_KEY, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=60", "-o", "ServerAliveInterval=10", $localScript, "ec2-user@${EC2_IP}:$remoteScript")
if ($VerboseSSH) { $scpArgs = @("-v") + $scpArgs }
& scp @scpArgs
if ($LASTEXITCODE -ne 0) {
    Remove-Item $localScript -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "❌ SCP failed - cannot reach EC2" -ForegroundColor Red
    Write-Host ""
    Write-Host "Fix in AWS Console:" -ForegroundColor Yellow
    Write-Host "  1. EC2 → Instances → select instance → Security tab" -ForegroundColor Gray
    Write-Host "  2. Click the Security Group → Edit inbound rules" -ForegroundColor Gray
    Write-Host "  3. Add: Type=SSH, Port=22, Source=My IP (or your IP: see above)" -ForegroundColor Gray
    Write-Host "  4. If using dynamic IP, try Source=0.0.0.0/0 (less secure)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or try: different WiFi, disable VPN, check instance is Running" -ForegroundColor Gray
    exit 1
}
Remove-Item $localScript -ErrorAction SilentlyContinue

Write-Host "Executing deployment on EC2..." -ForegroundColor Gray
Write-Host ""

$sshArgs = @("-i", $SSH_KEY, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=60", "-o", "ServerAliveInterval=10", "ec2-user@$EC2_IP", "chmod +x $remoteScript && bash $remoteScript; rm -f $remoteScript")
if ($VerboseSSH) { $sshArgs = @("-v") + $sshArgs }
try {
    & ssh @sshArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "✅ Deployment Successful!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "1. Check service health: http://${EC2_IP}:3000/health" -ForegroundColor Gray
        Write-Host "2. Monitor logs: ssh -i `"$SSH_KEY`" ec2-user@$EC2_IP 'pm2 logs transit-driver --lines 50'" -ForegroundColor Gray
        Write-Host "3. Check PM2 status: ssh -i `"$SSH_KEY`" ec2-user@$EC2_IP 'pm2 status'" -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "❌ Deployment failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        Write-Host "Check the error messages above for details" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ Error during deployment: $_" -ForegroundColor Red
    exit 1
}

