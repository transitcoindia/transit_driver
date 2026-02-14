# Set INTERNAL_API_SECRET and BACKEND_URL on EC2 transit_driver
# Usage: .\set-ec2-driver-env.ps1 [-InternalApiSecret "xxx"] [-BackendUrl "https://..."]
# If not provided, reads from transit_backend/.env

param(
    [string]$EC2_IP = "3.110.204.165",
    [string]$SSH_KEY = "C:\Users\adity\Downloads\transit-driver-key.pem",
    [string]$InternalApiSecret = "",
    [string]$BackendUrl = ""
)

$backendEnvPath = Join-Path $PSScriptRoot "..\transit_backend\.env"

function Get-EnvValue($path, $key) {
    if (-not (Test-Path $path)) { return $null }
    $line = Get-Content $path -ErrorAction SilentlyContinue | Where-Object { $_ -match "^${key}=(.*)$" } | Select-Object -First 1
    if ($line -match "=(.+)$") {
        $val = $matches[1].Trim()
        if ($val -match '^["''](.+)["'']$') { $val = $matches[1] }
        return $val
    }
    return $null
}

# Resolve values
if (-not $InternalApiSecret) {
    $InternalApiSecret = Get-EnvValue $backendEnvPath "INTERNAL_API_SECRET"
}
if (-not $InternalApiSecret) {
    Write-Host "INTERNAL_API_SECRET not found. Set it in transit_backend/.env or pass -InternalApiSecret" -ForegroundColor Red
    exit 1
}

if (-not $BackendUrl) {
    $BackendUrl = Get-EnvValue $backendEnvPath "BACKEND_URL"
}
if (-not $BackendUrl -or $BackendUrl -match "localhost") {
    $BackendUrl = "https://backend.transitco.in"
    Write-Host "Using production BACKEND_URL: $BackendUrl" -ForegroundColor Yellow
}

Write-Host "=== Set transit_driver env on EC2 ===" -ForegroundColor Cyan
Write-Host "EC2: $EC2_IP | BACKEND_URL: $BackendUrl | INTERNAL_API_SECRET: ***" -ForegroundColor Gray

# Escape for bash: wrap in single quotes, escape single quotes as '\''
$esc = { param($s) $s -replace "'", "'\''" }
$escSecret = & $esc $InternalApiSecret
$escUrl = & $esc $BackendUrl

$remoteScript = "cd ~/transit_driver || exit 1; cp .env .env.bak 2>/dev/null || touch .env; grep -v '^INTERNAL_API_SECRET=' .env | grep -v '^BACKEND_URL=' > .env.tmp || true; echo 'INTERNAL_API_SECRET=$escSecret' >> .env.tmp; echo 'BACKEND_URL=$escUrl' >> .env.tmp; mv .env.tmp .env; echo Updated; grep -E '^(INTERNAL_API_SECRET|BACKEND_URL)=' .env; pm2 restart transit-driver; pm2 save"
$sshCmd = "ssh -i `"$SSH_KEY`" -o StrictHostKeyChecking=no ec2-user@$EC2_IP `"$remoteScript`""
Invoke-Expression $sshCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nEnvironment updated and PM2 restarted." -ForegroundColor Green
} else {
    Write-Host "`nFailed." -ForegroundColor Red
    exit 1
}
