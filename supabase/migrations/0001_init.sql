-- =============================================================================
-- 0001_init.sql — Extensiones, tipos, tablas e índices
-- Sistema Financiero Personal con IA
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "unaccent";
create extension if not exists "pg_trgm";

-- =============================================================================
-- TIPOS
-- =============================================================================

create type public.currency_code as enum ('PEN', 'USD', 'EUR');
create type public.category_kind as enum ('expense', 'income');
create type public.card_kind as enum ('credit', 'debit', 'cash', 'bank_account', 'wallet');
create type public.expense_source as enum ('manual', 'email', 'whatsapp', 'import', 'recurring');
create type public.expense_status as enum ('confirmed', 'pending_review', 'possible_duplicate', 'voided');
create type public.payment_frequency as enum ('once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');
create type public.occurrence_status as enum ('pending', 'paid', 'overdue', 'skipped', 'canceled');
create type public.reminder_kind as enum ('day_before', 'due_day', 'overdue', 'snoozed');
-- 'web' cubre el chat del asistente dentro de la aplicación.
create type public.notification_channel as enum ('whatsapp', 'email', 'push', 'in_app', 'web');
create type public.notification_status as enum ('queued', 'sent', 'delivered', 'read', 'failed');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.processing_status as enum ('queued', 'processing', 'done', 'failed');
create type public.report_kind as enum ('daily', 'weekly', 'monthly');
create type public.budget_period as enum ('weekly', 'monthly');
create type public.rule_match_type as enum ('merchant_contains', 'merchant_equals', 'amount_range', 'regex');
create type public.audit_actor as enum ('user', 'ai', 'system');

-- =============================================================================
-- PERFILES
-- =============================================================================

create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text,
  avatar_url         text,
  -- Clave para resolver el usuario a partir de un mensaje de WhatsApp.
  phone_e164         text unique,
  timezone           text not null default 'America/Lima',
  base_currency      public.currency_code not null default 'PEN',
  locale             text not null default 'es-PE',
  whatsapp_opt_in    boolean not null default false,
  onboarded_at       timestamptz,
  notification_prefs jsonb not null default jsonb_build_object(
    'daily_report',   false,
    'weekly_report',  true,
    'monthly_report', true,
    'report_hour',    9,
    'reminder_hour',  9
  ),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column public.profiles.phone_e164 is
  'Teléfono en formato E.164 sin "+". Resuelve el usuario desde el webhook de WhatsApp.';
comment on column public.profiles.timezone is
  'Zona horaria IANA. TODOS los agregados temporales la usan; sin esto "gastos de hoy" es incorrecto.';

-- =============================================================================
-- CATEGORÍAS
-- =============================================================================

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  parent_id   uuid references public.categories (id) on delete set null,
  name        text not null,
  slug        text not null,
  kind        public.category_kind not null default 'expense',
  icon        text not null default 'circle',
  color       text not null default '#64748b',
  is_system   boolean not null default false,
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_categories_user_slug unique (user_id, slug),
  constraint ck_categories_not_self_parent check (id <> parent_id)
);

create index idx_categories_user on public.categories (user_id) where archived_at is null;

-- =============================================================================
-- COMERCIOS
-- =============================================================================

create table public.merchants (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  name                text not null,
  -- Normalizado (minúsculas, sin acentos ni sufijos de banco). Agrupa
  -- "RAPPI*PERU", "Rappi Peru SAC" y "RAPPI  PE" en una sola entidad.
  normalized_name     text not null,
  default_category_id uuid references public.categories (id) on delete set null,
  logo_url            text,
  is_subscription     boolean not null default false,
  visit_count         integer not null default 0,
  last_seen_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_merchants_user_normalized unique (user_id, normalized_name)
);

create index idx_merchants_user_name on public.merchants using gin (normalized_name gin_trgm_ops);

-- =============================================================================
-- TARJETAS Y MÉTODOS DE PAGO
-- =============================================================================

create table public.cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  kind          public.card_kind not null default 'credit',
  issuer        text,
  -- Solo los 4 últimos dígitos. Nunca se almacena el número completo.
  last4         char(4),
  currency      public.currency_code not null default 'PEN',
  credit_limit  numeric(14, 2),
  -- Día de corte y día de vencimiento: habilitan el cálculo del ciclo.
  statement_day smallint check (statement_day between 1 and 31),
  due_day       smallint check (due_day between 1 and 31),
  color         text not null default '#0f172a',
  is_default    boolean not null default false,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ck_cards_last4_digits check (last4 is null or last4 ~ '^[0-9]{4}$')
);

create index idx_cards_user on public.cards (user_id) where archived_at is null;

