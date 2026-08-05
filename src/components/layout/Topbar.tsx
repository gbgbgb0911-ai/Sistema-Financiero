"use client";

import { useRouter } from "next/navigation";
import { LogOut, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/server/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { initials } from "@/core/text";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

interface TopbarProps {
  title: string;
  userName: string | null;
  userEmail: string | null;
}

export function Topbar({ title, userName, userEmail }: TopbarProps) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K / Ctrl+K abre la búsqueda: es el atajo que la gente ya espera.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setSearchOpen(true);
        router.push("/gastos?focus=search");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-6">
      <h1 className="flex-1 truncate text-sm font-semibold sm:text-base">{title}</h1>

      <Button
        variant="outline"
        size="sm"
        className="hidden gap-2 text-muted-foreground sm:flex"
        onClick={() => router.push("/gastos?focus=search")}
        aria-expanded={searchOpen}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="text-xs">Buscar</span>
        <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">
          ⌘K
        </kbd>
      </Button>

      <Button asChild size="sm" className="hidden gap-1.5 lg:inline-flex">
        <Link href="/gastos/nuevo">
          <Plus className="h-4 w-4" />
          Gasto
        </Link>
      </Button>

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full bg-muted text-xs font-semibold"
            aria-label="Menú de cuenta"
          >
            {initials(userName ?? userEmail)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium">{userName ?? "Sin nombre"}</p>
            <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          </div>
          <DropdownMenuItem asChild>
            <Link href="/ajustes">Ajustes</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
