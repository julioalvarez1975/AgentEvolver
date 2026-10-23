# ProMedia — carpeta portable

Empaquetado runnable (hub + web) para PCs sin instalar un servidor de hosting.

## Empaquetar (MVP)

Desde `promedia/`:

```bash
pnpm build
./portable/pack.sh
```

Esto deja en `portable/dist/`:

```text
portable/dist/
  hub/          # apps/hub/dist + package hints
  web/          # apps/web/dist (estáticos)
  data/         # media + playlists (vacío)
  start.sh      # arranca hub sirviendo API; abre nota para servir web
  README.md
```

## Arranque

```bash
cd portable/dist
./start.sh
```

Por defecto:

- Hub: `http://localhost:8787` (`PROMEDIA_MODE=portable`)
- Web: servir `web/` con cualquier static server, p. ej.  
  `npx --yes serve web -l 5173`  
  o abrir el hub documentado en el script.

LAN sigue siendo el camino preferido con `pnpm dev` en el monorepo.
