import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useEmpresa } from '../lib/empresa'
import { ADITIVOS, COMBUSTIBLES, COMPONENTES, CUENTAS, MEDIDORES, TIPOS, TIPOS_COSTO, TIPOS_SERVICIO, etiqueta } from '../lib/catalogos'
import { PLANTILLAS } from '../lib/ejes'
import { dinero, fecha, fechaHora, hoyISO, numero, textoRestante } from '../lib/formato'
import { AHORRO_PROMETIDO, DIAS_LECTURA, compararAditivo, estadoLectura, costoPorUso, proximoCambio, totalServicio, tramosConsumo, unidadPrincipal } from '../lib/calculos'
import type { Activo, Compartimiento } from '../lib/tipos'
import { FormActivo, FormCarga, FormCompartimiento, FormCosto, FormEstadoInicial, FormLectura, FormServicio } from '../components/formularios'
import { NeumaticosActivo } from '../components/neumaticos'
import { AvisoLectura, FormInactividad, Semana } from '../components/inactividad'
import { Campo, ErrorMsg, Metrica, Pill, Selector, SoloPago, Vacio, mensajeError } from '../components/ui'

const PESTANAS = { fluidos: 'Fluidos', combustible: 'Combustible', neumaticos: 'Neumáticos', costos: 'Costos', lecturas: 'Lecturas', datos: 'Datos' }

export default function ActivoFicha() {
  const { activoId } = useParams()
  const e = useEmpresa()
  const [params, setParams] = useSearchParams()
  const [lectura, setLectura] = useState(false)
  const activo = e.datos.activos.find((a) => a.id === activoId)
  const pestana = (params.get('p') as keyof typeof PESTANAS) || 'fluidos'

  if (!activo) {
    return (
      <Vacio>
        No se encontró el activo. <Link to={`/e/${e.empresa!.id}/activos`}>Volver a la lista</Link>
      </Vacio>
    )
  }

  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="titulo-pagina">
        <div>
          <div className="sec chico"><Link to={`/e/${e.empresa!.id}/activos`}>Activos</Link> /</div>
          <h1>
            {activo.codigo} {!activo.activo && <Pill>De baja</Pill>}
            {activo.activo && activo.en_inactividad && <span className="pill inactivo">En inactividad</span>}
          </h1>
          <div className="sec chico">
            {etiqueta(TIPOS, activo.tipo)} · {[activo.marca, activo.modelo, activo.anio].filter(Boolean).join(' ') || 'sin marca'}
            {activo.placa ? ` · ${activo.placa}` : ''}
          </div>
        </div>
        <div className="fila">
          <div className="metrica" style={{ padding: '6px 12px' }}>
            <div className="v" style={{ fontSize: '1.2rem' }}>
              {activo.medidor !== 'horas' && activo.km_actual != null && `${numero(activo.km_actual)} km`}
              {activo.medidor === 'km_horas' && ' · '}
              {activo.medidor !== 'km' && activo.horas_actual != null && `${numero(activo.horas_actual)} h`}
              {activo.km_actual == null && activo.horas_actual == null && '—'}
            </div>
            <div className="e">{activo.lectura_at ? 'Lectura del ' + fecha(activo.lectura_at) : 'Sin lectura'}</div>
            {(() => {
              const l = estadoLectura(activo)
              return l.estado === 'al_dia' ? (
                <div className="e" title={`Cada ${DIAS_LECTURA} días se pide la lectura`}>
                  <Semana dias={l.dias} /> próxima en {l.faltan} {l.faltan === 1 ? 'día' : 'días'}
                </div>
              ) : null
            })()}
          </div>
          {e.puedeEscribir && <button className="primario" onClick={() => setLectura(true)}>Registrar lectura</button>}
        </div>
      </div>

      {activo.activo && <AvisoLectura activo={activo} onLectura={() => setLectura(true)} />}

      <div className="pestanas" role="tablist">
        {Object.entries(PESTANAS).map(([k, v]) => (
          <button key={k} role="tab" aria-selected={pestana === k} className={pestana === k ? 'activa' : ''} onClick={() => setParams({ p: k }, { replace: true })}>
            {v}
          </button>
        ))}
      </div>

      {pestana === 'fluidos' && <Fluidos activo={activo} />}
      {pestana === 'combustible' && <CombustibleActivo activo={activo} />}
      {pestana === 'neumaticos' && <NeumaticosActivo activo={activo} />}
      {pestana === 'costos' && <CostosActivo activo={activo} />}
      {pestana === 'lecturas' && <Lecturas activo={activo} />}
      {pestana === 'datos' && <Datos activo={activo} />}

      {lectura && <FormLectura activo={activo} abierto onCerrar={() => setLectura(false)} />}
    </div>
  )
}

