# Contrato de la API (Express + MySQL)

Estado: **propuesta v1**, todavía sin implementar. Reemplaza a `supabase.from/rpc/auth` del frontend.
Si el frontend necesita algo distinto, se cambia aquí primero y luego en código.

## Convenciones

- Base `/api`, JSON UTF-8. Toda ruta excepto `POST /api/auth/login` exige `Authorization: Bearer <jwt>`.
- JWT firmado con `JWT_SECRET`, expira en 8 h, payload `{ sub: usuario_id, rol }`. El servidor vuelve a leer
  el usuario en cada petición, así que desactivar a alguien o cambiarle el rol surte efecto de inmediato.
  Cerrar sesión es solo borrar el token en el cliente.
- Fechas `DATE` como `"YYYY-MM-DD"`. `DATETIME` como ISO 8601 UTC. Booleanos `true/false` (nunca 0/1).
  `DECIMAL` y `BIGINT` como número JSON. `telefonos` como `string[]`. Los ids son UUID en texto.
- Los campos vacíos se envían como `null`, no como `""`.
- El cliente **ya no envía** `creado_por`, `actualizado_por` ni `usuario_id`: el servidor los toma del JWT.

### Errores

Cuerpo siempre `{ "error": { "codigo": string, "mensaje": string, "campos"?: { [campo]: string } } }`.
`mensaje` está en español y es apto para mostrarlo tal cual al usuario.

| HTTP | codigo | cuándo |
| --- | --- | --- |
| 400 | `VALIDACION` | cuerpo o query mal formados (`campos` indica cuáles) |
| 401 | `NO_AUTENTICADO` | falta el token, es inválido, expiró o el usuario está inactivo |
| 401 | `CREDENCIALES_INVALIDAS` | login fallido (mismo mensaje para email inexistente y clave incorrecta) |
| 403 | `SIN_PERMISO` | el rol no puede hacer esto |
| 404 | `NO_ENCONTRADO` | no existe, o el paciente está eliminado y el rol no es administrador |
| 409 | `IDENTIFICACION_DUPLICADA` | `pacientes.identificacion` repetida (sustituye a buscar `pacientes_identificacion_key`) |
| 409 | `POSTOPERATORIO_REQUERIDO` | se intenta guardar Módulo 5 sin Módulo 4 guardado |
| 422 | `REGLA_NEGOCIO` | regla clínica incumplida (lista abajo); `mensaje` es el texto exacto de la regla |
| 500 | `ERROR_INTERNO` | cualquier otro; el detalle va al log, no al cliente |

Reglas que responden 422 (portadas de los triggers 0003):
fecha de cirugía anterior al nacimiento · traslado o salida anteriores a la cirugía · "Ninguno" combinado con otro
factor de riesgo · Módulo 5 editado con `no_aplica = true` · reingreso fuera de los 30 días posteriores a la salida ·
modificar `codigo` de una opción de lista · más de 3 procedimientos.

### Permisos por rol

| Recurso | administrador | registrador | consulta |
| --- | --- | --- | --- |
| GET pacientes, módulos, alertas, indicadores, exportación, listas | sí (incluye eliminados) | sí (no eliminados) | sí (no eliminados) |
| POST/PUT pacientes y módulos, importación | sí | sí (solo pacientes no eliminados) | no |
| Marcar paciente eliminado | sí | no | no |
| `/api/admin/*` | sí | no | no |

## Reglas que el servidor aplica en silencio (el cliente no las repite)

- `municipio_narino_id` pasa a `null` si la procedencia no es `NARINO`.
- Si el diagnóstico no es `VALVULOPATIAS`, `valvulopatia_id` se fija a la opción `NA` de VALVULOPATIA.
- Si `uso_cec` no es `SI`, `tiempo_cec_min` y `tiempo_clamp_min` pasan a `null`.
- Al guardar el postoperatorio se crea o actualiza `seguimientos`: condición de salida `MUERTE` deja el
  Módulo 5 con `no_aplica = true` y `estado_modulo = 'no_aplica'`. Si se corrige, vuelve a `pendiente`.
