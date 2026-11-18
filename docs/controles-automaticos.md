# Controles automáticos y sesiones abiertas

## Cambios disponibles

En **Seguridad de mi cuenta → Sesiones abiertas** se muestran navegador/sistema orientativos, inicio y última actividad en hora de Bogotá. Cada cuenta puede ver y cerrar únicamente sus sesiones. Cerrar otra sesión exige identidad confirmada recientemente, rota también la cookie actual y conserva su vencimiento absoluto. Cerrar todas las otras incluye los accesos pendientes de MFA. No se muestran tokens, hashes, semillas, códigos, IP ni cadenas completas del navegador. Las sesiones antiguas pueden mostrar inicio no disponible; no se inventa su fecha.

Se añadieron `sesion_id`, `creado_en`, `actividad_en` y `dispositivo` a la tabla de sesiones mediante migración de mantenimiento. Se hizo un respaldo cifrado y se comprobó su restauración antes de aplicar esta migración local. No se añadieron tablas clínicas ni se cambió la política de qué pacientes puede leer cada perfil.

El inventario automático cubre 59 operaciones clínicas, incluidas las rutas generadas para módulos y episodios. Comprueba ausencia de sesión, permisos de consulta/registro y variantes de mayúsculas/barra final de operaciones sensibles. No sustituye una revisión independiente ni establece segmentación por equipo asistencial.

Las importaciones reciben JSON normalizado; el servidor no abre archivos Excel binarios. Por eso las pruebas atacan los lotes y las filas que realmente consume la API: rutas en nombres de archivo, objetos donde se espera texto, módulos inválidos, números de fila repetidos, fechas imposibles, más de 5.000 filas, filas mayores de 128 KiB, JSON profundo, claves de prototipo y cuerpos de más de 15 MiB. Se validan todas las filas antes de abrir la transacción. Se deshabilitó la descompresión de cuerpos HTTP para evitar amplificación por contenido comprimido. Se mantienen las validaciones clínicas al aplicar cada fila.

Las búsquedas tienen límite de 200 caracteres/doce palabras. Los parámetros de consulta deben ser escalares y no repetirse. Los filtros de indicadores conservan su JSON acotado. Los textos clínicos se muestran con escape de React y la exportación CSV conserva la neutralización de fórmulas.

## Ejecución local

Requiere Node.js 24, Docker y x64 Windows/Linux para los analizadores nativos preparados. Las herramientas se descargan de sus proyectos oficiales con versión y SHA-256 fijados en `security/tools.json`. No es necesario crear cuentas en esos servicios.

```powershell
npm run security:scan
node scripts/security/scan.mjs history
npm run security:dependencies
npm run security:images
node scripts/security/scan.mjs image cirugia-mysql:segura
npm run security:test
npm run security:gate -- --images
```

Gitleaks comprueba el código actual, el historial y el índice preparado para commit. Semgrep ejecuta reglas locales para SQL derivado de peticiones, ejecución dinámica y validación TLS, con métricas desactivadas y sin red dentro del contenedor. Se monta una copia de los archivos de código/documentación de Git; `.env`, claves, respaldos y carpetas privadas no se montan. Los archivos binarios Word/PDF/imágenes no se analizan como código. Trivy analiza las imágenes locales y descarga su base pública de vulnerabilidades; no se publican imágenes ni fuentes. npm audit consulta su servicio de avisos con metadatos de dependencias.

Los informes quedan en `.local-secrets/security-reports`, protegidos e ignorados por Git. Los de secretos se redactan al 100 % y el terminal solo muestra ubicación/regla, nunca el valor. Las pruebas de los analizadores inyectan datos ficticios para demostrar que un resultado vacío no se debe a una regla que no funciona. Son controles parciales: no reconocen todos los formatos de secreto ni todas las vulnerabilidades.

El historial contiene dos coincidencias revisadas como contraseñas ficticias de pruebas. `.gitleaksignore` limita las excepciones a sus huellas exactas, con commit/ruta/regla/línea. No hay exclusiones generales por archivo o por regla. Se comprobó que las cuentas históricas `reg/con@prueba.local` no existen en la base local. Las nuevas pruebas usan contraseñas aleatorias donde corresponde. No se reescribió el historial Git.

## Antes de cada commit y en GitHub

El hook local ya está instalado en esta copia con `core.hooksPath=.githooks`. Escanea el **índice de Git** y rechaza archivos privados o posibles secretos. No crea commits ni envía información. En otra copia ejecute `npm run security:install-hook`; se niega a reemplazar una configuración de hooks distinta. Para integrarlo con hooks existentes use el comando `node scripts/security/precommit.mjs`.

