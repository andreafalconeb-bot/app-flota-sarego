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
  entran solo aquí. El personal de SAREGO (B2B interno o vendedor /
  supervisor de la retail) ve solo las empresas que tiene asignadas; la
  gestión (admin, gerente y oficina B2B) ve todas y asigna desde
  "Empresa" (migración 0129).
- Neumáticos: cada uno tiene serial propio (`numero`, lo pone la base);
  la marca a fuego es opcional y se repite. Las facturas de neumáticos
  de SAREGO las carga el personal asignado y el cliente las recibe
  (`src/components/facturas.tsx`). Las invitaciones pasan por la Edge Function
  `flota-invitar` del repo retail.
- Base local: `src/lib/datos.ts` (IndexedDB + cola de cambios +
  sincronización completa). Los cálculos están en `src/lib/calculos.ts`
  con pruebas. Si se agrega una tabla `flota_*` con datos de la empresa,
  se suma a `TABLAS` y `ORDEN_COLECCIONES` en `src/lib/tipos.ts`.
- Análisis de aceite usado: los hace SAREGO en la B2B y llegan a
  `flota_analisis` al exportar la cuenta ganada y después solos
  (migración 0140). El cliente solo los ve (`src/components/analisis.tsx`).
- Costos y neumáticos (Andrea, 27–28/nov/2026), en `src/lib/calculos.ts`:
  costo de operación por km u hora de cada activo (`costoOperacion`);
  proyección de cada neumático por regla de tres km/mm hasta el
  remanente de **1,5 mm** (sustituir o renovar si la carcasa está buena,
  `proyeccionNeumatico`); dinero perdido por presión con la curva TMC
  (`perdidaPorPresion`).
- Inspección de neumáticos: la lectura de km u horas es **obligatoria
  antes** de medir. Cada neumático muestra profundidad de nuevo, la
  última y la proyección con la medida que se anota (`evaluarMedida`).
  Si rinde por debajo de su historial o del promedio, hay desgaste
  irregular, duales con más de 3 mm de diferencia o la profundidad
  **sube** respecto a la anterior (ilógico), se pide revisar en el
  momento y marcar lo encontrado antes de guardar. Se aconseja hacerla
  con tablet, frente al vehículo.
- Todo texto de la interfaz en español de Venezuela, tuteando.
- **Publicación:** Andrea (23/nov/2026) autorizó que Claude publique solo
  los cambios de esta app, igual que la B2B: abrir el PR, unirlo a
  `main` cuando `tsc`, las pruebas y el build pasen, revisar que el
  deploy a Cloudflare termine en verde y avisarle qué se publicó. Si el
  cambio necesita una migración en `app-retail-lubricantes`, se une
  primero esa (y se espera su workflow) y después la de aquí.
