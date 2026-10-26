# ProMedia

Proyección multimedia para **culto y evento**. Ventana **Control** (operador) + ventana **Output** (pantalla completa en el 2.º monitor / proyector). Monorepo en `promedia/` (la raíz del repo es AgentEvolver).

## Arquitectura

| Pieza | Rol |
|-------|-----|
| `apps/web` | SPA **Vite + React** — rutas `/control`, `/output`, `/` |
| `apps/hub` | **Hono** + WebSocket — sesiones, assets, Biblia, playlists |
| `@promedia/shared` | Protocolo, temas, transiciones, tipos de sesión |
| `@promedia/item-types` | Registry Preview / En vivo / Output (texto, imagen, vídeo, YouTube, Biblia, presentación) |
| `@promedia/media` | Almacenamiento local (disco) + adapter S3 stub |
| `@promedia/i18n` | Locales **ES · EN · PT · FR · ZH** |

```text
promedia/
  apps/web/          # Control + Output
  apps/hub/          # API :8787 + WS
  packages/shared/
  packages/item-types/
  packages/media/
  packages/i18n/
  scripts/dev.mjs    # pnpm dev (hub + web)
  portable/          # empaquetado runnable
```

| Servicio | Puerto | URL típica |
|----------|--------|------------|
| **Hub** (API + WS) | **8787** | http://localhost:8787 |
| **Web** (Vite) | **5173+** | http://localhost:5173 (o 5174–5178 si 5173 está ocupado) |

Abrí siempre **`/control`**, no `/` (la Home es solo un enlace mínimo).

---

## Cómo arrancar

**Importante:** trabajá **dentro de `promedia/`**, no en `~` ni solo en la raíz del repo.

### Mac — doble clic (Finder)

**Deps subtítulos (una vez):** `brew install yt-dlp ffmpeg whisper-cpp` — luego reiniciá ProMedia (el hub también busca en `/opt/homebrew/bin` y `/usr/local/bin`).

1. Finder → carpeta del repo → **`promedia`**
2. Doble clic en **`start-mac.command`** o **`Abrir-ProMedia.command`** (mismo arranque; el segundo es atajo con nombre claro)
3. Primera vez en macOS: clic derecho → **Abrir**
4. Dejá la Terminal abierta; al estar listos hub+web, el script abre **Control** (`/control`) en el puerto real de Vite
5. Si copiaste el atajo al Escritorio y ves UI vieja: tras `git pull`, **volvé a copiar** `Abrir-ProMedia.command` desde esta carpeta
6. Enlaces fijos: **`open-control.html`** (prueba 5173–5178) o **`ProMedia-Control.url`**

### Windows — doble clic (Explorador)

1. Explorador → **`promedia`**
2. Doble clic en **`start-windows.bat`** o **`Abrir-ProMedia.bat`** (llaman a **`start-windows.ps1`**)
3. Requisitos: Node.js 20+ y `npm install -g pnpm` (una vez). Si falta `node_modules`, el script corre `pnpm install`
4. Abre **Control** en el puerto real (5173–5178)

### Linux — doble clic / terminal

1. En **`promedia/`**, la primera vez: `chmod +x start-linux.sh Abrir-ProMedia.sh`
2. Doble clic o `./start-linux.sh` / `./Abrir-ProMedia.sh`
3. Atajo: **`ProMedia.desktop`** (editá `Exec`/`Path` si lo copiás al Escritorio; en GNOME: “Permitir iniciar” / Mark as Trusted)
4. Misma lógica: lock, `pnpm install` si hace falta, `pnpm dev`, abre **`/control`**

### Terminal (cualquier SO)

```bash
cd /ruta/a/AgentEvolver/promedia
pnpm install   # primera vez (o si falta node_modules)
pnpm dev
```

Ejemplo (Mac, Escritorio):

```bash
cd ~/Desktop/AgentEvolver/promedia && pnpm dev
```

