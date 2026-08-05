/**
 * Errores de dominio tipados.
 *
 * Permite que la capa de presentación distinga "el usuario escribió algo mal"
 * de "algo se rompió", y muestre un mensaje útil en lugar de un fallo genérico.
 */

export type DomainErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTEGRATION_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UNKNOWN";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DomainErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }

  static validation(message: string, details?: Record<string, unknown>): DomainError {
    return new DomainError("VALIDATION", message, details);
  }

  static notFound(resource: string): DomainError {
    return new DomainError("NOT_FOUND", `No se encontró ${resource}.`);
  }

  static forbidden(message = "No tienes permiso para esta operación."): DomainError {
    return new DomainError("FORBIDDEN", message);
  }

  static conflict(message: string): DomainError {
    return new DomainError("CONFLICT", message);
  }

  /** Una integración externa no está configurada o no responde. */
  static integrationUnavailable(service: string): DomainError {
    return new DomainError(
      "INTEGRATION_UNAVAILABLE",
      `La integración con ${service} no está configurada.`,
      { service },
    );
  }
}

export interface ActionResult<T = void> {
  ok: boolean;
  data?: T;
  error?: { code: DomainErrorCode; message: string; details?: Record<string, unknown> };
}

export function success<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function failure(error: unknown): ActionResult<never> {
  if (error instanceof DomainError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    };
  }
  // Nunca se filtra el mensaje interno al usuario: puede contener detalles de
  // infraestructura. Se registra en servidor y se devuelve algo accionable.
  console.error("[unexpected]", error);
  return {
    ok: false,
    error: {
      code: "UNKNOWN",
      message: "Ocurrió un error inesperado. Inténtalo de nuevo.",
    },
  };
}
