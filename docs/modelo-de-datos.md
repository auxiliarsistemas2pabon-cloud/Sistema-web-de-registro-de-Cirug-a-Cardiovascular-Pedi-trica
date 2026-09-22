# Modelo de datos

El modelo está normalizado por módulo clínico. Todas las tablas de datos de pacientes guardan `creado_por`, `creado_en`, `actualizado_por` y `actualizado_en`; los cambios quedan además registrados en `auditoria` mediante triggers.

```text
perfiles ─────────────┐
                       ├── pacientes ── 0..1 diagnosticos ── diagnosticos_riesgos
opciones_lista ───────┤        │
                       │        ├── 0..1 cirugias ── cirugias_procedimientos
categorias_lista ─────┤        │
                       │        ├── 0..1 postoperatorio
                       │        │             │
                       │        │             └── 0..1 seguimientos
                       │        │
                       │        └── 0..n importaciones_filas (origen importado)
                       │
                       └── importaciones_lote
```

## Tablas principales

| Tabla | Responsabilidad |
| --- | --- |
| `perfiles` | Rol y estado activo de cada usuario autenticado. |
| `pacientes` | Módulo 1, identidad, contacto, procedencia y borrado lógico. |
| `diagnosticos` / `diagnosticos_riesgos` | Módulo 2 y la selección múltiple de riesgos. |
| `cirugias` / `cirugias_procedimientos` | Módulo 3 y hasta tres procedimientos ordenados; el 2° y el 3° tienen su propia fecha (`fecha_procedimiento_2`, `fecha_procedimiento_3`), posterior a la del procedimiento anterior. |
| `postoperatorio` | Módulo 4, estancia y condición de salida. |
| `seguimientos` | Módulo 5; se bloquea automáticamente como no aplicable en caso de muerte. |
| `categorias_lista` / `opciones_lista` | Listas editables por administración, sin valores codificados en la interfaz. |
| `auditoria` | Historial del valor anterior, nuevo, usuario, tabla y fecha. |
| `importaciones_lote` / `importaciones_filas` | Archivo cargado, vista previa, normalización, errores y paciente creado. |

## Reglas importantes

- `pacientes.identificacion` y `numero_paciente` son únicos.
- Las fechas quirúrgicas, de traslado, egreso y reingreso se validan también en PostgreSQL, no solo en la interfaz.
- Los riesgos y procedimientos se guardan en tablas de relación para evitar columnas repetidas.
- Los pacientes no tienen permiso de borrado físico por la API. Un administrador solo puede usar el campo de borrado lógico.
- Las vistas, indicadores y alertas excluyen a los pacientes eliminados.
- Las políticas RLS permiten escritura a Administrador y Registrador; Consulta puede leer datos no eliminados e indicadores.

La definición ejecutable del esquema está en `supabase/migrations/` y es la fuente de verdad para despliegues.
