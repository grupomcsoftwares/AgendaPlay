import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  CalendarCheck,
  Scissors,
  CreditCard,
  Settings as SettingsIcon,
  Activity,
  LayoutGrid,
  List,
  Users,
} from "lucide-react";
import { useGetSettings } from "@workspace/api-client-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
};

export function Sidebar({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: settings } = useGetSettings({ query: { queryKey: ["settings"] } });

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
    {
      href: "/appointments",
      label: "Agendamentos",
      icon: CalendarCheck,
      children: [
        { href: "/appointments", label: "Lista de Agendamentos", icon: List },
        { href: "/queue", label: "Painel de Fila", icon: Activity },
        { href: "/booking", label: "Página de Agendamento", icon: LayoutGrid },
      ],
    },
    { href: "/services", label: "Serviços", icon: Scissors },
    { href: "/barbers", label: "Barbeiros", icon: Users },
    { href: "/financial", label: "Financeiro", icon: CreditCard },
    { href: "/settings", label: "Configurações", icon: SettingsIcon },
  ];

  const ownerName = settings?.ownerName || "Barbeiro";
  const barbershopName = settings?.barbershopName || "Barbearia";
  const initials = ownerName
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: "hsl(var(--sidebar))", borderRight: "1px solid hsl(var(--sidebar-border))" }}>
        <div className="h-14 flex items-center px-5 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <div className="flex items-center gap-2">
            <Scissors className="h-5 w-5" style={{ color: "hsl(var(--sidebar-primary))" }} />
            <span className="font-semibold text-base tracking-tight" style={{ color: "hsl(var(--sidebar-foreground))" }}>
              BarberApp
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {navItems.map((item) => {
            const groupActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href)) ||
              (item.children?.some(
                (c) => location === c.href || (c.href !== "/" && location.startsWith(c.href)),
              ) ?? false);
            const isActive = !item.children && groupActive;
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors w-full"
                  style={
                    isActive
                      ? {
                          backgroundColor: "hsl(var(--sidebar-primary))",
                          color: "hsl(var(--sidebar-primary-foreground))",
                          fontWeight: 500,
                        }
                      : {
                          color: groupActive
                            ? "hsl(var(--sidebar-foreground))"
                            : "hsl(var(--sidebar-foreground) / 0.65)",
                          fontWeight: groupActive ? 500 : 400,
                        }
                  }
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--sidebar-accent))";
                      (e.currentTarget as HTMLElement).style.color = "hsl(var(--sidebar-foreground))";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "";
                      (e.currentTarget as HTMLElement).style.color = groupActive
                        ? "hsl(var(--sidebar-foreground))"
                        : "hsl(var(--sidebar-foreground) / 0.65)";
                    }
                  }}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>

                {item.children && (
                  <div
                    className="mt-0.5 mb-1 ml-3 pl-3 space-y-0.5"
                    style={{ borderLeft: "1px solid hsl(var(--sidebar-border))" }}
                  >
                    {item.children.map((sub) => {
                      const subActive = location === sub.href;
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors w-full"
                          style={
                            subActive
                              ? {
                                  backgroundColor: "hsl(var(--sidebar-primary))",
                                  color: "hsl(var(--sidebar-primary-foreground))",
                                  fontWeight: 500,
                                }
                              : { color: "hsl(var(--sidebar-foreground) / 0.6)" }
                          }
                          onMouseEnter={(e) => {
                            if (!subActive) {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--sidebar-accent))";
                              (e.currentTarget as HTMLElement).style.color = "hsl(var(--sidebar-foreground))";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!subActive) {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "";
                              (e.currentTarget as HTMLElement).style.color = "hsl(var(--sidebar-foreground) / 0.6)";
                            }
                          }}
                        >
                          <sub.icon className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>{sub.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <div className="flex items-center gap-3">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
              style={{
                backgroundColor: "hsl(var(--sidebar-primary) / 0.2)",
                color: "hsl(var(--sidebar-primary))",
              }}
            >
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate" style={{ color: "hsl(var(--sidebar-foreground))" }}>
                {ownerName}
              </span>
              <span className="text-xs truncate" style={{ color: "hsl(var(--sidebar-foreground) / 0.45)" }}>
                {barbershopName}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
