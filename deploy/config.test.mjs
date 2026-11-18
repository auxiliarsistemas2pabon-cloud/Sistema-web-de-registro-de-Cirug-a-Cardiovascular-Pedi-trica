import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { privateCidr, validateEnv, instancePaths } from './lib.mjs'
import { verificarPrivilegiosAplicacion } from '../server/privilegios-db.mjs'

const env = { DEPLOY_INSTANCE:'clinica', STACK_NAME:'cirugia-prod-clinica', APP_DOMAIN:'cirugia.clinica.internal',
  BIND_IP:'192.168.10.5', HTTP_PORT:'80', HTTPS_PORT:'443', APP_ORIGIN:'https://cirugia.clinica.internal',
  CLINIC_CIDRS:'192.168.10.0/24 10.20.0.0/16', DB_NAME:'cardio_pediatrica', INITIAL_ADMIN_EMAIL:'admin@example.test', APP_IMAGE:'cirugia-cardiovascular:preparada' }
test('solo acepta redes completas dentro de los rangos privados', () => {
  for(const c of ['127.0.0.1/32','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','fd12::/48','::1/128'])assert.equal(privateCidr(c),true,c)
  for(const c of ['0.0.0.0/0','10.0.0.0/0','172.16.0.0/8','192.168.0.0/8','8.8.8.8/32','::/0','::1/64','fd12::/6','192.168.1.0/33','10.0.0.1/32/0'])assert.equal(privateCidr(c),false,c)
})
test('rechaza exposición pública, origen ambiguo y reutilización del proyecto local', () => {
  assert.deepEqual(validateEnv({...env}),env)
  for(const change of [{BIND_IP:'0.0.0.0'},{BIND_IP:'8.8.8.8'},{STACK_NAME:'cirugia-cardiovascular'},
    {APP_ORIGIN:env.APP_ORIGIN+'/login'},{CLINIC_CIDRS:'0.0.0.0/0'},{DEPLOY_INSTANCE:'../clinica'},
    {HTTP_PORT:'443'},{APP_DOMAIN:'cirugia.internal {$OTRO}'},{APP_IMAGE:'image; id'}])assert.throws(()=>validateEnv({...env,...change}))
  assert.throws(()=>instancePaths('../clinica'))
})
test('los permisos de runtime rechazan roles, concesiones globales y cambios de auditoría', async () => {
  const check=(grants)=>verificarPrivilegiosAplicacion({query:async()=>[grants.map(g=>({grant:g}))]})
  await check(["GRANT USAGE ON *.* TO `app`@`%`", "GRANT SELECT, INSERT, UPDATE, DELETE ON `cardio`.`pacientes` TO `app`@`%`", "GRANT SELECT, INSERT ON `cardio`.`auditoria` TO `app`@`%`"])
  for(const grant of ["GRANT SELECT ON *.* TO `app`@`%`", "GRANT `superadmin`@`%` TO `app`@`%`", "GRANT SYSTEM_USER ON *.* TO `app`@`%`",
    "GRANT UPDATE ON `cardio`.`auditoria` TO `app`@`%`", "GRANT DELETE ON `cardio`.`eventos_seguridad` TO `app`@`%`",
    "GRANT INSERT ON `cardio`.`migraciones_datos` TO `app`@`%`", "GRANT SELECT ON `cardio`.`pacientes` TO `app`@`%` WITH GRANT OPTION"])await assert.rejects(check([grant]))
})
test('el servidor falla cerrado ante orígenes, migraciones y redes remotas mal configuradas', () => {
  const check=(change)=>spawnSync(process.execPath,['--input-type=module','-e',"const {config}=await import('./server/config.mjs');if(config.limiteLoginIp!==30)process.exit(2)"],{
    windowsHide:true,encoding:'utf8',env:{...process.env,NODE_ENV:'production',LOCAL_HTTPS:'false',RUN_MIGRATIONS:'false',
      APP_ORIGIN:'https://cirugia.clinica.internal',MFA_ENCRYPTION_KEY:'ab'.repeat(32),DB_HOST:'mysql',DB_USER:'app',DB_PASSWORD:'prueba',DB_NAME:'cardio',
      DB_ISOLATED_NETWORK:'true',DB_TLS:'false',LOGIN_IP_LIMIT:'30',...change}})
  assert.equal(check({}).status,0)
  for(const change of [{NODE_ENV:'prod'},{RUN_MIGRATIONS:'true'},{APP_ORIGIN:''},{APP_ORIGIN:'http://cirugia.clinica.internal'},
    {APP_ORIGIN:'https://cirugia.clinica.internal/login'},{DB_ISOLATED_NETWORK:'false'},{DB_HOST:'servidor-remoto'},
    {LOGIN_IP_LIMIT:'10000'}])assert.notEqual(check(change).status,0)
})
