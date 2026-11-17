# Sistema de Cirugía Cardiovascular

Registro clínico pediátrico y de adultos con React, TypeScript, Express y MySQL 8.4. Interfaz en español; fechas clínicas en `America/Bogota` y marcas de tiempo en UTC.

## Uso local ya configurado

1. Inicie Docker Desktop y espere que el grupo `clinica-pabon` esté saludable. Para iniciarlo completo use `docker compose --env-file .env.docker up -d --wait`; conserva los volúmenes existentes.
2. Ejecute `npm run server` desde esta carpeta si el servidor aún no está activo.
3. Abra **https://localhost:3443**. El servicio y MySQL escuchan exclusivamente en `127.0.0.1`.

Al primer ingreso después de esta actualización deberá cambiar su contraseña y configurar una aplicación autenticadora. Los códigos de recuperación se muestran una sola vez: guárdelos fuera del sistema, en su gestor de contraseñas. Ninguna cuenta puede consultar datos clínicos antes de completar el doble factor.

El certificado local está instalado en la cuenta actual de Windows y expira al año. Otras cuentas de Windows necesitan su propia configuración de confianza. No omita advertencias de certificado: compruebe la vigencia y ejecute el procedimiento de renovación indicado en [seguridad.md](docs/seguridad.md).

## Grupo Docker local

Los grupos anteriores `backend` y `sistemawebdecirugacardiovascularpeditrica` se reunieron en **`clinica-pabon`**. PostgreSQL y MySQL siguen siendo dos servicios dentro de ese único grupo:

| Servicio | Contenedor | Puerto del equipo | Volumen conservado |
| --- | --- | --- | --- |
| `db` · PostgreSQL 16 | `backend-db-1` | 5434 | `backend_postgres_data` |
| `mysql` · MySQL 8.4 | `cardio-mysql` | 3307 | `sistemawebdecirugacardiovascularpeditrica_cardio_mysql_data` |

Los volúmenes están declarados como externos para conservar su identidad y protegerlos de `docker compose down -v`. Las credenciales PostgreSQL se cargan del archivo privado `.env.postgres.docker`. El Compose de `C:/Gestión Ambiental y Ropa/backend/` incluye esta configuración unificada; los comandos desde cualquiera de las dos carpetas administran el mismo grupo.

La agrupación conserva los motores, las cuentas y los puertos de las bases; no mezcla sus esquemas. Antes del cambio se guardaron copias cifradas y se verificaron después las huellas de las tablas. El grupo detenido `gestinambientalyropa` se conserva aparte.

## Permisos

| Perfil | Lectura clínica | Guardar fichas | Usuarios y listas administrativas | Importar y exportar | Eliminar/restaurar |
| --- | --- | --- | --- | --- | --- |
| Consulta | Sí | No | No | No | No |
| Registro clínico | Sí | Sí | No; puede añadir diagnósticos desde la ficha | No | No |
| Administrador | Sí | Sí | Sí | Sí | Sí |

Los controles se aplican en la API. La migración conserva un administrador inicial y asigna consulta a las demás cuentas existentes; el administrador debe revisar y asignar sus permisos. Los perfiles autorizados para lectura pueden consultar los pacientes de esta institución; no existe segmentación por equipo asistencial o por paciente.

Administrar cuentas, importar, exportar y eliminar/restaurar exige haber confirmado la contraseña y el doble factor en los últimos diez minutos, desde **Seguridad de mi cuenta**. Los cambios de permisos y estado revocan las sesiones de la cuenta afectada. Siempre debe permanecer un administrador activo.

Reautenticarse no prolonga el límite absoluto de la sesión. Los cambios de contraseña y recuperación rotan la cookie actual. Si falla un cierre por conexión, la aplicación conserva una marca sin credenciales y reintenta revocarlo antes de restaurar acceso tras una recarga o un nuevo inicio.

## Verificación

Requiere Node.js 24 LTS, Docker Desktop y, para las pruebas de navegador, Chromium de Playwright.

```powershell
npm ci
npx playwright install chromium
npm run build
npm run lint
npm run test:security
npm run test:security:mysql
npm run test:security:tls
npm audit --omit=dev
```

`test:security` comprueba límites HTTP y criptografía sin una base clínica. Las pruebas `mysql` y `tls` crean un contenedor MySQL temporal con credenciales aleatorias; ejecutan pruebas clínicas, de permisos, MFA, concurrencia y navegador, y lo eliminan después. `tls` usa el certificado local válido. No se usa ni modifica la base de atención clínica. `test:security:browser` ejecuta solo los casos de navegador en ese mismo aislamiento.

