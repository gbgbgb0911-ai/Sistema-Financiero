"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIOD_LABELS, type PeriodKey } from "@/core/dates";

interface Option {
  id: string;
  name: string;
}

const PERIODS: PeriodKey[] = ["today", "week", "month", "quarter", "year"];

export function ExpenseFilters({
  categories,
  cards,
}: {
  categories: Option[];
  cards: Option[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  // El atajo ⌘K de la barra superior navega aquí con ?focus=search.
  useEffect(() => {
    if (searchParams.get("focus") === "search") inputRef.current?.focus();
  }, [searchParams]);

  // Debounce: sin esto se lanzaría una consulta por cada tecla pulsada.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) params.set("q", search);
      else params.delete("q");
      params.delete("focus");
      router.replace(`/gastos?${params.toString()}`);
    }, 350);

    return () => clearTimeout(timer);
    // `searchParams` se omite a propósito: incluirlo reiniciaría el debounce
    // en cada navegación y el buscador se sentiría errático.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, router]);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    router.replace(`/gastos?${params.toString()}`);
  }

  const hasFilters = ["q", "category", "card", "period"].some((key) =>
    searchParams.has(key),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar comercio o nota…"
          className="pl-9"
          aria-label="Buscar gastos"
        />
      </div>

      <Select
        value={searchParams.get("period") ?? "month"}
        onValueChange={(value) => setParam("period", value)}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIODS.map((period) => (
            <SelectItem key={period} value={period}>
              {PERIOD_LABELS[period]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("category") ?? "all"}
        onValueChange={(value) => setParam("category", value)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Categoría" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las categorías</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("card") ?? "all"}
        onValueChange={(value) => setParam("card", value)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Método" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los métodos</SelectItem>
          {cards.map((card) => (
            <SelectItem key={card.id} value={card.id}>
              {card.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            router.replace("/gastos");
          }}
        >
          <X className="h-3.5 w-3.5" />
          Limpiar
        </Button>
      ) : null}
    </div>
  );
}
