# Proxy Caddy corregido

`deploy/Caddy.Dockerfile` compila Caddy v2.11.9 con la actualización de dependencias publicada por el propio proyecto en el commit `31f9f0cb99491fdd1a27f82793b78d216c5b2a76`. El núcleo de Caddy se mantiene en su versión estable; `go.mod` y `go.sum` fijan las dependencias actualizadas.

La actualización de smallstep/certificates y go.step.sm/crypto elimina go-jose/v3 y utiliza go-jose/v4 v4.1.9. x/net pasa a v0.62.0. El código criptográfico se obtiene de los fabricantes; este repositorio no implementa ni modifica algoritmos criptográficos.

El compilador y la imagen Alpine de ejecución están fijados por digest. La imagen resultante se llama `cirugia-caddy:segura`; Compose la ejecuta como UID 1000, de solo lectura y sin capacidades. Se conserva la misma configuración, CA persistente, filtro de red y esquema de respaldos.

Construcción:

```sh
docker build --file deploy/Caddy.Dockerfile --tag cirugia-caddy:segura .
node scripts/security/scan.mjs image cirugia-caddy:segura
npm run deploy:smoke
```

Revise nuevas versiones oficiales de Caddy para retirar esta actualización local cuando incluyan las mismas correcciones. No cambie a la imagen oficial anterior sin repetir el análisis: conserva las dependencias afectadas.
