# ProMedia — carpeta portable (esqueleto)

Esta carpeta es el **esqueleto** del empaquetado runnable (hub + web) para PCs sin instalar un servidor de hosting.

## Layout previsto

```text
portable/
  hub/          # binario / dist del hub (placeholder)
  web/          # estáticos del build de apps/web (placeholder)
  data/         # SQLite + medios locales (vacío en scaffold)
  README.md     # este archivo
```

## Cómo empaquetar (futuro)

1. `pnpm build` en la raíz del monorepo.
2. Copiar `apps/hub/dist` (+ deps de runtime) → `portable/hub/`.
3. Copiar `apps/web/dist` → `portable/web/`.
4. Documentar un script de arranque (`node hub/...` + servir `web/`).
5. Opcional: zip de la carpeta para distribución.

**Subtarea 1:** solo estructura + este README. **No** hay zip funcional completo ni pipeline de empaquetado aún.
