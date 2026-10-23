# ProMedia

Proyección multimedia (culto / evento). Monorepo MVP — **subtarea 1: scaffold**.

> Colocado en `promedia/` porque la raíz del repositorio ya contiene AgentEvolver y otro contenido no relacionado.

## Layout

```text
promedia/
  apps/web          Vite + React + TS — stubs /control y /output
  apps/hub          Hono + TS — GET /health
  packages/shared   tipos placeholder
  packages/item-types  registry vacío
  packages/media    contrato storage stub
  packages/i18n     placeholders ES EN PT FR zh-CN
  docker/           Dockerfile + compose (LAN smoke)
  portable/         esqueleto carpeta runnable (sin zip completo)
```

## Requisitos

- Node.js ≥ 20
- [pnpm](https://pnpm.io) (Corepack: `corepack enable`)

## Desarrollo local

```bash
cd promedia
pnpm install
pnpm dev
```

| Servicio | URL | Puerto | Env |
|----------|-----|--------|-----|
| Web (Vite) | http://localhost:5173 | **5173** | `VITE_HUB_URL` (default `http://localhost:8787`) |
| Hub (Hono) | http://localhost:8787 | **8787** | `PORT` (default `8787`) |

Rutas stub web: `/control`, `/output` (páginas mínimas “ProMedia — scaffold”).

Health hub:

```bash
curl http://localhost:8787/health
```

Scripts:

| Comando | Qué hace |
|---------|----------|
| `pnpm install` | Workspaces |
| `pnpm dev` | Web + hub en paralelo |
| `pnpm build` | Build packages + apps |
| `pnpm dev:web` / `pnpm dev:hub` | Solo una app |

## Docker (LAN smoke)

```bash
cd promedia
docker compose -f docker/compose.yml up --build
curl http://localhost:8787/health
```

## Portable

Ver [portable/README.md](./portable/README.md). Esqueleto de carpetas + notas de empaquetado; **sin** zip runnable completo en esta subtarea.

## Límites de esta subtarea

**Incluye:** monorepo compilable, stubs de rutas, health, packages tipados, Docker + portable skeleton, i18n placeholders.

**No incluye:** sesión, playlist, WebSocket, upload/medios, registry de tipos reales, UI de control/salida, selector de idioma.

Siguientes subtareas: ver diseño MVP en el store del proyecto (`docs/promedia-mvp-diseno.md`).
