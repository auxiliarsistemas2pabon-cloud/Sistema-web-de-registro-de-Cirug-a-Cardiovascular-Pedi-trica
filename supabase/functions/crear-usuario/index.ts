// Crea un usuario (auth.users + perfiles). Solo un Administrador puede invocarla.
// El rol `authenticated` normal no tiene permiso para llamar a la Admin API de
// Supabase Auth directamente, por eso esto vive en una Edge Function con
// SUPABASE_SERVICE_ROLE_KEY (que nunca se expone al frontend).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ROLES_VALIDOS = ['administrador', 'registrador', 'consulta']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Cliente con la identidad de quien llama, solo para verificar que es Administrador.
  const clienteInvocador = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: datosUsuario, error: errorUsuario } = await clienteInvocador.auth.getUser()
  if (errorUsuario || !datosUsuario.user) return json({ error: 'No autorizado' }, 401)

  const { data: perfil } = await clienteInvocador
    .from('perfiles')
    .select('rol')
    .eq('id', datosUsuario.user.id)
    .single()

  if (perfil?.rol !== 'administrador') {
    return json({ error: 'Solo un Administrador puede crear usuarios.' }, 403)
  }

  const { email, password, nombre_completo, rol } = await req.json()

  if (!email || !password || !nombre_completo || !rol) {
    return json({ error: 'Faltan campos obligatorios.' }, 400)
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return json({ error: 'Rol inválido.' }, 400)
  }

  // Cliente con privilegios de servicio, solo a partir de aquí (usuario ya verificado).
  const clienteAdmin = createClient(supabaseUrl, serviceRoleKey)

  const { data: nuevoUsuario, error: errorCrear } = await clienteAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (errorCrear || !nuevoUsuario.user) {
    return json({ error: errorCrear?.message ?? 'No se pudo crear el usuario.' }, 400)
  }

  const { error: errorPerfil } = await clienteAdmin
    .from('perfiles')
    .insert({ id: nuevoUsuario.user.id, nombre_completo, rol })

  if (errorPerfil) {
    // Si el perfil no se pudo crear, no dejamos un usuario de auth "huérfano" sin perfil.
    await clienteAdmin.auth.admin.deleteUser(nuevoUsuario.user.id)
    return json({ error: errorPerfil.message }, 400)
  }

  return json({ id: nuevoUsuario.user.id, email })
})
