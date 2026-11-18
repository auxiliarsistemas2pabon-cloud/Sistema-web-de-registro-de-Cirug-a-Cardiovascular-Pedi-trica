# Despliegue privado en la clínica

Preparado el 18 de noviembre de 2026. Destino previsto: servidor Linux de la clínica, accesible desde su LAN o VPN institucional. No se ha publicado la aplicación ni migrado la base clínica. La instancia privada `clinica` ya está preparada en este equipo, con escucha inicial `127.0.0.1`, nombre provisional `cirugia.clinica.internal` y la clave MFA local conservada.

## Arquitectura y requisitos

El archivo `deploy/compose.yml` crea el grupo separado `cirugia-prod-clinica`: Caddy → aplicación Node → MySQL. Solo Caddy publica puertos, en una IP privada explícita. MySQL y la aplicación están en redes Docker internas; no tienen puertos publicados ni salida directa a Internet. PostgreSQL pertenece al grupo local existente y no forma parte de este despliegue.

La imagen se construye por etapas con dependencias de producción. No contiene `.env`, certificados locales, respaldos, documentación clínica, Git ni pruebas. La aplicación y el proxy funcionan sin root, con sistema de archivos de solo lectura, capacidades retiradas y límites de memoria/procesos. Las imágenes base están fijadas por digest; deben renovarse y verificarse periódicamente.

Requisitos: Linux soportado y actualizado, Docker Engine con Compose v2 y `--wait`, Node.js 24 para las herramientas de operación, DNS interno, hora sincronizada y almacenamiento cifrado gestionado por TI. La solicitud de VM del 17 de noviembre propone Ubuntu Server 24.04 LTS, 4 vCPU, 8 GB de RAM ampliables y 100 GB SSD, con copias fuera de la VM; se conserva ese dimensionamiento inicial. Durante las pruebas de restauración se ejecuta un MySQL adicional. Dimensione disco y tiempos con el volumen real. El paquete construido aquí corresponde a contenedores Linux x86-64; en otra arquitectura vuelva a compilar y probar.

La solicitud de VM original menciona Nginx y describe el estado anterior de permisos y migraciones. Esta guía documenta la preparación actual con Caddy, roles y MFA obligatorios y migraciones separadas; no todas las cuentas tienen administración. TI debe validar esta actualización técnica al atender la solicitud. Si requiere Nginx o certificados de la PKI institucional, adapte y vuelva a probar el proxy antes del corte.

## Configuración del servidor

1. TI debe asignar IP fija, DNS y subredes autorizadas. Ejemplo: IP `192.168.10.20`, DNS `cirugia.clinica.internal`, red `192.168.10.0/24`. Son ejemplos, no datos confirmados de la clínica.
2. Copie el código y la imagen por un canal institucional. Los secretos se transfieren por separado, con acceso restringido. No copie toda la carpeta de trabajo ni `.env`, `.env.docker`, `.env.postgres.docker`, `.local-secrets` o respaldos mediante un repositorio o servicio público.
3. Para una **instalación nueva sin datos**, prepare secretos distintos en el servidor:

```bash
node deploy/prepare.mjs --instance=clinica --domain=cirugia.clinica.internal --bind=192.168.10.20 --cidrs=192.168.10.0/24 --email=administrador@clinica.example
```

El asistente genera contraseñas aleatorias y claves, sin imprimirlas. Rechaza sobrescribir una preparación existente. La configuración está en `deploy/private/clinica/production.env`; se pueden ajustar ahí IP, DNS, puertos, CIDR, correo e imagen. `APP_ORIGIN` debe coincidir exactamente con el origen HTTPS, sin barra final. No se admite `0.0.0.0`, IP pública, rangos públicos ni CIDR demasiado amplio.

En este equipo **no repita `prepare` para `clinica`**: ya existe. Al transferir esta preparación para conservar el MFA, preserve su carpeta privada mediante un canal seguro y compruebe los permisos de destino. Esto conserva claves, pero no copia las historias clínicas.

