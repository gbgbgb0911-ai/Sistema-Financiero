# 01 — Arquitectura

## 1. Vista general

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   Navegador  │   │   WhatsApp   │   │    Gmail     │
│  (Dashboard) │   │  Cloud API   │   │     API      │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │ RSC/Actions      │ webhook          │ pull (cron)
       ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                    Next.js (App Router)                  │
│                                                          │
│  app/(dashboard)    app/api/webhooks   app/api/cron      │
│  Server Components  WhatsApp / n8n     reminders/reports │
│  + Server Actions                       /gmail-sync      │
├─────────────────────────────────────────────────────────┤
│  modules/  ── capa de aplicación (servicios por dominio) │
│    expenses │ payments │ cards │ reports │ ai │ whatsapp │
├─────────────────────────────────────────────────────────┤
│  core/     ── dominio puro (sin I/O, 100% testeable)     │
│    money · dates · recurrence · analytics · statements   │
├─────────────────────────────────────────────────────────┤
│  server/   ── infraestructura (Supabase, Anthropic, …)   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌────────────────────────────────────┐
        │  Supabase: Postgres + Auth + Storage│
        │  RLS por usuario en todas las tablas│
        └────────────────────────────────────┘
```

## 2. Las cuatro capas

La regla es simple: **las dependencias apuntan hacia adentro**. `core` no importa nada de
`server` ni de `modules`. Eso hace que la lógica financiera sea testeable sin base de datos.

### 2.1 `src/core` — dominio puro

Funciones puras, sin `async`, sin imports de Supabase ni React.

- `money.ts` — aritmética en céntimos, formateo, conversión de moneda.
- `dates.ts` — rangos (hoy/semana/mes), zonas horarias, comparación de períodos.
- `recurrence.ts` — expansión de reglas de recurrencia a ocurrencias concretas.
- `statements.ts` — ciclo de facturación de tarjetas, saldo del ciclo actual.
- `analytics.ts` — agregados, tendencias, detección de anomalías y suscripciones.

Todo lo que aquí se calcula puede verificarse con un test unitario en milisegundos.

### 2.2 `src/server` — infraestructura

Adaptadores a servicios externos. Cada uno expone una interfaz estrecha:

- `supabase/` — tres clientes: navegador, servidor (cookies), admin (service role).
- `anthropic/` — cliente del modelo, definición de tools, bucle agéntico.
- `whatsapp/` — envío de mensajes, verificación de firma del webhook.
- `gmail/` — OAuth, listado y lectura de mensajes.

### 2.3 `src/modules` — aplicación

Un directorio por dominio de negocio. Cada módulo contiene:

```
modules/expenses/
├── schema.ts        # Zod: única fuente de verdad de validación
├── repository.ts    # acceso a datos (el único que habla con Supabase)
├── service.ts       # reglas de negocio, orquestación
└── actions.ts       # Server Actions (frontera con la UI)
```

El flujo es siempre `actions → service → repository`. La UI nunca llama al repositorio
directamente.

### 2.4 `src/app` + `src/components` — presentación

App Router con dos grupos de rutas: `(auth)` público y `(dashboard)` protegido por
middleware. Los componentes se dividen en `ui/` (primitivas sin lógica de negocio) y
`features/` (compuestos, conocen el dominio).

## 3. Flujos críticos

### 3.1 Mensaje entrante de WhatsApp

```
POST /api/webhooks/whatsapp
  1. Verificar firma HMAC (X-Hub-Signature-256)     ── rechaza si falla
  2. INSERT inbound_messages (provider_message_id)  ── UNIQUE = idempotencia
  3. Responder 200 inmediatamente                   ── evita reintentos de Meta
  4. after() → procesar en segundo plano:
       ├── ¿es respuesta a un recordatorio? → aplicar acción (pagado/posponer/…)
       └── si no → agente de IA con tools
  5. Enviar respuesta vía WhatsApp Send API
