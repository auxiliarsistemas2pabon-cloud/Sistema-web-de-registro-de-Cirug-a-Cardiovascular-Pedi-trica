import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { binary,reports,prepareReports,run,toolsConfig,root,cleanSnapshot } from './lib.mjs'
import { protectDirectory } from '../../deploy/lib.mjs'

test('el detector encuentra un secreto ficticio y redacta su valor en el informe',async()=>{
  prepareReports()
  const directory=resolve(reports,'source-'+randomBytes(6).toString('hex'));protectDirectory(directory)
  const token='ghp_'+randomBytes(20).toString('hex')
  try{
    writeFileSync(resolve(directory,'ejemplo.js'),'const api_token = '+JSON.stringify(token)+';')
    const report=resolve(directory,'result.json')
    const r=run(await binary('gitleaks'),['dir',directory,'--redact=100','--no-banner','--log-level=error','--exit-code=2','--report-format=json','--report-path='+report])
    assert.equal(r.status,2)
    const text=readFileSync(report,'utf8');assert.ok(JSON.parse(text).length>0);assert.ok(!text.includes(token))
    assert.ok(!r.stdout.includes(token));assert.ok(!r.stderr.includes(token))
  }finally{cleanSnapshot(directory)}
})
test('el análisis estático detecta SQL construido con la petición, eval y TLS inseguro',()=>{
  prepareReports()
  const directory=resolve(reports,'source-'+randomBytes(6).toString('hex'));protectDirectory(directory)
  try{
    mkdirSync(resolve(directory,'server'));mkdirSync(resolve(directory,'security'))
    copyFileSync(resolve(root,'security/semgrep.yml'),resolve(directory,'security/semgrep.yml'))
    writeFileSync(resolve(directory,'server/ejemplo.mjs'),[
      'function unsafe(req, db) { const term=req.query.busqueda; db.query("SELECT * FROM pacientes WHERE nombre=" + term); }',
      'function dynamic(code) { return eval(code); }',
      'const tls = { rejectUnauthorized: false };',
    ].join('\n'))
    const r=run('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/tmp:rw,noexec,nosuid,size=256m',
      '-e','SEMGREP_SEND_METRICS=off','-e','SEMGREP_ENABLE_VERSION_CHECK=0','-e','HOME=/tmp','--mount',`type=bind,source=${directory},target=/src,readonly`,
      '--workdir','/src',toolsConfig.semgrep_image,'semgrep','scan','--config','security/semgrep.yml','--metrics=off','--disable-version-check','--no-git-ignore','--json','--error','server'])
    assert.equal(r.status,1,r.stderr.slice(0,1000))
    const result=JSON.parse(r.stdout),ids=result.results.map(v=>v.check_id)
    for(const id of ['cardio.sql-request-in-query','cardio.no-dynamic-code','cardio.tls-verification'])assert.ok(ids.some(x=>x.endsWith(id)),id)
    assert.equal(result.errors.length,0)
  }finally{cleanSnapshot(directory)}
})
test('la revisión del índice detecta un secreto aunque ya se haya limpiado la copia de trabajo',async()=>{
  prepareReports()
  const directory=resolve(reports,'source-'+randomBytes(6).toString('hex'));protectDirectory(directory)
  try{
    assert.equal(run('git',['init','--quiet',directory]).status,0)
    const token='ghp_'+randomBytes(20).toString('hex'),file=resolve(directory,'ejemplo.js')
    writeFileSync(file,'const api_token = '+JSON.stringify(token)+';')
    assert.equal(run('git',['-C',directory,'add','ejemplo.js']).status,0)
    writeFileSync(file,'const seguro = true;')
    const report=resolve(directory,'staged.json')
    const r=run(await binary('gitleaks'),['git',directory,'--pre-commit','--staged','--redact=100','--no-banner','--log-level=error','--exit-code=2','--report-format=json','--report-path='+report])
    assert.equal(r.status,2)
    const output=readFileSync(report,'utf8');assert.ok(JSON.parse(output).length>0);assert.ok(!output.includes(token))
  }finally{cleanSnapshot(directory)}
})
