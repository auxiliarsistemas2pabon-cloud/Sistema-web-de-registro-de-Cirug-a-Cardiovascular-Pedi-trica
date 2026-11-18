import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { binary,run,root,reports,prepareReports,forbiddenSource } from './lib.mjs'
try{
  const staged=run('git',['diff','--cached','--name-only','-z','--diff-filter=ACMR'])
  if(staged.status!==0)throw new Error('No se pudo revisar el índice de Git.')
  const blocked=staged.stdout.split('\0').filter(Boolean).filter(forbiddenSource)
  if(blocked.length)throw new Error('Retire los archivos privados del commit: '+blocked.join(', '))
  prepareReports()
  const path=resolve(reports,'staged.json')
  const r=run(await binary('gitleaks'),['git',root,'--pre-commit','--staged','--log-opts=--no-textconv','--redact=100','--no-banner','--log-level=error','--exit-code=2','--report-format=json','--report-path='+path])
  if(![0,2].includes(r.status))throw new Error('No se pudo completar la revisión del commit.')
  const findings=JSON.parse(readFileSync(path,'utf8'))
  console.log(JSON.stringify({control:'commit',posibles_secretos:findings.length}))
  if(findings.length)throw new Error('El commit contiene posibles secretos. Consulte el informe privado redactado antes de continuar.')
}catch(e){console.error(e.message);process.exitCode=1}
