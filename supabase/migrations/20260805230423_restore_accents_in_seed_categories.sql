-- Los nombres de las categorías por defecto son texto que ve el usuario:
-- deben llevar sus tildes. El `slug` se queda sin acentos porque es una clave.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  seed record;
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  for seed in
    select * from (values
      ('Alimentación',    'alimentacion',    'utensils',       '#f97316',  10),
      ('Restaurantes',    'restaurantes',    'chef-hat',       '#ef4444',  20),
      ('Transporte',      'transporte',      'car',            '#3b82f6',  30),
      ('Vivienda',        'vivienda',        'home',           '#8b5cf6',  40),
      ('Servicios',       'servicios',       'zap',            '#eab308',  50),
      ('Salud',           'salud',           'heart-pulse',    '#10b981',  60),
      ('Educación',       'educacion',       'graduation-cap', '#06b6d4',  70),
      ('Entretenimiento', 'entretenimiento', 'clapperboard',   '#ec4899',  80),
      ('Suscripciones',   'suscripciones',   'repeat',         '#a855f7',  90),
      ('Compras',         'compras',         'shopping-bag',   '#f43f5e', 100),
      ('Viajes',          'viajes',          'plane',          '#14b8a6', 110),
      ('Mascotas',        'mascotas',        'paw-print',      '#84cc16', 120),
      ('Impuestos',       'impuestos',       'landmark',       '#64748b', 130),
      ('Otros',           'otros',           'circle-dashed',  '#94a3b8', 999)
    ) as t(name, slug, icon, color, sort_order)
  loop
    insert into public.categories (user_id, name, slug, icon, color, sort_order, is_system)
    values (new.id, seed.name, seed.slug, seed.icon, seed.color, seed.sort_order, true)
    on conflict (user_id, slug) do nothing;
  end loop;

  return new;
end;
$fn$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Corrige también las filas ya creadas, por si algún usuario se registró antes.
update public.categories set name = 'Alimentación' where slug = 'alimentacion' and is_system;
update public.categories set name = 'Educación'    where slug = 'educacion'    and is_system;
