import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { CheckCircle, Clock, Zap, Users } from "lucide-react";
import logoUrl from "../assets/agenda-play-logo-v2.png";
import { useAuth } from "../context/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Plan = {
  price_id: string;
  product_name: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string } | null;
  maxBarbers: number | null;
};

const FALLBACK_PLANS: Plan[] = [
  { price_id: "", product_name: "1 Profissional", unit_amount: 2490, currency: "brl", recurring: { interval: "month" }, maxBarbers: 1 },
  { price_id: "", product_name: "2 Profissionais", unit_amount: 4990, currency: "brl", recurring: { interval: "month" }, maxBarbers: 2 },
  { price_id: "", product_name: "3 Profissionais", unit_amount: 7490, currency: "brl", recurring: { interval: "month" }, maxBarbers: 3 },
  { price_id: "", product_name: "Ilimitado", unit_amount: 9990, currency: "brl", recurring: { interval: "month" }, maxBarbers: null },
];

const PLAN_DESCRIPTIONS: Record<number, string> = {
  2490: "Ideal para barbearia solo",
  4990: "Para duplas de barbeiros",
  7490: "Para equipes de até 3",
  9990: "Para equipes grandes, sem limite",
};

export default function Subscribe() {
  const { user, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const justSubscribed = params.get("subscribed") === "1";
  const checkoutSessionId = params.get("session_id");
  const isTVView =
    Boolean((window as Window & { __AGENDAPLAY_TV__?: boolean }).__AGENDAPLAY_TV__) ||
    params.get("tv") === "1" ||
    (params.get("view") === "mobile" && window.innerWidth >= 900);

  useEffect(() => {
    if (justSubscribed) {
      setCheckingSubscription(true);
      const syncAndCheck = async () => {
        // Stripe can redirect before the webhook reaches our server. Retry
        // briefly so a successful payment never falls back to the plans page.
        for (let attempt = 0; attempt < 12; attempt += 1) {
          try {
            await fetch(`${BASE}/api/stripe/sync-subscription`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ sessionId: checkoutSessionId || undefined }),
            });
          } catch {
            // Keep retrying while Stripe finishes the checkout.
          }
          const refreshedUser = await refresh();
          if (refreshedUser?.hasActiveSubscription) break;
          if (attempt < 11) {
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
          }
        }
        setCheckingSubscription(false);
      };
      syncAndCheck();
    }
  }, [justSubscribed, checkoutSessionId, refresh]);

  useEffect(() => {
    if (user?.hasActiveSubscription && !checkingSubscription) {
      setLocation("/dashboard");
    }
  }, [user, checkingSubscription, setLocation]);

  useEffect(() => {
    fetch(`${BASE}/api/stripe/plans`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.data) && data.data.length > 0) setPlans(data.data as Plan[]);
      })
      .catch(() => {});
  }, []);

  const handleSubscribe = async (priceId: string) => {
    if (!priceId) return;
    setLoadingPriceId(priceId);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceId }),
      });
      const responseText = await res.text();
      let responseData: { error?: string; url?: string };
      try {
        responseData = JSON.parse(responseText) as { error?: string; url?: string };
      } catch {
        throw new Error(
          res.ok
            ? "Resposta inválida do servidor de pagamento."
            : "Não foi possível iniciar o pagamento. Tente novamente.",
        );
      }
      if (!res.ok) {
        throw new Error(responseData.error ?? "Erro ao criar sessão de pagamento.");
      }
      const { url } = responseData;
      if (url) window.location.href = url;
      else throw new Error("O servidor não retornou um link de pagamento.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao processar pagamento.");
    } finally {
      setLoadingPriceId(null);
    }
  };

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const displayPlans = plans.length > 0 ? plans : FALLBACK_PLANS;
  const stripeReady = plans.length > 0;

  if (checkingSubscription) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "hsl(0 0% 4%)" }}>
        <div className="text-center space-y-4">
          <div
            className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin mx-auto"
            style={{ borderColor: "hsl(var(--sidebar-primary))", borderTopColor: "transparent" }}
          />
          <p style={{ color: "hsl(0 0% 60%)" }}>Confirmando assinatura...</p>
        </div>
      </div>
    );
  }

  // A TV is a display-only endpoint. Never render checkout there, even when
  // the WebView session has not finished restoring its cookie yet.
  if (isTVView) {
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

  const trialExpiredAndNoSub = user && user.trialExpired && !user.hasActiveSubscription;

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "hsl(0 0% 4%)" }}
    >
      <div className="max-w-2xl w-full space-y-8">
        {/* Expired trial banner */}
        {trialExpiredAndNoSub && (
          <div
            className="rounded-2xl px-5 py-4 flex items-start gap-3"
            style={{ backgroundColor: "hsl(0 60% 15%)", border: "1px solid hsl(0 60% 30%)" }}
          >
            <div className="text-2xl flex-shrink-0" aria-hidden="true">🔒</div>
            <div>
              <p className="font-semibold text-sm" style={{ color: "hsl(0 80% 70%)" }}>
                Período de teste encerrado
              </p>
              <p className="text-sm mt-0.5" style={{ color: "hsl(0 0% 65%)" }}>
                Seu acesso ao sistema foi bloqueado porque os 30 dias de teste gratuito expiraram.
                Assine um plano abaixo para continuar gerenciando sua barbearia.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <img src={logoUrl} alt="Agenda Play" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "contain" }} />
          </div>
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium"
            style={{ backgroundColor: "hsl(0 60% 20%)", color: "hsl(0 80% 70%)" }}
          >
            <Clock className="w-4 h-4" />
            {!user
              ? "Faça login para assinar"
              : user.trialExpired
                ? "Período de teste encerrado"
                : `${user.trialDaysLeft} ${user.trialDaysLeft === 1 ? "dia" : "dias"} restante${user.trialDaysLeft === 1 ? "" : "s"} no teste`}
          </div>
          <h1 className="text-2xl font-bold">Escolha seu plano</h1>
          <p className="text-sm" style={{ color: "hsl(0 0% 60%)" }}>
            Selecione conforme o número de profissionais da sua barbearia.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            "Agendamentos ilimitados",
            "Painel de fila em tempo real",
            "Relatórios financeiros",
            "Gestão de clientes",
            "Personalização completa",
            "Suporte prioritário",
          ].map((benefit) => (
            <div key={benefit} className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "hsl(var(--sidebar-primary))" }} />
              <span className="text-xs" style={{ color: "hsl(0 0% 70%)" }}>{benefit}</span>
            </div>
          ))}
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {displayPlans.map((plan, i) => {
            const isPopular = plan.unit_amount === 4990;
            const isLoading = loadingPriceId === plan.price_id;
            const barberLabel = plan.maxBarbers == null || plan.maxBarbers === 0
              ? "Profissionais ilimitados"
              : `Até ${plan.maxBarbers} ${plan.maxBarbers === 1 ? "profissional" : "profissionais"}`;
            const desc = PLAN_DESCRIPTIONS[plan.unit_amount] ?? "";

            return (
              <div
                key={plan.price_id || i}
                className="relative rounded-2xl p-5 flex flex-col gap-3"
                style={{
                  backgroundColor: isPopular ? "hsl(var(--sidebar-primary) / 0.08)" : "hsl(0 0% 7%)",
                  border: isPopular
                    ? "2px solid hsl(var(--sidebar-primary))"
                    : "1px solid hsl(0 0% 14%)",
                }}
              >
                {isPopular && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold"
                    style={{ backgroundColor: "hsl(var(--sidebar-primary))", color: "hsl(var(--sidebar-primary-foreground))" }}
                  >
                    Mais popular
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4" style={{ color: "hsl(var(--sidebar-primary))" }} />
                    <span className="text-xs font-medium" style={{ color: "hsl(var(--sidebar-primary))" }}>
                      {barberLabel}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{formatPrice(plan.unit_amount, plan.currency)}</span>
                    <span className="text-xs" style={{ color: "hsl(0 0% 50%)" }}>/mês</span>
                  </div>
                  {desc && (
                    <p className="text-xs mt-1" style={{ color: "hsl(0 0% 50%)" }}>{desc}</p>
                  )}
                </div>

                <button
                  onClick={() => handleSubscribe(plan.price_id)}
                  disabled={isLoading || !stripeReady}
                  className="w-full rounded-xl font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  style={{
                    height: 42,
                    backgroundColor: "hsl(var(--sidebar-primary))",
                    color: "hsl(var(--sidebar-primary-foreground))",
                    border: "none",
                    cursor: (isLoading || !stripeReady) ? "not-allowed" : "pointer",
                  }}
                >
                  <Zap className="w-3.5 h-3.5" />
                  {isLoading ? "Redirecionando..." : stripeReady ? "Assinar agora" : "Em breve"}
                </button>
              </div>
            );
          })}
        </div>

        {!stripeReady && (
          <p className="text-xs text-center" style={{ color: "hsl(0 0% 40%)" }}>
            Pagamentos em configuração. Entre em contato para assinar.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
