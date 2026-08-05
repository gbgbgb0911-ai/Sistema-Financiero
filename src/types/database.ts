/**
 * Tipos de la base de datos.
 *
 * En un proyecto conectado se regeneran con `npm run db:types`
 * (`supabase gen types typescript --linked`). Se mantienen aquí escritos a mano
 * y sincronizados con `supabase/migrations/` para que el repo compile sin
 * necesitar una conexión activa a Supabase.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// -- Enums --------------------------------------------------------------------

export type CurrencyCode = "PEN" | "USD" | "EUR";
export type CategoryKind = "expense" | "income";
export type CardKind = "credit" | "debit" | "cash" | "bank_account" | "wallet";
export type ExpenseSource = "manual" | "email" | "whatsapp" | "import" | "recurring";
export type ExpenseStatus = "confirmed" | "pending_review" | "possible_duplicate" | "voided";
export type PaymentFrequency =
  | "once"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly";
export type OccurrenceStatus = "pending" | "paid" | "overdue" | "skipped" | "canceled";
export type ReminderKind = "day_before" | "due_day" | "overdue" | "snoozed";
export type NotificationChannel = "whatsapp" | "email" | "push" | "in_app" | "web";
export type NotificationStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type MessageDirection = "inbound" | "outbound";
export type ProcessingStatus = "queued" | "processing" | "done" | "failed";
export type ReportKind = "daily" | "weekly" | "monthly";
export type BudgetPeriod = "weekly" | "monthly";
export type RuleMatchType = "merchant_contains" | "merchant_equals" | "amount_range" | "regex";
export type AuditActor = "user" | "ai" | "system";

// -- Filas --------------------------------------------------------------------

export type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone_e164: string | null;
  timezone: string;
  base_currency: CurrencyCode;
  locale: string;
  whatsapp_opt_in: boolean;
  onboarded_at: string | null;
  notification_prefs: {
    daily_report?: boolean;
    weekly_report?: boolean;
    monthly_report?: boolean;
    report_hour?: number;
    reminder_hour?: number;
  };
  created_at: string;
  updated_at: string;
}

export type CategoryRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  is_system: boolean;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MerchantRow = {
  id: string;
  user_id: string;
  name: string;
  normalized_name: string;
  default_category_id: string | null;
  logo_url: string | null;
  is_subscription: boolean;
  visit_count: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CardRow = {
  id: string;
  user_id: string;
  name: string;
  kind: CardKind;
  issuer: string | null;
  last4: string | null;
  currency: CurrencyCode;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
  color: string;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseRow = {
  id: string;
  user_id: string;
  merchant_id: string | null;
  category_id: string | null;
  card_id: string | null;
  amount: number;
  currency: CurrencyCode;
  amount_base: number | null;
  fx_rate: number;
  occurred_at: string;
  description: string | null;
  merchant_raw: string | null;
  notes: string | null;
  source: ExpenseSource;
  status: ExpenseStatus;
  confidence: number | null;
  external_ref: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export type AttachmentRow = {
  id: string;
  user_id: string;
  expense_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  ocr_text: string | null;
  created_at: string;
}

export type PaymentRow = {
  id: string;
  user_id: string;
  category_id: string | null;
  card_id: string | null;
  merchant_id: string | null;
  name: string;
  amount: number;
  currency: CurrencyCode;
  frequency: PaymentFrequency;
  anchor_date: string;
  end_date: string | null;
  reminder_days: number[];
  auto_create_expense: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PaymentOccurrenceRow = {
  id: string;
  user_id: string;
  payment_id: string;
  expense_id: string | null;
  due_date: string;
  amount: number;
  currency: CurrencyCode;
  status: OccurrenceStatus;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ReminderRow = {
  id: string;
  user_id: string;
  occurrence_id: string;
  kind: ReminderKind;
  scheduled_for: string;
  sent_at: string | null;
  channel: NotificationChannel;
  created_at: string;
}

export type NotificationRow = {
  id: string;
  user_id: string;
  reminder_id: string | null;
  channel: NotificationChannel;
  status: NotificationStatus;
  body: string;
  provider_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export type BudgetRow = {
  id: string;
  user_id: string;
  category_id: string | null;
  period: BudgetPeriod;
  amount: number;
  currency: CurrencyCode;
  starts_on: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CategorizationRuleRow = {
  id: string;
  user_id: string;
  category_id: string;
  match_type: RuleMatchType;
  pattern: string;
  amount_min: number | null;
  amount_max: number | null;
  priority: number;
  is_active: boolean;
  hit_count: number;
  created_at: string;
}

export type EmailAccountRow = {
  id: string;
  user_id: string;
  provider: string;
  email: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  last_history_id: string | null;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type EmailRuleRow = {
  id: string;
  user_id: string | null;
  issuer_name: string;
  from_pattern: string;
  subject_pattern: string | null;
  extractors: Record<string, string>;
  currency_hint: CurrencyCode | null;
  priority: number;
  is_active: boolean;
  hit_count: number;
  miss_count: number;
  created_at: string;
  updated_at: string;
}

export type InboundMessageRow = {
  id: string;
  user_id: string | null;
  channel: NotificationChannel;
  provider_message_id: string;
  from_phone: string | null;
  body: string | null;
  raw_payload: Json;
  status: ProcessingStatus;
  attempts: number;
  error: string | null;
  received_at: string;
  processed_at: string | null;
}

export type ConversationRow = {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  title: string | null;
  last_message_at: string;
  created_at: string;
}

export type ConversationMessageRow = {
  id: string;
  user_id: string;
  conversation_id: string;
  direction: MessageDirection;
  role: "user" | "assistant";
  content: string;
  tool_calls: Json | null;
  created_at: string;
}

export type ReportRow = {
  id: string;
  user_id: string;
  kind: ReportKind;
  period_start: string;
  period_end: string;
  payload: Json;
  summary_text: string | null;
  sent_at: string | null;
  created_at: string;
}

export type AutomationRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  trigger: Json;
  action: Json;
  is_active: boolean;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export type AuditLogRow = {
  id: number;
  user_id: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  before: Json | null;
  after: Json | null;
  actor: AuditActor;
  created_at: string;
}

export type AiUsageRow = {
  id: number;
  user_id: string | null;
  model: string;
  purpose: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_estimate: number | null;
  created_at: string;
}

// -- Mapa de tablas -----------------------------------------------------------

type Writable<T> = Omit<T, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Writable<Row>>;
  Update: Partial<Writable<Row>>;
  Relationships: [];
}

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<ProfileRow>;
      categories: TableDef<CategoryRow>;
      merchants: TableDef<MerchantRow>;
      cards: TableDef<CardRow>;
      expenses: TableDef<ExpenseRow>;
      attachments: TableDef<AttachmentRow>;
      payments: TableDef<PaymentRow>;
      payment_occurrences: TableDef<PaymentOccurrenceRow>;
      reminders: TableDef<ReminderRow>;
      notifications: TableDef<NotificationRow>;
      budgets: TableDef<BudgetRow>;
      categorization_rules: TableDef<CategorizationRuleRow>;
      email_accounts: TableDef<EmailAccountRow>;
      email_rules: TableDef<EmailRuleRow>;
      inbound_messages: TableDef<InboundMessageRow>;
      conversations: TableDef<ConversationRow>;
      conversation_messages: TableDef<ConversationMessageRow>;
      reports: TableDef<ReportRow>;
      automations: TableDef<AutomationRow>;
      audit_log: TableDef<AuditLogRow>;
      ai_usage: TableDef<AiUsageRow>;
    };
    // Sin vistas expuestas al cliente. Se escribe así, y no como
    // `Record<string, never>`, porque supabase-js exige que los valores
    // cumplan `GenericView`; un objeto vacío lo satisface de forma vacua.
    Views: { [_ in never]: never };
    Functions: {
      spending_summary: {
        Args: { p_user_id: string; p_from: string; p_to: string };
        Returns: Array<{
          total: number;
          expense_count: number;
          avg_amount: number;
          max_amount: number;
          top_category: string | null;
          top_merchant: string | null;
        }>;
      };
      materialize_payment_occurrences: {
        Args: { p_payment_id: string; p_horizon?: string };
        Returns: number;
      };
      mark_overdue_occurrences: { Args: Record<string, never>; Returns: number };
      refresh_monthly_totals: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: {
      currency_code: CurrencyCode;
      category_kind: CategoryKind;
      card_kind: CardKind;
      expense_source: ExpenseSource;
      expense_status: ExpenseStatus;
      payment_frequency: PaymentFrequency;
      occurrence_status: OccurrenceStatus;
      reminder_kind: ReminderKind;
      notification_channel: NotificationChannel;
      notification_status: NotificationStatus;
      message_direction: MessageDirection;
      processing_status: ProcessingStatus;
      report_kind: ReportKind;
      budget_period: BudgetPeriod;
      rule_match_type: RuleMatchType;
      audit_actor: AuditActor;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
