import { existsSync, chmodSync } from 'node:fs'
import { resolve } from 'node:path'
import { run,root } from './lib.mjs'
try{
  const current=run('git',['config','--get','core.hooksPath'])
  if(current.status===0&&current.stdout.trim()!=='.githooks')throw new Error('Ya hay una ruta de hooks personalizada. Integre el control sin reemplazar sus hooks.')
  const old=run('git',['rev-parse','--git-path','hooks/pre-commit'])
  if(current.status!==0&&existsSync(resolve(root,old.stdout.trim())))throw new Error('Ya existe un hook pre-commit. Integre el control existente sin sobrescribirlo.')
  if(process.platform!=='win32')chmodSync(resolve(root,'.githooks/pre-commit'),0o700)
  const r=run('git',['config','--local','core.hooksPath','.githooks'])
  if(r.status!==0)throw new Error('No se pudo instalar el hook local.')
  console.log('Control de secretos instalado para los próximos commits de esta copia. No se creó ni publicó ningún commit.')
}catch(e){console.error(e.message);process.exitCode=1}
