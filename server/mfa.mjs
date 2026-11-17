import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import * as OTPAuth from 'otpauth'
import { config } from './config.mjs'
import { ErrorApi } from './errores.mjs'

export function cifrarSecreto(texto) {
  const iv = randomBytes(12)
  const cifrador = createCipheriv('aes-256-gcm', config.mfaKey, iv)
  const contenido = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()])
  return [iv, cifrador.getAuthTag(), contenido].map((b) => b.toString('base64url')).join('.')
}

export function descifrarSecreto(texto) {
  const [iv, tag, contenido] = texto.split('.').map((v) => Buffer.from(v, 'base64url'))
  const descifrador = createDecipheriv('aes-256-gcm', config.mfaKey, iv)
  descifrador.setAuthTag(tag)
  return Buffer.concat([descifrador.update(contenido), descifrador.final()]).toString('utf8')
}

export function nuevoTotp(email) {
  return new OTPAuth.TOTP({ issuer: 'Cirugía Cardiovascular', label: email, algorithm: 'SHA1', digits: 6, period: 30,
    secret: new OTPAuth.Secret({ size: 20 }) })
}

export function comprobarTotp(secreto, codigo, ultimoPaso = -1) {
  if (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo)) return null
  const tiempo = Date.now()
  const delta = OTPAuth.TOTP.validate({ secret: descifrarSecreto(secreto), token: codigo, timestamp: tiempo,
    window: 1, period: 30, digits: 6, algorithm: 'SHA1' })
  const paso = Math.floor(tiempo / 30_000) + (delta ?? 0)
  return delta !== null && paso > Number(ultimoPaso) ? paso : null
}

export const hashRecuperacion = (codigo) => createHash('sha256').update(codigo).digest('hex')
export function crearRecuperacion() {
  const codigos = Array.from({ length: 8 }, () => randomBytes(16).toString('hex'))
  return { codigos, hashes: codigos.map(hashRecuperacion) }
}

export function consumirRecuperacion(guardados, codigo) {
  if (typeof codigo !== 'string' || !/^[a-f0-9]{32}$/i.test(codigo)) return null
  const hashes = typeof guardados === 'string' ? JSON.parse(guardados) : guardados
  if (!Array.isArray(hashes)) return null
  const buscado = Buffer.from(hashRecuperacion(codigo.toLowerCase()), 'hex')
  const indice = hashes.findIndex((h) => /^[a-f0-9]{64}$/.test(h) && timingSafeEqual(Buffer.from(h, 'hex'), buscado))
  return indice < 0 ? null : hashes.filter((_h, i) => i !== indice)
}

export const codigoMfaInvalido = () => new ErrorApi(401, 'MFA_INVALIDO', 'Código incorrecto, vencido o ya utilizado.')
