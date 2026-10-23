# ProMedia

Proyección multimedia (culto / evento). Monorepo MVP — **subtarea 5: tipo `image` + storage local**.

> Colocado en `promedia/` porque la raíz del repositorio ya contiene AgentEvolver.

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

### Smoke UI (subtarea 5)

1. `/control` → **Crear sesión**.
2. **+ Texto** sigue funcionando (preview → Go Live).
3. **+ Imagen** → elige jpeg/png/webp/gif → aparece en playlist.
4. Selecciona imagen → Preview (cambia `fit` contain/cover/fill **sin** empujar Output).
5. **Go Live** → Live + **Abrir salida** muestran la misma imagen/fit.
6. Aviso UI si el archivo es muy grande (>20 MB); **sin tope duro**.
7. Logo / Negro / Clear siguen **disabled**.

### Smoke protocolo

```bash
pnpm --filter @promedia/hub start &
node scripts/smoke-hub-ws.mjs
```

Assets en disco: `data/media/<sessionId>/` (ignorado por git). Env opcional: `MEDIA_ROOT`.

## Límites actuales

**Incluye:** registry text+image, upload local, serve por sesión, fit editable.

**No incluye:** video, youtube, S3, temas, scene modes activos, SQLite.
