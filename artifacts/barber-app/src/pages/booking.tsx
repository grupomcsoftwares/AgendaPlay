import React, { useState } from "react";
import { useListServices, useCreateAppointment, getListServicesQueryKey, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Scissors, Calendar as CalendarIcon, Clock, User, CheckCircle2 } from "lucide-react";

export default function Booking() {
  const { data: services } = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const createAppointment = useCreateAppointment();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    serviceId: "",
    date: new Date(),
    time: "09:00",
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
    <div className="min-h-screen bg-background text-foreground py-12 px-4 flex flex-col items-center">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-card border border-border rounded-full flex items-center justify-center text-primary mb-4 shadow-lg">
            <Scissors className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{settings?.barbershopName || "Barbearia"}</h1>
          <p className="text-muted-foreground">{settings?.bookingPageMessage || "Agende seu horário online."}</p>
        </div>

        <Card className="border-border bg-card shadow-2xl overflow-hidden">
          {step === 1 && (
            <>
              <CardHeader className="bg-muted/50 border-b border-border">
                <CardTitle>1. Escolha o Serviço</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {services?.map(service => (
                    <div 
                      key={service.id} 
                      className={`p-4 cursor-pointer transition-colors flex justify-between items-center ${formData.serviceId === service.id.toString() ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted/50'}`}
                      onClick={() => setFormData({...formData, serviceId: service.id.toString()})}
                    >
                      <div>
                        <p className="font-semibold">{service.name}</p>
                        <p className="text-sm text-muted-foreground">{service.durationMinutes} min</p>
                      </div>
                      <div className="font-bold text-primary">
                        R$ {service.price.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-border">
                  <Button className="w-full" disabled={!formData.serviceId} onClick={() => setStep(2)}>
                    Continuar
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 2 && (
            <>
              <CardHeader className="bg-muted/50 border-b border-border">
                <CardTitle>2. Escolha a Data</CardTitle>
                <CardDescription>{selectedService?.name}</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold">Quais data?</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Escolha a data para {selectedService?.name}
                    </p>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const d = new Date(today);
                      d.setDate(today.getDate() + i);
                      const isSelected =
                        formData.date.toDateString() === d.toDateString();
                      const weekdays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
                      const label = i === 0 ? "HOJE" : weekdays[d.getDay()];
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setFormData({ ...formData, date: d })}
                          data-testid={`button-date-${i}`}
                          className="flex flex-col items-center justify-center rounded-xl py-4 transition-all"
                          style={
                            isSelected
                              ? {
                                  backgroundColor: "hsl(var(--sidebar-primary))",
                                  color: "hsl(var(--sidebar-primary-foreground))",
                                  border: "1px solid hsl(var(--sidebar-primary))",
                                  cursor: "pointer",
                                }
                              : {
                                  backgroundColor: "hsl(0 0% 9%)",
                                  color: "hsl(var(--foreground))",
                                  border: "1px solid hsl(0 0% 14%)",
                                  cursor: "pointer",
                                }
                          }
                        >
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              letterSpacing: "0.05em",
                              opacity: isSelected ? 0.9 : 0.55,
                            }}
                          >
                            {label}
                          </span>
                          <span
                            style={{
                              fontSize: "1.5rem",
                              fontWeight: 700,
                              marginTop: "0.25rem",
                              lineHeight: 1,
                            }}
                          >
                            {d.getDate()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Voltar</Button>
                  <Button className="flex-1" onClick={() => setStep(3)}>Continuar</Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 3 && (
            <>
              <CardHeader className="bg-muted/50 border-b border-border">
                <CardTitle>3. Escolha o Horário</CardTitle>
                <CardDescription>
                  {selectedService?.name} · {formData.date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold">Que horas?</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Horários disponíveis em {formData.date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
                    </p>
                  </div>
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
                          className="rounded-xl py-3 text-center transition-all"
                          style={
                            isSelected
                              ? {
                                  backgroundColor: "hsl(var(--sidebar-primary))",
                                  color: "hsl(var(--sidebar-primary-foreground))",
                                  border: "1px solid hsl(var(--sidebar-primary))",
                                  cursor: "pointer",
                                  fontFamily: "monospace",
                                  fontSize: "1rem",
                                  fontWeight: 700,
                                  letterSpacing: "0.05em",
                                }
                              : {
                                  backgroundColor: "hsl(0 0% 9%)",
                                  color: "hsl(var(--foreground))",
                                  border: "1px solid hsl(0 0% 14%)",
                                  cursor: "pointer",
                                  fontFamily: "monospace",
                                  fontSize: "1rem",
                                  fontWeight: 700,
                                  letterSpacing: "0.05em",
                                }
                          }
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Voltar</Button>
                  <Button className="flex-1" onClick={() => setStep(4)}>Continuar</Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 4 && (
            <>
              <CardHeader className="bg-muted/50 border-b border-border">
                <CardTitle>4. Seus Dados</CardTitle>
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
                  onClick={() => setStep(3)}
                  data-testid="button-back-step4"
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
