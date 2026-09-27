import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SubscriptionStatus = {
  hasActiveSubscription: boolean;
  hasEverPaid: boolean;
  subscriptionId: string | null;
  stripePriceId: string | null;
  maxBarbers: number | null;
  trialDaysLeft: number;
  trialExpired: boolean;
  canAccess: boolean;
  subscriptionDueDate: string | null;
  subscriptionDaysLeft: number | null;
  pastDue: boolean;
};

type StripePlan = {
  price_id: string;
  product_name: string;
  unit_amount: number;
  currency: string;
  maxBarbers: number | null;
};

export default function Subscription() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, refresh } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const justSubscribed = params.get("subscribed") === "1";
  const checkoutSessionId = params.get("session_id");
  const returnedFromCustomerPortal = params.get("portal_return") === "1";

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [subscriptionSyncing, setSubscriptionSyncing] = useState(
    justSubscribed || returnedFromCustomerPortal,
  );

  const {
    data: subscriptionStatus,
    isLoading: subscriptionStatusLoading,
    isError: subscriptionStatusError,
    refetch: refetchSubscriptionStatus,
  } = useQuery<SubscriptionStatus>({
    queryKey: ["stripe-subscription-status"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/subscription-status", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Não foi possível carregar o status da assinatura.");
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!justSubscribed && !returnedFromCustomerPortal) return;

    let cancelled = false;
    setSubscriptionSyncing(true);

    const syncSubscription = async () => {
      const deadline = Date.now() + (justSubscribed ? 30_000 : 10_000);
      const pollIntervalMs = 2_500;

      while (!cancelled && Date.now() <= deadline) {
        let syncResult: { hasSubscription?: boolean; pending?: boolean } = {};
        try {
          const res = await fetch(`${BASE}/api/stripe/sync-subscription`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ sessionId: checkoutSessionId || undefined }),
          });
          syncResult = await res.json().catch(() => ({})) as typeof syncResult;
        } catch {
          // Retry while Stripe finishes checkout or the network recovers.
        }

        if (cancelled) return;

        await Promise.all([
          refresh(),
          queryClient.invalidateQueries({ queryKey: ["stripe-subscription-status"] }),
        ]);

        if (returnedFromCustomerPortal || syncResult.hasSubscription === true) break;

        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) break;
        await new Promise((resolve) =>
          window.setTimeout(resolve, Math.min(pollIntervalMs, remainingMs)),
        );
      }

      if (!cancelled) setSubscriptionSyncing(false);
    };

    void syncSubscription();
    return () => {
      cancelled = true;
    };
  }, [checkoutSessionId, justSubscribed, queryClient, refresh, returnedFromCustomerPortal]);

  const { data: stripePlans } = useQuery<{ data: StripePlan[] }>({
    queryKey: ["stripe-plans"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/plans", { cache: "no-store" });
      if (!res.ok) return { data: [] };
      return res.json();
    },
    staleTime: 5 * 60_000,
    enabled: !!subscriptionStatus?.hasActiveSubscription,
  });

  const displayedSubscriptionStatus = subscriptionSyncing ? undefined : subscriptionStatus;
  const currentPlan = stripePlans?.data?.find(
    (plan) => plan.price_id === displayedSubscriptionStatus?.stripePriceId,
  );
  const paymentFailed =
    !subscriptionSyncing && (subscriptionStatus?.pastDue ?? user?.pastDue ?? false);

  const openCustomerPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/customer-portal", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: data.error ?? "Erro ao abrir portal de assinatura", variant: "destructive" });
        return;
      }
      const { url } = await res.json() as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Não foi possível abrir o portal. Tente novamente.", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-background p-4 md:p-6">
      <div className="max-w-7xl space-y-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Assinatura</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie seu plano, faturas e dados de pagamento.
          </p>
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Minha Assinatura</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Consulte o status do seu plano e gerencie pagamentos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentFailed && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-950 dark:text-amber-100"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold">Não foi possível processar a cobrança da sua assinatura</p>
                  <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
                    Atualize seu cartão agora para evitar a interrupção do acesso à AgendaPlay.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 gap-1.5 border-amber-600/40 bg-background/60 text-amber-950 hover:bg-amber-500/15 dark:text-amber-100"
                    onClick={openCustomerPortal}
                    disabled={portalLoading}
                  >
                    {portalLoading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    Atualizar cartão
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                {displayedSubscriptionStatus?.hasActiveSubscription ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-500">
                        Ativa
                      </span>
                      {currentPlan && (
                        <span className="text-sm font-semibold">{currentPlan.product_name}</span>
                      )}
                      {displayedSubscriptionStatus.maxBarbers != null && (
                        <span className="text-xs text-muted-foreground">
                          · Até {displayedSubscriptionStatus.maxBarbers}{" "}
                          {displayedSubscriptionStatus.maxBarbers === 1 ? "profissional" : "profissionais"}
                        </span>
                      )}
                    </div>
                    {displayedSubscriptionStatus.subscriptionDueDate && (
                      <p className="text-xs text-muted-foreground">
                        Próxima cobrança:{" "}
                        <span className="font-medium text-foreground">
                          {new Date(displayedSubscriptionStatus.subscriptionDueDate).toLocaleDateString(
                            "pt-BR",
                            { day: "2-digit", month: "long", year: "numeric" },
                          )}
                        </span>
                        {displayedSubscriptionStatus.subscriptionDaysLeft != null && (
                          <span className="ml-1 text-muted-foreground">
                            ({displayedSubscriptionStatus.subscriptionDaysLeft}{" "}
                            {displayedSubscriptionStatus.subscriptionDaysLeft === 1 ? "dia" : "dias"})
                          </span>
                        )}
                      </p>
                    )}
                    {currentPlan && (
                      <p className="text-xs text-muted-foreground">
                        {(currentPlan.unit_amount / 100).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: currentPlan.currency.toUpperCase(),
                        })}
                        /mês
                      </p>
                    )}
                  </>
                ) : displayedSubscriptionStatus?.hasEverPaid ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                      Assinatura encerrada
                    </span>
                  </div>
                ) : displayedSubscriptionStatus && !displayedSubscriptionStatus.trialExpired ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500">
                        Período grátis
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {displayedSubscriptionStatus.trialDaysLeft === 1
                        ? "Último dia de período grátis"
                        : `${displayedSubscriptionStatus.trialDaysLeft} dias restantes no período grátis`}
                    </p>
                  </>
                ) : displayedSubscriptionStatus?.trialExpired &&
                  !displayedSubscriptionStatus.hasActiveSubscription ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                      Sem plano ativo
                    </span>
                  </div>
                ) : subscriptionStatusError && !subscriptionStatus ? (
                  <div className="space-y-2">
                    <p role="alert" className="text-sm text-destructive">
                      Não foi possível carregar sua assinatura.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void refetchSubscriptionStatus()}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {subscriptionSyncing || subscriptionStatusLoading
                        ? "Atualizando assinatura..."
                        : "Carregando..."}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {subscriptionSyncing || !displayedSubscriptionStatus
                ? null
                : displayedSubscriptionStatus.hasActiveSubscription ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={openCustomerPortal}
                    disabled={portalLoading}
                  >
                    {portalLoading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    Trocar plano
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={openCustomerPortal}
                    disabled={portalLoading}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Ver faturas
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setCancelDialogOpen(true)}
                    disabled={portalLoading}
                  >
                    Cancelar assinatura
                  </Button>
                </>
              ) : displayedSubscriptionStatus.hasEverPaid ? (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => window.location.assign("/subscribe")}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Renovar assinatura
                </Button>
              ) : !displayedSubscriptionStatus.trialExpired ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => window.location.assign("/subscribe")}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Assinar agora
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => window.location.assign("/subscribe")}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Escolher plano
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancelar assinatura
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Você será redirecionado para o portal de assinatura do Stripe, onde poderá cancelar seu plano com segurança.
              <br /><br />
              Após o cancelamento, você ainda terá acesso até o fim do período já pago.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={portalLoading}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={portalLoading}
              onClick={async () => {
                setCancelDialogOpen(false);
                await openCustomerPortal();
              }}
            >
              {portalLoading ? "Abrindo..." : "Ir para o portal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}