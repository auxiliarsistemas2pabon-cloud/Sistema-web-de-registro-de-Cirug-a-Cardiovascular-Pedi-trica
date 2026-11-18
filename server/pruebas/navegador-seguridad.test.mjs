import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import * as OTPAuth from 'otpauth'
import { chromium } from '@playwright/test'
if (process.env.SECURITY_TEST_DB !== '1' || process.env.DB_NAME !== 'cardio_pruebas') throw new Error('Use npm run test:security:browser para una base aislada.')
const { pool } = await import('../db.mjs')
const { nuevoTotp, cifrarSecreto, crearRecuperacion } = await import('../mfa.mjs')
after(async () => pool.end())
const base = process.env.API_URL
async function crearCuenta(pendiente = false) {
  const id = randomUUID(), email = `${id}@example.test`, secreto = nuevoTotp(email).secret.base32, codigos = crearRecuperacion()
  await pool.query("INSERT INTO usuarios (id, email, nombre_completo, password_hash, rol, clave_temporal, mfa_secret) VALUES (?, ?, 'Prueba navegador', ?, 'administrador', ?, ?)",
    [id, email, await bcrypt.hash('PruebaSegura123', 4), pendiente, pendiente ? null : cifrarSecreto(secreto)])
  if(!pendiente)await pool.query('UPDATE usuarios SET mfa_recuperacion=? WHERE id=?',[JSON.stringify(codigos.hashes),id])
  return { email, secreto, codigos:codigos.codigos }
}
async function formularioLogin(pagina, email) {
  await Promise.all([pagina.waitForResponse((r) => r.url().endsWith('/api/auth/me')), pagina.goto(`${base}/login`)])
  await pagina.locator('input[type="email"]').fill(email)
  await pagina.locator('input[autocomplete="current-password"]').fill('PruebaSegura123')
  await pagina.getByRole('button', { name: 'Entrar', exact: true }).click()
}
test('la pantalla permite cerrar otra sesión y el equipo revocado pierde acceso',async()=>{
  const cuenta=await crearCuenta(),navegador=await chromium.launch({headless:true})
  try{
    const contexto=await navegador.newContext(),pagina=await contexto.newPage();contexto.setDefaultTimeout(12000)
    await formularioLogin(pagina,cuenta.email)
    await pagina.getByLabel('Código de verificación').fill(OTPAuth.TOTP.generate({secret:cuenta.secreto}))
    await pagina.getByRole('button',{name:'Verificar código'}).click();await pagina.waitForURL('**/inicio')
    const otro=await navegador.newContext()
    const post=(path,body)=>otro.request.post(base+'/api/auth/'+path,{headers:{'X-Cardio-Request':'1'},data:body})
    assert.equal((await post('login',{email:cuenta.email,password:'PruebaSegura123'})).status(),200)
    assert.equal((await post('mfa/verificar',{codigo:cuenta.codigos[0]})).status(),200)
    const otraPagina=await otro.newPage();await otraPagina.goto(base+'/inicio')
    await pagina.goto(base+'/seguridad')
    await pagina.getByRole('heading',{name:'Sesiones abiertas'}).waitFor()
    await pagina.getByText(/Este equipo/).waitFor()
    await pagina.getByRole('button',{name:'Cerrar esta sesión',exact:true}).click()
    await pagina.getByRole('status').filter({hasText:'Sesión cerrada.'}).waitFor()
    assert.equal((await otro.request.get(base+'/api/auth/me')).status(),401)
    await otraPagina.reload();await otraPagina.waitForURL('**/login')
    assert.equal(await pagina.getByRole('button',{name:'Cerrar esta sesión',exact:true}).count(),0)
    await contexto.close();await otro.close()
  }finally{await navegador.close()}
})
test('MFA, cookie HttpOnly, cierre entre pestañas y reintento sin conexión funcionan con MySQL real', async () => {
  const cuenta = await crearCuenta(), navegador = await chromium.launch({ headless: true })
  try {
    const contexto = await navegador.newContext(); contexto.setDefaultTimeout(12_000)
    let falloCierre = false
    await contexto.route('**/api/auth/logout', (r) => falloCierre ? r.abort('failed') : r.continue())
    const pagina = await contexto.newPage(), errores = []
    pagina.on('pageerror', (e) => errores.push(e.message))
    await formularioLogin(pagina, cuenta.email)
    await pagina.getByLabel('Código de verificación').fill(OTPAuth.TOTP.generate({ secret: cuenta.secreto }))
    await pagina.getByRole('button', { name: 'Verificar código' }).click()
    await pagina.waitForURL('**/inicio')
    const cookie = (await contexto.cookies()).find((c) => c.name.endsWith('cardio_session'))
    assert.ok(cookie?.httpOnly); assert.equal(cookie.sameSite, 'Strict')
    assert.equal(cookie.secure, base.startsWith('https:'))
    if (cookie.secure) assert.equal(cookie.name, '__Host-cardio_session')
    assert.equal(await pagina.evaluate(() => document.cookie.includes('cardio_session')), false)
    assert.equal(await pagina.evaluate(() => sessionStorage.getItem('cardio_token')), null)
    const otra = await contexto.newPage(); await otra.goto(`${base}/inicio`)
    await otra.getByRole('button', { name: /Prueba navegador.*Administrador/ }).waitFor()
    falloCierre = true
    await pagina.getByRole('button', { name: /Prueba navegador.*Administrador/ }).click()
    await pagina.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
    await pagina.waitForURL('**/login'); await otra.waitForURL('**/login')
    await pagina.getByRole('alert').filter({ hasText: 'No se pudo cerrar la sesión' }).waitFor()
    assert.equal(await pagina.evaluate(() => localStorage.getItem('cardio_logout_pendiente')), '1')
    await pagina.reload()
    await pagina.getByRole('alert').filter({ hasText: 'No se pudo cerrar la sesión' }).waitFor()
    await pagina.getByRole('button', { name: 'Entrar', exact: true }).waitFor()
    assert.ok(pagina.url().endsWith('/login'))
    falloCierre = false
    const respuesta = pagina.waitForResponse((r) => r.url().endsWith('/api/auth/logout') && r.status() === 204)
    await pagina.getByRole('button', { name: 'Reintentar cierre de sesión' }).click(); await respuesta
    assert.equal(await pagina.evaluate(() => localStorage.getItem('cardio_logout_pendiente')), null)
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: `${cookie.name}=${cookie.value}` } })).status, 401)
    assert.deepEqual(errores, [])
  } finally { await navegador.close() }
})
test('el primer ingreso completa el cambio de clave y la inscripción MFA desde la interfaz', async () => {
  const cuenta = await crearCuenta(true), navegador = await chromium.launch({ headless: true })
  try {
    const contexto = await navegador.newContext(); contexto.setDefaultTimeout(12_000)
    const pagina = await contexto.newPage()
    await formularioLogin(pagina, cuenta.email)
    await pagina.getByLabel('Contraseña actual', { exact: true }).fill('PruebaSegura123')
    await pagina.getByLabel('Nueva contraseña', { exact: true }).fill('NuevaClaveNavegador456')
    await pagina.getByLabel('Repita la nueva contraseña', { exact: true }).fill('NuevaClaveNavegador456')
    await pagina.getByRole('button', { name: 'Cambiar contraseña', exact: true }).click()
    await pagina.getByRole('button', { name: 'Configurar doble factor' }).click()
    const secreto = await pagina.locator('code').textContent()
    await pagina.getByLabel('Código de verificación').fill(OTPAuth.TOTP.generate({ secret: secreto }))
    await pagina.getByRole('button', { name: 'Verificar código' }).click()
    await pagina.getByRole('heading', { name: 'Guarde sus códigos de recuperación' }).waitFor()
    await pagina.getByRole('button', { name: 'He guardado los códigos' }).click()
    await pagina.waitForURL('**/inicio')
  } finally { await navegador.close() }
})
