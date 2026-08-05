/**
 * Normalización de texto.
 *
 * El nombre de comercio que llega de un banco viene sucio: "RAPPI*PERU LIMA PE",
 * "RAPPI  PERU   SAC", "rappi peru 0034". Sin normalizar, cada variante crea un
 * comercio distinto y el desglose por comercio deja de servir.
 */

/** Quita acentos y pasa a minúsculas. */
export function deaccent(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const BANK_NOISE = [
  /\b(lima|peru|pe|us|usa|online|web|internet|com|sac|sa|srl|eirl|ltd|inc)\b/g,
  /\b\d{3,}\b/g, // Códigos de referencia
  /[*#]+/g,
];

/**
 * Normaliza un nombre de comercio para poder agruparlo.
 * Debe coincidir con `public.normalize_merchant()` en la base de datos.
 */
export function normalizeMerchantName(raw: string | null | undefined): string {
  if (!raw) return "";
  let result = deaccent(raw);
  for (const pattern of BANK_NOISE) {
    result = result.replace(pattern, " ");
  }
  return result
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Presenta el nombre normalizado con capitalización legible. */
export function titleCase(input: string): string {
  return input
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Slug para claves estables (categorías). */
export function slugify(input: string): string {
  return deaccent(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Iniciales para avatares y placeholders. */
export function initials(name: string | null | undefined, max = 2): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, max)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Convierte HTML de correo a texto plano.
 * Los correos bancarios llegan casi siempre como HTML; el parser trabaja
 * mucho mejor sobre el texto extraído.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Distancia de Levenshtein normalizada (0 = idénticos, 1 = sin nada en común).
 * Se usa para sugerir un comercio ya existente al escribir uno nuevo.
 */
export function similarity(a: string, b: string): number {
  const s1 = deaccent(a);
  const s2 = deaccent(b);
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matrix: number[][] = Array.from({ length: s1.length + 1 }, () =>
    new Array<number>(s2.length + 1).fill(0),
  );

  for (let i = 0; i <= s1.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= s2.length; j++) matrix[0]![j] = j;

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  const distance = matrix[s1.length]![s2.length]!;
  return 1 - distance / Math.max(s1.length, s2.length);
}
