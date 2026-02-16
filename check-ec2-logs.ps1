# Check transit_driver logs on EC2
# Usage: .\check-ec2-logs.ps1 [-EC2_IP "x.x.x.x"] [-SSH_KEY "path/to/key.pem"] [-Lines 100] [-Follow]

param(
    [string]$EC2_IP = "3.110.204.165",
    [string]$SSH_KEY = "C:\Users\adity\Downloads\transit-driver-key.pem",
    [int]$Lines = 100,
    [switch]$Follow = $false,
    [switch]$Errors = $false,
    [switch]$Status = $false
)

$sshBase = "ssh -i `"$SSH_KEY`" -o StrictHostKeyChecking=no ec2-user@$EC2_IP"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Transit Driver EC2 Logs Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "EC2 IP: $EC2_IP" -ForegroundColor Yellow
Write-Host "SSH Key: $SSH_KEY" -ForegroundColor Yellow
Write-Host ""

# Check if SSH key exists
if (-not (Test-Path $SSH_KEY)) {
    Write-Host "ERROR: SSH key not found at: $SSH_KEY" -ForegroundColor Red
    Write-Host "Please update the SSH_KEY parameter or place the key file at the specified path." -ForegroundColor Yellow
    exit 1
}

# Check PM2 status first
if ($Status) {
    Write-Host "=== PM2 Status ===" -ForegroundColor Cyan
    $statusCmd = "pm2 status transit-driver"
    Invoke-Expression "$sshBase `"$statusCmd`""
    Write-Host ""
}

# Check for errors only
if ($Errors) {
    Write-Host "=== Recent Errors (last $Lines lines) ===" -ForegroundColor Red
    $errorCmd = "pm2 logs transit-driver --lines $Lines --nostream 2>&1 | grep -i 'error\|exception\|failed\|fatal' | tail -$Lines"
    Invoke-Expression "$sshBase `"$errorCmd`""
    Write-Host ""
    Write-Host "=== PM2 Error Logs ===" -ForegroundColor Red
    $pm2ErrorCmd = "pm2 logs transit-driver --err --lines $Lines --nostream"
    Invoke-Expression "$sshBase `"$pm2ErrorCmd`""
    exit 0
}

# Show recent logs
Write-Host "=== Recent Logs (last $Lines lines) ===" -ForegroundColor Cyan
if ($Follow) {
    Write-Host "Following logs (Ctrl+C to stop)..." -ForegroundColor Yellow
    $logCmd = "pm2 logs transit-driver --lines $Lines"
    Invoke-Expression "$sshBase `"$logCmd`""
} else {
    $logCmd = "pm2 logs transit-driver --lines $Lines --nostream"
    Invoke-Expression "$sshBase `"$logCmd`""
}

Write-Host ""
Write-Host "=== Additional Checks ===" -ForegroundColor Cyan
Write-Host ""

# Check PM2 process info
Write-Host "PM2 Process Info:" -ForegroundColor Yellow
$infoCmd = "pm2 describe transit-driver 2>&1 | grep -E '(status|uptime|restarts|memory|cpu|error)'"
Invoke-Expression "$sshBase `"$infoCmd`""

Write-Host ""
Write-Host "=== System Resources ===" -ForegroundColor Cyan
$sysCmd = "top -bn1 | head -5"
Invoke-Expression "$sshBase `"$sysCmd`""

Write-Host ""
Write-Host "=== Disk Space ===" -ForegroundColor Cyan
$diskCmd = "df -h | grep -E '(Filesystem|/dev/)'"
Invoke-Expression "$sshBase `"$diskCmd`""

Write-Host ""
Write-Host "=== Network Connections ===" -ForegroundColor Cyan
$netCmd = "netstat -tuln | grep -E '(3000|LISTEN)' | head -10"
Invoke-Expression "$sshBase `"$netCmd`""

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Tips:" -ForegroundColor Yellow
Write-Host "  - Use -Errors to see only errors" -ForegroundColor Gray
Write-Host "  - Use -Follow to tail logs in real-time" -ForegroundColor Gray
Write-Host "  - Use -Status to check PM2 process status" -ForegroundColor Gray
Write-Host "  - Use -Lines 500 to see more lines" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