En Linux los directorios `deploy/private`, la instancia, `secrets` y `backups` deben pertenecer al operador y tener modo `0700`; `production.env` debe ser `0600`. Los archivos de secreto usan `0444` dentro de ese árbol privado porque Compose los monta individualmente sin remapear UID/GID. No haga legible el directorio padre para otros usuarios. La aplicación recibe solo su contraseña MySQL y su clave MFA; el trabajo de migración recibe las credenciales administrativas. Estos archivos no están cifrados por Compose: cifrado de disco y custodia siguen siendo responsabilidades del servidor. Véase [secretos de Compose](https://docs.docker.com/compose/how-tos/use-secrets/).

## Construcción y primer inicio de una base nueva

```bash
docker build --tag cirugia-cardiovascular:preparada .
docker build --file deploy/MySQL.Dockerfile --tag cirugia-mysql:segura .
docker build --file deploy/Caddy.Dockerfile --tag cirugia-caddy:segura .
npm run deploy:check
npm run deploy:up
npm run deploy:status
node deploy/ops.mjs ca
```

También puede exportar la imagen ya construida con `docker save --output cirugia-cardiovascular.tar cirugia-cardiovascular:preparada` y cargarla con `docker load --input cirugia-cardiovascular.tar` en el servidor. Copie también el código de `deploy/` y los archivos necesarios para operar; la imagen no incluye las herramientas del equipo operador.

Exporte/cargue también `cirugia-mysql:segura` y `cirugia-caddy:segura`, o constrúyalas con sus Dockerfiles. El MySQL de despliegue funciona como UID 999, sin root ni capacidades adicionales, y retira herramientas auxiliares no utilizadas. La aplicación usa un runtime Alpine sin npm/Yarn. El proxy contiene las dependencias corregidas del propio upstream; las dependencias de desarrollo usan la copia local restringida de picomatch. Consulte los [controles y correcciones](controles-automaticos.md) y ejecute `npm run security:gate -- --images` antes de habilitar el uso institucional.

`up` crea volúmenes externos identificados con etiquetas, inicia MySQL, ejecuta las migraciones con la aplicación detenida, concede permisos por tabla e inicia aplicación y proxy. El servicio normal tiene `RUN_MIGRATIONS=false`. El trabajo de migración no permanece activo. Se eliminan sesiones anteriores al completar el mantenimiento; las contraseñas y el MFA de cuentas existentes se conservan. La cuenta inicial de una instalación nueva usa la contraseña del archivo privado `secrets/bootstrap_password`, exige cambiarla y configurar MFA antes de consultar datos. Entréguela presencialmente al administrador; no la pegue en chats ni registros.

Tras validar una versión, use una etiqueta de versión distinta y conserve la imagen anterior. Edite `APP_IMAGE` para cada actualización; no sobrescriba la única copia de una imagen en uso. No se ha subido ninguna imagen a un registro externo.

## Red y certificados

Caddy acepta solo conexiones cuya IP real del socket pertenezca a `CLINIC_CIDRS`; no usa `X-Forwarded-For` para el filtro. Esto presupone acceso LAN/VPN directo al servidor. Un balanceador, NAT o proxy adicional puede ocultar las IP originales y requiere revisar esta configuración antes de usarlo. No añada la pasarela Docker a la lista de producción para eludir un bloqueo; el test aislado lo hace exclusivamente por la traducción de Docker Desktop.

TI debe restringir los puertos HTTP/HTTPS a las VLAN y VPN autorizadas, evitar redirecciones desde Internet y mantener SSH y Docker únicamente para operadores. Las reglas deben cubrir el tráfico reenviado de Docker: UFW por sí solo puede no filtrar puertos publicados. Integre la política con el backend iptables/nftables usado por el servidor y verifique desde un equipo permitido y otro bloqueado. No deshabilite las reglas de aislamiento de Docker. Referencia: [firewalls y Docker](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

El proxy usa una CA interna persistente y emite certificados para el DNS configurado. `node deploy/ops.mjs ca` exporta **solo** `ca-publica-clinica.crt` y su huella SHA-256. TI debe comprobar esa huella por un canal separado e instalar la confianza en los equipos institucionales autorizados, preferiblemente con la administración central de certificados. Compruebe HTTPS desde un navegador sin omitir errores. No distribuya `root.key`, el volumen Caddy ni el archivo de recuperación de la CA: contienen material privado de firma. Si la clínica dispone de su propia PKI, coordine la emisión y el montaje del certificado antes del despliegue definitivo.

El certificado Windows para `localhost` no se usa en el servidor. Cambiar DNS, puertos o cadena de proxies exige volver a validar origen, cookies y certificado.

## Traslado de los datos locales

El primer inicio anterior crea una base nueva; **no es el procedimiento de traslado de historias existentes**. El traslado requiere una ventana de mantenimiento, cerrar escrituras locales, ejecutar `npm run backup` en el origen y verificar ese respaldo, conservar la clave MFA original y restaurar en un destino aislado antes del corte. Hay que comparar recuentos y permisos y comprobar el acceso MFA con usuarios autorizados. Mantenga la instalación local detenida durante el corte para evitar dos bases divergentes.

El formato de respaldo local (`CCVBACK1`, `.config.json.aes`, clave binaria `.local-secrets/backup.key`) es distinto del formato de despliegue descrito abajo. `restore-empty` no acepta el formato local. El traslado de la base actual queda pendiente de conocer el servidor y se realizará de forma controlada; no se ha intentado ni se entrega una base clínica en la imagen. La preparación local `clinica` conservó la clave MFA para ese traslado futuro.

## Respaldos de este despliegue

```bash
npm run deploy:backup
npm run deploy:verify-backup -- --file=/ruta/ARCHIVO.sql.gz.aes
```

Cada ejecución genera SQL comprimido cifrado con AES-256-GCM y un acompañante `.config.aes` que conserva clave MFA y PKI privada de Caddy. El acompañante incluye SHA-256 del SQL cifrado para vincular ambos archivos. Se verifica la autenticación del archivo completo antes de ejecutar SQL, se restaura en un MySQL temporal sin puertos ni red y se comprueba una semilla MFA si existe. La prueba temporal se elimina. Un respaldo alterado se rechaza. No se vuelcan contraseñas ni SQL al terminal. El MySQL de verificación usa almacenamiento temporal en memoria limitado a 1 GB; si la base supera esa capacidad, amplíe y ensaye el límite con recursos suficientes antes de adoptarlo para producción.

Conserve juntos ambos archivos y copie los cifrados a un destino institucional fuera del servidor. Custodie `secrets/backup_key` por separado, junto con un procedimiento para recuperar el resto de secretos y la configuración del servidor. Sin esa clave no se recupera el contenido. No hay destino externo ni política de retención configurados y no se eliminan copias automáticamente. Evite retener historias indefinidamente sin una decisión institucional.

La solicitud de VM propone retención inicial de treinta días y pide acordar pérdida máxima de información y tiempo de recuperación. Estos valores requieren aprobación institucional. Una copia diaria puede perder hasta el trabajo posterior a la última copia; no se ha configurado recuperación a un instante mediante binlogs ni alta disponibilidad.

Se incluyen plantillas `deploy/systemd/cirugia-backup.service` y `.timer` para respaldo diario a las 18:00 de Bogotá. TI debe ajustar rutas/usuario y revisar la política antes de instalarlas y habilitarlas en el servidor; **no están instaladas ni programadas aquí**. Compruebe `journalctl -u cirugia-backup.service`, configure aviso de fallo al responsable institucional y pruebe una recuperación completa periódica.

## Recuperación completa en destino vacío

Use esta opción únicamente para respaldos creados por `deploy:backup`, en un servidor de recuperación con volúmenes nuevos y el mismo nombre de instancia/proyecto. Recupere por un canal seguro la preparación privada original y ajuste IP/redes del destino. Conserve el DNS original mediante un DNS de pruebas para verificar el certificado sin cambiar la CA.

Si solo conserva los respaldos y `backup_key`, ejecute primero `prepare` en el servidor nuevo con el mismo nombre de instancia y DNS: generará credenciales para el MySQL nuevo y claves temporales. Sustituya el archivo generado `secrets/backup_key` por el original custodiado, manteniendo directorios `0700` y archivo `0444`. Ejecute `recover-config`, sustituya la clave MFA temporal por la extraída al directorio privado que indique el comando y mantenga `0444`. Después ejecute `restore-empty`. No arranque primero la aplicación ni inicialice tablas con `up`. Las credenciales MySQL nuevas son válidas porque el destino está vacío; no se necesitan las contraseñas originales de root para ese servidor nuevo.

```bash
node deploy/ops.mjs recover-config --instance=clinica --file=/ruta/ARCHIVO.sql.gz.aes
node deploy/ops.mjs restore-empty --instance=clinica --file=/ruta/ARCHIVO.sql.gz.aes
```

`recover-config` verifica una restauración aislada y extrae MFA y archivo PKI a un directorio privado nuevo; no reemplaza secretos activos. Si se perdió `mfa_key`, restáurela desde ese directorio con los servicios detenidos. `restore-empty` exige una base sin tablas y un volumen de CA sin inicializar; rechaza destinos existentes, comprueba que la clave MFA coincida, recupera SQL y CA, aplica migraciones/permisos, revoca sesiones anteriores e inicia los servicios. No borra bases ni volúmenes. Si una restauración queda interrumpida y parcialmente aplicada, conserve los registros y use otro destino vacío; no reintente sobre datos parciales ni elimine la base original.

El directorio privado completo original facilita recuperar contraseñas, pero la clave de cifrado de respaldos debe conservarse separada de las copias. Los hashes de contraseña, semillas MFA, códigos y CA son datos sensibles también en los ensayos: use equipos y personal autorizados. La prueba automatizada usa únicamente cuentas y bases ficticias.

## Actualizaciones, operación y reversión

Ejecute las comprobaciones antes de aprobar una versión:

```bash
npm ci
npx playwright install chromium
npm run test:security
npm run test:security:mysql
npm run deploy:test
npm run lint
npm audit --omit=dev
docker build --tag cirugia-cardiovascular:VERSION .
docker build --file deploy/MySQL.Dockerfile --tag cirugia-mysql:segura .
docker build --file deploy/Caddy.Dockerfile --tag cirugia-caddy:segura .
# deploy:smoke usa la etiqueta cirugia-cardiovascular:preparada y recursos ficticios.
npm run deploy:smoke
```

En la versión final deben coincidir la imagen probada y `APP_IMAGE`. Las pruebas de desarrollo usan Chromium y dependencias que no se incluyen en la imagen final. Los avisos de picomatch y Caddy se corrigieron y sus pruebas de regresión se ejecutan en el control integral. Revise actualizaciones y alertas de imágenes/sistema; una auditoría npm no analiza las vulnerabilidades del sistema operativo de los contenedores. Cuando existan publicaciones oficiales que incorporen las mismas correcciones, sustituya las adaptaciones locales y repita las comprobaciones.

`deploy:up` detiene escrituras y crea/verifica un respaldo antes de migrar una base existente. Si falla el respaldo, intenta arrancar los contenedores anteriores y no migra. Si falla una migración, mantenga la aplicación detenida y evalúe la recuperación; el DDL MySQL no ofrece reversión transaccional general. Para aprobar una copia previamente creada se puede indicar `node deploy/ops.mjs up --backup=/ruta/ARCHIVO.sql.gz.aes`; se verifica de nuevo. Las operaciones de mantenimiento se serializan por `operation.lock`; si queda tras una terminación abrupta, compruebe el PID y que no haya trabajo activo antes de retirarlo.

Los volúmenes son externos: `down -v` no los elimina. La herramienta rechaza volúmenes sin la etiqueta de esa instancia para evitar reutilizar bases por error. Un administrador de Docker sí puede eliminarlos manualmente; no use limpiezas globales de volúmenes.

Supervise `deploy:status`, espacio, copias verificadas, fecha/hora y caducidad de certificados. La API ofrece `/api/salud`; el control de disponibilidad con `SELECT 1` usa `/_health/ready` solo desde loopback dentro del contenedor y rechaza acceso por el proxy. Docker informa `unhealthy`, pero no reinicia automáticamente un proceso que sigue vivo solo por ese estado; configure alertas institucionales. El cierre SIGTERM espera peticiones y conexiones, con límite de veinte segundos.

Los registros Docker rotan. Los errores de Caddy eliminan el objeto de solicitud para evitar guardar búsquedas, cookies y cabeceras; no se habilitan logs de acceso con URL. La auditoría clínica sigue dentro de MySQL. Un operador con root/Docker puede leer secretos y datos; proteja su identidad, disco, copias y acceso remoto.

La reversión debe usar una imagen anterior conservada y una base/clave MFA/CA coherentes, ensayadas en destino vacío. Cambiar solamente la imagen no revierte una migración. El despliegue necesita finalmente IP/DNS reales, política de red, distribución de confianza, destino externo de respaldo, responsables operativos y validación institucional. Estos datos no se inventan ni se sustituyen por una publicación pública.