`pnpm dev` usa **concurrently** con logs `[hub]` / `[web]`. Espera a que **este** hub loguee `listening` y `/health` responda; imprime la URL **real** de Vite. Si 5173 está ocupado, puede ser **5174+** — usá esa URL, no asumas 5173.

### Una sola instancia

No abras dos `pnpm dev` / dos launchers a la vez.

Los launchers usan un lock (`.promedia-dev.lock`):

- **Primera** instancia: puede liberar puertos ProMedia en 8787 y 5173–5178, luego arranca
- **Segunda** instancia: **no** mata puertos (evita SIGTERM 143 sobre Vite) y te avisa que ya hay una corriendo

`pnpm dev` solo tumba el proceso hermano si hay **failure** (no si Vite sale 0 tras un SIGTERM externo).

Si ves `EADDRINUSE` / “puerto ya está en uso”:

```bash
# Mac / Linux
lsof -nP -iTCP:8787 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
kill <PID>
```

```bat
REM Windows (cmd)
netstat -ano -p tcp | findstr :8787
netstat -ano -p tcp | findstr :5173
taskkill /PID <PID> /F
```

Comprobar el hub:

```bash
curl -s http://localhost:8787/health
```

### Fallback: dos terminales

```bash
cd /ruta/a/AgentEvolver/promedia

# Terminal A
pnpm dev:hub

# Terminal B
pnpm dev:web
```

Sin hub, Control muestra que el hub no está corriendo (con reintento).

### Solo hub + smoke

```bash
pnpm --filter @promedia/hub start   # :8787
node scripts/smoke-hub-ws.mjs
```

---

## Flujo operador (Control → Output)

1. Abrí **http://localhost:PUERTO/control** (o dejá que el launcher lo abra)
2. Con hub sano, Control **crea o reanuda** la sesión — el pie debe decir **WS conectado**
3. Pulsá **Proyectar** (barra de herramientas): abre/enfoca **Salida**, intenta el **2.º monitor** (Chrome: Window Management) y pide **pantalla completa**
4. Si el navegador no puede forzar monitor/fullscreen: arrastrá Salida al proyector y usá **Pantalla completa** / F11
5. Armá el **Guion** → seleccioná un ítem → **En vivo** (o doble clic / `G`)

**Límite del navegador:** popup de Salida y 2.º monitor requieren gesto del usuario (y a veces permiso). Por eso la sesión/WS se preparan solas; **Proyectar** completa ventanas + fullscreen.

Si el popup está bloqueado, aparece un aviso con enlace **Abrir salida**. El atajo `O` también abre/enfoca Salida (sin botón dedicado en la toolbar).

---

## Control UI (actual)

### Cabecera

1. **Fila título** — solo marca + **«ProMedia | Control»** (sin botones)
2. **Barra de herramientas** debajo (peers planos; sin grupos fijos):
   - **Proyectar** — abre Output + fullscreen (busy: «Iniciando…»)
   - **Biblioteca** — mediateca local (canciones, biblias, textos, presentaciones, imágenes, vídeos)
   - **Agente subtítulos** — ASR local offline (archivos o YouTube vía yt-dlp); el idioma de subtítulos sigue el selector Idioma
   - **Idioma** — UI ES / EN / PT / FR / ZH
   - **Acerca de** — diálogo con crédito **`@2026 JulioAlvarez75`**
   - Escenas + **Tema** — presets, fondos, efectos de transición
   - Banner **Google Ad Manager** (derecha; placeholder si no hay env)

### Guion

- **Añadir** (multiarchivo: imagen, vídeo, PDF/XML/texto) + menú: Enlace/YouTube, Biblia, Texto en blanco, **Crear canción**, **Biblioteca** (también en la barra de herramientas)
- Drag ⋮⋮ (y ↑/↓), multi-selección + **Quitar seleccionados**
- Guardar / Cargar guiones con nombre
- Botón **En vivo** / doble clic = enviar al live
- Tipos: texto, imagen, vídeo, YouTube, Biblia, presentación (solo visualización)

