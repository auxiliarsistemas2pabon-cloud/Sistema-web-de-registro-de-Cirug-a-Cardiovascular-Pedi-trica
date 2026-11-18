# Seguridad de la instalación local

## Controles implementados

La revisión adicional incorpora [gestión de sesiones, análisis automáticos e importaciones reforzadas](controles-automaticos.md). Consulte ahí el resultado de la carga y las correcciones de dependencias de desarrollo/proxy; cero avisos de npm en producción no describe por sí solo la seguridad de una imagen completa.

La preparación para el servidor interno de la clínica está en [despliegue-clinica.md](despliegue-clinica.md). Las protecciones adicionales incluyen origen HTTPS exacto y nombre de servidor en producción, control de disponibilidad privado, cola de conexiones acotada, límites de tiempo HTTP y cierre ordenado. Producción rechaza migraciones desde el proceso web y comprueba permisos con una lista explícita que también rechaza roles MySQL y privilegios dinámicos/globales.

Las importaciones validan identificación y fecha antes de consultar. Un bloqueo por documento compartido en MySQL serializa solicitudes incluso entre procesos: repetir una fila devuelve la misma ficha y dos archivos concurrentes no crean la misma cirugía dos veces. Una petición fallida no cambia a error una fila ya importada por otra solicitud.

- Roles `administrador`, `registrador` y `consulta` comprobados en el servidor. Denegación de escrituras, exportaciones y administración según perfil; UI de consulta sin edición. La protección incluye rutas de indicadores y de adultos.
- Doble factor TOTP obligatorio para todas las cuentas. La primera contraseña es temporal. Las sesiones incompletas vencen en cinco minutos y no entregan datos clínicos.
- QR generado localmente, sin servicios externos. Semillas TOTP cifradas con AES-256-GCM y clave fuera de MySQL. Se comprueba el paso temporal bajo bloqueo para impedir reutilizar códigos, incluidas peticiones simultáneas.
- Ocho códigos de recuperación aleatorios de 128 bits, de un solo uso; solo se guardan sus hashes SHA-256. Se muestran una sola vez. Regenerarlos exige contraseña y un TOTP nuevo. Cambiar de autenticador exige contraseña y un TOTP o un código de recuperación sin usar, revoca otras sesiones y bloquea datos hasta inscribir el nuevo dispositivo.
- Cookies de sesión `__Host-`, `Secure`, `HttpOnly`, `SameSite=Strict` en HTTPS, sin `Domain`. Solo se almacena el hash del identificador de 256 bits. El identificador rota al completar MFA o reautenticarse. Logout, cambios de permisos y desactivación revocan sesiones.
- Caducidad por inactividad de peticiones y límite absoluto comprobados en MySQL. Cierre visual por inactividad y limpieza entre pestañas; revalidación al restaurar páginas desde la caché del navegador. Respuestas anteriores a logout no vuelven a poblar el perfil.
- Reautenticación de contraseña y TOTP en los diez minutos previos a administrar cuentas, importar o exportar.
- Límites por IP y contadores por identidad en MySQL, compartidos por procesos y reinicios. Una cuenta nueva o desconocida recibe el mismo tratamiento; se evita revelar si existe. Las ventanas de intentos vencen a los quince minutos. Los registros vencidos de autenticación se limpian periódicamente.
- CSRF mediante encabezado propio obligatorio, JSON y Fetch Metadata, sin CORS con credenciales. Rechazo de hosts ajenos a localhost en desarrollo para reducir DNS rebinding.
- HTTPS local con certificado de la cuenta de Windows, mínimo TLS 1.2; verificado también con TLS 1.3 y Chromium sin omitir errores de certificado. Node y MySQL escuchan únicamente en loopback.
- Helmet, CSP, bloqueo de marcos, referente restringido, permisos de cámara/micrófono/geolocalización deshabilitados y `Cache-Control: no-store` en la API.
- Cuerpos acotados y análisis de importaciones grandes después de autenticar. Contraseñas de al menos doce caracteres y hasta 72 bytes UTF-8. CSV neutralizado contra fórmulas precedidas de espacios o controles.
- Cuenta MySQL de aplicación sin DDL ni privilegios globales. Auditoría accesible solo para lectura e inserción por esa cuenta. Migraciones y respaldos usan otras credenciales, en archivos que no carga el servicio web. El arranque normal comprueba que la cuenta no tenga privilegios excesivos.
- Contraseñas locales de root y servicios rotadas. Cuenta anterior de servicio bloqueada. Archivos secretos protegidos con ACL del usuario actual y SYSTEM, ignorados por Git.
- Auditoría de accesos autorizados, solicitudes de exportación/importación, permisos denegados, inicios de sesión, MFA y cambios de cuentas. No registra búsquedas, cuerpos clínicos, contraseñas, cookies ni semillas. Las escrituras de administración se auditan en su misma transacción. Un fallo al registrar un acceso impide entregar los datos.
- Panel de seguridad con los últimos 200 eventos y alerta visible al acumular diez fallos de acceso o permisos en 24 horas. No se envían correos ni alertas externas.
- Respaldos comprimidos y cifrados AES-256-GCM, con clave separada y archivo de configuración MFA también cifrado. Se autentica el archivo completo antes de restaurarlo en una base temporal. Nunca se restaura automáticamente sobre la base clínica.
- Tarea diaria local a las 18:00 de Bogotá, con registros privados y prueba de restauración; requiere usuario conectado y Docker disponible. No elimina respaldos automáticamente.