- Toda escritura queda en `auditoria` (valores anteriores y nuevos, usuario del JWT) dentro de la misma
  transacción, para pacientes, diagnosticos, diagnosticos_riesgos, cirugias, cirugias_procedimientos,
  postoperatorio y seguimientos.

## Rutas

### Autenticación

- `POST /api/auth/login` `{ email, password }` → `200 { token, perfil }`. Errores: 401 `CREDENCIALES_INVALIDAS`,
  403 `USUARIO_INACTIVO`.
- `GET /api/auth/me` → `200 perfil`. `perfil = { id, email, nombre_completo, rol, activo }`
  (`rol`: `administrador | registrador | consulta`). Sustituye a `cargarPerfil` de `AuthProvider`.

### Listas

- `GET /api/listas/opciones?categoria=EPS` → `OpcionLista[]` activas, por `orden`:
  `{ id, categoria_id, codigo, valor, orden, activo }`.
  Sin `categoria` devuelve todas las categorías y añade `categoria_codigo` a cada fila (lo usa la importación).

### Pacientes (Módulo 1)

- `GET /api/pacientes?busqueda=&eps=&diagnostico=&rachs=&condicionSalida=&fechaCirugiaDesde=&fechaCirugiaHasta=`
  → `PacienteResumen[]`, no eliminados, por `numero_paciente` descendente. Los filtros por lista usan el
  **texto** (`valor`), igual que hoy. `busqueda` compara con nombre o identificación (contiene, sin distinguir mayúsculas).
  Cada fila trae las columnas de `v_pacientes_resumen`: `paciente_id, numero_paciente, nombre_completo, identificacion,
  fecha_nacimiento, edad_dias, fecha_cirugia, edad_cirugia_dias, dias_uci, dias_hospitalizacion_posqx,
  estado_m1..estado_m5, diagnostico_valor, rachs_valor, eps_valor, procedencia_valor, condicion_salida_valor, eliminado`.
  Un módulo sin fila cuenta como `pendiente`.
- `GET /api/pacientes/:id` → `PacienteDetalle` con `id, numero_paciente, nombre_completo, identificacion, sexo_id,
  fecha_nacimiento, peso_kg, talla_cm, procedencia_id, municipio_narino_id, telefonos, sin_telefono, eps_id,
  estado_modulo, eliminado`.
- `GET /api/pacientes/:id/resumen` → `{ edad_dias, diagnostico_valor, estado_m1..estado_m5 }`.
- `POST /api/pacientes` con los campos editables de `PacienteDetalle` (todo menos `id`, `numero_paciente`,
  `eliminado`) → `201 { id }`. Puede dar 409 `IDENTIFICACION_DUPLICADA`.
- `PUT /api/pacientes/:id` mismo cuerpo → `200 { id }`.
- `PUT /api/pacientes/:id/eliminado` `{ eliminado: boolean }` → `200`. Solo administrador. (La UI actual no lo usa.)

### Módulos 2 a 5

Todos cuelgan de `/api/pacientes/:id/...`. `GET` devuelve `200` con el objeto, o `200 null` si el módulo aún no
existe (equivale al `maybeSingle` actual). `PUT` es un upsert (crea o reemplaza) y devuelve `200 { id }`.
Todos llevan `estado_modulo` (`pendiente | completo | no_aplica`), calculado por el cliente con `lib/completitud`.

| Ruta | Campos |
| --- | --- |
| `/diagnostico` | `diagnostico_id, valvulopatia_id, rachs_id, riesgo_ids: string[], estado_modulo` |
| `/cirugia` | `fecha_cirugia, implante_id, uso_cec, tiempo_cec_min, tiempo_clamp_min, complicacion_intraqx_id, cierre_esternal_diferido, extubacion_quirofano, procedimiento_ids: string[] (máx. 3, el orden del arreglo es el orden), fecha_procedimiento_2, fecha_procedimiento_3, estado_modulo`. Cada procedimiento adicional (2 y 3) requiere su propia fecha, estrictamente posterior a la del procedimiento anterior: no pueden compartir el mismo día. |
| `/postoperatorio` | `unidad_pop_id, horas_ventilacion_mecanica, complicacion_pop_id, fecha_traslado_intermedio, fecha_salida, condicion_salida_id, estado_modulo` |
| `/seguimiento` | `fecha_control_cirugia, rehabilitacion_cardiaca, estado_herida_id, fecha_llamada_15_dias, persona_recibe_llamada, reingreso_30_dias, fecha_reingreso, causa_reingreso_id, observaciones, estado_modulo`; el `GET` añade `no_aplica` (solo lectura) |