-- =============================================================================
-- GASTOS  (tabla central)
-- =============================================================================

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  merchant_id  uuid references public.merchants (id) on delete set null,
  category_id  uuid references public.categories (id) on delete set null,
  card_id      uuid references public.cards (id) on delete set null,

  amount       numeric(14, 2) not null check (amount >= 0),
  currency     public.currency_code not null default 'PEN',
  -- Importe convertido a la moneda base del perfil. Permite sumar movimientos
  -- de distintas monedas sin perder el importe original.
  amount_base  numeric(14, 2),
  fx_rate      numeric(14, 6) not null default 1,

  occurred_at  timestamptz not null default now(),
  description  text,
  -- Texto del comercio tal como llegó del banco. Se conserva para auditar el parser.
  merchant_raw text,
  notes        text,

  source       public.expense_source not null default 'manual',
  status       public.expense_status not null default 'confirmed',
  confidence   numeric(3, 2) check (confidence between 0 and 1),
  -- gmail_message_id u otro identificador externo. UNIQUE por usuario => sin duplicados.
  external_ref text,
  metadata     jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Columna generada para el buscador. Índice GIN abajo.
  search_tsv   tsvector generated always as (
    to_tsvector(
      'spanish',
      coalesce(merchant_raw, '') || ' ' ||
      coalesce(description, '')  || ' ' ||
      coalesce(notes, '')
    )
  ) stored
);

create index idx_expenses_user_date     on public.expenses (user_id, occurred_at desc);
create index idx_expenses_user_category on public.expenses (user_id, category_id, occurred_at desc);
create index idx_expenses_user_card     on public.expenses (user_id, card_id, occurred_at desc);
create index idx_expenses_user_merchant on public.expenses (user_id, merchant_id, occurred_at desc);
create index idx_expenses_search        on public.expenses using gin (search_tsv);
create index idx_expenses_pending       on public.expenses (user_id, created_at desc)
  where status in ('pending_review', 'possible_duplicate');
create unique index uq_expenses_external on public.expenses (user_id, external_ref)
  where external_ref is not null;

-- =============================================================================
-- ADJUNTOS
-- =============================================================================

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  expense_id   uuid references public.expenses (id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  ocr_text     text,
  created_at   timestamptz not null default now()
);

create index idx_attachments_expense on public.attachments (expense_id);

-- =============================================================================
-- PAGOS  (regla) y OCURRENCIAS (instancias)
-- =============================================================================

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  category_id    uuid references public.categories (id) on delete set null,
  card_id        uuid references public.cards (id) on delete set null,
  merchant_id    uuid references public.merchants (id) on delete set null,

  name           text not null,
  amount         numeric(14, 2) not null check (amount >= 0),
  currency       public.currency_code not null default 'PEN',
  frequency      public.payment_frequency not null default 'monthly',
  -- Fecha del primer vencimiento; de ella se derivan las siguientes ocurrencias.
  anchor_date    date not null,
  end_date       date,
  -- Días de antelación de los recordatorios. Por defecto 1 día antes y el mismo día.
  reminder_days  smallint[] not null default array[1, 0],
  auto_create_expense boolean not null default true,
  notes          text,
  is_active      boolean not null default true,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ck_payments_end_after_anchor check (end_date is null or end_date >= anchor_date)
);

create index idx_payments_user_active on public.payments (user_id) where is_active;

comment on table public.payments is
  'REGLA de pago. Las instancias concretas viven en payment_occurrences, lo que permite '
  'marcar pagado un mes sin afectar a los demás.';

create table public.payment_occurrences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  payment_id  uuid not null references public.payments (id) on delete cascade,
  expense_id  uuid references public.expenses (id) on delete set null,

  due_date    date not null,
  amount      numeric(14, 2) not null check (amount >= 0),
  currency    public.currency_code not null default 'PEN',
  status      public.occurrence_status not null default 'pending',
  paid_at     timestamptz,
  notes       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Hace idempotente la materialización de ocurrencias.
  constraint uq_occurrences_payment_due unique (payment_id, due_date)
);

create index idx_occurrences_user_due on public.payment_occurrences (user_id, due_date)
  where status in ('pending', 'overdue');
create index idx_occurrences_payment on public.payment_occurrences (payment_id, due_date desc);

-- =============================================================================
-- RECORDATORIOS Y NOTIFICACIONES
-- =============================================================================

create table public.reminders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  occurrence_id uuid not null references public.payment_occurrences (id) on delete cascade,
  kind          public.reminder_kind not null,
  scheduled_for timestamptz not null,
  sent_at       timestamptz,
  channel       public.notification_channel not null default 'whatsapp',
  created_at    timestamptz not null default now(),
  -- Garantiza que reejecutar el cron no envíe el mismo recordatorio dos veces.
  constraint uq_reminders_occurrence_kind unique (occurrence_id, kind)
);

create index idx_reminders_pending on public.reminders (scheduled_for)
  where sent_at is null;

create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  reminder_id         uuid references public.reminders (id) on delete set null,
  channel             public.notification_channel not null default 'whatsapp',
  status              public.notification_status not null default 'queued',
  body                text not null,
  provider_message_id text,
  error               text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index idx_notifications_user on public.notifications (user_id, created_at desc);

