import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Scissors, CheckCircle, Clock, Zap } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Subscribe() {
  const { user, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<Array<{ price_id: string; product_name: string; unit_amount: number; currency: string; recurring: { interval: string } | null }>>([]);
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const justSubscribed = params.get("subscribed") === "1";

  useEffect(() => {
    if (justSubscribed) {
      setCheckingSubscription(true);
      const syncAndCheck = async () => {
        await fetch(`${BASE}/api/stripe/sync-subscription`, { method: "POST", credentials: "include" });
        await refresh();
        setCheckingSubscription(false);
      };
      syncAndCheck();
    }
  }, [justSubscribed, refresh]);

  useEffect(() => {
    if (user?.canAccess && !checkingSubscription) {
      setLocation("/dashboard");
    }
  }, [user, checkingSubscription, setLocation]);

  useEffect(() => {
    fetch(`${BASE}/api/stripe/plans`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.data)) setPlans(data.data);
      })
      .catch(() => {});
  }, []);

  const handleSubscribe = async (priceId: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao criar sessão de pagamento.");
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao processar pagamento.");
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  if (checkingSubscription) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "hsl(0 0% 4%)" }}>
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "hsl(var(--sidebar-primary))", borderTopColor: "transparent" }} />
          <p style={{ color: "hsl(0 0% 60%)" }}>Confirmando assinatura...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "hsl(0 0% 4%)" }}
    >
      <div className="max-w-lg w-full space-y-8">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <Scissors className="w-8 h-8" style={{ color: "hsl(var(--sidebar-primary))" }} />
            <span className="text-2xl font-bold">BarberApp</span>
          </div>
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium"
            style={{ backgroundColor: "hsl(0 60% 20%)", color: "hsl(0 80% 70%)" }}
          >
            <Clock className="w-4 h-4" />
            {user?.trialExpired
              ? "Período de teste encerrado"
              : `${user?.trialDaysLeft} ${user?.trialDaysLeft === 1 ? "dia" : "dias"} restantes no teste`}
          </div>
          <h1 className="text-2xl font-bold">Continue usando o BarberApp</h1>
          <p className="text-sm" style={{ color: "hsl(0 0% 60%)" }}>
            Assine para ter acesso completo e ilimitado ao painel da sua barbearia.
          </p>
        </div>

        <div className="space-y-3">
          {[
            "Agendamentos ilimitados",
            "Painel de fila em tempo real",
            "Relatórios financeiros",
            "Página de agendamento personalizada",
            "Gestão de barbeiros e serviços",
          ].map((benefit) => (
            <div key={benefit} className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: "hsl(var(--sidebar-primary))" }} />
              <span className="text-sm" style={{ color: "hsl(0 0% 80%)" }}>{benefit}</span>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {plans.length > 0 ? (
            plans.map((plan) => (
              <div
                key={plan.price_id}
                className="rounded-2xl p-5"
                style={{ backgroundColor: "hsl(0 0% 7%)", border: "1px solid hsl(var(--sidebar-primary) / 0.4)" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-semibold text-lg">{plan.product_name}</p>
                    <p className="text-sm" style={{ color: "hsl(0 0% 55%)" }}>
                      {plan.recurring?.interval === "month" ? "Mensal" : plan.recurring?.interval === "year" ? "Anual" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{formatPrice(plan.unit_amount, plan.currency)}</p>
                    <p className="text-xs" style={{ color: "hsl(0 0% 55%)" }}>
                      /{plan.recurring?.interval === "month" ? "mês" : plan.recurring?.interval === "year" ? "ano" : "período"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleSubscribe(plan.price_id)}
                  disabled={loading}
                  className="w-full rounded-xl font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{
                    height: 48,
                    backgroundColor: "hsl(var(--sidebar-primary))",
                    color: "hsl(var(--sidebar-primary-foreground))",
                    border: "none",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  <Zap className="w-4 h-4" />
                  {loading ? "Redirecionando..." : "Assinar agora"}
                </button>
              </div>
            ))
          ) : (
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: "hsl(0 0% 7%)", border: "1px solid hsl(var(--sidebar-primary) / 0.4)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-lg">Plano Pro BarberApp</p>
                  <p className="text-sm" style={{ color: "hsl(0 0% 55%)" }}>Mensal</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">R$ 49,90</p>
                  <p className="text-xs" style={{ color: "hsl(0 0% 55%)" }}>/mês</p>
                </div>
              </div>
              <p className="text-sm text-center" style={{ color: "hsl(0 0% 55%)" }}>
                Pagamentos em configuração. Entre em contato para assinar.
              </p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
