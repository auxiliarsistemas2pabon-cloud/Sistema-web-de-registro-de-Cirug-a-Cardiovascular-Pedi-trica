// Redondeo de cifras en el navegador con el mismo método que el servidor (redondear en
// server/rutas-consultas.mjs), para que un mismo valor se lea igual en la matriz, los gráficos y el Excel.

/** toFixed() a secas da otro resultado en los .x5 (5.35 → "5.3" en vez de 5.4). */
export const redondear = (n: number, decimales: number) => Math.round(n * 10 ** decimales) / 10 ** decimales

/** Número redondeado como el servidor y escrito con sus decimales fijos (5.35 con 1 decimal → "5.4"). */
export const formatearNumero = (n: number, decimales: number) => redondear(n, decimales).toFixed(decimales)
