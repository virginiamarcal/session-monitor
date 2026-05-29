# Session Monitor — instalador automático
$ErrorActionPreference = 'Stop'

$src      = $PSScriptRoot
$dest     = Join-Path $HOME ".claude\dashboard"
$profile_ = $PROFILE

Write-Host ""
Write-Host "  Instalando Session Monitor..." -ForegroundColor Cyan

# 1. Copia arquivos para ~/.claude/dashboard/
if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force $dest | Out-Null }
Copy-Item "$src\server.js"      "$dest\server.js"      -Force
Copy-Item "$src\dashboard.html" "$dest\dashboard.html" -Force
Write-Host "  [OK] Arquivos copiados para $dest" -ForegroundColor Green

# 2. Garante que o diretório do perfil PowerShell existe
$profileDir = Split-Path $profile_
if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Force $profileDir | Out-Null }

# 3. Adiciona bloco ao perfil (apenas se ainda não estiver lá)
$marker = "# Session Monitor Dashboard"
if (-not (Test-Path $profile_) -or -not (Select-String -Path $profile_ -Pattern $marker -Quiet)) {
    $block = @"

$marker
`$dashServer = "$dest\server.js"
`$dashUrl    = "http://localhost:4242"
`$portOcupada = (netstat -an | Select-String "4242.*LISTENING")
if (-not `$portOcupada) {
    Start-Process "node" -ArgumentList `$dashServer -WindowStyle Hidden
    Start-Sleep -Milliseconds 800
}
Start-Process `$dashUrl
# ───────────────────────────────────────────────────────────────────────────────
"@
    Add-Content -Path $profile_ -Value $block
    Write-Host "  [OK] Auto-start adicionado ao perfil PowerShell" -ForegroundColor Green
} else {
    Write-Host "  [--] Perfil já configurado, pulando" -ForegroundColor Yellow
}

# 4. Inicia o servidor agora
$portOcupada = (netstat -an | Select-String "4242.*LISTENING")
if (-not $portOcupada) {
    Start-Process "node" -ArgumentList "$dest\server.js" -WindowStyle Hidden
    Start-Sleep -Milliseconds 800
}
Start-Process "http://localhost:4242"

Write-Host ""
Write-Host "  Pronto! Dashboard aberto em http://localhost:4242" -ForegroundColor Cyan
Write-Host "  A partir de agora abre automaticamente com cada terminal." -ForegroundColor Cyan
Write-Host ""
