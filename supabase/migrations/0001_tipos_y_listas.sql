-- Tipos fijos (no administrables) y listas desplegables administrables por el Administrador.
-- Ver plan aprobado: docs/modelo-de-datos.md

-- Fija la zona horaria de la BD para que current_date/now() (usados en edades, alertas
-- de 15 días y validaciones de fecha) reflejen el día calendario de Pasto, no UTC.
-- En Supabase Cloud, además, confirmar el mismo valor en Project Settings > Database.
alter database postgres set timezone to 'America/Bogota';

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() viene marcada STABLE (no IMMUTABLE) en la extensión, así que no puede usarse
-- directamente en un índice funcional. Este envolvente IMMUTABLE es el patrón estándar de
-- Postgres para este caso (asume que el diccionario 'unaccent' no cambia en producción).
-- set search_path incluye extensions porque Supabase instala unaccent/pg_trgm ahí, no en
-- public; así evitamos depender de saber el esquema exacto del objeto regdictionary.
create or replace function fn_unaccent_inmutable(text)
returns text
language sql immutable strict
set search_path = public, extensions
as $$
  select unaccent($1);
$$;

create type rol_usuario as enum ('administrador', 'registrador', 'consulta');
create type estado_modulo_enum as enum ('pendiente', 'completo', 'no_aplica');
create type si_no as enum ('SI', 'NO');
create type si_no_na as enum ('SI', 'NO', 'NA');

-- ---------------------------------------------------------------------------
-- Categorías de lista (las 16 listas del enunciado)
-- ---------------------------------------------------------------------------

create table categorias_lista (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  descripcion text,
  creado_en timestamptz not null default now()
);

comment on table categorias_lista is 'Las 16 categorías de listas desplegables administrables desde la pantalla de Administración.';

insert into categorias_lista (codigo, nombre) values
  ('SEXO', 'Sexo'),
  ('PROCEDENCIA', 'Procedencia'),
  ('MUNICIPIOS', 'Municipios de Nariño'),
  ('EPS', 'EPS'),
  ('DIAGNOSTICO', 'Diagnóstico'),
  ('VALVULOPATIA', 'Tipo de valvulopatía'),
  ('RIESGOS', 'Factores de riesgo'),
  ('RACHS', 'Escala RACHS-1'),
  ('PROCEDIMIENTOS', 'Procedimientos quirúrgicos'),
  ('IMPLANTE', 'Tipo de implante'),
  ('COMPLICACION_INTRAQX', 'Complicación intraquirúrgica'),
  ('UNIDAD_POP', 'Unidad postoperatoria'),
  ('COMPLICACION_POP', 'Complicación postoperatoria'),
  ('CONDICION_SALIDA', 'Condición de salida'),
  ('ESTADO_HERIDA', 'Estado de la herida quirúrgica'),
  ('CAUSA_REINGRESO', 'Causa de reingreso');

-- ---------------------------------------------------------------------------
-- Opciones de cada lista
-- ---------------------------------------------------------------------------

create table opciones_lista (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references categorias_lista(id),
  -- Slug estable SOLO para las opciones que la lógica de negocio necesita identificar
  -- (ej. NARINO, VALVULOPATIAS, NINGUNO, MUERTE). NULL para el resto. No editable desde
  -- la UI de administración una vez sembrado.
  codigo text,
  valor text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (categoria_id, valor),
  unique (categoria_id, codigo)
);

comment on column opciones_lista.codigo is 'Slug estable usado por triggers/reglas de negocio. No confundir con el texto visible (valor), que el Administrador puede editar libremente.';

create index idx_opciones_lista_categoria on opciones_lista(categoria_id) where activo;

