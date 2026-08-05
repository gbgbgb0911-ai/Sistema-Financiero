-- =============================================================================
-- Endurecimiento de seguridad, a partir del linter de Supabase.
--
-- Las cuatro migraciones 0237–0423 se escribieron tras aplicar el esquema base
-- a un proyecto real y pasarle el analizador de seguridad. Se mantienen como
-- migraciones separadas, y no fundidas en las anteriores, porque cada una
-- documenta un fallo concreto que conviene no repetir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La vista materializada NO soporta RLS.
--
-- Estaba expuesta por la API REST, así que cualquier usuario autenticado podía
-- leer los totales mensuales de TODOS los usuarios. La aplicación nunca la
-- consulta directamente (solo el cron la refresca), así que se revoca el acceso.
-- -----------------------------------------------------------------------------
revoke all on public.mv_monthly_category_totals from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. search_path fijo en todas las funciones.
--
-- Sin esto, un rol puede manipular search_path y hacer que una función
-- SECURITY DEFINER ejecute código suplantado.
-- -----------------------------------------------------------------------------
alter function public.set_updated_at()            set search_path = public, pg_temp;
alter function public.normalize_merchant(text)    set search_path = public, pg_temp;
alter function public.compute_amount_base()       set search_path = public, pg_temp;
alter function public.encrypt_token(text)         set search_path = public, pg_temp;
alter function public.decrypt_token(bytea)        set search_path = public, pg_temp;
alter function public.refresh_monthly_totals()    set search_path = public, pg_temp;
alter function public.spending_summary(uuid, timestamptz, timestamptz)
                                                  set search_path = public, pg_temp;

-- -----------------------------------------------------------------------------
-- 3. materialize_payment_occurrences pasa a SECURITY INVOKER.
--
-- Como DEFINER, un usuario podía materializar vencimientos de un pago ajeno
-- pasando su uuid. Como INVOKER, RLS se aplica: el SELECT sobre payments no
-- devuelve nada si el pago es de otro, y la función simplemente retorna 0.
-- El cron sigue funcionando porque usa service_role, que salta RLS.
-- -----------------------------------------------------------------------------
create or replace function public.materialize_payment_occurrences(
  p_payment_id uuid,
  p_horizon    date default (now() + interval '120 days')::date
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
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
$fn$;

create or replace function public.trg_materialize_on_payment()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  perform public.materialize_payment_occurrences(new.id);
  return new;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 4. Revocar EXECUTE de lo que no debe llamarse desde la API.
--
-- Postgres concede EXECUTE a PUBLIC por defecto, y PostgREST expone toda
-- función del esquema public como endpoint /rest/v1/rpc/<nombre>. Las funciones
-- de trigger y las de cifrado no tienen por qué ser invocables por nadie.
-- -----------------------------------------------------------------------------
do $blk$
declare
  fn text;
begin
  foreach fn in array array[
    'public.set_updated_at()',
    'public.handle_new_user()',
    'public.compute_amount_base()',
    'public.apply_categorization_rules()',
    'public.bump_merchant_stats()',
    'public.audit_trigger()',
    'public.trg_materialize_on_payment()',
    'public.encrypt_token(text)',
    'public.decrypt_token(bytea)',
    'public.mark_overdue_occurrences()',
    'public.refresh_monthly_totals()',
    'public.normalize_merchant(text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$blk$;

-- La aplicación llama a esta desde la sesión del usuario: authenticated la
-- necesita. Ya es SECURITY INVOKER, así que RLS la acota.
revoke all on function public.materialize_payment_occurrences(uuid, date) from public, anon;
grant execute on function public.materialize_payment_occurrences(uuid, date) to authenticated;

-- SECURITY INVOKER y filtra por p_user_id: respeta RLS. Solo usuarios con sesión.
revoke all on function public.spending_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.spending_summary(uuid, timestamptz, timestamptz) to authenticated;
