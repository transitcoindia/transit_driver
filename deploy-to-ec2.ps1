# PowerShell script to deploy transit_driver service to EC2
# Usage: .\deploy-to-ec2.ps1

param(
    [string]$EC2_IP = "3.110.204.165",
    [string]$SSH_KEY = "C:\Users\adity\Downloads\transit-driver-key.pem",
    [string]$BRANCH = "main",
    [switch]$SkipSchema = $false,
    [switch]$SkipInstall = $false,
    [switch]$VerboseSSH = $false
)

function Log { param($msg, $color = "Gray") Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $msg" -ForegroundColor $color }
function LogStep { param($msg) Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $msg" -ForegroundColor Cyan }
function LogOk { param($msg) Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✅ $msg" -ForegroundColor Green }
function LogErr { param($msg) Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ❌ $msg" -ForegroundColor Red }
function LogWarn { param($msg) Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ⚠️  $msg" -ForegroundColor Yellow }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🚀 Transit Driver Deployment to EC2" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Log "EC2 IP: $EC2_IP" Yellow
Log "Branch: $BRANCH" Yellow
Log "SSH Key: $SSH_KEY" Yellow
Log "Verbose SSH: $VerboseSSH" Gray
Write-Host ""

# Check if SSH key exists
if (-not (Test-Path $SSH_KEY)) {
    LogErr "SSH key not found at: $SSH_KEY"
    exit 1
}
LogOk "SSH key found"

Write-Host ""
LogStep "Step 1: Checking git status..."
$gitStatus = git status --short
if ($gitStatus) {
    LogWarn "Uncommitted changes:"
    Write-Host $gitStatus -ForegroundColor Gray
    $confirm = Read-Host "Continue anyway? (y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") { exit 0 }
} else {
    LogOk "Working directory clean"
}
Write-Host ""

LogStep "Step 2: Pushing code to GitHub..."
$currentBranch = git branch --show-current
if ($currentBranch -ne $BRANCH) {
    LogWarn "Not on '$BRANCH' (on '$currentBranch')"
    $confirm = Read-Host "Continue? (y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") { exit 0 }
}
$unpushedCommits = git log origin/$BRANCH..HEAD --oneline 2>$null
if ($unpushedCommits) {
    LogWarn "Unpushed commits. Push first? (y/n)"
    $confirm = Read-Host
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        git push origin $BRANCH
        if ($LASTEXITCODE -ne 0) { LogErr "Push failed"; exit 1 }
        LogOk "Pushed to GitHub"
    }
} else {
    LogOk "All commits pushed"
}
Write-Host ""

LogStep "Step 3: Deploying to EC2..."

# Build deploy command (original inline approach)
$deployCommands = @(
    "cd ~/transit_driver",
    "echo '[LOG] Pulling latest code...'",
    "git fetch origin",
    "git checkout $BRANCH",
    "git reset --hard origin/$BRANCH",
    "git clean -fd"
)
if (-not $SkipInstall) {
    $deployCommands += @("echo '[LOG] npm install...'", "npm install")
}
$deployCommands += @(
    "echo '[LOG] Prisma generate...'",
    "npx prisma generate",
    "echo '[LOG] Building...'",
    "npm run build"
)
if (-not $SkipSchema) {
    $deployCommands += @("if [ -f push-schema-ec2.sh ]; then bash push-schema-ec2.sh; fi")
}
$deployCommands += @(
    "echo '[LOG] Restarting PM2...'",
    "pm2 restart transit-driver",
    "pm2 save",
    "echo '[LOG] Done'",
    "pm2 status",
    "pm2 logs transit-driver --lines 20 --nostream"
)

$deployScript = $deployCommands -join " && "
Log "SSH command length: $($deployScript.Length) chars" Gray

$sshBase = "ssh -i `"$SSH_KEY`" -o StrictHostKeyChecking=no"
if ($VerboseSSH) { $sshBase += " -v" }
$fullCmd = "$sshBase ec2-user@$EC2_IP `"$deployScript`""

Log "Running: ssh -i (key) ec2-user@$EC2_IP (deploy commands)" Gray
Write-Host ""

try {
    Invoke-Expression $fullCmd
    $exitCode = $LASTEXITCODE
    Log "SSH exit code: $exitCode" $(if ($exitCode -eq 0) { "Green" } else { "Red" })

    if ($exitCode -eq 0) {
        Write-Host ""
        LogOk "Deployment Successful!"
        Log "Health: http://${EC2_IP}:3000/health" Gray
    } else {
        LogErr "Deployment failed (exit $exitCode)"
        exit 1
    }
} catch {
    LogErr "Exception: $_"
    Log "Error details: $($_.Exception.Message)" Red
    exit 1
}
