# ProMedia

Proyección multimedia (culto / evento). Monorepo MVP — **subtarea 3: shell Control + Output**.

> Colocado en `promedia/` porque la raíz del repositorio ya contiene AgentEvolver y otro contenido no relacionado.

## Layout

```text
promedia/
  apps/web          Vite + React + TS — shell /control (3 zonas) + /output (fullscreen)
  apps/hub          Hono + TS — REST sesión + WS + GET /health
  packages/shared   tipos de protocolo (snapshot, envelope, seq)
  packages/item-types  registry vacío
  packages/media    contrato storage stub
  packages/i18n     ES (+ stubs EN PT FR zh-CN) — sin selector aún
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

### Smoke UI (subtarea 3 — shell)

1. Abrir http://localhost:5173/control → **Crear sesión**.
2. Ver código corto + enlace opaco; footer muestra WS + `seq`.
3. Clic **Abrir salida** → nueva ventana `/output?code=…` (si el popup se bloquea, usa la URL del aviso).
4. Arrastra la ventana de salida al 2.º monitor → **Pantalla completa** (o F11).
5. Segunda pestaña `/output?code=…` debe unirse a la misma sesión.
6. Controles **Go Live / Logo / Negro / Clear** visibles pero deshabilitados.
7. **No** hay botón Touch / “Probar sync” en la shell.

### REST + WS (curl / script)

```bash
curl -s http://localhost:8787/health

curl -s -X POST http://localhost:8787/api/v1/sessions \
  -H 'content-type: application/json' \
  -d '{"mode":"lan"}'

# headless protocolo (subtarea 2)
pnpm --filter @promedia/hub start &
node scripts/smoke-hub-ws.mjs
```

Credential WS = **ticket** emitido en create/join (no reusar código/token en el handshake WS).

## Scripts

| Comando | Qué hace |
|---------|----------|
| `pnpm install` | Workspaces |
| `pnpm dev` | Web + hub en paralelo |
| `pnpm build` | Build packages + apps |
| `pnpm dev:web` / `pnpm dev:hub` | Solo una app |

## Sesión

- **Código corto** + **accessToken** opaco: join REST; **sin caducidad**.
- “Abrir salida” usa **código corto** (`/output?code=`).
- Estado **en memoria** (reinicio del hub = sesiones perdidas).
- Envelope hub → clientes con `seq` monótono; catch-up vía `client.resync`.

## Docker (LAN smoke)

```bash
cd promedia
docker compose -f docker/compose.yml up --build
curl http://localhost:8787/health
```

## Portable

Ver [portable/README.md](./portable/README.md).

## Límites actuales

**Incluye:** scaffold + hub/WS + shell Control 3 zonas + Output fullscreen + Abrir salida.

**No incluye:** playlist/ítems, Go Live funcional, scene modes activos, i18n selector (subt. 4), medios, YouTube, SQLite.
