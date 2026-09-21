import 'dotenv/config'

function requerida(nombre) {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}. Revise su archivo .env.`)
  return valor
}

const jwtSecret = requerida('JWT_SECRET')
if (jwtSecret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres.')

export const config = {
  puerto: Number(process.env.PORT || 3001),
  produccion: process.env.NODE_ENV === 'production',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: requerida('DB_USER'),
    password: requerida('DB_PASSWORD'),
    database: requerida('DB_NAME'),
  },
  jwtSecret,
  // Sesión deslizante: el token dura esto y se renueva mientras el usuario siga activo.
  minutosSesion: Number(process.env.SESSION_MINUTES || 30),
  admin: {
    email: process.env.INITIAL_ADMIN_EMAIL,
    password: process.env.INITIAL_ADMIN_PASSWORD,
    nombre: process.env.INITIAL_ADMIN_NAME || 'Administrador',
  },
}
