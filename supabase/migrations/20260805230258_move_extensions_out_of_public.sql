-- Las extensiones no deben vivir en `public`: sus funciones quedan expuestas
-- como endpoints RPC y compiten en el espacio de nombres de la aplicación.
create schema if not exists extensions;

alter extension unaccent set schema extensions;
alter extension pg_trgm  set schema extensions;

-- normalize_merchant llama a unaccent(), así que hay que cualificarla y añadir
-- `extensions` al search_path fijo de la función.
create or replace function public.normalize_merchant(raw text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $fn$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(
          lower(extensions.unaccent(coalesce(raw, ''))),
          '\s*(\*|#|\-)?\s*(lima|peru|pe|us|usa|online|web|com)?\s*[0-9]{3,}\s*$',
          '',
          'g'
        ),
        '[^a-z0-9]+', ' ', 'g'
      )
    ),
    ''
  );
$fn$;

revoke all on function public.normalize_merchant(text) from public, anon, authenticated;

-- Las funciones que usan normalize_merchant necesitan ver el esquema extensions.
alter function public.apply_categorization_rules() set search_path = public, extensions, pg_temp;
