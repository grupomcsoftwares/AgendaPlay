import React, { useState } from "react";
import { useGetFinancialSummary, getGetFinancialSummaryQueryKey } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Scissors, Calendar as CalendarIcon, UserCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Financial() {
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const currentDay = new Date().getDate();

  const [month, setMonth] = useState(currentMonth.toString());
  const [year, setYear] = useState(currentYear.toString());
  const [day, setDay] = useState(currentDay.toString());
  const [calOpen, setCalOpen] = useState(false);

  const params = {
    month: parseInt(month),
    year: parseInt(year),
    ...(day !== "all" ? { day: parseInt(day) } : {}),
  };

  const { data: summary, isLoading } = useGetFinancialSummary(
    params,
    { query: { queryKey: getGetFinancialSummaryQueryKey(params) } }
  );

  // Month-level summary (no day filter) to highlight days that have revenue in the calendar.
  const monthParams = { month: parseInt(month), year: parseInt(year) };
  const { data: monthSummary } = useGetFinancialSummary(
    monthParams,
    { query: { queryKey: getGetFinancialSummaryQueryKey(monthParams) } }
  );
  const daysWithData = new Set(
    (monthSummary?.revenueByDay ?? []).map((d) => parseInt(d.date.split("-")[2])),
  );

  const displayMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
  const selectedDate =
    day !== "all" ? new Date(parseInt(year), parseInt(month) - 1, parseInt(day)) : undefined;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="flex-1 p-4 md:p-8 bg-background overflow-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Acompanhe o faturamento do seu negócio.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="justify-start gap-2 font-normal min-w-[180px]"
              >
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                {selectedDate
                  ? format(selectedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })
                  : "Todos os dias"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                locale={ptBR}
                month={displayMonth}
                onMonthChange={(d) => {
                  setMonth((d.getMonth() + 1).toString());
                  setYear(d.getFullYear().toString());
                }}
                selected={selectedDate}
                onSelect={(d) => {
                  if (!d) return;
                  setMonth((d.getMonth() + 1).toString());
                  setYear(d.getFullYear().toString());
                  setDay(d.getDate().toString());
                  setCalOpen(false);
                }}
                modifiers={{
                  hasData: (date) =>
                    date.getMonth() === parseInt(month) - 1 &&
                    date.getFullYear() === parseInt(year) &&
                    daysWithData.has(date.getDate()),
                }}
                modifiersClassNames={{
                  hasData: "bg-primary/20 text-primary font-semibold",
                }}
              />
              <div className="border-t border-border p-2">
                <Button
                  variant="ghost"
                  className="w-full justify-center"
                  onClick={() => {
                    setDay("all");
                    setCalOpen(false);
                  }}
                >
                  Todos os dias
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

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
              <div className="flex h-full items-center justify-center text-muted-foreground">Sem dados para este mês</div>
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
              <div className="flex h-full items-center justify-center text-muted-foreground">Sem dados para este mês</div>
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
          {summary?.commissionByBarber && summary.commissionByBarber.length > 0 && (
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
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{b.barberName}</span>
                        <span className="text-xs text-muted-foreground">
                          {b.appointmentCount} atend.
                        </span>
                        {b.commissionRate > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 font-medium">
                            {b.commissionRate}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-right shrink-0">
                        <span className="text-xs text-muted-foreground">
                          receita {formatCurrency(b.revenue)}
                        </span>
                        <span className="font-bold text-amber-400 min-w-[80px] text-right">
                          {formatCurrency(b.commissionAmount)}
                        </span>
                      </div>
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