function unidadTxt(u: 'km' | 'horas') {
  return u === 'km' ? 'km' : 'h'
}

// ------------------------------------------------------------
function Fluidos({ activo }: { activo: Activo }) {
  const e = useEmpresa()
  const [servicio, setServicio] = useState<string | null>(null)
  const [editar, setEditar] = useState<Compartimiento | 'nuevo' | null>(null)
  const [inicial, setInicial] = useState<Compartimiento | null>(null)
  const comps = e.datos.compartimientos.filter((c) => c.activo_id === activo.id)
  const servicios = e.datos.servicios.filter((s) => s.activo_id === activo.id).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const total = costoPorUso(e.datos.servicios, activo)
  const verCostos = e.tiene('costo_por_hora') && !e.reportesBloqueados

  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="fila-entre">
        <div>
          {verCostos && total && (
            <span>
              Costo real de fluidos: <b>{dinero(total.porUnidad)} por {unidadTxt(total.unidad)}</b>{' '}
              <span className="sec chico">({dinero(total.total)} en {numero(total.uso)} {unidadTxt(total.unidad)})</span>
            </span>
          )}
        </div>
        {e.puedeEscribir && (
          <div className="fila">
            <button onClick={() => setEditar('nuevo')}>+ Compartimiento</button>
            <button className="primario" onClick={() => setServicio('')} disabled={!comps.length}>Registrar servicio</button>
          </div>
        )}
      </div>
      {!e.tiene('costo_por_hora') && <SoloPago que="El costo real por hora o por km" />}
      {comps.length === 0 ? (
        <Vacio>Agrega los compartimientos de aceite de este activo (motor, transmisión, hidráulico…).</Vacio>
      ) : (
        <div className="grid grid-2">
          {comps.map((c) => {
            const p = proximoCambio(c, activo, e.datos.servicios)
            const cu = costoPorUso(e.datos.servicios, activo, c.id)
            const u = unidadPrincipal(activo.medidor)
            const sugerido = u === 'km' ? c.sugerido_km : c.sugerido_horas
            return (
              <div
                key={c.id}
                className={'tarjeta pila' + (e.tiene('alarmas') && p.estado === 'vencido' ? ' comp-vencido' : e.tiene('alarmas') && p.estado === 'proximo' ? ' comp-proximo' : '')}
                style={{ margin: 0 }}
              >
                <div className="fila-entre">
                  <h3>{etiqueta(COMPONENTES, c.componente)}</h3>
                  {e.tiene('alarmas') && p.estado === 'vencido' && <Pill tono="critico">Cambio vencido</Pill>}
                  {e.tiene('alarmas') && p.estado === 'proximo' && <Pill tono="alerta">Cambio próximo</Pill>}
                  {e.tiene('alarmas') && p.estado === 'ok' && <Pill tono="ok">Al día</Pill>}
                </div>
                <div className="en-uso">
                  <span className="sec chico">En uso</span>
                  <b>{c.producto ?? 'Sin indicar'}</b>
                  {c.producto && (c.producto_codigo ? <Pill tono="ok">SAREGO</Pill> : <Pill>Otro proveedor</Pill>)}
                  {c.capacidad_l ? <span className="sec chico">· {numero(c.capacidad_l, 1)} L</span> : null}
                </div>
                <span className="chico">
                  Cambia cada {p.intervalo ? `${numero(p.intervalo)} ${unidadTxt(u)}` : '—'}
                  {c.intervalo_dias ? ` o ${c.intervalo_dias} días` : ''}
                </span>
                {p.ultimo ? (
                  <span className="chico sec">
                    Último cambio: {fecha(p.ultimo.fecha)}
                    {p.ultimo[u === 'km' ? 'km' : 'horas'] != null && ` a ${numero(p.ultimo[u === 'km' ? 'km' : 'horas'])} ${unidadTxt(u)}`}
                    {e.tiene('alarmas') && p.restante != null && ` · ${textoRestante(p.restante, u)}`}
                  </span>
                ) : (
                  <div className="aviso chico pila" style={{ gap: 6 }}>
                    <span>Sin cambios registrados. Anota qué tiene y cuánto lleva desde su último cambio para que el próximo se calcule bien.</span>
                    {e.puedeEscribir && (
                      <button className="chico primario" style={{ alignSelf: 'flex-start' }} onClick={() => setInicial(c)}>
                        Anotar el estado actual
                      </button>
                    )}
                  </div>
                )}
                {p.ultimo && e.puedeEscribir && (!c.producto || !p.intervalo) && (
                  <div className="aviso chico pila" style={{ gap: 6 }}>
                    <span>
                      Falta {[!c.producto && 'el fluido que tiene en uso', !p.intervalo && 'cada cuánto se cambia'].filter(Boolean).join(' y ')}
                      {!p.intervalo ? ' para calcular el próximo cambio.' : '.'}
                    </span>
                    <button className="chico primario" style={{ alignSelf: 'flex-start' }} onClick={() => setEditar(c)}>Completar</button>
                  </div>
                )}
                {/* Versión gratis: sin alarmas, solo el dato para verificarlo a mano */}
                {!e.tiene('alarmas') && (p.vence != null || p.venceFecha) && (
                  <span className="chico">
                    Próximo cambio:{p.vence != null && ` a los ${numero(p.vence)} ${unidadTxt(u)}`}
                    {p.vence != null && p.venceFecha && ' o'}
                    {p.venceFecha && ` el ${fecha(p.venceFecha)}`}
                  </span>
                )}
                {e.tiene('intervalo_sugerido') && sugerido && (
                  <div className="aviso chico">
                    <b>SAREGO sugiere cada {numero(sugerido)} {unidadTxt(u)}</b>
                    {c.sugerencia_nota ? `: ${c.sugerencia_nota}` : ''}
                    {c.sugerido_at && <span className="sec"> ({fecha(c.sugerido_at)})</span>}
                  </div>
                )}
                {verCostos && cu && (
                  <span className="chico">
                    Costo: <b>{dinero(cu.porUnidad)} / {unidadTxt(cu.unidad)}</b>
                  </span>
                )}
                {e.puedeEscribir && (
                  <div className="fila">
                    <button className="chico" onClick={() => setServicio(c.id)}>Registrar servicio</button>
                    <button className="chico" onClick={() => setEditar(c)}>Editar</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <section className="tarjeta pila">
        <h2>Historial de servicios</h2>
        {servicios.length === 0 ? (
          <Vacio>Sin servicios.</Vacio>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Qué</th><th>Lectura</th><th>Aceite</th>{!e.reportesBloqueados && <th>Costo</th>}<th /></tr>
              </thead>
              <tbody>
                {servicios.map((s) => {
                  const c = comps.find((x) => x.id === s.compartimiento_id)
                  return (
                    <tr key={s.id}>
                      <td>{fecha(s.fecha)}</td>
                      <td>
                        {etiqueta(TIPOS_SERVICIO, s.tipo)}
                        <div className="sec chico">{c ? etiqueta(COMPONENTES, c.componente) : 'General'}</div>
                      </td>
                      <td className="num chico">{s.km != null && `${numero(s.km)} km`} {s.horas != null && `${numero(s.horas)} h`}</td>
                      <td className="chico">
                        {s.producto ?? '—'}{s.litros ? ` · ${numero(s.litros, 1)} L` : ''}
                        {s.filtros && <div className="sec">Filtros: {s.filtros}</div>}
                      </td>
                      {!e.reportesBloqueados && <td className="num">{dinero(totalServicio(s))}</td>}
                      <td>
                        {e.esAdminEmpresa && (
                          <button className="chico" onClick={() => confirm('¿Borrar este servicio?') && void e.borrar('servicios', s.id)}>Borrar</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {inicial && <FormEstadoInicial activo={activo} comp={inicial} onCerrar={() => setInicial(null)} />}
      {servicio !== null && <FormServicio activo={activo} compId={servicio || undefined} abierto onCerrar={() => setServicio(null)} />}
      {editar && <FormCompartimiento activo={activo} comp={editar === 'nuevo' ? undefined : editar} abierto onCerrar={() => setEditar(null)} />}
    </div>
  )
}

// ------------------------------------------------------------
function CombustibleActivo({ activo }: { activo: Activo }) {
  const e = useEmpresa()
  const [carga, setCarga] = useState(false)
  const [aditivo, setAditivo] = useState(activo.aditivo ?? '')
  const [desde, setDesde] = useState(activo.aditivo_desde ?? '')
  const [error, setError] = useState<string | null>(null)
  const u = unidadPrincipal(activo.medidor)
  const cargas = useMemo(() => e.datos.combustible.filter((c) => c.activo_id === activo.id).sort((a, b) => b.fecha.localeCompare(a.fecha)), [e.datos.combustible, activo.id])
  const tramos = useMemo(() => tramosConsumo(cargas, u), [cargas, u])
  const comparacion = useMemo(
    () =>
      activo.aditivo_desde
        ? compararAditivo({ cargas, costos: e.datos.costos.filter((c) => c.activo_id === activo.id), unidad: u, aditivoDesde: activo.aditivo_desde })
        : null,
    [activo, cargas, e.datos.costos, u],
  )

  if (!e.tiene('combustible')) return <SoloPago que="El control de combustible y aditivos" />

  const consumoTxt = (v: number | null) => (v == null ? '—' : u === 'km' ? `${numero(v, 1)} L/100 km` : `${numero(v, 1)} L/h`)

  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="fila-entre">
        <span className="sec chico">El rendimiento se calcula entre tanques llenos.</span>
        {e.puedeEscribir && <button className="primario" onClick={() => setCarga(true)}>Registrar carga</button>}
      </div>

      <section className="tarjeta pila">
        <h2>Aditivo de combustible</h2>
        <span className="sec chico">
          Se compara el consumo de los 2 meses antes de empezar el aditivo con el consumo desde que se usa. SAREGO espera
          alrededor de {Math.round(AHORRO_PROMETIDO * 100)} % de ahorro de combustible y la mitad del gasto en inyección.
        </span>
        {e.puedeEscribir && (
          <div className="fila" style={{ alignItems: 'flex-end' }}>
            <Campo etiqueta="Aditivo">
              <Selector valor={aditivo} onCambio={setAditivo} opciones={ADITIVOS} vacio="Sin aditivo" />
            </Campo>
            <Campo etiqueta="Desde">
              <input type="date" value={desde} max={hoyISO()} onChange={(x) => setDesde(x.target.value)} />
            </Campo>
            <button
              disabled={aditivo === (activo.aditivo ?? '') && desde === (activo.aditivo_desde ?? '')}
              onClick={() =>
                void e
                  .guardar('activos', { ...activo, aditivo: aditivo || null, aditivo_desde: aditivo ? desde || hoyISO() : null })
                  .catch((x) => setError(mensajeError(x)))
              }
            >
              Guardar
            </button>
          </div>
        )}
        <ErrorMsg error={error} />
        {comparacion && !e.reportesBloqueados && (
          <>
            <div className="grid grid-4">
              <Metrica valor={consumoTxt(comparacion.base.consumo)} etiqueta={`Antes (${comparacion.base.tramos} tramos)`} />
              <Metrica valor={consumoTxt(comparacion.conAditivo.consumo)} etiqueta={`Con aditivo (${comparacion.conAditivo.tramos} tramos)`} />
              <Metrica
                valor={comparacion.ahorro == null ? '—' : `${numero(comparacion.ahorro * 100, 1)} %`}
                etiqueta="Ahorro medido"
                tono={comparacion.ahorro != null && comparacion.ahorro < AHORRO_PROMETIDO * 0.66 ? 'alerta' : undefined}
              />
              <Metrica valor={comparacion.dineroAhorrado == null ? '—' : dinero(comparacion.dineroAhorrado)} etiqueta={`Ahorrado (${numero(comparacion.litrosAhorrados ?? 0)} L)`} />
            </div>
            {comparacion.inyeccionBase != null && (
              <span className="chico">
                Gasto en inyección: {dinero(comparacion.inyeccionBase * (u === 'km' ? 1000 : 100))} cada {u === 'km' ? '1.000 km' : '100 h'} antes,{' '}
                {comparacion.inyeccionCon != null ? dinero(comparacion.inyeccionCon * (u === 'km' ? 1000 : 100)) : '—'} con aditivo
                {comparacion.ahorroInyeccion != null && ` (${numero(comparacion.ahorroInyeccion * 100)} % menos)`}.
              </span>
            )}
            {comparacion.base.tramos === 0 && <div className="aviso alerta">No hay tanques llenos en los 2 meses anteriores al aditivo: falta la línea base.</div>}
          </>
        )}
      </section>

      <section className="tarjeta pila">
        <h2>Cargas</h2>
        {cargas.length === 0 ? (
          <Vacio>Sin cargas registradas.</Vacio>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Litros</th><th>Lectura</th><th>Aditivo</th>{!e.reportesBloqueados && <th>Costo</th>}<th /></tr>
              </thead>
              <tbody>
                {cargas.map((c) => (
                  <tr key={c.id}>
                    <td>{fecha(c.fecha)}</td>
                    <td className="num">{numero(c.litros, 1)} {!c.tanque_lleno && <span className="sec chico">(parcial)</span>}</td>
                    <td className="num chico">{c.km != null && `${numero(c.km)} km`} {c.horas != null && `${numero(c.horas)} h`}</td>
                    <td className="chico">{c.con_aditivo ? etiqueta(ADITIVOS, c.aditivo) + (c.aditivo_ml ? ` · ${c.aditivo_ml} ml` : '') : '—'}</td>
                    {!e.reportesBloqueados && <td className="num">{dinero(c.costo_total)}</td>}
                    <td>{e.esAdminEmpresa && <button className="chico" onClick={() => confirm('¿Borrar esta carga?') && void e.borrar('combustible', c.id)}>Borrar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tramos.length > 0 && (
          <span className="sec chico">
            Rendimiento de los últimos tramos: {tramos.slice(-5).reverse().map((t) => consumoTxt(t.consumo)).join(' · ')}
          </span>
        )}
      </section>
      {carga && <FormCarga activo={activo} abierto onCerrar={() => setCarga(false)} />}
    </div>
  )
}

// ------------------------------------------------------------
function CostosActivo({ activo }: { activo: Activo }) {
  const e = useEmpresa()
  const [nuevo, setNuevo] = useState(false)
  const costos = e.datos.costos.filter((c) => c.activo_id === activo.id).sort((a, b) => b.fecha.localeCompare(a.fecha))
  if (e.reportesBloqueados) return <div className="aviso error">Los costos vuelven cuando sincronices este equipo con internet.</div>
  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="fila-entre">
        <span className="sec chico">Facturas y gastos de este activo por cuenta. Los servicios de aceite se suman solos en el reporte de Costos.</span>
        {e.puedeEscribir && <button className="primario" onClick={() => setNuevo(true)}>Registrar gasto</button>}
      </div>
      {costos.length === 0 ? (
        <Vacio>Sin gastos registrados.</Vacio>
      ) : (
        <div className="tarjeta tabla-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Fecha</th><th>Cuenta</th><th>Descripción</th><th>Monto</th><th /></tr>
            </thead>
            <tbody>
              {costos.map((c) => (
                <tr key={c.id}>
                  <td>{fecha(c.fecha)}</td>
                  <td>{etiqueta(CUENTAS, c.cuenta)}<div className="sec chico">{etiqueta(TIPOS_COSTO, c.tipo)}</div></td>
                  <td>{c.descripcion}<div className="sec chico">{[c.proveedor, c.factura && `Fact. ${c.factura}`].filter(Boolean).join(' · ')}</div></td>
                  <td className="num">{dinero(c.monto)}</td>
                  <td>{e.esAdminEmpresa && <button className="chico" onClick={() => confirm('¿Borrar este gasto?') && void e.borrar('costos', c.id)}>Borrar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nuevo && <FormCosto activoId={activo.id} abierto onCerrar={() => setNuevo(false)} />}
    </div>
  )
}

// ------------------------------------------------------------
function Lecturas({ activo }: { activo: Activo }) {
  const e = useEmpresa()
  const lecturas = e.datos.lecturas.filter((l) => l.activo_id === activo.id).sort((a, b) => b.fecha.localeCompare(a.fecha))
  if (!lecturas.length) return <Vacio>Sin lecturas registradas.</Vacio>
  return (
    <div className="tarjeta tabla-wrap" style={{ padding: 0 }}>
      <table>
        <thead>
          <tr><th>Fecha</th><th>Odómetro</th><th>Horómetro</th><th>Notas</th></tr>
        </thead>
        <tbody>
          {lecturas.map((l) => (
            <tr key={l.id}>
              <td>{fechaHora(l.fecha)}</td>
              <td className="num">{l.km != null ? `${numero(l.km)} km` : '—'}</td>
              <td className="num">{l.horas != null ? `${numero(l.horas)} h` : '—'}</td>
              <td className="chico">{l.notas ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ------------------------------------------------------------
function Datos({ activo }: { activo: Activo }) {
  const e = useEmpresa()
  const [editar, setEditar] = useState(false)
  const [inactividad, setInactividad] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const filas: [string, string][] = [
    ['Estado', !activo.activo ? 'De baja' : activo.en_inactividad ? `En inactividad${activo.inactivo_desde ? ` desde el ${fecha(activo.inactivo_desde)}` : ''}${activo.inactividad_motivo ? ` (${activo.inactividad_motivo})` : ''}` : 'En operación'],
    ['Tipo', etiqueta(TIPOS, activo.tipo)],
    ['Marca y modelo', [activo.marca, activo.modelo].filter(Boolean).join(' ') || '—'],
    ['Año', activo.anio ? String(activo.anio) : '—'],
    ['Placa', activo.placa ?? '—'],
    ['Serial', activo.serial ?? '—'],
    ['Combustible', etiqueta(COMBUSTIBLES, activo.combustible)],
    ['Medidor', etiqueta(MEDIDORES, activo.medidor)],
    ['Ejes y neumáticos', PLANTILLAS[activo.configuracion ?? '']?.nombre ?? '—'],
    ['Sede', e.datos.sitios.find((s) => s.id === activo.sitio_id)?.nombre ?? '—'],
    ['Notas', activo.notas ?? '—'],
  ]
  return (
    <div className="tarjeta pila">
      <table>
        <tbody>
          {filas.map(([k, v]) => (
            <tr key={k}><th style={{ width: 180 }}>{k}</th><td>{v}</td></tr>
          ))}
        </tbody>
      </table>
      <ErrorMsg error={error} />
      {e.puedeEscribir && (
        <div className="fila">
          <button className="primario" onClick={() => setEditar(true)}>Editar</button>
          {activo.activo && (activo.en_inactividad ? (
            <button onClick={() => void e.guardar('activos', { ...activo, en_inactividad: false, inactivo_desde: null, inactividad_motivo: null }).catch((x) => setError(mensajeError(x)))}>
              Volver a operación
            </button>
          ) : (
            <button onClick={() => setInactividad(true)} title="Parado: no pide lectura y sus fluidos solo vencen por tiempo">Poner en inactividad</button>
          ))}
          {e.esAdminEmpresa && (
            <button
              className={activo.activo ? 'peligro' : ''}
              onClick={() => void e.guardar('activos', { ...activo, activo: !activo.activo }).catch((x) => setError(mensajeError(x)))}
            >
              {activo.activo ? 'Dar de baja' : 'Reactivar'}
            </button>
          )}
        </div>
      )}
      {editar && <FormActivo activo={activo} abierto onCerrar={() => setEditar(false)} />}
      {inactividad && <FormInactividad activo={activo} abierto onCerrar={() => setInactividad(false)} />}
    </div>
  )
}
