# 04 — Estructura de carpetas

Organización **feature-first**: se agrupa por dominio de negocio, no por tipo de archivo.
Al tocar "gastos" todo lo relevante está junto.

```
Sistema-Financiero/
├── docs/                          Documentación de diseño (este directorio)
├── supabase/
│   ├── migrations/
│   │   ├── …_init_schema.sql      Extensiones, tipos, tablas, índices
│   │   ├── …_row_level_security   Políticas de seguridad a nivel de fila
│   │   ├── …_functions_and_…      Triggers, funciones, vistas materializadas
│   │   ├── …_seed_email_rules     Reglas de correo de los bancos
│   │   ├── …_security_hardening   Cierra los hallazgos del analizador
│   │   ├── …_move_extensions_…    unaccent y pg_trgm fuera de `public`
│   │   ├── …_align_normalize_…    normalize_merchant == core/text.ts
│   │   └── …_restore_accents_…    Tildes en las categorías por defecto
│   └── config.toml
│
├── src/
│   ├── app/                       ── Next.js App Router
│   │   ├── layout.tsx             Root: fuentes, ThemeProvider, Toaster
│   │   ├── page.tsx               Redirección según sesión
│   │   ├── globals.css            Tokens de diseño + Tailwind
│   │   │
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   └── onboarding/page.tsx
│   │   ├── auth/callback/route.ts
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx         Sidebar + Topbar + guard de sesión
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── gastos/
│   │   │   ├── pagos/
│   │   │   ├── calendario/
│   │   │   ├── tarjetas/
│   │   │   ├── categorias/
│   │   │   ├── reportes/
│   │   │   ├── asistente/
│   │   │   └── ajustes/
│   │   │
│   │   └── api/
│   │       ├── webhooks/whatsapp/route.ts
│   │       ├── webhooks/n8n/route.ts
│   │       ├── cron/reminders/route.ts
│   │       ├── cron/reports/route.ts
│   │       ├── cron/gmail-sync/route.ts
│   │       ├── ai/chat/route.ts
│   │       └── gmail/{connect,callback}/route.ts
│   │
│   ├── core/                      ── DOMINIO PURO (sin I/O, testeable)
│   │   ├── money.ts               Aritmética en céntimos, formateo, FX
│   │   ├── dates.ts               Rangos, zonas horarias, comparaciones
│   │   ├── recurrence.ts          Expansión de reglas recurrentes
│   │   ├── statements.ts          Ciclos de facturación de tarjetas
│   │   ├── analytics.ts           Agregados, tendencias, anomalías
│   │   ├── text.ts                Normalización de nombres de comercio
│   │   └── errors.ts              Errores de dominio tipados
│   │
│   ├── server/                    ── INFRAESTRUCTURA
│   │   ├── env.ts                 Validación de variables con Zod
│   │   ├── supabase/
│   │   │   ├── client.ts          Navegador
│   │   │   ├── server.ts          Servidor (cookies)
│   │   │   ├── admin.ts           Service role (solo rutas de servidor)
│   │   │   └── middleware.ts      Refresco de sesión
│   │   ├── anthropic/
│   │   │   ├── client.ts
│   │   │   ├── tools.ts           Definición de tools del asistente
│   │   │   ├── agent.ts           Bucle agéntico
│   │   │   └── prompts.ts         Prompts de sistema (versionados)
│   │   ├── whatsapp/
│   │   │   ├── client.ts          Envío de mensajes
│   │   │   ├── signature.ts       Verificación HMAC
│   │   │   └── types.ts
│   │   └── gmail/
│   │       ├── oauth.ts
│   │       └── client.ts
│   │
│   ├── modules/                   ── APLICACIÓN (un directorio por dominio)
│   │   ├── expenses/{schema,repository,service,actions}.ts
│   │   ├── payments/{schema,repository,service,actions}.ts
│   │   ├── cards/{schema,repository,service,actions}.ts
│   │   ├── categories/{schema,repository,service,actions}.ts
│   │   ├── merchants/{repository,service}.ts
│   │   ├── budgets/{schema,repository,service}.ts
│   │   ├── reports/{service,templates}.ts
│   │   ├── reminders/service.ts
│   │   ├── email-ingest/{parser,rules,service}.ts
│   │   ├── assistant/{service,intents}.ts
│   │   └── profile/{schema,repository,service,actions}.ts
│   │
│   ├── components/
│   │   ├── ui/                    Primitivas sin lógica de negocio
│   │   │   button · card · input · select · dialog · sheet · table
│   │   │   badge · tabs · skeleton · toast · tooltip · dropdown · …
│   │   ├── layout/                Sidebar, Topbar, MobileNav, ThemeToggle
│   │   ├── charts/                Envoltorios de Recharts con tokens del tema
│   │   └── features/              Compuestos que conocen el dominio
│   │       ├── expenses/          ExpenseForm, ExpenseTable, ExpenseFilters
│   │       ├── payments/          PaymentForm, UpcomingPayments, PaymentCalendar
│   │       ├── dashboard/         KpiCards, CashflowChart, CategoryDonut
│   │       └── assistant/         ChatPanel, MessageBubble
│   │
│   ├── hooks/                     useDebounce, useMediaQuery, useFilters
│   ├── types/
│   │   ├── database.ts            Generado: supabase gen types
│   │   └── domain.ts              Tipos de negocio derivados
│   ├── lib/
│   │   ├── utils.ts               cn(), helpers de UI
│   │   ├── constants.ts
│   │   └── format.ts              Formateo localizado
│   └── middleware.ts              Guard de rutas + refresco de sesión
│
├── tests/
│   ├── core/                      Dominio puro (rápidos)
│   └── modules/                   Parsers y servicios
│
├── .env.example
├── next.config.ts · tailwind.config.ts · tsconfig.json
├── vercel.json                    Definición de crons
└── README.md
```

## Reglas de dependencia

```
app  →  components  →  modules  →  core
                          ↓
                       server
```

- `core` **no importa nada** de las otras capas. Es la garantía de testeabilidad.
- Solo `modules/*/repository.ts` habla con Supabase. Un componente que importe
  `supabase` directamente es un error de revisión.
- `server/` es reemplazable: cambiar de proveedor de WhatsApp toca un directorio.

## Convenciones

| Elemento | Convención | Ejemplo |
|---|---|---|
| Componentes | `PascalCase.tsx` | `ExpenseForm.tsx` |
| Utilidades y módulos | `kebab-case.ts` | `email-ingest/parser.ts` |
| Rutas | español, en minúscula | `/gastos`, `/tarjetas` |
| Tablas y columnas | `snake_case` inglés | `payment_occurrences.due_date` |
| Server Actions | verbo + sustantivo | `createExpense`, `markOccurrencePaid` |
| Esquemas Zod | sufijo `Schema` | `expenseInputSchema` |

La interfaz está en español (es el idioma del usuario); el código, el esquema y los
identificadores están en inglés (es la convención del ecosistema y evita mezclar).

---

Siguiente: [`05-roadmap.md`](./05-roadmap.md)
