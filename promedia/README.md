# ProMedia

Proyección multimedia para **culto y evento**. Monorepo MVP en `promedia/` (la raíz del repo es AgentEvolver).

## Cómo arrancar (Julio — Control + Output)

**Importante:** hay que estar **dentro de la carpeta `promedia`**, no en `~` ni en la raíz del repo sola.

### Mac — doble clic (Finder)

1. Abrí Finder → carpeta del repo → **`promedia`**
2. Doble clic en **`start-mac.command`**
3. Si macOS pregunta, clic derecho → **Abrir** la primera vez
4. Dejá la ventana abierta; cuando diga que la web está lista, abrí http://localhost:5173/control

### Terminal (cualquier SO)

```bash
cd /ruta/a/AgentEvolver/promedia
pnpm install   # solo la primera vez (o si falta node_modules)
pnpm dev
```

Ejemplo si el repo está en el Escritorio del Mac:

```bash
cd ~/Desktop/AgentEvolver/promedia && pnpm dev
```

`pnpm dev` usa **concurrently** y etiqueta los logs `[hub]` / `[web]`. Espera a que
`http://localhost:8787/health` responda; si el hub no arranca, **falla en voz alta**.
En Control, si el hub está apagado verás un banner grande en español (no solo “WS desconectado”).

| Servicio | URL | Puerto |
|----------|-----|--------|
| **Web (Control / Output)** | http://localhost:5173 | **5173** |
| **Hub (API + WS)** | http://localhost:8787 | **8787** |

Comprueba el hub:

```bash
curl -s http://localhost:8787/health
```

### Fallback: dos terminales

Si `pnpm dev` falla o prefieres procesos separados (siempre desde `promedia/`):

```bash
cd /ruta/a/AgentEvolver/promedia

# Terminal A
pnpm dev:hub

# Terminal B
pnpm dev:web
```

Luego `curl -s http://localhost:8787/health` debe devolver JSON `ok: true`.
Sin hub, Control muestra: *“El hub no está corriendo…”* con botón para reintentar.

### Ver Control y Output

1. Abre **http://localhost:5173/control**
2. Pulsa **Crear sesión** — el pie debe decir **WS conectado** y un **seq** ≥ 0
3. Pulsa **Abrir salida** (o abre http://localhost:5173/output?code=`CÓDIGO`)
4. Arrastra la ventana de Output al 2.º monitor / proyector → **Pantalla completa**
5. Añade texto / imagen / vídeo / YouTube → **Go Live**

Atajos en Control (fuera de inputs): `G` Go Live · `O` Abrir salida · `L`/`B`/`C`/`N` escenas · `1`/`2`/`3` temas · `←`/`→` slides.

En desarrollo el navegador conecta el **WebSocket directo al hub** (`ws://<host>:8787`);
REST sigue por el proxy de Vite (`/api`). El hub debe estar en marcha.

### Solo hub + smoke

```bash
pnpm --filter @promedia/hub start   # :8787
node scripts/smoke-hub-ws.mjs
```

## Qué incluye el MVP

- Sesión + WS + código corto / enlace opaco
- Playlist: texto, imagen, vídeo (mp4/webm/mov), YouTube público
- Preview ≠ live hasta Go Live; `mediaClock` sync
- Scene modes: normal / logo / negro / clear
- Temas: Oscuro / Claro / Acento + editor simple
- Guardar / cargar playlists con nombre
- Modo cloud vía env (`PROMEDIA_MODE`, adapter S3 stub con fallback local)
- i18n ES · EN · PT · FR · ZH-Hans (cadenas base)

## Deploy dual

| Modo | Cómo |
|------|------|
| **LAN / Docker** | `docker compose -f docker/compose.yml up --build` |
| **Cloud env** | `PROMEDIA_MODE=cloud` + opcional `MEDIA_ADAPTER=s3` + `S3_*` (stub → fallback disco si incompleto) |
| **Portable** | Ver `portable/README.md` — `pnpm build` + script de empaquetado |

Env útiles: `PORT`, `MEDIA_ROOT`, `PLAYLISTS_PATH`, `PROMEDIA_MODE`, `MEDIA_ADAPTER`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

## QA iglesia / evento

Ver `scripts/qa-church-event.md`.

## Límites conocidos

- Assets de archivo son **por sesión**; al cargar una playlist guardada, ítems de archivo sin asset se omiten (texto/YouTube sí).
- Adapter S3 = stub (escribe en disco local hasta cablear SDK completo); LAN siempre funciona.
- Sin Biblia / Stage / remoto / import Quelea (fase 2).
