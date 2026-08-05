"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { profileUpdateSchema, type ProfileUpdate } from "@/modules/profile/schema";
import { updateProfileAction } from "@/modules/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES, TIMEZONES } from "@/lib/constants";
import type { ProfileRow } from "@/types/database";

export function ProfileSettings({ profile }: { profile: ProfileRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<ProfileUpdate>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      fullName: profile.full_name ?? "",
      phoneE164: profile.phone_e164 ?? "",
      timezone: profile.timezone,
      baseCurrency: profile.base_currency,
      whatsappOptIn: profile.whatsapp_opt_in,
      notificationPrefs: profile.notification_prefs,
    },
  });

  function onSubmit(values: ProfileUpdate) {
    startTransition(async () => {
      const result = await updateProfileAction({
        ...values,
        // Un campo vacío significa "sin teléfono", no cadena vacía: la columna
        // es única y varias cadenas vacías chocarían entre sí.
        phoneE164: values.phoneE164 || null,
      });

      if (!result.ok) {
        toast.error(result.error?.message ?? "No se pudieron guardar los cambios");
        return;
      }
      toast.success("Ajustes guardados");
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Nombre</Label>
        <Input id="fullName" {...form.register("fullName")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="baseCurrency">Moneda base</Label>
          <Select
            value={form.watch("baseCurrency")}
            onValueChange={(value) =>
              form.setValue("baseCurrency", value as "PEN" | "USD" | "EUR")
            }
          >
            <SelectTrigger id="baseCurrency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((currency) => (
                <SelectItem key={currency.code} value={currency.code}>
                  {currency.symbol} · {currency.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="timezone">Zona horaria</Label>
          <Select
            value={form.watch("timezone")}
            onValueChange={(value) => form.setValue("timezone", value)}
          >
            <SelectTrigger id="timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((timezone) => (
                <SelectItem key={timezone} value={timezone}>
                  {timezone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Determina qué significa &ldquo;hoy&rdquo; en tus totales y a qué hora llegan los
            avisos.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phoneE164">Teléfono de WhatsApp</Label>
        <Input
          id="phoneE164"
          inputMode="tel"
          placeholder="51987654321"
          {...form.register("phoneE164")}
        />
        <p className="text-xs text-muted-foreground">
          Formato internacional sin el signo +. Es lo que asocia tus mensajes de WhatsApp con
          esta cuenta.
        </p>
        {form.formState.errors.phoneE164 ? (
          <p className="text-xs text-destructive">{form.formState.errors.phoneE164.message}</p>
        ) : null}
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border p-3">
        <Switch
          id="whatsappOptIn"
          checked={form.watch("whatsappOptIn") ?? false}
          onCheckedChange={(checked) => form.setValue("whatsappOptIn", checked)}
        />
        <div className="space-y-0.5">
          <Label htmlFor="whatsappOptIn">Recibir avisos por WhatsApp</Label>
          <p className="text-xs text-muted-foreground">
            Recordatorios de pago y reportes periódicos. Puedes desactivarlo cuando quieras.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Guardar cambios
      </Button>
    </form>
  );
}