### Biblioteca

Entrada principal: botón **Biblioteca** en la barra de herramientas (junto a **Proyectar**). También en Guion → menú **Añadir**.

Mediateca **local** del hub (no nube en esta fase). Datos en `promedia/data/library/` (gitignore).

| Categoría | Contenido |
|-----------|-----------|
| Canciones | Editor de título / artista / estrofas → texto proyectable (chunks de 5 líneas). También import Quelea `.qsp` / `.xml` |
| Biblias | Traducciones importadas (XML/XMM/PDF) → solo en disco local; se eligen en Guion → Biblia |
| Textos | Guardados en biblioteca para reutilizar |
| Presentaciones | Import `.pptx` `.ppt` `.ppsx` `.potx` `.odp` `.pdf` → diapositivas para ←/→. **Sin** macros (`.pptm`/`.ppsm`). Sin edición nativa |
| Imágenes / Vídeos | Subida y reuso en el Guion |

API hub: `/api/v1/library/*` (listar, subir, canciones, importar Biblias / QSP, añadir al Guion de la sesión).

#### Importar cancionero Quelea (.qsp) (local, no Git)

Los packs Quelea (`.qsp` = ZIP de XML de canciones) y canciones con **copyright** **no se commitean** al repo. Quedan en `promedia/data/library/` (gitignore).

Tras el **primer arranque** del hub se crean `promedia/data/library/songs/import/` (y `files/`, `bibles/import/`).

1. Abrí **Biblioteca → Canciones**
2. Pulsá **Importar QSP** y elegí el `.qsp` (p. ej. `CancioneroFeb2026.qsp`) **o** copiá `.qsp` / `.xml` a `promedia/data/library/songs/import/` y usá **Importar carpeta local**
3. Las canciones aparecen en la lista; **Añadir al Guion** las proyecta como texto (estrofas → slides)

Reimportar el mismo pack actualiza por título+autor (no duplica). API: `POST /api/v1/library/songs/import` (multipart) y `POST /api/v1/library/songs/import-folder`.

#### Importar Biblias (local, no Git)

Las traducciones con **copyright** (RV1960, NVI, NTV, TLA, LBLA, DHH, …) **no se commitean** al repo. El operador las coloca en su máquina.

Tras el **primer arranque** del hub, ProMedia crea sola la carpeta `promedia/data/library/bibles/import/` (y `files/`) — no hace falta `mkdir` a mano. Alternativa: subir desde **Biblioteca → Biblias** (no requiere esa carpeta).

1. Copiá los `.xml` / `.xmm` / PDF a `promedia/data/library/bibles/import/` **o** subilos en **Biblioteca → Biblias**
2. Pulsá **Importar carpeta local** en Biblioteca (o reiniciá el hub si acabás de copiar archivos)
3. En **Guion → Biblia**, elegí la versión (etiqueta `[local]`) y buscá el pasaje

También: `node scripts/import-bibles.mjs` (crea `bibles/import` si falta y llama a `POST /api/v1/library/bibles/import-folder`). El texto canónico queda en `data/library/files/*/canon.json` (gitignore).

### Vista previa + En vivo

- Columna izquierda: **Guion** + monitor **En vivo**
- Columna derecha: **Vista previa** (toolbar: anterior / siguiente / **En vivo**)
- Preview ≠ live hasta **En vivo**
- Transporte de vídeo: play/pausa, ±10 s, inicio/fin, scrubber (tiempos en overlay); mute opcional en preview
- Con **Agente subtítulos** activo, las cues sincronizadas con `mediaClock` se ven en **Vista previa**, **En vivo** y **Output**

### Agente de subtítulos (IA local)

