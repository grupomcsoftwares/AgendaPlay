import React, { useState, useEffect, useMemo } from "react";
import {
  useListAppointments,
  useCreateAppointment,
  useDeleteAppointment,
  useStartAppointment,
  useCompleteAppointment,
  useCancelAppointment,
  getListAppointmentsQueryKey,
  useListServices,
  getListServicesQueryKey,
  useListClients,
  getListClientsQueryKey,
  useGetAvailability,
  getGetAvailabilityQueryKey,
  getGetDashboardSummaryQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Plus, Check, Play, X, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const INITIAL_FORM = { clientId: "new", clientName: "", serviceId: "", time: "" };

export default function Appointments() {
  const [date, setDate] = useState<Date>(new Date());
  const dateStr = format(date, "yyyy-MM-dd");

  const { data: appointments, isLoading } = useListAppointments(
    { date: dateStr },
    {
      query: {
        queryKey: getListAppointmentsQueryKey({ date: dateStr }),
        // Poll every 5s so bookings made on the public page, cancellations via
        // link, and queue auto-start/auto-complete appear without manual refresh.
        refetchInterval: 5000,
        refetchOnWindowFocus: true,
      },
    },
  );
  const { data: services } = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  const { data: clients } = useListClients({}, { query: { queryKey: getListClientsQueryKey({}) } });

  const createAppointment = useCreateAppointment();
  const deleteAppointment = useDeleteAppointment();
  const startAppointment = useStartAppointment();
  const completeAppointment = useCompleteAppointment();
  const cancelAppointment = useCancelAppointment();

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  // The booking modal can target a different day than the one shown in the list.
  const [formDate, setFormDate] = useState<Date>(new Date());
  const formDateStr = format(formDate, "yyyy-MM-dd");

  // Horizontal day strip shown in the booking modal: the next two weeks starting today.
  const dayOptions = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, []);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const [cancelTarget, setCancelTarget] = useState<{ id: number; clientName: string } | null>(null);

  // Refresh every surface that depends on appointment data so the public booking
  // page, the dashboard widgets, and the day list all stay in sync.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey({ date: dateStr }) });
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey({ date: formDateStr }) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["/api/availability"], exact: false });
  };

  const selectedService = useMemo(
    () => services?.find((s) => s.id.toString() === formData.serviceId),
    [services, formData.serviceId],
  );

  const availabilityServiceId = selectedService?.id ?? 0;
  const { data: availability, isFetching: loadingSlots } = useGetAvailability(
    { date: formDateStr, serviceId: availabilityServiceId },
    {
      query: {
        queryKey: getGetAvailabilityQueryKey({ date: formDateStr, serviceId: availabilityServiceId }),
        enabled: isCreateOpen && availabilityServiceId > 0,
      },
    },
  );

  // Clear the selected time if it becomes unavailable (e.g. after a refresh
  // shows a concurrent booking on the same slot).
  useEffect(() => {
    if (!formData.time || !availability) return;
    const slot = availability.slots.find((s) => s.time === formData.time);
    if (!slot || !slot.available) {
      setFormData((prev) => ({ ...prev, time: "" }));
    }
  }, [availability, formData.time]);

  // Reset form whenever the dialog closes, and default the booking day to the
  // currently viewed day whenever it opens.
  useEffect(() => {
    if (!isCreateOpen) {
      setFormData(INITIAL_FORM);
    } else {
      setFormDate(date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreateOpen]);

  const handleCreate = () => {
    if (!selectedService || !formData.time) return;

    let cName = formData.clientName;
    if (formData.clientId !== "new") {
      const client = clients?.find((c) => c.id.toString() === formData.clientId);
      if (client) cName = client.name;
    }

    // Fixed America/Sao_Paulo offset (UTC-3) — matches the server's TZ assumption
    // and mirrors the public booking page so admin and public bookings line up.
    const scheduledAt = new Date(`${formDateStr}T${formData.time}:00-03:00`).toISOString();

    createAppointment.mutate(
      { data: {
        clientId: formData.clientId !== "new" ? parseInt(formData.clientId) : undefined,
        clientName: cName,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        servicePrice: selectedService.price,
        serviceDuration: selectedService.durationMinutes,
        scheduledAt,
      }},
      {
        onSuccess: () => {
          invalidate();
          setIsCreateOpen(false);
          toast({ title: "Agendamento criado" });
        },
        onError: (err) => {
          const apiErr = err as ApiError<{ error?: string }>;
          if (apiErr?.status === 409) {
            // Refresh slots — a concurrent booking probably grabbed this time.
            queryClient.invalidateQueries({
              queryKey: getGetAvailabilityQueryKey({ date: formDateStr, serviceId: availabilityServiceId }),
            });
            toast({
              variant: "destructive",
              title: "Horário indisponível",
              description: apiErr.data?.error ?? "Esse horário acabou de ser reservado. Escolha outro.",
            });
            setFormData((prev) => ({ ...prev, time: "" }));
            return;
          }
          toast({
            variant: "destructive",
            title: "Não foi possível agendar",
            description: apiErr?.data?.error ?? "Tente novamente.",
          });
        },
      }
    );
  };

  const confirmCancel = () => {
    if (!cancelTarget) return;
    cancelAppointment.mutate(
      { id: cancelTarget.id },
      {
        onSuccess: () => {
          invalidate();
          setCancelTarget(null);
          toast({ title: "Agendamento cancelado" });
        },
        onError: (err) => {
          const apiErr = err as ApiError<{ error?: string }>;
          toast({
            variant: "destructive",
            title: "Não foi possível cancelar",
            description: apiErr?.data?.error ?? "Tente novamente.",
          });
        },
      },
    );
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'pending': return <Badge variant="outline" className="text-yellow-500 border-yellow-500/20 bg-yellow-500/10">Pendente</Badge>;
      case 'in_progress': return <Badge variant="outline" className="text-teal-500 border-teal-500/20 bg-teal-500/10">Em Andamento</Badge>;
      case 'completed': return <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/10">Concluído</Badge>;
      case 'cancelled': return <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/10">Cancelado</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 p-8 bg-background overflow-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agendamentos</h1>
          <p className="text-muted-foreground mt-1">Gerencie a agenda do dia.</p>
        </div>

        <div className="flex items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 border-border" data-testid="button-pick-date">
                <CalendarIcon className="h-4 w-4" />
                {format(date, "dd 'de' MMMM, yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} />
            </PopoverContent>
          </Popover>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-new-appointment">
                <Plus className="h-4 w-4" /> Novo Agendamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Agendar Horário · {format(formDate, "dd/MM/yyyy", { locale: ptBR })}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4 min-w-0">
                <div className="space-y-2 min-w-0">
                  <Label>Data</Label>
                  <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 min-w-0">
                    {dayOptions.map((d) => {
                      const selected = sameDay(d, formDate);
                      const today = sameDay(d, new Date());
                      return (
                        <button
                          key={d.toISOString()}
                          type="button"
                          onClick={() => {
                            setFormDate(d);
                            setFormData((prev) => ({ ...prev, time: "" }));
                          }}
                          data-testid={`button-day-${format(d, "yyyy-MM-dd")}`}
                          className={cn(
                            "flex shrink-0 w-[64px] flex-col items-center rounded-lg border py-2 transition-colors",
                            selected
                              ? "border-amber-500 bg-amber-500/10"
                              : "border-border hover:border-muted-foreground/40",
                          )}
                        >
                          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                            {format(d, "EEE", { locale: ptBR }).replace(".", "")}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase leading-tight",
                              today ? "text-amber-500" : "text-transparent",
                            )}
                          >
                            Hoje
                          </span>
                          <span className="text-xl font-bold leading-none text-foreground">
                            {format(d, "d")}
                          </span>
                          <span className="mt-1 text-[10px] font-semibold uppercase text-muted-foreground">
                            {format(d, "MMM", { locale: ptBR }).replace(".", "")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={formData.clientId} onValueChange={v => setFormData({...formData, clientId: v, clientName: v === "new" ? formData.clientName : ""})}>
                    <SelectTrigger data-testid="select-client">
                      <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">+ Novo Cliente (Sem cadastro)</SelectItem>
                      {clients?.map(c => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.clientId === "new" && (
                  <div className="space-y-2">
                    <Label>Nome do Cliente</Label>
                    <Input
                      value={formData.clientName}
                      onChange={e => setFormData({...formData, clientName: e.target.value})}
                      data-testid="input-client-name"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Serviço</Label>
                  <Select value={formData.serviceId} onValueChange={v => setFormData({...formData, serviceId: v, time: ""})}>
                    <SelectTrigger data-testid="select-service">
                      <SelectValue placeholder="Selecione um serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      {services?.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.name} · {s.durationMinutes} min
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Horário disponível</Label>
                  {!selectedService ? (
                    <p className="text-sm text-muted-foreground py-3">
                      Escolha um serviço para ver os horários livres.
                    </p>
                  ) : availability?.dayClosed ? (
                    <p className="text-sm text-muted-foreground py-3">
                      Fechado neste dia. Escolha outra data.
                    </p>
                  ) : loadingSlots && !availability ? (
                    <p className="text-sm text-muted-foreground py-3">Carregando horários…</p>
                  ) : availability && availability.slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3">
                      Nenhum horário disponível neste dia.
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1">
                      {(availability?.slots ?? []).map(({ time: value, available }) => {
                        const isSelected = formData.time === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            disabled={!available}
                            onClick={() => available && setFormData({ ...formData, time: value })}
                            data-testid={`button-slot-${value}`}
                            className="rounded-md py-2 text-sm font-mono font-semibold border transition-colors"
                            style={{
                              borderColor: isSelected ? "hsl(var(--primary))" : "hsl(var(--border))",
                              backgroundColor: isSelected ? "hsl(var(--primary) / 0.15)" : "transparent",
                              color: available ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                              cursor: available ? "pointer" : "not-allowed",
                              textDecoration: available ? "none" : "line-through",
                              opacity: available ? 1 : 0.45,
                            }}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                <Button
                  onClick={handleCreate}
                  data-testid="button-confirm-create"
                  disabled={
                    (!formData.clientName && formData.clientId === "new") ||
                    !formData.serviceId ||
                    !formData.time ||
                    createAppointment.isPending
                  }
                >
                  {createAppointment.isPending ? "Salvando…" : "Confirmar Agendamento"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border border-border rounded-lg bg-card">
        {isLoading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !appointments || appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <CalendarIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">Nenhum agendamento</h3>
            <p className="text-muted-foreground">Não há horários marcados para esta data.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Horário</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Profissional</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.sort((a,b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()).map((apt) => (
                <TableRow key={apt.id} data-testid={`row-appointment-${apt.id}`}>
                  <TableCell className="font-bold text-lg">
                    {format(new Date(apt.scheduledAt), "HH:mm")}
                  </TableCell>
                  <TableCell className="font-medium">{apt.clientName}</TableCell>
                  <TableCell>{apt.serviceName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{apt.barberName ?? "—"}</TableCell>
                  <TableCell>{getStatusBadge(apt.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {apt.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="icon" title="Iniciar" className="text-teal-500 hover:text-teal-400 hover:bg-teal-500/10" onClick={() => startAppointment.mutate({id: apt.id}, { onSuccess: invalidate })} data-testid={`button-start-${apt.id}`}>
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Cancelar" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setCancelTarget({ id: apt.id, clientName: apt.clientName })} data-testid={`button-cancel-${apt.id}`}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {apt.status === 'in_progress' && (
                        <Button variant="ghost" size="icon" title="Concluir" className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => completeAppointment.mutate({id: apt.id}, { onSuccess: invalidate })} data-testid={`button-complete-${apt.id}`}>
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => {
                        if (confirm("Deletar este registro?")) deleteAppointment.mutate({id: apt.id}, { onSuccess: invalidate });
                      }} data-testid={`button-delete-${apt.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar agendamento?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Tem certeza que deseja cancelar o agendamento de <strong className="text-foreground">{cancelTarget?.clientName}</strong>? O horário voltará a ficar disponível na página pública.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Manter</Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={cancelAppointment.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelAppointment.isPending ? "Cancelando…" : "Sim, cancelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
