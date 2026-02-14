# Check environment variables on EC2 for transit_driver
# Usage: .\check-ec2-env.ps1 [-EC2_IP "x.x.x.x"] [-SSH_KEY "path/to/key.pem"]

param(
    [string]$EC2_IP = "3.110.204.165",
    [string]$SSH_KEY = "C:\Users\adity\Downloads\transit-driver-key.pem",
    [switch]$ShowValues = $false  # Set to true to print env values (⚠️ secrets!)
)

$sshBase = "ssh -i `"$SSH_KEY`" -o StrictHostKeyChecking=no ec2-user@$EC2_IP"

Write-Host "=== Transit Driver EC2 Environment Check ===" -ForegroundColor Cyan
Write-Host "EC2: $EC2_IP | Key: $SSH_KEY`n" -ForegroundColor Gray

# 1. Check if .env exists and list var names (not values)
Write-Host "1. .env file - variable names:" -ForegroundColor Yellow
$cmd1 = "cd ~/transit_driver 2>/dev/null && if [ -f .env ]; then grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env | cut -d= -f1 | sort; else echo '.env not found'; fi"
Invoke-Expression "$sshBase `"$cmd1`""

# 2. Check PM2 process env (shows what the running app actually sees)
Write-Host "`n2. PM2 process env - variable names (transit-driver):" -ForegroundColor Yellow
$cmd2 = "pm2 env transit-driver 2>/dev/null | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' | cut -d= -f1 | sort -u | head -50"
Invoke-Expression "$sshBase `"$cmd2`""

# 3. Key vars check (masked)
Write-Host "`n3. Key vars present (masked):" -ForegroundColor Yellow
$cmd3 = "cd ~/transit_driver 2>/dev/null && grep -E '^(DATABASE_URL|JWT_SECRET|BACKEND_URL|INTERNAL_API_SECRET|REDIS_URL|FRONTEND_APP_URL|PORT|NODE_ENV)=' .env 2>/dev/null | cut -d= -f1"
$setVars = Invoke-Expression "$sshBase `"$cmd3`"" | ForEach-Object { $_.Trim() }
$allVars = @("DATABASE_URL","JWT_SECRET","BACKEND_URL","INTERNAL_API_SECRET","REDIS_URL","FRONTEND_APP_URL","PORT","NODE_ENV")
foreach ($v in $allVars) {
    $status = if ($setVars -contains $v) { "SET" } else { "NOT SET" }
    Write-Host "  $v : $status"
}

if ($ShowValues) {
    Write-Host "`n⚠️  Full .env (SECRETS EXPOSED):" -ForegroundColor Red
    Invoke-Expression "$sshBase 'cat ~/transit_driver/.env 2>/dev/null || echo .env not found'"
}
