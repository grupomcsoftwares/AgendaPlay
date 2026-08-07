import React, { useState, useEffect, useMemo, useRef } from "react";
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
  useListBarbers,
  getListBarbersQueryKey,
  useGetAvailability,
  getGetAvailabilityQueryKey,
  getGetDashboardSummaryQueryKey,
  useGetSettings,
  getGetSettingsQueryKey,
  useListComboDiscounts,
  getListComboDiscountsQueryKey,
  ApiError,
  type Appointment,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Plus, Check, Play, X, Trash2, Pencil, Printer, MessageCircle, MessageSquare, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

type SubscriberMonthlyUsage = {
  id: number;
  clientName: string;
  clientPhone: string;
  planName: string | null;
  maxAppointmentsPerMonth: number | null;
  cutsUsedThisMonth: number;
};

const INITIAL_FORM = { clientId: "new", clientName: "", clientLastName: "", clientPhone: "", serviceIds: [] as string[], time: "", barberId: "" };
const INITIAL_EDIT = { date: new Date(), time: "" };

export default function Appointments() {
  const { user: _user } = useAuth();
  // Date range for appointments list
  const [dateStart, setDateStart] = useState<Date>(new Date());
  const [dateEnd, setDateEnd] = useState<Date>(new Date());
  const dateStartStr = format(dateStart, "yyyy-MM-dd");
  const dateEndStr = format(dateEnd, "yyyy-MM-dd");
  const [dayPickerOpen, setDayPickerOpen] = useState(false);

  const rangeParams = { dateStart: dateStartStr, dateEnd: dateEndStr };

  const { data: appointments, isLoading } = useListAppointments(
    rangeParams,
    {
      query: {
        queryKey: getListAppointmentsQueryKey(rangeParams),
        refetchInterval: 5000,
        refetchOnWindowFocus: true,
      },
    },
  );

  const { data: services } = useListServices(undefined, { query: { queryKey: getListServicesQueryKey() } });
  const { data: clients } = useListClients({}, { query: { queryKey: getListClientsQueryKey({}) } });
  const { data: barbers } = useListBarbers(undefined, { query: { queryKey: getListBarbersQueryKey() } });
  const { data: settings } = useGetSettings(undefined, { query: { queryKey: getGetSettingsQueryKey() } });
  const { data: comboDiscounts } = useListComboDiscounts(undefined, { query: { queryKey: getListComboDiscountsQueryKey() } });

  // Subscriber monthly cut usage — used to warn barber when a client is at their limit
  const { data: subscriberUsage } = useQuery<SubscriberMonthlyUsage[]>({
    queryKey: ["subscriptions-monthly-usage"],
    queryFn: async () => {
      const res = await fetch("/api/subscriptions/monthly-usage", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });

  // Subscribers that have reached or exceeded their monthly cut limit
  const subscribersAtLimit = (subscriberUsage ?? []).filter(
    s => s.maxAppointmentsPerMonth != null && s.cutsUsedThisMonth >= s.maxAppointmentsPerMonth,
  );

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

  // Client search state
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const clientSearchRef = useRef<HTMLInputElement>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim() || !clients) return clients ?? [];
    const q = clientSearch.trim().toLowerCase();
    return clients.filter(c => c.name.toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const selectedClient = useMemo(() => {
    if (formData.clientId === "new") return null;
    return clients?.find(c => c.id.toString() === formData.clientId) ?? null;
  }, [clients, formData.clientId]);
  // The booking modal can target a different day than the one shown in the list.
  const [formDate, setFormDate] = useState<Date>(new Date());
  const formDateStr = format(formDate, "yyyy-MM-dd");

  // Edit appointment state
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [editTime, setEditTime] = useState("");
  const [notifyTarget, setNotifyTarget] = useState<{ id: number; clientName: string; clientId: number | null; scheduledAt: string; serviceName: string } | null>(null);
  const [editServiceIdsState, setEditServiceIdsState] = useState<string[]>([]);
  const [receiptApt, setReceiptApt] = useState<Appointment | null>(null);
  const editDateStr = format(editDate, "yyyy-MM-dd");

  const editSelectedServices = useMemo(
    () => (services ?? []).filter((s) => editServiceIdsState.includes(s.id.toString())),
    [services, editServiceIdsState],
  );

  // Service exclusion pairs — same logic as the public booking page.
  type EditServiceExclusion = { services: [number, number]; enabled: boolean };
  const editServiceExclusions = useMemo((): EditServiceExclusion[] => {
    if ((settings as any)?.serviceRestrictionsEnabled === false) return [];
    return ((settings?.serviceExclusions ?? []) as unknown[]).map((item): EditServiceExclusion => {
      if (Array.isArray(item)) return { services: [item[0], item[1]] as [number, number], enabled: true };
      return item as EditServiceExclusion;
    }).filter(e => e.enabled !== false);
  }, [settings]);
  const editCombinedName = editSelectedServices.map((s) => s.name).join(" + ");
  const editCombinedPriceRaw = editSelectedServices.reduce((sum, s) => sum + parseFloat(String(s.price)), 0);
  const editCombinedDurationRaw = editSelectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);

  const editBestCombo = useMemo(() => {
    if ((settings as any)?.combosEnabled === false) return null;
    if (!comboDiscounts || editSelectedServices.length < 2) return null;
    const selectedIds = editServiceIdsState;
    const matches = comboDiscounts.filter(c =>
      c.enabled !== false &&
      (c.serviceIds as number[]).length >= 2 &&
      (c.serviceIds as number[]).every(id => selectedIds.includes(id.toString()))
    );
    if (matches.length === 0) return null;
    return matches.sort((a, b) => {
      const va = a.discountType === "value" ? Number(a.discountPercent) : (editCombinedPriceRaw * Number(a.discountPercent)) / 100;
      const vb = b.discountType === "value" ? Number(b.discountPercent) : (editCombinedPriceRaw * Number(b.discountPercent)) / 100;
      return vb - va;
    })[0];
  }, [comboDiscounts, editServiceIdsState, editSelectedServices.length, editCombinedPriceRaw, settings]);

  const editComboServicesPrice = editBestCombo
    ? editSelectedServices.filter(s => (editBestCombo.serviceIds as number[]).includes(s.id)).reduce((acc, s) => acc + parseFloat(String(s.price)), 0)
    : 0;
  const editComboDiscountAmount = editBestCombo
    ? editBestCombo.discountType === "value"
      ? Number(editBestCombo.discountPercent)
      : (editComboServicesPrice * Number(editBestCombo.discountPercent)) / 100
    : 0;
  const editComboTimeDiscount = editBestCombo?.timeDiscountMinutes ?? 0;
  const editCombinedPrice = Math.max(0, editCombinedPriceRaw - editComboDiscountAmount);
  const editCombinedDuration = Math.max(5, editCombinedDurationRaw - editComboTimeDiscount);

  const editAvailabilityParams = editSelectedServices.length === 1
    ? { date: editDateStr, serviceId: editSelectedServices[0]!.id }
    : editSelectedServices.length > 1
      ? { date: editDateStr, serviceDuration: editCombinedDuration }
      : { date: editDateStr, serviceDuration: editTarget?.serviceDuration ?? 0 };
  const { data: editAvailability, isFetching: editLoadingSlots } = useGetAvailability(
    editAvailabilityParams,
    {
      query: {
        queryKey: getGetAvailabilityQueryKey(editAvailabilityParams),
        enabled: !!editTarget && (editSelectedServices.length > 0 || (editTarget?.serviceDuration ?? 0) > 0),
      },
    },
  );

  const openEdit = (apt: Appointment) => {
    const d = new Date(apt.scheduledAt);
    setEditTarget(apt);
    setEditDate(d);
    setEditTime(format(d, "HH:mm"));
    setEditServiceIdsState(apt.serviceId ? [apt.serviceId.toString()] : []);
  };

  const handleEdit = () => {
    if (!editTarget || !editTime) return;
    const scheduledAt = new Date(`${editDateStr}T${editTime}:00-03:00`).toISOString();
    const oldDate = new Date(editTarget.scheduledAt).toISOString().split("T")[0];
    const serviceId = editTarget.serviceId ?? 0;
    const updateData: Parameters<typeof updateAppointment.mutate>[0]['data'] = { scheduledAt };
    if (editSelectedServices.length > 0) {
      const newServiceId = editSelectedServices.length === 1 ? editSelectedServices[0]!.id : null;
      const nameChanged = editCombinedName !== editTarget.serviceName;
      const idChanged = newServiceId !== editTarget.serviceId;
      if (nameChanged || idChanged) {
        updateData.serviceId = newServiceId;
        updateData.serviceName = editCombinedName;
        updateData.servicePrice = editCombinedPrice;
        updateData.serviceDuration = editCombinedDuration;
      }
    }
    updateAppointment.mutate(
      { id: editTarget.id, data: updateData },
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

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const maxBookingDays = Math.max(1, Number((settings as any)?.maxBookingDays ?? 30));
  const bookingWindowStart = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }, []);
  const bookingWindowEnd = useMemo(() => {
    const end = new Date(bookingWindowStart);
    end.setDate(end.getDate() + maxBookingDays - 1);
    return end;
  }, [bookingWindowStart, maxBookingDays]);

  // The agenda day strip follows the same booking window configured in
  // Settings, starting today and showing exactly that many days.
  const agendaDayOptions = useMemo(() => {
    return Array.from({ length: maxBookingDays }, (_, i) => {
      const d = new Date(bookingWindowStart);
      d.setDate(bookingWindowStart.getDate() + i);
      return d;
    });
  }, [bookingWindowStart, maxBookingDays]);
  // The create-appointment picker uses the same configured window as the
  // agenda strip and updates when settings finish loading.
  const dayOptions = agendaDayOptions;
  const selectAgendaDay = (day: Date) => {
    setDateStart(day);
    setDateEnd(day);
  };
  const [cancelTarget, setCancelTarget] = useState<{ id: number; clientName: string } | null>(null);

  // Refresh every surface that depends on appointment data.
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey(rangeParams) });
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
  const combinedPriceRaw = selectedServices.reduce((sum, s) => sum + parseFloat(String(s.price)), 0);
  const combinedDurationRaw = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);

  const bestCombo = useMemo(() => {
    if ((settings as any)?.combosEnabled === false) return null;
    if (!comboDiscounts || selectedServices.length < 2) return null;
    const selectedIds = formData.serviceIds;
    const matches = comboDiscounts.filter(c =>
      c.enabled !== false &&
      (c.serviceIds as number[]).length >= 2 &&
      (c.serviceIds as number[]).every(id => selectedIds.includes(id.toString()))
    );
    if (matches.length === 0) return null;
    return matches.sort((a, b) => {
      const va = a.discountType === "value" ? Number(a.discountPercent) : (combinedPriceRaw * Number(a.discountPercent)) / 100;
      const vb = b.discountType === "value" ? Number(b.discountPercent) : (combinedPriceRaw * Number(b.discountPercent)) / 100;
      return vb - va;
    })[0];
  }, [comboDiscounts, formData.serviceIds, selectedServices.length, combinedPriceRaw, settings]);

  const comboServicesPrice = bestCombo
    ? selectedServices.filter(s => (bestCombo.serviceIds as number[]).includes(s.id)).reduce((acc, s) => acc + parseFloat(String(s.price)), 0)
    : 0;
  const comboDiscountAmount = bestCombo
    ? bestCombo.discountType === "value"
      ? Number(bestCombo.discountPercent)
      : (comboServicesPrice * Number(bestCombo.discountPercent)) / 100
    : 0;
  const comboTimeDiscount = bestCombo?.timeDiscountMinutes ?? 0;
  const combinedPrice = Math.max(0, combinedPriceRaw - comboDiscountAmount);
  const combinedDuration = Math.max(5, combinedDurationRaw - comboTimeDiscount);

  const availabilityServiceId = selectedServices.length === 1 ? (selectedServices[0]?.id ?? 0) : 0;
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
      setFormDate(new Date());
      // Auto-select when there is exactly one barber
      if (barbers && barbers.length === 1) {
        setFormData((prev) => ({ ...prev, barberId: barbers[0]!.id.toString() }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreateOpen]);

  const handleCreate = () => {
    if (selectedServices.length === 0 || !formData.time) return;

    let cName = formData.clientName;
    if (formData.clientId !== "new") {
      const client = clients?.find((c) => c.id.toString() === formData.clientId);
      if (client) cName = client.name;
    } else {
      const last = formData.clientLastName.trim();
      if (last) cName = `${formData.clientName.trim()} ${last}`;
    }

    // Fixed America/Sao_Paulo offset (UTC-3) — matches the server's TZ assumption
    // and mirrors the public booking page so admin and public bookings line up.
    const scheduledAt = new Date(`${formDateStr}T${formData.time}:00-03:00`).toISOString();

    const selectedBarber = barbers?.find((b) => b.id.toString() === formData.barberId);

    createAppointment.mutate(
      { data: {
        clientId: formData.clientId !== "new" ? parseInt(formData.clientId) : undefined,
        clientName: cName,
        serviceId: selectedServices.length === 1 ? selectedServices[0]!.id : undefined,
        serviceName: combinedName,
        servicePrice: combinedPrice,
        serviceDuration: combinedDuration,
        scheduledAt,
        barberId: selectedBarber ? selectedBarber.id : undefined,
        barberName: selectedBarber ? selectedBarber.name : undefined,
        ...(formData.clientId === "new" && formData.clientPhone.trim()
          ? { notes: `Tel: ${formData.clientPhone.trim()}.` }
          : {}),
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

  /** Extrai o telefone guardado nas notes (formato "Tel: XXXXX.") */
  const extractPhoneFromNotes = (notes: string | null | undefined): string => {
    if (!notes) return "";
    const m = notes.match(/Tel:\s*([\d\s()\-+.]+)/);
    return m ? (m[1] ?? "").replace(/\D/g, "") : "";
  };

  const sendWhatsAppReminder = (apt: Appointment) => {
    // 1) Tenta pelo cadastro do cliente
    let client = apt.clientId ? clients?.find((c) => c.id === apt.clientId) : undefined;
    if (!client) {
      client = clients?.find((c) => c.name.trim().toLowerCase() === apt.clientName.trim().toLowerCase());
    }
    // 2) Fallback: extrai o telefone das notes (agendado por responsável)
    const phoneRaw = client?.phone?.replace(/\D/g, "") || extractPhoneFromNotes(apt.notes);
    if (!phoneRaw) {
      toast({ variant: "destructive", title: "Telefone não encontrado", description: "O cliente não possui telefone cadastrado." });
      return;
    }
    const date = format(new Date(apt.scheduledAt), "dd/MM/yyyy", { locale: ptBR });
    const time = format(new Date(apt.scheduledAt), "HH:mm");
    const msg = `Olá! Passando para lembrar do agendamento de *${apt.clientName}* na ${settings?.barbershopName || "barbearia"} para ${date} às ${time}. Serviço: ${apt.serviceName}. Até lá! ✨`;
    const url = `https://wa.me/55${phoneRaw}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
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

  const extractClientNote = (notes: string | null | undefined): string => {
    if (!notes) return "";
    return notes.replace(/^Tel:[^.]*\.\s*/, "").trim();
  };

  return (
    <div className="flex-1 p-4 md:p-8 bg-background overflow-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Agendamentos</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Gerencie a agenda de {format(dateStart, "dd 'de' MMMM", { locale: ptBR })}.
          </p>
        </div>

        <div className="flex items-center gap-2">
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

                <div className="space-y-2" ref={clientDropdownRef}>
                  <Label>Cliente</Label>
                  <div className="relative">
                    <input
                      ref={clientSearchRef}
                      type="text"
                      value={clientDropdownOpen ? clientSearch : (selectedClient?.name ?? (formData.clientId === "new" ? "+ Novo Cliente" : ""))}
                      onChange={e => {
                        setClientSearch(e.target.value);
                        setClientDropdownOpen(true);
                      }}
                      onFocus={() => {
                        setClientSearch("");
                        setClientDropdownOpen(true);
                      }}
                      placeholder="Buscar cliente..."
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      data-testid="select-client"
                    />
                    {/* Dropdown de clientes */}
                    {clientDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                        {/* Opção: Novo cliente */}
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, clientId: "new", clientName: "" });
                            setClientDropdownOpen(false);
                            setClientSearch("");
                          }}
                          className={cn(
                            "flex w-full items-center px-3 py-2 text-sm hover:bg-accent",
                            formData.clientId === "new" && "bg-primary/15 text-primary"
                          )}
                        >
                          <span className="font-medium">+ Novo Cliente (Sem cadastro)</span>
                        </button>
                        <div className="h-px bg-border mx-1" />
                        {/* Lista filtrada */}
                        {filteredClients.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum cliente encontrado</div>
                        ) : (
                          filteredClients.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, clientId: c.id.toString(), clientName: "" });
                                setClientDropdownOpen(false);
                                setClientSearch("");
                              }}
                              className={cn(
                                "flex w-full items-center px-3 py-2 text-sm hover:bg-accent",
                                formData.clientId === c.id.toString() && "bg-primary/15 text-primary"
                              )}
                            >
                              {c.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {formData.clientId === "new" && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input
                          placeholder="Nome"
                          value={formData.clientName}
                          onChange={e => setFormData({...formData, clientName: e.target.value})}
                          data-testid="input-client-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Sobrenome</Label>
                        <Input
                          placeholder="Sobrenome"
                          value={formData.clientLastName}
                          onChange={e => setFormData({...formData, clientLastName: e.target.value})}
                          data-testid="input-client-last-name"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone</Label>
                      <Input
                        placeholder="(00) 00000-0000"
                        value={formData.clientPhone}
                        onChange={e => setFormData({...formData, clientPhone: e.target.value})}
                        data-testid="input-client-phone"
                        inputMode="tel"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Serviço</Label>
                    {selectedServices.length > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {combinedDuration} min · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(combinedPrice)}
                        {bestCombo && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "hsl(38 92% 58% / 0.15)", color: "hsl(38 92% 58%)" }}>
                            combo
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="rounded-md border border-border overflow-hidden" data-testid="service-checklist">
                    {(services ?? []).map((s) => {
                      const checked = formData.serviceIds.includes(s.id.toString());
                      const blockedBy = !checked ? editServiceExclusions.find(pair =>
                        formData.serviceIds.some(selectedId =>
                          (pair.services[0].toString() === selectedId && pair.services[1] === s.id) ||
                          (pair.services[1].toString() === selectedId && pair.services[0] === s.id)
                        )
                      ) : undefined;
                      const isBlocked = !!blockedBy;
                      const blockerName = isBlocked
                        ? (services?.find(x => x.id === blockedBy!.services.find(id => formData.serviceIds.includes(id.toString())))?.name ?? "outro serviço")
                        : "";
                      return (
                        <label
                          key={s.id}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 transition-colors select-none",
                            isBlocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                            checked ? "bg-amber-500/10" : isBlocked ? "bg-red-950/20" : "hover:bg-muted/50",
                            "border-b border-border last:border-b-0"
                          )}
                          data-testid={`service-option-${s.id}`}
                          title={isBlocked ? `Incompatível com ${blockerName}` : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isBlocked}
                            onChange={() => {
                              if (isBlocked) return;
                              const next = checked
                                ? formData.serviceIds.filter((id) => id !== s.id.toString())
                                : [...formData.serviceIds, s.id.toString()];
                              setFormData({ ...formData, serviceIds: next, time: "" });
                            }}
                            className="accent-amber-500 w-4 h-4 flex-shrink-0"
                          />
                          <span className="flex-1 text-sm font-medium">{s.name}</span>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                              {s.durationMinutes} min · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(String(s.price)))}
                            </div>
                            {isBlocked && (
                              <div className="text-[10px] text-red-400">Incompatível com {blockerName}</div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {barbers && barbers.length > 0 && (
                  <div className="space-y-2">
                    <Label>Barbeiro</Label>
                    <div className="rounded-md border border-border overflow-hidden">
                      {barbers.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setFormData({ ...formData, barberId: b.id.toString() })}
                          className={cn(
                            "flex w-full items-center px-3 py-2.5 text-sm transition-colors border-b border-border last:border-b-0",
                            formData.barberId === b.id.toString() ? "bg-amber-500/10 font-medium" : "hover:bg-muted/50"
                          )}
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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

      <div className="rounded-lg border border-border bg-card px-3 py-3 md:px-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-foreground">Data</span>
          <Dialog open={dayPickerOpen} onOpenChange={setDayPickerOpen}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setDayPickerOpen(true)}
              data-testid="button-calendar-appointment-day"
            >
              <CalendarIcon className="h-4 w-4" />
              Escolher data
            </Button>
            <DialogContent className="w-auto max-w-[calc(100vw-2rem)] p-0">
              <DialogHeader className="px-6 pt-6">
                <DialogTitle>Escolha o dia dos agendamentos</DialogTitle>
              </DialogHeader>
              <div className="px-4 pb-5 pt-2">
                <Calendar
                  mode="single"
                  locale={ptBR}
                  selected={dateStart}
                  disabled={{
                    before: bookingWindowStart,
                    after: bookingWindowEnd,
                  }}
                  onSelect={(day) => {
                    if (!day) return;
                    selectAgendaDay(day);
                    setDayPickerOpen(false);
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {agendaDayOptions.map((day) => {
            const selected = sameDay(day, dateStart) && sameDay(day, dateEnd);
            const today = sameDay(day, new Date());
            return (
              <button
                key={format(day, "yyyy-MM-dd")}
                type="button"
                onClick={() => selectAgendaDay(day)}
                className={cn(
                  "flex h-[78px] w-[68px] shrink-0 flex-col items-center justify-center rounded-lg border px-1 transition-colors",
                  selected
                    ? "border-amber-500 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]"
                    : "border-border bg-background/30 hover:border-muted-foreground/50 hover:bg-muted/30",
                )}
                data-testid={`button-agenda-day-${format(day, "yyyy-MM-dd")}`}
                aria-label={`Ver agendamentos de ${format(day, "dd/MM/yyyy")}`}
                aria-pressed={selected}
              >
                <span className={cn(
                  "text-[10px] font-semibold uppercase leading-none",
                  selected ? "text-amber-400" : "text-muted-foreground",
                )}>
                  {format(day, "EEE", { locale: ptBR }).replace(".", "").toUpperCase()}
                </span>
                <span className={cn(
                  "mt-1 h-3 text-[9px] font-bold uppercase leading-none",
                  today ? "text-amber-500" : "text-transparent",
                )}>
                  Hoje
                </span>
                <span className="text-2xl font-bold leading-none text-foreground">
                  {format(day, "d")}
                </span>
                <span className={cn(
                  "mt-1 text-[10px] font-semibold uppercase leading-none",
                  selected ? "text-amber-400" : "text-muted-foreground",
                )}>
                  {format(day, "MMM", { locale: ptBR }).replace(".", "").toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Subscriber limit warning — shown when any active subscriber has used up their monthly cuts */}
      {subscribersAtLimit.length > 0 && (
        <div className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
            <span className="text-sm font-medium text-orange-400">
              {subscribersAtLimit.length === 1
                ? "1 assinante atingiu o limite de cortes este mês"
                : `${subscribersAtLimit.length} assinantes atingiram o limite de cortes este mês`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            {subscribersAtLimit.map(s => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-300"
              >
                {s.clientName}
                <span className="text-orange-400/70">
                  {s.cutsUsedThisMonth}/{s.maxAppointmentsPerMonth}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

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
            <p className="text-muted-foreground">
              Nenhum agendamento encontrado.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {[...(appointments ?? [])].sort((a,b) =>
                new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
              ).map((apt) => (
                <div key={apt.id} className="px-4 py-3 space-y-2" data-testid={`row-appointment-${apt.id}`}>
                  {/* Row 1: time + status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xl">{format(new Date(apt.scheduledAt), "HH:mm")}</span>
                      <span className="text-muted-foreground text-sm">→</span>
                      <span className="font-semibold text-base text-muted-foreground">{format(new Date(new Date(apt.scheduledAt).getTime() + apt.serviceDuration * 60000), "HH:mm")}</span>
                      <span className="text-sm text-muted-foreground">{format(new Date(apt.scheduledAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {getStatusBadge(apt.status)}
                    </div>
                  </div>
                  {/* Row 2: client + service */}
                  <div>
                    <p className="font-medium">{apt.clientName}</p>
                    <p className="text-sm text-muted-foreground">{apt.serviceName}{apt.barberName ? ` · ${apt.barberName}` : ""}</p>
                    {extractClientNote(apt.notes) && (
                      <p className="text-xs mt-1 flex items-start gap-1" style={{ color: "hsl(38 92% 58%)" }}>
                        <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{extractClientNote(apt.notes)}</span>
                      </p>
                    )}
                  </div>
                  {/* Row 3: price + payment + actions */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {apt.servicePrice != null && (
                        <span className="text-sm font-medium text-emerald-400">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(String(apt.servicePrice)))}
                        </span>
                      )}
                      {getPaymentBadge(apt.paymentMethod ?? "on_site")}
                    </div>
                    <div className="flex items-center gap-1">
                      {(apt.status === 'pending' || apt.status === 'cancelled') && (
                        <Button variant="ghost" size="icon" title="Editar" className="text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10" onClick={() => openEdit(apt)} data-testid={`button-edit-${apt.id}`}><Pencil className="h-4 w-4" /></Button>
                      )}
                      {apt.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="icon" title="Iniciar" className="text-teal-500 hover:text-teal-400 hover:bg-teal-500/10" onClick={() => startAppointment.mutate({id: apt.id}, { onSuccess: invalidate })} data-testid={`button-start-${apt.id}`}><Play className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="WhatsApp" className="text-green-500 hover:text-green-400 hover:bg-green-500/10" onClick={() => sendWhatsAppReminder(apt)} data-testid={`button-notify-${apt.id}`}><MessageCircle className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Cancelar" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setCancelTarget({ id: apt.id, clientName: apt.clientName })} data-testid={`button-cancel-${apt.id}`}><X className="h-4 w-4" /></Button>
                        </>
                      )}
                      {apt.status === 'in_progress' && (
                        <Button variant="ghost" size="icon" title="Concluir" className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => completeAppointment.mutate({id: apt.id}, { onSuccess: invalidate })} data-testid={`button-complete-${apt.id}`}><Check className="h-4 w-4" /></Button>
                      )}
                      {apt.status === 'completed' && (
                        <Button variant="ghost" size="icon" title="Comprovante" className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10" onClick={() => setReceiptApt(apt)}><Printer className="h-4 w-4" /></Button>
                      )}
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => { if (confirm("Deletar este registro?")) deleteAppointment.mutate({id: apt.id}, { onSuccess: invalidate }); }} data-testid={`button-delete-${apt.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead>Término</TableHead>
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
                  {[...(appointments ?? [])].sort((a,b) =>
                    new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
                  ).map((apt) => (
                    <TableRow key={apt.id} data-testid={`row-appointment-${apt.id}`}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(apt.scheduledAt), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-bold text-lg">
                        {format(new Date(apt.scheduledAt), "HH:mm")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(new Date(apt.scheduledAt).getTime() + apt.serviceDuration * 60000), "HH:mm")}
                      </TableCell>
                      <TableCell className="font-medium">
                        <span>{apt.clientName}</span>
                      </TableCell>
                      <TableCell>
                        <span>{apt.serviceName}</span>
                        {extractClientNote(apt.notes) && (
                          <p className="text-xs mt-0.5 flex items-start gap-1" style={{ color: "hsl(38 92% 58%)" }}>
                            <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{extractClientNote(apt.notes)}</span>
                          </p>
                        )}
                      </TableCell>
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
                            <Button variant="ghost" size="icon" title="Editar horário" className="text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10" onClick={() => openEdit(apt)} data-testid={`button-edit-${apt.id}`}><Pencil className="h-4 w-4" /></Button>
                          )}
                          {apt.status === 'pending' && (
                            <>
                              <Button variant="ghost" size="icon" title="Iniciar" className="text-teal-500 hover:text-teal-400 hover:bg-teal-500/10" onClick={() => startAppointment.mutate({id: apt.id}, { onSuccess: invalidate })} data-testid={`button-start-${apt.id}`}><Play className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" title="Enviar lembrete WhatsApp" className="text-green-500 hover:text-green-400 hover:bg-green-500/10" onClick={() => sendWhatsAppReminder(apt)} data-testid={`button-notify-${apt.id}`}><MessageCircle className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" title="Cancelar" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setCancelTarget({ id: apt.id, clientName: apt.clientName })} data-testid={`button-cancel-${apt.id}`}><X className="h-4 w-4" /></Button>
                            </>
                          )}
                          {apt.status === 'in_progress' && (
                            <Button variant="ghost" size="icon" title="Concluir" className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => completeAppointment.mutate({id: apt.id}, { onSuccess: invalidate })} data-testid={`button-complete-${apt.id}`}><Check className="h-4 w-4" /></Button>
                          )}
                          {apt.status === 'completed' && (
                            <Button variant="ghost" size="icon" title="Imprimir comprovante" className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10" onClick={() => setReceiptApt(apt)}><Printer className="h-4 w-4" /></Button>
                          )}
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => { if (confirm("Deletar este registro?")) deleteAppointment.mutate({id: apt.id}, { onSuccess: invalidate }); }} data-testid={`button-delete-${apt.id}`}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
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

            {/* Service selector — multi-select */}
            {services && services.length > 0 && (
              <div className="space-y-2">
                <Label>Serviço</Label>
                <div className="grid grid-cols-2 gap-2">
                  {services.map((s) => {
                    const selected = editServiceIdsState.includes(s.id.toString());
                    const blockedBy = !selected ? editServiceExclusions.find(pair =>
                      editServiceIdsState.some(selectedId =>
                        (pair.services[0].toString() === selectedId && pair.services[1] === s.id) ||
                        (pair.services[1].toString() === selectedId && pair.services[0] === s.id)
                      )
                    ) : undefined;
                    const isBlocked = !!blockedBy;
                    const blockerName = isBlocked
                      ? (services.find(x => x.id === blockedBy!.services.find(id => editServiceIdsState.includes(id.toString())))?.name ?? "outro serviço")
                      : "";
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={isBlocked}
                        title={isBlocked ? `Incompatível com ${blockerName}` : undefined}
                        onClick={() => {
                          if (isBlocked) return;
                          const next = selected
                            ? editServiceIdsState.filter((id) => id !== s.id.toString())
                            : [...editServiceIdsState, s.id.toString()];
                          setEditServiceIdsState(next);
                          setEditTime("");
                        }}
                        className={cn(
                          "rounded-md py-2 px-2 text-xs font-semibold border transition-colors text-left",
                          selected
                            ? "border-amber-500 bg-amber-500/10 text-amber-500"
                            : isBlocked
                            ? "border-red-900/60 bg-red-950/30 text-muted-foreground opacity-50 cursor-not-allowed"
                            : "border-border hover:border-muted-foreground/40",
                        )}
                      >
                        <div className="font-semibold truncate">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground">{s.durationMinutes} min · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(String(s.price)))}</div>
                        {isBlocked && <div className="text-[10px] text-red-400 mt-0.5">Incompatível com {blockerName}</div>}
                      </button>
                    );
                  })}
                </div>
                {editSelectedServices.length > 1 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    Total: {editCombinedDuration} min · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(editCombinedPrice)}
                    {editBestCombo && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "hsl(38 92% 58% / 0.15)", color: "hsl(38 92% 58%)" }}>
                        combo
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}

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

      {/* Receipt / Comprovante modal */}
      <Dialog open={!!receiptApt} onOpenChange={(open) => !open && setReceiptApt(null)}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden border-border/60">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Comprovante
            </DialogTitle>
          </DialogHeader>
          {receiptApt && (
            <div id="printable-receipt" className="px-6 py-5 space-y-4">
              {/* ── Shop header ── */}
              <div className="text-center space-y-1">
                {settings?.logoUrl && (
                  <img src={settings.logoUrl} alt="" className="h-10 mx-auto mb-1 object-contain" />
                )}
                <h3 className="font-bold text-sm uppercase tracking-wide">{settings?.barbershopName ?? "Barbearia"}</h3>
                {settings?.phone && <p className="text-[11px] text-muted-foreground">{settings.phone}</p>}
                {settings?.address && <p className="text-[11px] text-muted-foreground">{settings.address}</p>}
              </div>

              {/* ── Divider ── */}
              <div className="border-t-2 border-dashed border-border" />

              {/* ── Receipt details ── */}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground text-xs">Cliente</span>
                  <span className="font-medium text-sm">{receiptApt.clientName}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground text-xs">Serviço</span>
                  <span className="font-medium text-sm text-right max-w-[60%]">{receiptApt.serviceName}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground text-xs">Profissional</span>
                  <span className="font-medium text-sm">{receiptApt.barberName ?? "—"}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground text-xs">Data</span>
                  <span className="font-medium text-sm">{format(new Date(receiptApt.scheduledAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground text-xs">Horário</span>
                  <span className="font-medium text-sm">{format(new Date(receiptApt.scheduledAt), "HH:mm")}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground text-xs">Duração</span>
                  <span className="font-medium text-sm">{receiptApt.serviceDuration} min</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground text-xs">Pagamento</span>
                  <span className="font-medium text-sm">
                    {receiptApt.paymentMethod === "now" ? "Pix online" : "Na barbearia"}
                  </span>
                </div>
              </div>

              {/* ── Divider + Total ── */}
              <div className="border-t-2 border-dashed border-border pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold uppercase tracking-wide">Total</span>
                  <span className="text-lg font-bold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(String(receiptApt.servicePrice)))}
                  </span>
                </div>
              </div>

              {/* ── Footer ── */}
              <div className="border-t border-dashed border-border pt-3 text-center text-[11px] text-muted-foreground space-y-1">
                <p>Emitido em {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                <p className="font-medium">Obrigado pela preferência!</p>
              </div>
            </div>
          )}
          <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setReceiptApt(null)}>
              Fechar
            </Button>
            <Button
              onClick={() => {
                const el = document.getElementById("printable-receipt");
                if (!el) return;

                // Tamanho baseado na impressora selecionada nas configurações
                const size = settings?.receiptPrinterSize ?? "80mm";

                // pageSize  → valor exato para @page { size: ... } (crucial para impressoras térmicas)
                // popupW    → largura da janela popup em px
                // bodyW     → largura do corpo em mm (área imprimível = papel − margens)
                // padMm     → padding lateral em mm
                // fontBase  → tamanho base da fonte em pt
                const sizeMap: Record<string, { pageSize: string; popupW: number; bodyW: number; padMm: number; fontBase: number }> = {
                  "50mm": { pageSize: "50mm auto",  popupW: 210,  bodyW: 46, padMm: 2,  fontBase: 10 },
                  "58mm": { pageSize: "58mm auto",  popupW: 240,  bodyW: 53, padMm: 2,  fontBase: 11 },
                  "80mm": { pageSize: "80mm auto",  popupW: 330,  bodyW: 72, padMm: 4,  fontBase: 12 },
                  "A4":   { pageSize: "A4",         popupW: 860,  bodyW: 190, padMm: 10, fontBase: 14 },
                };
                const cfg = sizeMap[size] ?? sizeMap["80mm"]!;

                const w = window.open("", "_blank", `width=${cfg.popupW},height=700`);
                if (!w) return;
                w.document.write(`
                  <html>
                    <head>
                      <title>Comprovante</title>
                      <style>
                        /* ── Página: tamanho exato da bobina para o diálogo de impressão ── */
                        @page {
                          size: ${cfg.pageSize};
                          margin: 0;
                        }
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                          font-family: system-ui, -apple-system, sans-serif;
                          width: ${cfg.bodyW}mm;
                          padding: ${cfg.padMm}mm;
                          /* padding-bottom extra garante papel suficiente para a guilhotina cortar */
                          padding-bottom: ${size === "A4" ? "10mm" : "18mm"};
                          margin: 0;
                          color: #000;
                          background: #fff;
                          font-size: ${cfg.fontBase}pt;
                          line-height: 1.35;
                          word-break: break-word;
                          overflow-wrap: break-word;
                          font-weight: 600;
                          -webkit-font-smoothing: antialiased;
                        }
                        /* Tailwind overrides para o HTML copiado */
                        .text-center { text-align: center; }
                        .space-y-1 > * + * { margin-top: 3px; }
                        .space-y-4 > * + * { margin-top: 12px; }
                        .space-y-1\\.5 > * + * { margin-top: 5px; }
                        .mx-auto { margin-left: auto; margin-right: auto; }
                        .mb-1 { margin-bottom: 3px; }
                        .mb-2 { margin-bottom: 6px; }
                        .font-bold { font-weight: 700; }
                        .font-semibold { font-weight: 700; }
                        .font-medium { font-weight: 700; }
                        .uppercase { text-transform: uppercase; }
                        .tracking-wide { letter-spacing: 0.04em; }
                        .text-sm { font-size: ${cfg.fontBase}pt; }
                        .text-xs { font-size: ${cfg.fontBase - 1}pt; }
                        .text-\\[11px\\] { font-size: ${Math.max(7, cfg.fontBase - 2)}pt; }
                        .text-lg { font-size: ${cfg.fontBase + 3}pt; }
                        .text-muted-foreground { color: #000; font-weight: 700; }
                        .text-right { text-align: right; }
                        .max-w-\\[60\\%\\] { max-width: 60%; word-break: break-word; overflow-wrap: break-word; }
                        .flex { display: flex; }
                        .justify-between { justify-content: space-between; flex-wrap: wrap; gap: 2px; }
                        .items-center { align-items: center; }
                        .items-baseline { align-items: baseline; }
                        .border-t-2 { border-top: 2px dashed #000; }
                        .border-t { border-top: 1px dashed #aaa; }
                        .border-border { border-color: #aaa; }
                        .pt-3 { padding-top: 10px; }
                        .px-6 { padding-left: 0; padding-right: 0; }
                        .py-5 { padding-top: 0; padding-bottom: 0; }
                        img { max-width: 100%; height: auto; max-height: 44px; display: block; margin: 0 auto 5px; object-fit: contain; }
                        h3 { font-size: ${cfg.fontBase + 1}pt; }
                        p { margin: 2px 0; }
                        @media print {
                          @page { size: ${cfg.pageSize}; margin: 0; }
                          body {
                            width: ${cfg.bodyW}mm;
                            max-width: 100%;
                            padding: ${cfg.padMm}mm;
                            padding-bottom: 18mm;
                          }
                        }
                      </style>
                    </head>
                    <body>
                      ${el.innerHTML}
                      <script>window.onload = () => { setTimeout(() => { window.print(); window.onfocus = () => window.close(); }, 300); };</script>
                    </body>
                  </html>
                `);
                w.document.close();
              }}
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
