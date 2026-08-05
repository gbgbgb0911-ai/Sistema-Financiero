-- =============================================================================
-- 0003_functions.sql — Funciones, triggers y vistas materializadas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'categories', 'merchants', 'cards', 'expenses',
    'payments', 'payment_occurrences', 'budgets', 'email_accounts',
    'email_rules', 'automations'
  ]
  loop
    execute format(
      'create trigger trg_%1$s_updated_at
         before update on public.%1$s
         for each row execute function public.set_updated_at()', t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Normalización de nombres de comercio
--
-- "RAPPI*PERU LIMA PE" -> "rappi peru"
-- Es lo que permite agrupar variantes del mismo comercio en una sola entidad.
-- -----------------------------------------------------------------------------
create or replace function public.normalize_merchant(raw text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(
          -- Quita acentos y pasa a minúsculas
          lower(unaccent(coalesce(raw, ''))),
          -- Sufijos de banco: códigos de país/ciudad, referencias numéricas
          '\s*(\*|#|\-)?\s*(lima|peru|pe|us|usa|online|web|com)?\s*[0-9]{3,}\s*$',
          '',
          'g'
        ),
        -- Colapsa separadores y espacios múltiples
        '[^a-z0-9]+', ' ', 'g'
      )
    ),
    ''
  );
$$;

-- -----------------------------------------------------------------------------
-- Alta de usuario: crea el perfil y siembra las categorías por defecto.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- amount_base: convierte a la moneda base del perfil.
-- Sin esto, sumar un gasto en USD y otro en PEN da un número sin significado.
-- -----------------------------------------------------------------------------
create or replace function public.compute_amount_base()
returns trigger
language plpgsql
as $$
begin
  if new.amount_base is null then
    new.amount_base := round(new.amount * coalesce(new.fx_rate, 1), 2);
  end if;
  return new;
end;
$$;

create trigger trg_expenses_amount_base
  before insert or update of amount, fx_rate on public.expenses
  for each row execute function public.compute_amount_base();

-- -----------------------------------------------------------------------------
-- Auto-categorización al insertar un gasto sin categoría.
-- Aplica las reglas del usuario por prioridad; si ninguna coincide, cae al
-- default_category_id del comercio.
-- -----------------------------------------------------------------------------
create or replace function public.apply_categorization_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_category uuid;
  haystack text;
begin
  if new.category_id is not null then
    return new;
  end if;

  haystack := public.normalize_merchant(coalesce(new.merchant_raw, new.description, ''));

  select r.category_id into matched_category
  from public.categorization_rules r
  where r.user_id = new.user_id
    and r.is_active
    and (
      (r.match_type = 'merchant_contains' and haystack like '%' || lower(r.pattern) || '%')
      or (r.match_type = 'merchant_equals' and haystack = lower(r.pattern))
      or (r.match_type = 'regex' and haystack ~* r.pattern)
      or (
        r.match_type = 'amount_range'
        and new.amount >= coalesce(r.amount_min, 0)
        and new.amount <= coalesce(r.amount_max, 999999999)
      )
    )
  order by r.priority asc, r.created_at asc
  limit 1;

  if matched_category is null and new.merchant_id is not null then
    select m.default_category_id into matched_category
    from public.merchants m
    where m.id = new.merchant_id;
  end if;

  new.category_id := matched_category;
  return new;
end;
$$;

create trigger trg_expenses_categorize
  before insert on public.expenses
  for each row execute function public.apply_categorization_rules();

-- -----------------------------------------------------------------------------
-- Estadísticas del comercio al registrar un gasto.
-- -----------------------------------------------------------------------------
create or replace function public.bump_merchant_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.merchant_id is not null then
    update public.merchants
    set visit_count = visit_count + 1,
        last_seen_at = greatest(coalesce(last_seen_at, new.occurred_at), new.occurred_at)
    where id = new.merchant_id;
  end if;
  return new;
end;
$$;

create trigger trg_expenses_merchant_stats
  after insert on public.expenses
  for each row execute function public.bump_merchant_stats();

