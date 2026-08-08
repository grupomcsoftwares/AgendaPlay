import React, { useState } from "react";
import { useGetFinancialSummary, getGetFinancialSummaryQueryKey } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DollarSign, TrendingUp, Scissors, Calendar as CalendarIcon, UserCheck, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { format, startOfDay, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

export default function Financial() {
  const today = new Date();
  const [dateStart, setDateStart] = useState<Date>(startOfMonth(today));
  const [dateEnd, setDateEnd] = useState<Date>(startOfDay(today));
  const [periodOpen, setPeriodOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<Date>(startOfMonth(today));
  const [pendingEnd, setPendingEnd] = useState<Date>(startOfDay(today));

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
    const end = startOfDay(new Date());
    const start = startOfDay(new Date());
    start.setDate(start.getDate() - days);
    setDateStart(start);
    setDateEnd(end);
  };

  const isQuickPeriodActive = (days: number) => {
    const end = startOfDay(new Date());
    const start = startOfDay(new Date());
    start.setDate(start.getDate() - days);
    return dateStartStr === format(start, "yyyy-MM-dd") && dateEndStr === format(end, "yyyy-MM-dd");
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from) return;
    setPendingStart(range.from);
    setPendingEnd(range.to ?? range.from);
  };

  return (
    <div className="flex-1 p-4 md:p-8 bg-background overflow-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Acompanhe o faturamento do seu negócio.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="flex items-center rounded-lg border border-border/80 bg-card/60 p-1">
            <Button
              variant={isQuickPeriodActive(0) ? "default" : "ghost"}
              size="sm"
              className={isQuickPeriodActive(0) ? "shadow-sm" : "text-muted-foreground"}
              onClick={() => handleQuickPeriod(0)}
            >
              Hoje
            </Button>
            <Button
              variant={isQuickPeriodActive(0) ? "ghost" : "default"}
              size="sm"
              className={isQuickPeriodActive(0) ? "text-muted-foreground" : "shadow-sm"}
              onClick={handleOpenPeriod}
            >
              <CalendarIcon className="mr-1.5 h-4 w-4" />
              Personalizado
            </Button>
          </div>
        </div>
      </div>

      {/* Period picker dialog */}
      <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-[460px] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border-border/70 bg-background p-0 gap-0 shadow-2xl sm:max-h-[min(720px,calc(100dvh-3rem))]">
          <DialogHeader className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-5 pb-4 pt-5 backdrop-blur sm:px-6 sm:pt-6">
            <DialogTitle className="pr-8 text-left text-xl font-semibold tracking-tight sm:text-2xl">
              Escolha o período do relatório
            </DialogTitle>
            <p className="pt-1 text-left text-sm text-muted-foreground">
              Selecione uma data ou um intervalo para consultar.
            </p>
          </DialogHeader>
          <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <div className="rounded-xl border border-primary/35 bg-primary/5 px-3 py-2.5">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Início</span>
                <span className="mt-0.5 block text-base font-semibold">{format(pendingStart, "dd/MM/yyyy")}</span>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Término</span>
                <span className="mt-0.5 block text-base font-semibold">{format(pendingEnd, "dd/MM/yyyy")}</span>
              </div>
            </div>
            <div className="flex justify-center overflow-hidden rounded-xl border border-border/70 bg-card/40 px-1 py-1 sm:px-2">
              <Calendar
                mode="range"
                locale={ptBR}
                numberOfMonths={1}
                selected={{ from: pendingStart, to: pendingEnd }}
                onSelect={handleRangeSelect}
                className="w-full justify-center [--cell-size:2.25rem] sm:[--cell-size:2.5rem]"
              />
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
            <Button variant="ghost" className="h-10 px-4" onClick={() => setPeriodOpen(false)}>
              Cancelar
            </Button>
            <Button className="h-10 min-w-20 px-5" onClick={handleConfirmPeriod}>
              Aplicar
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
                      <span className="text-emerald-400">
                        barbearia {b.shopShareRate}% {formatCurrency(b.shopShareAmount)}
                      </span>
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
