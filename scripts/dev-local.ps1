$ErrorActionPreference = 'Stop'

Write-Host 'Starting PostgreSQL, Redis, and Elasticsearch...' -ForegroundColor Cyan
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed to start.' }

Write-Host 'Applying database migrations...' -ForegroundColor Cyan
$env:DATABASE_URL = 'postgresql://reachinbox:reachinbox@localhost:5432/reachinbox?schema=public'
npm run db:deploy
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }

$root = (Get-Location).Path
$backendCommand = "Set-Location '$root'; npm --prefix backend run dev"
$frontendCommand = "`$env:VITE_DEV_AUTH_BYPASS='false'; Set-Location '$root'; npm --prefix frontend run dev -- --host 127.0.0.1 --port 3000"

Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand
Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCommand

Write-Host ''
Write-Host 'ReachInbox is starting:' -ForegroundColor Green
Write-Host '  Frontend: http://127.0.0.1:3000/'
Write-Host '  Backend:  http://localhost:3001/health'
Write-Host '  Queues:   http://localhost:3001/admin/queues'
Write-Host ''
Write-Host 'Close the two opened terminal windows to stop the app.' -ForegroundColor Yellow
