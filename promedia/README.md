# ProMedia

Proyección multimedia (culto / evento). Monorepo MVP — **subtarea 4: registry + tipo `text`**.

> Colocado en `promedia/` porque la raíz del repositorio ya contiene AgentEvolver y otro contenido no relacionado.

## Layout

```text
promedia/
  apps/web          Control 3 zonas + Output fullscreen + editor texto
  apps/hub          REST sesión + WS + playlist in-memory + Go Live
  packages/shared   protocolo (snapshot, playlist, live, seq)
  packages/item-types  registry + módulo text (Preview/Live/Output)
  packages/media    contrato storage stub
  packages/i18n     ES (+ stubs) — sin selector aún
  docker/ · portable/ · scripts/
```

## Desarrollo local

```bash
cd promedia
pnpm install
pnpm build
pnpm dev
```

| Servicio | URL | Puerto |
|----------|-----|--------|
| Web | http://localhost:5173 | **5173** |
| Hub | http://localhost:8787 | **8787** |

### Smoke UI (subtarea 4)

1. `/control` → **Crear sesión**.
2. **+ Texto** → editar título / slides (un textarea por slide) → Guardar.
3. Seleccionar ítem → Preview (navegar slides **no** afecta salida).
4. **Go Live** → panel Live + ventana Output muestran el slide.
5. **Abrir salida** (`/output?code=…`) → prev/next en Live sincroniza Output.
6. Logo / Negro / Clear siguen **disabled**. Sin botón Touch.

### Smoke protocolo

```bash
pnpm --filter @promedia/hub start &
node scripts/smoke-hub-ws.mjs
```

## Límites actuales

**Incluye:** registry `text`, playlist sesión in-memory, Go Live + `live.setSlide`, Output renderer.

**No incluye:** image/video/youtube, temas, scene modes activos, SQLite/SavedPlaylist, selector i18n.