Subtítulos automáticos **100 % locales** (sin API keys ni STT/MT en la nube). YouTube: el hub descarga **solo audio** con `yt-dlp` y luego corre el mismo Whisper local (el iframe de YouTube sigue solo en Output).

**Dependencias en el PATH (Mac)**

```bash
brew install yt-dlp ffmpeg whisper-cpp
```

Reiniciá el hub tras instalar. Overrides: `FFMPEG_PATH`, `YT_DLP_PATH`, `WHISPER_CPP_PATH`.

En **macOS** (y en cualquier host con `whisper-cli` en el PATH) el hub usa **whisper.cpp como ASR principal**; `@huggingface/transformers` (ONNX) queda como respaldo. Sin `whisper-cli`, intenta ONNX y, ante `Unable to get model file path or buffer`, vuelve a pedir `brew install whisper-cpp`.

**Cómo usarlo**

1. Arrancá ProMedia (`pnpm dev` / launcher) y abrí **Control**
2. Añadí un **vídeo/audio local** o un **YouTube** público al Guion
3. Pulsá **Agente subtítulos** en la barra (junto a **Proyectar** / **Idioma**; queda activo). El idioma de subtítulos **sigue el selector Idioma** de Control (ES / EN / PT / FR / ZH)
4. Poné el ítem **En vivo** (o dejalo seleccionado en Vista previa):
   - Local: `ffmpeg` → WAV → **whisper.cpp** (`whisper-cli` + ggml-tiny) (+ MT opcional)
   - YouTube: `yt-dlp` (bestaudio) → caché → mismo pipeline ASR
5. Las captions aparecen **arriba del vídeo** (estilo cancionero / `FittedTextStage`), alineadas al mismo `mediaClock`, con anticipación configurable (1,5–3 s, default 2 s) para leer la letra antes de cantarla. Tamaño SM–XL y anticipación van junto al botón **Agente subtítulos**. Canciones de Biblioteca con diapositivas ←/→ siguen siendo manuales (la anticipación solo aplica a cues con tiempo del agente).

**Primera ejecución (descarga de modelos)**

- Con **whisper-cpp** instalado: red **una vez** para bajar `ggml-tiny.bin` a `promedia/data/models/whisper/` (gitignore). Luego offline.
- Sin whisper-cli: intenta ONNX `Xenova/whisper-tiny` en `data/models/` (a menudo falla en Mac con `model_path_error` → instalá `brew install whisper-cpp`).
- Errores claros en Control: `whisper_cpp_missing` / `model_download_failed` / `model_path_error`.
- Caché de cues por asset: `promedia/data/subtitles/cache/`
- WAV temporal: `promedia/data/subtitles/wav/`
- Audio YouTube cacheado: `promedia/data/subtitles/youtube-cache/` (gitignore; no commitear)
- Requiere **`ffmpeg`** + **`whisper-cli`** (o `FFMPEG_PATH` / `WHISPER_CPP_PATH`); YouTube también **`yt-dlp`**
- Backend: `SUBTITLE_ASR_BACKEND=auto|whisper_cpp|transformers` (default `auto` = preferir whisper-cli)

**Traducción (enfoque por etapas)**

- **(A)** Siempre: cues ASR con marcas de tiempo (idioma de origen / Whisper)
- **(B)** Si hay modelo Marian local para el par (o vía inglés), el hub traduce a `targetLang`
- Si no hay modelo para el par: se muestran las cues de origen y un aviso `mt_source_only` (sin inventar traducción)

**Límites**

- Archivos locales (`sourceKind: file`) y YouTube público (`sourceKind: youtube`)
- Vídeos con restricción de edad / privados / bloqueados: error claro en el tooltip (sin cloud STT)
- Canciones de Biblioteca **solo texto** (sin pista de audio): el agente no hace STT (aviso)
- Primera transcripción puede tardar (descarga + CPU); las siguientes del mismo archivo / videoId usan caché

