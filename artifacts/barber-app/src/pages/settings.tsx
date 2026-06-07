import React, { useEffect, useRef, useState } from "react";
import {
  useGetSettings, useUpdateSettings, useUpdateUserSlug, getGetSettingsQueryKey,
  useListComboDiscounts, useCreateComboDiscount, useUpdateComboDiscount, useDeleteComboDiscount, getListComboDiscountsQueryKey,
  useListServices, getListServicesQueryKey,
  useListLoyaltyClients, getListLoyaltyClientsQueryKey,
  useListSubscriptionPlans, useCreateSubscriptionPlan, useUpdateSubscriptionPlan, useDeleteSubscriptionPlan, getListSubscriptionPlansQueryKey,
  useListSubscriptions, useUpdateSubscription, getListSubscriptionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Upload, Trash2, Scissors, Link, Copy, Check, Pencil, Plus, X, Gift, CreditCard, BadgeCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";

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

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function validateSlug(value: string): string | null {
  if (value.length < 3) return "Mínimo de 3 caracteres";
  if (value.length > 80) return "Máximo de 80 caracteres";
  if (!SLUG_RE.test(value)) return "Use apenas letras minúsculas, números e hífens. Não pode começar ou terminar com hífen.";
  return null;
}

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings(undefined, { query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();
  const updateSlug = useUpdateUserSlug();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, refresh } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: combos } = useListComboDiscounts(undefined, { query: { queryKey: getListComboDiscountsQueryKey() } });
  const { data: services } = useListServices(undefined, { query: { queryKey: getListServicesQueryKey() } });
  const createCombo = useCreateComboDiscount();
  const updateComboMut = useUpdateComboDiscount();
  const deleteCombo = useDeleteComboDiscount();

  const [comboOpen, setComboOpen] = useState(false);
  const [editingComboId, setEditingComboId] = useState<number | null>(null);
  const [comboForm, setComboForm] = useState({ name: "", serviceIds: [] as number[], discountPercent: 10, discountType: "percent" as "percent" | "value" });

  const [slugValue, setSlugValue] = useState(user?.slug ?? "");
  const [slugEditMode, setSlugEditMode] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const initializedRef = useRef(false);

  const { data: loyaltyClients } = useListLoyaltyClients({ query: { queryKey: getListLoyaltyClientsQueryKey() } });

  const { data: subscriptionPlans } = useListSubscriptionPlans(undefined, { query: { queryKey: getListSubscriptionPlansQueryKey() } });
  const createPlan = useCreateSubscriptionPlan();
  const updatePlanMut = useUpdateSubscriptionPlan();
  const deletePlan = useDeleteSubscriptionPlan();

  const { data: subscriptions } = useListSubscriptions({ query: { queryKey: getListSubscriptionsQueryKey() } });
  const updateSubMut = useUpdateSubscription();

  const [planOpen, setPlanOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [planForm, setPlanForm] = useState({ name: "", description: "", price: "", maxPerMonth: "", active: true });

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
    pixKey: "",
    maxBookingDays: 30,
    minAdvanceMinutes: 0,
    minCancelMinutes: 0,
    slotIntervalMinutes: 15,
    smartSlots: false,
    loyaltyEnabled: false,
    loyaltyPointsPerReal: 10,
    loyaltyPointsPerRedemptionUnit: 100,
  });

  useEffect(() => {
    if (settings && !initializedRef.current) {
      initializedRef.current = true;
      const incoming = (settings.weeklySchedule as WeeklySchedule | null | undefined) ?? null;
      const merged = defaultWeeklySchedule();
      if (incoming) {
        for (const { key } of DAYS) {
          if (incoming[key]) merged[key] = { ...merged[key], ...incoming[key] };
        }
      }
      const lc = settings.loyaltyConfig as { enabled?: boolean; pointsPerReal?: number; pointsPerRedemptionUnit?: number } | null | undefined;
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
        pixKey: settings.pixKey || "",
        maxBookingDays: settings.maxBookingDays ?? 30,
        minAdvanceMinutes: settings.minAdvanceMinutes ?? 0,
        minCancelMinutes: settings.minCancelMinutes ?? 0,
        slotIntervalMinutes: settings.slotIntervalMinutes ?? 15,
        smartSlots: settings.smartSlots ?? false,
        loyaltyEnabled: lc?.enabled ?? false,
        loyaltyPointsPerReal: lc?.pointsPerReal ?? 10,
        loyaltyPointsPerRedemptionUnit: lc?.pointsPerRedemptionUnit ?? 100,
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

  const handleSlugChange = (val: string) => {
    setSlugValue(val);
    setSlugError(validateSlug(val));
  };

  const handleSlugSave = () => {
    const err = validateSlug(slugValue);
    if (err) {
      setSlugError(err);
      return;
    }
    updateSlug.mutate(
      { data: { slug: slugValue } },
      {
        onSuccess: () => {
          setSlugEditMode(false);
          setSlugError(null);
          refresh();
          toast({ title: "Endereço atualizado com sucesso" });
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Erro ao salvar endereço";
          setSlugError(msg);
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleComboToggleService = (sid: number) => {
    setComboForm((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(sid) ? f.serviceIds.filter((x) => x !== sid) : [...f.serviceIds, sid],
    }));
  };

  const handleComboSave = () => {
    if (comboForm.serviceIds.length < 2) {
      toast({ title: "Selecione pelo menos 2 serviços para o combo", variant: "destructive" });
      return;
    }
    const autoName = comboForm.name.trim() ||
      comboForm.serviceIds.map((id) => services?.find((s) => s.id === id)?.name || `#${id}`).join(" + ");
    const payload = { name: autoName, serviceIds: comboForm.serviceIds, discountPercent: comboForm.discountPercent, discountType: comboForm.discountType };
    if (editingComboId) {
      updateComboMut.mutate(
        { id: editingComboId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListComboDiscountsQueryKey() });
            setComboOpen(false);
            setEditingComboId(null);
            setComboForm({ name: "", serviceIds: [], discountPercent: 10, discountType: "percent" });
            toast({ title: "Combo atualizado" });
          },
        },
      );
    } else {
      createCombo.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListComboDiscountsQueryKey() });
            setComboOpen(false);
            setComboForm({ name: "", serviceIds: [], discountPercent: 10, discountType: "percent" });
            toast({ title: "Combo criado" });
          },
        },
      );
    }
  };

  const handleComboDelete = (id: number) => {
    deleteCombo.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListComboDiscountsQueryKey() }) },
    );
  };

  const handlePlanSave = () => {
    const name = planForm.name.trim();
    if (!name) { toast({ title: "Nome do plano é obrigatório", variant: "destructive" }); return; }
    const price = parseFloat(planForm.price);
    if (Number.isNaN(price) || price < 0) { toast({ title: "Preço inválido", variant: "destructive" }); return; }
    const maxRaw = planForm.maxPerMonth.trim();
    const max = maxRaw ? parseInt(maxRaw, 10) : null;
    const payload = { name, description: planForm.description.trim() || null, price, maxAppointmentsPerMonth: max, active: planForm.active };
    if (editingPlanId) {
      updatePlanMut.mutate({ id: editingPlanId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubscriptionPlansQueryKey() });
          setPlanOpen(false); setEditingPlanId(null);
          setPlanForm({ name: "", description: "", price: "", maxPerMonth: "", active: true });
          toast({ title: "Plano atualizado" });
        },
      });
    } else {
      createPlan.mutate({ data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubscriptionPlansQueryKey() });
          setPlanOpen(false);
          setPlanForm({ name: "", description: "", price: "", maxPerMonth: "", active: true });
          toast({ title: "Plano criado" });
        },
      });
    }
  };

  const handlePlanDelete = (id: number) => {
    deletePlan.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSubscriptionPlansQueryKey() }) });
  };

  const handleSubStatus = (id: number, status: "active" | "cancelled") => {
    updateSubMut.mutate({ id, data: { status } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() }),
    });
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
      { data: {
        ...formData,
        logoUrl: formData.logoUrl || null,
        pixKey: formData.pixKey || null,
        loyaltyConfig: {
          enabled: formData.loyaltyEnabled,
          pointsPerReal: formData.loyaltyPointsPerReal,
          pointsPerRedemptionUnit: formData.loyaltyPointsPerRedemptionUnit,
        },
      } },
      {
        onSuccess: (saved) => {
          queryClient.setQueryData(getGetSettingsQueryKey(), saved);
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
    <div className="flex-1 p-4 md:p-8 bg-background overflow-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Configurações</h1>
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
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-4">
                  <div className="space-y-1 pr-4">
                    <p className="font-semibold">Pagar agora (online)</p>
                    <p className="text-xs text-muted-foreground">
                      Cliente paga via Pix no momento do agendamento
                    </p>
                  </div>
                  <Switch
                    data-testid="switch-payment-now"
                    checked={formData.paymentEnableNow}
                    onCheckedChange={(v) => setFormData({ ...formData, paymentEnableNow: v })}
                  />
                </div>
                {formData.paymentEnableNow && (
                  <div className="px-4 pb-4 border-t border-border pt-3 space-y-2 bg-muted/30">
                    <Label className="text-xs font-medium">Chave Pix</Label>
                    <Input
                      data-testid="input-pix-key"
                      value={formData.pixKey}
                      onChange={(e) => { const v = e.target.value; setFormData((prev) => ({ ...prev, pixKey: v })); }}
                      placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Esta chave será exibida para o cliente na hora de confirmar o agendamento.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border border-border rounded-lg p-4">
                <div className="space-y-1 pr-4">
                  <p className="font-semibold">Pagar depois</p>
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
              <CardTitle>Regras de Agendamento</CardTitle>
              <CardDescription>Configure o comportamento da agenda online</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Período máximo para agendar</Label>
                <select
                  value={formData.maxBookingDays}
                  onChange={(e) => setFormData({ ...formData, maxBookingDays: Number(e.target.value) })}
                  className="h-10 w-full rounded-md border border-input bg-muted/40 px-3 text-sm"
                >
                  <option value={7}>7 dias</option>
                  <option value={15}>15 dias</option>
                  <option value={30}>30 dias</option>
                  <option value={60}>60 dias</option>
                  <option value={90}>90 dias</option>
                </select>
                <p className="text-xs text-muted-foreground">Até quantos dias no futuro o cliente pode agendar.</p>
              </div>

              <div className="space-y-2">
                <Label>Antecedência mínima para agendar</Label>
                <select
                  value={formData.minAdvanceMinutes}
                  onChange={(e) => setFormData({ ...formData, minAdvanceMinutes: Number(e.target.value) })}
                  className="h-10 w-full rounded-md border border-input bg-muted/40 px-3 text-sm"
                >
                  <option value={0}>Sem restrição</option>
                  <option value={30}>30 minutos</option>
                  <option value={60}>1 hora</option>
                  <option value={120}>2 horas</option>
                  <option value={240}>4 horas</option>
                  <option value={480}>8 horas</option>
                  <option value={1440}>1 dia</option>
                </select>
                <p className="text-xs text-muted-foreground">Tempo mínimo entre agora e o horário escolhido.</p>
              </div>

              <div className="space-y-2">
                <Label>Antecedência mínima para cancelar</Label>
                <select
                  value={formData.minCancelMinutes}
                  onChange={(e) => setFormData({ ...formData, minCancelMinutes: Number(e.target.value) })}
                  className="h-10 w-full rounded-md border border-input bg-muted/40 px-3 text-sm"
                >
                  <option value={0}>Sem restrição</option>
                  <option value={30}>30 minutos antes</option>
                  <option value={60}>1 hora antes</option>
                  <option value={120}>2 horas antes</option>
                  <option value={240}>4 horas antes</option>
                  <option value={1440}>1 dia antes</option>
                </select>
                <p className="text-xs text-muted-foreground">Cliente não pode cancelar após este prazo.</p>
              </div>

              <div className="flex items-center justify-between border border-border rounded-lg p-4">
                <div className="space-y-1 pr-4">
                  <p className="font-semibold">Horários inteligentes</p>
                  <p className="text-xs text-muted-foreground">
                    Usa a duração do serviço como intervalo, evitando horários sobrepostos
                  </p>
                </div>
                <Switch
                  checked={formData.smartSlots}
                  onCheckedChange={(v) => setFormData({ ...formData, smartSlots: v })}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Página de Agendamento</CardTitle>
              <CardDescription>Link público para seus clientes agendarem online</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user && (
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Link className="h-4 w-4" /> Endereço Personalizado
                  </Label>

                  {slugEditMode ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono bg-muted px-3 py-2 rounded-md">
                        <span className="shrink-0">{window.location.origin}/b/</span>
                        <span className="text-foreground font-semibold">{slugValue || "..."}</span>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          data-testid="input-slug"
                          value={slugValue}
                          onChange={e => handleSlugChange(e.target.value.toLowerCase())}
                          placeholder="minha-barbearia"
                          className={`font-mono text-sm ${slugError ? "border-destructive" : ""}`}
                          autoFocus
                        />
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          disabled={updateSlug.isPending || !!slugError || slugValue === (user.slug ?? "")}
                          onClick={handleSlugSave}
                          data-testid="button-save-slug"
                        >
                          {updateSlug.isPending ? "Salvando..." : "Salvar"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSlugValue(user.slug ?? "");
                            setSlugEditMode(false);
                            setSlugError(null);
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                      {slugError && (
                        <p className="text-xs" style={{ color: "hsl(0 70% 65%)" }}>{slugError}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Use letras minúsculas, números e hífens. Mínimo 3, máximo 80 caracteres.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={user.slug
                            ? `${window.location.origin}/b/${user.slug}`
                            : `${window.location.origin}/booking?shopId=${user.id}`}
                          className="font-mono text-xs bg-muted"
                          data-testid="display-booking-url"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Editar endereço"
                          onClick={() => {
                            setSlugValue(user.slug ?? "");
                            setSlugEditMode(true);
                            setSlugError(null);
                          }}
                          data-testid="button-edit-slug"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Copiar link"
                          onClick={() => {
                            const link = user.slug
                              ? `${window.location.origin}/b/${user.slug}`
                              : `${window.location.origin}/booking?shopId=${user.id}`;
                            navigator.clipboard.writeText(link);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                        >
                          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Compartilhe este link com seus clientes. Clique em <Pencil className="inline h-3 w-3" /> para personalizar o endereço.
                      </p>
                    </div>
                  )}
                </div>
              )}
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

      <Card className="bg-card border-border max-w-5xl">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Descontos por Combo</CardTitle>
            <CardDescription>
              Aplique desconto automático quando o cliente escolher 2 ou mais serviços juntos
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 shrink-0"
            onClick={() => {
              setEditingComboId(null);
              setComboForm({ name: "", serviceIds: [], discountPercent: 10, discountType: "percent" });
              setComboOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Novo combo
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!combos || combos.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nenhum combo configurado. Clique em "Novo combo" para criar.
            </p>
          ) : (
            <div className="space-y-2">
              {combos.map((c) => {
                const names = (c.serviceIds as number[]).map(
                  (id) => services?.find((s) => s.id === id)?.name || `#${id}`
                ).join(" + ");
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between border border-border rounded-lg px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{names}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.discountType === "value"
                          ? `R$ ${Number(c.discountPercent).toFixed(2)} de desconto`
                          : `${c.discountPercent}% de desconto`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingComboId(c.id);
                          setComboForm({
                            name: c.name,
                            serviceIds: c.serviceIds as number[],
                            discountPercent: c.discountPercent,
                            discountType: (c.discountType as "percent" | "value") ?? "percent",
                          });
                          setComboOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleComboDelete(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {comboOpen && (
            <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/20 mt-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {editingComboId ? "Editar combo" : "Novo combo"}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setComboOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Serviços do combo (mínimo 2)</Label>
                {!services || services.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Cadastre serviços primeiro.</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto border border-border rounded-md p-2 bg-background">
                    {services.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 px-1 py-1 cursor-pointer hover:bg-muted/40 rounded text-sm">
                        <input
                          type="checkbox"
                          checked={comboForm.serviceIds.includes(s.id)}
                          onChange={() => handleComboToggleService(s.id)}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="flex-1">{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.durationMinutes} min</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Tipo de desconto</Label>
                <div className="flex rounded-md overflow-hidden border border-border">
                  <button
                    type="button"
                    onClick={() => setComboForm({ ...comboForm, discountType: "percent" })}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      comboForm.discountType === "percent"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    % Porcentagem
                  </button>
                  <button
                    type="button"
                    onClick={() => setComboForm({ ...comboForm, discountType: "value" })}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      comboForm.discountType === "value"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    R$ Valor fixo
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">
                  {comboForm.discountType === "value" ? "Valor do desconto (R$)" : "Desconto (%)"}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    {comboForm.discountType === "value" ? "R$" : "%"}
                  </span>
                  <Input
                    type="number"
                    min="0.01"
                    max={comboForm.discountType === "percent" ? "100" : undefined}
                    step={comboForm.discountType === "value" ? "0.50" : "1"}
                    value={comboForm.discountPercent}
                    onChange={(e) => setComboForm({ ...comboForm, discountPercent: Number(e.target.value) })}
                    className="h-9 pl-9"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setComboOpen(false)}>Cancelar</Button>
                <Button
                  size="sm"
                  onClick={handleComboSave}
                  disabled={createCombo.isPending || updateComboMut.isPending || comboForm.serviceIds.length < 2}
                >
                  {createCombo.isPending || updateComboMut.isPending ? "Salvando..." : "Salvar combo"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loyalty / Fidelidade */}
      <Card className="bg-card border-border max-w-5xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Programa de Fidelidade
          </CardTitle>
          <CardDescription>
            Clientes acumulam pontos a cada agendamento e podem trocar por desconto nas próximas visitas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ativar programa de fidelidade</p>
              <p className="text-xs text-muted-foreground">Habilita acúmulo e resgate de pontos no agendamento</p>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, loyaltyEnabled: !formData.loyaltyEnabled })}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
              style={{ backgroundColor: formData.loyaltyEnabled ? "hsl(38 88% 55%)" : "hsl(0 0% 20%)" }}
            >
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                style={{ transform: formData.loyaltyEnabled ? "translateX(1.375rem)" : "translateX(0.25rem)" }}
              />
            </button>
          </div>

          {formData.loyaltyEnabled && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Pontos por R$ 1,00 gasto</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={formData.loyaltyPointsPerReal}
                    onChange={(e) => setFormData({ ...formData, loyaltyPointsPerReal: Number(e.target.value) })}
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">Ex: 10 → cliente ganha 10 pts por R$1</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Pontos para R$ 1,00 de desconto</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={formData.loyaltyPointsPerRedemptionUnit}
                    onChange={(e) => setFormData({ ...formData, loyaltyPointsPerRedemptionUnit: Number(e.target.value) })}
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">Ex: 100 → 100 pts = R$1 de desconto</p>
                </div>
              </div>

              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{ backgroundColor: "hsl(38 88% 55% / 0.08)", border: "1px solid hsl(38 88% 55% / 0.2)" }}
              >
                Em um serviço de R$50: cliente acumula{" "}
                <strong>{(formData.loyaltyPointsPerReal * 50).toLocaleString("pt-BR")} pts</strong>. Com{" "}
                <strong>{formData.loyaltyPointsPerRedemptionUnit} pts</strong> ele ganha{" "}
                <strong>R$ 1,00</strong> de desconto.
              </div>
            </div>
          )}

          {/* Clients list */}
          {loyaltyClients && loyaltyClients.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-sm font-semibold">Extrato de clientes</p>
              <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                {loyaltyClients.map((c) => (
                  <div
                    key={c.clientPhone}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">{c.clientPhone}</span>
                    <span className="font-semibold tabular-nums">
                      {c.points.toLocaleString("pt-BR")} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Assinaturas ─────────────────────────────────────────────────────── */}
      <Card className="bg-card border-border max-w-5xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle>Planos de Assinatura</CardTitle>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setEditingPlanId(null);
                setPlanForm({ name: "", description: "", price: "", maxPerMonth: "", active: true });
                setPlanOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Novo Plano
            </Button>
          </div>
          <CardDescription>
            Crie planos mensais para clientes fiéis. Exibidos na página de agendamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Plan form */}
          {planOpen && (
            <div
              className="rounded-xl p-4 space-y-4 border"
              style={{ backgroundColor: "hsl(0 0% 7%)", borderColor: "hsl(38 88% 55% / 0.35)" }}
            >
              <p className="font-semibold text-sm">{editingPlanId ? "Editar plano" : "Novo plano"}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome do plano *</Label>
                  <Input
                    value={planForm.name}
                    onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                    placeholder="Ex: Plano Mensal Básico"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Preço mensal (R$) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={planForm.price}
                    onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                    placeholder="49.90"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Máx. cortes/mês (vazio = ilimitado)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={planForm.maxPerMonth}
                    onChange={(e) => setPlanForm({ ...planForm, maxPerMonth: e.target.value })}
                    placeholder="4"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Descrição / benefícios</Label>
                  <Input
                    value={planForm.description}
                    onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                    placeholder="Ex: 4 cortes por mês, prioridade na agenda"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPlanForm({ ...planForm, active: !planForm.active })}
                    className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
                    style={{ backgroundColor: planForm.active ? "hsl(38 88% 55%)" : "hsl(0 0% 20%)" }}
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                      style={{ transform: planForm.active ? "translateX(1.125rem)" : "translateX(0.2rem)" }}
                    />
                  </button>
                  <span className="text-xs text-muted-foreground">Ativo (visível no agendamento)</span>
                </div>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setPlanOpen(false); setEditingPlanId(null); }}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handlePlanSave}
                  disabled={createPlan.isPending || updatePlanMut.isPending}
                >
                  {editingPlanId ? "Salvar" : "Criar"}
                </Button>
              </div>
            </div>
          )}

          {/* Plans list */}
          {!subscriptionPlans || subscriptionPlans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <CreditCard className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm">Nenhum plano criado ainda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {subscriptionPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm">{plan.name}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      R$ {plan.price.toFixed(2).replace(".", ",")}/mês
                      {plan.maxAppointmentsPerMonth
                        ? ` · até ${plan.maxAppointmentsPerMonth} cortes`
                        : " · cortes ilimitados"}
                      {plan.description ? ` · ${plan.description}` : ""}
                    </p>
                  </div>
                  {/* 1-click active toggle */}
                  <button
                    type="button"
                    title={plan.active ? "Desativar plano" : "Ativar plano"}
                    disabled={updatePlanMut.isPending}
                    onClick={() =>
                      updatePlanMut.mutate(
                        { id: plan.id, data: { active: !plan.active } },
                        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSubscriptionPlansQueryKey() }) }
                      )
                    }
                    className="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: plan.active ? "hsl(38 88% 55% / 0.15)" : "hsl(0 0% 15%)",
                      color: plan.active ? "hsl(38 88% 55%)" : "hsl(0 0% 50%)",
                      border: `1px solid ${plan.active ? "hsl(38 88% 55% / 0.4)" : "hsl(0 0% 22%)"}`,
                      cursor: updatePlanMut.isPending ? "not-allowed" : "pointer",
                    }}
                  >
                    <span
                      className="inline-block rounded-full"
                      style={{
                        width: 7,
                        height: 7,
                        backgroundColor: plan.active ? "hsl(38 88% 55%)" : "hsl(0 0% 45%)",
                      }}
                    />
                    {plan.active ? "Ativo" : "Inativo"}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 h-7 w-7 p-0"
                    onClick={() => {
                      setEditingPlanId(plan.id);
                      setPlanForm({
                        name: plan.name,
                        description: plan.description ?? "",
                        price: String(plan.price),
                        maxPerMonth: plan.maxAppointmentsPerMonth ? String(plan.maxAppointmentsPerMonth) : "",
                        active: plan.active,
                      });
                      setPlanOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => handlePlanDelete(plan.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Subscriber list */}
          {subscriptions && subscriptions.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-border">
              <p className="text-sm font-semibold">Assinantes</p>
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {subscriptions.map((sub) => {
                  const plan = subscriptionPlans?.find((p) => p.id === sub.planId);
                  return (
                    <div
                      key={sub.id}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{sub.clientName}</span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
                            style={{
                              backgroundColor: sub.status === "active"
                                ? "hsl(142 71% 45% / 0.15)"
                                : sub.status === "pending"
                                  ? "hsl(38 88% 55% / 0.15)"
                                  : "hsl(0 0% 15%)",
                              color: sub.status === "active"
                                ? "hsl(142 71% 45%)"
                                : sub.status === "pending"
                                  ? "hsl(38 88% 55%)"
                                  : "hsl(0 0% 50%)",
                            }}
                          >
                            {sub.status === "active" ? "Ativo" : sub.status === "pending" ? "Pendente" : "Cancelado"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {sub.clientPhone} · {plan?.name ?? `Plano #${sub.planId}`}
                        </p>
                      </div>
                      {sub.status !== "active" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 h-7 gap-1 text-xs text-green-500 hover:text-green-400"
                          onClick={() => handleSubStatus(sub.id, "active")}
                        >
                          <BadgeCheck className="h-3.5 w-3.5" /> Ativar
                        </Button>
                      )}
                      {sub.status !== "cancelled" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 h-7 gap-1 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleSubStatus(sub.id, "cancelled")}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Cancelar
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end max-w-5xl">
        <Button onClick={handleSave} disabled={updateSettings.isPending} className="gap-2">
          <Save className="h-4 w-4" /> Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
