# ProMedia — arranque Windows (PowerShell)
# Uso: doble clic en start-windows.bat o Abrir-ProMedia.bat (recomendada).
# También: clic derecho → Ejecutar con PowerShell en este archivo.
#
# Arranca hub + web (pnpm dev) y abre Control en el navegador predeterminado.
# Detecta el puerto real de Vite (5173–5178), espera /control (nunca bare "/").
# Primera vez (o sin node_modules): corre pnpm install solo.
#
# Si un atajo del Escritorio abre UI vieja: debe apuntar a ESTE
# promedia\ del repo (después de git pull), no a un clone viejo.

$ErrorActionPreference = "Continue"
Set-Location -LiteralPath $PSScriptRoot

$ReadyFile = Join-Path (Get-Location) ".promedia-ready-url"
$VitePorts = @(5173, 5174, 5175, 5176, 5177, 5178)

Write-Host "=========================================="
Write-Host "  ProMedia — carpeta: $(Get-Location)"
Write-Host "=========================================="
Write-Host ""
Write-Host "AVISO: un alias del Escritorio debe apuntar a esta carpeta"
Write-Host "  promedia\ del repo (no a un clone viejo)."
Write-Host "Dejá esta ventana abierta mientras usás ProMedia."
Write-Host ""

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: no se encontró pnpm."
  Write-Host "Instalá Node.js 20+ y luego: npm install -g pnpm"
  Write-Host ""
  Read-Host "Pulsá Enter para cerrar"
  exit 1
}

# Liberar hub (:8787) y Vite (5173–5178) solo si el listener parece node/promedia/tsx/vite.
function Free-ProMediaPort([int]$Port) {
  $pids = @()
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
      $pids = @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
    }
  } catch { }

  if ($pids.Count -eq 0) {
    $netstat = & netstat -ano -p tcp 2>$null
    if ($netstat) {
      foreach ($line in $netstat) {
        if ($line -match "LISTENING" -and $line -match ":$Port\s+") {
          $parts = ($line -split "\s+") | Where-Object { $_ -ne "" }
          $last = $parts[-1]
          if ($last -match "^\d+$") { $pids += [int]$last }
        }
      }
      $pids = @($pids | Select-Object -Unique)
    }
  }

  foreach ($procId in $pids) {
    $cmd = ""
    try {
      $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue).CommandLine
    } catch { }
    if (-not $cmd) {
      try { $cmd = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName } catch { }
    }

    if ($cmd -match "promedia|tsx|vite|@promedia/hub|concurrently") {
      Write-Host "Cerrando instancia anterior en puerto ${Port}… (PID ${procId})"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    } else {
      Write-Host "AVISO: el puerto ${Port} está ocupado por otro proceso (PID ${procId})."
      if ($cmd) { Write-Host "  $cmd" }
      Write-Host "  Si es un ProMedia viejo: taskkill /PID ${procId} /F"
    }
  }
}

# URL vieja de un arranque anterior — no abrir hasta que este run la reescriba.
Remove-Item -LiteralPath $ReadyFile -Force -ErrorAction SilentlyContinue

Free-ProMediaPort 8787
foreach ($p in $VitePorts) { Free-ProMediaPort $p }
Start-Sleep -Seconds 1

$modulesYaml = Join-Path (Get-Location) "node_modules\.modules.yaml"
if (-not (Test-Path "node_modules") -or -not (Test-Path $modulesYaml)) {
  Write-Host "Instalando dependencias (pnpm install)…"
  & pnpm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: pnpm install falló."
    Read-Host "Pulsá Enter para cerrar"
    exit 1
  }
  Write-Host ""
}

# Opener en proceso aparte (equivalente al & de bash en start-mac.command).
$waitS = if ($env:PROMEDIA_OPEN_WAIT_S) { $env:PROMEDIA_OPEN_WAIT_S } else { "90" }
$readyPathEsc = $ReadyFile.Replace("'", "''")
$openerScript = @"
`$maxWait = $waitS
`$elapsed = 0
`$readyFile = '$readyPathEsc'
`$ports = @(5173, 5174, 5175, 5176, 5177, 5178)
function Test-Url(`$u) {
  try {
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
      & curl.exe -sf -o NUL --connect-timeout 1 `$u 2>`$null
      if (`$LASTEXITCODE -eq 0) { return `$true }
    }
  } catch {}
  try {
    `$req = [System.Net.WebRequest]::Create(`$u)
    `$req.Timeout = 1000
    `$req.Method = 'GET'
    `$resp = `$req.GetResponse()
    `$resp.Close()
    return `$true
  } catch { return `$false }
}
while (`$elapsed -lt `$maxWait) {
  if (Test-Path -LiteralPath `$readyFile) {
    `$url = (Get-Content -LiteralPath `$readyFile -Raw -ErrorAction SilentlyContinue)
    if (`$url) { `$url = `$url.Trim() }
    if (`$url -and (Test-Url `$url)) {
      Write-Host ""
      Write-Host "Abriendo Control → `$url"
      Write-Host "Dejá esta ventana abierta. Para detener: Ctrl+C."
      Start-Process `$url
      exit 0
    }
  }
  foreach (`$port in `$ports) {
    # Esperar /control (no "/"): HomePage se ve como app "vieja" mínima.
    `$probe = "http://127.0.0.1:`$port/control"
    if (Test-Url `$probe) {
      `$url = "http://localhost:`$port/control"
      Write-Host ""
      Write-Host "Abriendo Control → `$url"
      Write-Host "Dejá esta ventana abierta. Para detener: Ctrl+C."
      Start-Process `$url
      exit 0
    }
  }
  Start-Sleep -Seconds 1
  `$elapsed++
}
Write-Host ""
Write-Host "AVISO: no se detectó Control a tiempo."
Write-Host "Mirás en los logs la línea [dev] ready — Control http://… y abrila."
Write-Host "También podés abrir open-control.html (prueba 5173–5178) o ProMedia-Control.url."
"@

Write-Host "Cuando hub+web estén listos, se abrirá Control en el navegador…"
$openerProc = Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $openerScript) `
  -WindowStyle Hidden `
  -PassThru

function Stop-Opener {
  if ($openerProc -and -not $openerProc.HasExited) {
    Stop-Process -Id $openerProc.Id -Force -ErrorAction SilentlyContinue
  }
}

try {
  Write-Host "Arrancando hub + web (pnpm dev)…"
  Write-Host "Esperá la línea [dev] ready — ahí está la URL REAL de Control (puede no ser :5173)."
  Write-Host "Hub health: http://localhost:8787/health"
  Write-Host "Una sola instancia a la vez. Para detener: Ctrl+C en esta ventana."
  Write-Host ""

  & pnpm dev
  $devExit = $LASTEXITCODE
} finally {
  Stop-Opener
}

if ($devExit -ne 0) {
  Write-Host ""
  Write-Host "ERROR: pnpm dev terminó con fallo."
  Write-Host "¿Estás en la carpeta correcta? Debe ser …\AgentEvolver\promedia"
  Write-Host "Ruta actual: $(Get-Location)"
  Write-Host ""
  Write-Host "Si ves EADDRINUSE / puerto en uso:"
  Write-Host "  netstat -ano -p tcp | findstr :8787"
  Write-Host "  netstat -ano -p tcp | findstr :5173"
  Write-Host "  taskkill /PID <PID> /F"
  Write-Host "Luego volvé a abrir start-windows.bat (o Abrir-ProMedia.bat)."
  Read-Host "Pulsá Enter para cerrar"
  exit 1
}

Read-Host "ProMedia se detuvo. Pulsá Enter para cerrar"
