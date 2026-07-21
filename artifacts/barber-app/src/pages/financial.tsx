import React, { useState } from "react";
import { useGetFinancialSummary, getGetFinancialSummaryQueryKey } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DollarSign, TrendingUp, Scissors, Calendar as CalendarIcon, UserCheck, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Financial() {
  const today = new Date();
  const [dateStart, setDateStart] = useState<Date>(startOfMonth(today));
  const [dateEnd, setDateEnd] = useState<Date>(endOfMonth(today));
  const [periodOpen, setPeriodOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<Date>(startOfMonth(today));
  const [pendingEnd, setPendingEnd] = useState<Date>(endOfMonth(today));
  const [calMode, setCalMode] = useState<"start" | "end">("start");
  const [calOpen, setCalOpen] = useState(false);

  const dateStartStr = format(dateStart, "yyyy-MM-dd");
  const dateEndStr = format(dateEnd, "yyyy-MM-dd");

  const params = {
    dateStart: dateStartStr,
    dateEnd: dateEndStr,
  };

  const { data: summary, isLoading } = useGetFinancialSummary(
    params,
    { query: { queryKey: getGetFinancialSummaryQueryKey(params) } }
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const periodLabel =
    dateStartStr === dateEndStr
      ? format(dateStart, "dd 'de' MMMM, yyyy", { locale: ptBR })
      : `${format(dateStart, "dd/MM/yyyy")} - ${format(dateEnd, "dd/MM/yyyy")}`;

  const handleOpenPeriod = () => {
    setPendingStart(dateStart);
    setPendingEnd(dateEnd);
    setPeriodOpen(true);
  };

  const handleConfirmPeriod = () => {
    setDateStart(pendingStart);
    setDateEnd(pendingEnd);
    setPeriodOpen(false);
  };

  const handleQuickPeriod = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setDateStart(start);
    setDateEnd(end);
  };

  return (
    <div className="flex-1 p-4 md:p-8 bg-background overflow-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Acompanhe o faturamento do seu negócio.</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => handleQuickPeriod(6)}>7 dias</Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickPeriod(29)}>30 dias</Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickPeriod(89)}>90 dias</Button>
          <Button
            variant="outline"
            className="justify-start gap-2 font-normal min-w-[180px]"
            onClick={handleOpenPeriod}
          >
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            {periodLabel}
          </Button>
        </div>
      </div>

      {/* Period picker dialog */}
      <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
        <DialogContent className="sm:max-w-[380px] p-0 gap-0 overflow-hidden border-border/60">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Selecione o período do relatório
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {/* Start date */}
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Data de início</span>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 font-normal"
                onClick={() => { setCalMode("start"); setCalOpen(true); }}
              >
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                {format(pendingStart, "EEE, dd MMM yyyy", { locale: ptBR })}
              </Button>
            </div>
            {/* End date */}
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Data de término</span>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 font-normal"
                onClick={() => { setCalMode("end"); setCalOpen(true); }}
              >
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                {format(pendingEnd, "EEE, dd MMM yyyy", { locale: ptBR })}
              </Button>
            </div>
            {/* Calendar picker */}
            {calOpen && (
              <div className="border rounded-xl p-2">
                <Calendar
                  mode="single"
                  locale={ptBR}
                  selected={calMode === "start" ? pendingStart : pendingEnd}
                  onSelect={(d) => {
                    if (!d) return;
                    if (calMode === "start") setPendingStart(d);
                    else setPendingEnd(d);
                    setCalOpen(false);
                  }}
                />
              </div>
            )}
          </div>
          <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setPeriodOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmPeriod}>
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento Total</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-500">{formatCurrency(summary?.totalRevenue || 0)}</div>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Médio</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(summary?.averageTicket || 0)}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Serviços Realizados</CardTitle>
              <Scissors className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary?.totalAppointments || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Faturamento por Dia</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {summary?.revenueByDay && summary.revenueByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(str) => str.split('-')[2]} stroke="#888" />
                  <YAxis stroke="#888" tickFormatter={(val) => `R$${val}`} />
                  <Tooltip 
                    cursor={{fill: '#222'}} 
                    contentStyle={{backgroundColor: '#111', borderColor: '#333', color: '#fff'}}
                    formatter={(val: number) => [formatCurrency(val), "Receita"]}
                    labelFormatter={(label) => `Dia ${label.split('-')[2]}`}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Sem dados para este período</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Receita por Serviço</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
             {summary?.revenueByService && summary.revenueByService.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.revenueByService} layout="vertical" margin={{ left: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                  <XAxis type="number" stroke="#888" />
                  <YAxis type="category" dataKey="serviceName" stroke="#888" />
                  <Tooltip 
                    cursor={{fill: '#222'}} 
                    contentStyle={{backgroundColor: '#111', borderColor: '#333', color: '#fff'}}
                    formatter={(val: number) => [formatCurrency(val), "Receita"]}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Sem dados para este período</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comissão por Barbeiro */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Comissão por Barbeiro
          </CardTitle>
          {summary?.commissionByBarber && summary.commissionByBarber.length > 1 && (
            <span className="text-sm text-muted-foreground">
              Total:{" "}
              <span className="font-semibold text-amber-400">
                {formatCurrency(
                  summary.commissionByBarber.reduce((s, b) => s + b.commissionAmount, 0)
                )}
              </span>
            </span>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : !summary?.commissionByBarber || summary.commissionByBarber.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
              Nenhum atendimento com barbeiro atribuído neste período
            </div>
          ) : (
            <div className="space-y-3">
              {summary.commissionByBarber.map((b) => {
                const pct = b.revenue > 0 ? (b.commissionAmount / b.revenue) * 100 : 0;
                const barWidth = summary.commissionByBarber.length > 1
                  ? (b.commissionAmount / Math.max(...summary.commissionByBarber.map(x => x.commissionAmount || 0.01))) * 100
                  : 100;
                return (
                  <div key={b.barberName} className="space-y-1.5">
                    {/* Linha 1: nome + valor de comissão */}
                    <div className="flex items-start justify-between gap-2 text-sm">
                      <span className="font-semibold leading-tight">{b.barberName}</span>
                      <span className="font-bold text-amber-400 shrink-0 whitespace-nowrap">
                        {formatCurrency(b.commissionAmount)}
                      </span>
                    </div>
                    {/* Linha 2: badges + receita */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{b.appointmentCount} atend.</span>
                      {b.commissionRate > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 font-medium">
                          {b.commissionRate}%
                        </span>
                      )}
                      <span>receita {formatCurrency(b.revenue)}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: b.commissionRate > 0
                            ? "hsl(38 88% 55%)"
                            : "hsl(0 0% 35%)",
                        }}
                      />
                    </div>
                    {b.commissionRate === 0 && (
                      <p className="text-[0.7rem] text-muted-foreground">
                        Sem taxa de comissão cadastrada — configure em Barbeiros
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
