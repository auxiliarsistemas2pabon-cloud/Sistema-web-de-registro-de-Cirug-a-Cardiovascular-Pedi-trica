import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root,run,reports,prepareReports } from './lib.mjs'
try{
  prepareReports()
  // Se ejecuta la CLI instalada con Node, sin pasar credenciales a una shell.
  const npm=process.platform==='win32'?'npm.cmd':'npm'
  const audit=(prod)=>{
    const args=['audit','--json',...(prod?['--omit=dev']:[])]
    const r=process.platform==='win32'?run(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm '+args.join(' ')]):run(npm,args)
    let result
    try{result=JSON.parse(r.stdout)}catch{throw new Error('npm audit no produjo un informe válido.')}
    if(result.error||!result.metadata?.vulnerabilities)throw new Error('No se pudo consultar la base de avisos npm.')
    return result
  }
  const prod=audit(true),all=audit(false)
  // Una copia local no debe perder el seguimiento de avisos del paquete original.
  // Solo se considera reparado el aviso exacto ejercitado por las pruebas del parche.
  const provenance=JSON.parse(readFileSync(resolve(root,'vendor/picomatch/UPSTREAM.json'),'utf8'))
  const response=await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',{
    method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),
    body:JSON.stringify({picomatch:[provenance.version]}),
  })
  if(!response.ok)throw new Error('No se pudieron comprobar los avisos del paquete original.')
  const upstream=await response.json(),advisories=upstream.picomatch??[]
  if(!Array.isArray(advisories))throw new Error('El registro entregó una respuesta de avisos no válida.')
  const pending=advisories.filter(a=>a.url!==`https://github.com/advisories/${provenance.advisory}`)
  writeFileSync(resolve(reports,'dependencies-upstream.json'),JSON.stringify(upstream,null,2),{mode:0o600})
  console.log(JSON.stringify({control:'seguimiento_paquete_original',paquete:'picomatch',version_base:provenance.version,
    avisos_originales:advisories.length,corregidos_por_parche:advisories.length-pending.length,avisos_nuevos_pendientes:pending.length}))
  writeFileSync(resolve(reports,'dependencies-production.json'),JSON.stringify(prod,null,2),{mode:0o600})
  writeFileSync(resolve(reports,'dependencies-all.json'),JSON.stringify(all,null,2),{mode:0o600})
  console.log(JSON.stringify({control:'dependencias',produccion:prod.metadata.vulnerabilities,desarrollo_y_produccion:all.metadata.vulnerabilities}))
  // También bloquea los avisos de desarrollo. Un fallo se conserva visible hasta corregirlo.
  if(all.metadata.vulnerabilities.high||all.metadata.vulnerabilities.critical)throw new Error('Hay avisos altos/críticos pendientes; consulte el informe privado. No se aplican excepciones automáticas.')
  if(pending.length)throw new Error('Hay avisos nuevos del paquete original que el parche local no cubre. Se requiere revisión.')
}catch(e){console.error(e.message);process.exitCode=1}
