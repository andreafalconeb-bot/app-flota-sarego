# Flota SAREGO

Mantenimiento de flota para los clientes de Distribuidora SAREGO:
activos con sus lecturas, fluidos (cambios, rellenos, filtros, costo
real por hora o km e intervalo sugerido por SAREGO), combustible y
aditivos (ahorro medido contra una línea base de 2 meses), neumáticos
(marca a fuego, posición, presión y profundidad) y costos por sistema.

- **Web:** `web/` (Vite + React + TypeScript, PWA). Se publica como
  Worker de Cloudflare en `flota.distribuidorasarego.com`.
- **Base:** la Supabase de la app retail, tablas `flota_*` (migraciones
  en `app-retail-lubricantes`).
- **Versiones:** gratis (solo en la nube, hasta 10 activos, funciones
  básicas) y completa (todo, con base local en el equipo y la nube como
  respaldo; se tranca si pasa demasiados días sin sincronizar).

## Desarrollo

```bash
cd web
cp .env.example .env   # URL y anon key de Supabase
npm install
npm run dev
npm test
```

## Publicación

Al unir a `main`, `.github/workflows/deploy.yml` prueba, compila y
despliega con Wrangler. Usa las variables `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` y `CLOUDFLARE_ACCOUNT_ID`, y el secreto
`CLOUDFLARE_API_TOKEN` del repo.
