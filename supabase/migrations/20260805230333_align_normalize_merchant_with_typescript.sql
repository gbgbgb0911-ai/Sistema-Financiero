-- La versión SQL solo quitaba los sufijos de banco cuando iban seguidos de
-- dígitos al final, así que "Rappi Peru SAC" y "RAPPI*PERU LIMA 0034" no
-- normalizaban igual. La versión de TypeScript (core/text.ts) sí los colapsa,
-- y es la que tiene tests. Se alinea el SQL con ella.
--
-- Las dos implementaciones tienen que coincidir: la SQL agrupa comercios en el
-- trigger de ingesta y la TS agrupa los mismos comercios en la analítica. Si
-- divergen, el mismo comercio aparece partido en dos.
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
          regexp_replace(
            regexp_replace(
              lower(extensions.unaccent(coalesce(raw, ''))),
              -- Sufijos de banco y formas societarias, en cualquier posición.
              '\y(lima|peru|pe|us|usa|online|web|internet|com|sac|sa|srl|eirl|ltd|inc)\y',
              ' ', 'g'
            ),
            -- Códigos de referencia numéricos.
            '\y[0-9]{3,}\y', ' ', 'g'
          ),
          '[*#]+', ' ', 'g'
        ),
        '[^a-z0-9]+', ' ', 'g'
      )
    ),
    ''
  );
$fn$;

revoke all on function public.normalize_merchant(text) from public, anon, authenticated;
