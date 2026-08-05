-- =============================================================================
-- 0004_seed.sql — Reglas globales de extracción de correos bancarios
--
-- Estas reglas (user_id IS NULL) están disponibles para todos los usuarios y
-- constituyen el "nivel 1" del parser híbrido: barato, determinista, auditable.
-- Cuando ninguna coincide, el parser cae al nivel 2 (extracción con Claude).
--
-- Los patrones están escritos para bancos peruanos, que es el contexto del
-- usuario (perfil por defecto: America/Lima, PEN, es-PE). Añadir un emisor
-- nuevo es un INSERT, no un despliegue de código.
-- =============================================================================

insert into public.email_rules
  (user_id, issuer_name, from_pattern, subject_pattern, currency_hint, priority, extractors)
values
  -- BCP ---------------------------------------------------------------------
  (
    null,
    'BCP',
    '(notificaciones|avisos)@.*bcp\.com\.pe',
    '(consumo|compra|operaci[oó]n)',
    'PEN',
    10,
    jsonb_build_object(
      'amount',     '(?:S/|SOLES?)\s*([0-9][0-9,]*\.?[0-9]{0,2})',
      'amount_usd', '(?:US\$|\$|D[OÓ]LARES?)\s*([0-9][0-9,]*\.?[0-9]{0,2})',
      'merchant',   'en\s+(.+?)\s+(?:el|por|con|\.|,|$)',
      'card_last4', '(?:terminada en|final|\*+)\s*([0-9]{4})',
      'datetime',   '([0-9]{2}/[0-9]{2}/[0-9]{4})(?:\s+(?:a las\s+)?([0-9]{2}:[0-9]{2}))?'
    )
  ),
  -- Interbank ---------------------------------------------------------------
  (
    null,
    'Interbank',
    '(notificaciones|alertas)@.*interbank\.pe',
    '(consumo|compra|cargo)',
    'PEN',
    10,
    jsonb_build_object(
      'amount',     '(?:S/|SOLES?)\s*([0-9][0-9,]*\.?[0-9]{0,2})',
      'amount_usd', '(?:US\$|\$)\s*([0-9][0-9,]*\.?[0-9]{0,2})',
      'merchant',   '(?:establecimiento|comercio)[:\s]+(.+?)(?:\n|<|$)',
      'card_last4', '(?:tarjeta|terminada en)\D*([0-9]{4})',
      'datetime',   '([0-9]{2}/[0-9]{2}/[0-9]{4})(?:\s+([0-9]{2}:[0-9]{2}))?'
    )
  ),
  -- BBVA --------------------------------------------------------------------
  (
    null,
    'BBVA',
    '(notificaciones|bbva)@.*bbva\.(pe|com)',
    '(compra|consumo|operaci[oó]n)',
    'PEN',
    10,
    jsonb_build_object(
      'amount',     '(?:S/|PEN)\s*([0-9][0-9,]*\.?[0-9]{0,2})',
      'amount_usd', '(?:US\$|USD)\s*([0-9][0-9,]*\.?[0-9]{0,2})',
      'merchant',   '(?:en|comercio)[:\s]+(.+?)(?:\s+por|\n|<|$)',
      'card_last4', '\*{2,}\s*([0-9]{4})',
      'datetime',   '([0-9]{2}[-/][0-9]{2}[-/][0-9]{4})(?:\s+([0-9]{2}:[0-9]{2}))?'
    )
  ),
  -- Scotiabank --------------------------------------------------------------
  (
    null,
    'Scotiabank',
    '(alertas|notificaciones)@.*scotiabank\.com\.pe',
    '(consumo|compra)',
    'PEN',
    10,
    jsonb_build_object(
      'amount',     '(?:S/|SOLES?)\s*([0-9][0-9,]*\.?[0-9]{0,2})',
      'amount_usd', '(?:US\$|\$)\s*([0-9][0-9,]*\.?[0-9]{0,2})',
      'merchant',   '(?:en|establecimiento)\s+(.+?)(?:\s+por|\n|<|$)',
      'card_last4', '(?:terminada en|final)\D*([0-9]{4})',
      'datetime',   '([0-9]{2}/[0-9]{2}/[0-9]{4})(?:\s+([0-9]{2}:[0-9]{2}))?'
    )
  ),
  -- Yape / Plin (billeteras) ------------------------------------------------
  (
    null,
    'Yape',
    'yape@.*(bcp|yape)\.com\.pe',
    '(yapeaste|pago)',
    'PEN',
    20,
    jsonb_build_object(
      'amount',   'S/\s*([0-9][0-9,]*\.?[0-9]{0,2})',
      'merchant', '(?:a|para)\s+(.+?)(?:\s+el|\n|<|$)',
      'datetime', '([0-9]{2}/[0-9]{2}/[0-9]{4})(?:\s+([0-9]{2}:[0-9]{2}))?'
    )
  ),
  -- Genérica internacional (Visa/Mastercard en inglés) ----------------------
  (
    null,
    'Genérica (internacional)',
    '.*(visa|mastercard|amex|paypal|stripe)\..*',
    '(transaction|purchase|payment|receipt)',
    'USD',
    500,
    jsonb_build_object(
      'amount_usd', '(?:US\$|\$|USD)\s*([0-9][0-9,]*\.?[0-9]{0,2})',
      'merchant',   '(?:at|to|merchant)[:\s]+(.+?)(?:\s+on|\n|<|$)',
      'card_last4', '(?:ending in|\*{2,})\s*([0-9]{4})',
      'datetime',   '([A-Z][a-z]{2}\s+[0-9]{1,2},?\s+[0-9]{4})'
    )
  )
on conflict do nothing;