insert into opciones_lista (categoria_id, codigo, valor, orden)
select c.id, v.codigo, v.valor, v.orden
from (values
  -- SEXO
  ('SEXO', null, 'Femenino', 10),
  ('SEXO', null, 'Masculino', 20),
  ('SEXO', null, 'Otro', 30),

  -- PROCEDENCIA
  ('PROCEDENCIA', 'NARINO', 'Nariño', 10),
  ('PROCEDENCIA', null, 'Amazonas', 20),
  ('PROCEDENCIA', null, 'Antioquia', 30),
  ('PROCEDENCIA', null, 'Arauca', 40),
  ('PROCEDENCIA', null, 'Atlántico', 50),
  ('PROCEDENCIA', null, 'Bogotá D.C.', 60),
  ('PROCEDENCIA', null, 'Bolívar', 70),
  ('PROCEDENCIA', null, 'Boyacá', 80),
  ('PROCEDENCIA', null, 'Caldas', 90),
  ('PROCEDENCIA', null, 'Cali', 100),
  ('PROCEDENCIA', null, 'Caquetá', 110),
  ('PROCEDENCIA', null, 'Casanare', 120),
  ('PROCEDENCIA', null, 'Cauca', 130),
  ('PROCEDENCIA', null, 'Cesar', 140),
  ('PROCEDENCIA', null, 'Chocó', 150),
  ('PROCEDENCIA', null, 'Córdoba', 160),
  ('PROCEDENCIA', null, 'Cundinamarca', 170),
  ('PROCEDENCIA', null, 'Guainía', 180),
  ('PROCEDENCIA', null, 'Guaviare', 190),
  ('PROCEDENCIA', null, 'Huila', 200),
  ('PROCEDENCIA', null, 'La Guajira', 210),
  ('PROCEDENCIA', null, 'Magdalena', 220),
  ('PROCEDENCIA', null, 'Meta', 230),
  ('PROCEDENCIA', null, 'Norte de Santander', 240),
  ('PROCEDENCIA', null, 'Putumayo', 250),
  ('PROCEDENCIA', null, 'Quindío', 260),
  ('PROCEDENCIA', null, 'Risaralda', 270),
  ('PROCEDENCIA', null, 'San Andrés y Providencia', 280),
  ('PROCEDENCIA', null, 'Santander', 290),
  ('PROCEDENCIA', null, 'Sucre', 300),
  ('PROCEDENCIA', null, 'Tolima', 310),
  ('PROCEDENCIA', null, 'Valle del Cauca', 320),
  ('PROCEDENCIA', null, 'Vaupés', 330),
  ('PROCEDENCIA', null, 'Vichada', 340),
  ('PROCEDENCIA', null, 'Ecuador', 350),
  ('PROCEDENCIA', null, 'Otro país', 360),

  -- MUNICIPIOS (Nariño)
  ('MUNICIPIOS', null, 'Pasto', 10),
  ('MUNICIPIOS', null, 'Albán', 20),
  ('MUNICIPIOS', null, 'Aldana', 30),
  ('MUNICIPIOS', null, 'Ancuyá', 40),
  ('MUNICIPIOS', null, 'Arboleda', 50),
  ('MUNICIPIOS', null, 'Barbacoas', 60),
  ('MUNICIPIOS', null, 'Belén', 70),
  ('MUNICIPIOS', null, 'Buesaco', 80),
  ('MUNICIPIOS', null, 'Chachagüí', 90),
  ('MUNICIPIOS', null, 'Colón', 100),
  ('MUNICIPIOS', null, 'Consacá', 110),
  ('MUNICIPIOS', null, 'Contadero', 120),
  ('MUNICIPIOS', null, 'Córdoba', 130),
  ('MUNICIPIOS', null, 'Cuaspud', 140),
  ('MUNICIPIOS', null, 'Cumbal', 150),
  ('MUNICIPIOS', null, 'Cumbitara', 160),
  ('MUNICIPIOS', null, 'El Charco', 170),
  ('MUNICIPIOS', null, 'El Peñol', 180),
  ('MUNICIPIOS', null, 'El Rosario', 190),
  ('MUNICIPIOS', null, 'El Tablón de Gómez', 200),
  ('MUNICIPIOS', null, 'El Tambo', 210),
  ('MUNICIPIOS', null, 'Francisco Pizarro', 220),
  ('MUNICIPIOS', null, 'Funes', 230),
  ('MUNICIPIOS', null, 'Guachucal', 240),
  ('MUNICIPIOS', null, 'Guaitarilla', 250),
  ('MUNICIPIOS', null, 'Gualmatán', 260),
  ('MUNICIPIOS', null, 'Iles', 270),
  ('MUNICIPIOS', null, 'Imués', 280),
  ('MUNICIPIOS', null, 'Ipiales', 290),
  ('MUNICIPIOS', null, 'La Cruz', 300),
  ('MUNICIPIOS', null, 'La Florida', 310),
  ('MUNICIPIOS', null, 'La Llanada', 320),
  ('MUNICIPIOS', null, 'La Tola', 330),
  ('MUNICIPIOS', null, 'La Unión', 340),
  ('MUNICIPIOS', null, 'Leiva', 350),
  ('MUNICIPIOS', null, 'Linares', 360),
  ('MUNICIPIOS', null, 'Los Andes', 370),
  ('MUNICIPIOS', null, 'Magüí Payán', 380),
  ('MUNICIPIOS', null, 'Mallama', 390),
  ('MUNICIPIOS', null, 'Mosquera', 400),
  ('MUNICIPIOS', null, 'Nariño', 410),
  ('MUNICIPIOS', null, 'Olaya Herrera', 420),
  ('MUNICIPIOS', null, 'Ospina', 430),
  ('MUNICIPIOS', null, 'Policarpa', 440),
  ('MUNICIPIOS', null, 'Potosí', 450),
  ('MUNICIPIOS', null, 'Providencia', 460),
  ('MUNICIPIOS', null, 'Puerres', 470),
  ('MUNICIPIOS', null, 'Pupiales', 480),
  ('MUNICIPIOS', null, 'Ricaurte', 490),
  ('MUNICIPIOS', null, 'Roberto Payán', 500),
  ('MUNICIPIOS', null, 'Samaniego', 510),
  ('MUNICIPIOS', null, 'San Bernardo', 520),
  ('MUNICIPIOS', null, 'San Lorenzo', 530),
  ('MUNICIPIOS', null, 'San Pablo', 540),
  ('MUNICIPIOS', null, 'San Pedro de Cartago', 550),
  ('MUNICIPIOS', null, 'Sandoná', 560),
  ('MUNICIPIOS', null, 'Santa Bárbara', 570),
  ('MUNICIPIOS', null, 'Santacruz', 580),
  ('MUNICIPIOS', null, 'Sapuyes', 590),
  ('MUNICIPIOS', null, 'Taminango', 600),
  ('MUNICIPIOS', null, 'Tangua', 610),
  ('MUNICIPIOS', null, 'Tumaco', 620),
  ('MUNICIPIOS', null, 'Túquerres', 630),
  ('MUNICIPIOS', null, 'Yacuanquer', 640),

  -- EPS
  ('EPS', null, 'AIC', 10),
  ('EPS', null, 'Asmet Salud', 20),
  ('EPS', null, 'Emssanar', 30),
  ('EPS', null, 'Famisanar', 40),
  ('EPS', null, 'Mallamas', 50),
  ('EPS', null, 'Nueva EPS', 60),
  ('EPS', null, 'Particular', 70),
  ('EPS', null, 'Salud Total', 80),
  ('EPS', null, 'Sanitas', 90),
  ('EPS', null, 'SURA', 100),
  ('EPS', null, 'Otra', 110),

  -- DIAGNOSTICO
  ('DIAGNOSTICO', null, 'Anomalía de Ebstein', 10),
  ('DIAGNOSTICO', null, 'Anomalías de las arterias coronarias', 20),
  ('DIAGNOSTICO', null, 'Anomalías de la aorta ascendente, arco o descendente (hipoplasia, estenosis, interrupción)', 30),
  ('DIAGNOSTICO', null, 'Atresia pulmonar', 40),
  ('DIAGNOSTICO', null, 'Atresia tricuspídea', 50),
  ('DIAGNOSTICO', null, 'Canal auriculoventricular', 60),
  ('DIAGNOSTICO', null, 'Coartación de aorta', 70),
  ('DIAGNOSTICO', null, 'Comunicación interauricular (CIA)', 80),
  ('DIAGNOSTICO', null, 'Comunicación interventricular (CIV)', 90),
  ('DIAGNOSTICO', null, 'Cuerpo extraño intracardíaco', 100),
  ('DIAGNOSTICO', null, 'Doble salida del ventrículo derecho', 110),
  ('DIAGNOSTICO', null, 'Drenaje anómalo de venas pulmonares', 120),
  ('DIAGNOSTICO', null, 'Estenosis aórtica / lesión obstructiva del tracto de salida izquierdo', 130),
  ('DIAGNOSTICO', null, 'Estenosis pulmonar', 140),
  ('DIAGNOSTICO', null, 'Persistencia del conducto arterioso (PCA)', 150),
  ('DIAGNOSTICO', null, 'Síndrome de corazón izquierdo hipoplásico', 160),
  ('DIAGNOSTICO', null, 'Tetralogía de Fallot', 170),
  ('DIAGNOSTICO', null, 'Transposición de grandes arterias', 180),
  ('DIAGNOSTICO', null, 'Tronco arterioso', 190),
  ('DIAGNOSTICO', 'VALVULOPATIAS', 'Valvulopatías', 200),
  ('DIAGNOSTICO', null, 'Ventana aortopulmonar', 210),
  ('DIAGNOSTICO', null, 'Ventrículo único / fisiología univentricular', 220),
  ('DIAGNOSTICO', null, 'Otras cardiopatías congénitas', 230),

  -- VALVULOPATIA
  ('VALVULOPATIA', null, 'Estenosis', 10),
  ('VALVULOPATIA', null, 'Insuficiencia', 20),
  ('VALVULOPATIA', 'NA', 'N/A', 30),

  -- RIESGOS
  ('RIESGOS', null, 'Arritmias cardíacas', 10),
  ('RIESGOS', null, 'Cirugía cardíaca previa', 20),
  ('RIESGOS', null, 'Desnutrición', 30),
  ('RIESGOS', null, 'Disfunción ventricular', 40),
  ('RIESGOS', null, 'Endocarditis', 50),
  ('RIESGOS', null, 'Enfermedad renal', 60),
  ('RIESGOS', null, 'Hipertensión pulmonar', 70),
  ('RIESGOS', null, 'Infección activa', 80),
  ('RIESGOS', null, 'Insuficiencia cardíaca', 90),
  ('RIESGOS', null, 'Intervención previa por hemodinamia', 100),
  ('RIESGOS', null, 'Obesidad', 110),
  ('RIESGOS', null, 'Prematuridad / bajo peso al nacer', 120),
  ('RIESGOS', null, 'Síndrome genético (Down, Turner, DiGeorge, Noonan, Williams u otro)', 130),
  ('RIESGOS', null, 'Otra condición relevante', 140),
  ('RIESGOS', 'NINGUNO', 'Ninguno', 150),

  -- RACHS
  ('RACHS', null, 'I', 10),
  ('RACHS', null, 'II', 20),
  ('RACHS', null, 'III', 30),
  ('RACHS', null, 'IV', 40),
  ('RACHS', null, 'V', 50),
  ('RACHS', null, 'VI', 60),

  -- PROCEDIMIENTOS
  ('PROCEDIMIENTOS', null, 'Anastomosis cavopulmonar bidireccional (Glenn)', 10),
  ('PROCEDIMIENTOS', null, 'Bandaje de arteria pulmonar', 20),
  ('PROCEDIMIENTOS', null, 'Cierre de comunicación interauricular (CIA)', 30),
  ('PROCEDIMIENTOS', null, 'Cierre de comunicación interventricular (CIV)', 40),
  ('PROCEDIMIENTOS', null, 'Cierre de ductus arterioso persistente', 50),
  ('PROCEDIMIENTOS', null, 'Cirugía de aorta (ascendente, arco o descendente)', 60),
  ('PROCEDIMIENTOS', null, 'Cirugía de coartación de aorta', 70),
  ('PROCEDIMIENTOS', null, 'Corrección de canal auriculoventricular', 80),
  ('PROCEDIMIENTOS', null, 'Corrección de doble salida del ventrículo derecho', 90),
  ('PROCEDIMIENTOS', null, 'Corrección de drenaje venoso pulmonar anómalo', 100),
  ('PROCEDIMIENTOS', null, 'Corrección de tetralogía de Fallot', 110),
  ('PROCEDIMIENTOS', null, 'Corrección de transposición de grandes arterias / Switch arterial', 120),
  ('PROCEDIMIENTOS', null, 'Extracción de cuerpo extraño intracardíaco', 130),
  ('PROCEDIMIENTOS', null, 'Fístula sistémico-pulmonar', 140),
  ('PROCEDIMIENTOS', null, 'Procedimiento de Damus-Kaye-Stansel', 150),
  ('PROCEDIMIENTOS', null, 'Procedimiento de Fontan', 160),
  ('PROCEDIMIENTOS', null, 'Procedimiento de Norwood', 170),
  ('PROCEDIMIENTOS', null, 'Procedimiento de Rastelli', 180),
  ('PROCEDIMIENTOS', null, 'Reconstrucción de arteria pulmonar', 190),
  ('PROCEDIMIENTOS', null, 'Reemplazo valvular aórtico', 200),
  ('PROCEDIMIENTOS', null, 'Reemplazo valvular mitral', 210),
  ('PROCEDIMIENTOS', null, 'Reemplazo valvular pulmonar', 220),
  ('PROCEDIMIENTOS', null, 'Reemplazo valvular tricuspídeo', 230),
  ('PROCEDIMIENTOS', null, 'Reparación de anillos vasculares', 240),
  ('PROCEDIMIENTOS', null, 'Reparación de anomalía de Ebstein', 250),
  ('PROCEDIMIENTOS', null, 'Reparación de tronco arterioso', 260),
  ('PROCEDIMIENTOS', null, 'Reparación de ventana aortopulmonar', 270),
  ('PROCEDIMIENTOS', null, 'Resección de estenosis subaórtica', 280),
  ('PROCEDIMIENTOS', null, 'Valvuloplastia aórtica', 290),
  ('PROCEDIMIENTOS', null, 'Valvuloplastia mitral', 300),
  ('PROCEDIMIENTOS', null, 'Valvuloplastia pulmonar', 310),
  ('PROCEDIMIENTOS', null, 'Valvuloplastia tricuspídea', 320),
  ('PROCEDIMIENTOS', null, 'Otro', 330),

  -- IMPLANTE
  ('IMPLANTE', null, 'Autólogo', 10),
  ('IMPLANTE', null, 'Biológico', 20),
  ('IMPLANTE', null, 'Mecánico', 30),
  ('IMPLANTE', null, 'N/A', 40),

  -- COMPLICACION_INTRAQX
  ('COMPLICACION_INTRAQX', 'NINGUNA', 'Ninguna', 10),
  ('COMPLICACION_INTRAQX', null, 'Complicación de prótesis o injerto', 20),
  ('COMPLICACION_INTRAQX', null, 'Dehiscencia de sutura', 30),
  ('COMPLICACION_INTRAQX', null, 'Dificultad para finalizar la reparación quirúrgica', 40),
  ('COMPLICACION_INTRAQX', null, 'Disección aórtica intraoperatoria', 50),
  ('COMPLICACION_INTRAQX', null, 'Falla de reparación quirúrgica', 60),
  ('COMPLICACION_INTRAQX', null, 'Fuga paravalvular', 70),
  ('COMPLICACION_INTRAQX', null, 'Hemorragia quirúrgica significativa', 80),
  ('COMPLICACION_INTRAQX', null, 'Lesión cardíaca o vascular', 90),
  ('COMPLICACION_INTRAQX', null, 'Muerte intraoperatoria', 100),
  ('COMPLICACION_INTRAQX', null, 'Necesidad de soporte circulatorio mecánico (ECMO)', 110),
  ('COMPLICACION_INTRAQX', null, 'Reintervención durante el mismo acto quirúrgico', 120),
  ('COMPLICACION_INTRAQX', null, 'Otra', 130),

  -- UNIDAD_POP
  ('UNIDAD_POP', null, 'UCI Pediátrica', 10),
  ('UNIDAD_POP', null, 'UCI Neonatos', 20),
  ('UNIDAD_POP', null, 'UCI Adultos', 30),
  ('UNIDAD_POP', null, 'N/A', 40),

  -- COMPLICACION_POP
  ('COMPLICACION_POP', 'NO', 'No', 10),
  ('COMPLICACION_POP', null, 'ACV postoperatorio', 20),
  ('COMPLICACION_POP', null, 'ECMO', 30),
  ('COMPLICACION_POP', null, 'Falla renal POP que requiera diálisis', 40),
  ('COMPLICACION_POP', null, 'Fibrilación auricular postoperatoria', 50),
  ('COMPLICACION_POP', null, 'Implante de marcapaso definitivo por bloqueo AV', 60),
  ('COMPLICACION_POP', null, 'Infarto perioperatorio', 70),
  ('COMPLICACION_POP', null, 'Intubación prolongada mayor a 72 horas', 80),
  ('COMPLICACION_POP', null, 'Mediastinitis', 90),
  ('COMPLICACION_POP', 'MUERTE', 'Muerte', 100),
  ('COMPLICACION_POP', null, 'Reingreso a UCI', 110),
  ('COMPLICACION_POP', null, 'Reintervención por otra causa diferente a sangrado', 120),
  ('COMPLICACION_POP', null, 'Reintervención por sangrado', 130),
  ('COMPLICACION_POP', null, 'Reintubación', 140),
  ('COMPLICACION_POP', null, 'Sangrado significativo', 150),
  ('COMPLICACION_POP', null, 'Shock cardiogénico', 160),
  ('COMPLICACION_POP', null, 'Otra', 170),

  -- CONDICION_SALIDA
  ('CONDICION_SALIDA', null, 'Estable', 10),
  ('CONDICION_SALIDA', null, 'Estable con oxígeno domiciliario', 20),
  ('CONDICION_SALIDA', null, 'Remitido', 30),
  ('CONDICION_SALIDA', null, 'Alta voluntaria', 40),
  ('CONDICION_SALIDA', 'MUERTE', 'Muerte', 50),
  ('CONDICION_SALIDA', null, 'Otro', 60),

  -- ESTADO_HERIDA
  ('ESTADO_HERIDA', null, 'Cicatrización adecuada', 10),
  ('ESTADO_HERIDA', null, 'Dehiscencia', 20),
  ('ESTADO_HERIDA', null, 'Eritema', 30),
  ('ESTADO_HERIDA', null, 'Hematoma', 40),
  ('ESTADO_HERIDA', null, 'Infección', 50),
  ('ESTADO_HERIDA', null, 'Necrosis', 60),
  ('ESTADO_HERIDA', null, 'Sangrado', 70),
  ('ESTADO_HERIDA', null, 'Secreción', 80),
  ('ESTADO_HERIDA', null, 'Seroma', 90),
  ('ESTADO_HERIDA', null, 'Otro', 100),
  ('ESTADO_HERIDA', null, 'N/A', 110),

  -- CAUSA_REINGRESO
  ('CAUSA_REINGRESO', null, 'N/A', 10),
  ('CAUSA_REINGRESO', null, 'Arritmia', 20),
  ('CAUSA_REINGRESO', null, 'Complicación de prótesis o injerto', 30),
  ('CAUSA_REINGRESO', null, 'Complicación renal', 40),
  ('CAUSA_REINGRESO', null, 'Complicación respiratoria', 50),
  ('CAUSA_REINGRESO', null, 'Dehiscencia de herida quirúrgica', 60),
  ('CAUSA_REINGRESO', null, 'Derrame pericárdico', 70),
  ('CAUSA_REINGRESO', null, 'Derrame pleural', 80),
  ('CAUSA_REINGRESO', null, 'Disfunción valvular', 90),
  ('CAUSA_REINGRESO', null, 'Embolia', 100),
  ('CAUSA_REINGRESO', null, 'Infección de herida quirúrgica', 110),
  ('CAUSA_REINGRESO', null, 'Insuficiencia cardíaca', 120),
  ('CAUSA_REINGRESO', null, 'Sangrado', 130),
  ('CAUSA_REINGRESO', null, 'Síndrome de bajo gasto cardíaco', 140),
  ('CAUSA_REINGRESO', null, 'Taponamiento cardíaco', 150),
  ('CAUSA_REINGRESO', null, 'Trombosis', 160),
  ('CAUSA_REINGRESO', null, 'Otra complicación cardiovascular', 170),
  ('CAUSA_REINGRESO', null, 'Otra causa no cardiovascular', 180)
) as v(categoria_codigo, codigo, valor, orden)
join categorias_lista c on c.codigo = v.categoria_codigo;