```

El paso 3 es lo que hace que el sistema no duplique mensajes. `after()` de Next 15
permite trabajo posterior a la respuesta sin infraestructura de colas adicional.

### 3.2 Agente de IA (tool use)

Bucle agéntico sobre la Messages API de Anthropic (`claude-opus-5`), con *tools* tipadas:

| Tool | Tipo | Qué hace |
|---|---|---|
| `get_spending_summary` | lectura | Totales por período con comparación |
| `list_expenses` | lectura | Búsqueda filtrada |
| `get_upcoming_payments` | lectura | Pagos próximos |
| `get_card_balance` | lectura | Saldo del ciclo de una tarjeta |
| `get_category_breakdown` | lectura | Desglose por categoría |
| `create_expense` | escritura | Registra un gasto |
| `mark_payment_paid` | escritura | Marca una ocurrencia como pagada |
| `create_payment` | escritura | Crea un pago programado |

Reglas del agente:

- Las tools de **escritura** devuelven un resumen de lo hecho para que el modelo confirme
  al usuario en lenguaje natural.
- Los datos que vienen de fuera (texto del usuario, contenido de correos) se pasan como
  **datos**, nunca como instrucciones del sistema. El prompt del sistema es fijo y está en
  el repo.
- Límite de iteraciones (`MAX_TOOL_ROUNDS`) para evitar bucles infinitos.
- `output_config.effort` se ajusta por tipo de consulta: `low` para lecturas simples,
  `high` para análisis.

### 3.3 Sincronización de Gmail

```
GET /api/cron/gmail-sync  (o botón manual en Ajustes)
  1. Para cada cuenta conectada:
     a. gmail.users.messages.list(q: "from:(...) newer_than:7d")
     b. Filtrar los ya vistos por gmail_message_id
     c. Para cada mensaje:
          ├── Nivel 1: reglas regex por emisor (email_rules)
          ├── Nivel 2: si falla → extracción con Claude (structured output)
          └── Nivel 3: si confidence < umbral → pending_review + pregunta por WhatsApp
     d. Detectar duplicados (mismo comercio/importe/tarjeta en ±90 min)
     e. INSERT expense con source='email' y confidence
```

### 3.4 Recordatorios

Cron horario. Para cada ocurrencia de pago pendiente calcula qué recordatorios
corresponden (`day_before`, `due_day`, `overdue`) y los inserta en `reminders`. El
`UNIQUE(occurrence_id, kind)` garantiza que reejecutar el cron no duplique envíos.

## 4. Seguridad

| Vector | Control |
|---|---|
| Acceso entre usuarios | RLS con `auth.uid() = user_id` en **todas** las tablas |
| Webhook falsificado | HMAC SHA-256 con `WHATSAPP_APP_SECRET`, comparación en tiempo constante |
| Cron invocado por terceros | Header `Authorization: Bearer $CRON_SECRET` |
| Prompt injection | Datos externos como datos; tools de escritura acotadas al `user_id` de sesión |
| Secretos en cliente | Solo `NEXT_PUBLIC_*` llega al navegador; `SUPABASE_SERVICE_ROLE_KEY` nunca |
| Tokens OAuth de Gmail | Cifrados en reposo (`pgcrypto`) en `email_accounts` |
| Adjuntos | Storage privado con políticas por `user_id`; URLs firmadas de corta duración |

## 5. Rendimiento

- **Server Components por defecto** — el cliente solo hidrata lo interactivo (gráficos,
  formularios, filtros).
- **Índices** en las columnas de filtrado real: `(user_id, occurred_at DESC)`,
  `(user_id, category_id)`, `(user_id, card_id)`, más un índice GIN de búsqueda de texto
  sobre comercio y notas.
- **Vistas materializadas** para agregados mensuales pesados (`mv_monthly_category_totals`),
  refrescadas por cron.
- **Paginación con cursor** en el historial (no `OFFSET`, que degrada con el volumen).
- **Prompt caching** de Anthropic sobre el prompt de sistema y las definiciones de tools,
  que son estables entre peticiones.

## 6. Modelo de IA

Se usa `claude-opus-5` (1M de contexto, thinking adaptativo). Notas de implementación:

- No se envían `temperature`, `top_p` ni `budget_tokens` — el modelo los rechaza.
- `thinking` está activo por defecto; `max_tokens` se dimensiona contemplando thinking +
  respuesta.
- Se usa *streaming* en la ruta de chat del dashboard y respuesta completa en WhatsApp.
- Extracción de datos de correos con `output_config.format` (structured outputs), que
  garantiza JSON válido contra el esquema.

---

Siguiente: [`02-base-de-datos.md`](./02-base-de-datos.md)
