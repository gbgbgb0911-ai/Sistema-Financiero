# Sistema Financiero Personal con IA

Asistente financiero personal: controla gastos, pagos y tarjetas desde un panel web
y desde WhatsApp, con detección automática de cargos en el correo.

```
Next.js 15 · React 19 · TypeScript · Tailwind · Supabase · Claude · WhatsApp Cloud API
```

---

## Qué hace

| Área | Detalle |
|---|---|
| **Gastos** | Alta manual, historial con buscador de texto completo, filtros, comprobantes |
| **Pagos** | Reglas recurrentes + vencimientos individuales, calendario, recordatorios |
| **Tarjetas** | Ciclos de facturación reales, saldo del ciclo vigente, utilización de la línea |
| **Presupuestos** | Por categoría o globales, con ritmo diario disponible |
| **WhatsApp** | Consultas en lenguaje natural, registro de gastos, respuestas a recordatorios |
| **Correo** | Detección automática de cargos con parser híbrido (reglas + IA) |
| **Reportes** | Diario, semanal y mensual, con comparación y envío por WhatsApp |
| **IA** | Análisis de gastos, detección de suscripciones y anomalías |

## Puesta en marcha

```bash
cp .env.example .env.local     # completar las variables de Supabase
npm install
npx supabase db push           # aplicar las migraciones
npm run dev
```

Solo Supabase es obligatorio. El resto de integraciones (Anthropic, WhatsApp, Gmail) se
activan al añadir su variable de entorno y se degradan de forma explícita cuando faltan:
la aplicación arranca y es navegable sin ninguna de ellas.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | TypeScript en modo estricto |
| `npm run lint` | ESLint |
| `npm test` | Tests del dominio y los parsers |
| `npm run db:push` | Aplica las migraciones |
| `npm run db:types` | Regenera `src/types/database.ts` desde el esquema |

## Documentación de diseño

El diseño se documentó antes de programar. Está en [`docs/`](./docs):

| Documento | Contenido |
|---|---|
| [00 — Análisis y mejoras](./docs/00-analisis-y-mejoras.md) | Lectura crítica del encargo, riesgos, decisiones y su porqué |
| [01 — Arquitectura](./docs/01-arquitectura.md) | Capas, flujos críticos, seguridad, rendimiento |
| [02 — Base de datos](./docs/02-base-de-datos.md) | Tablas, relaciones, RLS, índices, triggers |
| [03 — Navegación y diseño](./docs/03-flujo-navegacion.md) | Rutas, recorridos, sistema de diseño, accesibilidad |
| [04 — Estructura de carpetas](./docs/04-estructura-carpetas.md) | Organización y reglas de dependencia |
| [05 — Plan y estado](./docs/05-roadmap.md) | Fases de construcción y qué requiere credenciales externas |

## Arquitectura en una pantalla

```
app/        Rutas, Server Components, Server Actions, webhooks y crons
components/ ui/ (primitivas) · charts/ · features/ (conocen el dominio)
modules/    Un directorio por dominio: schema · repository · service · actions
core/       Dominio puro: dinero, fechas, recurrencia, ciclos, analítica
server/     Infraestructura: Supabase, Anthropic, WhatsApp, Gmail
```

Las dependencias apuntan hacia adentro. `core/` no importa nada de las demás capas, y por
eso toda la lógica financiera se puede testear sin base de datos ni red. Solo
`modules/*/repository.ts` habla con Supabase.

## Decisiones que conviene conocer

**El dinero se calcula en céntimos enteros.** Sumar floats acumula error de redondeo y en
un sistema financiero ese error acaba siendo visible. En Postgres es `NUMERIC(14,2)`.

**Cada importe guarda su moneda y su equivalente en la moneda base.** Un usuario tiene
gastos en soles y suscripciones en dólares; sumarlos sin convertir da un número sin
significado.

**Todo se calcula en la zona horaria del usuario.** "¿Cuánto gasté hoy?" a las 23:00 en
Lima significa algo distinto que a las 04:00 UTC del día siguiente.

**Los pagos separan la regla de la instancia.** `payments` es la regla recurrente;
`payment_occurrences` es cada vencimiento concreto. Sin esa separación no se puede marcar
pagado marzo sin afectar a abril.

**El webhook de WhatsApp responde antes de procesar.** Meta reintenta si tardas más de
~20 s, y eso duplicaría las respuestas. El mensaje se encola con un `provider_message_id`
único y se procesa en `after()`.

**El parser de correos tiene tres niveles.** Reglas regex por emisor (barato y auditable),
extracción con Claude si ninguna encaja, y confirmación por WhatsApp si la confianza es
baja. Nunca se descarta en silencio un correo que parece una transacción.

**RLS en todas las tablas, sin excepción.** El aislamiento entre usuarios no depende de
que la aplicación filtre bien.

**El núcleo no vive en n8n.** Los flujos críticos son código versionado y testeable. n8n
entra por `/api/webhooks/n8n`, firmado, para las automatizaciones del usuario final.

## Configuración de las integraciones

### WhatsApp

En Meta for Developers → WhatsApp → Configuration:

- **Callback URL**: `https://<dominio>/api/webhooks/whatsapp`
- **Verify token**: el valor de `WHATSAPP_VERIFY_TOKEN`
- Suscribirse al campo `messages`

En Ajustes de la aplicación hay que registrar el teléfono en formato E.164 sin el `+`
(ej. `51987654321`): es lo que asocia los mensajes entrantes con la cuenta.

### Gmail

En Google Cloud Console → Credenciales → OAuth 2.0, con
`{NEXT_PUBLIC_APP_URL}/api/gmail/callback` como URI de redirección autorizado. El scope es
`gmail.readonly`; para producción Google exige verificar la aplicación.

### Tareas programadas

Definidas en `vercel.json`:

| Ruta | Frecuencia | Qué hace |
|---|---|---|
| `/api/cron/reminders` | Cada hora | Programa y envía recordatorios |
| `/api/cron/gmail-sync` | Cada 30 min | Sincroniza correos bancarios |
| `/api/cron/reports` | Diaria | Genera y envía reportes |

Todas exigen `Authorization: Bearer $CRON_SECRET`. El plan Hobby de Vercel solo permite
una ejecución diaria; en desarrollo se puede apuntar cualquier scheduler externo a las
mismas rutas.

## Tests

```bash
npm test
```

86 tests sobre el dominio puro y los parsers: aritmética monetaria, zonas horarias y
horario de verano, expansión de recurrencias, ciclos de facturación, detección de
anomalías y suscripciones, y extracción de datos de correos bancarios reales. Corren en
menos de un segundo porque no tocan la red ni la base de datos.

## Estado

Lo que requiere cuentas y aprobaciones de terceros queda fuera de esta entrega y está
documentado en [`docs/05-roadmap.md`](./docs/05-roadmap.md): el registro en Meta Business
con sus plantillas de mensaje, la verificación de la aplicación ante Google, y el pipeline
de OCR de comprobantes (el esquema lo contempla en `attachments`; el procesamiento no está
implementado).