`SI/NO` se envían como `"SI"`/`"NO"`; `rehabilitacion_cardiaca` y `reingreso_30_dias` admiten además `"NA"`.
Los riesgos y procedimientos se reemplazan de forma atómica dentro de la misma transacción.

### Alertas

- `GET /api/alertas` → `[{ paciente_id, numero_paciente, nombre_completo, identificacion, tipo_alerta,
  fecha_referencia, dias_desde_referencia }]`, por `dias_desde_referencia` descendente. `tipo_alerta` es
  `llamada_15_dias` o `seguimiento_pendiente_alta`. Misma lógica que `v_alertas_seguimiento`.

### Indicadores

- `GET /api/indicadores?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` → una sola respuesta:
  `{ resumen, por_mes, por_diagnostico, por_procedimiento, por_rachs, por_eps, por_procedencia }`.
  Los nombres de campo son los mismos que devuelven hoy los `fn_indicador_*` (`resumen` es un objeto, no un arreglo).
  Las medianas se calculan en Node (MySQL no tiene `percentile_cont`). Población: cirugías con fecha en el rango
  y paciente no eliminado.

### Exportación e importación

- `GET /api/exportacion/pacientes` → `[{...}]` con las columnas de `v_exportacion_pacientes` (ese nombre de
  columna es el formato canónico). `telefonos`, `riesgos` y `procedimientos` llegan como texto unido con `" | "`.
  El `.xlsx` se sigue generando en el cliente con `exceljs`.
- `POST /api/importaciones/identificaciones-existentes` `{ identificaciones: string[] }` → `{ existentes: string[] }`
  (sustituye la consulta a `pacientes` de la línea 257 de `ImportacionExportacionPage`).
- `POST /api/importaciones/lotes` `{ archivo_nombre, filas: [{ numero_fila, datos_originales, datos_normalizados,
  errores, estado }] }` → `201 { lote_id, filas: [{ numero_fila, id }] }`.
- `POST /api/importaciones/filas/:id/aplicar` → `200 { paciente_id }`. Una transacción por fila. Si falla,
  el servidor deja la fila en `con_errores` con el mensaje en `errores` y responde 409 o 422; el cliente
  **no** necesita hacer el `update` de la línea 292. Cuando ya no quedan filas `valido`, el lote pasa a `aplicado`.
  Solo el administrador o quien cargó el lote pueden aplicarlo.

### Administración (solo administrador)

- `GET /api/admin/usuarios` → `[{ id, email, nombre_completo, rol, activo }]`.
- `POST /api/admin/usuarios` `{ email, nombre_completo, rol, password }` → `201 { id }`. **Nuevo**: hoy no existe en la UI.
- `PATCH /api/admin/usuarios/:id` `{ rol?, activo? }` → `200`.
- `GET /api/admin/listas/categorias` → `[{ id, codigo, nombre }]`.
- `GET /api/admin/listas/categorias/:id/opciones` → todas las opciones (activas e inactivas), por `orden`.
- `POST /api/admin/listas/opciones` `{ categoria_id, valor, orden, codigo? }` → `201 { id }`.
- `PATCH /api/admin/listas/opciones/:id` `{ valor?, orden?, activo? }` → `200`. Enviar `codigo` da 422.
- `GET /api/admin/auditoria?tabla=&usuario_id=&desde=&hasta=&limit=200` → filas de auditoría con `usuario_nombre`,
  por `fecha` descendente (`limit` máximo 200).