Env útiles: `SUBTITLE_MODELS_ROOT`, `SUBTITLE_DATA_ROOT`, `SUBTITLE_ASR_BACKEND`, `SUBTITLE_WHISPER_MODEL`, `SUBTITLE_WHISPER_REVISION`, `FFMPEG_PATH`, `YT_DLP_PATH`, `WHISPER_CPP_PATH`

### Tema (zona TEMA)

| Escenas | Temas | Transiciones en Output (0,5 s fijo) |
|---------|-------|-------------------------------------|
| Normal · Logo · Negro · Clear | Oscuro · Claro · Acento (+ fondo/texto/alineación/tamaño) | Ninguna/corte · Difuminado · Blur · Pixelado |

**Fondos animados (packs fijos):** Aurora · Brasas · Océano · Rejilla · Azul abstracto. Son vídeos en bucle (mute) versionados en el repo bajo `apps/web/public/theme-backgrounds/` (MP4 + WebM). Aparecen siempre en el desplegable de fondos; además se pueden **subir** vídeos/imágenes propios (sesión). El patrón de puntos se dibuja encima del vídeo.

Las transiciones aplican al cambiar el ítem **en vivo** en Output.

### Biblia

Botón **Biblia** en el Guion: libro/capítulo/rango o referencia (`Juan 3:16-17`) + versión. Proyección en slides de texto (máx. **5 líneas**).

