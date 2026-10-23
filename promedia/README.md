# ProMedia

Proyección multimedia para **culto y evento**. Monorepo MVP en `promedia/` (la raíz del repo es AgentEvolver).

## Cómo arrancar (Julio — Control + Output)

```bash
cd promedia
pnpm install
pnpm build
pnpm dev
```

Esto levanta en paralelo:

| Servicio | URL | Puerto |
|----------|-----|--------|
| **Web (Control / Output)** | http://localhost:5173 | **5173** |
| **Hub (API + WS)** | http://localhost:8787 | **8787** |

### Ver Control y Output

1. Abre **http://localhost:5173/control**
2. Pulsa **Crear sesión**
3. Pulsa **Abrir salida** (o abre http://localhost:5173/output?code=`CÓDIGO`)
4. Arrastra la ventana de Output al 2.º monitor / proyector → **Pantalla completa**
5. Añade texto / imagen / vídeo / YouTube → **Go Live**

Atajos en Control (fuera de inputs): `G` Go Live · `O` Abrir salida · `L`/`B`/`C`/`N` escenas · `1`/`2`/`3` temas · `←`/`→` slides.

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
