# 00 — Análisis del proyecto, mejoras y riesgos

> Documento de arranque. Se escribió **antes** de programar, como parte del encargo.
> Lectura recomendada junto a `01-arquitectura.md` y `02-base-de-datos.md`.

---

## 1. Lectura crítica del encargo

El pedido original describe un asistente financiero personal con cinco superficies:
dashboard web, WhatsApp, Gmail, reportes automáticos e IA analítica. Es un producto
coherente, pero tiene tres tensiones que conviene resolver **en el diseño**, no en el
código:

### 1.1 WhatsApp como "asistente principal" choca con la latencia de la IA

Una consulta tipo *"¿en qué gasto demasiado?"* requiere agregar datos, compararlos con
períodos anteriores y redactar una respuesta. Eso son varios segundos. WhatsApp Cloud API
exige responder al webhook con **200 en menos de ~20 s** o reintenta la entrega, lo que
produce respuestas duplicadas.

**Decisión:** el webhook responde `200` de inmediato y encola el trabajo. La respuesta al
usuario se envía después vía Send Message API. Se implementa con una tabla
`inbound_messages` + procesamiento asíncrono, no con un `await` dentro del handler.

### 1.2 "Lectura automática de correos" es la parte más frágil del sistema

Los correos bancarios no tienen formato estable: cambian sin aviso, varían por banco, y en
Perú conviven soles y dólares en el mismo correo. Un parser de regex puro se rompe; un
parser 100% LLM es caro y no determinista.

**Decisión: parser híbrido en dos niveles.**

1. **Nivel 1 — determinista.** Reglas por emisor (`email_rules`) con regex nombradas.
   Barato, instantáneo, auditable. Cubre el ~85% del volumen real (un usuario recibe
   correos de 3-5 emisores distintos).
2. **Nivel 2 — LLM (fallback).** Si no matchea ninguna regla, o si la confianza es baja,
   se extrae con Claude usando *structured outputs* (esquema JSON estricto).
3. **Nivel 3 — humano.** Si la confianza sigue baja, el gasto se guarda como
   `pending_review` y se pregunta por WhatsApp.

Cada extracción guarda `confidence` y `source`, así que el sistema es auditable y se puede
medir la calidad del parser en producción.

### 1.3 El encargo pide "no un MVP simple" pero también entrega inmediata

Se resuelve construyendo **la base completa** (esquema, capas, contratos, tipos,
seguridad) y dejando los *adaptadores externos* (WhatsApp, Gmail, Anthropic) detrás de
interfaces con implementación real + modo `dry-run` cuando no hay credenciales. Así el
proyecto corre de punta a punta desde el primer `npm run dev`, sin necesitar cinco cuentas
de API para ver el dashboard.

---

## 2. Problemas detectados y cómo se resuelven

| # | Problema | Impacto | Solución adoptada |
|---|---|---|---|
| 1 | Webhooks de WhatsApp reintentan si tardas | Mensajes duplicados al usuario | Ack inmediato + cola `inbound_messages` con `provider_message_id` único (idempotencia) |
| 2 | Gmail sin deduplicación | Gastos duplicados en cada sync | `gmail_message_id` con índice único por usuario |
| 3 | Correos de "pre-autorización" + "consumo" del mismo pago | Gasto contado dos veces | Detección de duplicados por `(merchant, amount, card, ±90 min)` con estado `possible_duplicate` |
| 4 | Multi-moneda (PEN/USD) | Totales sin sentido al sumar | Todo importe guarda `amount` + `currency` + `amount_base` (convertido a moneda base del usuario) y `fx_rate` |
| 5 | Floats para dinero | Errores de redondeo acumulados | `NUMERIC(14,2)` en Postgres; en TS se manejan en **céntimos** (`bigint`/`number` entero) en la capa de cálculo |
| 6 | Pagos recurrentes | ¿Se guarda una fila por ocurrencia o una regla? | Regla (`payments` con `frequency` + `rrule`) + materialización en `payment_occurrences`. Permite marcar pagado un mes sin afectar los demás |
| 7 | Recordatorios que se disparan dos veces | Spam al usuario | Tabla `reminders` con `UNIQUE(occurrence_id, kind)` — el cron es idempotente |
| 8 | Zonas horarias | "Gastos de hoy" mal calculado | `timezone` por usuario; todos los agregados se calculan con `AT TIME ZONE` |
| 9 | Prompt injection vía correo/WhatsApp | La IA podría ejecutar acciones no deseadas | Los datos externos se pasan como *datos*, nunca como instrucciones; las tools de escritura exigen confirmación explícita |
| 10 | Fuga de datos entre usuarios | Crítico | RLS en **todas** las tablas, sin excepción. El service role solo se usa en rutas de servidor con `user_id` explícito |
| 11 | Sin trazabilidad de cambios | Imposible auditar | `audit_log` con trigger genérico sobre las tablas de negocio |
| 12 | Costos de LLM sin control | Factura sorpresa | Caché de agregados, *prompt caching*, y `ai_usage` para medir tokens por usuario |

---

## 3. Mejoras propuestas (más allá del encargo)

Estas no estaban pedidas explícitamente, pero elevan el producto sin inflar el alcance:

### 3.1 Funcionales

1. **Presupuestos por categoría** (`budgets`) — sin esto, "¿en qué gasto demasiado?" no
   tiene referencia contra la cual comparar. Es la pieza que hace útil a la IA.
