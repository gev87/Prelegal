# Build and start Prelegal.
#
# The database inside the container is created from scratch on every start —
# do not add a volume for it, or that stops being true.
#
# See scripts/_lib.sh for the same logic in bash; PowerShell gets its own
# copy because nothing here can be shared across the two shells.

$ErrorActionPreference = "Stop"

$Image = "prelegal"
$Container = "prelegal"
$Port = 8000

function Test-DockerRunning {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "Docker is not installed. See https://docs.docker.com/get-docker/" -ForegroundColor Red
        exit 1
    }

    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Docker is installed but not running. Start Docker Desktop and try again." -ForegroundColor Red
        exit 1
    }
}

# Refuses to start only when something *else* holds the port. A container of
# ours is not a conflict — it is the thing about to be replaced.
function Test-PortFree {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $listener) { return }

    $ours = docker ps --filter "name=^$Container$" --format "{{.Names}}"
    if ($ours) { return }

    Write-Host "Port $Port is already in use by something that is not Prelegal." -ForegroundColor Red
    Write-Host "Stop it, or run stop-windows.ps1 if a previous container is lingering."
    exit 1
}

# Reports a URL that actually answers, rather than one that merely has a
# container behind it.
function Wait-UntilReady {
    foreach ($attempt in 1..30) {
        try {
            Invoke-WebRequest -Uri "http://localhost:$Port/healthz" -UseBasicParsing -TimeoutSec 2 *> $null
            Write-Host "Prelegal is ready at http://localhost:$Port"
            return
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    Write-Host "Prelegal started but is not answering yet." -ForegroundColor Red
    Write-Host "Check the logs with: docker logs $Container"
    exit 1
}

Test-DockerRunning
Test-PortFree

Set-Location (Join-Path $PSScriptRoot "..")

# Always rebuilt. The layer cache makes an unchanged rebuild near-instant,
# and it removes the whole class of "why is it still running the old code".
docker build -t $Image .
if ($LASTEXITCODE -ne 0) { Write-Host "docker build failed." -ForegroundColor Red; exit 1 }

# Clears a container left behind by a crash or a bare `docker stop`, so that
# starting twice in a row never fails with "name already in use".
docker rm -f $Container *> $null

# The assistant's key, from the environment or from an untracked .env file at
# the repository root. Absent is not an error: the product runs without it,
# and only the chat panel reports itself unavailable.
$Key = $env:OPENROUTER_API_KEY
if (-not $Key -and (Test-Path ".env")) {
    # Only this one name, and only the part after the first "=", so a value
    # containing "=" survives and nothing else in the file is executed.
    $Line = Select-String -Path ".env" -Pattern '^OPENROUTER_API_KEY=' | Select-Object -First 1
    if ($Line) { $Key = ($Line.Line -split '=', 2)[1].Trim().Trim('"') }
}

if (-not $Key) {
    Write-Host "No OPENROUTER_API_KEY found, so the AI chat will be unavailable." -ForegroundColor Yellow
    Write-Host "Set it in your shell or in .env - see .env.example."
}

# Passed at run time, never baked in with ENV: a key in a layer is a key in
# every copy of the image.
docker run -d --name $Container -p "${Port}:8000" -e "OPENROUTER_API_KEY=$Key" $Image *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "docker run failed." -ForegroundColor Red; exit 1 }

Wait-UntilReady
