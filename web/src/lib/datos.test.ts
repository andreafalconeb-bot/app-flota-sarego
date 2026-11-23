import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'

// Nube simulada: la bajada de flota_neumaticos se puede demorar a mano
// para guardar un neumático justo mientras la sincronización baja la copia.
const nube: Record<string, { id: string }[]> = {}
let soltarBajada: (() => void) | null = null
let demorarBajada = false

vi.mock('./supabase', () => {
  const from = (tabla: string) => ({
    upsert: (fila: { id: string; numero?: number }) => {
      const lista = (nube[tabla] ??= [])
      const i = lista.findIndex((f) => f.id === fila.id)
      // Como la base: el serial del neumático lo pone ella y no cambia
      const guardada = { ...fila, numero: i >= 0 ? (lista[i] as { numero?: number }).numero : lista.length + 1 }
      if (i >= 0) lista[i] = guardada
      else lista.push(guardada)
      const r = Promise.resolve({ error: null })
      return Object.assign(r, { select: () => ({ maybeSingle: async () => ({ data: { numero: guardada.numero }, error: null }) }) })
    },
    delete: () => ({ eq: async () => ({ error: null }) }),
    select: () => ({
      eq: () => ({
        order: () => ({
          range: async () => {
            // Se toma la foto de la nube ANTES de esperar, como una consulta real
            const foto = [...(nube[tabla] ?? [])]
            if (tabla === 'flota_neumaticos' && demorarBajada) await new Promise<void>((r) => (soltarBajada = r))
            return { data: foto, error: null }
          },
        }),
      }),
    }),
  })
  return { supabase: { from, rpc: async () => ({ data: new Date().toISOString(), error: null }) } }
})

const { leerCopia, registrarCambio, sincronizar, subirCola } = await import('./datos')

describe('sincronización', () => {
  it('un neumático guardado mientras se baja la copia no desaparece de la pantalla', async () => {
    const empresa = 'e1'
    demorarBajada = true
    const sync = sincronizar(empresa)
    await vi.waitFor(() => expect(soltarBajada).not.toBeNull())

    // El usuario guarda mientras la sincronización está bajando
    await registrarCambio({ empresa, coleccion: 'neumaticos', op: 'upsert', id: 'n1', fila: { marca_fuego: 'TG001' } })
    const subida = subirCola(empresa)

    // Se le da tiempo a la subida (sin el arreglo, sube y saca el cambio de
    // la cola antes de que termine la bajada, y la copia bajada lo pisa)
    await new Promise((r) => setTimeout(r, 100))
    soltarBajada!()
    demorarBajada = false
    await sync
    await subida

    expect((await leerCopia(empresa)).neumaticos.map((n) => n.id)).toEqual(['n1'])
    expect(nube.flota_neumaticos?.map((n) => n.id)).toEqual(['n1'])
  })

  it('el serial que pone la base aparece en la copia local apenas se sube', async () => {
    const empresa = 'e2'
    await registrarCambio({ empresa, coleccion: 'neumaticos', op: 'upsert', id: 'n2', fila: { marca_fuego: null, numero: null } })
    await subirCola(empresa)
    const n = (await leerCopia(empresa)).neumaticos.find((x) => x.id === 'n2')
    expect(n?.numero).toBe(2)
  })
})
