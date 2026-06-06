import React, { useEffect, useRef, useState } from "react";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Upload, Trash2, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

type DaySchedule = {
  closed: boolean;
  open: string;
  close: string;
  lunchStart: string;
  lunchEnd: string;
};

type WeeklySchedule = Record<DayKey, DaySchedule>;

const DAYS: { key: DayKey; label: string }[] = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];

const defaultDay = (closed = false): DaySchedule => ({
  closed,
  open: "09:00",
  close: "18:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
});

const defaultWeeklySchedule = (): WeeklySchedule => ({
  monday: defaultDay(),
  tuesday: defaultDay(),
  wednesday: defaultDay(),
  thursday: defaultDay(),
  friday: defaultDay(),
  saturday: defaultDay(),
  sunday: defaultDay(true),
});

// Resize/compress the chosen image entirely in the browser and return a PNG
// data URL. Keeps the stored logo small (max 256px) since it lives in settings.
function resizeImageToDataUrl(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Não foi possível processar a imagem"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoProcessing, setLogoProcessing] = useState(false);

  const [formData, setFormData] = useState({
    barbershopName: "",
    ownerName: "",
    logoUrl: "",
    phone: "",
    address: "",
    bookingPageMessage: "",
    weeklySchedule: defaultWeeklySchedule(),
    paymentEnableNow: false,
    paymentEnableOnSite: true,
  });

  useEffect(() => {
    if (settings) {
      const incoming = (settings.weeklySchedule as WeeklySchedule | null | undefined) ?? null;
      const merged = defaultWeeklySchedule();
      if (incoming) {
        for (const { key } of DAYS) {
          if (incoming[key]) merged[key] = { ...merged[key], ...incoming[key] };
        }
      }
      setFormData({
        barbershopName: settings.barbershopName || "",
        ownerName: settings.ownerName || "",
        logoUrl: settings.logoUrl || "",
        phone: settings.phone || "",
        address: settings.address || "",
        bookingPageMessage: settings.bookingPageMessage || "",
        weeklySchedule: merged,
        paymentEnableNow: settings.paymentEnableNow ?? false,
        paymentEnableOnSite: settings.paymentEnableOnSite ?? true,
      });
    }
  }, [settings]);

  const updateDay = (key: DayKey, patch: Partial<DaySchedule>) => {
    setFormData((prev) => ({
      ...prev,
      weeklySchedule: {
        ...prev.weeklySchedule,
        [key]: { ...prev.weeklySchedule[key], ...patch },
      },
    }));
  };

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione um arquivo de imagem", variant: "destructive" });
      return;
    }
    setLogoProcessing(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setFormData((prev) => ({ ...prev, logoUrl: dataUrl }));
    } catch (err) {
      toast({
        title: "Não foi possível carregar a imagem",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLogoProcessing(false);
    }
  };

  const handleSave = () => {
    if (!formData.paymentEnableNow && !formData.paymentEnableOnSite) {
      toast({
        title: "Selecione ao menos uma forma de pagamento",
        description: "Pelo menos uma opção precisa estar ativa para os clientes agendarem.",
        variant: "destructive",
      });
      return;
    }
    updateSettings.mutate(
      { data: { ...formData, logoUrl: formData.logoUrl || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({ title: "Configurações salvas com sucesso" });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 bg-background overflow-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1">Gerencie as informações da barbearia.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Informações Gerais</CardTitle>
            <CardDescription>Dados principais da barbearia</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Logo da Barbearia</Label>
              <div className="flex items-center gap-4">
                <div
                  className="rounded-full flex items-center justify-center overflow-hidden shrink-0 bg-muted"
                  style={{ width: 72, height: 72, border: "2px solid hsl(38 88% 55%)" }}
                  data-testid="logo-preview"
                >
                  {formData.logoUrl ? (
                    <img
                      src={formData.logoUrl}
                      alt="Logo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Scissors className="w-7 h-7" style={{ color: "hsl(38 88% 55%)" }} />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoSelect}
                    data-testid="input-logo-file"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={logoProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-logo"
                  >
                    <Upload className="h-4 w-4" />
                    {logoProcessing ? "Processando..." : formData.logoUrl ? "Trocar logo" : "Enviar logo"}
                  </Button>
                  {formData.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive hover:text-destructive"
                      onClick={() => setFormData({ ...formData, logoUrl: "" })}
                      data-testid="button-remove-logo"
                    >
                      <Trash2 className="h-4 w-4" /> Remover
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Aparece no topo da página de agendamento. Use uma imagem quadrada para melhor resultado.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Nome da Barbearia</Label>
              <Input 
                value={formData.barbershopName} 
                onChange={e => setFormData({...formData, barbershopName: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do Proprietário</Label>
              <Input 
                value={formData.ownerName} 
                onChange={e => setFormData({...formData, ownerName: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone de Contato</Label>
              <Input 
                value={formData.phone} 
                onChange={e => setFormData({...formData, phone: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Textarea 
                value={formData.address} 
                onChange={e => setFormData({...formData, address: e.target.value})} 
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Horário de Funcionamento</CardTitle>
              <CardDescription>Defina os horários e o intervalo de almoço para cada dia da semana</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {DAYS.map(({ key, label }) => {
                const day = formData.weeklySchedule[key];
                return (
                  <div
                    key={key}
                    className="border border-border rounded-lg p-4 space-y-3"
                    data-testid={`schedule-day-${key}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{label}</span>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`closed-${key}`} className="text-xs text-muted-foreground">
                          {day.closed ? "Fechado" : "Aberto"}
                        </Label>
                        <Switch
                          id={`closed-${key}`}
                          data-testid={`switch-open-${key}`}
                          checked={!day.closed}
                          onCheckedChange={(v) => updateDay(key, { closed: !v })}
                        />
                      </div>
                    </div>

                    {!day.closed && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Abertura</Label>
                            <Input
                              type="time"
                              data-testid={`input-open-${key}`}
                              value={day.open}
                              onChange={(e) => updateDay(key, { open: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Fechamento</Label>
                            <Input
                              type="time"
                              data-testid={`input-close-${key}`}
                              value={day.close}
                              onChange={(e) => updateDay(key, { close: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Início do almoço</Label>
                            <Input
                              type="time"
                              data-testid={`input-lunch-start-${key}`}
                              value={day.lunchStart}
                              onChange={(e) => updateDay(key, { lunchStart: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Fim do almoço</Label>
                            <Input
                              type="time"
                              data-testid={`input-lunch-end-${key}`}
                              value={day.lunchEnd}
                              onChange={(e) => updateDay(key, { lunchEnd: e.target.value })}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Formas de Pagamento</CardTitle>
              <CardDescription>
                Escolha quais opções os clientes verão na hora de agendar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border border-border rounded-lg p-4">
                <div className="space-y-1 pr-4">
                  <p className="font-semibold">Pagar agora (online)</p>
                  <p className="text-xs text-muted-foreground">
                    Cliente paga online no momento do agendamento
                  </p>
                </div>
                <Switch
                  data-testid="switch-payment-now"
                  checked={formData.paymentEnableNow}
                  onCheckedChange={(v) => setFormData({ ...formData, paymentEnableNow: v })}
                />
              </div>
              <div className="flex items-center justify-between border border-border rounded-lg p-4">
                <div className="space-y-1 pr-4">
                  <p className="font-semibold">Pagar no final do serviço</p>
                  <p className="text-xs text-muted-foreground">
                    Cliente paga direto na barbearia depois do atendimento
                  </p>
                </div>
                <Switch
                  data-testid="switch-payment-on-site"
                  checked={formData.paymentEnableOnSite}
                  onCheckedChange={(v) => setFormData({ ...formData, paymentEnableOnSite: v })}
                />
              </div>
              {!formData.paymentEnableNow && !formData.paymentEnableOnSite && (
                <p className="text-xs" style={{ color: "hsl(0 70% 65%)" }}>
                  Pelo menos uma forma de pagamento precisa estar ativa.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Página de Agendamento</CardTitle>
              <CardDescription>Mensagem exibida para os clientes na página pública</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mensagem de Boas-vindas</Label>
                <Textarea 
                  value={formData.bookingPageMessage} 
                  onChange={e => setFormData({...formData, bookingPageMessage: e.target.value})} 
                  placeholder="Olá! Seja bem-vindo à nossa barbearia..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end max-w-5xl">
        <Button onClick={handleSave} disabled={updateSettings.isPending} className="gap-2">
          <Save className="h-4 w-4" /> Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
