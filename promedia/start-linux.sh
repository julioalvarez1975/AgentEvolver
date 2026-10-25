#!/usr/bin/env bash
# ProMedia — doble clic / terminal (Linux) para arrancar hub + web
# y abrir Control en el navegador predeterminado.
# Mantiene la ventana abierta si algo falla.
#
# Uso:
#   ./start-linux.sh
#   o doble clic en Abrir-ProMedia.sh / ProMedia.desktop
# Primera vez: chmod +x start-linux.sh Abrir-ProMedia.sh
#
# Si un atajo del Escritorio abre UI vieja: debe apuntar a ESTE
# promedia/ del repo (después de git pull), no a un clone viejo.

set -e
cd "$(dirname "$0")"

READY_FILE=".promedia-ready-url"
VITE_PORTS="5173 5174 5175 5176 5177 5178"

echo "=========================================="
echo "  ProMedia — carpeta: $(pwd)"
echo "=========================================="
echo ""
echo "AVISO: un alias del Escritorio debe apuntar a esta carpeta"
echo "  promedia/ del repo (no a un clone viejo)."
echo "Dejá esta ventana de Terminal abierta mientras usás ProMedia."
echo ""

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: no se encontró pnpm."
  echo "Instalá Node.js 20+ y luego: npm install -g pnpm"
  echo ""
  read -r -p "Pulsá Enter para cerrar…"
  exit 1
fi

# Liberar hub (:8787) y Vite (5173–5178) solo si el listener parece node/promedia/tsx/vite.
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

rm -f "$READY_FILE"

free_promedia_port 8787
for port in $VITE_PORTS; do
  free_promedia_port "$port"
done
sleep 1 2>/dev/null || sleep 1

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

# Espera a que Control responda (nunca abre bare "/") y usa el puerto real.
open_control_when_ready() {
  local max_wait="${PROMEDIA_OPEN_WAIT_S:-90}"
  local elapsed=0
  local port url
  echo "Cuando hub+web estén listos, se abrirá Control en el navegador…"
  while [ "$elapsed" -lt "$max_wait" ]; do
    if [ -f "$READY_FILE" ]; then
      url=$(tr -d '[:space:]' < "$READY_FILE" 2>/dev/null || true)
      if [ -n "$url" ]; then
        ready=0
        if command -v curl >/dev/null 2>&1; then
          if curl -sf -o /dev/null --connect-timeout 1 "$url" 2>/dev/null; then
            ready=1
          fi
        else
          ready=1
        fi
        if [ "$ready" -eq 1 ]; then
          echo ""
          echo "Abriendo Control → ${url}"
          echo "Dejá esta Terminal abierta. Para detener: Ctrl+C."
          if command -v xdg-open >/dev/null 2>&1; then
            xdg-open "$url" >/dev/null 2>&1 || true
          elif command -v gio >/dev/null 2>&1; then
            gio open "$url" >/dev/null 2>&1 || true
          else
            echo "Abrí manualmente: ${url}"
          fi
          return 0
        fi
      fi
    fi
    for port in $VITE_PORTS; do
      if command -v curl >/dev/null 2>&1; then
        if curl -sf -o /dev/null --connect-timeout 1 "http://127.0.0.1:${port}/control" 2>/dev/null; then
          url="http://localhost:${port}/control"
          echo ""
          echo "Abriendo Control → ${url}"
          echo "Dejá esta Terminal abierta. Para detener: Ctrl+C."
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
        # Sin curl: probar con bash /dev/tcp (solo puerto; aún abrimos /control).
        if (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
          url="http://localhost:${port}/control"
          echo ""
          echo "Abriendo Control → ${url}"
          echo "Dejá esta Terminal abierta. Para detener: Ctrl+C."
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
  echo "AVISO: no se detectó Control a tiempo."
  echo "Mirás en los logs la línea [dev] ready — Control http://… y abrila."
  echo "También podés abrir open-control.html (prueba 5173–5178) o ProMedia-Control.url."
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
