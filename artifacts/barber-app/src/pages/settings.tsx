import React, { useEffect, useRef, useState } from "react";
import {
  useGetSettings, useUpdateSettings, useUpdateUserSlug, getGetSettingsQueryKey,
  useListComboDiscounts, useCreateComboDiscount, useUpdateComboDiscount, useDeleteComboDiscount, getListComboDiscountsQueryKey,
  useListServices, getListServicesQueryKey,
  useListLoyaltyClients, getListLoyaltyClientsQueryKey,
  useDeleteAccount,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Upload, Trash2, Scissors, Link, Copy, Check, Pencil, Plus, X, Gift, AlertTriangle, Bell, BellOff, Printer, CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}

type SubscriberMonthlyUsage = {
  id: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  status: string;
  expiresAt: string | null;
  renewedAt: string | null;
  planId: number;
  planName: string | null;
  maxAppointmentsPerMonth: number | null;
  cutsUsedThisMonth: number;
};

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

type DaySchedule = {
  closed: boolean;
  open: string;
  close: string;
  lunchStart: string;
  lunchEnd: string;
};

type WeeklySchedule = Record<DayKey, DaySchedule>;
type LoyaltyExpirationDays = 0 | 30 | 60 | 90;
type LoyaltyExpirationWarningDays = 7 | 15 | 30;

const normalizeLoyaltyExpirationDays = (value: number | undefined): LoyaltyExpirationDays => {
  return value === 30 || value === 60 || value === 90 ? value : 0;
};
const normalizeLoyaltyExpirationWarningDays = (value: number | undefined): LoyaltyExpirationWarningDays => {
  if (value === 15 || value === 30) return value;
  return 7;
};

