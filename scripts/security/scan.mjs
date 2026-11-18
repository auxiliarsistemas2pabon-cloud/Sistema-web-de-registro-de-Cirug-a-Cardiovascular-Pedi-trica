import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { binary,run,root,reports,prepareReports,snapshot,cleanSnapshot,toolsConfig } from './lib.mjs'

const action=process.argv[2]||'source'
let source
try{
  prepareReports()
  if(action==='source'||action==='secrets'){
    source=snapshot()
    const file=resolve(reports,'secrets.json'),exe=await binary('gitleaks')
    const r=run(exe,['dir',source.directory,'--redact=100','--no-banner','--log-level=error','--exit-code=2','--report-format=json','--report-path='+file])
    if(![0,2].includes(r.status))throw new Error('No se pudo completar Gitleaks; el control no se considera aprobado.')
    const findings=JSON.parse(readFileSync(file,'utf8'))
    console.log(JSON.stringify({control:'secretos',archivos:source.count,coincidencias:findings.length,detalles:findings.map(f=>({regla:f.RuleID,archivo:f.File.replaceAll('\\','/').replace(source.directory.replaceAll('\\','/')+'/',''),linea:f.StartLine}))}))
    if(findings.length)throw new Error('Se detectaron posibles secretos. Revise el informe privado redactado antes de publicar código.')
    if(action==='source'){
      const out=resolve(reports,'semgrep.json')
      const args=['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/tmp:rw,noexec,nosuid,size=256m',
        '-e','SEMGREP_SEND_METRICS=off','-e','SEMGREP_ENABLE_VERSION_CHECK=0','-e','HOME=/tmp',
        '--mount',`type=bind,source=${source.directory},target=/src,readonly`,'--workdir','/src',toolsConfig.semgrep_image,
        'semgrep','scan','--config','security/semgrep.yml','--metrics=off','--disable-version-check','--no-git-ignore','--json','--error','server','src']
      const scan=run('docker',args,{maxBuffer:32*1024*1024})
      if(![0,1].includes(scan.status))throw new Error('No se pudo completar Semgrep; el control no se considera aprobado.')
      let result
      try{result=JSON.parse(scan.stdout)}catch{throw new Error('Semgrep no entregó un informe válido.')}
      writeFileSync(out,JSON.stringify(result,null,2),{mode:0o600})
      console.log(JSON.stringify({control:'analisis_estatico',hallazgos:result.results.length,errores:result.errors.length,
        detalles:result.results.map(f=>({regla:f.check_id,archivo:f.path,linea:f.start.line}))}))
      if(result.results.length||result.errors.length)throw new Error('El análisis estático encontró problemas o archivos sin analizar; revise el informe privado.')
    }
  }else if(action==='history'){
    const file=resolve(reports,'history.json'),exe=await binary('gitleaks')
    const r=run(exe,['git',root,'--log-opts=--all --no-textconv','--redact=100','--no-banner','--log-level=error','--exit-code=2','--report-format=json','--report-path='+file])
    if(![0,2].includes(r.status))throw new Error('No se pudo completar el análisis del historial Git.')
    const findings=JSON.parse(readFileSync(file,'utf8'))
    console.log(JSON.stringify({control:'historial_git',coincidencias:findings.length,detalles:findings.map(f=>({regla:f.RuleID,archivo:f.File,linea:f.StartLine,commit:f.Commit}))}))
    if(findings.length)throw new Error('El historial contiene posibles secretos; el control requiere revisión y no reescribe commits automáticamente.')
  }else if(action==='image'){
    const image=process.argv[3]||'cirugia-cardiovascular:preparada'
    if(!/^[a-z0-9][a-z0-9./:_@-]{1,220}$/i.test(image))throw new Error('Referencia de imagen no válida.')
    const label=image.replace(/[^a-z0-9._-]/gi,'_').slice(0,100)
    const suffix=createHash('sha256').update(image).digest('hex').slice(0,10)
    const exe=await binary('trivy'),file=resolve(reports,`image-${label}-${suffix}.json`)
    const r=run(exe,['image','--image-src','docker','--scanners','vuln','--severity','HIGH,CRITICAL','--format','json','--output',file,
      '--cache-dir',resolve(root,'.local-secrets/security-tools/trivy-cache'),'--timeout','15m','--exit-code','2',image])
    if(![0,2].includes(r.status))throw new Error('No se completó el análisis de la imagen; revise conectividad y base de vulnerabilidades de Trivy.')
    const report=JSON.parse(readFileSync(file,'utf8')),list=report.Results?.flatMap(v=>v.Vulnerabilities??[])??[]
    console.log(JSON.stringify({control:'imagen',imagen:image,altas_criticas:list.length,corregibles:list.filter(v=>v.FixedVersion).length,
      informe_privado:file,detalles:list.slice(0,10).map(v=>({cve:v.VulnerabilityID,paquete:v.PkgName,version:v.InstalledVersion,correccion:v.FixedVersion??null}))}))
    if(list.length)throw new Error('La imagen contiene avisos altos o críticos; el control permanece pendiente hasta su revisión/corrección.')
  }else throw new Error('Use source, secrets, history o image [IMAGEN].')
}catch(e){console.error(e.message);process.exitCode=1}
finally{if(source)cleanSnapshot(source.directory)}
