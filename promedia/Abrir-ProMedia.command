#!/bin/bash
# ProMedia — atajo de escritorio (Mac).
# Igual que start-mac.command: arranca hub + web y abre Control.
# Podés copiar este archivo al Escritorio o al Dock (alias).

cd "$(dirname "$0")"
exec bash "./start-mac.command"
