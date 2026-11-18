import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root,run,reports,prepareReports } from './lib.mjs'

try {
  const expected=JSON.parse(readFileSync(resolve(root,'deploy/proxy/UPSTREAM.json'),'utf8'))
  const execute=(command)=>{
    const r=run('docker',['run','--rm','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL',
      '--security-opt','no-new-privileges:true','--entrypoint','caddy','cirugia-caddy:segura',command])
    if(r.status!==0)throw new Error('No se pudo comprobar el ejecutable de Caddy.')
    return r.stdout
  }
  const version=execute('version'),info=execute('build-info')
  const modules=new Map(info.split('\n').filter(l=>l.startsWith('dep\t')).map(l=>l.split('\t').slice(1,3)))
  if(!version.startsWith(expected.caddy+' ')||modules.has('github.com/go-jose/go-jose/v3')
    || modules.get('github.com/go-jose/go-jose/v4')!=='v4.1.9'||modules.get('golang.org/x/net')!=='v0.62.0') {
    throw new Error('La imagen del proxy no contiene la resolución de dependencias corregida.')
  }
  prepareReports();writeFileSync(resolve(reports,'caddy-build-info.txt'),info,{mode:0o600})
  console.log(JSON.stringify({control:'dependencias_reales_proxy',caddy:expected.caddy,go_jose_v3_ausente:true,go_jose_v4:'v4.1.9',x_net:'v0.62.0'}))
}catch(e){console.error(e.message);process.exitCode=1}