La migración de permisos conserva un administrador activo, preferentemente el inicial identificado por su correo, y pasa las demás cuentas existentes a consulta. No borra historias clínicas. La migración se marca para que repetirla no vuelva a cambiar roles ni MFA configurados. Los cambios concurrentes tampoco pueden quitar al último administrador activo.

## Pruebas realizadas

Verificación del 18 de noviembre de 2026: 11 pruebas HTTP/criptografía, 38 pruebas con MySQL real y navegador y 4 comprobaciones de configuración/permisos de despliegue aprobadas. Compilación e imagen Docker construidas correctamente; lint sin errores, con advertencias previas de React. La auditoría de dependencias de producción reportó cero avisos. El ensayo `deploy:smoke` comprobó HTTPS con CA válida, MFA, filtros de red frente a cabeceras suplantadas, imagen sin secretos, proceso sin root y archivos de solo lectura, errores del proxy sin búsquedas, rechazo de respaldos alterados y recuperación completa de SQL/MFA/CA en volúmenes nuevos. Después de recuperar se inició sesión y se consultó la API con la cuenta ficticia. Los recursos temporales fueron eliminados; la base clínica local no se usó en esos ensayos.

La revisión adicional corrigió diferencias entre el reconocimiento de rutas de Express y sus controles de permisos: exportar, eliminar y restaurar llevan ahora los controles en la propia ruta, incluidos mayúsculas, barra final y HEAD. Eliminar o restaurar también requiere reautenticación reciente.

Reautenticarse conserva el vencimiento absoluto original. Cambiar contraseña, regenerar códigos o reinscribir MFA rota la cookie; una sesión revocada o vencida durante la operación hace que se reviertan las escrituras. El login vuelve a comprobar el hash bajo bloqueo antes de crear la sesión, para rechazar una contraseña cambiada durante bcrypt. El correo se compara exactamente después de convertirlo a minúsculas, evitando alias con tildes aceptados por la colación de MySQL.

Si falla el cierre por conexión, se guarda únicamente una marca de cierre pendiente, sin credenciales, en el almacenamiento local. Al recargar, restaurar la página o intentar entrar nuevamente se reintenta la revocación antes de restaurar acceso. Los intentos simultáneos comparten una misma petición de cierre, con un máximo de diez segundos por intento. Si el navegador bloquea el almacenamiento, la marca solo puede conservarse en memoria de esa pestaña.

Se verificaron la compilación, los límites HTTP y criptografía, la suite clínica y la autenticación en Chromium. La suite de MySQL se ejecutó contra un contenedor temporal independiente, también por HTTPS con un certificado válido. Cubre inscripción y recuperación MFA, replay, revocación, vencimientos, permisos, último administrador concurrente, repetición de migraciones y privilegios reales de MySQL.

La instalación local se verificó con su cuenta de base limitada y su certificado HTTPS. Se creó un respaldo antes de migrar y se comprobó la restauración de los respaldos posteriores. La tarea de Windows también se ejecutó con resultado correcto.

Comandos reproducibles:

```powershell
npm run build
npm run lint
npm run test:security
npm run test:security:mysql
npm run test:security:tls
npm run backup
npm audit --omit=dev
```

La auditoría npm completa y la de producción no reportaron avisos tras la corrección de picomatch. Se retiró la CLI shadcn, que no utilizaba la aplicación, conservando su CSS y licencia MIT en `src/styles/`. Como la última versión publicada de picomatch seguía afectada, se utiliza una copia local con rechazo explícito de patrones repetidos inseguros, procedencia documentada y pruebas de regresión. Caddy se construye con las dependencias corregidas por su propio upstream. No se aplican retrocesos forzados de versiones principales ni exclusiones de los avisos. Los análisis de dependencias y estas pruebas no constituyen una auditoría independiente ni una garantía de ausencia de vulnerabilidades.

