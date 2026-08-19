import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";

function isTVView(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return Boolean(
    (window as Window & { __AGENDAPLAY_TV__?: boolean }).__AGENDAPLAY_TV__ ||
    params.get("tv") === "1" ||
    (params.get("view") === "mobile" && window.innerWidth >= 900),
  );
}

function TVSubscriptionExpired() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ backgroundColor: "hsl(0 0% 4%)", color: "hsl(0 0% 95%)" }}
    >
      <div className="text-5xl" aria-hidden="true">🔒</div>
      <h1 className="text-2xl font-bold">Assinatura expirada</h1>
      <p className="max-w-lg text-base" style={{ color: "hsl(0 0% 60%)" }}>
        A fila ao vivo está bloqueada porque a assinatura desta barbearia expirou.
      </p>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const tvView = isTVView();

  useEffect(() => {
    if (!loading && !user) {
      setLocation(tvView ? "/subscribe?tv=1" : "/login");
    } else if (
      !loading &&
      user &&
      !user.canAccess &&
      !user.isSystemAdmin &&
      !tvView
    ) {
      setLocation("/subscribe");
    }
  }, [loading, user, setLocation, tvView]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "hsl(0 0% 4%)" }}
      >
        <div
          className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin"
          style={{
            borderColor: "hsl(var(--sidebar-primary))",
            borderTopColor: "transparent",
          }}
        />
      </div>
    );
  }

  if (!user) {
    if (tvView) return <TVSubscriptionExpired />;
    return null;
  }

  if (!user.canAccess && !user.isSystemAdmin) {
    return tvView ? <TVSubscriptionExpired /> : null;
  }

  return <>{children}</>;
}
