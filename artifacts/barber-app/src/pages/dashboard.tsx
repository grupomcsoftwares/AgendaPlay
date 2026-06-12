import React, { useState } from "react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Users, DollarSign, CalendarCheck, Clock, Scissors, Link, Copy, Check, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: summary, isLoading } = useGetDashboardSummary({
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
    ? `${window.location.origin}/b/${user.slug}`
    : null;

  const handleShare = async () => {
    if (!bookingUrl) return;
    const shopName = user?.barbershopName || "minha barbearia";
    const text = `Agende seu horário na ${shopName}:\n${bookingUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: shopName, text, url: bookingUrl });
      } catch {
      }
    } else {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
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
                variant="default"
                className="shrink-0 gap-1.5"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4" />
                <span>Compartilhar</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Compartilhe este link com seus clientes para que eles possam agendar online.
            </p>
          </CardContent>
        </Card>
      )}

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
