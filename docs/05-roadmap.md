# 05 — Plan de construcción y estado

## Orden de construcción

Cada fase deja el sistema en un estado ejecutable. No hay fases que solo "preparen".

| # | Fase | Contenido | Estado |
|---|---|---|---|
| 0 | Análisis y diseño | Este directorio `docs/` | ✅ |
| 1 | Andamiaje | Next 15 + TS estricto + Tailwind + tokens de diseño | ✅ |
| 2 | Base de datos | Migraciones: tablas, RLS, triggers, semillas | ✅ |
| 3 | Dominio puro | `core/`: money, dates, recurrence, statements, analytics | ✅ |
| 4 | Infraestructura | Clientes Supabase, env validado, middleware de sesión | ✅ |
| 5 | Autenticación | Login (magic link + Google), callback, onboarding | ✅ |
| 6 | Sistema de diseño | Primitivas UI, layout, tema claro/oscuro | ✅ |
| 7 | Gastos | Esquema, repo, servicio, actions, formulario, tabla, filtros | ✅ |
| 8 | Pagos | Reglas + ocurrencias, calendario, cambios de estado | ✅ |
| 9 | Tarjetas y categorías | CRUD, ciclos de facturación, presupuestos | ✅ |
| 10 | Dashboard | KPIs, gráficos, próximos pagos, movimientos recientes | ✅ |
| 11 | Reportes | Motor diario/semanal/mensual + vista | ✅ |
| 12 | IA | Tools, bucle agéntico, chat con streaming | ✅ |
| 13 | WhatsApp | Webhook, cola idempotente, respuestas a recordatorios | ✅ |
| 14 | Gmail | OAuth, sync, parser híbrido de correos | ✅ |
| 15 | Automatización | Crons de recordatorios, reportes y sync | ✅ |
| 16 | Tests | Dominio y parsers | ✅ |

## Qué requiere credenciales externas

El proyecto arranca y es navegable sin ninguna de estas. Cada integración se activa al
aparecer su variable de entorno y se degrada de forma explícita si falta.

| Integración | Variables | Sin ellas |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Requerida para persistencia |
| Anthropic | `ANTHROPIC_API_KEY` | El asistente responde indicando que no está configurado |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | El envío se registra en log en vez de enviarse |
| Gmail | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | La sección de correo indica que falta conectar |
| Crons | `CRON_SECRET` | Las rutas de cron rechazan toda petición |

## Puesta en marcha

```bash
cp .env.example .env.local     # completar credenciales
npm install
npx supabase db push           # aplicar migraciones
npm run dev
```

Generar tipos tras cambiar el esquema:

```bash
npm run db:types
```

## Configuración de webhooks

**WhatsApp** — en Meta for Developers → WhatsApp → Configuration:
- Callback URL: `https://<dominio>/api/webhooks/whatsapp`
- Verify token: el valor de `WHATSAPP_VERIFY_TOKEN`
- Suscribirse al campo `messages`

**Crons** — definidos en `vercel.json`:

| Ruta | Frecuencia |
|---|---|
| `/api/cron/reminders` | `0 * * * *` (horaria) |
| `/api/cron/gmail-sync` | `*/30 * * * *` |
| `/api/cron/reports` | `0 12 * * *` |

En el plan Hobby de Vercel solo se permite una ejecución diaria; para desarrollo se puede
apuntar cualquier scheduler externo a las mismas rutas con el header
`Authorization: Bearer $CRON_SECRET`.

## Siguientes pasos naturales

Fuera del alcance de esta entrega, en orden de valor:

1. **OCR de comprobantes** — el esquema ya contempla `attachments`; falta el pipeline de
   extracción.
2. **Importación de estados de cuenta** (CSV/PDF) — recuperar el histórico de golpe.
3. **Multi-usuario / hogar** — gastos compartidos con reparto.
4. **Proyección de flujo de caja** — con recurrentes conocidos, proyectar 90 días.
5. **App móvil** — el dominio y la API ya están listos; sería otra superficie.
