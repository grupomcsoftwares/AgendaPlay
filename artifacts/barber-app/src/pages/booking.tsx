import React, { useState } from "react";
import { useListServices, useCreateAppointment, getListServicesQueryKey, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Scissors, Calendar as CalendarIcon, Clock, User, CheckCircle2, ChevronRight, ChevronLeft, DollarSign } from "lucide-react";

const AMBER = "hsl(38 88% 55%)";
const AMBER_SOFT = "hsl(38 88% 55% / 0.15)";
const AMBER_DEEP = "hsl(38 80% 45%)";
const STEP_LABELS = ["Serviço", "Data e hora", "Seus dados", "Pagamento"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="grid grid-cols-4 gap-3 w-full">
      {STEP_LABELS.map((label, i) => {
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
  const { data: services } = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const createAppointment = useCreateAppointment();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    serviceId: "",
    date: new Date(),
    time: "",
    name: "",
    phone: "",
    notes: ""
  });

  const [isSuccess, setIsSuccess] = useState(false);

  const handleBook = () => {
    const service = services?.find(s => s.id.toString() === formData.serviceId);
    if (!service) return;

    const dateStr = formData.date.toISOString().split('T')[0];
    const scheduledAt = new Date(`${dateStr}T${formData.time}:00`).toISOString();

    createAppointment.mutate(
      { data: {
        clientName: formData.name,
        serviceId: service.id,
        serviceName: service.name,
        servicePrice: service.price,
        serviceDuration: service.durationMinutes,
        scheduledAt,
        notes: formData.phone ? `Tel: ${formData.phone}. ${formData.notes}` : formData.notes
      }},
      {
        onSuccess: () => {
          setIsSuccess(true);
        }
      }
    );
  };

  const selectedService = services?.find(s => s.id.toString() === formData.serviceId);

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center text-primary mb-8">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-bold">Agendamento Confirmado!</h1>
          <p className="text-muted-foreground text-lg">
            Seu horário para {selectedService?.name} está marcado.
          </p>
          <div className="bg-card border border-border p-6 rounded-lg text-left mt-8">
            <p className="font-semibold text-xl mb-4">{settings?.barbershopName || "Barbearia"}</p>
            <div className="space-y-3 text-muted-foreground">
              <p className="flex items-center gap-2"><CalendarIcon className="w-4 h-4" /> {formData.date.toLocaleDateString('pt-BR')}</p>
              <p className="flex items-center gap-2"><Clock className="w-4 h-4" /> {formData.time}</p>
              <p className="flex items-center gap-2"><User className="w-4 h-4" /> {formData.name}</p>
            </div>
          </div>
          <Button className="w-full mt-8" onClick={() => { setIsSuccess(false); setStep(1); setFormData({...formData, name: "", phone: ""}); }}>
            Fazer novo agendamento
          </Button>
        </div>
      </div>
    );
  }

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

        <StepIndicator current={step} />

        {step === 1 && (
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
                    onClick={() => {
                      setFormData({ ...formData, serviceId: service.id.toString() });
                      setStep(2);
                    }}
                    className="w-full text-left rounded-2xl p-4 transition-all"
                    style={{
                      backgroundColor: "hsl(0 0% 7%)",
                      border: `1px solid ${isSelected ? AMBER : "hsl(0 0% 14%)"}`,
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
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
                    className="rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ width: 40, height: 40, backgroundColor: AMBER_SOFT, color: AMBER }}
                  >
                    <Scissors className="w-5 h-5" />
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
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 18 }).map((_, i) => {
                    const totalMinutes = 9 * 60 + i * 30;
                    const h = Math.floor(totalMinutes / 60);
                    const m = totalMinutes % 60;
                    const value = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
                    const isSelected = formData.time === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFormData({ ...formData, time: value })}
                        data-testid={`button-time-${value}`}
                        className="rounded-xl py-3 text-center"
                        style={{
                          backgroundColor: "hsl(0 0% 9%)",
                          border: `1px solid ${isSelected ? AMBER : "hsl(0 0% 14%)"}`,
                          color: "hsl(var(--foreground))",
                          cursor: "pointer",
                          fontFamily: "monospace",
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                        }}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
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

                <Button
                  data-testid="button-confirm-booking"
                  className="w-full h-12 text-base font-semibold"
                  disabled={!formData.name || !formData.phone || createAppointment.isPending}
                  onClick={handleBook}
                >
                  {createAppointment.isPending ? "Agendando..." : "Continuar para Pagamento"}
                </Button>

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
        </Card>
      </div>
    </div>
  );
}
