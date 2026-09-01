import React, { useEffect, useState } from "react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Users, DollarSign, CalendarCheck, Clock, Scissors, Link, Copy, Check, Share2, QrCode, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh, user?.id]);

  const { data: subscriptionStatus } = useQuery<{ pastDue: boolean }>({
    queryKey: ["stripe-subscription-status"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/subscription-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch subscription status");
      return res.json();
    },
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const paymentFailed = subscriptionStatus?.pastDue ?? user?.pastDue ?? false;

  const {
    data: summary,
    isLoading,
    isError: summaryError,
    isFetching: summaryFetching,
    refetch: refetchSummary,
  } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey(),
      refetchInterval: 5000,
      refetchOnWindowFocus: true,
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const bookingUrl = user?.slug
    ? `https://agendaplay.net/b/${user.slug}`
    : null;

  const shareText = () => {
    const shopName = user?.barbershopName || "minha barbearia";
    return `Agende seu horário na ${shopName}:\n${bookingUrl}`;
  };

  const handleShare = async () => {
    if (!bookingUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText() });
      } catch {
      }
    } else {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText())}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleCopy = () => {
    if (!bookingUrl) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(bookingUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        fallbackCopy(bookingUrl);
      });
    } else {
      fallbackCopy(bookingUrl);
    }
  };

  const openCustomerPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/customer-portal", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: data.error ?? "Não foi possível abrir o portal de assinatura.", variant: "destructive" });
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

  const fallbackCopy = (text: string) => {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    } finally {
      document.body.removeChild(el);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Visão Geral</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 md:h-32 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-8 space-y-5 md:space-y-8 bg-background">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Visão Geral</h1>

      {summaryError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="flex-1 text-sm">Não foi possível carregar os dados do dashboard.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => void refetchSummary()}
            disabled={summaryFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${summaryFetching ? "animate-spin" : ""}`} />
            Tentar novamente
          </Button>
        </div>
      )}

      {paymentFailed && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-950 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">Não foi possível processar a cobrança da sua assinatura</p>
            <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
              Atualize seu cartão para evitar a interrupção do acesso à AgendaPlay.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 gap-1.5 border-amber-600/40 bg-background/60 text-amber-950 hover:bg-amber-500/15 dark:text-amber-100"
              onClick={openCustomerPortal}
              disabled={portalLoading}
            >
              {portalLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              Atualizar cartão
            </Button>
          </div>
        </div>
      )}

      {bookingUrl && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Link className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium text-primary">Seu link de agendamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm font-mono text-foreground bg-background border border-border rounded-md px-3 py-2 truncate select-all">
                {bookingUrl}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-green-500">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copiar</span>
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={() => setQrOpen(true)}
              >
                <QrCode className="h-4 w-4" />
                <span className="hidden sm:inline">QR Code</span>
              </Button>
              <Button
                size="sm"
                variant="default"
                className="shrink-0 gap-1.5"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4" />
                <span>Compartilhar</span>
              </Button>
            </div>
            {/* <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-muted-foreground mr-1">Enviar via:</span>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10 hover:text-[#25D366]"
                onClick={handleWhatsApp}
                title="Compartilhar via WhatsApp"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span>WhatsApp</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={handleSMS}
                title="Compartilhar via SMS"
              >
                <MessageSquare className="h-4 w-4" />
                <span>SMS</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={handleEmail}
                title="Compartilhar via e-mail"
              >
                <Mail className="h-4 w-4" />
                <span>E-mail</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Compartilhe este link com seus clientes para que eles possam agendar online.
            </p> */}
          </CardContent>
        </Card>
      )}

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento Mensal</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.monthlyRevenue || 0)}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Agendamentos Hoje</CardTitle>
            <CalendarCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.appointmentsToday || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.appointmentsCompleted || 0} concluídos, {summary?.appointmentsPending || 0} pendentes
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fila de Espera</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.queueCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Clientes aguardando</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalClients || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Em Atendimento</CardTitle>
          </CardHeader>
          <CardContent>
            {summary?.currentAppointment ? (
              <div className="flex items-center gap-4 border border-border p-4 rounded-lg bg-background">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                  <Scissors className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium text-lg">{summary.currentAppointment.clientName}</p>
                  <p className="text-sm text-muted-foreground">{summary.currentAppointment.serviceName}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Scissors className="h-8 w-8 mb-2 opacity-20" />
                <p>Nenhum atendimento em andamento</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Próximo da Fila</CardTitle>
          </CardHeader>
          <CardContent>
            {summary?.nextAppointment ? (
              <div className="flex items-center gap-4 border border-border p-4 rounded-lg bg-background">
                <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center text-foreground">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium text-lg">{summary.nextAppointment.clientName}</p>
                  <p className="text-sm text-muted-foreground">
                    {summary.nextAppointment.serviceName} • {new Date(summary.nextAppointment.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Clock className="h-8 w-8 mb-2 opacity-20" />
                <p>Nenhum próximo agendamento</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
