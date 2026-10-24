#!/usr/bin/env bash
# ProMedia — doble clic / terminal (Linux) para arrancar hub + web
# y abrir Control en el navegador predeterminado.
# Mantiene la ventana abierta si algo falla.
#
# Uso:
#   ./start-linux.sh
#   o doble clic en Abrir-ProMedia.sh / ProMedia.desktop
# Primera vez: chmod +x start-linux.sh Abrir-ProMedia.sh

set -e
cd "$(dirname "$0")"

echo "=========================================="
echo "  ProMedia — carpeta: $(pwd)"
echo "=========================================="
echo ""

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: no se encontró pnpm."
  echo "Instalá Node.js 20+ y luego: npm install -g pnpm"
  echo ""
  read -r -p "Pulsá Enter para cerrar…"
  exit 1
fi

# Liberar hub (:8787) y Vite (:5173) solo si el listener parece node/promedia/tsx/vite.
free_promedia_port() {
  local port="$1"
  local pids pid cmd
  pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  elif command -v ss >/dev/null 2>&1; then
    # ss: extraer pids de listeners en el puerto
    pids=$(ss -ltnp "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u || true)
  elif command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "${port}/tcp" 2>/dev/null || true)
  fi
  if [ -z "$pids" ]; then
    return 0
  fi
  for pid in $pids; do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    case "$cmd" in
      *promedia*|*tsx*|*vite*|*@promedia/hub*|*concurrently*)
        echo "Cerrando instancia anterior en puerto ${port}… (PID ${pid})"
        kill "$pid" 2>/dev/null || true
        ;;
      *)
        echo "AVISO: el puerto ${port} está ocupado por otro proceso (PID ${pid})."
        echo "  $cmd"
        echo "  Si es un ProMedia viejo: kill ${pid}"
        ;;
    esac
  done
}

free_promedia_port 8787
free_promedia_port 5173
# Dar tiempo a que el SO suelte el socket
sleep 0.4 2>/dev/null || sleep 1

if [ ! -d node_modules ] || [ ! -f node_modules/.modules.yaml ]; then
  echo "Instalando dependencias (pnpm install)…"
  pnpm install || {
    echo ""
    echo "ERROR: pnpm install falló."
    read -r -p "Pulsá Enter para cerrar…"
    exit 1
  }
  echo ""
fi

# Espera a que Vite responda y abre Control (puerto real, no asume 5173).
open_control_when_ready() {
  local max_wait="${PROMEDIA_OPEN_WAIT_S:-90}"
  local elapsed=0
  local port url
  echo "Cuando hub+web estén listos, se abrirá Control en el navegador…"
  while [ "$elapsed" -lt "$max_wait" ]; do
    for port in 5173 5174 5175 5176 5177 5178; do
      if command -v curl >/dev/null 2>&1; then
        if curl -sf -o /dev/null --connect-timeout 1 "http://127.0.0.1:${port}/" 2>/dev/null; then
          url="http://localhost:${port}/control"
          echo ""
          echo "Abriendo Control → ${url}"
          if command -v xdg-open >/dev/null 2>&1; then
            xdg-open "$url" >/dev/null 2>&1 || true
          elif command -v gio >/dev/null 2>&1; then
            gio open "$url" >/dev/null 2>&1 || true
          else
            echo "Abrí manualmente: ${url}"
          fi
          return 0
        fi
      else
        # Sin curl: probar con bash /dev/tcp
        if (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
          url="http://localhost:${port}/control"
          echo ""
          echo "Abriendo Control → ${url}"
          if command -v xdg-open >/dev/null 2>&1; then
            xdg-open "$url" >/dev/null 2>&1 || true
          else
            echo "Abrí manualmente: ${url}"
          fi
          return 0
        fi
      fi
    done
    sleep 1
    elapsed=$((elapsed + 1))
  done
  echo ""
  echo "AVISO: no se detectó Vite a tiempo."
  echo "Mirás en los logs la línea [dev] ready — Control http://… y abrila."
  echo "También podés abrir ProMedia-Control.url (asume :5173) o open-control.html."
  return 0
}

open_control_when_ready &
OPENER_PID=$!

cleanup_opener() {
  kill "$OPENER_PID" 2>/dev/null || true
}
trap cleanup_opener EXIT INT TERM

echo "Arrancando hub + web (pnpm dev)…"
echo "Esperá la línea [dev] ready — ahí está la URL REAL de Control (puede no ser :5173)."
echo "Hub health: http://localhost:8787/health"
echo "Una sola instancia a la vez. Para detener: Ctrl+C en esta ventana."
echo ""

pnpm dev || {
  cleanup_opener
  echo ""
  echo "ERROR: pnpm dev terminó con fallo."
  echo "¿Estás en la carpeta correcta? Debe ser …/AgentEvolver/promedia"
  echo "Ruta actual: $(pwd)"
  echo ""
  echo "Si ves EADDRINUSE / puerto en uso:"
  echo "  ss -ltnp 'sport = :8787'   # o: lsof -nP -iTCP:8787 -sTCP:LISTEN"
  echo "  ss -ltnp 'sport = :5173'"
  echo "  kill <PID>"
  echo "Luego volvé a abrir start-linux.sh (o Abrir-ProMedia.sh)."
  read -r -p "Pulsá Enter para cerrar…"
  exit 1
}

cleanup_opener
read -r -p "ProMedia se detuvo. Pulsá Enter para cerrar…"
