# 02 — Base de datos

Postgres (Supabase). Migración completa en `supabase/migrations/`.

## 1. Diagrama de relaciones

```
auth.users (Supabase)
    │ 1:1
    ▼
  profiles ─────────────────────────────────────────────┐
    │ 1:N                                                │
    ├── categories ◄──────────┐                          │
    ├── merchants ◄───────┐   │                          │
    ├── cards ◄───────┐   │   │                          │
    │                 │   │   │                          │
    ├── expenses ─────┴───┴───┤                          │
    │     │ 1:N                                          │
    │     └── attachments                                │
    │                                                    │
    ├── payments ─────────────┤ (category)               │
    │     │ 1:N                                          │
    │     └── payment_occurrences                        │
    │            │ 1:N                                   │
    │            └── reminders ──► notifications          │
    │                                                    │
    ├── budgets ──────────────┤ (category)               │
    ├── categorization_rules ─┤ (category)               │
    ├── email_accounts                                   │
    │     └── email_rules                                │
    ├── inbound_messages   (cola de WhatsApp)            │
    ├── conversations → conversation_messages            │
    ├── reports                                          │
    ├── automations                                      │
    ├── ai_usage                                         │
    └── audit_log ◄──────────────────────────────────────┘
```

## 2. Tablas

### `profiles`
Extiende `auth.users`. Preferencias que afectan a **todos** los cálculos.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `full_name` | text | |
| `phone_e164` | text UNIQUE | Clave para resolver el usuario desde WhatsApp |
| `timezone` | text | Por defecto `America/Lima`. Todos los agregados lo usan |
| `base_currency` | char(3) | Moneda de consolidación (`PEN`) |
| `locale` | text | Formato de números y fechas |
| `whatsapp_opt_in` | boolean | Consentimiento explícito |
| `notification_prefs` | jsonb | Horarios y canales de reportes |

### `categories`
Jerárquica (`parent_id`) para permitir subcategorías. Se siembran 14 categorías por
defecto al crear el perfil, mediante trigger.

Campos clave: `name`, `slug`, `icon`, `color`, `kind` (`expense`/`income`), `is_system`.

### `merchants`
Comercios normalizados. `normalized_name` (minúsculas, sin acentos ni sufijos como
`*LIMA PE`) es lo que permite agrupar `"RAPPI*PERU"`, `"Rappi Peru SAC"` y `"RAPPI  PE"`
en una sola entidad. `default_category_id` alimenta la auto-categorización.

La normalización está implementada dos veces —`public.normalize_merchant()` en SQL para
el trigger de ingesta, y `normalizeMerchantName()` en `core/text.ts` para la analítica— y
**las dos tienen que dar el mismo resultado**. Si divergen, el mismo comercio aparece
partido en dos. La primera versión SQL solo quitaba los sufijos cuando iban al final
seguidos de dígitos, así que `"Rappi Peru SAC"` daba `rappi peru sac` y `"RAPPI*PERU LIMA
0034"` daba `rappi peru`; la migración `20260805230333` la alineó con la de TypeScript,
que es la que tiene tests. Ambas dan ahora `rappi` para las tres variantes.

### `cards`
Tarjetas y métodos de pago.

| Columna | Notas |
|---|---|
| `kind` | `credit` \| `debit` \| `cash` \| `bank_account` \| `wallet` |
| `last4` | Solo los 4 últimos dígitos. **Nunca** el PAN completo |
| `credit_limit`, `statement_day`, `due_day` | Habilitan el cálculo del ciclo de facturación |
| `currency` | Una tarjeta opera en una moneda |

### `expenses`
Tabla central.

| Columna | Notas |
|---|---|
| `amount` | `NUMERIC(14,2)`, siempre positivo |
| `currency` | Moneda del movimiento |
| `amount_base`, `fx_rate` | Importe convertido a la moneda base del perfil |
| `occurred_at` | `timestamptz` — fecha **y** hora del gasto |
| `merchant_id`, `category_id`, `card_id` | FKs opcionales |
| `merchant_raw` | Texto original tal como llegó (del banco). Se conserva para auditar |
| `source` | `manual` \| `email` \| `whatsapp` \| `import` \| `recurring` |
| `status` | `confirmed` \| `pending_review` \| `possible_duplicate` \| `voided` |
| `confidence` | 0–1, poblado por el parser |
| `external_ref` | `gmail_message_id` u otro; **UNIQUE con `user_id`** → sin duplicados |
| `search_tsv` | Columna generada + índice GIN para el buscador |