Se preparó `.github/workflows/security.yml` para push, pull request y ejecución manual. Compila, ejecuta pruebas de permisos/sesiones/importación/navegador/carga, construye imágenes, ensaya recuperación y analiza código, historial, dependencias e imágenes. Las acciones están fijadas por SHA, tienen permiso de lectura y no conservan credenciales de checkout. No se publican informes como artefactos. El workflow se ejecutará cuando se envíe a un repositorio GitHub; no se hizo push ni se configuró protección de ramas. Sistemas debe exigir ese check en la política del repositorio para impedir una integración con errores.

**El control devuelve error mientras haya avisos altos o críticos, incluso de desarrollo o sin corrección disponible.** Un fallo al descargar la base de avisos o al analizar archivos también impide considerarlo aprobado. No se usa `--ignore-unfixed`, no se silencian avisos de imágenes y no se aplican excepciones automáticas a dependencias.

## Correcciones de dependencias e imágenes

El análisis adicional encontró avisos que npm audit no cubría. Se cambió el runtime de la aplicación a Node 24 Alpine, manteniendo la construcción separada y retirando npm/Yarn de la imagen final. En el análisis ejecutado, la imagen resultante no presentó avisos altos/críticos. Esto no cubre otros niveles de severidad ni garantiza ausencia de fallos.

`deploy/MySQL.Dockerfile` usa la revisión actualizada de MySQL 8.4 fijada por digest y retira mysql-shell/Python y gosu, que no se utilizan. Se ejecuta como UID 999, sin capacidades adicionales, con raíz de solo lectura; los volúmenes nuevos se preparan con el propietario correcto sin copiar contenido de la imagen auxiliar. Esta imagen de despliegue también obtuvo cero avisos altos/críticos. El grupo local existente conserva sus motores y volúmenes; la imagen MySQL preparada se utiliza en el ensayo y el futuro despliegue, no se reemplazó el motor clínico local durante esta revisión.

Los cinco avisos altos de desarrollo procedían de picomatch. Como su fabricante todavía no publicó una versión corregida, se incorporó una [copia local corregida y documentada](../vendor/picomatch/README.md), con licencia y huellas originales conservadas. Rechaza antes de compilar los patrones que causaban retroceso exponencial y sus variantes con alternativas ambiguas; conserva los patrones habituales del proyecto. Es una restricción conservadora de sintaxis, por lo que ciertos patrones complejos dejan de aceptarse. El override se aplica a Vite, tinyglobby y fdir. Una instalación limpia y la auditoría npm completa dieron cero avisos. Las pruebas verifican el comportamiento y las resoluciones reales, además del contador de npm. No basta con renombrar el paquete para aprobar el control.

Los dos avisos de Caddy se corrigieron construyendo `cirugia-caddy:segura` con Caddy v2.11.9 y la actualización de dependencias del propio upstream: se retira go-jose/v3 y se usan go-jose/v4 v4.1.9 y x/net v0.62.0. [Origen y construcción](../deploy/proxy/README.md). La comprobación del ejecutable confirma esas versiones y la ausencia de v3; Trivy ya no reporta avisos altos/críticos en esa imagen. No se cambian algoritmos criptográficos ni se aplican exclusiones del analizador. Referencia del fabricante: [aviso de go-jose](https://github.com/go-jose/go-jose/security/advisories/GHSA-mgcc-cww5-fp2q).

`npm run security:test:patches` prueba casos del aviso en un proceso con tiempo límite y verifica compatibilidad con los patrones de construcción. El control integral ejecuta esas pruebas y comprueba las dependencias reales del binario del proxy. Mantenga los parches bajo revisión y sustitúyalos por publicaciones oficiales corregidas cuando existan; una actualización debe repetir instalación limpia, compilación, análisis y pruebas del despliegue. Cero avisos en estas comprobaciones no demuestra ausencia de vulnerabilidades desconocidas.

La auditoría consulta además los avisos del picomatch original, aunque se instale la copia local. El aviso exacto corregido se informa como reparado; cualquier aviso adicional detiene el control hasta revisarlo. Los informes de imágenes tienen nombres separados por referencia/hash para no sobrescribir el resultado de MySQL con el de Caddy.

## Carga y límites

```powershell
npm run test:security:load
```

El comando crea su propio MySQL y servidor en loopback y se niega a usar otra base que la de pruebas. El ensayo de 80 solicitudes simultáneas provocó contrapresión de la cola: 60 respuestas correctas y 20 rechazos controlados `503`, con percentil 95 aproximado de 1.029 ms. Al liberar la contención, diez solicitudes posteriores funcionaron. Una ráfaga separada de 1.300 peticiones anónimas activó respuestas `429`. No se leen historias clínicas para esa carga.

Es un ensayo funcional acotado en este equipo, no una medida de capacidad del futuro servidor ni una prueba DDoS. Antes de uso institucional hay que medir con recursos y volumen representativos, acordar límites por IP compartida y configurar alertas. Los límites generales por IP continúan en memoria de un solo proceso; varias réplicas requieren centralización.
