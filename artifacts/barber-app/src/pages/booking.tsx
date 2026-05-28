import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListServices, useCreateAppointment, getListServicesQueryKey, useGetSettings, getGetSettingsQueryKey, useGetAvailability, getGetAvailabilityQueryKey, useListBarbers, getListBarbersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Scissors, Calendar as CalendarIcon, Clock, User, ChevronRight, ChevronLeft, DollarSign, CreditCard, Banknote, Check } from "lucide-react";

const AMBER = "hsl(38 88% 55%)";
const AMBER_SOFT = "hsl(38 88% 55% / 0.15)";
const AMBER_DEEP = "hsl(38 80% 45%)";
const STEP_LABELS_BASE = ["Serviço", "Data e hora", "Seus dados", "Pagamento"] as const;
const STEP_LABELS_WITH_BARBER = ["Serviço", "Profissional", "Data e hora", "Seus dados", "Pagamento"] as const;

function StepIndicator({ current, labels }: { current: number; labels: readonly string[] }) {
  const cols = labels.length === 5 ? "grid-cols-5" : "grid-cols-4";
  return (
    <div className={`grid ${cols} gap-3 w-full`}>
      {labels.map((label, i) => {
        const idx = i + 1;
        const isActive = idx <= current;
        return (
          <div key={label} className="flex flex-col items-stretch gap-2">
            <div
              style={{
                height: 2,
                borderRadius: 2,
                backgroundColor: isActive ? AMBER : "hsl(0 0% 22%)",
                transition: "background-color 0.2s",
              }}
            />
            <span
              className="text-center text-xs"
              style={{
                color: isActive ? "hsl(var(--foreground))" : "hsl(0 0% 45%)",
                fontWeight: idx === current ? 600 : 400,
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Booking() {
  const [, setLocation] = useLocation();
  const { data: services } = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const { data: barbers } = useListBarbers({ activeOnly: true }, { query: { queryKey: getListBarbersQueryKey({ activeOnly: true }) } });
  const createAppointment = useCreateAppointment();

  const [step, setStep] = useState(1);
  // When true, step 1 shows the barber picker instead of the service list.
  const [pickingBarber, setPickingBarber] = useState(false);
  const [formData, setFormData] = useState<{
    serviceId: string;
    barberId: string;
    date: Date;
    time: string;
    name: string;
    phone: string;
    notes: string;
    paymentMethod: "now" | "on_site";
  }>({
    serviceId: "",
    barberId: "",
    date: new Date(),
    time: "",
    name: "",
    phone: "",
    notes: "",
    paymentMethod: "on_site",
  });

  const handleBook = () => {
    const service = services?.find(s => s.id.toString() === formData.serviceId);
    if (!service) return;
    const barber = formData.barberId
      ? barbers?.find(b => b.id.toString() === formData.barberId)
      : undefined;

    const y = formData.date.getFullYear();
    const m = (formData.date.getMonth() + 1).toString().padStart(2, "0");
    const d = formData.date.getDate().toString().padStart(2, "0");
    // Fixed America/Sao_Paulo offset (UTC-3, no DST) — matches server's TZ assumption.
    const scheduledAt = new Date(`${y}-${m}-${d}T${formData.time}:00-03:00`).toISOString();

    createAppointment.mutate(
      { data: {
        clientName: formData.name,
        serviceId: service.id,
        serviceName: service.name,
        servicePrice: service.price,
        serviceDuration: service.durationMinutes,
        ...(barber ? { barberId: barber.id, barberName: barber.name } : {}),
        scheduledAt,
        paymentMethod: formData.paymentMethod,
        notes: formData.phone ? `Tel: ${formData.phone}. ${formData.notes}` : formData.notes
      }},
      {
        onSuccess: (created) => {
          if (created?.cancelToken) {
            setLocation(`/agendamento/${created.cancelToken}?novo=1`);
          }
        }
      }
    );
  };

  const selectedService = services?.find(s => s.id.toString() === formData.serviceId);
  const selectedBarber = formData.barberId
    ? barbers?.find(b => b.id.toString() === formData.barberId)
    : undefined;

  // Active barbers eligible to perform the selected service.
  // Barbers with NO service links are treated as "all services" (legacy / convenience).
  const eligibleBarbers = React.useMemo(() => {
    if (!barbers || !selectedService) return [];
    return barbers.filter(b => b.serviceIds.length === 0 || b.serviceIds.includes(selectedService.id));
  }, [barbers, selectedService]);
  const needsBarberStep = eligibleBarbers.length >= 2;
  const stepLabels = needsBarberStep ? STEP_LABELS_WITH_BARBER : STEP_LABELS_BASE;
  // When the picker is open, we're on the "Profissional" indicator (step 2 of 5).
  const indicatorStep = pickingBarber ? 2 : step === 1 ? 1 : needsBarberStep ? step + 1 : step;

  const handleServicePick = (serviceId: number) => {
    const list = (barbers ?? []).filter(b => b.serviceIds.length === 0 || b.serviceIds.includes(serviceId));
    if (list.length >= 2) {
      setFormData(prev => ({ ...prev, serviceId: serviceId.toString(), barberId: "", time: "" }));
      setPickingBarber(true);
    } else {
      setFormData(prev => ({
        ...prev,
        serviceId: serviceId.toString(),
        barberId: list[0]?.id.toString() ?? "",
        time: "",
      }));
      setPickingBarber(false);
      setStep(2);
    }
  };

  const paymentEnableNow = settings?.paymentEnableNow ?? false;
  const paymentEnableOnSite = settings?.paymentEnableOnSite ?? true;
  const enabledPayments = ([
    paymentEnableNow ? ("now" as const) : null,
    paymentEnableOnSite ? ("on_site" as const) : null,
  ].filter(Boolean)) as Array<"now" | "on_site">;

  useEffect(() => {
    if (enabledPayments.length === 0) return;
    if (!enabledPayments.includes(formData.paymentMethod)) {
      setFormData(prev => ({ ...prev, paymentMethod: enabledPayments[0] }));
    }
  }, [enabledPayments.join(","), formData.paymentMethod]);

  const dateKey = `${formData.date.getFullYear()}-${(formData.date.getMonth()+1).toString().padStart(2,"0")}-${formData.date.getDate().toString().padStart(2,"0")}`;
  const availabilityServiceId = selectedService?.id ?? 0;
  const availabilityBarberId = formData.barberId ? parseInt(formData.barberId, 10) : undefined;
  const availabilityParams = availabilityBarberId
    ? { date: dateKey, serviceId: availabilityServiceId, barberId: availabilityBarberId }
    : { date: dateKey, serviceId: availabilityServiceId };
  const { data: availability, isFetching: loadingSlots } = useGetAvailability(
    availabilityParams,
    { query: { queryKey: getGetAvailabilityQueryKey(availabilityParams), enabled: step === 2 && availabilityServiceId > 0 && !pickingBarber } }
  );

  // Clear selected time if it's no longer available after a refresh.
  useEffect(() => {
    if (!formData.time || !availability) return;
    const slot = availability.slots.find(s => s.time === formData.time);
    if (!slot || !slot.available) {
      setFormData(prev => ({ ...prev, time: "" }));
    }
  }, [availability, formData.time]);

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4 flex flex-col items-center">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-4">
          <div
            className="mx-auto rounded-full flex items-center justify-center"
            style={{
              width: 88,
              height: 88,
              backgroundColor: AMBER_SOFT,
              border: `2px solid ${AMBER}`,
              color: AMBER,
            }}
          >
            <Scissors className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{settings?.barbershopName || "Barbearia"}</h1>
        </div>

        <StepIndicator current={indicatorStep} labels={stepLabels} />

        {step === 1 && pickingBarber && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => {
                setPickingBarber(false);
                setFormData(prev => ({ ...prev, serviceId: "", barberId: "" }));
              }}
              data-testid="button-back-to-services"
              className="flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
              style={{ background: "none", border: "none", color: "hsl(0 0% 65%)", cursor: "pointer", padding: 0 }}
            >
              <ChevronLeft className="w-4 h-4" />
              Trocar serviço
            </button>
            <div className="space-y-1">
              <h2 className="text-xl font-bold">Escolha o profissional</h2>
              <p className="text-sm text-muted-foreground">
                Quem você prefere para o serviço {selectedService?.name}?
              </p>
            </div>
            <div className="space-y-3">
              {eligibleBarbers.map((b) => {
                const isSelected = formData.barberId === b.id.toString();
                const initials = b.name
                  .split(" ")
                  .slice(0, 2)
                  .map((n) => n.charAt(0).toUpperCase())
                  .join("");
                return (
                  <button
                    key={b.id}
                    type="button"
                    data-testid={`button-barber-${b.id}`}
                    onClick={() => {
                      setFormData(prev => ({ ...prev, barberId: b.id.toString(), time: "" }));
                      setPickingBarber(false);
                      setStep(2);
                    }}
                    className="w-full text-left rounded-2xl p-4 transition-all flex items-center gap-4"
                    style={{
                      backgroundColor: "hsl(0 0% 7%)",
                      border: `1px solid ${isSelected ? AMBER : "hsl(0 0% 14%)"}`,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                      style={{
                        backgroundColor: AMBER_SOFT,
                        color: AMBER,
                        fontWeight: 700,
                        fontSize: "1.05rem",
                        border: `1px solid ${AMBER}`,
                      }}
                    >
                      {b.photoUrl ? (
                        <img src={b.photoUrl} alt={b.name} className="w-full h-full object-cover" />
                      ) : (
                        <span>{initials || <User className="w-5 h-5" />}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base">{b.name}</p>
                      {b.bio && <p className="text-xs text-muted-foreground mt-0.5 truncate">{b.bio}</p>}
                    </div>
                    <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: "hsl(0 0% 40%)" }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 1 && !pickingBarber && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold">Escolha um serviço</h2>
              <p className="text-sm text-muted-foreground">Selecione o serviço que deseja</p>
            </div>
            <div className="space-y-3">
              {services?.map((service) => {
                const isSelected = formData.serviceId === service.id.toString();
                return (
                  <button
                    key={service.id}
                    type="button"
                    data-testid={`button-service-${service.id}`}
                    onClick={() => handleServicePick(service.id)}
                    className="w-full text-left rounded-2xl p-4 transition-all"
                    style={{
                      backgroundColor: "hsl(0 0% 7%)",
                      border: `1px solid ${isSelected ? AMBER : "hsl(0 0% 14%)"}`,
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: "hsl(0 0% 10%)",
                          border: "1px solid hsl(0 0% 16%)",
                        }}
                      >
                        {service.imageUrl ? (
                          <img
                            src={service.imageUrl}
                            alt={service.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Scissors className="w-6 h-6" style={{ color: AMBER }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <p className="font-semibold text-base">{service.name}</p>
                          {service.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {service.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            {service.durationMinutes} min
                          </span>
                          <span
                            className="flex items-center gap-1 font-semibold"
                            style={{ color: AMBER }}
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            R$ {service.price.toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        className="w-5 h-5 flex-shrink-0 mt-1"
                        style={{ color: "hsl(0 0% 40%)" }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Card className="border-border bg-card shadow-2xl overflow-hidden" style={{ display: step === 1 ? "none" : "block" }}>

          {step === 2 && (
            <CardContent className="p-6 space-y-6">
              <button
                type="button"
                onClick={() => setStep(1)}
                data-testid="button-back-step2"
                className="flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
                style={{ background: "none", border: "none", color: "hsl(0 0% 65%)", cursor: "pointer", padding: 0 }}
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </button>

              {selectedService && (
                <div
                  className="rounded-xl p-3 flex items-center gap-3"
                  style={{ backgroundColor: "hsl(0 0% 9%)", border: "1px solid hsl(0 0% 14%)" }}
                >
                  <div
                    className="rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: selectedService.imageUrl ? "hsl(0 0% 10%)" : AMBER_SOFT,
                      color: AMBER,
                    }}
                  >
                    {selectedService.imageUrl ? (
                      <img
                        src={selectedService.imageUrl}
                        alt={selectedService.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Scissors className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{selectedService.name}</p>
                    <div className="flex items-center gap-3 text-xs mt-0.5">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {selectedService.durationMinutes} min
                      </span>
                      <span style={{ color: AMBER, fontWeight: 600 }}>
                        R$ {selectedService.price.toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {selectedBarber && (
                <div
                  className="rounded-xl p-3 flex items-center gap-3"
                  style={{ backgroundColor: "hsl(0 0% 9%)", border: "1px solid hsl(0 0% 14%)" }}
                >
                  <div
                    className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: AMBER_SOFT, color: AMBER, border: `1px solid ${AMBER}`, fontWeight: 700 }}
                  >
                    {selectedBarber.photoUrl ? (
                      <img src={selectedBarber.photoUrl} alt={selectedBarber.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs">
                        {selectedBarber.name.split(" ").slice(0, 2).map((n) => n.charAt(0).toUpperCase()).join("")}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Profissional</p>
                    <p className="font-semibold text-sm truncate">{selectedBarber.name}</p>
                  </div>
                  {needsBarberStep && (
                    <button
                      type="button"
                      data-testid="button-change-barber"
                      onClick={() => { setPickingBarber(true); setStep(1); }}
                      className="text-xs underline transition-opacity hover:opacity-70"
                      style={{ background: "none", border: "none", color: AMBER, cursor: "pointer" }}
                    >
                      Trocar
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <p
                  className="text-xs font-semibold"
                  style={{ color: "hsl(0 0% 60%)", letterSpacing: "0.05em" }}
                >
                  SELECIONE O DIA E HORÁRIO:
                </p>

                <div
                  className="flex gap-2 overflow-x-auto pb-2"
                  style={{ scrollbarWidth: "thin" }}
                  data-testid="date-scroller"
                >
                  {Array.from({ length: 14 }).map((_, i) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const d = new Date(today);
                    d.setDate(today.getDate() + i);
                    const isSelected = formData.date.toDateString() === d.toDateString();
                    const weekdays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
                    const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setFormData({ ...formData, date: d, time: "" })}
                        data-testid={`button-date-${i}`}
                        className="flex flex-col items-center justify-center rounded-xl flex-shrink-0"
                        style={{
                          width: 68,
                          paddingTop: 12,
                          paddingBottom: 12,
                          backgroundColor: "hsl(0 0% 9%)",
                          border: `1px solid ${isSelected ? AMBER : "hsl(0 0% 14%)"}`,
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            color: "hsl(0 0% 75%)",
                          }}
                        >
                          {weekdays[d.getDay()]}
                        </span>
                        {i === 0 && (
                          <span
                            style={{
                              fontSize: "0.6rem",
                              fontWeight: 700,
                              letterSpacing: "0.05em",
                              color: AMBER,
                              marginTop: 2,
                            }}
                          >
                            HOJE
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: "1.4rem",
                            fontWeight: 700,
                            marginTop: i === 0 ? 2 : 6,
                            lineHeight: 1,
                          }}
                        >
                          {d.getDate()}
                        </span>
                        <span
                          style={{
                            fontSize: "0.6rem",
                            fontWeight: 600,
                            letterSpacing: "0.05em",
                            color: "hsl(0 0% 55%)",
                            marginTop: 4,
                          }}
                        >
                          {months[d.getMonth()]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p
                  className="text-center text-xs"
                  style={{ color: "hsl(0 0% 45%)", letterSpacing: "0.05em" }}
                >
                  ARRASTE PARA VER MAIS
                </p>
              </div>

              <div className="space-y-2">
                {availability?.dayClosed ? (
                  <p className="text-center text-sm py-8" style={{ color: "hsl(0 0% 55%)" }}>
                    Fechado neste dia. Escolha outra data.
                  </p>
                ) : loadingSlots && !availability ? (
                  <p className="text-center text-sm py-8" style={{ color: "hsl(0 0% 45%)" }}>
                    Carregando horários…
                  </p>
                ) : availability && availability.slots.length === 0 ? (
                  <p className="text-center text-sm py-8" style={{ color: "hsl(0 0% 55%)" }}>
                    Nenhum horário disponível neste dia.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {(availability?.slots ?? []).map(({ time: value, available }) => {
                      const isSelected = formData.time === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={!available}
                          onClick={() => available && setFormData({ ...formData, time: value })}
                          data-testid={`button-time-${value}`}
                          className="rounded-xl py-3 text-center"
                          style={{
                            backgroundColor: "hsl(0 0% 9%)",
                            border: `1px solid ${isSelected ? AMBER : "hsl(0 0% 14%)"}`,
                            color: available ? "hsl(var(--foreground))" : "hsl(0 0% 30%)",
                            cursor: available ? "pointer" : "not-allowed",
                            fontFamily: "monospace",
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            textDecoration: available ? "none" : "line-through",
                            opacity: available ? 1 : 0.5,
                          }}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                data-testid="button-confirm-datetime"
                disabled={!formData.time}
                onClick={() => setStep(3)}
                className="w-full rounded-xl text-center font-semibold transition-opacity"
                style={{
                  height: 52,
                  backgroundColor: AMBER_DEEP,
                  color: "hsl(0 0% 100%)",
                  border: "none",
                  cursor: formData.time ? "pointer" : "not-allowed",
                  opacity: formData.time ? 1 : 0.55,
                }}
              >
                {formData.time
                  ? `Continuar — ${formData.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} às ${formData.time}`
                  : "Selecione data e horário"}
              </button>
            </CardContent>
          )}

          {step === 3 && (
            <>
              <CardHeader className="bg-muted/50 border-b border-border">
                <CardTitle>3. Seus Dados</CardTitle>
                <CardDescription>
                  {selectedService?.name} · {formData.date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })} às {formData.time}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold">Seus Dados</h3>
                  <p className="text-sm text-muted-foreground">
                    Só precisamos de algumas informações para confirmar.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-semibold">Nome Completo</Label>
                    <div className="relative">
                      <User
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                        style={{ color: "hsl(0 0% 45%)" }}
                      />
                      <Input
                        id="name"
                        data-testid="input-booking-name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="João Silva"
                        className="pl-9 h-11"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-semibold">Telefone</Label>
                    <Input
                      id="phone"
                      data-testid="input-booking-phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes" className="text-sm font-semibold">Observações (Opcional)</Label>
                    <Textarea
                      id="notes"
                      data-testid="input-booking-notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Alguma preferência especial?"
                      rows={3}
                    />
                  </div>
                </div>

                <div
                  className="pt-2 border-t"
                  style={{ borderColor: "hsl(0 0% 12%)" }}
                />

                <button
                  type="button"
                  data-testid="button-continue-to-payment"
                  disabled={!formData.name || !formData.phone}
                  onClick={() => setStep(4)}
                  className="w-full rounded-xl text-center font-semibold transition-opacity"
                  style={{
                    height: 52,
                    backgroundColor: AMBER_DEEP,
                    color: "hsl(0 0% 100%)",
                    border: "none",
                    cursor: formData.name && formData.phone ? "pointer" : "not-allowed",
                    opacity: formData.name && formData.phone ? 1 : 0.55,
                  }}
                >
                  Continuar para Pagamento
                </button>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  data-testid="button-back-step3"
                  className="w-full text-sm transition-opacity hover:opacity-70"
                  style={{
                    background: "none",
                    border: "none",
                    color: "hsl(0 0% 50%)",
                    cursor: "pointer",
                  }}
                >
                  ← Voltar
                </button>
              </CardContent>
            </>
          )}

          {step === 4 && (
            <CardContent className="p-6 space-y-6">
              <button
                type="button"
                onClick={() => setStep(3)}
                data-testid="button-back-step4"
                className="flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
                style={{
                  background: "none",
                  border: "none",
                  color: "hsl(0 0% 60%)",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </button>

              <div className="space-y-1">
                <h2 className="text-xl font-bold">Pagamento</h2>
                <p className="text-sm text-muted-foreground">
                  Como você prefere pagar?
                </p>
              </div>

              {selectedService && (
                <div
                  className="rounded-xl p-4 space-y-2"
                  style={{ backgroundColor: "hsl(0 0% 9%)", border: "1px solid hsl(0 0% 14%)" }}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Serviço</span>
                    <span className="font-semibold">{selectedService.name}</span>
                  </div>
                  {selectedBarber && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Profissional</span>
                      <span className="font-semibold">{selectedBarber.name}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Data e hora</span>
                    <span className="font-semibold">
                      {formData.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · {formData.time}
                    </span>
                  </div>
                  <div
                    className="flex items-center justify-between pt-2 mt-2 border-t"
                    style={{ borderColor: "hsl(0 0% 14%)" }}
                  >
                    <span className="font-semibold">Total</span>
                    <span className="text-xl font-bold" style={{ color: AMBER }}>
                      R$ {selectedService.price.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {([
                  {
                    value: "now" as const,
                    title: "Pagar agora",
                    desc: "Pague online e garanta seu horário",
                    Icon: CreditCard,
                  },
                  {
                    value: "on_site" as const,
                    title: "Pagar no final do serviço",
                    desc: "Pague diretamente na barbearia",
                    Icon: Banknote,
                  },
                ]).filter(opt => enabledPayments.includes(opt.value)).map(({ value, title, desc, Icon }) => {
                  const isSelected = formData.paymentMethod === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      data-testid={`button-payment-${value}`}
                      onClick={() => setFormData({ ...formData, paymentMethod: value })}
                      className="w-full text-left rounded-2xl p-4 transition-all flex items-center gap-4"
                      style={{
                        backgroundColor: isSelected ? AMBER_SOFT : "hsl(0 0% 7%)",
                        border: `2px solid ${isSelected ? AMBER : "hsl(0 0% 14%)"}`,
                        cursor: "pointer",
                      }}
                    >
                      <div
                        className="rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          width: 44,
                          height: 44,
                          backgroundColor: isSelected ? AMBER : "hsl(0 0% 12%)",
                          color: isSelected ? "hsl(0 0% 10%)" : AMBER,
                        }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-base">{title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                      <div
                        className="rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          width: 22,
                          height: 22,
                          border: `2px solid ${isSelected ? AMBER : "hsl(0 0% 25%)"}`,
                          backgroundColor: isSelected ? AMBER : "transparent",
                          color: "hsl(0 0% 10%)",
                        }}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                data-testid="button-confirm-booking"
                disabled={createAppointment.isPending}
                onClick={handleBook}
                className="w-full rounded-xl text-center font-semibold transition-opacity"
                style={{
                  height: 52,
                  backgroundColor: AMBER_DEEP,
                  color: "hsl(0 0% 100%)",
                  border: "none",
                  cursor: createAppointment.isPending ? "not-allowed" : "pointer",
                  opacity: createAppointment.isPending ? 0.55 : 1,
                }}
              >
                {createAppointment.isPending
                  ? "Confirmando..."
                  : formData.paymentMethod === "now"
                    ? "Pagar e confirmar agendamento"
                    : "Confirmar agendamento"}
              </button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
