import React, { useState } from "react";
import { useListServices, useCreateAppointment, getListServicesQueryKey, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
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
                <CardTitle>2. Escolha o Horário</CardTitle>
                <CardDescription>{selectedService?.name}</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="flex justify-center border border-border rounded-lg p-2 bg-background">
                  <Calendar 
                    mode="single" 
                    selected={formData.date} 
                    onSelect={(d) => d && setFormData({...formData, date: d})} 
                    disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                  />
                </div>
                
                <div className="space-y-3">
                  <Label>Horário Disponível</Label>
                  <Select value={formData.time} onValueChange={v => setFormData({...formData, time: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um horário" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Generates hours from 9 to 18 */}
                      {Array.from({length: 10}).map((_, i) => {
                        const h = i + 9;
                        return (
                          <React.Fragment key={h}>
                            <SelectItem value={`${h.toString().padStart(2, '0')}:00`}>{h.toString().padStart(2, '0')}:00</SelectItem>
                            <SelectItem value={`${h.toString().padStart(2, '0')}:30`}>{h.toString().padStart(2, '0')}:30</SelectItem>
                          </React.Fragment>
                        );
                      })}
                    </SelectContent>
                  </Select>
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
                <CardTitle>3. Seus Dados</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="bg-muted/50 p-4 rounded-lg mb-6 flex justify-between items-center text-sm border border-border">
                  <div>
                    <p className="font-semibold">{selectedService?.name}</p>
                    <p className="text-muted-foreground">{formData.date.toLocaleDateString('pt-BR')} às {formData.time}</p>
                  </div>
                  <Button variant="link" size="sm" onClick={() => setStep(1)}>Alterar</Button>
                </div>

                <div className="space-y-2">
                  <Label>Seu Nome</Label>
                  <Input 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    placeholder="Como devemos te chamar?"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>WhatsApp (Opcional)</Label>
                  <Input 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                    placeholder="(00) 00000-0000"
                  />
                </div>

                <div className="flex gap-3 pt-6">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Voltar</Button>
                  <Button className="flex-1" disabled={!formData.name || createAppointment.isPending} onClick={handleBook}>
                    {createAppointment.isPending ? "Agendando..." : "Confirmar Agendamento"}
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
