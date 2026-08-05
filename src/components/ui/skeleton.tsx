import { cn } from "@/lib/utils";

/**
 * Placeholder de carga. Se usa con la forma real del contenido que va a
 * aparecer, no un spinner genérico: el usuario percibe menos espera si ya
 * ve la estructura de lo que viene.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
