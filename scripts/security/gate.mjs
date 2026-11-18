import { run } from './lib.mjs'
const commands=[['--test','scripts/security/dependencias-corregidas.test.mjs'],['scripts/security/scan.mjs','source'],['scripts/security/scan.mjs','history'],['scripts/security/dependencies.mjs']]
if(process.argv.includes('--images')){
  commands.push(['scripts/security/proxy-corregido.mjs'])
  commands.push(['scripts/security/scan.mjs','image','cirugia-cardiovascular:preparada'])
  commands.push(['scripts/security/scan.mjs','image','cirugia-mysql:segura'])
  commands.push(['scripts/security/scan.mjs','image','cirugia-caddy:segura'])
}
let failures=0
for(const args of commands){const r=run(process.execPath,args,{stdio:'inherit'});if(r.status!==0)failures++}
console.log(JSON.stringify({controles_ejecutados:commands.length,controles_pendientes:failures}))
if(failures)process.exitCode=1
