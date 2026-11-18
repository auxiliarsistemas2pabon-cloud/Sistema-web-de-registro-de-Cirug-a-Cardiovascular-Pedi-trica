import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const pico = require('picomatch')
test('Vite y sus consumidores resuelven la copia corregida, sin una segunda versión vulnerable', () => {
  const esperado = realpathSync(resolve('vendor/picomatch/index.js'))
  for (const paquete of ['vite','tinyglobby','fdir']) {
    const desde = createRequire(require.resolve(paquete))
    assert.equal(realpathSync(desde.resolve('picomatch')), esperado, paquete)
  }
  const provenance = JSON.parse(readFileSync('vendor/picomatch/UPSTREAM.json'))
  assert.equal(provenance.version,'4.0.7')
  for (const [file,sha] of Object.entries(provenance.original_sha256)) {
    const hash=createHash('sha256').update(readFileSync(resolve('vendor/picomatch',file))).digest('hex')
    if(file==='lib/parse.js')assert.notEqual(hash,sha,'El aviso no se corrige cambiando solo el nombre o versión.')
    else assert.equal(hash,sha,file+' conserva el original')
  }
})
test('los patrones del aviso se rechazan antes de construir expresiones con retroceso exponencial', () => {
  const child=spawnSync(process.execPath,['--input-type=commonjs','-e',`
    const p=require('picomatch');
    const patterns=['+(*)','+(*a)','*(*)b','+(*a)b','+(*?a)b','+([ab]*)b','+(*a|b)c','+(ab|abab)c'];
    for(const pattern of patterns)for(const options of [{},{maxExtglobRecursion:false},{fastpaths:false}]){
      for(const fn of [()=>p(pattern,options),()=>p.makeRe(pattern,options),()=>p.parse(pattern,options)]){
        let blocked=false;try{fn()}catch(e){if(e instanceof SyntaxError && e.message.includes('CVE-2026-112366'))blocked=true;else throw e}
        if(!blocked)process.exit(2);
      }
    }
  `],{encoding:'utf8',windowsHide:true,timeout:3000})
  assert.equal(child.error,undefined)
  assert.equal(child.status,0,child.stderr)
})
test('conserva patrones habituales, alternancias literales, negaciones y la reducción segura existente', () => {
  for(const [pattern,input,result] of [
    ['src/**/*.{ts,tsx}','src/pages/SeguridadCuentaPage.tsx',true],
    ['src/**/*.{ts,tsx}','src/index.css',false],
    ['**/!(*.test).js','server/index.js',true],
    ['**/!(*.test).js','server/index.test.js',false],
    ['+(foo|bar).js','foobar.js',true],
    ['+(ab).js','abab.js',true],
    ['+(*(a))b','aaaab',true],
    ['src/*.ts','src/a/b.ts',false],
  ])assert.equal(pico.isMatch(input,pattern),result,pattern+' '+input)
})