2. **Detección de suscripciones** — agrupar gastos recurrentes del mismo comercio con
   importe estable. Habilita directamente *"¿qué suscripciones casi no uso?"*.
3. **Reglas de auto-categorización** (`categorization_rules`) — aprende del usuario:
   si tres veces categoriza "Rappi" como Delivery, se propone la regla.
4. **Ciclo de facturación de tarjetas** — `statement_day` + `due_day` permiten responder
   *"¿cuánto debo en mi tarjeta?"* con el saldo del ciclo actual, no un total histórico
   sin sentido.
5. **Anomalías** — alerta cuando un gasto supera N desviaciones de la media de esa
   categoría. Barato de calcular, alto valor percibido.
6. **Comando de deshacer** — `audit_log` permite un "revertir último registro" desde
   WhatsApp, donde equivocarse es fácil.
7. **Exportación CSV/Excel** — todo sistema financiero termina necesitándolo.

### 3.2 Técnicas

1. **Server Components + Server Actions** — datos sensibles nunca viajan al cliente sin
   filtrar; menos JS enviado al navegador.
2. **Capa de dominio pura** — los cálculos financieros (agregados, ciclos, proyecciones)
   viven en funciones puras sin dependencias de Supabase ni React. Son testeables sin red.
3. **Idempotencia en toda entrada externa** — webhooks, cron, sync de Gmail.
4. **Estructura por módulo (feature-first)**, no por tipo de archivo. Escala mejor.
5. **Zod como única fuente de verdad de validación** — mismo esquema en formulario, Server
   Action, API route y tool de IA.

---

## 4. Decisiones de arquitectura y su justificación

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| **Next.js App Router** (RSC) | SPA + API separada | Menos superficie, menos JS al cliente, streaming nativo, un solo despliegue |
| **Supabase (Postgres + Auth + Storage)** | Firebase | SQL relacional real (los datos financieros lo son), RLS a nivel de fila, sin lock-in |
| **SQL puro en `supabase/migrations`** | Prisma | RLS, triggers y funciones son ciudadanos de primera clase; Prisma los trata como "escape hatch". Los tipos se generan con `supabase gen types` |
| **Rutas de API de Next para webhooks** | n8n como orquestador principal | La lógica de negocio en código versionado y testeable. n8n queda para automatizaciones del usuario final |
| **Anthropic con *tool use*** | Prompt + parseo de texto | Las acciones ("registra un gasto") necesitan estructura garantizada, no texto |
| **Recharts** | Chart.js | Componentes React nativos, encaja con RSC/SSR |
| **Tailwind + primitivas propias** | Librería de componentes completa | Control del diseño (el encargo pide estética Linear/Stripe), bundle menor |

### 4.1 Sobre n8n

El encargo lo menciona. La postura adoptada: **n8n no orquesta el núcleo**. Los flujos
críticos (webhook de WhatsApp, cron de recordatorios, sync de Gmail) son código en el
repo, testeable y versionado. n8n se expone mediante webhooks entrantes firmados
(`/api/integrations/n8n`) para que el usuario arme automatizaciones propias sin tocar el
core. Meter el núcleo en n8n haría el sistema imposible de testear y de revisar en un PR.

---

## 5. Riesgos abiertos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Meta cierra la ventana de 24 h de WhatsApp | Alta | Plantillas (HSM) pre-aprobadas para recordatorios; texto libre solo dentro de la ventana |
| Google restringe el scope `gmail.readonly` | Media | Scope mínimo, pantalla de verificación, y fallback a reenvío manual a una dirección del sistema |
| Cambia el formato de correo de un banco | Alta | Fallback a LLM + métrica de tasa de parseo por emisor para detectarlo pronto |
| Costo de LLM crece con el uso | Media | Caché de agregados, `prompt caching`, límites por usuario en `ai_usage` |
| Cron de Vercel Hobby: 1 ejecución/día | Alta | El cron corre cada hora en plan Pro; en Hobby se documenta el uso de un scheduler externo apuntando a `/api/cron/*` |

---

## 6. Alcance de esta entrega

**Incluido y funcional:**

- Esquema completo de base de datos con RLS, triggers, índices y datos semilla.
- Capa de dominio pura + repositorios + servicios de los 6 módulos de negocio.
- Dashboard completo con gráficos, filtros, buscador, calendario e indicadores.
- CRUD de gastos, pagos, tarjetas, categorías y comercios.
- Webhook de WhatsApp con verificación de firma, cola idempotente y agente de IA con tools.
- Parser de correos híbrido (reglas + LLM) y sync de Gmail.
- Motor de reportes (diario/semanal/mensual) y cron de recordatorios.
- Modo claro/oscuro, responsive, accesible.
- Tests unitarios del dominio y de los parsers.

**Explícitamente fuera de esta entrega (documentado, no implementado):**

- Registro en Meta Business y aprobación de plantillas de WhatsApp (proceso externo).
- Verificación de la app de Google para `gmail.readonly` en producción (proceso externo).
- OCR de comprobantes adjuntos (el esquema lo contempla en `attachments`; el pipeline no).

Ambos requieren cuentas y aprobaciones de terceros que no se pueden completar desde el
repositorio. El código está listo para recibir esas credenciales vía variables de entorno.

---

Siguiente: [`01-arquitectura.md`](./01-arquitectura.md)
