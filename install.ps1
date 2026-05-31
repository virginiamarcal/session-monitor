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
Copy-Item "$src\version.json"    "$dest\version.json"    -Force
Write-Host "  [OK] Arquivos copiados para $dest" -ForegroundColor Green

# 2. Garante que o diretório do perfil PowerShell existe
$profileDir = Split-Path $profile_
if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Force $profileDir | Out-Null }

# 3. (Re)escreve o bloco no perfil — idempotente e auto-corretivo.
#    Remove qualquer bloco Session Monitor anterior (inclusive versões antigas
#    que abriam o navegador a cada terminal) antes de gravar a versão atual.
$startMarker = "# >>> Session Monitor Dashboard >>>"
$endMarker   = "# <<< Session Monitor Dashboard <<<"

$block = @"

$startMarker
# Só age em terminais INTERATIVOS. Shells -NonInteractive / -Command
# (Claude Code, automações, scripts) são ignorados — caso contrário o
# navegador abriria uma aba a cada comando executado.
if ([Environment]::UserInteractive -and
    ([Environment]::GetCommandLineArgs() -notcontains '-NonInteractive') -and
    ([Environment]::GetCommandLineArgs() -notcontains '-Command')) {
    `$dashServer = "$dest\server.js"
    `$dashUrl    = "http://localhost:4242"
    `$portOcupada = (netstat -an | Select-String "4242.*LISTENING")
    if (-not `$portOcupada) {
        # Servidor estava parado: sobe e abre o navegador UMA vez.
        Start-Process "node" -ArgumentList `$dashServer -WindowStyle Hidden
        Start-Sleep -Milliseconds 800
        Start-Process `$dashUrl
    }
    # Se o servidor já estava no ar, NÃO reabre o navegador.
}
$endMarker
"@

# Preserva o conteúdo do perfil, descartando blocos Session Monitor anteriores.
$kept = New-Object System.Collections.Generic.List[string]
if (Test-Path $profile_) {
    $inBlock = $false
    foreach ($line in @(Get-Content -Path $profile_)) {
        $t = $line.Trim()
        if ($t -eq $startMarker) { $inBlock = $true;  continue }   # bloco novo: início
        if ($t -eq $endMarker)   { $inBlock = $false; continue }   # bloco novo: fim
        if ($t -eq "# Session Monitor Dashboard") { break }        # bloco legado: ia até o fim
        if (-not $inBlock) { $kept.Add($line) }
    }
}
# Tira linhas em branco sobrando no fim antes de regravar.
while ($kept.Count -gt 0 -and [string]::IsNullOrWhiteSpace($kept[$kept.Count - 1])) {
    $kept.RemoveAt($kept.Count - 1)
}

Set-Content -Path $profile_ -Value $kept  -Encoding UTF8
Add-Content -Path $profile_ -Value $block -Encoding UTF8
Write-Host "  [OK] Auto-start (re)configurado no perfil PowerShell" -ForegroundColor Green

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