## Recuperación de cuentas

1. Si conserva un código de recuperación, inicie sesión con contraseña y ese código. Para cambiar el autenticador use otro código sin utilizar o un TOTP nuevo desde **Seguridad de mi cuenta**.
2. Si perdió todos los factores, verifique presencialmente su identidad por el procedimiento institucional. Un operador con acceso al equipo y a `.env.maintenance` puede ejecutar:

```powershell
node server/recuperar-cuenta.mjs --id=UUID_DE_LA_CUENTA --accion=mfa --identidad-verificada
```

Esto revoca todas las sesiones y exige cambiar contraseña e inscribir MFA. No reactiva ni cambia permisos de la cuenta. Para restablecer únicamente la contraseña, use `--accion=clave`: la contraseña aleatoria se guarda en un archivo privado y no se imprime. Esa opción conserva el MFA existente. Entregue la contraseña por un canal institucional y elimine el archivo temporal tras usarla. La recuperación queda auditada con el operador local. No hay un endpoint web que omita el doble factor.

## Custodia y restauración

Conserve juntos los archivos `.sql.gz.aes` y `.config.json.aes` de cada ejecución, y custodie `.local-secrets/backup.key` por separado. La configuración cifrada conserva `MFA_ENCRYPTION_KEY`, indispensable para descifrar las semillas después de restaurar la base. No pierda ni cambie esa clave sin migrar las semillas. Las copias iniciales antiguas pueden no tener acompañante de configuración; conserve la clave MFA original.

`npm run backup:verify -- ARCHIVO` autentica los archivos, restaura el SQL en una base de nombre aleatorio creada para la prueba, cuenta sus tablas/filas y elimina exclusivamente esa base temporal. La restauración de emergencia sobre una base nueva de atención clínica debe realizarla un operador, con el sistema detenido y un plan de reversión. La herramienta de prueba no reemplaza la base clínica.

Los respaldos actuales permanecen en este equipo. Falta elegir una ubicación externa y una política institucional de retención. Copie los respaldos cifrados fuera del equipo y mantenga la clave de recuperación en una ubicación distinta y protegida. Un usuario de Windows o administrador de base con privilegios suficientes sigue pudiendo acceder a material sensible; proteja su cuenta, el equipo y el disco.

## Certificado local y operación

Abra https://localhost:3443. El certificado corresponde a localhost, está confiado únicamente en la cuenta de Windows configurada y vence al año. El asistente no omite intersticiales de seguridad del navegador. Para renovarlo, detenga el servicio, retire o archive de forma controlada el PFX y su contraseña vencidos en `.local-secrets`, ejecute el configurador HTTPS, verifique la nueva huella y acepte el nuevo certificado. Revise y retire del almacén la confianza del certificado vencido después de verificar el nuevo.

El arranque normal es `npm run server`; Docker debe estar disponible. `RUN_MIGRATIONS=false` evita usar privilegios de migración desde el servicio. Para actualizar tablas use `npm run db:migrate` después de verificar un respaldo. Si una migración crea tablas nuevas, un operador de MySQL debe conceder sus permisos específicos a la cuenta de aplicación.

Los límites generales por IP están en memoria de cada proceso; los límites por cuenta y MFA están en MySQL. Para publicar varias instancias se deberán centralizar también los límites de tráfico. No publique el servidor de Vite ni reutilice esta confianza local como certificado público.

## Alcance y publicación futura

Esta instalación es local y de una sola institución. No incluye control por equipo asistencial, MFA resistente al phishing mediante passkeys/SSO, cifrado de disco gestionado, copias externas ni monitoreo fuera del equipo. TOTP reduce el riesgo de contraseñas robadas pero puede ser víctima de phishing en tiempo real. Proteja las sesiones del sistema operativo y no comparta cuentas.

Antes de publicar: dominio y proxy HTTPS real, firewall, TLS verificado para una base remota, gestión de secretos, retención, respuesta a incidentes, revisión de permisos por cargo y revisión independiente del sitio desplegado. Las decisiones institucionales de acceso, conservación y tratamiento de datos no las sustituye el código.

Referencias de diseño: [OWASP ASVS](https://asvs.owasp.org/), [MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html), [sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) y [seguridad de Express](https://expressjs.com/en/advanced/best-practice-security/).