-- =============================================================================
-- PRESUPUESTOS
-- =============================================================================

create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  -- NULL = presupuesto global (todas las categorías).
  category_id uuid references public.categories (id) on delete cascade,
  period      public.budget_period not null default 'monthly',
  amount      numeric(14, 2) not null check (amount > 0),
  currency    public.currency_code not null default 'PEN',
  starts_on   date not null default date_trunc('month', now())::date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index uq_budgets_user_category_period
  on public.budgets (user_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid), period)
  where is_active;

-- =============================================================================
-- REGLAS DE AUTO-CATEGORIZACIÓN
-- =============================================================================

create table public.categorization_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  match_type  public.rule_match_type not null default 'merchant_contains',
  pattern     text not null,
  amount_min  numeric(14, 2),
  amount_max  numeric(14, 2),
  priority    integer not null default 100,
  is_active   boolean not null default true,
  hit_count   integer not null default 0,
  created_at  timestamptz not null default now()
);

create index idx_catrules_user on public.categorization_rules (user_id, priority)
  where is_active;

-- =============================================================================
-- CORREO: CUENTAS Y REGLAS DE EXTRACCIÓN
-- =============================================================================

create table public.email_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  provider              text not null default 'gmail',
  email                 text not null,
  -- Tokens cifrados en reposo con pgcrypto (ver 0003_functions.sql).
  access_token_enc      bytea,
  refresh_token_enc     bytea,
  token_expires_at      timestamptz,
  last_history_id       text,
  last_synced_at        timestamptz,
  sync_status           text not null default 'idle',
  sync_error            text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint uq_email_accounts_user_email unique (user_id, email)
);

create table public.email_rules (
  id              uuid primary key default gen_random_uuid(),
  -- NULL = regla global del sistema, disponible para todos los usuarios.
  user_id         uuid references public.profiles (id) on delete cascade,
  issuer_name     text not null,
  from_pattern    text not null,
  subject_pattern text,
  -- Regex nombradas: {"amount": "...", "merchant": "...", "card_last4": "...", ...}
  extractors      jsonb not null default '{}'::jsonb,
  currency_hint   public.currency_code,
  priority        integer not null default 100,
  is_active       boolean not null default true,
  -- Métricas para detectar cuándo un banco cambia el formato de sus correos.
  hit_count       integer not null default 0,
  miss_count      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_email_rules_lookup on public.email_rules (priority) where is_active;

-- =============================================================================
-- WHATSAPP: COLA DE ENTRADA Y CONVERSACIONES
-- =============================================================================

create table public.inbound_messages (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles (id) on delete cascade,
  channel             public.notification_channel not null default 'whatsapp',
  -- UNIQUE global: es la garantía de idempotencia frente a los reintentos de Meta.
  provider_message_id text not null unique,
  from_phone          text,
  body                text,
  raw_payload         jsonb not null default '{}'::jsonb,
  status              public.processing_status not null default 'queued',
  attempts            smallint not null default 0,
  error               text,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz
);

create index idx_inbound_queued on public.inbound_messages (received_at)
  where status = 'queued';

create table public.conversations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  channel        public.notification_channel not null default 'whatsapp',
  title          text,
  last_message_at timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index idx_conversations_user on public.conversations (user_id, last_message_at desc);

create table public.conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction       public.message_direction not null,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  tool_calls      jsonb,
  created_at      timestamptz not null default now()
);

create index idx_conv_messages on public.conversation_messages (conversation_id, created_at);

-- =============================================================================
-- REPORTES
-- =============================================================================

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         public.report_kind not null,
  period_start date not null,
  period_end   date not null,
  payload      jsonb not null default '{}'::jsonb,
  summary_text text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  -- Evita regenerar el mismo reporte dos veces.
  constraint uq_reports_user_kind_period unique (user_id, kind, period_start)
);

create index idx_reports_user on public.reports (user_id, period_start desc);

-- =============================================================================
-- AUTOMATIZACIONES (expuestas a n8n)
-- =============================================================================

create table public.automations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  description   text,
  trigger       jsonb not null,
  action        jsonb not null,
  is_active     boolean not null default true,
  last_run_at   timestamptz,
  run_count     integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- =============================================================================
-- AUDITORÍA Y USO DE IA
-- =============================================================================

create table public.audit_log (
  id         bigserial primary key,
  user_id    uuid references public.profiles (id) on delete cascade,
  table_name text not null,
  record_id  uuid,
  action     text not null,
  before     jsonb,
  after      jsonb,
  actor      public.audit_actor not null default 'user',
  created_at timestamptz not null default now()
);

create index idx_audit_user on public.audit_log (user_id, created_at desc);

create table public.ai_usage (
  id                bigserial primary key,
  user_id           uuid references public.profiles (id) on delete cascade,
  model             text not null,
  purpose           text not null,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_estimate     numeric(10, 6),
  created_at        timestamptz not null default now()
);

create index idx_ai_usage_user on public.ai_usage (user_id, created_at desc);
