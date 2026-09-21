# Sistema de registro de Cirugía Cardiovascular Pediátrica

Aplicación web para el registro longitudinal de cirugía cardiovascular pediátrica. Está construida con React, TypeScript, Tailwind y Supabase/PostgreSQL. La interfaz está en español y usa la zona horaria `America/Bogota`.

El diagrama y las reglas del esquema están en [`docs/modelo-de-datos.md`](docs/modelo-de-datos.md).

## Incluye

- Autenticación, cierre por inactividad y roles: Administrador, Registrador y Consulta.
- Ficha por paciente dividida en cinco módulos clínicos, con guardado independiente, validaciones y cálculos automáticos.
- Listado con búsqueda y filtros, alertas de seguimiento e indicadores filtrables por fecha.
- Listas desplegables administrables y auditoría de cambios.
- Borrado lógico de pacientes y políticas RLS de Supabase.
- Importación `.xlsx` con limpieza, validación, vista previa y trazabilidad por lote.
- Exportación de los pacientes activos a Excel (tabla plana y hojas por módulo) o CSV.

## Requisitos

- Node.js 22 o superior.
- Un proyecto de Supabase (o Supabase CLI/Docker para desarrollo local).

## Desarrollo local

1. Instale dependencias:

   ```powershell
   npm install
   ```

2. Copie `.env.example` como `.env` y complete los valores públicos de su proyecto:

   ```env
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key>
   ```

   No añada la clave `service_role` al archivo `.env` del frontend.

3. Aplique las migraciones a una instancia local o vinculada:

   ```powershell
   npx supabase start
   npx supabase db reset
   npm run dev
   ```

   Para una instancia remota, vincule primero el proyecto y aplique los cambios:

   ```powershell
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

4. Abra la URL que muestra Vite (normalmente `http://localhost:5173`).

## Primer administrador

El primer perfil administrador se crea de forma controlada desde el SQL Editor de Supabase:

1. Cree el usuario inicial en **Authentication → Users**.
2. Copie su UUID y ejecute, sustituyendo los valores:

   ```sql
   insert into public.perfiles (id, nombre_completo, rol)
   values ('UUID_DEL_USUARIO', 'Nombre del administrador', 'administrador');
   ```

3. Inicie sesión. Desde **Administración → Usuarios** podrá crear los demás usuarios mediante la Edge Function.

Despliegue la función una vez por proyecto:

```powershell
npx supabase functions deploy crear-usuario
```

## Datos ficticios de demostración

[`supabase/seed.demo.sql`](supabase/seed.demo.sql) crea 15 registros totalmente ficticios. Incluye un paciente fallecido en UCI, uno con reingreso, uno sin CEC y uno con seguimiento pendiente.

Ejecute ese archivo solo en desarrollo o una demo y después de crear el administrador. No se ejecuta automáticamente al reiniciar la base de datos y no debe utilizarse en producción.

## Importación y exportación

Las funciones están en **Importar / exportar**, disponibles para Administrador y Registrador.

- Descargue la plantilla para conocer las columnas canónicas.
- Al cargar un `.xlsx`, la aplicación normaliza espacios, equivalentes de `N/A`, números con coma decimal y fechas `dd/mm/aaaa` o `aaaa-mm-dd`.
- Antes de crear pacientes, guarda un lote con la vista previa y muestra errores de listas, fechas, rangos, duplicados y reglas clínicas.
- Se importan únicamente las filas válidas; una fila errónea no afecta las demás.
- La exportación genera un archivo Excel con una hoja plana `Datos` y una hoja por módulo, además de CSV.

La importación reconoce variaciones habituales de los encabezados en español (por ejemplo, `Fecha nacimiento`, `Fecha de nacimiento` y `fecha_nacimiento`). Cuando se disponga del Excel histórico de 44 columnas, sus encabezados exactos se pueden añadir al mapa de alias en [`src/lib/importacion.ts`](src/lib/importacion.ts).

## Verificación

```powershell
npm run build
npm run lint
```

`npm run build` valida TypeScript y crea el paquete de producción en `dist/`.

## Despliegue

1. Aplique las migraciones y despliegue `crear-usuario` en Supabase.
2. En el proveedor del frontend, configure `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables de compilación.
3. Ejecute `npm run build` y publique el directorio `dist` como sitio estático.
4. Configure una URL de producción en **Authentication → URL Configuration** de Supabase y active un SMTP institucional antes de invitar usuarios reales.

## Protección de datos

El sistema maneja datos de salud de menores de edad. Mantenga el proyecto de Supabase privado, limite las cuentas al personal autorizado, revise periódicamente la auditoría y no use los datos ficticios para atención clínica. Antes de la salida a producción, la institución debe validar sus políticas de tratamiento de datos, retención, copias de seguridad y control de acceso conforme a su marco normativo.
