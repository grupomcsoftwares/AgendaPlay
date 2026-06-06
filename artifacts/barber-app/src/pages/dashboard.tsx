import React from "react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Users, DollarSign, CalendarCheck, Clock, Scissors } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey(),
      // Live sync: dashboard reflects new bookings, cancellations and queue
      // transitions every 5s without manual refresh.
      refetchInterval: 5000,
      refetchOnWindowFocus: true,
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Visão Geral</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-8 space-y-8 bg-background">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Visão Geral</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
