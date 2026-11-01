$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$url = 'http://127.0.0.1:8765/'

try {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
    $serverRunning = $true
} catch {
    $serverRunning = $false
}

if (-not $serverRunning) {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $projectRoot -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

Start-Process -FilePath $url
