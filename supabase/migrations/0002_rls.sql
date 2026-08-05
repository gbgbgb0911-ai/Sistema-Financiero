-- =============================================================================
-- 0002_rls.sql — Seguridad a nivel de fila
--
-- Regla: TODAS las tablas de negocio tienen RLS habilitado. Sin excepción.
-- El aislamiento entre usuarios es el control de seguridad más importante
-- del sistema y no debe depender de que la capa de aplicación filtre bien.
-- =============================================================================

alter table public.profiles              enable row level security;
alter table public.categories            enable row level security;
alter table public.merchants             enable row level security;
alter table public.cards                 enable row level security;
alter table public.expenses              enable row level security;
alter table public.attachments           enable row level security;
alter table public.payments              enable row level security;
alter table public.payment_occurrences   enable row level security;
alter table public.reminders             enable row level security;
alter table public.notifications         enable row level security;
alter table public.budgets               enable row level security;
alter table public.categorization_rules  enable row level security;
alter table public.email_accounts        enable row level security;
alter table public.email_rules           enable row level security;
alter table public.inbound_messages      enable row level security;
alter table public.conversations         enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.reports               enable row level security;
alter table public.automations           enable row level security;
alter table public.audit_log             enable row level security;
alter table public.ai_usage              enable row level security;

-- -----------------------------------------------------------------------------
-- Perfil: el usuario ve y edita únicamente el suyo.
-- No hay política de INSERT: el perfil lo crea el trigger handle_new_user().
-- -----------------------------------------------------------------------------
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- Tablas con user_id directo: una única política FOR ALL.
-- -----------------------------------------------------------------------------
create policy "categories_owner" on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "merchants_owner" on public.merchants
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "cards_owner" on public.cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "expenses_owner" on public.expenses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "attachments_owner" on public.attachments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "payments_owner" on public.payments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- payment_occurrences lleva user_id denormalizado a propósito: hacer el join
-- contra payments en cada evaluación de política encarecía las consultas del
-- calendario, que son las más frecuentes del dashboard.
create policy "occurrences_owner" on public.payment_occurrences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "reminders_owner" on public.reminders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notifications_owner" on public.notifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "budgets_owner" on public.budgets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "catrules_owner" on public.categorization_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "email_accounts_owner" on public.email_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "inbound_owner" on public.inbound_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "conversations_owner" on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "conv_messages_owner" on public.conversation_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "reports_owner" on public.reports
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "automations_owner" on public.automations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Reglas de correo: las globales (user_id IS NULL) son legibles por todos,
-- pero solo se pueden crear/editar las propias.
-- -----------------------------------------------------------------------------
create policy "email_rules_select" on public.email_rules
  for select using (user_id is null or user_id = auth.uid());

create policy "email_rules_insert" on public.email_rules
  for insert with check (user_id = auth.uid());

create policy "email_rules_update" on public.email_rules
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "email_rules_delete" on public.email_rules
  for delete using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Auditoría y uso de IA: solo lectura para el usuario.
-- La escritura la hacen triggers y el service role, que saltan RLS.
-- -----------------------------------------------------------------------------
create policy "audit_select_own" on public.audit_log
  for select using (user_id = auth.uid());

create policy "ai_usage_select_own" on public.ai_usage
  for select using (user_id = auth.uid());

-- =============================================================================
-- STORAGE: comprobantes
--
-- Bucket privado. La ruta debe empezar por el uuid del usuario:
--   receipts/<user_id>/<expense_id>/<archivo>
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

create policy "receipts_select_own" on storage.objects
  for select using (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts_delete_own" on storage.objects
  for delete using (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );
