import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Scissors,
  CreditCard,
  Settings as SettingsIcon,
  LayoutDashboard,
  List,
  Users,
  UserRound,
  LogOut,
  Clock,
  AlertTriangle,
  Menu,
  Activity,
  LayoutGrid,
  QrCode,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useGetSettings } from "@workspace/api-client-react";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  external?: boolean;
  bookingLink?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
  { href: "/appointments", label: "Agendamentos", icon: List },
  { href: "/queue", label: "Painel de Fila", icon: Activity, external: true },
  { href: "/booking", label: "Pg. de Agendamento", icon: LayoutGrid, external: true, bookingLink: true },
  { href: "/clients", label: "Clientes", icon: UserRound },
  { href: "/services", label: "Serviços", icon: Scissors },
  { href: "/barbers", label: "Barbeiros", icon: Users },
  { href: "/financial", label: "Financeiro", icon: CreditCard },
  { href: "/settings", label: "Configurações", icon: SettingsIcon },
];

function NavLinks({ location, bookingUrl, onNavigate }: { location: string; bookingUrl: string; onNavigate?: () => void }) {
  const itemClass = "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors w-full";

  const hoverOn = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--sidebar-accent))";
    (e.currentTarget as HTMLElement).style.color = "hsl(var(--sidebar-foreground))";
  };
  const hoverOff = (e: React.MouseEvent, isActive: boolean) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = "";
    (e.currentTarget as HTMLElement).style.color = isActive
      ? "hsl(var(--sidebar-primary-foreground))"
      : "hsl(var(--sidebar-foreground) / 0.65)";
  };

  return (
    <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
      {NAV_ITEMS.map((item) => {
        const href = item.bookingLink ? (bookingUrl || item.href) : item.href;
        const isActive = !item.external && (
          location === item.href ||
          (item.href !== "/" && location.startsWith(item.href))
        );
        const activeStyle = {
          backgroundColor: "hsl(var(--sidebar-primary))",
          color: "hsl(var(--sidebar-primary-foreground))",
          fontWeight: 500 as const,
        };
        const inactiveStyle = { color: "hsl(var(--sidebar-foreground) / 0.65)" };

        if (item.external) {
          return (
            <a
              key={item.href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={itemClass}
              style={inactiveStyle}
              onClick={onNavigate}
              onMouseEnter={hoverOn}
              onMouseLeave={(e) => hoverOff(e, false)}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span>{item.label}</span>
            </a>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={itemClass}
            style={isActive ? activeStyle : inactiveStyle}
            onMouseEnter={(e) => { if (!isActive) hoverOn(e); }}
            onMouseLeave={(e) => { if (!isActive) hoverOff(e, false); }}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function UserFooter({
  ownerName,
  barbershopName,
  initials,
  showTrialBanner,
  trialDaysLeft,
  trialColor,
  trialBg,
  onLogout,
}: {
  ownerName: string;
  barbershopName: string;
  initials: string;
  showTrialBanner: boolean;
  trialDaysLeft: number | null;
  trialColor: string;
  trialBg: string;
  onLogout: () => void;
}) {
  return (
    <div className="border-t" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
      {showTrialBanner && (
        <div
          className="mx-3 mt-3 px-3 py-2 rounded-lg flex items-center gap-2"
          style={{ backgroundColor: trialBg, border: `1px solid ${trialColor}30` }}
        >
          {trialDaysLeft === 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: trialColor }} />
          ) : (
            <Clock className="h-3.5 w-3.5 flex-shrink-0" style={{ color: trialColor }} />
          )}
          <span className="text-xs font-medium" style={{ color: trialColor }}>
            {trialDaysLeft === 0
              ? "Teste expirado"
              : `${trialDaysLeft} ${trialDaysLeft === 1 ? "dia" : "dias"} de teste`}
          </span>
          {trialDaysLeft !== null && trialDaysLeft <= 3 && (
            <Link
              href="/subscribe"
              className="ml-auto text-xs font-semibold underline"
              style={{ color: trialColor }}
            >
              Assinar
            </Link>
          )}
        </div>
      )}

      <div className="p-4 flex items-center gap-3">
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
          style={{
            backgroundColor: "hsl(var(--sidebar-primary) / 0.2)",
            color: "hsl(var(--sidebar-primary))",
          }}
        >
          {initials}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="text-sm font-medium truncate"
            style={{ color: "hsl(var(--sidebar-foreground))" }}
          >
            {ownerName}
          </span>
          <span
            className="text-xs truncate"
            style={{ color: "hsl(var(--sidebar-foreground) / 0.45)" }}
          >
            {barbershopName}
          </span>
        </div>
        <button
          onClick={onLogout}
          title="Sair"
          className="flex-shrink-0 rounded-md p-1.5 transition-colors"
          style={{ color: "hsl(var(--sidebar-foreground) / 0.45)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "hsl(var(--sidebar-accent))";
            (e.currentTarget as HTMLElement).style.color =
              "hsl(var(--sidebar-foreground))";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "";
            (e.currentTarget as HTMLElement).style.color =
              "hsl(var(--sidebar-foreground) / 0.45)";
          }}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function QrCodeButton({ onQrClick, onNavigate }: { onQrClick: () => void; onNavigate?: () => void }) {
  const cls = "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors w-full cursor-pointer";
  const style = { color: "hsl(var(--sidebar-foreground) / 0.65)" };
  return (
    <div className="px-3 pb-2">
      <button
        onClick={() => { onQrClick(); onNavigate?.(); }}
        className={cls}
        style={style}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--sidebar-accent))";
          (e.currentTarget as HTMLElement).style.color = "hsl(var(--sidebar-foreground))";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = "";
          (e.currentTarget as HTMLElement).style.color = "hsl(var(--sidebar-foreground) / 0.65)";
        }}
      >
        <QrCode className="h-4 w-4 flex-shrink-0 text-amber-400" />
        <span>QR Code</span>
      </button>
    </div>
  );
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const { data: settings } = useGetSettings(undefined, { query: { queryKey: ["settings"] } });
  const { user, logout } = useAuth();

  const ownerName = user?.ownerName || settings?.ownerName || "Barbeiro";
  const barbershopName = user?.barbershopName || settings?.barbershopName || "Barbearia";
  const initials = ownerName
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n.charAt(0).toUpperCase())
    .join("");

  const handleLogout = async () => {
    setDrawerOpen(false);
    await logout();
    setLocation("/login");
  };

  const trialDaysLeft = user?.trialDaysLeft ?? null;
  const hasSubscription = user?.hasActiveSubscription ?? false;
  const showTrialBanner = !hasSubscription && trialDaysLeft !== null;
  const trialColor =
    trialDaysLeft === null
      ? ""
      : trialDaysLeft > 3
        ? "hsl(142 70% 45%)"
        : trialDaysLeft > 0
          ? "hsl(38 90% 50%)"
          : "hsl(0 70% 55%)";
  const trialBg =
    trialDaysLeft === null
      ? ""
      : trialDaysLeft > 3
        ? "hsl(142 60% 10%)"
        : trialDaysLeft > 0
          ? "hsl(38 60% 10%)"
          : "hsl(0 60% 10%)";

  const bookingUrl = user ? `${window.location.origin}/booking?shopId=${user.id}` : "";

  const footerProps = {
    ownerName,
    barbershopName,
    initials,
    showTrialBanner,
    trialDaysLeft,
    trialColor,
    trialBg,
    onLogout: handleLogout,
  };

  const qrDialog = (
    <Dialog open={qrOpen} onOpenChange={setQrOpen}>
      <DialogContent className="max-w-xs text-center">
        <DialogHeader>
          <DialogTitle>QR Code de Agendamento</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          Clientes escaneiam para acessar a página de agendamento online.
        </p>
        {bookingUrl ? (
          <div className="flex justify-center">
            <div className="p-3 bg-white rounded-xl shadow-sm">
              <QRCodeSVG value={bookingUrl} size={200} />
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        )}
        <p className="text-xs text-muted-foreground mt-3 break-all">{bookingUrl}</p>
      </DialogContent>
    </Dialog>
  );

  if (isMobile) {
    return (
      <div className="flex flex-col h-screen w-full bg-background text-foreground">
        {/* Mobile top bar */}
        <header
          className="h-14 flex items-center justify-between px-4 flex-shrink-0"
          style={{
            backgroundColor: "hsl(var(--sidebar))",
            borderBottom: "1px solid hsl(var(--sidebar-border))",
          }}
        >
          <div className="flex items-center gap-2">
            <Scissors className="h-5 w-5" style={{ color: "hsl(var(--sidebar-primary))" }} />
            <span
              className="font-semibold text-base tracking-tight"
              style={{ color: "hsl(var(--sidebar-foreground))" }}
            >
              {barbershopName}
            </span>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-2 transition-colors"
            style={{ color: "hsl(var(--sidebar-foreground))" }}
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {/* Mobile drawer */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent
            side="left"
            className="p-0 flex flex-col w-64"
            style={{
              backgroundColor: "hsl(var(--sidebar))",
              borderRight: "1px solid hsl(var(--sidebar-border))",
            }}
          >
            <SheetHeader className="h-14 flex flex-row items-center justify-between px-5 border-b flex-shrink-0" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
              <SheetTitle
                className="flex items-center gap-2 font-semibold text-base tracking-tight"
                style={{ color: "hsl(var(--sidebar-foreground))" }}
              >
                <Scissors className="h-5 w-5" style={{ color: "hsl(var(--sidebar-primary))" }} />
                {barbershopName}
              </SheetTitle>
            </SheetHeader>

            <NavLinks location={location} bookingUrl={bookingUrl} onNavigate={() => setDrawerOpen(false)} />
            <div className="border-t mx-3 my-1" style={{ borderColor: "hsl(var(--sidebar-border))" }} />
            <QrCodeButton onQrClick={() => setQrOpen(true)} onNavigate={() => setDrawerOpen(false)} />
            <UserFooter {...footerProps} />
          </SheetContent>
        </Sheet>

        {qrDialog}

        {/* Page content */}
        <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside
        className="w-60 flex-shrink-0 flex flex-col"
        style={{
          backgroundColor: "hsl(var(--sidebar))",
          borderRight: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        <div
          className="h-14 flex items-center px-5 border-b"
          style={{ borderColor: "hsl(var(--sidebar-border))" }}
        >
          <div className="flex items-center gap-2">
            <Scissors className="h-5 w-5" style={{ color: "hsl(var(--sidebar-primary))" }} />
            <span
              className="font-semibold text-base tracking-tight"
              style={{ color: "hsl(var(--sidebar-foreground))" }}
            >
              {barbershopName}
            </span>
          </div>
        </div>

        <NavLinks location={location} bookingUrl={bookingUrl} />
        <div className="border-t mx-3 my-1" style={{ borderColor: "hsl(var(--sidebar-border))" }} />
        <QrCodeButton onQrClick={() => setQrOpen(true)} />
        <UserFooter {...footerProps} />
      </aside>

      {qrDialog}

      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
