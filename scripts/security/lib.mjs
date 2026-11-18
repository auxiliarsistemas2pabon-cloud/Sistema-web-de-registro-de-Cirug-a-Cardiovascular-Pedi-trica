import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, copyFileSync, lstatSync, realpathSync, rmSync } from 'node:fs'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { protectDirectory } from '../../deploy/lib.mjs'

export const root=fileURLToPath(new URL('../../',import.meta.url))
export const reports=resolve(root,'.local-secrets/security-reports')
export const toolsConfig=JSON.parse(readFileSync(resolve(root,'security/tools.json'),'utf8'))
export const run=(file,args,options={})=>spawnSync(file,args,{cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:16*1024*1024,...options})
export function prepareReports(){protectDirectory(reports)}
export async function binary(name){
  if(process.arch!=='x64'||!['win32','linux'].includes(process.platform))throw new Error('Estas herramientas requieren x64 Windows/Linux; prepare la versión verificada de su plataforma.')
  const tool=toolsConfig[name],asset=tool[process.platform],directory=resolve(root,'.local-secrets/security-tools',name)
  protectDirectory(directory)
  const archive=resolve(directory,asset.asset),exe=resolve(directory,name+(process.platform==='win32'?'.exe':''))
  if(!existsSync(archive)){
    const response=await fetch(tool.base+asset.asset,{signal:AbortSignal.timeout(120000)})
    if(!response.ok)throw new Error('No se pudo descargar '+name)
    writeFileSync(archive,Buffer.from(await response.arrayBuffer()),{mode:0o600,flag:'wx'})
  }
  if(createHash('sha256').update(readFileSync(archive)).digest('hex')!==asset.sha256)throw new Error('La descarga no corresponde al checksum fijado: '+name)
  const manifest=resolve(directory,'binary.sha256')
  if(!existsSync(exe)||!existsSync(manifest)){
    if(process.platform==='win32'){
      const quote=s=>"'"+s.replaceAll("'","''")+"'"
      const script=`Add-Type -AssemblyName System.IO.Compression.FileSystem; $scanArchive=[IO.Compression.ZipFile]::OpenRead(${quote(archive)}); try { [IO.Compression.ZipFileExtensions]::ExtractToFile($scanArchive.GetEntry(${quote(name+'.exe')}),${quote(exe)},$true) } finally { $scanArchive.Dispose() }`
      execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'pipe'})
    }else{execFileSync('tar',['-xzf',archive,'-C',directory,name],{stdio:'pipe'});chmodSync(exe,0o700)}
    writeFileSync(manifest,createHash('sha256').update(readFileSync(exe)).digest('hex'),{mode:0o600})
  }
  if(createHash('sha256').update(readFileSync(exe)).digest('hex')!==readFileSync(manifest,'utf8'))throw new Error('El ejecutable cambió desde su verificación: '+name)
  return exe
}
export function sourceFiles(){
  const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).split('\0').filter(Boolean)
  return [...new Set(files)].filter(p=>existsSync(resolve(root,p)))
}
export function forbiddenSource(path){
  return /(^|\/)(?:\.env(?:\..*)?|\.local-secrets|backups|secrets|private)(?:\/|$)/i.test(path)&&path!=='.env.example'
    || /\.(?:pfx|p12|key|sql|sql\.gz|sql\.gz\.aes)$/i.test(path)
}
export function snapshot(){
  prepareReports()
  const directory=resolve(reports,'source-'+randomBytes(6).toString('hex'));protectDirectory(directory)
  let count=0
  for(const p of sourceFiles()){
    const normalized=p.replaceAll('\\','/')
    if(forbiddenSource(normalized))throw new Error('Archivo privado incluido en el código: '+normalized)
    if(!/\.(?:mjs|cjs|js|ts|tsx|json|ya?ml|toml|md|ps1|sh|txt|conf|config|ini|xml|html|css|go|mod|sum)$|(^|\/)(?:[^/]*Dockerfile|pre-commit|\.gitleaksignore|\.dockerignore|\.gitignore|\.env\.example)$/.test(normalized))continue
    const source=resolve(root,p)
    if(lstatSync(source).isSymbolicLink()||!realpathSync(source).startsWith(realpathSync(root)+sep))throw new Error('No se permiten enlaces fuera del código.')
    const destination=resolve(directory,p)
    mkdirSync(dirname(destination),{recursive:true,mode:0o700});copyFileSync(source,destination);count++
  }
  return{directory,count}
}
export function cleanSnapshot(directory){
  const parent=realpathSync(reports),target=realpathSync(directory),name=relative(parent,target)
  if(!/^source-[a-f0-9]{12}$/.test(name)||!target.startsWith(parent+sep)||lstatSync(directory).isSymbolicLink())throw new Error('Directorio de limpieza no válido.')
  rmSync(target,{recursive:true,force:true})
}
