# 03 — Flujo de navegación y diseño

## 1. Mapa de rutas

```
/                              → redirige a /dashboard o /login según sesión

(auth)  ── público
  /login                       Magic link + OAuth Google
  /auth/callback               Intercambio de código → sesión
  /onboarding                  3 pasos: moneda+zona → tarjetas → WhatsApp

(dashboard)  ── protegido por middleware
  /dashboard                   Resumen financiero (home)
  /gastos                      Historial + buscador + filtros
  /gastos/nuevo                Alta manual
  /gastos/[id]                 Detalle / edición / comprobante
  /pagos                       Lista de pagos programados
  /pagos/nuevo                 Alta
  /pagos/[id]                  Detalle + ocurrencias
  /calendario                  Vista mensual de vencimientos
  /tarjetas                    Tarjetas + saldo del ciclo
  /tarjetas/[id]               Movimientos de la tarjeta
  /categorias                  Gestión de categorías y presupuestos
  /reportes                    Diario / semanal / mensual
  /asistente                   Chat con la IA (streaming)
  /ajustes                     Perfil, WhatsApp, Gmail, automatizaciones

api/
  webhooks/whatsapp            GET verificación · POST mensajes
  webhooks/n8n                 Entrada firmada para automatizaciones
  cron/reminders               Horario
  cron/reports                 Diario
  cron/gmail-sync              Cada 30 min
  ai/chat                      Streaming SSE para /asistente
  gmail/connect · /callback    OAuth
```

## 2. Jerarquía de navegación

```
Sidebar (desktop) / Bottom bar (móvil)
├── Resumen        /dashboard
├── Gastos         /gastos
├── Pagos          /pagos
├── Calendario     /calendario
├── Tarjetas       /tarjetas
├── Reportes       /reportes
├── Asistente      /asistente
└── Ajustes        /ajustes

Topbar: buscador global (⌘K) · selector de período · tema · avatar
FAB móvil: "+ Gasto" (la acción más frecuente, siempre a un toque)
```

En móvil la barra inferior muestra 5 destinos (Resumen, Gastos, +, Pagos, Más). El resto
va en un menú desplegable. La acción primaria — registrar un gasto — nunca queda a más de
un toque desde cualquier pantalla.

## 3. Recorridos principales

### 3.1 Registrar un gasto (web)

```
Cualquier pantalla → FAB "+" → Sheet lateral (desktop) / pantalla completa (móvil)
  Monto [autofocus, teclado numérico] → Comercio [autocompletado] →
  Categoría [sugerida por reglas] → Fecha/hora [ahora por defecto] →
  Tarjeta [última usada] → Notas → Comprobante
→ Guardar → toast con acción "Deshacer" → vuelve al contexto anterior
```

Los defaults hacen el trabajo: fecha = ahora, tarjeta = la última usada, categoría =
sugerida por el comercio. En el caso típico el usuario escribe el monto, elige comercio y
guarda.

### 3.2 Registrar un gasto (WhatsApp)

```
Usuario: "gasté 35 soles en gasolina"
  → agente detecta intención + entidades → create_expense
  ← "Listo. S/ 35.00 en Gasolina (Transporte), hoy 3:42 p.m.
     Llevas S/ 412 este mes en Transporte, 18% más que el mes pasado."
```

La respuesta confirma **y** aporta contexto. Es la diferencia entre un formulario por chat
y un asistente.

### 3.3 Recordatorio de pago

```
[cron] 1 día antes, 9:00 hora del usuario
  → "Mañana vence Netflix: S/ 44.90.
     Responde: Pagado · Recuérdame luego · Posponer · Cancelar"

Usuario: "pagado"
  → occurrence.status = paid, se crea el gasto asociado
  ← "Anotado. Netflix pagado — S/ 44.90. Próximo vencimiento: 15 de abril."

Usuario: "recuérdame luego"    → nuevo recordatorio en 3 h
Usuario: "posponer 3 días"     → due_date += 3d, se reprograman recordatorios
Usuario: "cancelar"            → occurrence.status = skipped
```

### 3.4 Gasto detectado por correo

```
[cron] sync de Gmail → parser
  ├── confianza alta  → se registra directamente; aparece en el dashboard con icono ✉
  └── confianza baja  → pending_review + WhatsApp:
        "Detecté S/ 89.90 en 'PLAZA VEA 0341' con tu Visa *4821.
         ¿Lo registro? Responde Sí / No / Cambiar categoría"
```

## 4. Estados de interfaz

Cada vista contempla los cuatro estados. No hay pantallas en blanco:

| Estado | Tratamiento |
|---|---|
| **Vacío** | Ilustración + una frase + acción primaria ("Registra tu primer gasto") |
| **Cargando** | Skeletons con la forma real del contenido, no spinners |
| **Error** | Mensaje concreto + botón de reintento; nunca un stack trace |
| **Con datos** | Contenido |

## 5. Sistema de diseño

### 5.1 Referencias

Linear (densidad y teclado), Stripe (tablas y datos numéricos), Vercel (contraste y
tipografía), Notion (jerarquía tranquila), Apple (movimiento).

### 5.2 Tokens

**Color** — definido con variables CSS en HSL para que el tema claro/oscuro sea un cambio
de variables, no de clases:

```
--background · --foreground · --card · --popover
--primary · --secondary · --muted · --accent
--destructive · --success · --warning
--border · --input · --ring
```

Semántica financiera: verde para ingresos y presupuesto sano, ámbar entre el 80% y el 100%
del presupuesto, rojo por encima o para vencidos. **Nunca solo color**: siempre acompañado
de icono o texto, para no depender de la percepción cromática.

**Tipografía** — Geist Sans para interfaz, Geist Mono para cifras. Los números tabulares
(`font-variant-numeric: tabular-nums`) son obligatorios en tablas: sin eso, las columnas de
importes bailan.

Escala: `12 / 14 / 16 / 20 / 24 / 32 / 40`.

**Espaciado** — múltiplos de 4. Radio: `8px` en tarjetas, `6px` en controles.

**Elevación** — sombras muy sutiles; la jerarquía se construye con borde y fondo, no con
sombras marcadas.

### 5.3 Movimiento

- Duración: 150 ms (micro), 250 ms (paneles), 400 ms (entrada de página).
- Curva: `cubic-bezier(0.32, 0.72, 0, 1)` — arranque rápido, frenada suave.
- Los gráficos animan al entrar una sola vez, no en cada re-render.
- `prefers-reduced-motion` desactiva toda transición no esencial.

### 5.4 Accesibilidad

- Contraste AA como mínimo (AAA en texto de cuerpo).
- Todo lo interactivo alcanzable por teclado, con `focus-visible` claro.
- Los gráficos tienen tabla equivalente accesible por lector de pantalla.
- Objetivo táctil mínimo 44×44 px.
- Los importes se leen como "35 soles con 50", no "S/35.50", vía `aria-label`.

### 5.5 Responsive

| Breakpoint | Layout |
|---|---|
| `< 640` | Una columna, bottom nav, tarjetas apiladas, tablas → lista de tarjetas |
| `640–1024` | Dos columnas, sidebar colapsada a iconos |
| `> 1024` | Tres columnas, sidebar completa, tablas densas |

Las tablas no hacen scroll horizontal en móvil: se transforman en tarjetas. El scroll
horizontal en datos financieros esconde información.

## 6. Componentes clave del dashboard

```
┌─────────────────────────────────────────────────────────┐
│  Resumen                    [Mes ▾]  [🔍 ⌘K]  [🌙]  [👤] │
├─────────────────────────────────────────────────────────┤
│ ┌─────────┐┌─────────┐┌─────────┐┌─────────┐            │
│ │ Hoy     ││ Mes     ││ Por     ││ Presup. │  KPIs      │
│ │ S/ 87   ││ S/ 2,340││ pagar   ││ 78%     │            │
│ │ ▲ 12%   ││ ▼ 5%    ││ S/ 450  ││ ▓▓▓▓░   │            │
│ └─────────┘└─────────┘└─────────┘└─────────┘            │
├──────────────────────────────┬──────────────────────────┤
│  Flujo de caja (30 días)     │  Próximos pagos          │
│  ╱╲    ╱╲                    │  ○ Netflix    15/04  44.90│
│ ╱  ╲__╱  ╲___                │  ○ Internet   18/04 119.00│
│                              │  ● Luz        12/04  86.40│ ← vencido
├──────────────────────────────┼──────────────────────────┤
│  Gastos por categoría        │  Gastos por tarjeta      │
│  (donut + leyenda con %)     │  (barras horizontales)   │
├──────────────────────────────┴──────────────────────────┤
│  Movimientos recientes            [Ver todos →]         │
│  tabla densa con iconos de origen (✉ manual 💬)         │
└─────────────────────────────────────────────────────────┘
```

Cada KPI muestra la comparación con el período anterior. Un número sin referencia no
informa; "S/ 2,340" no dice nada, "S/ 2,340, 5% menos que el mes pasado" sí.

---

Siguiente: [`04-estructura-carpetas.md`](./04-estructura-carpetas.md)
