import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueries } from "@tanstack/react-query";
import { useListServices, useCreateAppointment, getListServicesQueryKey, useGetSettings, getGetSettingsQueryKey, useGetAvailability, getGetAvailabilityQueryKey, useListBarbers, getListBarbersQueryKey, useListComboDiscounts, getListComboDiscountsQueryKey, getAppointmentByToken, getGetAppointmentByTokenQueryKey, useGetLoyaltyBalance, getGetLoyaltyBalanceQueryKey, useCheckSubscription, getCheckSubscriptionQueryKey, useJoinWaitlist, useGetWaitlistEntry, getGetWaitlistEntryQueryKey, useLeaveWaitlist } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Scissors, Calendar as CalendarIcon, CalendarClock, Clock, User, ChevronRight, ChevronLeft, DollarSign, CreditCard, Banknote, Check, Copy, X, Star, AlertTriangle } from "lucide-react";

const AMBER = "hsl(38 88% 55%)";
const AMBER_SOFT = "hsl(38 88% 55% / 0.15)";
const AMBER_DEEP = "hsl(38 80% 45%)";
const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const STEP_LABELS_BASE = ["Seus dados", "Serviço", "Data e hora", "Pagamento"] as const;
const STEP_LABELS_WITH_BARBER = ["Seus dados", "Profissional", "Serviço", "Data e hora", "Pagamento"] as const;
const DEFAULT_OPEN_MINUTES = 9 * 60;
const DEFAULT_CLOSE_MINUTES = 18 * 60;
const BUSYNESS_REFRESH_INTERVAL_MS = 2 * 60 * 1000;

type BookingDaySchedule = {
  closed?: boolean;
  open?: string;
  close?: string;
};

type BarberBusyness = {
  dayClosed: boolean;
  level: "closed" | "low" | "moderate" | "high" | "critical";
};

function parseBookingTime(value: string | undefined, fallback: number): number {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return fallback;
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes)
    ? hours * 60 + minutes
    : fallback;
}

function readPendingAppointmentTokens(tokensKey: string, legacyKey: string): string[] {
  try {
    const savedTokens = localStorage.getItem(tokensKey);
    if (savedTokens) {
      const parsed = JSON.parse(savedTokens);
      if (Array.isArray(parsed)) {
        const tokens = parsed.filter((token): token is string => typeof token === "string" && token.length > 0);
        if (tokens.length > 0) return [...new Set(tokens)];
      }
    }
    const legacyToken = localStorage.getItem(legacyKey);
    return legacyToken ? [legacyToken] : [];
  } catch {
    return [];
  }
}

function savePendingAppointmentTokens(tokensKey: string, tokens: string[]): void {
  try {
    const uniqueTokens = [...new Set(tokens.filter(Boolean))];
    if (uniqueTokens.length > 0) {
      localStorage.setItem(tokensKey, JSON.stringify(uniqueTokens));
    } else {
      localStorage.removeItem(tokensKey);
    }
  } catch {
    // Local storage may be unavailable in private browsing; the booking still works.
  }
}

function addPendingAppointmentToken(tokensKey: string, legacyKey: string, token: string): void {
  const tokens = readPendingAppointmentTokens(tokensKey, legacyKey);
  savePendingAppointmentTokens(tokensKey, [...tokens, token]);
  try {
    localStorage.removeItem(legacyKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function formatPendingAppointmentDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function formatPendingAppointmentTime(value: string): string {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

type PendingAppointmentSummary = {
  cancelToken?: string | null;
  clientName: string;
  serviceName: string;
  serviceDuration: number;
  scheduledAt: string;
  status: string;
};

type StoredClientInfo = {
  name?: string;
  lastName?: string;
  phone?: string;
};

function readClientInfo(key: string): StoredClientInfo | null {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved) as StoredClientInfo;
  } catch {
    // Safari private browsing can reject localStorage access.
  }

  try {
    const cookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${encodeURIComponent(key)}=`));
    if (!cookie) return null;
    return JSON.parse(decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1))) as StoredClientInfo;
  } catch {
    return null;
  }
}

function saveClientInfo(key: string, info: StoredClientInfo): void {
  const value = JSON.stringify(info);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Continue with the cookie fallback below.
  }

  try {
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax`;
  } catch {
    // The booking itself must not fail if browser storage is unavailable.
  }
}

type PublicWaitlistStatus = {
  desiredDate: string;
  serviceName: string;
  barberName?: string | null;
  status: string;
  offeredScheduledAt?: string | null;
  offerToken?: string | null;
};

const PENDING_STATUS_LABEL: Record<string, string> = {
  pending: "Confirmado",
  pending_payment: "Aguardando Pix",
  in_progress: "Em atendimento",
};

function AppointmentChooser({
  appointments,
  onSelect,
  onNewBooking,
}: {
  appointments: PendingAppointmentSummary[];
  onSelect: (token: string) => void;
  onNewBooking: () => void;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4 flex flex-col items-center">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-3">
          <div
            className="mx-auto rounded-full flex items-center justify-center"
            style={{ width: 72, height: 72, backgroundColor: AMBER_SOFT, border: `2px solid ${AMBER}` }}
          >
            <CalendarIcon className="w-8 h-8" style={{ color: AMBER }} />
          </div>
          <h1 className="text-2xl font-bold">Seus agendamentos</h1>
          <p className="text-sm text-muted-foreground">
            Você tem mais de um agendamento. Escolha qual deseja cancelar ou mudar de horário.
          </p>
        </div>

        <div className="space-y-4">
          {appointments.map((appointment) => (
            <article
              key={appointment.cancelToken}
              className="w-full rounded-2xl p-5 space-y-4"
              style={{
                backgroundColor: "hsl(0 0% 7%)",
                border: "1px solid hsl(0 0% 19%)",
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Agendamento
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: "hsl(142 70% 45% / 0.15)",
                    color: "hsl(142 70% 55%)",
                  }}
                >
                  {PENDING_STATUS_LABEL[appointment.status] ?? appointment.status}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cliente</p>
                    <p className="text-sm font-semibold truncate">{appointment.clientName}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Scissors className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Serviço</p>
                    <p className="text-sm font-semibold truncate">
                      {appointment.serviceName} · {appointment.serviceDuration} min
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CalendarIcon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Data</p>
                    <p className="text-sm font-semibold capitalize">{formatPendingAppointmentDate(appointment.scheduledAt)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Horário</p>
                    <p className="text-sm font-semibold">{formatPendingAppointmentTime(appointment.scheduledAt)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (appointment.cancelToken) onSelect(appointment.cancelToken);
                  }}
                  className="rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{
                    backgroundColor: "hsl(0 0% 9%)",
                    border: `1px solid ${AMBER}`,
                    color: AMBER,
                    cursor: "pointer",
                  }}
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Mudar horário
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (appointment.cancelToken) onSelect(appointment.cancelToken);
                  }}
                  className="rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{
                    backgroundColor: "hsl(0 0% 9%)",
                    border: "1px solid hsl(0 62% 50% / 0.45)",
                    color: "hsl(0 70% 65%)",
                    cursor: "pointer",
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              </div>
            </article>
          ))}
        </div>

        <button
          type="button"
          onClick={onNewBooking}
          className="w-full rounded-xl py-3 text-sm font-semibold"
          style={{
            backgroundColor: AMBER_DEEP,
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          Fazer outro agendamento
        </button>
      </div>
    </div>
  );
}

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

