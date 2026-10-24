#!/bin/bash
# ProMedia — doble clic en Finder (Mac) para arrancar hub + web.
# Mantiene la ventana abierta si algo falla.

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
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
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

echo "Arrancando hub + web (pnpm dev)…"
echo "Esperá la línea [dev] ready — ahí está la URL REAL de Control (puede no ser :5173)."
echo "Hub health: http://localhost:8787/health"
echo "Una sola instancia a la vez. Para detener: Ctrl+C en esta ventana."
echo ""

pnpm dev || {
  echo ""
  echo "ERROR: pnpm dev terminó con fallo."
  echo "¿Estás en la carpeta correcta? Debe ser …/AgentEvolver/promedia"
  echo "Ruta actual: $(pwd)"
  echo ""
  echo "Si ves EADDRINUSE / puerto en uso:"
  echo "  lsof -nP -iTCP:8787 -sTCP:LISTEN"
  echo "  lsof -nP -iTCP:5173 -sTCP:LISTEN"
  echo "  kill <PID>"
  echo "Luego volvé a abrir start-mac.command."
  read -r -p "Pulsá Enter para cerrar…"
  exit 1
}

read -r -p "ProMedia se detuvo. Pulsá Enter para cerrar…"