| Id | Nombre | Idioma | Fuente | Licencia |
|----|--------|--------|--------|----------|
| `rvr1909` | Reina-Valera 1909 | ES (por defecto) | [Midvash](https://api.midvash.com) | Dominio público |
| `pdt` | Palabra de Dios para ti / Todos | ES | Midvash **o** import local | CC BY 4.0 / licencia del archivo |
| `kjv` | King James Version | EN | [bible-api.com](https://bible-api.com) | Public domain |
| `asv` | American Standard Version | EN | bible-api.com | Public domain |
| `rv1960`, `nvi`, `ntv`, `tla`, `lbla`, `blh`, `nbh`, `bls`, `dhh`, … | Import local | ES | Biblioteca / carpeta `bibles/import/` | Copyright del editor — solo uso local |

**RVR1960 / NVI / etc. no vienen en el repo** (copyright). Importalas localmente (arriba). Fallback mínimo offline si falla la API remota (no es canon completo).

### Atajos (fuera de inputs)

| Tecla | Acción |
|-------|--------|
| `G` | Enviar en vivo (ítem seleccionado) |
| `O` | Abrir / enfocar Salida |
| `L` / `B` / `C` | Logo / Negro / Clear |
| `N` o `Esc` | Escena normal |
| `1` / `2` / `3` | Temas Oscuro / Claro / Acento |
| `←` / `→` | Slide anterior / siguiente (texto / Biblia / presentación en vivo) |

**Proyectar** no tiene atajo de teclado — solo el botón de la toolbar.

En desarrollo el **WebSocket** va directo al hub (`ws://<host>:8787`); REST por proxy Vite (`/api`).

---

## Output

- Pantalla completa en el proyector / 2.º display
- Sincroniza reproducción con **`mediaClock`** del hub (play/pausa/seek desde Control)
- **YouTube:** una sola iframe en Output (Preview/En vivo muestran thumb + transporte; no segundo embed)
- **Subtítulos** (agente activo): overlay inferior sincronizado con `mediaClock` (mismo instante que Vista previa)
- Escenas Logo / Negro / Clear son overlays (no cortan el reloj de medios)
- Query útiles: `?code=…`, `?token=…`, `?autofullscreen=1`

---

## Variables de entorno

Ver `.env.example`. Las más relevantes:

| Variable | Uso |
|----------|-----|
| `PORT` | Puerto del hub (default **8787**) |
| `VITE_HUB_URL` / `VITE_HUB_WS_URL` | Override REST/WS (en DEV el WS suele ir a `:8787` directo) |
| `VITE_GAM_NETWORK_CODE` | Código de red Google Ad Manager |
| `VITE_GAM_AD_UNIT` | Ad unit del banner en Control (hace falta **ambas** GAM; si faltan → placeholder) |
| `PROMEDIA_MODE` | `lan` (default) / `cloud` / `portable` |
| `MEDIA_ADAPTER` / `MEDIA_ROOT` / `PLAYLISTS_PATH` | Storage local |
| `S3_*` | Stub S3-compatible (fallback a disco si incompleto) |
| `SUBTITLE_MODELS_ROOT` / `SUBTITLE_DATA_ROOT` | Modelos Whisper/MT y caché de cues (default `data/models`, `data/subtitles`) |
| `SUBTITLE_WHISPER_MODEL` | Modelo ASR local (default `Xenova/whisper-tiny`) |
| `SUBTITLE_WHISPER_REVISION` | Revisión HF del modelo (default `main`) |
| `FFMPEG_PATH` | Binario ffmpeg para extraer audio (default `ffmpeg`) |
| `YT_DLP_PATH` | Binario yt-dlp para audio de YouTube (default `yt-dlp`) |

Tamaños GAM del header: 970×90, 728×90, 320×50, 320×100 (+ fluid).

---

## Actualizar y troubleshooting

```bash
cd /ruta/a/AgentEvolver
git pull
cd promedia
# Si el launcher del Escritorio es copia vieja, volvé a copiar Abrir-ProMedia.*
```

| Problema | Qué hacer |
|----------|-----------|
| UI vieja / Home en vez de Control | Abrí **`/control`**; no uses solo `/`. Hard refresh: **Cmd+Shift+R** (Mac) / **Ctrl+Shift+R** |
| Puerto ocupado | Matá el PID (tabla arriba) o cerrá la Terminal anterior |
| Vite no es 5173 | Leé la URL `Local:` en la Terminal o el archivo `.promedia-ready-url` |
| Hub caído | `curl -s http://localhost:8787/health` — debe ser JSON `ok: true` |
| Segunda ventana del launcher | Esperado: lock; no mata Vite (fix SIGTERM 143) |
| Popup bloqueado | Permití popups o usá el enlace **Abrir salida** / atajo `O` |

---

## Qué incluye el producto (resumen)

- Sesión + WS + código corto / enlace opaco
- Guion multi-tipo con drag, multi-select, guardar/cargar
- Texto: import PDF (hub), XML, `.txt`/`.md` → slides
- Preview ≠ live; transporte vídeo + `mediaClock`
- **Agente subtítulos** local (Whisper tiny + MT opcional; archivos o YouTube vía yt-dlp)
- Escenas, temas, transiciones 0,5 s en Output
- i18n ES · EN · PT · FR · ZH
- Banner GAM opcional en Control

## Deploy dual

| Modo | Cómo |
|------|------|
| **LAN / Docker** | `docker compose -f docker/compose.yml up --build` |
| **Cloud** | `PROMEDIA_MODE=cloud` + opcional `MEDIA_ADAPTER=s3` + `S3_*` |
| **Portable** | Ver `portable/README.md` — `pnpm build` + `./portable/pack.sh` |

## QA iglesia / evento

Ver `scripts/qa-church-event.md`.

## Límites conocidos

- **Subtítulos:** archivos locales + YouTube público (audio local con `yt-dlp`); privados/edad restringida fallan con aviso; primera corrida descarga modelos a `data/models/` (CPU, puede tardar)
- Assets de archivo son **por sesión**; al cargar un guion guardado, ítems de archivo sin asset se omiten (texto/YouTube sí)
- Adapter S3 = stub (escribe en disco hasta cablear SDK completo)
- Multi-monitor / fullscreen depende del navegador (Chrome Window Management; Safari/Firefox suelen exigir arrastrar + clic)
- Biblia: sin canon offline completo; sin Stage / remoto / import Quelea (fase 2)
