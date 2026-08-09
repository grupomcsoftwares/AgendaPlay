import React, { useRef, useState } from "react";

type DaySchedule = { closed: boolean; open: string; close: string; lunchStart: string; lunchEnd: string };
const DAY_KEYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const;
type DayKey = typeof DAY_KEYS[number];
type WeeklySchedule = Record<DayKey, DaySchedule>;
const DAY_LABELS: Record<DayKey, string> = {
  monday: "Segunda", tuesday: "Terça", wednesday: "Quarta", thursday: "Quinta",
  friday: "Sexta", saturday: "Sábado", sunday: "Domingo",
};
const DEFAULT_DAY: DaySchedule = { closed: false, open: "09:00", close: "18:00", lunchStart: "12:00", lunchEnd: "13:00" };
const DEFAULT_WEEKLY: WeeklySchedule = {
  monday: { ...DEFAULT_DAY }, tuesday: { ...DEFAULT_DAY }, wednesday: { ...DEFAULT_DAY },
  thursday: { ...DEFAULT_DAY }, friday: { ...DEFAULT_DAY },
  saturday: { ...DEFAULT_DAY }, sunday: { ...DEFAULT_DAY, closed: true },
};
import {
  useListBarbers,
  useCreateBarber,
  useUpdateBarber,
  useDeleteBarber,
  useListServices,
  getListBarbersQueryKey,
  getListServicesQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, User, Upload, X, ImageIcon, Power, CreditCard, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

function BarberPhotoUpload({
  photoUrl,
  onPick,
  onRemove,
}: {
  photoUrl: string;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openPicker = () => inputRef.current?.click();

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Foto do barbeiro
      </Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="input-barber-photo-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />

      <div className="flex items-center gap-4">
        <div
          className="w-24 h-24 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
          style={{ backgroundColor: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="Barbeiro" className="w-full h-full object-cover" />
          ) : (
            <User className="w-10 h-10 text-muted-foreground/40" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={openPicker} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            {photoUrl ? "Trocar foto" : "Enviar foto"}
          </Button>
          {photoUrl && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRemove}
              data-testid="button-remove-barber-photo"
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" /> Remover
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Barbers() {
  const { data: barbers, isLoading } = useListBarbers(undefined, { query: { queryKey: getListBarbersQueryKey() } });
  const { data: services } = useListServices(undefined, { query: { queryKey: getListServicesQueryKey() } });
  const createBarber = useCreateBarber();
  const updateBarber = useUpdateBarber();
  const deleteBarber = useDeleteBarber();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [changingPlanId, setChangingPlanId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    photoUrl: string;
    bio: string;
    active: boolean;
    serviceIds: number[];
    weeklySchedule: WeeklySchedule | null;
    commissionRate: number | null;
  }>({ name: "", photoUrl: "", bio: "", active: true, serviceIds: [], weeklySchedule: null, commissionRate: null });

  const { data: subscriptionStatus } = useQuery<{
    hasActiveSubscription: boolean;
    stripePriceId: string | null;
    maxBarbers: number | null;
  }>({
    queryKey: ["stripe-subscription-status"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/subscription-status", { credentials: "include" });
      if (!res.ok) throw new Error("Não foi possível consultar a assinatura.");
      return res.json();
    },
    staleTime: 60_000,
  });

  type UpgradePlan = {
    price_id: string;
    product_name: string;
    unit_amount: number;
    currency: string;
    maxBarbers: number | null;
  };

  const { data: upgradePlans, isLoading: plansLoading } = useQuery<{ data: UpgradePlan[] }>({
    queryKey: ["stripe-plans"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/plans");
      if (!res.ok) throw new Error("Não foi possível carregar os planos.");
      return res.json();
    },
    staleTime: 5 * 60_000,
    enabled: planDialogOpen,
  });

  const activeBarberCount = barbers?.filter((barber) => barber.active).length ?? 0;
  const hasReachedBarberLimit =
    editingId === null &&
    subscriptionStatus?.maxBarbers != null &&
    subscriptionStatus.maxBarbers > 0 &&
    activeBarberCount >= subscriptionStatus.maxBarbers;

  const resetForm = () => {
    setFormData({ name: "", photoUrl: "", bio: "", active: true, serviceIds: [], weeklySchedule: null, commissionRate: null });
    setEditingId(null);
  };

  const updateDay = (key: DayKey, patch: Partial<DaySchedule>) => {
    setFormData((f) => {
      const base = f.weeklySchedule ?? DEFAULT_WEEKLY;
      return { ...f, weeklySchedule: { ...base, [key]: { ...base[key], ...patch } } };
    });
  };

  const handlePhoto = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione um arquivo de imagem", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagem muito grande (máx. 2MB)", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFormData((f) => ({ ...f, photoUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListBarbersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
  };

  const openNewBarber = () => {
    if (hasReachedBarberLimit) {
      setPlanDialogOpen(true);
      return;
    }
    resetForm();
    setIsOpen(true);
  };

  const handleSave = () => {
    if (!formData.name.trim()) return;
    const payload = {
      name: formData.name.trim(),
      photoUrl: formData.photoUrl || undefined,
      bio: formData.bio || undefined,
      active: formData.active,
      serviceIds: formData.serviceIds,
      weeklySchedule: formData.weeklySchedule,
      commissionRate: formData.commissionRate,
    };
    if (editingId) {
      updateBarber.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            invalidate();
            setIsOpen(false);
            resetForm();
            toast({ title: "Barbeiro atualizado" });
          },
        },
      );
    } else {
      createBarber.mutate(
        { data: payload },
        {
          onSuccess: () => {
            invalidate();
            setIsOpen(false);
            resetForm();
            toast({ title: "Barbeiro cadastrado" });
          },
          onError: (error) => {
            const details = (error as { data?: unknown }).data as
              | { code?: string; error?: string }
              | undefined;
            if (details?.code === "BARBER_LIMIT_REACHED") {
              setIsOpen(false);
              resetForm();
              setPlanDialogOpen(true);
              return;
            }
            toast({
              title: "Não foi possível cadastrar o barbeiro",
              description: details?.error ?? (error instanceof Error ? error.message : "Tente novamente."),
              variant: "destructive",
            });
          },
        },
      );
    }
  };

  const handleChangePlan = async (priceId: string) => {
    setChangingPlanId(priceId);
    try {
      const hasActiveSubscription = subscriptionStatus?.hasActiveSubscription === true;
      const res = await fetch(hasActiveSubscription ? "/api/stripe/change-plan" : "/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; url?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Não foi possível iniciar o pagamento.");
      }
      if (!hasActiveSubscription) {
        if (!data.url) throw new Error("O servidor não retornou o link de pagamento.");
        window.location.href = data.url;
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["stripe-subscription-status"] });
      setPlanDialogOpen(false);
      toast({ title: "Plano atualizado", description: "Agora você já pode cadastrar o novo barbeiro." });
    } catch (error) {
      toast({
        title: subscriptionStatus?.hasActiveSubscription
          ? "Não foi possível trocar de plano"
          : "Não foi possível iniciar o pagamento",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setChangingPlanId(null);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja remover este barbeiro?")) {
      deleteBarber.mutate(
        { id },
        {
          onSuccess: () => {
            invalidate();
            toast({ title: "Barbeiro removido" });
          },
        },
      );
    }
  };

  const toggleActive = (id: number, current: boolean) => {
    updateBarber.mutate(
      { id, data: { active: !current } },
      { onSuccess: () => invalidate() },
    );
  };

  const toggleServiceInForm = (sid: number) => {
    setFormData((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(sid)
        ? f.serviceIds.filter((x) => x !== sid)
        : [...f.serviceIds, sid],
    }));
  };

  return (
    <div className="flex-1 p-4 md:p-8 bg-background overflow-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Barbeiros</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Cadastre os profissionais que atendem. Quando houver mais de um, o cliente escolhe na hora de agendar.
          </p>
          <div
            className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100 sm:max-w-xl sm:text-sm"
            data-testid="barber-plan-reminder"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p>
              <span className="font-semibold">Lembrete:</span> para cadastrar mais barbeiros além do limite do seu plano,
              é obrigatório mudar de plano.
            </p>
          </div>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
          <Button className="gap-2" onClick={openNewBarber} data-testid="button-new-barber">
            <Plus className="h-4 w-4" /> Novo Barbeiro
          </Button>
          <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden border-border/60">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                {editingId ? "Editar barbeiro" : "Novo barbeiro"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {editingId
                  ? "Atualize as informações do profissional."
                  : "Cadastre um profissional que poderá atender clientes."}
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <BarberPhotoUpload
                photoUrl={formData.photoUrl}
                onPick={handlePhoto}
                onRemove={() => setFormData({ ...formData, photoUrl: "" })}
              />

              <div className="space-y-1.5">
                <Label htmlFor="barber-name" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Nome
                </Label>
                <Input
                  id="barber-name"
                  data-testid="input-barber-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: João Silva"
                  className="h-11 bg-muted/40 border-border/60 focus-visible:bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="barber-bio" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Especialidade / descrição
                </Label>
                <Textarea
                  id="barber-bio"
                  data-testid="input-barber-bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Ex: Especialista em barbas (opcional)"
                  rows={2}
                  className="resize-none bg-muted/40 border-border/60 focus-visible:bg-background"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 bg-muted/30">
                <div>
                  <p className="text-sm font-medium">Ativo</p>
                  <p className="text-xs text-muted-foreground">Aparece para o cliente na hora de agendar</p>
                </div>
                <Switch
                  checked={formData.active}
                  onCheckedChange={(c) => setFormData({ ...formData, active: c })}
                  data-testid="switch-barber-active"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="barber-commission" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Comissão (%)
                </Label>
                <Input
                  id="barber-commission"
                  data-testid="input-barber-commission"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={formData.commissionRate ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData({ ...formData, commissionRate: v === "" ? null : parseFloat(v) });
                  }}
                  placeholder="Ex: 40 (opcional)"
                  className="h-11 bg-muted/40 border-border/60 focus-visible:bg-background"
                />
                <p className="text-xs text-muted-foreground">
                  Percentual de comissão do profissional sobre cada atendimento.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Serviços que faz
                </Label>
                {!services || services.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Cadastre serviços primeiro para poder atribuí-los.</p>
                ) : (
                  <div className="space-y-1.5 rounded-lg border border-border/60 p-2 bg-muted/30 max-h-56 overflow-y-auto">
                    {services.map((s) => {
                      const checked = formData.serviceIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex items-center gap-3 px-2 py-2 rounded cursor-pointer hover:bg-muted/60"
                          data-testid={`label-barber-service-${s.id}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleServiceInForm(s.id)}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm flex-1">{s.name}</span>
                          <span className="text-xs text-muted-foreground">{s.durationMinutes} min</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Se nenhum for marcado, o barbeiro será considerado capaz de fazer <strong>todos</strong> os serviços.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">Horário próprio</p>
                    <p className="text-xs text-muted-foreground">
                      {formData.weeklySchedule
                        ? "Este barbeiro usa o horário definido abaixo."
                        : "Usa o horário geral da barbearia (Configurações)."}
                    </p>
                  </div>
                  <Switch
                    checked={formData.weeklySchedule !== null}
                    onCheckedChange={(c) =>
                      setFormData((f) => ({ ...f, weeklySchedule: c ? (f.weeklySchedule ?? DEFAULT_WEEKLY) : null }))
                    }
                    data-testid="switch-barber-own-schedule"
                  />
                </div>

                {formData.weeklySchedule && (
                  <div className="space-y-2 rounded-lg border border-border/60 p-3 bg-muted/20">
                    {DAY_KEYS.map((key) => {
                      const day = (formData.weeklySchedule ?? DEFAULT_WEEKLY)[key];
                      return (
                        <div
                          key={key}
                          className="rounded-md border border-border/40 p-3 space-y-2 bg-background/40"
                          data-testid={`barber-schedule-day-${key}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">{DAY_LABELS[key]}</span>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">
                                {day.closed ? "Fechado" : "Aberto"}
                              </Label>
                              <Switch
                                checked={!day.closed}
                                onCheckedChange={(v) => updateDay(key, { closed: !v })}
                                data-testid={`barber-switch-open-${key}`}
                              />
                            </div>
                          </div>
                          {!day.closed && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Abertura</Label>
                                  <Input
                                    type="time"
                                    className="h-9"
                                    value={day.open}
                                    onChange={(e) => updateDay(key, { open: e.target.value })}
                                    data-testid={`barber-input-open-${key}`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Fechamento</Label>
                                  <Input
                                    type="time"
                                    className="h-9"
                                    value={day.close}
                                    onChange={(e) => updateDay(key, { close: e.target.value })}
                                    data-testid={`barber-input-close-${key}`}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Início almoço</Label>
                                  <Input
                                    type="time"
                                    className="h-9"
                                    value={day.lunchStart}
                                    onChange={(e) => updateDay(key, { lunchStart: e.target.value })}
                                    data-testid={`barber-input-lunch-start-${key}`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Fim almoço</Label>
                                  <Input
                                    type="time"
                                    className="h-9"
                                    value={day.lunchEnd}
                                    onChange={(e) => updateDay(key, { lunchEnd: e.target.value })}
                                    data-testid={`barber-input-lunch-end-${key}`}
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border/60 bg-muted/20 sm:justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsOpen(false)} data-testid="button-cancel-barber">
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={!formData.name.trim() || createBarber.isPending || updateBarber.isPending}
                data-testid="button-save-barber"
                className="min-w-[120px]"
              >
                {createBarber.isPending || updateBarber.isPending
                  ? "Salvando..."
                  : editingId
                    ? "Salvar alterações"
                    : "Cadastrar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                Limite de barbeiros atingido
              </DialogTitle>
              <DialogDescription>
                Seu plano atual permite até {subscriptionStatus?.maxBarbers ?? activeBarberCount}{" "}
                {subscriptionStatus?.maxBarbers === 1 ? "profissional" : "profissionais"}.
                Escolha um plano maior para cadastrar outro barbeiro.
              </DialogDescription>
            </DialogHeader>

            {plansLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Carregando planos...
              </div>
            ) : upgradePlans?.data?.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {upgradePlans.data.map((plan) => {
                  const isCurrent = plan.price_id === subscriptionStatus?.stripePriceId;
                  const barberLabel = plan.maxBarbers == null || plan.maxBarbers === 0
                    ? "Profissionais ilimitados"
                    : `Até ${plan.maxBarbers} ${plan.maxBarbers === 1 ? "profissional" : "profissionais"}`;
                  return (
                    <div
                      key={plan.price_id}
                      className={`rounded-xl border p-4 ${isCurrent ? "border-primary/70 bg-primary/5" : "border-border bg-muted/20"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{plan.product_name}</p>
                          <p className="text-xs text-muted-foreground">{barberLabel}</p>
                        </div>
                        {isCurrent && (
                          <Badge variant="secondary" className="shrink-0">Plano atual</Badge>
                        )}
                      </div>
                      <p className="mt-3 text-xl font-bold">
                        {(plan.unit_amount / 100).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: plan.currency.toUpperCase(),
                        })}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">/mês</span>
                      </p>
                      <Button
                        className="mt-4 w-full gap-2"
                        variant={isCurrent ? "outline" : "default"}
                        disabled={isCurrent || changingPlanId !== null}
                        onClick={() => handleChangePlan(plan.price_id)}
                      >
                        {changingPlanId === plan.price_id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <CreditCard className="h-4 w-4" />
                        )}
                        {isCurrent
                          ? "Plano atual"
                          : changingPlanId === plan.price_id
                            ? subscriptionStatus?.hasActiveSubscription ? "Atualizando..." : "Abrindo checkout..."
                            : subscriptionStatus?.hasActiveSubscription ? "Trocar para este plano" : "Ir para pagamento"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Não foi possível carregar os planos agora. Tente novamente em instantes.
              </p>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-border rounded-lg bg-card">
        {isLoading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !barbers || barbers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <User className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">Nenhum barbeiro cadastrado</h3>
            <p className="text-muted-foreground max-w-sm mt-1">
              Sem barbeiros cadastrados, o agendamento funciona normalmente sem escolha de profissional.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {barbers.map((b) => {
                const serviceNames = b.serviceIds.length === 0
                  ? "Todos"
                  : (services ?? []).filter((s) => b.serviceIds.includes(s.id)).map((s) => s.name).join(", ") || "—";
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3" data-testid={`row-barber-${b.id}`}>
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      {b.photoUrl ? (
                        <img src={b.photoUrl} alt={b.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{b.name}</p>
                        <Badge variant={b.active ? "default" : "secondary"} className="text-xs shrink-0" data-testid={`badge-barber-status-${b.id}`}>
                          {b.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{serviceNames}</p>
                      {b.commissionRate != null && (
                        <p className="text-xs text-muted-foreground">Comissão: {b.commissionRate}%</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" title={b.active ? "Desativar" : "Ativar"} onClick={() => toggleActive(b.id, b.active)} data-testid={`button-toggle-barber-${b.id}`}><Power className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" data-testid={`button-edit-barber-${b.id}`} onClick={() => { setEditingId(b.id); setFormData({ name: b.name, photoUrl: b.photoUrl || "", bio: b.bio || "", active: b.active, serviceIds: [...b.serviceIds], weeklySchedule: (b.weeklySchedule as WeeklySchedule | null | undefined) ?? null, commissionRate: b.commissionRate ?? null }); setIsOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(b.id)} data-testid={`button-delete-barber-${b.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[72px]">Foto</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Serviços</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {barbers.map((b) => {
                    const serviceNames = b.serviceIds.length === 0
                      ? "Todos"
                      : (services ?? []).filter((s) => b.serviceIds.includes(s.id)).map((s) => s.name).join(", ") || "—";
                    return (
                      <TableRow key={b.id} data-testid={`row-barber-${b.id}`}>
                        <TableCell>
                          <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                            {b.photoUrl ? (
                              <img src={b.photoUrl} alt={b.name} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-5 h-5 text-muted-foreground/40" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {b.name}
                          {b.bio && <p className="text-xs text-muted-foreground">{b.bio}</p>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{serviceNames}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {b.commissionRate != null ? `${b.commissionRate}%` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.active ? "default" : "secondary"} data-testid={`badge-barber-status-${b.id}`}>
                            {b.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" title={b.active ? "Desativar" : "Ativar"} onClick={() => toggleActive(b.id, b.active)} data-testid={`button-toggle-barber-${b.id}`}><Power className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" data-testid={`button-edit-barber-${b.id}`} onClick={() => { setEditingId(b.id); setFormData({ name: b.name, photoUrl: b.photoUrl || "", bio: b.bio || "", active: b.active, serviceIds: [...b.serviceIds], weeklySchedule: (b.weeklySchedule as WeeklySchedule | null | undefined) ?? null, commissionRate: b.commissionRate ?? null }); setIsOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(b.id)} data-testid={`button-delete-barber-${b.id}`}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
