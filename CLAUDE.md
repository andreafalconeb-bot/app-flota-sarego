# Notas para Claude

- Flota SAREGO: app para que los clientes de SAREGO lleven el
  mantenimiento de su flota (`flota.distribuidorasarego.com`). La base es
  la **misma Supabase de la app retail**
  (`andreafalconeb-bot/app-retail-lubricantes`). Los cambios de esquema
  van como migración **en ese repo** (tablas `flota_*`, desde
  `0128_flota_base.sql`), nunca aquí. Las notas de negocio (planes,
  bloqueo, aditivos, cuentas de costo) están en el `CLAUDE.md` de ese
  repo, sección "Flota SAREGO".
- Usuarios: los clientes tienen `profiles.role = 'cliente_externo'` y
  entran solo aquí; el personal de SAREGO (usuarios B2B internos) ve
  todas las empresas. Las invitaciones pasan por la Edge Function
  `flota-invitar` del repo retail.
- Base local: `src/lib/datos.ts` (IndexedDB + cola de cambios +
  sincronización completa). Los cálculos están en `src/lib/calculos.ts`
  con pruebas. Si se agrega una tabla `flota_*` con datos de la empresa,
  se suma a `TABLAS` y `ORDEN_COLECCIONES` en `src/lib/tipos.ts`.
- Todo texto de la interfaz en español de Venezuela, tuteando.
- **Publicación:** Andrea (23/nov/2026) autorizó que Claude publique solo
  los cambios de esta app, igual que la B2B: abrir el PR, unirlo a
  `main` cuando `tsc`, las pruebas y el build pasen, revisar que el
  deploy a Cloudflare termine en verde y avisarle qué se publicó. Si el
  cambio necesita una migración en `app-retail-lubricantes`, se une
  primero esa (y se espera su workflow) y después la de aquí.
