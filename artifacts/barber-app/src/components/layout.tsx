import React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  CalendarCheck, 
  Users, 
  Scissors, 
  DollarSign, 
  Settings as SettingsIcon, 
  ListOrdered, 
  Globe 
} from "lucide-react";
import { useGetSettings } from "@workspace/api-client-react";

export function Sidebar({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: settings } = useGetSettings({ query: { queryKey: ["settings"] } });

  const navItems = [
    { href: "/", label: "Visão Geral", icon: LayoutDashboard },
    { href: "/appointments", label: "Agendamentos", icon: CalendarCheck },
    { href: "/clients", label: "Clientes", icon: Users },
    { href: "/services", label: "Serviços", icon: Scissors },
    { href: "/financial", label: "Financeiro", icon: DollarSign },
    { href: "/settings", label: "Configurações", icon: SettingsIcon },
    { href: "/queue", label: "Painel de Fila", icon: ListOrdered },
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <Scissors className="h-6 w-6 text-sidebar-primary" />
            <span className="font-semibold text-lg tracking-tight">BarberApp</span>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className={`h-4 w-4 ${isActive ? "text-sidebar-primary" : ""}`} />
                {item.label}
              </Link>
            );
          })}
          
          <div className="pt-4 mt-4 border-t border-sidebar-border">
            <Link 
              href="/booking"
              className="flex items-center justify-between px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
            >
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4" />
                Página Pública
              </div>
            </Link>
          </div>
        </nav>
        
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-sidebar-primary font-medium">
              {settings?.ownerName?.charAt(0).toUpperCase() || "B"}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-none">{settings?.ownerName || "Barbeiro"}</span>
              <span className="text-xs text-sidebar-foreground/50">{settings?.barbershopName || "Barbearia"}</span>
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
