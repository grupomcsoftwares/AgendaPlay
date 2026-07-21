import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useListServices, useCreateAppointment, getListServicesQueryKey, useGetSettings, getGetSettingsQueryKey, useGetAvailability, getGetAvailabilityQueryKey, useListBarbers, getListBarbersQueryKey, useListComboDiscounts, getListComboDiscountsQueryKey, useGetAppointmentByToken, getGetAppointmentByTokenQueryKey, useGetLoyaltyBalance, getGetLoyaltyBalanceQueryKey, useCheckSubscription, getCheckSubscriptionQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Scissors, Calendar as CalendarIcon, Clock, User, ChevronRight, ChevronLeft, DollarSign, CreditCard, Banknote, Check, Copy, X, Star } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const AMBER = "hsl(38 88% 55%)";
const AMBER_SOFT = "hsl(38 88% 55% / 0.15)";
const AMBER_DEEP = "hsl(38 80% 45%)";
const STEP_LABELS_BASE = ["Seus dados", "Serviço", "Data e hora", "Pagamento"] as const;
const STEP_LABELS_WITH_BARBER = ["Seus dados", "Profissional", "Serviço", "Data e hora", "Pagamento"] as const;

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

export default function Booking({ shopId: shopIdProp }: { shopId?: string } = {}) {
  const [, setLocation] = useLocation();
  const { user: adminUser } = useAuth();

  // shopIdProp takes priority (used by public slug-based pages).
  // Falls back to URL query string (?shopId=<userId>) for the admin-fresh link.
  // Admin users arriving without shopId rely on their session cookie instead.
  const searchParams = new URLSearchParams(window.location.search);
  const shopId = shopIdProp ?? searchParams.get("shopId") ?? undefined;
  const isNewBooking = searchParams.get("novo") === "1";
  // Pre-filled child name from "Agendar outro corte" flow — skips step 0
  const urlChildName = searchParams.get("cn") ?? "";
  const urlChildLastName = searchParams.get("cls") ?? "";

  // ── Existing-appointment redirect ──────────────────────────────────────────
  // After a successful booking the token is saved to localStorage. Next time
  // the client opens the booking link we check: if the appointment is still
  // upcoming we send them straight to the cancel/reschedule page.
  const storageKey = `barber_pending_token_${shopId ?? "admin"}`;
  const [pendingToken, setPendingToken] = useState<string | null>(() =>
    isNewBooking ? null : localStorage.getItem(storageKey)
  );
  const { data: pendingAppt, isError: pendingError } = useGetAppointmentByToken(
    pendingToken ?? "",
    { query: { queryKey: getGetAppointmentByTokenQueryKey(pendingToken ?? ""), enabled: !!pendingToken } }
  );
  useEffect(() => {
    if (!pendingToken) return;
    if (pendingError) {
      localStorage.removeItem(storageKey);
      setPendingToken(null);
      return;
    }
    if (!pendingAppt) return;
    const isActive = pendingAppt.status === "pending" || pendingAppt.status === "confirmed";
    const isFuture = new Date(pendingAppt.scheduledAt) > new Date();
    if (isActive && isFuture && !adminUser) {
      const shopParam = shopId ? `?shopId=${shopId}` : "";
      setLocation(`/agendamento/${pendingToken}${shopParam}`);
    } else {
      localStorage.removeItem(storageKey);
      setPendingToken(null);
    }
  }, [pendingAppt, pendingError, pendingToken, storageKey, shopId, setLocation]);
  // ──────────────────────────────────────────────────────────────────────────

  const { data: services } = useListServices(
    shopId ? { shopId } : undefined,
    { query: { queryKey: getListServicesQueryKey(shopId ? { shopId } : undefined) } }
  );
  const { data: settings } = useGetSettings(
    shopId ? { shopId } : undefined,
    { query: { queryKey: getGetSettingsQueryKey(shopId ? { shopId } : undefined) } }
  );
  const { data: barbers } = useListBarbers(
    { activeOnly: true, ...(shopId ? { shopId } : {}) },
    { query: { queryKey: getListBarbersQueryKey({ activeOnly: true, ...(shopId ? { shopId } : {}) }) } }
  );
  const createAppointment = useCreateAppointment();
  const { toast } = useToast();

  const [redeemedServiceIds, setRedeemedServiceIds] = useState<number[]>([]);
  const [pointsModal, setPointsModal] = useState<{ open: boolean; serviceId: number | null; serviceName: string; servicePrice: number }>({ open: false, serviceId: null, serviceName: "", servicePrice: 0 });

  const [step, setStep] = useState<number>(() => {
    // If child name came via URL, jump straight to step 1 (no phone needed)
    if (urlChildName) return 1;
    try {
      const key = `barber_client_info_${shopId ?? "public"}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as { name?: string; phone?: string };
        if (parsed.name && parsed.phone) return 1;
      }
    } catch { /* ignore */ }
    return 0;
  });
  // Plays a celebratory check animation after a successful booking before
  // navigating to the confirmation page.
  const [confirmed, setConfirmed] = useState(false);
  // When true, step 1 shows the barber picker instead of the service list.
  // Default to true until barbers load; switches off if 0/1 active barbers.
  const [pickingBarber, setPickingBarber] = useState(true);

  const clientInfoKey = `barber_client_info_${shopId ?? "public"}`;

  const [formData, setFormData] = useState<{
    serviceIds: number[];
    barberId: string;
    date: Date;
    time: string;
    name: string;
    lastName: string;
    phone: string;
    notes: string;
    paymentMethod: "now" | "on_site";
    usePlan: boolean;
  }>(() => {
    // Child booking via "Agendar outro corte" — use URL-provided name, no phone
    if (urlChildName) {
      return {
        serviceIds: [],
        barberId: "",
        date: new Date(),
        time: "",
        name: urlChildName,
        lastName: urlChildLastName,
        phone: "",
        notes: "",
        paymentMethod: "on_site",
        usePlan: false,
      };
    }
    try {
      const saved = localStorage.getItem(clientInfoKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { name?: string; lastName?: string; phone?: string };
        return {
          serviceIds: [],
          barberId: "",
          date: new Date(),
          time: "",
          name: parsed.name ?? "",
          lastName: parsed.lastName ?? "",
          phone: parsed.phone ?? "",
          notes: "",
          paymentMethod: "on_site",
          usePlan: false,
        };
      }
    } catch { /* ignore */ }
    return {
      serviceIds: [],
      barberId: "",
      date: new Date(),
      time: "",
      name: "",
      lastName: "",
      phone: "",
      notes: "",
      paymentMethod: "on_site",
      usePlan: false,
    };
  });

  const handleBook = () => {
    if (selectedServices.length === 0) return;
    const barber = formData.barberId
      ? barbers?.find(b => b.id.toString() === formData.barberId)
      : undefined;

    const y = formData.date.getFullYear();
    const m = (formData.date.getMonth() + 1).toString().padStart(2, "0");
    const d = formData.date.getDate().toString().padStart(2, "0");
    // Fixed America/Sao_Paulo offset (UTC-3, no DST) — matches server's TZ assumption.
    const scheduledAt = new Date(`${y}-${m}-${d}T${formData.time}:00-03:00`).toISOString();

    const combinedName = selectedServices.map(s => s.name).join(" + ");

    createAppointment.mutate(
      { data: {
        ...(shopId ? { shopId } : {}),
        clientName: `${formData.name.trim()} ${formData.lastName.trim()}`.trim(),
        serviceName: combinedName,
        servicePrice: comboTotalPrice,
        serviceDuration: totalDuration,
        ...(barber ? { barberId: barber.id, barberName: barber.name } : {}),
        scheduledAt,
        paymentMethod: formData.paymentMethod,
        notes: formData.phone ? `Tel: ${formData.phone}. ${formData.notes}` : formData.notes,
        ...(loyaltyPointsToSpend > 0 ? { loyaltyPointsRedeemed: loyaltyPointsToSpend } : {}),
        ...(formData.usePlan ? { coveredByPlan: true } : {}),
        // Send serviceId for single-service bookings so server can resolve day-based pricing
        ...(selectedServices.length === 1 ? { serviceId: selectedServices[0]!.id } : {}),
      }},
      {
        onSuccess: (created) => {
          if (created?.cancelToken && !adminUser) {
            localStorage.setItem(storageKey, created.cancelToken);
          }
          // Persist name+phone so the client doesn't have to retype next visit
          if (formData.name && formData.phone) {
            try {
              localStorage.setItem(clientInfoKey, JSON.stringify({ name: formData.name, lastName: formData.lastName, phone: formData.phone }));
            } catch { /* ignore */ }
          }
          setConfirmed(true);
          window.setTimeout(() => {
            if (adminUser) {
              setLocation("/appointments");
            } else if (created?.cancelToken) {
              const shopParam = shopId ? `&shopId=${shopId}` : "";
              setLocation(`/agendamento/${created.cancelToken}?novo=1${shopParam}`);
            }
          }, 2200);
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error || err?.message || "Erro ao confirmar agendamento";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const selectedBarber = formData.barberId
    ? barbers?.find(b => b.id.toString() === formData.barberId)
    : undefined;

  const comboParams = shopId ? { shopId } : {};
  const { data: comboDiscounts } = useListComboDiscounts(
    comboParams,
    { query: { queryKey: getListComboDiscountsQueryKey(comboParams) } }
  );

  const normalizedPhone = formData.phone.replace(/\D/g, "");
  const loyaltyQueryParams = { ...(shopId ? { shopId } : {}), phone: normalizedPhone };
  // Pre-load loyalty and subscription data as soon as phone is valid so they're
  // ready when the user reaches step 1 — prevents the points modal from failing
  // to open on the first service click due to stale undefined balance.
  // Only query loyalty/subscription when shopId is resolved (public links load
  // shopId asynchronously from slug resolution; querying before causes 400).
  const { data: loyaltyBalance } = useGetLoyaltyBalance(
    loyaltyQueryParams,
    { query: { queryKey: getGetLoyaltyBalanceQueryKey(loyaltyQueryParams), enabled: normalizedPhone.length >= 8 && !!shopId } }
  );
  const { data: subscriptionCheck } = useCheckSubscription(
    { ...(shopId ? { shopId } : {}), phone: normalizedPhone },
    { query: { queryKey: getCheckSubscriptionQueryKey({ ...(shopId ? { shopId } : {}), phone: normalizedPhone }), enabled: normalizedPhone.length >= 8 && !!shopId } }
  );

  // Services this barber can perform (empty serviceIds = all services).
  const eligibleServicesAll = React.useMemo(() => {
    if (!services) return [];
    if (!selectedBarber) return services;
    if (selectedBarber.serviceIds.length === 0) return services;
    return services.filter(s => selectedBarber.serviceIds.includes(s.id));
  }, [services, selectedBarber]);

  const selectedServices = React.useMemo(
    () => (services ?? []).filter(s => formData.serviceIds.includes(s.id)),
    [services, formData.serviceIds]
  );

  const totalDurationRaw = selectedServices.reduce((acc, s) => acc + s.durationMinutes, 0);
  const totalPriceRaw = selectedServices.reduce((acc, s) => acc + s.price, 0);

  // Pre-declare loyalty state for combo dependency
  const useLoyaltyPoints = redeemedServiceIds.length > 0;

  // Single combo lookup — same sorting logic (highest price discount) regardless of loyalty points.
  // Used for price discount only when NOT using points; always used for time discount.
  const bestCombo = React.useMemo(() => {
    if ((settings as any)?.combosEnabled === false) return null;
    if (!comboDiscounts || selectedServices.length < 2) return null;
    const selectedIds = formData.serviceIds;
    const matches = comboDiscounts.filter(c =>
      c.enabled !== false &&
      (c.serviceIds as number[]).length >= 2 &&
      (c.serviceIds as number[]).every(id => selectedIds.includes(id))
    );
    if (matches.length === 0) return null;
    return matches.sort((a, b) => {
      const va = a.discountType === "value" ? a.discountPercent : (totalPriceRaw * a.discountPercent) / 100;
      const vb = b.discountType === "value" ? b.discountPercent : (totalPriceRaw * b.discountPercent) / 100;
      return vb - va;
    })[0];
  }, [comboDiscounts, formData.serviceIds, selectedServices.length, totalPriceRaw, settings]);

  // Price discount: only when not using loyalty points (can't stack combo + points)
  const appliedCombo = useLoyaltyPoints ? null : bestCombo;

  // Time discount: always identical to the normal path (uses bestCombo)
  const comboTimeDiscount = bestCombo?.timeDiscountMinutes ?? 0;
  const totalDuration = Math.max(5, totalDurationRaw - comboTimeDiscount);

  // For percentage combos, apply the discount only to the services that are
  // part of the combo — not to every selected service. A fixed-value combo
  // always deducts the same amount regardless of extra services.
  const comboServicesPrice = appliedCombo
    ? selectedServices
        .filter(s => (appliedCombo.serviceIds as number[]).includes(s.id))
        .reduce((acc, s) => acc + s.price, 0)
    : 0;
  const discountAmount = appliedCombo
    ? appliedCombo.discountType === "value"
      ? Number(appliedCombo.discountPercent)
      : (comboServicesPrice * Number(appliedCombo.discountPercent)) / 100
    : 0;
  const comboTotalPrice = Math.max(0, totalPriceRaw - discountAmount);

  // Loyalty discount
  const loyaltyAvailableDiscount = loyaltyBalance?.enabled && loyaltyBalance.pointsPerRedemptionUnit > 0
    ? Math.floor(loyaltyBalance.points / loyaltyBalance.pointsPerRedemptionUnit)
    : 0;
  // Auto-clear plan selection when loyalty is active (can't combine)
  useEffect(() => {
    if (useLoyaltyPoints && formData.usePlan) {
      setFormData(prev => ({ ...prev, usePlan: false }));
    }
  }, [useLoyaltyPoints, formData.usePlan]);
  const loyaltyDiscountAmount = useLoyaltyPoints
    ? Math.min(
        loyaltyAvailableDiscount,
        selectedServices
          .filter(s => redeemedServiceIds.includes(s.id))
          .reduce((acc, s) => acc + s.price, 0)
      )
    : 0;
  const loyaltyPointsToSpend = useLoyaltyPoints && loyaltyBalance?.pointsPerRedemptionUnit
    ? loyaltyDiscountAmount * loyaltyBalance.pointsPerRedemptionUnit
    : 0;
  const totalPriceRawLoyalty = Math.max(0, comboTotalPrice - loyaltyDiscountAmount);

  // Subscription plan logic
  const hasActivePlan = subscriptionCheck?.active === true;
  const planCredits = subscriptionCheck?.creditsRemaining ?? 0;
  const planTotal = subscriptionCheck?.creditsTotal ?? 0;
  const planExpired = subscriptionCheck?.expiresAt ? new Date(subscriptionCheck.expiresAt) < new Date() : false;
  const planCreditCost = Math.ceil(totalPriceRawLoyalty);
  const planEnoughCredits = planCredits >= planCreditCost;
  // When using plan, price is 0 (covered by subscription credits). Cannot combine with loyalty points.
  const usePlan = formData.usePlan && hasActivePlan && !planExpired && planEnoughCredits && redeemedServiceIds.length === 0;
  const totalPrice = usePlan ? 0 : totalPriceRawLoyalty;

  // Backend already filters to active barbers via activeOnly=true.
  const activeBarbers = barbers ?? [];
  const needsBarberStep = activeBarbers.length >= 2;
  const stepLabels = needsBarberStep ? STEP_LABELS_WITH_BARBER : STEP_LABELS_BASE;
  // Indicator mapping:
  //  - step 0 = "Seus dados" (new first step) → indicator 1
  //  - Without barber: indicator = step + 1
  //  - With barber: step 0→1, picker→2, service→3, step 2→4, step 3→5
  const indicatorStep = needsBarberStep
    ? (step === 0 ? 1 : pickingBarber ? 2 : step === 1 ? 3 : step + 2)
    : step + 1;

  // Auto-select the single barber (or none) and skip the picker.
  useEffect(() => {
    if (!barbers) return;
    if (barbers.length >= 2) return;
    setPickingBarber(false);
    const onlyId = barbers[0]?.id.toString() ?? "";
    setFormData(prev => (prev.barberId === onlyId ? prev : { ...prev, barberId: onlyId }));
  }, [barbers]);

  // Sync selected service IDs whenever the eligible services list changes (e.g. after
  // the barber loads and filters which services they can perform). This prevents
  // formData.serviceIds from referencing services no longer in eligibleServicesAll,
  // which would cause the count and price to be out of sync.
  useEffect(() => {
    if (eligibleServicesAll.length === 0) return;
    const eligibleIds = new Set(eligibleServicesAll.map(s => s.id));
    setFormData(prev => {
      const filtered = prev.serviceIds.filter(id => eligibleIds.has(id));
      if (filtered.length === prev.serviceIds.length) return prev;
      return { ...prev, serviceIds: filtered, time: "" };
    });
  }, [eligibleServicesAll]);

  const handleBarberPick = (barberId: number) => {
    setFormData(prev => ({ ...prev, barberId: barberId.toString(), serviceIds: [], time: "" }));
    setPickingBarber(false);
  };

  type ServiceExclusion = { services: [number, number]; enabled: boolean };
  const serviceExclusions = (settings as any)?.serviceRestrictionsEnabled === false
    ? []
    : ((settings?.serviceExclusions ?? []) as unknown[])
        .map((item): ServiceExclusion =>
          Array.isArray(item)
            ? { services: [item[0], item[1]] as [number, number], enabled: true }
            : item as ServiceExclusion
        )
        .filter(e => e.enabled !== false);

  const handleToggleService = (serviceId: number) => {
    setFormData(prev => {
      const alreadySelected = prev.serviceIds.includes(serviceId);
      if (alreadySelected) {
        const ids = prev.serviceIds.filter(id => id !== serviceId);
        setRedeemedServiceIds(r => r.filter(id => id !== serviceId));
        return { ...prev, serviceIds: ids, time: "" };
      }
      // Check if any currently selected service is excluded from this one
      const blockedBy = prev.serviceIds.find(selectedId =>
        serviceExclusions.some(pair =>
          (pair.services[0] === selectedId && pair.services[1] === serviceId) ||
          (pair.services[0] === serviceId && pair.services[1] === selectedId)
        )
      );
      if (blockedBy) {
        const blockedName = services?.find(s => s.id === serviceId)?.name ?? "Esse serviço";
        const currentName = services?.find(s => s.id === blockedBy)?.name ?? "o serviço selecionado";
        alert(`Não é possível escolher ${blockedName} junto com ${currentName}. Remova ${currentName} primeiro.`);
        return prev;
      }
      const svc = services?.find(s => s.id === serviceId);
      // A paid service must already be in the cart for the points modal to appear.
      const isRedeemable = svc && loyaltyBalance?.enabled && loyaltyAvailableDiscount >= svc.price && svc.price > 0;
      const hasPaidService = prev.serviceIds.some(id => {
        const s = services?.find(x => x.id === id);
        return s && s.price > 0 && !(loyaltyBalance?.enabled && loyaltyAvailableDiscount >= s.price);
      });
      if (isRedeemable && hasPaidService) {
        setPointsModal({ open: true, serviceId, serviceName: svc.name, servicePrice: svc.price });
        return prev;
      }
      return { ...prev, serviceIds: [...prev.serviceIds, serviceId], time: "" };
    });
  };

  const handleServicesConfirm = () => {
    if (selectedServices.length === 0) return;
    setStep(2);
  };

  const paymentEnableNow = settings?.paymentEnableNow ?? false;
  const paymentEnableOnSite = settings?.paymentEnableOnSite ?? true;
  const pixKey = settings?.pixKey ?? null;
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
  const availabilityBarberId = formData.barberId ? parseInt(formData.barberId, 10) : undefined;
  const availabilityParams = {
    ...(shopId ? { shopId } : {}),
    date: dateKey,
    serviceDuration: totalDuration,
    ...(availabilityBarberId ? { barberId: availabilityBarberId } : {}),
  };
  const { data: availability, isFetching: loadingSlots } = useGetAvailability(
    availabilityParams,
    { query: { queryKey: getGetAvailabilityQueryKey(availabilityParams), enabled: step === 2 && totalDuration > 0 && !pickingBarber } }
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
            className="mx-auto rounded-full flex items-center justify-center overflow-hidden"
            style={{
              width: 88,
              height: 88,
              backgroundColor: AMBER_SOFT,
              border: `2px solid ${AMBER}`,
              color: AMBER,
            }}
          >
            {settings?.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={settings?.barbershopName || "Logo"}
                className="w-full h-full object-cover"
                data-testid="img-shop-logo"
              />
            ) : (
              <Scissors className="w-9 h-9" />
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{settings?.barbershopName || "Barbearia"}</h1>
        </div>

        {/* Link desativado pelo dono da barbearia */}
        {(settings as any)?.bookingEnabled === false && (
          <div className="text-center space-y-3 py-6">
            <div
              className="mx-auto flex items-center justify-center rounded-full"
              style={{ width: 56, height: 56, backgroundColor: "hsl(0 70% 50% / 0.12)", color: "hsl(0 70% 60%)" }}
            >
              <X className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-semibold">Agendamentos indisponíveis</h2>
            <p className="text-sm text-muted-foreground">No momento, os agendamentos estão temporariamente desativados. Tente novamente mais tarde ou entre em contato com a barbearia.</p>
          </div>
        )}

        {(settings as any)?.bookingEnabled !== false && <StepIndicator current={indicatorStep} labels={stepLabels} />}

        {(settings as any)?.bookingEnabled !== false && step === 0 && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl font-bold">Seus Dados</h2>
              <p className="text-sm text-muted-foreground">
                Informe seu nome e telefone para continuar com o agendamento.
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name-step0" className="text-sm font-semibold">Nome</Label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                    style={{ color: "hsl(0 0% 45%)" }}
                  />
                  <Input
                    id="name-step0"
                    data-testid="input-booking-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="João"
                    className="pl-9 h-11"
                    autoFocus
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastname-step0" className="text-sm font-semibold">Sobrenome</Label>
                <Input
                  id="lastname-step0"
                  data-testid="input-booking-lastname"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Silva"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone-step0" className="text-sm font-semibold">Telefone</Label>
                <Input
                  id="phone-step0"
                  data-testid="input-booking-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                    let masked = digits;
                    if (digits.length > 2) {
                      masked = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
                      if (digits.length > 7) {
                        masked = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
                      }
                    }
                    setFormData({ ...formData, phone: masked });
                  }}
                  placeholder="(11) 99999-9999"
                  className="h-11"
                />
              </div>
            </div>
            <button
              type="button"
              data-testid="button-continue-step0"
              disabled={!formData.name.trim() || !formData.lastName.trim() || formData.phone.replace(/\D/g, "").length < 10}
              onClick={() => setStep(1)}
              className="w-full rounded-xl text-center font-semibold transition-opacity"
              style={{
                height: 52,
                backgroundColor: AMBER_DEEP,
                color: "hsl(0 0% 100%)",
                border: "none",
                cursor: formData.name.trim() && formData.lastName.trim() && formData.phone.replace(/\D/g, "").length >= 10 ? "pointer" : "not-allowed",
                opacity: formData.name.trim() && formData.lastName.trim() && formData.phone.replace(/\D/g, "").length >= 10 ? 1 : 0.55,
              }}
            >
              Continuar
            </button>
          </div>
        )}

        {(settings as any)?.bookingEnabled !== false && step === 1 && pickingBarber && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => { if (!urlChildName) setStep(0); }}
              data-testid="button-back-barber-to-step0"
              className="flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
              style={{ background: "none", border: "none", color: "hsl(0 0% 65%)", cursor: "pointer", padding: 0 }}
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar
            </button>
            <div className="space-y-1">
              <h2 className="text-xl font-bold">Escolha o profissional</h2>
              <p className="text-sm text-muted-foreground">
                Quem você prefere para o seu atendimento?
              </p>
            </div>
            <div className="space-y-3">
              {activeBarbers.map((b) => {
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
                    onClick={() => handleBarberPick(b.id)}
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

        {(settings as any)?.bookingEnabled !== false && step === 1 && !pickingBarber && (
          <div className="space-y-4">
            {needsBarberStep ? (
              <button
                type="button"
                onClick={() => setPickingBarber(true)}
                data-testid="button-back-to-barbers"
                className="flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
                style={{ background: "none", border: "none", color: "hsl(0 0% 65%)", cursor: "pointer", padding: 0 }}
              >
                <ChevronLeft className="w-4 h-4" />
                Trocar profissional
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { if (!urlChildName) setStep(0); }}
                data-testid="button-back-service-to-step0"
                className="flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
                style={{ background: "none", border: "none", color: "hsl(0 0% 65%)", cursor: "pointer", padding: 0 }}
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </button>
            )}
            {selectedBarber && needsBarberStep && (
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
              </div>
            )}
            <div className="space-y-1">
              <h2 className="text-xl font-bold">Escolha os serviços</h2>
              <p className="text-sm text-muted-foreground">Selecione um ou mais serviços</p>
            </div>

            {/* Loyalty banner — shown when client has points redeemable for at least one service */}
            {loyaltyBalance?.enabled && loyaltyAvailableDiscount > 0 && eligibleServicesAll.some(s => s.price <= loyaltyAvailableDiscount) && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium"
                style={{ backgroundColor: `${AMBER}18`, border: `1px solid ${AMBER}55`, color: AMBER }}
              >
                <Star className="w-4 h-4 shrink-0" />
                <span>
                  Você tem <strong>{loyaltyBalance.points} pontos</strong> — vale até{" "}
                  <strong>R$ {loyaltyAvailableDiscount.toFixed(2).replace(".", ",")}</strong>
                </span>
              </div>
            )}

            <div className="space-y-3">
              {eligibleServicesAll.map((service) => {
                const isSelected = formData.serviceIds.includes(service.id);
                // This service can be redeemed with points (for visual badge/border)
                const canRedeemNow = loyaltyBalance?.enabled && loyaltyAvailableDiscount >= service.price && service.price > 0;
                // Points modal only triggers when a paid service is already in cart
                const hasPaidServiceInCart = formData.serviceIds.some(id => {
                  const s = services?.find(x => x.id === id);
                  return s && s.price > 0 && !(loyaltyBalance?.enabled && loyaltyAvailableDiscount >= s.price);
                });
                const redeemableWithPoints = canRedeemNow && (hasPaidServiceInCart || isSelected);
                const isBlocked = !isSelected && serviceExclusions.some(pair =>
                  formData.serviceIds.some(selectedId =>
                    (pair.services[0] === selectedId && pair.services[1] === service.id) ||
                    (pair.services[0] === service.id && pair.services[1] === selectedId)
                  )
                );
                return (
                  <div key={service.id} className="relative">
                    <button
                      type="button"
                      data-testid={`button-service-${service.id}`}
                      onClick={() => {
                        if (!isSelected && !isBlocked) handleToggleService(service.id);
                      }}
                      className="w-full text-left rounded-2xl p-4 transition-all"
                      style={{
                        backgroundColor: isSelected ? "hsl(0 0% 10%)" : isBlocked ? "hsl(0 0% 5%)" : "hsl(0 0% 7%)",
                        border: `2px solid ${isSelected ? AMBER : isBlocked ? "hsl(0 80% 35%)" : redeemableWithPoints ? `${AMBER}60` : "hsl(0 0% 14%)"}`,
                        cursor: isSelected ? "default" : isBlocked ? "not-allowed" : "pointer",
                        opacity: isBlocked ? 0.6 : 1,
                      }}
                    >
                      <div className="flex items-start gap-3">
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
                            {isBlocked && (
                              <span
                                className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: "hsl(0 60% 25%)", color: "hsl(0 70% 55%)", border: "1px solid hsl(0 60% 35%)" }}
                              >
                                Seleção inválida
                              </span>
                            )}
                            {isSelected && redeemedServiceIds.includes(service.id) && (
                              <span
                                className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: `${AMBER}22`, color: AMBER, border: `1px solid ${AMBER}55` }}
                              >
                                ⭐ Pago com pontos
                              </span>
                            )}
                            {isSelected && redeemableWithPoints && !redeemedServiceIds.includes(service.id) && (
                              <span
                                className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: "hsl(0 0% 14%)", color: "hsl(0 0% 50%)", border: "1px solid hsl(0 0% 22%)" }}
                              >
                                Pago normalmente
                              </span>
                            )}
                            {!isSelected && redeemableWithPoints && (
                              <span
                                className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: `${AMBER}22`, color: AMBER, border: `1px solid ${AMBER}55` }}
                              >
                                ⭐ Trocar por pontos
                              </span>
                            )}
                          </div>
                        </div>
                        {!isSelected && (
                          <div
                            className="rounded-full flex items-center justify-center shrink-0 mt-1"
                            style={{
                              width: 22,
                              height: 22,
                              border: "2px solid hsl(0 0% 25%)",
                              backgroundColor: "transparent",
                            }}
                          />
                        )}
                      </div>
                    </button>
                    {isSelected && (
                      <button
                        type="button"
                        data-testid={`button-remove-service-${service.id}`}
                        onClick={() => handleToggleService(service.id)}
                        className="absolute top-3 right-3 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                        style={{
                          width: 22,
                          height: 22,
                          backgroundColor: AMBER,
                          color: "hsl(0 0% 10%)",
                          border: "none",
                          cursor: "pointer",
                        }}
                        title="Remover serviço"
                      >
                        <X className="w-3 h-3" strokeWidth={3} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              data-testid="button-confirm-services"
              disabled={selectedServices.length === 0}
              onClick={handleServicesConfirm}
              className="w-full rounded-xl text-center font-semibold transition-opacity"
              style={{
                height: 52,
                backgroundColor: AMBER_DEEP,
                color: "hsl(0 0% 100%)",
                border: "none",
                cursor: selectedServices.length === 0 ? "not-allowed" : "pointer",
                opacity: selectedServices.length === 0 ? 0.45 : 1,
              }}
            >
              {selectedServices.length === 0
                ? "Selecione ao menos um serviço"
                : `Continuar — ${selectedServices.length} serviço${selectedServices.length > 1 ? "s" : ""} selecionado${selectedServices.length > 1 ? "s" : ""}`}
            </button>
          </div>
        )}

        {(settings as any)?.bookingEnabled !== false && <Card className="border-border bg-card shadow-2xl overflow-hidden" style={{ display: (step === 0 || step === 1) ? "none" : "block" }}>

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

              {selectedServices.length > 0 && (
                <div
                  className="rounded-xl p-3 space-y-1"
                  style={{ backgroundColor: "hsl(0 0% 9%)", border: "1px solid hsl(0 0% 14%)" }}
                >
                  {selectedServices.map(sv => {
                    const isFree = redeemedServiceIds.includes(sv.id);
                    return (
                      <div key={sv.id} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <Scissors className="w-3 h-3" style={{ color: AMBER }} />
                          <span className="font-medium">{sv.name}</span>
                        </span>
                        <span className="text-muted-foreground">
                          {sv.durationMinutes} min · {isFree
                            ? <span style={{ color: "hsl(142 71% 45%)", fontWeight: 600 }}>Grátis</span>
                            : `R$ ${sv.price.toFixed(2).replace(".", ",")}`}
                        </span>
                      </div>
                    );
                  })}
                  {appliedCombo && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t" style={{ borderColor: "hsl(0 0% 14%)" }}>
                      <span className="text-muted-foreground">🎉 Desconto combo</span>
                      <span style={{ color: "hsl(142 71% 45%)", fontWeight: 600 }}>
                        {appliedCombo.discountType === "value"
                          ? `- R$ ${Number(appliedCombo.discountPercent).toFixed(2).replace(".", ",")}`
                          : `- ${appliedCombo.discountPercent}%`}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs pt-1 border-t" style={{ borderColor: "hsl(0 0% 14%)" }}>
                    <span className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Total</span>
                    <span style={{ color: AMBER, fontWeight: 700 }}>
                      {totalDuration} min · R$ {totalPrice.toFixed(2).replace(".", ",")}
                    </span>
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
                  {Array.from({ length: (settings as any)?.maxBookingDays ?? 7 }).map((_, i) => {
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
                {(() => {
                  const availableSlots = (availability?.slots ?? []).filter((s) => s.available);
                  if (availability?.dayClosed) {
                    return (
                      <p className="text-center text-sm py-8" style={{ color: "hsl(0 0% 55%)" }}>
                        Fechado neste dia. Escolha outra data.
                      </p>
                    );
                  }
                  if (loadingSlots && !availability) {
                    return (
                      <p className="text-center text-sm py-8" style={{ color: "hsl(0 0% 45%)" }}>
                        Carregando horários…
                      </p>
                    );
                  }
                  if (availability && availableSlots.length === 0) {
                    return (
                      <p className="text-center text-sm py-8" style={{ color: "hsl(0 0% 55%)" }}>
                        Nenhum horário disponível neste dia. Escolha outra data.
                      </p>
                    );
                  }
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map(({ time: value }) => {
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
                  );
                })()}
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
                <CardTitle>Revisar agendamento</CardTitle>
                <CardDescription>
                  {selectedServices.map(s => s.name).join(" + ")} · {formData.date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })} às {formData.time}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
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

                {selectedServices.length > 0 && (
                  <div
                    className="rounded-xl p-4 space-y-2"
                    style={{ backgroundColor: "hsl(0 0% 9%)", border: "1px solid hsl(0 0% 14%)" }}
                  >
                    {(() => {
                      let remainingDiscount = loyaltyDiscountAmount;
                      return selectedServices.map(sv => {
                        const redeemable = loyaltyBalance?.enabled && loyaltyAvailableDiscount >= sv.price && sv.price > 0;
                        const discountHere = useLoyaltyPoints && redeemable
                          ? Math.min(sv.price, remainingDiscount)
                          : 0;
                        remainingDiscount = Math.max(0, remainingDiscount - discountHere);
                        const finalPrice = sv.price - discountHere;
                        return (
                          <div key={sv.id} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{sv.name}</span>
                            <span className="font-semibold">
                              {discountHere > 0 && (
                                <>
                                  <span className="line-through text-muted-foreground mr-1" style={{ opacity: 0.6 }}>
                                    R$ {sv.price.toFixed(2).replace(".", ",")}
                                  </span>
                                  <span style={{ color: AMBER }}>
                                    R$ {finalPrice.toFixed(2).replace(".", ",")} ⭐
                                  </span>
                                </>
                              )}
                              {discountHere === 0 && (
                                <>R$ {sv.price.toFixed(2).replace(".", ",")}</>
                              )}
                            </span>
                          </div>
                        );
                      });
                    })()}
                    {appliedCombo && (
                      <div className="flex items-center justify-between text-sm" style={{ color: "hsl(142 71% 45%)" }}>
                        <span>🎉 Desconto combo{appliedCombo.discountType === "percent" ? ` (${appliedCombo.discountPercent}%)` : ""}</span>
                        <span className="font-semibold">- R$ {discountAmount.toFixed(2).replace(".", ",")}</span>
                      </div>
                    )}
                    <div
                      className="flex items-center justify-between pt-2 mt-1 border-t"
                      style={{ borderColor: "hsl(0 0% 14%)" }}
                    >
                      <span className="font-semibold">Total</span>
                      <span className="font-bold" style={{ color: AMBER }}>
                        R$ {totalPrice.toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  </div>
                )}

                {redeemedServiceIds.length > 0 && loyaltyBalance?.enabled && (
                  <div
                    className="rounded-xl p-4 space-y-2"
                    style={{ backgroundColor: "hsl(38 88% 55% / 0.08)", border: `1px solid ${AMBER}4D` }}
                  >
                    <p className="font-semibold text-sm">⭐ Pontos de Fidelidade usados</p>
                    {selectedServices
                      .filter(s => redeemedServiceIds.includes(s.id))
                      .map(sv => (
                        <div key={sv.id} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{sv.name}</span>
                          <span className="font-semibold" style={{ color: AMBER }}>
                            R$ {sv.price.toFixed(2).replace(".", ",")} ⭐
                          </span>
                        </div>
                      ))}
                    <div className="flex items-center justify-between text-sm pt-1 border-t" style={{ borderColor: `${AMBER}33` }}>
                      <span className="text-muted-foreground">Total de pontos</span>
                      <span className="font-semibold" style={{ color: AMBER }}>
                        {loyaltyPointsToSpend} pts
                      </span>
                    </div>
                  </div>
                )}

                {/* Subscription plan banner */}
                {hasActivePlan && redeemedServiceIds.length === 0 && (
                  <div
                    className="rounded-xl p-4 space-y-2"
                    style={{
                      backgroundColor: usePlan ? "hsl(210 80% 55% / 0.08)" : "hsl(0 0% 9%)",
                      border: `1px solid ${usePlan ? "hsl(210 80% 55% / 0.3)" : "hsl(0 0% 14%)"}`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: "1.1rem" }}>🏅</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">Plano {subscriptionCheck?.planName}</p>
                          <p className="text-xs" style={{ color: "hsl(0 0% 65%)" }}>
                            {planCredits}/{planTotal} créditos
                            {subscriptionCheck?.expiresAt && (
                              <> · expira {new Date(subscriptionCheck.expiresAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={planExpired || !planEnoughCredits}
                      onClick={() => { setFormData(prev => ({ ...prev, usePlan: !prev.usePlan })); }}
                      className="w-full rounded-lg py-2.5 text-sm font-semibold transition-all"
                      style={{
                        backgroundColor: usePlan ? "hsl(210 80% 55%)" : "hsl(0 0% 11%)",
                        color: usePlan ? "hsl(0 0% 100%)" : "hsl(0 0% 75%)",
                        border: `1px solid ${usePlan ? "hsl(210 80% 55%)" : "hsl(0 0% 18%)"}`,
                        cursor: planExpired || !planEnoughCredits ? "not-allowed" : "pointer",
                        opacity: planExpired || !planEnoughCredits ? 0.5 : 1,
                      }}
                    >
                      {usePlan
                        ? `✓ Usando plano — ${planCreditCost} créditos`
                        : planExpired
                          ? "Plano expirado"
                          : !planEnoughCredits
                            ? `Créditos insuficientes (${planCredits} < ${planCreditCost})`
                            : `Usar plano (${planCreditCost} créditos)`}
                    </button>
                  </div>
                )}

                <div
                  className="pt-2 border-t"
                  style={{ borderColor: "hsl(0 0% 12%)" }}
                />

                <button
                  type="button"
                  data-testid="button-continue-to-payment"
                  onClick={() => setStep(4)}
                  className="w-full rounded-xl text-center font-semibold transition-opacity"
                  style={{
                    height: 52,
                    backgroundColor: AMBER_DEEP,
                    color: "hsl(0 0% 100%)",
                    border: "none",
                    cursor: "pointer",
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
                    title: "Pagar depois",
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
                      onClick={() => { setFormData({ ...formData, paymentMethod: value }); }}
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

              {/* PIX instructions when "pay now" is selected */}
              {formData.paymentMethod === "now" && pixKey && (
                <div
                  className="rounded-2xl p-5 space-y-4"
                  style={{ backgroundColor: "hsl(0 0% 7%)", border: "1px solid hsl(38 88% 55% / 0.3)" }}
                >
                  <p className="text-sm font-semibold" style={{ color: AMBER }}>Pague via Pix antes de confirmar</p>
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-2 bg-white rounded-xl">
                      <QRCodeSVG value={pixKey} size={160} />
                    </div>
                    <div className="w-full space-y-1">
                      <p className="text-xs text-muted-foreground text-center">Ou copie a chave Pix:</p>
                      <div
                        className="flex items-center gap-2 rounded-lg px-3 py-2"
                        style={{ backgroundColor: "hsl(0 0% 11%)", border: "1px solid hsl(0 0% 18%)" }}
                      >
                        <span className="flex-1 text-sm font-mono truncate">{pixKey}</span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(pixKey)}
                          className="shrink-0 p-1 rounded hover:opacity-70 transition-opacity"
                          style={{ color: AMBER, background: "none", border: "none", cursor: "pointer" }}
                          title="Copiar chave Pix"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
        </Card>}
      </div>

      {confirmed && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center"
          style={{ backgroundColor: "hsl(0 0% 4% / 0.97)", backdropFilter: "blur(4px)" }}
          data-testid="overlay-booking-confirmed"
        >
          <style>{`
            @keyframes bkPop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
            @keyframes bkDraw { to { stroke-dashoffset: 0; } }
            @keyframes bkRing { 0% { transform: scale(0.65); opacity: 0.55; } 100% { transform: scale(1.9); opacity: 0; } }
            @keyframes bkUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
            .bk-pop { animation: bkPop 0.55s cubic-bezier(0.22,1,0.36,1) forwards; }
            .bk-circle { stroke-dasharray: 1; stroke-dashoffset: 1; animation: bkDraw 0.55s ease forwards 0.1s; }
            .bk-check { stroke-dasharray: 1; stroke-dashoffset: 1; animation: bkDraw 0.4s ease forwards 0.5s; }
            .bk-ring { position: absolute; inset: 0; border-radius: 9999px; animation: bkRing 1.6s ease-out infinite 0.5s; }
            .bk-ring-2 { animation-delay: 1s; }
            .bk-fade { opacity: 0; animation: bkUp 0.5s ease forwards 0.8s; }
            .bk-fade-2 { opacity: 0; animation: bkUp 0.5s ease forwards 1s; }
          `}</style>

          <div className="relative bk-pop" style={{ width: 128, height: 128 }}>
            <span className="bk-ring" style={{ border: `2px solid ${AMBER}` }} />
            <span className="bk-ring bk-ring-2" style={{ border: `2px solid ${AMBER}` }} />
            <svg width="128" height="128" viewBox="0 0 128 128" style={{ position: "relative" }}>
              <circle
                cx="64"
                cy="64"
                r="58"
                fill={AMBER_SOFT}
                stroke={AMBER}
                strokeWidth="4"
                pathLength={1}
                className="bk-circle"
              />
              <path
                d="M40 66 L57 83 L90 46"
                fill="none"
                stroke={AMBER}
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                className="bk-check"
              />
            </svg>
          </div>

          <h2 className="bk-fade text-2xl font-bold mt-6">Agendamento confirmado!</h2>
          <p className="bk-fade-2 text-sm text-muted-foreground mt-2">
            {formData.paymentMethod === "now"
              ? "Efetue o pagamento via Pix para garantir seu horário."
              : "Tudo certo! Te esperamos no horário marcado."}
          </p>
          {settings?.bookingPageMessage && (
            <p className="bk-fade-2 text-sm mt-3 max-w-xs" style={{ color: AMBER }}>
              {settings.bookingPageMessage}
            </p>
          )}

          {formData.paymentMethod === "now" && pixKey && (
            <div
              className="bk-fade-2 mt-6 rounded-2xl p-5 w-full max-w-xs space-y-4 text-left"
              style={{ backgroundColor: "hsl(0 0% 9%)", border: `1px solid ${AMBER}4D` }}
            >
              <p className="text-xs font-semibold text-center" style={{ color: AMBER }}>
                Pague via Pix
              </p>
              <div className="flex justify-center">
                <div className="p-2 bg-white rounded-xl">
                  <QRCodeSVG value={pixKey} size={160} />
                </div>
              </div>
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ backgroundColor: "hsl(0 0% 13%)", border: "1px solid hsl(0 0% 20%)" }}
              >
                <span className="flex-1 text-sm font-mono truncate">{pixKey}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(pixKey)}
                  className="shrink-0 p-1 rounded hover:opacity-70 transition-opacity"
                  style={{ color: AMBER, background: "none", border: "none", cursor: "pointer" }}
                  title="Copiar chave Pix"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Points confirmation modal */}
      {pointsModal.open && pointsModal.serviceId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ backgroundColor: "hsl(0 0% 4% / 0.85)", backdropFilter: "blur(4px)" }}
          onClick={() => setPointsModal({ open: false, serviceId: null, serviceName: "", servicePrice: 0 })}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-5"
            style={{ backgroundColor: "hsl(0 0% 8%)", border: "1px solid hsl(0 0% 18%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center space-y-2">
              <span style={{ fontSize: "2rem" }}>⭐</span>
              <h3 className="text-lg font-bold">Usar pontos de fidelidade?</h3>
              <p className="text-sm text-muted-foreground">
                Deseja pagar <strong>{pointsModal.serviceName}</strong> usando seus pontos?
              </p>
              <p className="text-xs" style={{ color: AMBER }}>
                Preço: R$ {pointsModal.servicePrice.toFixed(2).replace(".", ",")} ⭐
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setPointsModal({ open: false, serviceId: null, serviceName: "", servicePrice: 0 });
                  setFormData(prev => ({ ...prev, serviceIds: [...prev.serviceIds, pointsModal.serviceId!], time: "" }));
                }}
                className="flex-1 rounded-lg py-3 text-sm font-semibold transition-opacity"
                style={{
                  backgroundColor: "hsl(0 0% 14%)",
                  color: "hsl(0 0% 65%)",
                  border: "1px solid hsl(0 0% 22%)",
                  cursor: "pointer",
                }}
              >
                Pagar normalmente
              </button>
              <button
                type="button"
                onClick={() => {
                  setPointsModal({ open: false, serviceId: null, serviceName: "", servicePrice: 0 });
                  setFormData(prev => ({ ...prev, serviceIds: [...prev.serviceIds, pointsModal.serviceId!], time: "" }));
                  setRedeemedServiceIds(prev => [...prev, pointsModal.serviceId!]);
                }}
                className="flex-1 rounded-lg py-3 text-sm font-semibold transition-opacity"
                style={{
                  backgroundColor: AMBER,
                  color: "hsl(0 0% 10%)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Usar pontos ⭐
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
