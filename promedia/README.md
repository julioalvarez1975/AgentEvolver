# ProMedia

Proyección multimedia (culto / evento). Monorepo MVP — **subtarea 2: hub sesión + WebSocket + seq**.

> Colocado en `promedia/` porque la raíz del repositorio ya contiene AgentEvolver y otro contenido no relacionado.

## Layout

```text
promedia/
  apps/web          Vite + React + TS — /control y /output (smoke stubs)
  apps/hub          Hono + TS — REST sesión + WS + GET /health
  packages/shared   tipos de protocolo (snapshot, envelope, seq)
  packages/item-types  registry vacío
  packages/media    contrato storage stub
  packages/i18n     placeholders ES EN PT FR zh-CN
  docker/           Dockerfile + compose (LAN smoke)
  portable/         esqueleto carpeta runnable (sin zip completo)
  scripts/          smoke headless hub/WS
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
| Web (Vite) | http://localhost:5173 | **5173** | opcional `VITE_HUB_URL` (por defecto proxy same-origin → hub) |
| Hub (Hono) | http://localhost:8787 | **8787** | `PORT` (default `8787`) |

### Smoke UI (subtarea 2)

1. Abrir http://localhost:5173/control → **Crear sesión** → copiar código / token.
2. Abrir http://localhost:5173/output (otra pestaña) → unir por código o token → ver `seq`.
3. En control: **Touch (mutar seq)** → ambas salidas reciben `session.updated`.
4. En output: **Desconectar** → touch desde control → **Reconectar + resync** → catch-up o snapshot.

### REST + WS (curl / script)

```bash
# health
curl -s http://localhost:8787/health

# create
curl -s -X POST http://localhost:8787/api/v1/sessions \
  -H 'content-type: application/json' \
  -d '{"mode":"lan"}'

# join by code
curl -s -X POST http://localhost:8787/api/v1/sessions/join \
  -H 'content-type: application/json' \
  -d '{"code":"ABCD","role":"output"}'
```

Headless smoke (hub en :8787):

```bash
pnpm --filter @promedia/hub start &
node scripts/smoke-hub-ws.mjs
```

WS URL (tras create/join):  
`ws://localhost:8787/api/v1/ws?sessionId=…&role=control|output&credential=<wsTicket>`

Credential WS = **ticket** emitido en create/join (no reusar código/token en el handshake WS).

## Scripts

| Comando | Qué hace |
|---------|----------|
| `pnpm install` | Workspaces |
| `pnpm dev` | Web + hub en paralelo |
| `pnpm build` | Build packages + apps |
| `pnpm dev:web` / `pnpm dev:hub` | Solo una app |

## Sesión (subtarea 2)

- **Código corto** + **accessToken** opaco: join REST; **sin caducidad**.
- Estado **en memoria** (reinicio del hub = sesiones perdidas).
- Envelope hub → clientes con `seq` monótono; control muta (`session.touch`); output solo lectura + `client.resync`.
- Buffer de ~100 eventos para catch-up; si el gap es grande → `session.snapshot`.

## Docker (LAN smoke)

```bash
cd promedia
docker compose -f docker/compose.yml up --build
curl http://localhost:8787/health
```

## Portable

Ver [portable/README.md](./portable/README.md).

## Límites actuales

**Incluye:** scaffold + sesión in-memory + WS + seq + smoke stubs.

**No incluye:** playlist, medios, Go Live, shell de producto Control/Output (subtarea 3), SQLite, i18n UI.