-- -----------------------------------------------------------------------------
-- Auditoría genérica. Habilita el "deshacer" desde WhatsApp.
-- -----------------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  target_user := coalesce(
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'user_id')::uuid
         else (to_jsonb(new) ->> 'user_id')::uuid end,
    auth.uid()
  );

  insert into public.audit_log (user_id, table_name, record_id, action, before, after, actor)
  values (
    target_user,
    tg_table_name,
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid
         else (to_jsonb(new) ->> 'id')::uuid end,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    case when auth.uid() is null then 'system'::public.audit_actor else 'user'::public.audit_actor end
  );

  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['expenses', 'payments', 'payment_occurrences', 'cards', 'budgets']
  loop
    execute format(
      'create trigger trg_%1$s_audit
         after insert or update or delete on public.%1$s
         for each row execute function public.audit_trigger()', t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cifrado de tokens OAuth de Gmail.
-- La clave se lee de app.settings.encryption_key (configurada en el proyecto).
-- -----------------------------------------------------------------------------
create or replace function public.encrypt_token(token text)
returns bytea
language plpgsql
security definer
as $$
begin
  if token is null then return null; end if;
  return pgp_sym_encrypt(
    token,
    coalesce(current_setting('app.settings.encryption_key', true), 'dev-only-fallback-key')
  );
end;
$$;

create or replace function public.decrypt_token(token bytea)
returns text
language plpgsql
security definer
as $$
begin
  if token is null then return null; end if;
  return pgp_sym_decrypt(
    token,
    coalesce(current_setting('app.settings.encryption_key', true), 'dev-only-fallback-key')
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Materialización de ocurrencias de pago.
--
-- Genera las instancias pendientes de un pago recurrente hasta `horizon`.
-- Es idempotente gracias a uq_occurrences_payment_due.
-- -----------------------------------------------------------------------------
create or replace function public.materialize_payment_occurrences(
  p_payment_id uuid,
  p_horizon    date default (now() + interval '120 days')::date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  pay        record;
  cursor_date date;
  step       interval;
  inserted   integer := 0;
begin
  select * into pay from public.payments where id = p_payment_id;
  if not found or not pay.is_active then
    return 0;
  end if;

  step := case pay.frequency
    when 'weekly'    then interval '1 week'
    when 'biweekly'  then interval '2 weeks'
    when 'monthly'   then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'yearly'    then interval '1 year'
    else null
  end;

  cursor_date := pay.anchor_date;

  -- Pago único: una sola ocurrencia.
  if step is null then
    insert into public.payment_occurrences (user_id, payment_id, due_date, amount, currency)
    values (pay.user_id, pay.id, cursor_date, pay.amount, pay.currency)
    on conflict (payment_id, due_date) do nothing;
    get diagnostics inserted = row_count;
    return inserted;
  end if;

  while cursor_date <= p_horizon loop
    exit when pay.end_date is not null and cursor_date > pay.end_date;

    insert into public.payment_occurrences (user_id, payment_id, due_date, amount, currency)
    values (pay.user_id, pay.id, cursor_date, pay.amount, pay.currency)
    on conflict (payment_id, due_date) do nothing;

    if found then
      inserted := inserted + 1;
    end if;

    cursor_date := (cursor_date + step)::date;
  end loop;

  return inserted;
end;
$$;

-- Materializa automáticamente al crear o reactivar un pago.
create or replace function public.trg_materialize_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.materialize_payment_occurrences(new.id);
  return new;
end;
$$;

create trigger trg_payments_materialize
  after insert on public.payments
  for each row execute function public.trg_materialize_on_payment();

-- -----------------------------------------------------------------------------
-- Marca como vencidas las ocurrencias cuya fecha ya pasó. Llamada por el cron.
-- -----------------------------------------------------------------------------
create or replace function public.mark_overdue_occurrences()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.payment_occurrences o
  set status = 'overdue'
  from public.profiles p
  where o.user_id = p.id
    and o.status = 'pending'
    and o.due_date < (now() at time zone p.timezone)::date;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- -----------------------------------------------------------------------------
-- Vista materializada: totales mensuales por categoría.
-- Sostiene los gráficos del dashboard sin recalcular sobre toda la tabla.
-- -----------------------------------------------------------------------------
create materialized view public.mv_monthly_category_totals as
select
  e.user_id,
  date_trunc('month', e.occurred_at at time zone coalesce(p.timezone, 'UTC'))::date as month,
  e.category_id,
  count(*)                       as expense_count,
  sum(coalesce(e.amount_base, e.amount)) as total
from public.expenses e
join public.profiles p on p.id = e.user_id
where e.status = 'confirmed'
group by 1, 2, 3;

create unique index uq_mv_monthly_totals
  on public.mv_monthly_category_totals (
    user_id, month, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create or replace function public.refresh_monthly_totals()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.mv_monthly_category_totals;
end;
$$;

-- -----------------------------------------------------------------------------
-- Resumen de gastos por período. Usada por las tools de la IA.
-- SECURITY INVOKER: respeta RLS, de modo que nunca puede devolver datos ajenos.
-- -----------------------------------------------------------------------------
create or replace function public.spending_summary(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz
)
returns table (
  total          numeric,
  expense_count  bigint,
  avg_amount     numeric,
  max_amount     numeric,
  top_category   text,
  top_merchant   text
)
language sql
stable
security invoker
as $$
  with scoped as (
    select e.*, c.name as category_name, m.name as merchant_name
    from public.expenses e
    left join public.categories c on c.id = e.category_id
    left join public.merchants  m on m.id = e.merchant_id
    where e.user_id = p_user_id
      and e.status = 'confirmed'
      and e.occurred_at >= p_from
      and e.occurred_at <  p_to
  )
  select
    coalesce(sum(coalesce(amount_base, amount)), 0),
    count(*),
    coalesce(avg(coalesce(amount_base, amount)), 0),
    coalesce(max(coalesce(amount_base, amount)), 0),
    (select category_name from scoped
      where category_name is not null
      group by category_name order by sum(coalesce(amount_base, amount)) desc limit 1),
    (select merchant_name from scoped
      where merchant_name is not null
      group by merchant_name order by sum(coalesce(amount_base, amount)) desc limit 1)
  from scoped;
$$;