const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: "monday",    label: "Segunda-feira", short: "Segunda" },
  { key: "tuesday",  label: "Terça-feira",   short: "Terça"   },
  { key: "wednesday",label: "Quarta-feira",  short: "Quarta"  },
  { key: "thursday", label: "Quinta-feira",  short: "Quinta"  },
  { key: "friday",   label: "Sexta-feira",   short: "Sexta"   },
  { key: "saturday", label: "Sábado",        short: "Sábado"  },
  { key: "sunday",   label: "Domingo",       short: "Domingo" },
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
  const deleteAccount = useDeleteAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, refresh, logout } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: combos } = useListComboDiscounts(undefined, { query: { queryKey: getListComboDiscountsQueryKey() } });
  const { data: services } = useListServices(undefined, { query: { queryKey: getListServicesQueryKey() } });
  const createCombo = useCreateComboDiscount();
  const updateComboMut = useUpdateComboDiscount();
  const deleteCombo = useDeleteComboDiscount();

  const [comboOpen, setComboOpen] = useState(false);
  const [editingComboId, setEditingComboId] = useState<number | null>(null);
  const [comboForm, setComboForm] = useState({ name: "", serviceIds: [] as number[], discountPercent: 10, discountType: "percent" as "percent" | "value", timeDiscountMinutes: 0 });

  const [slugValue, setSlugValue] = useState(user?.slug ?? "");
  const [slugEditMode, setSlugEditMode] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const initializedRef = useRef(false);
  const skipInitialAutoSaveRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: loyaltyClients } = useListLoyaltyClients({ query: { queryKey: getListLoyaltyClientsQueryKey() } });

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

  const [renewingId, setRenewingId] = useState<number | null>(null);
  async function handleRenewSubscription(id: number) {
    setRenewingId(id);
    try {
      const res = await fetch(`/api/subscriptions/${id}/renew`, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: data.error ?? "Erro ao renovar assinatura", variant: "destructive" });
        return;
      }
      toast({ title: "Assinatura renovada com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["subscriptions-monthly-usage"] });
    } finally {
      setRenewingId(null);
    }
  }

  const [exclusionOpen, setExclusionOpen] = useState(false);
  const [exclusionForm, setExclusionForm] = useState<{ id1: number | null; id2: number | null }>({ id1: null, id2: null });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [nativePush, setNativePush] = useState(false);

  // Subscription management
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const { data: subscriptionStatus } = useQuery<{
    hasActiveSubscription: boolean;
    subscriptionId: string | null;
    stripePriceId: string | null;
    maxBarbers: number | null;
    trialDaysLeft: number;
    trialExpired: boolean;
    canAccess: boolean;
    subscriptionDueDate: string | null;
    subscriptionDaysLeft: number | null;
  }>({
    queryKey: ["stripe-subscription-status"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/subscription-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch subscription status");
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: stripeePlans } = useQuery<{
    data: Array<{ price_id: string; product_name: string; unit_amount: number; currency: string; maxBarbers: number | null }>;
  }>({
    queryKey: ["stripe-plans"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/plans");
      if (!res.ok) return { data: [] };
      return res.json();
    },
    staleTime: 5 * 60_000,
    enabled: !!subscriptionStatus?.hasActiveSubscription,
  });

  const currentPlan = stripeePlans?.data?.find(
    (p) => p.price_id === subscriptionStatus?.stripePriceId
  );

  const openCustomerPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/customer-portal", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: data.error ?? "Erro ao abrir portal de assinatura", variant: "destructive" });
        return;
      }
      const { url } = await res.json() as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Não foi possível abrir o portal. Tente novamente.", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  const [formData, setFormData] = useState<{
    barbershopName: string;
    ownerName: string;
    logoUrl: string;
    phone: string;
    address: string;
    bookingPageMessage: string;
    weeklySchedule: WeeklySchedule;
    paymentEnableNow: boolean;
    paymentEnableOnSite: boolean;
    pixKey: string;
    maxBookingDays: number;
    minAdvanceMinutes: number;
    minCancelMinutes: number;
    slotIntervalMinutes: number;
    smartSlots: boolean;
    loyaltyEnabled: boolean;
    loyaltyPointsPerReal: number;
    loyaltyPointsPerRedemptionUnit: number;
    loyaltyPointsExpirationDays: 0 | 30 | 60 | 90;
    loyaltyPointsExpirationWarningDays: 7 | 15 | 30;
    clientReengagementEnabled: boolean;
    clientReengagementDays: 15 | 30;
    clientReengagementMessage: string;
    serviceExclusions: { services: [number, number]; enabled: boolean }[];
    combosEnabled: boolean;
    serviceRestrictionsEnabled: boolean;
    receiptPrinterSize: "50mm" | "58mm" | "80mm" | "A4";
    bookingEnabled: boolean;
  }>({
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
    loyaltyPointsExpirationDays: 0 as LoyaltyExpirationDays,
    loyaltyPointsExpirationWarningDays: 7 as LoyaltyExpirationWarningDays,
    clientReengagementEnabled: false,
    clientReengagementDays: 30,
    clientReengagementMessage: "Olá {{nome}}, estamos sentindo sua falta! Já faz {{dias}} dias que você agendou um horário. Agende novamente com a {{barbearia}}.",
    serviceExclusions: [],
    combosEnabled: true,
    serviceRestrictionsEnabled: true,
    receiptPrinterSize: "80mm",
    bookingEnabled: true,
  });

  useEffect(() => {
    if (settings && !initializedRef.current) {
      initializedRef.current = true;
      skipInitialAutoSaveRef.current = true;
      const incoming = (settings.weeklySchedule as WeeklySchedule | null | undefined) ?? null;
      const merged = defaultWeeklySchedule();
      if (incoming) {
        for (const { key } of DAYS) {
          if (incoming[key]) merged[key] = { ...merged[key], ...incoming[key] };
        }
      }
      const lc = settings.loyaltyConfig as { enabled?: boolean; pointsPerReal?: number; pointsPerRedemptionUnit?: number; expirationDays?: number; expirationWarningDays?: number } | null | undefined;
      const rc = (settings as any).clientReengagementConfig as { enabled?: boolean; inactiveDays?: number; message?: string } | null | undefined;
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
        maxBookingDays: (() => { const v = settings.maxBookingDays ?? 30; const opts = [7, 15, 30, 60, 90]; return opts.includes(v) ? v : (opts.find(o => o >= v) ?? 90); })(),
        minAdvanceMinutes: settings.minAdvanceMinutes ?? 0,
        minCancelMinutes: settings.minCancelMinutes ?? 0,
        slotIntervalMinutes: settings.slotIntervalMinutes ?? 15,
        smartSlots: settings.smartSlots ?? false,
        loyaltyEnabled: lc?.enabled ?? false,
        loyaltyPointsPerReal: lc?.pointsPerReal ?? 10,
        loyaltyPointsPerRedemptionUnit: lc?.pointsPerRedemptionUnit ?? 100,
        loyaltyPointsExpirationDays: normalizeLoyaltyExpirationDays(lc?.expirationDays),
        loyaltyPointsExpirationWarningDays: normalizeLoyaltyExpirationWarningDays(lc?.expirationWarningDays),
        clientReengagementEnabled: rc?.enabled ?? false,
        clientReengagementDays: rc?.inactiveDays === 15 ? 15 : 30,
        clientReengagementMessage: rc?.message || "Olá {{nome}}, estamos sentindo sua falta! Já faz {{dias}} dias que você agendou um horário. Agende novamente com a {{barbearia}}.",
        serviceExclusions: ((settings.serviceExclusions ?? []) as unknown[]).map(item =>
          Array.isArray(item)
            ? { services: [item[0], item[1]] as [number, number], enabled: true }
            : item as { services: [number, number]; enabled: boolean }
        ),
        combosEnabled: (settings as any).combosEnabled ?? true,
        serviceRestrictionsEnabled: (settings as any).serviceRestrictionsEnabled ?? true,
        receiptPrinterSize: ((settings as any).receiptPrinterSize as "50mm" | "58mm" | "80mm" | "A4") || "80mm",
        bookingEnabled: (settings as any).bookingEnabled ?? true,
      });
    }
  }, [settings]);

  // Keep refs in sync so automatic saves and unmount cleanup always have fresh values.
  const formDataRef = useRef(formData);
  useEffect(() => { formDataRef.current = formData; }, [formData]);
  const updateSettingsRef = useRef(updateSettings);
  useEffect(() => { updateSettingsRef.current = updateSettings; }, [updateSettings]);

  const buildSettingsPayload = (fd: typeof formData) => ({
    ...fd,
    logoUrl: fd.logoUrl || null,
    pixKey: fd.pixKey || null,
    loyaltyConfig: {
      enabled: fd.loyaltyEnabled,
      pointsPerReal: fd.loyaltyPointsPerReal,
      pointsPerRedemptionUnit: fd.loyaltyPointsPerRedemptionUnit,
      expirationDays: fd.loyaltyPointsExpirationDays,
      expirationWarningDays: fd.loyaltyPointsExpirationWarningDays,
    },
    clientReengagementConfig: {
      enabled: fd.clientReengagementEnabled,
      inactiveDays: fd.clientReengagementDays,
      message: fd.clientReengagementMessage.trim(),
    },
    receiptPrinterSize: fd.receiptPrinterSize,
    serviceExclusions: fd.serviceExclusions,
  } as any);

  const persistSettings = (fd: typeof formData, showToast = false) => {
    updateSettingsRef.current.mutate(
      { data: buildSettingsPayload(fd) },
      {
        onSuccess: (saved) => {
          // Keep the current page and the next page in sync with the confirmed server value.
          queryClient.setQueryData(getGetSettingsQueryKey(), saved);
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          if (showToast) toast({ title: "Configurações salvas!" });
        },
        onError: () => {
          if (showToast) {
            toast({ title: "Não foi possível salvar as configurações.", variant: "destructive" });
          }
        },
      },
    );
  };

  // Save changes automatically shortly after the user stops editing.
  useEffect(() => {
    if (!initializedRef.current) return;
    if (skipInitialAutoSaveRef.current) {
      skipInitialAutoSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistSettings(formDataRef.current);
      saveTimerRef.current = null;
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  // Flush the latest values when leaving before the debounce has elapsed.
  useEffect(() => {
    return () => {
      if (!initializedRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      persistSettings(formDataRef.current, true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleDeleteAccount = () => {
    if (!deleteEmail.trim() || !deletePassword) {
      toast({ title: "Preencha email e senha", variant: "destructive" });
      return;
    }
    deleteAccount.mutate(
      { data: { email: deleteEmail.trim(), password: deletePassword } },
      {
        onSuccess: async () => {
          await logout();
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Erro ao excluir conta";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handlePushToggle = async () => {
    if (typeof window !== "undefined" && window.ReactNativeWebView) {
      setPushLoading(true);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "AGENDAPLAY_NATIVE_PUSH",
        action: pushEnabled ? "unsubscribe" : "subscribe",
      }));
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast({ title: "Notificações push não suportadas neste navegador", variant: "destructive" });
      return;
    }
    setPushLoading(true);
    try {
      if (pushEnabled) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/admin/unsubscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
            credentials: "include",
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        toast({ title: "Notificações desativadas" });
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast({ title: "Permissão negada para notificações", variant: "destructive" });
          setPushLoading(false);
          return;
        }
        const res = await fetch("/api/push/vapid-public-key", { credentials: "include" });
        if (!res.ok) {
          toast({ title: "Erro ao buscar chave VAPID", variant: "destructive" });
          setPushLoading(false);
          return;
        }
        const { key } = await res.json();
        if (!key) {
          toast({ title: "Chave VAPID não disponível", variant: "destructive" });
          setPushLoading(false);
          return;
        }
        // Wait for service worker with a timeout
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Service Worker não respondeu")), 5000)
          ),
        ]);
        if (!reg.active) {
          toast({ title: "Service Worker não está ativo. Recarregue a página.", variant: "destructive" });
          setPushLoading(false);
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        const { endpoint } = sub;
        const raw = sub.toJSON() as unknown as { keys?: { p256dh?: string; auth?: string } };
        const p256dh = raw.keys?.p256dh ?? "";
        const auth = raw.keys?.auth ?? "";
        await fetch("/api/push/admin/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint, p256dh, auth }),
          credentials: "include",
        });
        setPushEnabled(true);
        toast({ title: "Notificações ativadas!" });
      }
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao gerenciar notificações", variant: "destructive" });
    } finally {
      setPushLoading(false);
    }
  };

  useEffect(() => {
    const handleNativePush = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      try {
        const result = JSON.parse(detail) as { ok?: boolean; enabled?: boolean; error?: string };
        setPushLoading(false);
        if (!result.ok) {
          toast({ title: result.error || "Não foi possível ativar as notificações", variant: "destructive" });
          return;
        }
        setNativePush(!!result.enabled);
        setPushEnabled(!!result.enabled);
        toast({ title: result.enabled ? "Notificações ativadas!" : "Notificações desativadas" });
      } catch {
        setPushLoading(false);
      }
    };
    window.addEventListener("agendaplay-native-push", handleNativePush);
    return () => window.removeEventListener("agendaplay-native-push", handleNativePush);
  }, [toast]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.ReactNativeWebView) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setPushEnabled(!!sub);
    });
  }, []);

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
    const payload = { name: autoName, serviceIds: comboForm.serviceIds, discountPercent: comboForm.discountPercent, discountType: comboForm.discountType, timeDiscountMinutes: comboForm.timeDiscountMinutes };
    if (editingComboId) {
      updateComboMut.mutate(
        { id: editingComboId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListComboDiscountsQueryKey() });
            setComboOpen(false);
            setEditingComboId(null);
            setComboForm({ name: "", serviceIds: [], discountPercent: 10, discountType: "percent", timeDiscountMinutes: 0 });
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
            setComboForm({ name: "", serviceIds: [], discountPercent: 10, discountType: "percent", timeDiscountMinutes: 0 });
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

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full max-w-7xl" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-6 bg-background overflow-auto space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gerencie as informações da barbearia.</p>
      </div>

      {/* ── Row 1: Info + Horário ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl">
        {/* Informações Gerais */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Informações Gerais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Logo row */}
            <div className="flex items-center gap-3">
              <div
                className="rounded-full flex items-center justify-center overflow-hidden shrink-0 bg-muted"
                style={{ width: 56, height: 56, border: "2px solid hsl(38 88% 55%)" }}
                data-testid="logo-preview"
              >
                {formData.logoUrl ? (
                  <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <Scissors className="w-5 h-5" style={{ color: "hsl(38 88% 55%)" }} />
                )}
              </div>
              <div className="flex gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} data-testid="input-logo-file" />
                <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 text-xs" disabled={logoProcessing} onClick={() => fileInputRef.current?.click()} data-testid="button-upload-logo">
                  <Upload className="h-3.5 w-3.5" />
                  {logoProcessing ? "Processando…" : formData.logoUrl ? "Trocar" : "Enviar logo"}
                </Button>
                {formData.logoUrl && (
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive" onClick={() => setFormData({ ...formData, logoUrl: "" })} data-testid="button-remove-logo">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome da Barbearia</Label>
                <Input className="h-8 text-sm bg-muted/40" value={formData.barbershopName} readOnly disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nome completo</Label>
                <Input className="h-8 text-sm bg-muted/40" value={formData.ownerName} readOnly disabled />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Telefone</Label>
                <Input className="h-8 text-sm bg-muted/40" value={formData.phone} readOnly disabled />
              </div>
            </div>

            {/* Booking link */}
            {user && (
              <div className="space-y-2 pt-1 border-t border-border">
                <Label className="text-xs flex items-center gap-1.5"><Link className="h-3.5 w-3.5" /> Link de Agendamento</Label>
                {/* Toggle ON/OFF do link */}
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">{formData.bookingEnabled ? "Link ativo" : "Link desativado"}</p>
                    <p className="text-[10px] text-muted-foreground">{formData.bookingEnabled ? "Clientes podem agendar normalmente" : "Clientes verão mensagem de indisponibilidade"}</p>
                  </div>
                  <Switch
                    checked={formData.bookingEnabled}
                    onCheckedChange={(v) => setFormData({ ...formData, bookingEnabled: v })}
                    data-testid="switch-booking-enabled"
                  />
                </div>

                {slugEditMode ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-1.5 text-xs text-yellow-600 dark:text-yellow-400">
                      <span>⚠️</span><span>Links antigos deixarão de funcionar ao trocar.</span>
                    </div>
                    <div className="flex gap-1.5">
                      <Input data-testid="input-slug" value={slugValue} onChange={e => handleSlugChange(e.target.value.toLowerCase())} placeholder="minha-barbearia" className={`font-mono text-xs h-8 ${slugError ? "border-destructive" : ""}`} autoFocus />
                      <Button type="button" size="sm" className="h-8 text-xs" disabled={updateSlug.isPending || !!slugError || slugValue === (user.slug ?? "")} onClick={handleSlugSave} data-testid="button-save-slug">
                        {updateSlug.isPending ? "…" : "Salvar"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSlugValue(user.slug ?? ""); setSlugEditMode(false); setSlugError(null); }}>
                        Cancelar
                      </Button>
                    </div>
                    {slugError && <p className="text-xs" style={{ color: "hsl(0 70% 65%)" }}>{slugError}</p>}
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <Input readOnly value={user.slug ? `https://agendaplay.net/b/${user.slug}` : "Nenhum link público definido"} className="font-mono text-xs bg-muted h-8" data-testid="display-booking-url" />
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Editar" onClick={() => { setSlugValue(user.slug ?? ""); setSlugEditMode(true); setSlugError(null); }} data-testid="button-edit-slug"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title={user.slug ? "Copiar" : "Defina um endereço antes de copiar"} disabled={!user.slug} onClick={() => { if (!user.slug) return; const l = `https://agendaplay.net/b/${user.slug}`; navigator.clipboard.writeText(l); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Mensagem de Boas-vindas</Label>
              <Textarea value={formData.bookingPageMessage} onChange={e => setFormData({...formData, bookingPageMessage: e.target.value})} placeholder="Olá! Seja bem-vindo…" rows={2} className="text-sm resize-none" />
            </div>

            {/* Formas de Pagamento (dentro de Informações Gerais) */}
            <div className="pt-2 border-t border-border space-y-3">
              <p className="text-sm font-medium">Formas de Pagamento</p>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Pagar agora (Pix)</p>
                  <p className="text-xs text-muted-foreground">Cliente paga no momento do agendamento</p>
                </div>
                <Switch data-testid="switch-payment-now" checked={formData.paymentEnableNow} onCheckedChange={(v) => setFormData({ ...formData, paymentEnableNow: v })} />
              </div>
              {formData.paymentEnableNow && (
                <div className="space-y-1.5 px-1">
                  <Label className="text-xs">Chave Pix</Label>
                  <Input data-testid="input-pix-key" value={formData.pixKey} onChange={(e) => setFormData((prev) => ({ ...prev, pixKey: e.target.value }))} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" className="h-8 text-sm" />
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Pagar depois</p>
                  <p className="text-xs text-muted-foreground">Cliente paga na barbearia</p>
                </div>
                <Switch data-testid="switch-payment-on-site" checked={formData.paymentEnableOnSite} onCheckedChange={(v) => setFormData({ ...formData, paymentEnableOnSite: v })} />
              </div>
              {!formData.paymentEnableNow && !formData.paymentEnableOnSite && (
                <p className="text-xs" style={{ color: "hsl(0 70% 65%)" }}>Pelo menos uma forma de pagamento precisa estar ativa.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Horário de Funcionamento — 2 rows per day */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Horário de Funcionamento</CardTitle>
            <CardDescription className="text-xs">Início · Almoço · Volta · Fechamento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0">
            {DAYS.map(({ key, short }) => {
              const day = formData.weeklySchedule[key];
              return (
                <div key={key} className="py-2 border-b border-border/50 last:border-0" data-testid={`schedule-day-${key}`}>
                  {/* Row 1: Switch + day name */}
                  <div className="flex items-center gap-2 mb-1">
                    <Switch id={`closed-${key}`} data-testid={`switch-open-${key}`} checked={!day.closed} onCheckedChange={(v) => updateDay(key, { closed: !v })} className="shrink-0 scale-90" />
                    <span className={`text-sm font-medium ${day.closed ? "text-muted-foreground" : ""}`}>{short}</span>
                    {day.closed && <span className="text-xs text-muted-foreground italic ml-auto">Fechado</span>}
                  </div>
                  {/* Row 2: 4 columns always side-by-side */}
                  {!day.closed && (
                    <div className="grid grid-cols-4 gap-1.5">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Início</p>
                        <Input type="time" data-testid={`input-open-${key}`} value={day.open} onChange={(e) => updateDay(key, { open: e.target.value })} className="h-7 text-xs w-full px-1.5 [&::-webkit-calendar-picker-indicator]:hidden" />
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Almoço</p>
                        <Input type="time" data-testid={`input-lunch-start-${key}`} value={day.lunchStart} onChange={(e) => updateDay(key, { lunchStart: e.target.value })} className="h-7 text-xs w-full px-1.5 [&::-webkit-calendar-picker-indicator]:hidden" />
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Volta</p>
                        <Input type="time" data-testid={`input-lunch-end-${key}`} value={day.lunchEnd} onChange={(e) => updateDay(key, { lunchEnd: e.target.value })} className="h-7 text-xs w-full px-1.5 [&::-webkit-calendar-picker-indicator]:hidden" />
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Fechamento</p>
                        <Input type="time" data-testid={`input-close-${key}`} value={day.close} onChange={(e) => updateDay(key, { close: e.target.value })} className="h-7 text-xs w-full px-1.5 [&::-webkit-calendar-picker-indicator]:hidden" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Regras de Agendamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Intervalo entre agendamentos</Label>
                <select
                  value={formData.slotIntervalMinutes}
                  onChange={(e) => setFormData({ ...formData, slotIntervalMinutes: Number(e.target.value) })}
                  className="h-8 w-full rounded-md border border-input bg-muted/40 px-2 text-sm"
                  disabled={formData.smartSlots}
                >
                  <option value={5}>5 minutos</option>
                  <option value={10}>10 minutos</option>
                  <option value={15}>15 minutos</option>
                  <option value={20}>20 minutos</option>
                  <option value={25}>25 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>60 minutos</option>
                </select>
                {formData.smartSlots && (
                  <p className="text-xs text-muted-foreground">Controlado automaticamente pela duração do serviço</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Janela máxima para agendar</Label>
                <select value={formData.maxBookingDays} onChange={(e) => setFormData({ ...formData, maxBookingDays: Number(e.target.value) })} className="h-8 w-full rounded-md border border-input bg-muted/40 px-2 text-sm">
                  <option value={7}>7 dias</option>
                  <option value={15}>15 dias</option>
                  <option value={30}>30 dias</option>
                  <option value={60}>60 dias</option>
                  <option value={90}>90 dias</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Antecedência mínima para cancelar</Label>
                <select value={formData.minCancelMinutes} onChange={(e) => setFormData({ ...formData, minCancelMinutes: Number(e.target.value) })} className="h-8 w-full rounded-md border border-input bg-muted/40 px-2 text-sm">
                  <option value={0}>Sem restrição</option>
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={60}>60 minutos</option>
                  <option value={120}>120 minutos</option>
                  <option value={240}>240 minutos</option>
                  <option value={480}>480 minutos</option>
                  <option value={1440}>1440 minutos</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Modo inteligente</p>
                <p className="text-xs text-muted-foreground">Horários espaçados pela duração do serviço escolhido</p>
              </div>
              <Switch checked={formData.smartSlots} onCheckedChange={(v) => setFormData({ ...formData, smartSlots: v })} />
            </div>

            {/* Notificações Push (dentro de Regras) */}
            <div className="pt-2 border-t border-border space-y-3">
              <p className="text-sm font-medium">Notificações Push</p>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Receber alertas no dispositivo</p>
                  <p className="text-xs text-muted-foreground">
                    {pushEnabled
                      ? "Você receberá notificações de novos agendamentos e reagendamentos"
                      : "Ative para receber notificações de novos agendamentos e reagendamentos"}
                  </p>
                </div>
                <Button
                  variant={pushEnabled ? "default" : "outline"}
                  size="sm"
                  className="shrink-0 gap-1.5 h-8 text-xs"
                  disabled={pushLoading}
                  onClick={handlePushToggle}
                >
                  {pushLoading ? (
                    <span className="animate-pulse">…</span>
                  ) : pushEnabled ? (
                    <><BellOff className="h-3.5 w-3.5" /> Desativar</>
                  ) : (
                    <><Bell className="h-3.5 w-3.5" /> Ativar</>
                  )}
                </Button>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Lembrar clientes que sumiram</p>
                    <p className="text-xs text-muted-foreground">
                      Envia uma mensagem no navegador depois que o cliente fica sem agendar.
                    </p>
                  </div>
                  <Switch
                    checked={formData.clientReengagementEnabled}
                    onCheckedChange={(v) => setFormData({ ...formData, clientReengagementEnabled: v })}
                  />
                </div>
                {formData.clientReengagementEnabled && (
                  <>
                    <div className="space-y-1.5 max-w-sm">
                      <Label className="text-xs font-medium">Enviar depois de</Label>
                      <Select
                        value={String(formData.clientReengagementDays)}
                        onValueChange={(value) => setFormData({
                          ...formData,
                          clientReengagementDays: Number(value) === 15 ? 15 : 30,
                        })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione o prazo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 dias sem agendar</SelectItem>
                          <SelectItem value="30">30 dias sem agendar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Mensagem para o cliente</Label>
                      <Textarea
                        value={formData.clientReengagementMessage}
                        onChange={(e) => setFormData({ ...formData, clientReengagementMessage: e.target.value.slice(0, 500) })}
                        placeholder="Olá {{nome}}, estamos sentindo sua falta..."
                        rows={3}
                        className="text-sm resize-none"
                        maxLength={500}
                      />
                      <p className="text-xs text-muted-foreground">
                        Use <strong>{"{{nome}}"}</strong>, <strong>{"{{dias}}"}</strong> e <strong>{"{{barbearia}}"}</strong> para personalizar automaticamente.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Impressão de Comprovantes (sozinho, 1 coluna) ─ */}
      <div className="max-w-7xl">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Impressão de Comprovantes</CardTitle>
            </div>
            <CardDescription className="text-xs">
              O comprovante será ajustado para o tamanho selecionado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { value: "50mm", label: "Térmica 50mm", desc: "Mini impressora (2 polegadas)" },
                { value: "58mm", label: "Térmica 58mm", desc: "Bobina pequena (mini impressoras)" },
                { value: "80mm", label: "Térmica 80mm", desc: "Bobina padrão (cupom fiscal)" },
                { value: "A4", label: "Folha A4", desc: "Impressora comum de papel" },
              ].map((opt) => {
                const selected = formData.receiptPrinterSize === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, receiptPrinterSize: opt.value as "50mm" | "58mm" | "80mm" | "A4" })}
                    className="rounded-xl p-3 text-left transition-all"
                    style={{
                      backgroundColor: selected ? "hsl(var(--sidebar-primary) / 0.15)" : "hsl(0 0% 9%)",
                      border: selected ? "2px solid hsl(var(--sidebar-primary))" : "1px solid hsl(0 0% 16%)",
                      cursor: "pointer",
                    }}
                  >
                    <p className="text-sm font-semibold" style={{ color: selected ? "hsl(var(--sidebar-primary))" : "hsl(0 0% 85%)" }}>
                      {opt.label}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "hsl(0 0% 55%)" }}>
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Combo + Fidelidade ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl">
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={formData.combosEnabled}
              onCheckedChange={(v) => {
                setFormData(prev => ({ ...prev, combosEnabled: v }));
                updateSettings.mutate({ data: { combosEnabled: v } as any });
              }}
            />
            <div>
              <CardTitle className="text-base">Descontos por Combo</CardTitle>
              <CardDescription className="text-xs">
                Desconto automático ao escolher 2+ serviços juntos
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0 h-8 text-xs"
            onClick={() => {
              setEditingComboId(null);
              setComboForm({ name: "", serviceIds: [], discountPercent: 10, discountType: "percent", timeDiscountMinutes: 0 });
              setComboOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Novo combo
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
                        {(c.timeDiscountMinutes ?? 0) > 0 ? ` · Economia de ${c.timeDiscountMinutes} min` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
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
                            timeDiscountMinutes: c.timeDiscountMinutes ?? 0,
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

              <div className="space-y-2">
                <Label className="text-xs">Economia de tempo (minutos)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                    min
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={comboForm.timeDiscountMinutes}
                    onChange={(e) => setComboForm({ ...comboForm, timeDiscountMinutes: Number(e.target.value) })}
                    className="h-9 pl-10"
                    placeholder="0"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Ex: corte 35 min + barba 25 min = 60 min. Economia de 5 min = 55 min no agendamento.
                </p>
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

      {/* Service Exclusions */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={formData.serviceRestrictionsEnabled}
              onCheckedChange={(v) => {
                setFormData(prev => ({ ...prev, serviceRestrictionsEnabled: v }));
                updateSettings.mutate({ data: { serviceRestrictionsEnabled: v } as any });
              }}
            />
            <div>
              <CardTitle className="text-base">Restrições de Serviços</CardTitle>
              <CardDescription className="text-xs">
                Impedir que certos serviços sejam agendados juntos
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0 h-8 text-xs"
            onClick={() => {
              setExclusionForm({ id1: null, id2: null });
              setExclusionOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Nova restrição
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {formData.serviceExclusions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nenhuma restrição configurada. Clique em "Nova restrição" para criar.
            </p>
          ) : (
            <div className="space-y-2">
              {formData.serviceExclusions.map((pair, idx) => {
                const s1 = services?.find(s => s.id === pair.services[0]);
                const s2 = services?.find(s => s.id === pair.services[1]);
                const name1 = s1?.name || `#${pair.services[0]}`;
                const name2 = s2?.name || `#${pair.services[1]}`;
                return (
                  <div key={idx} className="flex items-center justify-between border border-border rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{name1} + {name2}</p>
                      <p className="text-xs text-muted-foreground">Não podem ser agendados juntos</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          const next = formData.serviceExclusions.filter((_, i) => i !== idx);
                          setFormData(prev => ({ ...prev, serviceExclusions: next }));
                          updateSettings.mutate({ data: { serviceExclusions: next } });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {exclusionOpen && (
            <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/20 mt-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Nova restrição</p>
                <Button variant="ghost" size="icon" onClick={() => setExclusionOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Serviço 1</Label>
                  <Select
                    value={exclusionForm.id1?.toString() ?? ""}
                    onValueChange={(v) => setExclusionForm(prev => ({ ...prev, id1: Number(v) }))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Escolher..." />
                    </SelectTrigger>
                    <SelectContent>
                      {services?.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Serviço 2</Label>
                  <Select
                    value={exclusionForm.id2?.toString() ?? ""}
                    onValueChange={(v) => setExclusionForm(prev => ({ ...prev, id2: Number(v) }))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Escolher..." />
                    </SelectTrigger>
                    <SelectContent>
                      {services?.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setExclusionOpen(false)}>Cancelar</Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!exclusionForm.id1 || !exclusionForm.id2 || exclusionForm.id1 === exclusionForm.id2) {
                      toast({ title: "Selecione 2 serviços diferentes", variant: "destructive" });
                      return;
                    }
                    const s0 = Math.min(exclusionForm.id1, exclusionForm.id2);
                    const s1 = Math.max(exclusionForm.id1, exclusionForm.id2);
                    const newPair = { services: [s0, s1] as [number, number], enabled: true };
                    const exists = formData.serviceExclusions.some(
                      p => p.services[0] === s0 && p.services[1] === s1
                    );
                    if (exists) {
                      toast({ title: "Essa restrição já existe", variant: "destructive" });
                      return;
                    }
                    const next = [...formData.serviceExclusions, newPair];
                    setFormData(prev => ({ ...prev, serviceExclusions: next }));
                    updateSettings.mutate({ data: { serviceExclusions: next as any } });
                    setExclusionOpen(false);
                    setExclusionForm({ id1: null, id2: null });
                    toast({ title: "Restrição adicionada" });
                  }}
                  disabled={!exclusionForm.id1 || !exclusionForm.id2}
                >
                  Salvar restrição
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loyalty / Fidelidade */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Programa de Fidelidade
          </CardTitle>
          <CardDescription className="text-xs">
            Clientes acumulam pontos a cada visita e trocam por desconto
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
              <div className="space-y-1.5 max-w-sm">
                <Label className="text-xs font-medium">Expiração dos pontos</Label>
                <Select
                  value={String(formData.loyaltyPointsExpirationDays)}
                  onValueChange={(value) => setFormData({ ...formData, loyaltyPointsExpirationDays: normalizeLoyaltyExpirationDays(Number(value)) })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione o prazo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Desligado</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="60">60 dias</SelectItem>
                    <SelectItem value="90">90 dias</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se o cliente ficar esse período sem movimentar os pontos, o saldo será zerado.
                </p>
              </div>
              <div className="space-y-1.5 max-w-sm">
                <Label className="text-xs font-medium">Avisar sobre expiração</Label>
                <Select
                  value={String(formData.loyaltyPointsExpirationWarningDays)}
                  onValueChange={(value) => setFormData({ ...formData, loyaltyPointsExpirationWarningDays: normalizeLoyaltyExpirationWarningDays(Number(value)) })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione quando avisar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 dias antes</SelectItem>
                    <SelectItem value="15">15 dias antes</SelectItem>
                    <SelectItem value="30">30 dias antes</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  O cliente verá um aviso no agendamento quando faltarem esse número de dias ou menos.
                </p>
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
                    <span className="text-muted-foreground">{c.clientName || c.clientPhone}</span>
                    <span className="font-semibold tabular-nums">
                      {c.points.toLocaleString("pt-BR")} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subscriber monthly usage — shown when shop has active or expired subscribers */}
          {subscriberUsage && subscriberUsage.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-sm font-semibold">Assinantes</p>
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {subscriberUsage.map((s) => {
                    const isExpired = s.status === "expired";
                    const limit = s.maxAppointmentsPerMonth;
                    const used = s.cutsUsedThisMonth;
                    const atLimit = limit != null && used >= limit;
                    const fraction = limit != null ? Math.min(used / limit, 1) : 0;
                    const expiryDate = s.expiresAt ? new Date(s.expiresAt).toLocaleDateString("pt-BR") : null;
                    return (
                      <div
                        key={s.id}
                        className={`rounded-lg border px-3 py-2.5 text-sm space-y-1.5 ${isExpired ? "border-destructive/40 bg-destructive/5" : atLimit ? "border-orange-500/40 bg-orange-500/5" : "border-border"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium">{s.clientName}</span>
                            {s.planName && (
                              <span className="ml-2 text-xs text-muted-foreground">{s.planName}</span>
                            )}
                            {expiryDate && (
                              <span className={`ml-2 text-xs ${isExpired ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {isExpired ? "venceu" : "vence"} {expiryDate}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isExpired ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                                disabled={renewingId === s.id}
                                onClick={() => handleRenewSubscription(s.id)}
                              >
                                {renewingId === s.id ? "..." : "Renovar"}
                              </Button>
                            ) : limit != null ? (
                              <div className={`text-xs font-semibold tabular-nums ${atLimit ? "text-orange-400" : "text-muted-foreground"}`}>
                                {used}/{limit} cortes
                                {atLimit && (
                                  <span className="ml-1.5 inline-flex items-center gap-1 text-orange-400">
                                    <AlertTriangle className="h-3 w-3 inline" /> limite
                                  </span>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {/* progress bar — only for plans with cut limits */}
                        {limit != null && !isExpired && (
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${atLimit ? "bg-orange-400" : "bg-amber-500"}`}
                              style={{ width: `${fraction * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>{/* end Row 3 grid */}

      {/* ── Minha Assinatura ───────────────────────────────── */}
      <div className="max-w-7xl">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Minha Assinatura</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Gerencie seu plano, faturas e dados de pagamento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Status badge */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                {subscriptionStatus?.hasActiveSubscription ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-500/15 text-green-500 border border-green-500/30">
                        Ativa
                      </span>
                      {currentPlan && (
                        <span className="text-sm font-semibold">
                          {currentPlan.product_name}
                        </span>
                      )}
                      {subscriptionStatus.maxBarbers != null && (
                        <span className="text-xs text-muted-foreground">
                          · Até {subscriptionStatus.maxBarbers} {subscriptionStatus.maxBarbers === 1 ? "profissional" : "profissionais"}
                        </span>
                      )}
                    </div>
                    {subscriptionStatus.subscriptionDueDate && (
                      <p className="text-xs text-muted-foreground">
                        Próxima cobrança:{" "}
                        <span className="font-medium text-foreground">
                          {new Date(subscriptionStatus.subscriptionDueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                        </span>
                        {subscriptionStatus.subscriptionDaysLeft != null && (
                          <span className="ml-1 text-muted-foreground">
                            ({subscriptionStatus.subscriptionDaysLeft} {subscriptionStatus.subscriptionDaysLeft === 1 ? "dia" : "dias"})
                          </span>
                        )}
                      </p>
                    )}
                    {currentPlan && (
                      <p className="text-xs text-muted-foreground">
                        {(currentPlan.unit_amount / 100).toLocaleString("pt-BR", { style: "currency", currency: currentPlan.currency.toUpperCase() })}/mês
                      </p>
                    )}
                  </>
                ) : subscriptionStatus && !subscriptionStatus.trialExpired ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-500 border border-amber-500/30">
                        Período grátis
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {subscriptionStatus.trialDaysLeft === 1
                        ? "Último dia de período grátis"
                        : `${subscriptionStatus.trialDaysLeft} dias restantes no período grátis`}
                    </p>
                  </>
                ) : subscriptionStatus?.trialExpired && !subscriptionStatus.hasActiveSubscription ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-destructive/15 text-destructive border border-destructive/30">
                      Sem plano ativo
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Carregando...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              {subscriptionStatus?.hasActiveSubscription ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={openCustomerPortal}
                    disabled={portalLoading}
                  >
                    {portalLoading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    Trocar plano
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={openCustomerPortal}
                    disabled={portalLoading}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Ver faturas
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                    onClick={() => setCancelDialogOpen(true)}
                    disabled={portalLoading}
                  >
                    Cancelar assinatura
                  </Button>
                </>
              ) : !subscriptionStatus?.trialExpired ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  onClick={() => window.location.href = "/subscribe"}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Assinar agora
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  onClick={() => window.location.href = "/subscribe"}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Escolher plano
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cancel subscription confirmation dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancelar assinatura
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Você será redirecionado para o portal de assinatura do Stripe, onde poderá cancelar seu plano com segurança.
              <br /><br />
              Após o cancelamento, você ainda terá acesso até o fim do período já pago.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={portalLoading}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={portalLoading}
              onClick={async () => {
                setCancelDialogOpen(false);
                await openCustomerPortal();
              }}
            >
              {portalLoading ? "Abrindo..." : "Ir para o portal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="max-w-7xl flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-sm text-destructive font-medium">Excluir barbearia</span>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="shrink-0"
          onClick={() => {
            setDeleteEmail("");
            setDeletePassword("");
            setDeleteStep(1);
            setDeleteDialogOpen(true);
          }}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Excluir conta
        </Button>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!deleteAccount.isPending) {
          setDeleteDialogOpen(open);
          if (!open) setDeleteStep(1);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          {deleteStep === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Aviso Importante
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  Você está prestes a <strong className="text-destructive">excluir permanentemente</strong> sua conta e todos os dados da barbearia.
                  <br /><br />
                  Isso inclui:
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-muted-foreground">
                    <li>Todos os agendamentos e histórico</li>
                    <li>Serviços e preços cadastrados</li>
                    <li>Lista de clientes</li>
                    <li>Configurações e preferências</li>
                  </ul>
                  <br />
                  <strong className="text-foreground">Esta ação é irreversível.</strong> Após a exclusão, você poderá criar uma nova conta com o mesmo e-mail.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0 mt-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={deleteAccount.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteStep(2)}
                >
                  Entendi, quero continuar
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Confirmar Exclusão
                </DialogTitle>
                <DialogDescription>
                  Digite seu e-mail e senha para confirmar a exclusão permanente da conta.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="delete-email">E-mail da conta</Label>
                  <Input
                    id="delete-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={deleteEmail}
                    onChange={(e) => setDeleteEmail(e.target.value)}
                    disabled={deleteAccount.isPending}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="delete-password">Senha</Label>
                  <Input
                    id="delete-password"
                    type="password"
                    placeholder="••••••••"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    disabled={deleteAccount.isPending}
                    autoComplete="current-password"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleDeleteAccount();
                    }}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setDeleteStep(1)}
                  disabled={deleteAccount.isPending}
                >
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={deleteAccount.isPending || !deleteEmail.trim() || !deletePassword}
                >
                  {deleteAccount.isPending ? "Excluindo..." : "Excluir permanentemente"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
