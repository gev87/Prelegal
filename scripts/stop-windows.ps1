# Stop and remove the Prelegal container.

$ErrorActionPreference = "Stop"

$Container = "prelegal"

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker is not running; nothing to stop."
    exit 0
}

$running = docker ps -a --filter "name=^$Container$" --format "{{.Names}}"
if (-not $running) {
    Write-Host "Prelegal is not running."
    exit 0
}

docker rm -f $Container *> $null
Write-Host "Prelegal stopped."
