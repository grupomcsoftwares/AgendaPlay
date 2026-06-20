import React, { useState, useEffect, useMemo } from "react";
import { playNewAppointment, playRescheduled } from "@/lib/sounds";
import {
  useListAppointments,
  useCreateAppointment,
  useUpdateAppointment,
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
  type Appointment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Plus, Check, Play, X, Trash2, Pencil, List } from "lucide-react";
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
import { useAuth } from "@/context/AuthContext";

const INITIAL_FORM = { clientId: "new", clientName: "", serviceIds: [] as string[], time: "" };
const INITIAL_EDIT = { date: new Date(), time: "" };

export default function Appointments() {
  const { user: _user } = useAuth();
  const [view, setView] = useState<"day" | "all">("day");
  const [date, setDate] = useState<Date>(new Date());
  const dateStr = format(date, "yyyy-MM-dd");

  // Day view — polls every 5s for live updates
  const { data: dayAppointments, isLoading: dayLoading } = useListAppointments(
    { date: dateStr },
    {
      query: {
        queryKey: getListAppointmentsQueryKey({ date: dateStr }),
        refetchInterval: 5000,
        refetchOnWindowFocus: true,
      },
    },
  );

  // All view — all appointments for this account
  const { data: allAppointments, isLoading: allLoading } = useListAppointments(
    {},
    {
      query: {
        queryKey: getListAppointmentsQueryKey({}),
        refetchInterval: 10000,
        refetchOnWindowFocus: true,
        enabled: view === "all",
      },
    },
  );

  const appointments = view === "day" ? dayAppointments : allAppointments;
  const isLoading = view === "day" ? dayLoading : allLoading;
  const { data: services } = useListServices(undefined, { query: { queryKey: getListServicesQueryKey() } });
  const { data: clients } = useListClients({}, { query: { queryKey: getListClientsQueryKey({}) } });

  const createAppointment = useCreateAppointment();
  const updateAppointment = useUpdateAppointment();
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

  // Edit appointment state
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [editTime, setEditTime] = useState("");
  const editDateStr = format(editDate, "yyyy-MM-dd");
  const editServiceId = editTarget?.serviceId ?? 0;
  const editServiceDuration = editTarget?.serviceDuration ?? 0;
  // If the appointment has a serviceId, use it; otherwise use its stored duration
  const editAvailabilityParams = editServiceId > 0
    ? { date: editDateStr, serviceId: editServiceId }
    : { date: editDateStr, serviceDuration: editServiceDuration };
  const { data: editAvailability, isFetching: editLoadingSlots } = useGetAvailability(
    editAvailabilityParams,
    {
      query: {
        queryKey: getGetAvailabilityQueryKey(editAvailabilityParams),
        enabled: !!editTarget && (editServiceId > 0 || editServiceDuration > 0),
      },
    },
  );

  const openEdit = (apt: Appointment) => {
    const d = new Date(apt.scheduledAt);
    setEditTarget(apt);
    setEditDate(d);
    setEditTime(format(d, "HH:mm"));
  };

  const handleEdit = () => {
    if (!editTarget || !editTime) return;
    const scheduledAt = new Date(`${editDateStr}T${editTime}:00-03:00`).toISOString();
    // Old date to invalidate its availability cache so the old slot frees up
    const oldDate = new Date(editTarget.scheduledAt).toISOString().split("T")[0];
    const serviceId = editTarget.serviceId ?? 0;
    updateAppointment.mutate(
      { id: editTarget.id, data: { scheduledAt } },
      {
        onSuccess: () => {
          invalidateAll();
          // Explicitly invalidate old date availability so old slot shows free
          if (oldDate && oldDate !== editDateStr) {
            queryClient.invalidateQueries({ queryKey: getGetAvailabilityQueryKey({ date: oldDate, serviceId }) });
          }
          queryClient.invalidateQueries({ queryKey: getGetAvailabilityQueryKey({ date: editDateStr, serviceId }) });
          setEditTarget(null);
          toast({ title: "Horário atualizado" });
          playRescheduled();
        },
        onError: (err) => {
          const apiErr = err as ApiError<{ error?: string }>;
          toast({ variant: "destructive", title: "Não foi possível alterar", description: apiErr?.data?.error ?? "Tente novamente." });
        },
      }
    );
  };

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

  // Refresh every surface that depends on appointment data.
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey({ date: dateStr }) });
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey({ date: formDateStr }) });
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey({}) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["/api/availability"], exact: false });
  };
  const invalidate = invalidateAll;

  const selectedServices = useMemo(
    () => (services ?? []).filter((s) => formData.serviceIds.includes(s.id.toString())),
    [services, formData.serviceIds],
  );

  const combinedName = selectedServices.map((s) => s.name).join(" + ");
  const combinedPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const combinedDuration = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);

  const availabilityServiceId = selectedServices.length === 1 ? (selectedServices[0]?.id ?? 0) : 0;
  const availabilityDuration = selectedServices.length > 1 ? combinedDuration : undefined;
  const availabilityEnabled = isCreateOpen && selectedServices.length > 0;

  const availabilityParams = selectedServices.length === 1
    ? { date: formDateStr, serviceId: availabilityServiceId }
    : { date: formDateStr, serviceDuration: combinedDuration };

  const { data: availability, isFetching: loadingSlots } = useGetAvailability(
    availabilityParams,
    {
      query: {
        queryKey: getGetAvailabilityQueryKey(availabilityParams),
        enabled: availabilityEnabled,
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
    if (selectedServices.length === 0 || !formData.time) return;

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
        serviceId: selectedServices.length === 1 ? selectedServices[0]!.id : undefined,
        serviceName: combinedName,
        servicePrice: combinedPrice,
        serviceDuration: combinedDuration,
        scheduledAt,
      }},
      {
        onSuccess: () => {
          invalidate();
          setIsCreateOpen(false);
          toast({ title: "Agendamento criado" });
          playNewAppointment();
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

  const getPaymentBadge = (method: string) => {
    if (method === 'now') {
      return <Badge variant="outline" className="text-violet-400 border-violet-400/20 bg-violet-400/10 gap-1"><span>Pix</span><span className="text-[10px] opacity-70">online</span></Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground border-border gap-1">Na barbearia</Badge>;
  };

  return (
    <div className="flex-1 p-4 md:p-8 bg-background overflow-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Agendamentos</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Gerencie a agenda do dia.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button
              type="button"
              onClick={() => setView("day")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                view === "day" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" /> Por dia
            </button>
            <button
              type="button"
              onClick={() => setView("all")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                view === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" /> Todos
            </button>
          </div>

          {view === "day" && (
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
          )}

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
                  <div className="flex items-center justify-between">
                    <Label>Serviço</Label>
                    {selectedServices.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {combinedDuration} min · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(combinedPrice)}
                      </span>
                    )}
                  </div>
                  <div className="rounded-md border border-border overflow-hidden" data-testid="service-checklist">
                    {(services ?? []).map((s) => {
                      const checked = formData.serviceIds.includes(s.id.toString());
                      return (
                        <label
                          key={s.id}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors select-none",
                            checked ? "bg-amber-500/10" : "hover:bg-muted/50",
                            "border-b border-border last:border-b-0"
                          )}
                          data-testid={`service-option-${s.id}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? formData.serviceIds.filter((id) => id !== s.id.toString())
                                : [...formData.serviceIds, s.id.toString()];
                              setFormData({ ...formData, serviceIds: next, time: "" });
                            }}
                            className="accent-amber-500 w-4 h-4 flex-shrink-0"
                          />
                          <span className="flex-1 text-sm font-medium">{s.name}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {s.durationMinutes} min · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(String(s.price)))}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Horário disponível</Label>
                  {selectedServices.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3">
                      Escolha ao menos um serviço para ver os horários livres.
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
                    formData.serviceIds.length === 0 ||
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

      <div className="border border-border rounded-lg bg-card overflow-x-auto">
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
            <p className="text-muted-foreground">
              {view === "day" ? "Não há horários marcados para esta data." : "Nenhum agendamento encontrado."}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {view === "all" && <TableHead>Data</TableHead>}
                <TableHead>Horário</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Profissional</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...(appointments)].sort((a,b) =>
                view === "all"
                  ? new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
                  : new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
              ).map((apt) => (
                <TableRow key={apt.id} data-testid={`row-appointment-${apt.id}`}>
                  {view === "all" && (
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(apt.scheduledAt), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                  )}
                  <TableCell className="font-bold text-lg">
                    {format(new Date(apt.scheduledAt), "HH:mm")}
                  </TableCell>
                  <TableCell className="font-medium">{apt.clientName}</TableCell>
                  <TableCell>{apt.serviceName}</TableCell>
                  <TableCell className="font-medium text-emerald-400 whitespace-nowrap">
                    {apt.servicePrice != null
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(String(apt.servicePrice)))
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{apt.barberName ?? "—"}</TableCell>
                  <TableCell>{getPaymentBadge(apt.paymentMethod ?? "on_site")}</TableCell>
                  <TableCell>{getStatusBadge(apt.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {(apt.status === 'pending' || apt.status === 'cancelled') && (
                        <Button variant="ghost" size="icon" title="Editar horário" className="text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10" onClick={() => openEdit(apt)} data-testid={`button-edit-${apt.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
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

      {/* Edit appointment dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar Agendamento · {editTarget?.clientName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2 min-w-0">
              <Label>Nova Data</Label>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 min-w-0">
                {dayOptions.map((d) => {
                  const selected = sameDay(d, editDate);
                  const today = sameDay(d, new Date());
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => { setEditDate(d); setEditTime(""); }}
                      className={cn(
                        "flex shrink-0 w-[64px] flex-col items-center rounded-lg border py-2 transition-colors",
                        selected ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-muted-foreground/40",
                      )}
                    >
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                        {format(d, "EEE", { locale: ptBR }).replace(".", "")}
                      </span>
                      <span className={cn("text-[10px] font-bold uppercase leading-tight", today ? "text-amber-500" : "text-transparent")}>
                        Hoje
                      </span>
                      <span className="text-xl font-bold leading-none text-foreground">{format(d, "d")}</span>
                      <span className="mt-1 text-[10px] font-semibold uppercase text-muted-foreground">
                        {format(d, "MMM", { locale: ptBR }).replace(".", "")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Novo Horário</Label>
              {editAvailability?.dayClosed ? (
                <p className="text-sm text-muted-foreground py-3">Fechado neste dia. Escolha outra data.</p>
              ) : editLoadingSlots && !editAvailability ? (
                <p className="text-sm text-muted-foreground py-3">Carregando horários…</p>
              ) : editAvailability && editAvailability.slots.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">Nenhum horário disponível neste dia.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1">
                  {(editAvailability?.slots ?? []).map(({ time: value, available }) => {
                    const isSelected = editTime === value;
                    const isCurrent = editTarget ? format(new Date(editTarget.scheduledAt), "HH:mm") === value && sameDay(editDate, new Date(editTarget.scheduledAt)) : false;
                    const isAvail = available || isCurrent;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!isAvail}
                        onClick={() => isAvail && setEditTime(value)}
                        className="rounded-md py-2 text-sm font-mono font-semibold border transition-colors"
                        style={{
                          borderColor: isSelected ? "hsl(var(--primary))" : isCurrent ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))",
                          backgroundColor: isSelected ? "hsl(var(--primary) / 0.15)" : "transparent",
                          color: isAvail ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                          cursor: isAvail ? "pointer" : "not-allowed",
                          textDecoration: isAvail ? "none" : "line-through",
                          opacity: isAvail ? 1 : 0.45,
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
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button
              onClick={handleEdit}
              disabled={!editTime || updateAppointment.isPending}
              data-testid="button-confirm-edit"
            >
              {updateAppointment.isPending ? "Salvando…" : "Salvar alteração"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