### `payments` y `payment_occurrences`
Separación deliberada:

- **`payments`** es la *regla*: nombre, importe, categoría, método, frecuencia
  (`once`/`weekly`/`monthly`/`yearly`), `anchor_date`, `end_date`.
- **`payment_occurrences`** es cada *instancia* con vencimiento concreto:
  `due_date`, `amount`, `status` (`pending`/`paid`/`overdue`/`skipped`/`canceled`),
  `paid_at`, `expense_id` (enlace al gasto generado al pagarlo).

Esto permite marcar pagado el mes de marzo sin tocar abril, posponer una ocurrencia
individual, y que el calendario sea una consulta trivial. `UNIQUE(payment_id, due_date)`
hace idempotente la materialización.

### `reminders` y `notifications`
- `reminders`: `occurrence_id`, `kind` (`day_before`/`due_day`/`overdue`), `scheduled_for`,
  `sent_at`, `channel`. **`UNIQUE(occurrence_id, kind)`** — el cron nunca duplica.
- `notifications`: bitácora de todo lo enviado, con `provider_message_id` y `status`.

### `budgets`
`category_id` (nullable = presupuesto global), `period` (`monthly`/`weekly`), `amount`,
`starts_on`. Es la referencia contra la que la IA responde "¿en qué gasto demasiado?".

### `email_accounts` y `email_rules`
- `email_accounts`: `provider`, `email`, tokens OAuth **cifrados con `pgcrypto`**,
  `last_history_id` para sync incremental, `sync_status`.
- `email_rules`: por emisor. `from_pattern`, `subject_pattern`, y `extractors` (jsonb con
  las regex nombradas: `amount`, `merchant`, `card_last4`, `datetime`, `currency`).
  `priority` resuelve solapamientos. `hit_count`/`miss_count` miden la salud del parser.

### `inbound_messages`
Cola de WhatsApp. `provider_message_id UNIQUE` es la garantía de idempotencia frente a los
reintentos de Meta. `status`: `queued`/`processing`/`done`/`failed`, con `attempts` y
`error`.

### `conversations` / `conversation_messages`
Historial del asistente, por canal (`whatsapp`/`web`). Permite contexto multi-turno y
auditoría de qué respondió la IA.

### `reports`
Reportes generados. `kind` (`daily`/`weekly`/`monthly`), `period_start`, `period_end`,
`payload` (jsonb con los agregados), `summary_text`, `sent_at`.
`UNIQUE(user_id, kind, period_start)` — no se regenera dos veces.

### `automations`
Reglas del usuario: `trigger` (jsonb), `action` (jsonb), `enabled`. Es lo que se expone a
n8n.

### `categorization_rules`
`match_type` (`merchant_contains`/`merchant_equals`/`amount_range`/`regex`), `pattern`,
`category_id`, `priority`. Se aplican en orden al crear un gasto sin categoría.

### `audit_log`
`table_name`, `record_id`, `action`, `before`/`after` (jsonb), `actor` (`user`/`ai`/`system`),
`created_at`. Poblado por un trigger genérico. Habilita el "deshacer".

### `ai_usage`
`model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `purpose`, `cost_estimate`.
Control de costos por usuario.

## 3. Decisiones de modelado

**Dinero como `NUMERIC(14,2)`, nunca `float`.** En TypeScript los cálculos intermedios se
hacen en céntimos enteros (`core/money.ts`) y solo se formatea al final.

**Moneda en cada fila, no global.** Un usuario en Perú tiene gastos en PEN y suscripciones
en USD. Cada importe guarda su moneda original más `amount_base` para poder sumar.

**`timestamptz` en todo.** La hora del gasto importa ("¿cuánto gasté hoy?" depende de la
zona horaria del usuario, no del servidor).

**Soft delete vía `status`, no `DELETE`.** Un gasto anulado sigue siendo información
contable. `voided` en lugar de borrar.

**Búsqueda con `tsvector` generado.** `search_tsv` es una columna generada a partir de
`merchant_raw`, `notes` y el nombre del comercio, con índice GIN. El buscador es una
consulta, no un `LIKE '%...%'` que no escala.

## 4. Seguridad a nivel de fila

Todas las tablas de negocio llevan:

```sql
ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<tabla>_owner" ON public.<tabla>
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

