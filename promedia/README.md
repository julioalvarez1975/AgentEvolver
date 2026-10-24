# ProMedia

Proyección multimedia para **culto y evento**. Monorepo MVP en `promedia/` (la raíz del repo es AgentEvolver).

## Cómo arrancar (Julio — Control + Output)

**Importante:** hay que estar **dentro de la carpeta `promedia`**, no en `~` ni en la raíz del repo sola.

### Mac — doble clic (Finder)

1. Abrí Finder → carpeta del repo → **`promedia`**
2. Doble clic en **`start-mac.command`** o **`Abrir-ProMedia.command`** (mismo arranque; el segundo es un atajo con nombre claro para el Escritorio)
3. Si macOS pregunta, clic derecho → **Abrir** la primera vez
4. Dejá la ventana Terminal abierta; al estar listos hub+web, el script **abre Control** en el navegador (detecta el puerto real de Vite, p. ej. 5173/5174)
5. Enlaces fijos (si el navegador no se abrió solo): **`ProMedia-Control.url`** o **`open-control.html`** → `http://localhost:5173/control` (editá la URL si Vite usó otro puerto o en producción/hosteado)

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
**este** hub loguee `listening` y `/health` responda; si el hub no arranca o el puerto
está ocupado por una instancia vieja, **falla en voz alta** (no declara “ready” con un
hub fantasma). Imprime la URL **real** de Vite (`Local: http://localhost:PUERTO`);
si 5173 está ocupado, puede ser **5174/5175** — abrí esa, no asumas 5173.

**Una sola instancia.** No abras dos `pnpm dev` / dos `start-mac.command` a la vez.
Si ves `EADDRINUSE` o “puerto ya está en uso”, cerrá la ventana anterior o:

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
kill <PID>
```

En Mac, `start-mac.command` intenta cerrar listeners node/promedia en **8787** y **5173**
antes de arrancar (“Cerrando instancia anterior en puerto X…”).

| Servicio | URL | Puerto |
|----------|-----|--------|
| **Web (Control / Output)** | http://localhost:5173 (u otro si Vite lo cambia) | **5173+** |
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

1. Abre **http://localhost:5173/control** (o la URL real que imprima Vite)
2. Al cargar (hub sano), Control **crea o reanuda** la sesión sola — el pie debe decir **WS conectado**
3. Pulsa **Iniciar proyección** (CTA principal, un clic): abre/enfoca **Salida**, intenta colocarla en el **2.º monitor** (Chrome: Window Management / `getScreenDetails` si hay permiso) y pide **pantalla completa**
4. Si el navegador no puede forzar el otro monitor o el fullscreen sin gesto, arrastra la ventana al proyector y pulsa **Pantalla completa** / F11 en Salida
5. **Abrir salida** sigue disponible (abre/enfoca sin re-crear sesión)
6. Añade texto / imagen / vídeo / YouTube → **Go Live**

**Límite del navegador:** no se puede abrir el popup de Salida ni pedir el 2.º monitor sin un gesto del usuario (y a veces sin permiso). Por eso el arranque automático prepara la sesión/WS; el clic en **Iniciar proyección** completa ventanas + fullscreen.

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
- Guion: texto, imagen, vídeo (mp4/webm/mov), YouTube público, **Biblia** (versículos)
- Columna Guion: **Guardar / Cargar**, multi-selección + **Quitar seleccionados**, lista con scroll
- Texto: importar **PDF** (parse en hub), **XML** o **.txt/.md** a slides (límites en UI); editor manual intacto
- Preview ≠ live hasta Go Live; `mediaClock` sync
- Scene modes: normal / logo / negro / clear
- Temas: Oscuro / Claro / Acento + editor simple
- Guardar / cargar playlists con nombre (SavedPlaylist)
- Modo cloud vía env (`PROMEDIA_MODE`, adapter S3 stub con fallback local)
- i18n ES · EN · PT · FR · ZH-Hans (cadenas base)

### Biblia (versículos en el Guion)

Botón **Biblia** en la barra del Guion: elegí libro / capítulo / rango de versículos o buscá por referencia (`Juan 3:16-17`), más selector de **versión**. Se inserta como ítem de tipo `bible` (slides de texto; Enviar en vivo / Output como texto).

| Id | Nombre | Idioma | Fuente API | Licencia |
|----|--------|--------|------------|----------|
| `rvr1909` | Reina-Valera 1909 (RV1909) | ES (por defecto) | [Midvash](https://api.midvash.com) | Dominio público |
| `pdt` | Palabra de Dios para ti | ES | Midvash | CC BY 4.0 (mostrar atribución) |
| `kjv` | King James Version | EN | [bible-api.com](https://bible-api.com) | Public domain |
| `asv` | American Standard Version | EN | bible-api.com | Public domain |

**RVR1960 no está incluida:** sigue bajo copyright (Sociedades Bíblicas / UBS) y las APIs libres que usamos no la redistribuyen legalmente. Usá **RV1909** como opción española de dominio público.

Si la API falla: mensaje claro en el diálogo. Hay un **subconjunto local mínimo** (p. ej. Juan 3:16-17 en RV1909/KJV) como fallback; no es un canon offline completo.

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
- **Multi-monitor / fullscreen:** depende del navegador. Chrome puede usar la Window Management API; Safari/Firefox suelen exigir arrastrar la ventana y un clic en pantalla completa. Los popups bloqueados muestran la URL de Salida.
- Biblia: sin canon offline completo (solo subconjunto de emergencia + APIs). Sin Stage / remoto / import Quelea (fase 2).