`test:api` es la suite clínica interna invocada por el entorno aislado; ejecútela mediante `test:security:mysql` para obtener las cuentas ficticias y el doble factor de pruebas.

## Respaldos

`npm run backup` genera un volcado comprimido y cifrado con AES-256-GCM en `backups/` y verifica su restauración en una base temporal. También genera un archivo `.config.json.aes` con la clave necesaria para recuperar las semillas MFA. Ambos archivos se cifran con `.local-secrets/backup.key`.

La tarea de Windows **Cardio-Respaldo-Cifrado-Local** se programa con `scripts/programar-respaldo-local.ps1` para las 18:00 de Bogotá. Requiere una sesión de Windows iniciada y Docker disponible. Su resultado se consulta en el Programador de tareas y en los registros privados `.local-secrets/respaldo-programado.*.log`. La configuración actual fue probada con una ejecución de la tarea.

Para verificar un respaldo existente:

```powershell
npm run backup:verify -- "backups/ARCHIVO.sql.gz.aes"
```

**Una copia en el mismo equipo no protege contra pérdida del equipo.** Mantenga también copias externas cifradas de los archivos SQL y configuración. Custodie `backup.key` por separado: sin ella no se recuperan. No hay transferencia externa configurada ni eliminación automática de respaldos.

## Credenciales y mantenimiento

- `.env`: solo la configuración y secretos de la aplicación.
- `.env.maintenance`: cuenta de migraciones y datos iniciales de administración.
- `.env.backup`: cuenta de lectura para respaldos.
- `.env.docker`: inicialización del contenedor y contraseña root.
- `.env.postgres.docker`: credenciales del servicio PostgreSQL del grupo unificado.
- `.local-secrets/`: certificado, claves y registros privados.

Estos archivos están excluidos de Git. Los archivos locales con secretos tienen acceso restringido a la cuenta actual y SYSTEM. No los adjunte a incidencias ni los copie en chats.

`npm run db:migrate` aplica cambios con la cuenta separada de mantenimiento. El servicio normal no ejecuta migraciones ni tiene permisos para alterar tablas, borrar auditoría o administrar usuarios de MySQL. Haga y verifique un respaldo antes de migrar.

Para pérdida de autenticador, use primero un código de recuperación y **Seguridad de mi cuenta → Cambiar aplicación autenticadora**. Si se perdieron todos los factores, un operador autorizado debe verificar presencialmente la identidad y usar [el procedimiento local](docs/seguridad.md); no existe restablecimiento anónimo de MFA.

## Instalación nueva en Windows

Estos pasos son para una base nueva. No repita el aprovisionamiento sobre la instalación ya configurada.

El Compose actual utiliza también PostgreSQL y dos volúmenes externos de esta instalación. En otro equipo debe preparar `.env.postgres.docker` con `POSTGRES_DB`, `POSTGRES_USER` y una contraseña propia en `POSTGRES_PASSWORD`, con acceso restringido al operador. Antes de arrancar cree ambos volúmenes con `docker volume create backend_postgres_data` y `docker volume create sistemawebdecirugacardiovascularpeditrica_cardio_mysql_data`, o restaure los volúmenes existentes si se trata de una recuperación.

1. Instale dependencias con `npm ci`.
2. Ejecute `node scripts/preparar-local.mjs --email=SU_CORREO_INSTITUCIONAL`. Crea secretos aleatorios y un archivo `.env` privado; no imprime contraseñas.
3. Ejecute `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configurar-https-local.ps1`. Verifique y acepte manualmente el certificado local que genere Windows.
4. Inicie MySQL con `docker compose up -d --wait mysql`.
5. Ejecute `npm run backup` y `node scripts/configurar-db-local.mjs`. Se crean tablas, roles y cuentas de servicio; se rotan las credenciales iniciales y se restringe la cuenta de la aplicación.
6. Ejecute `node scripts/separar-entornos-locales.mjs`. La contraseña temporal inicial pasa al archivo privado `.env.maintenance`; consúltela localmente para el primer ingreso y retírela después de cambiarla.
7. Programe los respaldos con `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/programar-respaldo-local.ps1`.
8. Ejecute `npm run build`, las pruebas y `npm run server`.

Para desarrollo de la interfaz, `npm run dev:full` utiliza el mismo certificado y un proxy local. El uso habitual local debe hacerse con Express y `dist/`; no publique Vite.

## Publicación futura

Esta configuración está destinada al equipo local. Antes de publicar se deben configurar dominio, proxy HTTPS, red, certificados, copias externas, monitoreo y la política institucional de acceso y retención. Consulte [la documentación de seguridad](docs/seguridad.md) y [el contrato de autenticación](docs/api-contrato.md). No existe una garantía de seguridad absoluta.
