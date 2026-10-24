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
echo "Cuando veas [web] listo, abrí: http://localhost:5173/control"
echo "Hub health: http://localhost:8787/health"
echo "Para detener: Ctrl+C en esta ventana."
echo ""

pnpm dev || {
  echo ""
  echo "ERROR: pnpm dev terminó con fallo."
  echo "¿Estás en la carpeta correcta? Debe ser …/AgentEvolver/promedia"
  echo "Ruta actual: $(pwd)"
  read -r -p "Pulsá Enter para cerrar…"
  exit 1
}

read -r -p "ProMedia se detuvo. Pulsá Enter para cerrar…"
