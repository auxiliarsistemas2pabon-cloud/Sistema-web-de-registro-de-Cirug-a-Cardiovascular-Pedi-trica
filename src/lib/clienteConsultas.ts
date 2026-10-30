import { QueryClient } from '@tanstack/react-query'

/** El caché de datos de toda la aplicación. Vive aquí (y no en main.tsx) para que el cliente HTTP
 * (lib/api.ts) pueda refrescarlo después de cada guardado. */
export const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Para las vistas de resumen (inicio, listas de pacientes, alertas): se vuelven a pedir solas cada
 * minuto y al volver a la ventana, así también muestran lo que registró otra persona desde otro
 * computador (pedido del 30-oct: "cada vez que se agregue un nuevo paciente, que todo se actualice").
 * No se usa en los formularios: refrescarlos mientras alguien escribe no aporta nada.
 */
export const ACTUALIZACION_PERIODICA = { refetchInterval: 60_000, refetchOnWindowFocus: true } as const

/** Después de cualquier guardado (crear un paciente, guardar un módulo, eliminar o restaurar, editar
 * una lista…), todo lo que se esté viendo se vuelve a pedir: listas, inicio, alertas e indicadores. */
export function refrescarTodo() {
  void clienteConsultas.invalidateQueries()
}