export default function Booking({ shopId: shopIdProp, slug: slugProp }: { shopId?: string; slug?: string } = {}) {
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
  const isBookingForAnotherPerson = Boolean(urlChildName || urlChildLastName);

  // ── Existing-appointment redirect ──────────────────────────────────────────
  // Keep every active appointment token so a client can choose which booking
  // to cancel or reschedule when they return to the public link.
  const storageKey = `barber_pending_token_${shopId ?? "admin"}`;
  const tokensStorageKey = `barber_pending_tokens_${shopId ?? "admin"}`;
  const waitlistStorageKey = `barber_waitlist_token_${shopId ?? "public"}`;
  const [waitlistToken, setWaitlistToken] = useState<string | null>(() => {
    if (isNewBooking) return null;
    try {
      const token = localStorage.getItem(waitlistStorageKey);
      return token || null;
    } catch {
      return null;
    }
  });
  const waitlistEntryQuery = useGetWaitlistEntry(waitlistToken ?? "", {
    query: {
      queryKey: getGetWaitlistEntryQueryKey(waitlistToken ?? ""),
      enabled: Boolean(waitlistToken) && !isNewBooking,
    },
  });
  const [joinedWaitlistEntry, setJoinedWaitlistEntry] = useState<PublicWaitlistStatus | null>(null);
  const activeWaitlistEntry = waitlistToken
    ? joinedWaitlistEntry ?? waitlistEntryQuery.data ?? null
    : null;

  useEffect(() => {
    if (!waitlistToken || waitlistEntryQuery.isPending || waitlistEntryQuery.isFetching) return;
    if (waitlistEntryQuery.isError || !waitlistEntryQuery.data) {
      setWaitlistToken(null);
      setJoinedWaitlistEntry(null);
      try {
        localStorage.removeItem(waitlistStorageKey);
      } catch {
        // Ignore storage cleanup failures.
      }
      return;
    }
    setJoinedWaitlistEntry(waitlistEntryQuery.data);
  }, [waitlistEntryQuery.data, waitlistEntryQuery.isError, waitlistEntryQuery.isFetching, waitlistEntryQuery.isPending, waitlistStorageKey, waitlistToken]);

  const [pendingTokens, setPendingTokens] = useState<string[]>(() =>
    isNewBooking ? [] : readPendingAppointmentTokens(tokensStorageKey, storageKey)
  );
  const pendingAppointmentQueries = useQueries({
    queries: pendingTokens.map((token) => ({
      queryKey: getGetAppointmentByTokenQueryKey(token),
      queryFn: () => getAppointmentByToken(token),
      enabled: !isNewBooking,
    })),
  });
  const pendingAppointments = pendingAppointmentQueries
    .map((query) => query.data)
    .filter((appointment): appointment is NonNullable<typeof appointment> => Boolean(appointment));
  const pendingQueriesSettled = pendingAppointmentQueries.every((query) => !query.isPending && !query.isFetching);
  const redirectedPendingToken = React.useRef<string | null>(null);
  const activePendingAppointments = pendingAppointments.filter((appointment) =>
    appointment.status !== "cancelled" &&
    appointment.status !== "completed" &&
    appointment.status !== "payment_rejected" &&
    Boolean(appointment.cancelToken)
  );

  useEffect(() => {
    if (isNewBooking || !shopId || pendingTokens.length === 0 || !pendingQueriesSettled) return;

    const activeAppointments = activePendingAppointments;
    const activeTokens = activeAppointments
      .map((appointment) => appointment.cancelToken)
      .filter((token): token is string => Boolean(token));

    if (activeTokens.length !== pendingTokens.length || activeTokens.some((token, index) => token !== pendingTokens[index])) {
      setPendingTokens(activeTokens);
      savePendingAppointmentTokens(tokensStorageKey, activeTokens);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage cleanup failures.
      }
    }

    if (activeAppointments.length !== 1) return;
    const token = activeAppointments[0]?.cancelToken;
    if (!token || redirectedPendingToken.current === token) return;
    redirectedPendingToken.current = token;
    const shopParam = shopId ? `?shopId=${encodeURIComponent(shopId)}` : "";
    setLocation(`/agendamento/${token}${shopParam}`);
  }, [
    isNewBooking,
    activePendingAppointments,
    pendingQueriesSettled,
    pendingTokens,
    shopId,
    shopIdProp,
    setLocation,
    storageKey,
    tokensStorageKey,
  ]);
  // ──────────────────────────────────────────────────────────────────────────

  const { data: services } = useListServices(
    shopId ? { shopId } : undefined,
    { query: { queryKey: getListServicesQueryKey(shopId ? { shopId } : undefined) } }
  );
  const { data: settings } = useGetSettings(
    shopId ? { shopId } : undefined,
    { query: { queryKey: getGetSettingsQueryKey(shopId ? { shopId } : undefined) } }
  );
  const showServicePrices = (settings as { showServicePrices?: boolean } | undefined)?.showServicePrices !== false;
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
  const [confirmedToken, setConfirmedToken] = useState<string | null>(null);
  // When true, step 1 shows the barber picker instead of the service list.
  // Default to true until barbers load; switches off if 0/1 active barbers.
  const [pickingBarber, setPickingBarber] = useState(true);

  // ── Push notification banner ────────────────────────────────────────────────
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [pushState, setPushState] = useState<"unknown" | "idle" | "subscribed" | "denied">("unknown");
  const [pendingPushSub, setPendingPushSub] = useState<PushSubscriptionJSON | null>(null);
  const [pixCopied, setPixCopied] = useState(false);

  // Keep the autoscale-safe push trigger alive while a public booking page is open.
  // The server scheduler remains the fallback when the page is closed.
  useEffect(() => {
    if (!shopId || adminUser) return;
    const ping = () => {
      fetch(`${BASE}/api/push/trigger-reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      }).catch(() => {});
    };
    ping();
    const id = window.setInterval(ping, 60_000);
    return () => window.clearInterval(id);
  }, [BASE, shopId, adminUser]);

  useEffect(() => {
    if (adminUser) return; // no push prompt for admin
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setPushState("denied"); return; }
    if (Notification.permission === "denied") { setPushState("denied"); return; }
    navigator.serviceWorker.register("/sw.js").then((reg) =>
      reg.pushManager.getSubscription().then((sub) => {
        setPendingPushSub(sub?.toJSON() ?? null);
        setPushState(sub ? "subscribed" : "idle");
      })
    ).catch(() => setPushState("denied"));
  }, [adminUser]);

  const urlBase64ToUint8Array = (b64: string) => {
    const padding = "=".repeat((4 - (b64.length % 4)) % 4);
    const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  };

  const handleEnablePush = async (): Promise<PushSubscriptionJSON | null> => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPushState("denied"); return null; }
      const keyRes = await fetch(`${BASE}/api/push/vapid-public-key`);
      const { key } = await keyRes.json() as { key: string };
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const json = sub.toJSON();
      setPendingPushSub(json);
      setPushState("subscribed");
      return json;
    } catch { setPushState("idle"); return null; }
  };

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
    // Child booking via "Agendar outro corte" — use URL-provided name, inherit parent phone
    if (urlChildName) {
      const parentPhone = readClientInfo(`barber_client_info_${shopId ?? "public"}`)?.phone ?? "";
      return {
        serviceIds: [],
        barberId: "",
        date: new Date(),
        time: "",
        name: urlChildName,
        lastName: urlChildLastName,
        phone: parentPhone,
        notes: "",
        paymentMethod: "on_site",
        usePlan: false,
      };
    }
    const saved = readClientInfo(clientInfoKey);
    if (saved) {
      return {
        serviceIds: [],
        barberId: "",
        date: new Date(),
        time: "",
        name: saved.name ?? "",
        lastName: saved.lastName ?? "",
        phone: saved.phone ?? "",
        notes: "",
        paymentMethod: "on_site",
        usePlan: false,
      };
    }
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

  // Sync client name from DB on mount — in case the barber edited the name in the panel.
  // Only runs when the phone is already known from localStorage (returning client).
  useEffect(() => {
    // In the "Agendar outro corte" flow, the phone belongs to the responsible
    // client but the appointment name belongs to the person who will cut.
    // Never replace the explicitly supplied name with the responsible client's name.
    if (isBookingForAnotherPerson) return;
    const phone = formData.phone;
    const sid = shopId;
    if (!phone || !sid) return;
    const params = new URLSearchParams({ phone, shopId: sid });
    fetch(`/api/b/client?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then((client: { name: string } | null) => {
        if (!client?.name) return;
        const parts = client.name.trim().split(" ");
        const first = parts[0] ?? "";
        const last = parts.slice(1).join(" ");
        setFormData(prev => {
          if (prev.name === first && prev.lastName === last) return prev;
          return { ...prev, name: first, lastName: last };
        });
        const key = `barber_client_info_${sid}`;
        const saved = readClientInfo(key);
        if (saved) saveClientInfo(key, { ...saved, name: first, lastName: last });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBookingForAnotherPerson]);

  // Save while the client fills the first step, not only after booking succeeds.
  // This protects the form data when Safari suspends or reloads the page during
  // the transition to the confirmation screen.
  useEffect(() => {
    if (isBookingForAnotherPerson || !formData.name.trim() || !formData.phone.trim()) return;
    saveClientInfo(clientInfoKey, {
      name: formData.name,
      lastName: formData.lastName,
      phone: formData.phone,
    });
  }, [clientInfoKey, formData.name, formData.lastName, formData.phone, isBookingForAnotherPerson]);

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
         serviceIds: selectedServices.map((service) => service.id),
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
          // Keep every active token on the public booking page so the client can
          // choose which appointment to manage when returning to the link.
          if (created?.cancelToken && !!shopId) {
            addPendingAppointmentToken(tokensStorageKey, storageKey, created.cancelToken);
            setConfirmedToken(created.cancelToken);
          }
          // Persist name+phone so the client doesn't have to retype next visit
          if (formData.name && formData.phone && !isBookingForAnotherPerson) {
            saveClientInfo(clientInfoKey, {
              name: formData.name,
              lastName: formData.lastName,
              phone: formData.phone,
            });
          }
          // Register push subscription (collected before booking) now that we have the cancelToken
          if (pendingPushSub && created?.cancelToken && created?.scheduledAt) {
            const json = pendingPushSub;
            if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
              fetch(`${BASE}/api/push/subscribe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  cancelToken: created.cancelToken,
                  scheduledAt: created.scheduledAt,
                  endpoint: json.endpoint,
                  p256dh: json.keys.p256dh,
                  auth: json.keys.auth,
                }),
              }).catch(() => {});
              fetch(`${BASE}/api/push/reengagement-subscribe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  cancelToken: created.cancelToken,
                  endpoint: json.endpoint,
                  p256dh: json.keys.p256dh,
                  auth: json.keys.auth,
                }),
              }).catch(() => {});
            }
          }
          setConfirmed(true);
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
  const promotionalServiceIds = React.useMemo(
    () => new Set(
      (services ?? [])
        .filter(service =>
          (service.dayPricing ?? []).some(dayPrice =>
            Number(dayPrice.price) !== Number(service.price)
          )
        )
        .map(service => service.id)
    ),
    [services]
  );
  const getPromotionalPrice = (service: typeof selectedServices[number], date?: Date) => {
    const regularPrice = Number(service.price);
    const lowerPrices = (service.dayPricing ?? [])
      .filter(dayPrice => Number(dayPrice.price) < regularPrice)
      .map(dayPrice => ({ dayOfWeek: dayPrice.dayOfWeek, price: Number(dayPrice.price) }))
      .filter(dayPrice => Number.isFinite(dayPrice.price));

    if (date) {
      const dayPrice = lowerPrices.find(item => item.dayOfWeek === date.getDay());
      return dayPrice?.price ?? null;
    }

    return lowerPrices.length > 0
      ? Math.min(...lowerPrices.map(item => item.price))
      : null;
  };
  const getEffectiveServicePrice = (service: typeof selectedServices[number], date: Date) => {
    const dayPrice = (service.dayPricing ?? []).find(item => item.dayOfWeek === date.getDay());
    const price = dayPrice ? Number(dayPrice.price) : Number(service.price);
    return Number.isFinite(price) ? price : Number(service.price);
  };

  const totalDurationRaw = selectedServices.reduce((acc, s) => acc + s.durationMinutes, 0);
  const totalPriceRaw = selectedServices.reduce((acc, s) => acc + getEffectiveServicePrice(s, formData.date), 0);

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
        .reduce((acc, s) => acc + getEffectiveServicePrice(s, formData.date), 0)
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
  // Points already committed to services the client chose to redeem
  const loyaltyAlreadyCommitted = selectedServices
    .filter(s => redeemedServiceIds.includes(s.id))
    .reduce((acc, s) => acc + getEffectiveServicePrice(s, formData.date), 0);
  // Remaining discount budget available for additional redemptions
  const loyaltyRemainingDiscount = Math.max(0, loyaltyAvailableDiscount - loyaltyAlreadyCommitted);
  // Expiration guidance is useful only when the current balance can redeem
  // at least one paid service the client can actually choose.
  const hasRedeemableService = loyaltyBalance?.enabled === true &&
    loyaltyAvailableDiscount > 0 &&
    eligibleServicesAll.some(service => service.price > 0 && service.price <= loyaltyAvailableDiscount);
  // Auto-clear plan selection when loyalty is active (can't combine)
  useEffect(() => {
    if (useLoyaltyPoints && formData.usePlan) {
      setFormData(prev => ({ ...prev, usePlan: false }));
    }
  }, [useLoyaltyPoints, formData.usePlan]);

  // After booking confirmation, wait 2 s then navigate to the appointment preview.
  // Falls back to localStorage in case confirmedToken state wasn't set.
  useEffect(() => {
    if (!confirmed) return;
    const token = confirmedToken ?? localStorage.getItem(storageKey);
    if (!token) return;
    const timer = setTimeout(() => {
      setLocation(`/agendamento/${token}`);
    }, 2000);
    return () => clearTimeout(timer);
  }, [confirmed, confirmedToken, storageKey, setLocation]);
  const loyaltyDiscountAmount = useLoyaltyPoints
    ? Math.min(
        loyaltyAvailableDiscount,
        selectedServices
          .filter(s => redeemedServiceIds.includes(s.id))
          .reduce((acc, s) => acc + getEffectiveServicePrice(s, formData.date), 0)
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
  const barberBusynessQueries = useQueries({
    queries: activeBarbers.map((barber) => ({
      queryKey: ["public-barber-busyness", slugProp, barber.id],
      queryFn: async (): Promise<BarberBusyness> => {
        if (!slugProp) {
          throw new Error("Slug da barbearia não informado");
        }
        const params = new URLSearchParams({ barberId: barber.id.toString() });
        const response = await fetch(
          `${BASE}/api/b/${encodeURIComponent(slugProp)}/busyness?${params.toString()}`,
        );
        if (!response.ok) {
          throw new Error("Não foi possível consultar a disponibilidade");
        }
        return response.json() as Promise<BarberBusyness>;
      },
      enabled: Boolean(slugProp) && needsBarberStep,
      staleTime: 30_000,
      refetchInterval: BUSYNESS_REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: true,
    })),
  });
  const barberBusynessById = React.useMemo(() => {
    const result = new Map<number, BarberBusyness>();
    activeBarbers.forEach((barber, index) => {
      const data = barberBusynessQueries[index]?.data;
      if (data) result.set(barber.id, data);
    });
    return result;
  }, [activeBarbers, barberBusynessQueries]);
  const bookingWeekly = (selectedBarber?.weeklySchedule ?? settings?.weeklySchedule) as
    | Partial<Record<typeof WEEKDAY_KEYS[number], BookingDaySchedule>>
    | null
    | undefined;
  const bookingDayOptions = React.useMemo(() => {
    const maxDays = Math.max(1, Number((settings as any)?.maxBookingDays ?? 7));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: maxDays }, (_, i) => {
      const day = new Date(today);
      day.setDate(today.getDate() + i);
      return day;
    }).filter((day) => !bookingWeekly?.[WEEKDAY_KEYS[day.getDay()]]?.closed);
  }, [settings, bookingWeekly]);
  const isBookingDateClosed = (date: Date) =>
    Boolean(bookingWeekly?.[WEEKDAY_KEYS[date.getDay()]]?.closed);
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

  useEffect(() => {
    if (bookingDayOptions.length === 0) return;
    const hasOpenSelectedDate = bookingDayOptions.some(
      (day) => day.toDateString() === formData.date.toDateString(),
    );
    if (!hasOpenSelectedDate) {
      setFormData((prev) => ({ ...prev, date: bookingDayOptions[0]!, time: "" }));
    }
  }, [bookingDayOptions, formData.date]);

  // When the public link is opened outside today's business hours, start on
  // the next open day. During business hours, keep today selected so the
  // "Nenhum horário disponível" notice can explain that today's slots are full.
  const autoAdvancedOutsideHours = React.useRef(false);
  useEffect(() => {
    if (autoAdvancedOutsideHours.current || !settings || !barbers || bookingDayOptions.length === 0) return;
    // Wait for the selected barber's schedule when the shop has barber-specific
    // schedules; otherwise the initial fallback could make the wrong decision.
    if (barbers.length > 0 && !selectedBarber) return;

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    if (formData.date.toDateString() !== today.toDateString()) {
      autoAdvancedOutsideHours.current = true;
      return;
    }

    const todaySchedule = bookingWeekly?.[WEEKDAY_KEYS[today.getDay()]];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const openMinutes = parseBookingTime(todaySchedule?.open, DEFAULT_OPEN_MINUTES);
    const closeMinutes = parseBookingTime(todaySchedule?.close, DEFAULT_CLOSE_MINUTES);
    const outsideBusinessHours = todaySchedule?.closed === true ||
      currentMinutes < openMinutes ||
      currentMinutes >= closeMinutes;

    autoAdvancedOutsideHours.current = true;
    if (!outsideBusinessHours) return;

    const nextOpenDay = bookingDayOptions.find((day) => day.getTime() > today.getTime());
    if (nextOpenDay) {
      setFormData((prev) => ({ ...prev, date: nextOpenDay, time: "" }));
    }
  }, [
    bookingDayOptions,
    bookingWeekly,
    barbers,
    formData.date,
    needsBarberStep,
    selectedBarber,
    settings,
  ]);

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
      // A service is redeemable only if the remaining points budget (after already-committed services) is enough to fully cover it.
      const isRedeemable = svc && loyaltyBalance?.enabled && loyaltyRemainingDiscount >= svc.price && svc.price > 0;
      // A "paid" service is one in the cart that the client is NOT redeeming with points.
      const hasPaidService = prev.serviceIds.some(id => {
        const s = services?.find(x => x.id === id);
        return s && s.price > 0 && !redeemedServiceIds.includes(id);
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
  const prepaymentBonusPoints = settings?.loyaltyConfig?.prepaymentBonusPoints ?? 0;
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
    { query: {
      queryKey: getGetAvailabilityQueryKey(availabilityParams),
      enabled: step === 2 && totalDuration > 0 && !pickingBarber && !isBookingDateClosed(formData.date),
    } }
  );
  const joinWaitlist = useJoinWaitlist();
  const leaveWaitlist = useLeaveWaitlist();
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [waitlistNeedsPush, setWaitlistNeedsPush] = useState(false);
  const [leavingWaitlist, setLeavingWaitlist] = useState(false);

  const handleJoinWaitlist = async () => {
    if (!shopId || !formData.name.trim() || !formData.phone.trim() || selectedServices.length === 0) return;
    setJoiningWaitlist(true);
    setWaitlistNeedsPush(false);
    try {
      const pushSub = pendingPushSub ?? await handleEnablePush();
      if (!pushSub?.endpoint || !pushSub.keys?.p256dh || !pushSub.keys?.auth) {
        setWaitlistNeedsPush(true);
        toast({ title: "Ative as notificações para entrar na fila.", variant: "destructive" });
        return;
      }
      const entry = await joinWaitlist.mutateAsync({
        data: {
          shopId,
          clientName: `${formData.name.trim()} ${formData.lastName.trim()}`.trim(),
          clientPhone: formData.phone,
          serviceIds: selectedServices.map((service) => service.id),
          serviceName: selectedServices.map((service) => service.name).join(" + "),
          serviceDuration: totalDuration,
          barberId: availabilityBarberId ?? null,
          barberName: selectedBarber?.name ?? null,
          desiredDate: dateKey,
          endpoint: pushSub.endpoint,
          p256dh: pushSub.keys.p256dh,
          auth: pushSub.keys.auth,
        },
      });
      setJoinedWaitlistEntry(entry);
      if (entry.offerToken) {
        setWaitlistToken(entry.offerToken);
        try {
          localStorage.setItem(waitlistStorageKey, entry.offerToken);
        } catch {
          // The server entry remains valid if local storage is unavailable.
        }
        saveClientInfo(clientInfoKey, {
          name: formData.name,
          lastName: formData.lastName,
          phone: formData.phone,
        });
      }
    } catch (error: any) {
      toast({ title: error?.response?.data?.error ?? error?.message ?? "Não foi possível entrar na fila.", variant: "destructive" });
    } finally {
      setJoiningWaitlist(false);
    }
  };

  const handleLeaveWaitlist = async () => {
    if (!waitlistToken || leavingWaitlist) return;
    if (!window.confirm("Deseja sair da fila de espera?")) return;
    setLeavingWaitlist(true);
    try {
      await leaveWaitlist.mutateAsync({ token: waitlistToken });
      setWaitlistToken(null);
      setJoinedWaitlistEntry(null);
      try {
        localStorage.removeItem(waitlistStorageKey);
      } catch {
        // Ignore storage cleanup failures.
      }
      toast({ title: "Você saiu da fila de espera." });
    } catch (error: any) {
      toast({ title: error?.response?.data?.error ?? error?.message ?? "Não foi possível sair da fila.", variant: "destructive" });
    } finally {
      setLeavingWaitlist(false);
    }
  };

  // Clear selected time if it's no longer available after a refresh.
  useEffect(() => {
    if (!formData.time || !availability) return;
    const slot = availability.slots.find(s => s.time === formData.time);
    if (!slot || !slot.available) {
      setFormData(prev => ({ ...prev, time: "" }));
    }
  }, [availability, formData.time]);

  const showAppointmentChooser =
    !isNewBooking &&
    pendingQueriesSettled &&
    activePendingAppointments.length > 1;

  if (showAppointmentChooser) {
    return (
      <AppointmentChooser
        appointments={activePendingAppointments}
        onSelect={(token) => {
          const shopParam = shopId ? `?shopId=${encodeURIComponent(shopId)}` : "";
          setLocation(`/agendamento/${token}${shopParam}`);
        }}
        onNewBooking={() => setLocation(`/booking?${shopId ? `shopId=${encodeURIComponent(shopId)}&` : ""}novo=1`)}
      />
    );
  }

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

        {(settings as any)?.bookingEnabled !== false && activeWaitlistEntry && (
          <div
            className="mt-5 rounded-2xl p-4 space-y-3"
            style={{
              backgroundColor: "hsl(142 60% 40% / 0.12)",
              border: "1px solid hsl(142 60% 40% / 0.35)",
            }}
            data-testid="card-waitlist-status"
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "hsl(142 60% 40% / 0.18)" }}
              >
                <span className="text-lg">🔔</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold">
                  {activeWaitlistEntry.status === "offered" ? "Há um horário esperando por você" : "Você está na fila de espera"}
                </p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "hsl(0 0% 65%)" }}>
                  {activeWaitlistEntry.status === "offered"
                    ? "Confira a notificação recebida para aceitar o horário antes que ele expire."
                    : `Avisaremos por notificação se surgir um horário compatível para ${activeWaitlistEntry.desiredDate.split("-").reverse().join("/")}.`}
                </p>
                <p className="mt-2 text-xs font-medium" style={{ color: "hsl(0 0% 75%)" }}>
                  {activeWaitlistEntry.serviceName}
                  {activeWaitlistEntry.barberName ? ` · ${activeWaitlistEntry.barberName}` : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="button-leave-waitlist"
              onClick={handleLeaveWaitlist}
              disabled={leavingWaitlist}
              className="w-full rounded-lg px-4 py-2 text-sm font-semibold transition-opacity"
              style={{
                backgroundColor: "hsl(0 0% 10%)",
                color: "hsl(0 0% 78%)",
                border: "1px solid hsl(0 0% 24%)",
                cursor: leavingWaitlist ? "wait" : "pointer",
                opacity: leavingWaitlist ? 0.65 : 1,
              }}
            >
              {leavingWaitlist ? "Saindo da fila…" : "Sair da fila de espera"}
            </button>
          </div>
        )}

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
                const busyness = barberBusynessById.get(b.id);
                const hasFewSlots = busyness?.dayClosed ||
                  busyness?.level === "high" ||
                  busyness?.level === "critical";
                const availabilityLabel = busyness
                  ? hasFewSlots ? "Poucas vagas" : "Bastante disponível"
                  : "Verificando disponibilidade";
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
                      <span
                        className="inline-flex mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: hasFewSlots
                            ? "hsl(38 88% 55% / 0.15)"
                            : "hsl(142 70% 45% / 0.15)",
                          color: hasFewSlots
                            ? "hsl(38 88% 65%)"
                            : "hsl(142 70% 60%)",
                        }}
                      >
                        {availabilityLabel}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: "hsl(0 0% 40%)" }} />
                  </button>
                    {value === "now" && settings?.loyaltyConfig?.enabled && prepaymentBonusPoints > 0 && (
                      <p className="mt-2 text-xs font-medium" style={{ color: AMBER }}>
                        Ganhe mais {prepaymentBonusPoints.toLocaleString("pt-BR")} pontos após a aprovação do Pix
                      </p>
                    )}
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
            {hasRedeemableService &&
              loyaltyBalance.daysUntilExpiration !== null &&
              loyaltyBalance.daysUntilExpiration <= loyaltyBalance.expirationWarningDays && (
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: "hsl(38 88% 55% / 0.12)", border: "1px solid hsl(38 88% 55% / 0.45)", color: AMBER }}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Seus pontos expiram{" "}
                    <strong>
                      {loyaltyBalance.daysUntilExpiration === 0
                        ? "hoje"
                        : loyaltyBalance.daysUntilExpiration === 1
                          ? "amanhã"
                          : `em ${loyaltyBalance.daysUntilExpiration} dias`}
                    </strong>
                    . Use-os antes que expirem.
                  </span>
                </div>
              )}

            <div className="space-y-3">
              {eligibleServicesAll.map((service) => {
                const isSelected = formData.serviceIds.includes(service.id);
                const hasPromotion = promotionalServiceIds.has(service.id);
                // This service can be redeemed with points (enough remaining budget to cover it fully).
                const canRedeemNow = loyaltyBalance?.enabled && loyaltyRemainingDiscount >= service.price && service.price > 0;
                // Points modal only triggers when a paid (non-redeemed) service is already in cart.
                const hasPaidServiceInCart = formData.serviceIds.some(id => {
                  const s = services?.find(x => x.id === id);
                  return s && s.price > 0 && !redeemedServiceIds.includes(id);
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
                      <div className={`flex items-start gap-3 ${!showServicePrices ? "items-center" : ""}`}>
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
                          </div>
                          {service.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {service.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-sm">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="w-3.5 h-3.5" />
                              {service.durationMinutes} min
                            </span>
                            {showServicePrices && (
                              <span
                                className="flex items-center gap-1 font-semibold"
                                style={{ color: hasPromotion ? "hsl(142 71% 45%)" : AMBER, whiteSpace: "nowrap" }}
                              >
                                {hasPromotion ? (
                                  <span className="text-xs font-bold tracking-wide">PROMOÇÃO</span>
                                ) : (
                                  <>
                                    <DollarSign className="w-3.5 h-3.5" />
                                    R$ {service.price.toFixed(2).replace(".", ",")}
                                  </>
                                )}
                              </span>
                            )}
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
                    const selectedDayPromotionalPrice = getPromotionalPrice(sv, formData.date);
                    return (
                      <div key={sv.id} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <Scissors className="w-3 h-3" style={{ color: AMBER }} />
                          <span className="font-medium">{sv.name}</span>
                        </span>
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            {sv.durationMinutes} min · {isFree
                            ? <span style={{ color: "hsl(142 71% 45%)", fontWeight: 600 }}>Grátis</span>
                            : selectedDayPromotionalPrice !== null
                              ? <>
                                  <span className="line-through opacity-60">R$ {sv.price.toFixed(2).replace(".", ",")}</span>
                                  <span style={{ color: "hsl(142 71% 45%)", fontWeight: 700 }}>
                                    R$ {selectedDayPromotionalPrice.toFixed(2).replace(".", ",")}
                                  </span>
                                </>
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
                  {bookingDayOptions.map((d, i) => {
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
                {bookingDayOptions.length === 0 && (
                  <p className="text-center text-sm py-4" style={{ color: "hsl(0 0% 55%)" }}>
                    Não há dias de atendimento disponíveis neste período.
                  </p>
                )}
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
                      <div
                        className="flex items-start gap-3 rounded-xl px-4 py-4"
                        style={{
                          backgroundColor: "hsl(38 88% 55% / 0.10)",
                          border: "1px solid hsl(38 88% 55% / 0.35)",
                        }}
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: "hsl(38 88% 55% / 0.18)" }}
                        >
                          <AlertTriangle className="h-5 w-5" style={{ color: AMBER }} />
                        </div>
                        <div>
                          <p className="text-base font-bold" style={{ color: "hsl(0 0% 92%)" }}>
                            Dia fechado
                          </p>
                          <p className="mt-1 text-sm leading-relaxed" style={{ color: "hsl(0 0% 65%)" }}>
                            Não há atendimento nesta data. Escolha outro dia para ver os horários disponíveis.
                          </p>
                        </div>
                      </div>
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
                     if (activeWaitlistEntry) {
                      return (
                        <div className="rounded-xl px-4 py-4" style={{ backgroundColor: "hsl(142 60% 40% / 0.12)", border: "1px solid hsl(142 60% 40% / 0.35)" }}>
                          <p className="text-base font-bold">Você entrou na fila de espera</p>
                          <p className="mt-1 text-sm leading-relaxed" style={{ color: "hsl(0 0% 65%)" }}>
                            Avisaremos por notificação se surgir um horário compatível nesta data.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div
                        className="flex items-start gap-3 rounded-xl px-4 py-4"
                        style={{
                          backgroundColor: "hsl(0 72% 50% / 0.10)",
                          border: "1px solid hsl(0 72% 50% / 0.35)",
                        }}
                        data-testid="notice-no-available-slots"
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: "hsl(0 72% 50% / 0.18)" }}
                        >
                          <AlertTriangle className="h-5 w-5" style={{ color: "hsl(0 78% 65%)" }} />
                        </div>
                        <div>
                          <p className="text-base font-bold" style={{ color: "hsl(0 0% 92%)" }}>
                            Nenhum horário disponível
                          </p>
                          <p className="mt-1 text-sm leading-relaxed" style={{ color: "hsl(0 0% 65%)" }}>
                            {availability.waitlistAvailable
                              ? "Todos os horários deste dia estão ocupados. Você pode escolher outra data ou entrar na fila."
                              : "Não há mais tempo útil para abrir outro horário neste dia. Escolha outra data."}
                          </p>
                           {availability.waitlistAvailable && pushState !== "subscribed" && (
                             <div
                               className="mt-3 rounded-lg p-3"
                               style={{ backgroundColor: "hsl(38 88% 55% / 0.10)", border: `1px solid ${AMBER}55` }}
                               data-testid="waitlist-notification-prompt"
                             >
                               <p className="text-sm font-semibold" style={{ color: "hsl(0 0% 88%)" }}>
                                 Ative as notificações para entrar na fila
                               </p>
                               <p className="mt-1 text-xs leading-relaxed" style={{ color: "hsl(0 0% 65%)" }}>
                                 A autorização vai abrir agora nesta mesma tela. Assim avisaremos rapidamente quando surgir um horário.
                               </p>
                               <button
                                 type="button"
                                 data-testid="button-enable-notifications-waitlist"
                                 onClick={handleJoinWaitlist}
                                 disabled={joiningWaitlist || !formData.name.trim() || !formData.phone.trim()}
                                 className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold"
                                 style={{ backgroundColor: AMBER, color: "hsl(0 0% 8%)", border: "none", cursor: "pointer", opacity: joiningWaitlist ? 0.6 : 1 }}
                               >
                                 {joiningWaitlist ? "Ativando notificações…" : "Ativar notificações e entrar na fila"}
                               </button>
                               {waitlistNeedsPush && (
                                 <p className="mt-2 text-xs" style={{ color: "hsl(0 78% 70%)" }}>
                                   Não foi possível ativar. Verifique a permissão de notificações do navegador e tente novamente.
                                 </p>
                               )}
                             </div>
                           )}
                           {availability.waitlistAvailable && pushState === "subscribed" && (
                             <button
                               type="button"
                               onClick={handleJoinWaitlist}
                               disabled={joiningWaitlist || !formData.name.trim() || !formData.phone.trim()}
                               className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold"
                               style={{ backgroundColor: AMBER, color: "hsl(0 0% 8%)", border: "none", cursor: "pointer", opacity: joiningWaitlist ? 0.6 : 1 }}
                             >
                               {joiningWaitlist ? "Entrando na fila…" : "Avisar-me se abrir um horário"}
                             </button>
                           )}
                        </div>
                      </div>
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
                      return selectedServices.map(sv => {
                        const effectivePrice = getEffectiveServicePrice(sv, formData.date);
                        const promotionalPrice = getPromotionalPrice(sv, formData.date);
                        const isRedeemed = useLoyaltyPoints && loyaltyBalance?.enabled && redeemedServiceIds.includes(sv.id) && effectivePrice > 0;
                        const discountHere = isRedeemed ? effectivePrice : 0;
                        const finalPrice = effectivePrice - discountHere;
                        return (
                          <div key={sv.id} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{sv.name}</span>
                            <span className="font-semibold">
                              {discountHere > 0 && (
                                <>
                                  <span className="line-through text-muted-foreground mr-1" style={{ opacity: 0.6 }}>
                                    R$ {effectivePrice.toFixed(2).replace(".", ",")}
                                  </span>
                                  <span style={{ color: AMBER }}>
                                    R$ {finalPrice.toFixed(2).replace(".", ",")} ⭐
                                  </span>
                                </>
                              )}
                              {discountHere === 0 && promotionalPrice !== null && (
                                <>
                                  <span className="line-through text-muted-foreground mr-1" style={{ opacity: 0.6 }}>
                                    R$ {sv.price.toFixed(2).replace(".", ",")}
                                  </span>
                                  <span style={{ color: "hsl(142 71% 45%)" }}>
                                    R$ {effectivePrice.toFixed(2).replace(".", ",")}
                                  </span>
                                </>
                              )}
                              {discountHere === 0 && promotionalPrice === null && (
                                <>R$ {effectivePrice.toFixed(2).replace(".", ",")}</>
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
                            R$ {getEffectiveServicePrice(sv, formData.date).toFixed(2).replace(".", ",")} ⭐
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
                           onClick={() => {
                             setFormData({ ...formData, paymentMethod: value });
                             if (value === "now") setPixCopied(false);
                           }}
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
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: "hsl(0 0% 7%)", border: "1px solid hsl(38 88% 55% / 0.3)" }}
                >
                  <p className="animate-pulse text-sm font-semibold text-center" style={{ color: AMBER }}>
                    Chave Pix — copie e faça o pagamento
                  </p>
                  <div
                    className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2"
                    style={{ backgroundColor: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 18%)" }}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={pixKey}>
                      {pixKey}
                    </span>
                    <button
                      type="button"
                      data-testid="button-copy-pix-key-before-confirm"
                      onClick={async (event) => {
                        event.stopPropagation();
                        try {
                           await navigator.clipboard.writeText(pixKey);
                           setPixCopied(true);
                        } catch {
                          setPixCopied(false);
                        }
                      }}
                      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-opacity hover:opacity-75"
                      style={{ color: AMBER, background: "none", border: "none", cursor: "pointer" }}
                      title="Copiar chave Pix"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {pixCopied ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                data-testid="button-confirm-booking"
                disabled={createAppointment.isPending || (formData.paymentMethod === "now" && !pixCopied)}
                onClick={handleBook}
                className="w-full rounded-xl text-center font-semibold transition-opacity"
                style={{
                  height: 52,
                  backgroundColor: AMBER_DEEP,
                  color: "hsl(0 0% 100%)",
                  border: "none",
                   cursor: createAppointment.isPending || (formData.paymentMethod === "now" && !pixCopied) ? "not-allowed" : "pointer",
                   opacity: createAppointment.isPending || (formData.paymentMethod === "now" && !pixCopied) ? 0.55 : 1,
                }}
              >
                {createAppointment.isPending
                  ? "Confirmando..."
                  : formData.paymentMethod === "now"
                    ? pixCopied
                      ? "Pagar e confirmar agendamento"
                      : "Copie a chave Pix para continuar"
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

          <h2 className="bk-fade text-2xl font-bold mt-6">
            {formData.paymentMethod === "now" ? "Pedido de agendamento enviado!" : "Agendamento confirmado!"}
          </h2>
          <p className="bk-fade-2 text-sm text-muted-foreground mt-2">
            {formData.paymentMethod === "now"
              ? "Seu horário está reservado e aguarda o barbeiro confirmar o pagamento Pix."
              : "Tudo certo! Te esperamos no horário marcado."}
          </p>
          {settings?.bookingPageMessage && (
            <p className="bk-fade-2 text-sm mt-3 max-w-xs" style={{ color: AMBER }}>
              {settings.bookingPageMessage}
            </p>
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

      {/* Push notification banner — shown when browser supports push but client hasn't subscribed */}
      {pushState === "idle" && !adminUser && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div
            className="max-w-md mx-auto mx-4 rounded-2xl p-4 flex items-start gap-3 shadow-2xl"
            style={{ backgroundColor: "hsl(0 0% 10%)", border: `1px solid ${AMBER}33`, margin: "0 1rem 0 1rem" }}
          >
            <span className="text-2xl mt-0.5 shrink-0">🔔</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-snug">
                Ative as notificações
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                 Receba o lembrete do horário e, se ficar sem agendar, uma mensagem de retorno da barbearia.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleEnablePush}
                  className="rounded-lg px-4 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: AMBER, color: "hsl(0 0% 8%)", border: "none", cursor: "pointer" }}
                >
                  Ativar
                </button>
                <button
                  type="button"
                  onClick={() => setPushState("denied")}
                  className="rounded-lg px-4 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "hsl(0 0% 18%)", color: "hsl(0 0% 65%)", border: "none", cursor: "pointer" }}
                >
                  Agora não
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