Las tablas hijas (`payment_occurrences`, `reminders`, `attachments`, `email_rules`) validan
la propiedad a través del padre con un `EXISTS`. Se puso `user_id` denormalizado donde el
join encarecía demasiado la política.

**RLS no cubre todo lo que hay en `public`.** Las vistas materializadas y las funciones
quedan fuera, y ahí es donde se abrieron los agujeros que corrigió el endurecimiento de la
sección 7. Activar RLS en las tablas es necesario, no suficiente.

## 5. Índices

```sql
-- Los que sostienen las consultas del dashboard
idx_expenses_user_date        (user_id, occurred_at DESC)
idx_expenses_user_category    (user_id, category_id, occurred_at DESC)
idx_expenses_user_card        (user_id, card_id, occurred_at DESC)
idx_expenses_search           GIN (search_tsv)
uq_expenses_external          UNIQUE (user_id, external_ref) WHERE external_ref IS NOT NULL

idx_occurrences_user_due      (user_id, due_date) WHERE status = 'pending'
uq_occurrences_payment_due    UNIQUE (payment_id, due_date)

uq_reminders_occurrence_kind  UNIQUE (occurrence_id, kind)
uq_inbound_provider_id        UNIQUE (provider_message_id)
uq_reports_user_kind_period   UNIQUE (user_id, kind, period_start)
```

## 6. Triggers y funciones

| Nombre | Qué hace |
|---|---|
| `handle_new_user()` | Crea `profiles` + categorías por defecto al registrarse |
| `set_updated_at()` | Mantiene `updated_at` en cada `UPDATE` |
| `audit_trigger()` | Escribe en `audit_log` los cambios de las tablas de negocio |
| `apply_categorization_rules()` | Asigna categoría al insertar un gasto sin ella |
| `compute_amount_base()` | Calcula `amount_base` con el `fx_rate` de la fila |
| `refresh_monthly_totals()` | Refresca la vista materializada (llamada por cron) |

## 7. Endurecimiento posterior

El esquema se aplicó a un proyecto real y se le pasó el analizador de seguridad de
Supabase, que devolvió 30 hallazgos. Las cuatro migraciones `2026080523:02:37`–`04:23`
los cierran. Vale la pena leerlas porque ninguno era obvio desde el esquema:

**La vista materializada podía leerla cualquiera.** Una vista materializada **no soporta
RLS**, y PostgREST la exponía sobre `/rest/v1/`. Cualquier usuario con sesión podía leer
los totales mensuales de todos los demás. Se revocó el acceso a `anon` y `authenticated`:
solo el cron, que usa `service_role`, la toca.

**`materialize_payment_occurrences` era `SECURITY DEFINER`.** Recibe un `payment_id`, así
que un usuario podía materializar vencimientos de un pago ajeno pasando su uuid. Pasó a
`SECURITY INVOKER`: con RLS aplicada, el `SELECT` interno no devuelve nada y la función
retorna 0. El cron sigue funcionando porque `service_role` salta RLS igualmente.

**PostgREST expone toda función de `public` como `/rest/v1/rpc/<nombre>`**, y Postgres
concede `EXECUTE` a `PUBLIC` por defecto. Es decir: `decrypt_token()` era invocable por
`anon`. Se revocó el `EXECUTE` de las doce funciones internas y de trigger, y se concedió
explícitamente solo en las dos que la aplicación llama desde la sesión del usuario.

**`search_path` mutable en siete funciones.** Sin fijarlo, un rol puede manipularlo para
que una función `SECURITY DEFINER` resuelva un nombre a código suplantado.

**`unaccent` y `pg_trgm` vivían en `public`.** Se movieron al esquema `extensions`, lo que
obligó a cualificar la llamada dentro de `normalize_merchant()` y a añadir `extensions` a
su `search_path` fijo. El índice trigram y la vista materializada sobreviven al cambio.

Tras aplicarlas, el analizador devuelve cero hallazgos. Conviene volver a pasarlo después
de cada cambio de esquema: `npx supabase inspect` o el panel → Advisors.

---

Siguiente: [`03-flujo-navegacion.md`](./03-flujo-navegacion.md)
