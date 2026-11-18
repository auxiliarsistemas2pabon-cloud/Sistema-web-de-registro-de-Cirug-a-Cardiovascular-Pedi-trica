# Corrección local de picomatch

Base: picomatch 4.0.7, licencia MIT conservada en LICENSE. `UPSTREAM.json` identifica el origen y los hashes SHA-256 originales. Se mantiene el código original salvo dos bloques en `lib/parse.js` y los metadatos de este paquete local.

El aviso GHSA-fc5q-39xc-vjpf / CVE-2026-112366 afecta las ramas únicas con comodines dentro de extglobs repetidos, por ejemplo `+(*)` y `+(*a)`. Al 18-11-2026 no había una publicación corregida del fabricante. Esta copia rechaza explícitamente esos extglobs mediante SyntaxError antes de construir el RegExp, incluidas variantes que añadan otra alternativa para eludir la comprobación. La comprobación no se desactiva con `maxExtglobRecursion:false`. Se conserva la reducción segura ya existente de secuencias de caracteres, las alternativas literales sin prefijos solapados y las negaciones.

Es una restricción conservadora de sintaxis: algunas ramas no literales o ambiguas que eran válidas también se rechazan. No se convierten silenciosamente en resultados distintos. Use patrones simples o alternativas literales sin solapamiento si un patrón de construcción necesita adaptarse. Las pruebas ejercitan los casos del aviso en un proceso con tiempo límite, comprueban resoluciones de Vite/tinyglobby/fdir y validan patrones utilizados por el proyecto.

`package.json` usa un override explícito a este directorio y `package-lock.json` conserva esa resolución. El resultado de npm audit para una copia local depende de sus metadatos; por eso se exige además probar el comportamiento y los consumidores reales, en vez de usar únicamente el contador de npm. El control consulta también los avisos de picomatch 4.0.7 original: solo reconoce como reparado el aviso exacto que cubre este parche y falla si aparece otro. Así se conserva el seguimiento del fabricante aunque el paquete instalado tenga nombre local.

Cuando exista una publicación oficial que resuelva el aviso, sustituya la copia local, retire el override y repita las pruebas de regresión, compilación y navegador. No publique este paquete como si fuera una versión del fabricante.
