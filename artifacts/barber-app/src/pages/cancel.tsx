import { useState, useEffect } from "react";
import { useRoute, useSearch } from "wouter";
import {
  useGetAppointmentByToken,
  useCancelAppointmentByToken,
  useRescheduleAppointmentByToken,
  useGetAvailability,
  getGetAppointmentByTokenQueryKey,
  getGetAvailabilityQueryKey,
  useGetSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Clock, User, Scissors, CheckCircle2, XCircle, AlertTriangle, CalendarClock, Bell, BellOff, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playRescheduled } from "@/lib/sounds";

const AMBER = "hsl(38 88% 55%)";
const AMBER_SOFT = "hsl(38 88% 55% / 0.15)";

const STATUS_LABEL: Record<string, string> = {
  pending: "Confirmado",
  in_progress: "Em atendimento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export default function CancelBooking() {
  const [, params] = useRoute("/agendamento/:token");
  const search = useSearch();
  const isNew = new URLSearchParams(search).get("novo") === "1";
  const token = params?.token ?? "";
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [childModal, setChildModal] = useState(false);
  const [childName, setChildName] = useState("");
  const [childLastName, setChildLastName] = useState("");
  const [pushState, setPushState] = useState<"unknown" | "denied" | "subscribed" | "idle">("unknown");
  const [reminderBanner, setReminderBanner] = useState(false);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  // Gate: client must interact with the notification prompt before seeing details
  const [notifGatePassed, setNotifGatePassed] = useState<boolean>(() => {
    try { return localStorage.getItem(`notif_gate_${params?.token ?? ""}`) === "1"; } catch { return false; }
  });
  const [reschedDate, setReschedDate] = useState<string>(""); // YYYY-MM-DD
  const [reschedTime, setReschedTime] = useState<string>(""); // HH:MM

  const shopId = new URLSearchParams(window.location.search).get("shopId") ?? undefined;

  const { data: appointment, isLoading, isError } = useGetAppointmentByToken(token, {
    query: { queryKey: getGetAppointmentByTokenQueryKey(token), enabled: !!token },
  });

  // Check appointment time and show reminder banner when 15 min left
  useEffect(() => {
    if (!appointment || appointment.status === "cancelled" || appointment.status === "in_progress" || appointment.status === "completed") return;
    const check = () => {
      const apptTime = new Date(appointment.scheduledAt).getTime();
      const diffMin = (apptTime - Date.now()) / 60000;
      if (diffMin <= 15 && diffMin > -5) {
        setReminderBanner(true);
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [appointment?.scheduledAt, appointment?.status]);

  // Ping the server every minute to trigger push reminders (autoscale-safe)
  useEffect(() => {
    const ping = () => {
      fetch(`${BASE}/api/push/trigger-reminders`, { method: "POST" }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("denied");
      return;
    }
    if (Notification.permission === "denied") { setPushState("denied"); return; }
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      return reg.pushManager.getSubscription().then((sub) => {
        setPushState(sub ? "subscribed" : "idle");
      });
    }).catch(() => setPushState("denied"));
  }, []);

  const passGate = () => {
    try { localStorage.setItem(`notif_gate_${token}`, "1"); } catch { /* ignore */ }
    setNotifGatePassed(true);
  };

  const handleEnableNotifications = async (fromGate = false) => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPushState("denied"); if (fromGate) passGate(); return; }
      const keyRes = await fetch(`${BASE}/api/push/vapid-public-key`);
      const { key } = await keyRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) { if (fromGate) passGate(); return; }
      await fetch(`${BASE}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cancelToken: token,
          scheduledAt: appointment?.scheduledAt ?? "",
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        }),
      });
      setPushState("subscribed");
      if (fromGate) passGate();
    } catch { setPushState("idle"); if (fromGate) passGate(); }
  };

  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }
  const { data: settings } = useGetSettings(
    shopId ? { shopId } : undefined,
    { query: { queryKey: getGetSettingsQueryKey(shopId ? { shopId } : undefined) } }
  );
  const cancelMut = useCancelAppointmentByToken();
  const rescheduleMut = useRescheduleAppointmentByToken();

  const serviceDuration = appointment?.serviceDuration ?? 0;
  const availParams = {
    ...(shopId ? { shopId } : {}),
    date: reschedDate,
    serviceDuration,
  };
  const { data: availability, isFetching: loadingSlots } = useGetAvailability(
    availParams,
    {
      query: {
        queryKey: getGetAvailabilityQueryKey(availParams),
        enabled: reschedOpen && !!reschedDate && serviceDuration > 0,
      },
    },
  );

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
      time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }),
    };
  };

  if (!token) {
    return <Centered icon={<XCircle className="w-12 h-12" />} title="Link inválido" text="Token não informado." />;
  }
  if (isLoading) {
    return <Centered title="Carregando…" text="" />;
  }
  if (isError || !appointment) {
    return <Centered icon={<XCircle className="w-12 h-12" />} title="Agendamento não encontrado" text="O link pode ter expirado ou está incorreto." />;
  }

  const { date, time } = formatDateTime(appointment.scheduledAt);
  const cancelled = appointment.status === "cancelled";
  const locked = appointment.status === "in_progress" || appointment.status === "completed";

  // Show notification gate for active appointments the user hasn't interacted with yet
  const showNotifGate = !cancelled && !locked && !notifGatePassed && pushState !== "subscribed";

  if (showNotifGate) {
    const loading = pushState === "unknown";
    const denied = pushState === "denied";
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4">
        <div className="max-w-sm w-full space-y-8 text-center">
          <div className="space-y-3">
            <div
              className="mx-auto rounded-full flex items-center justify-center"
              style={{ width: 80, height: 80, backgroundColor: "hsl(38 88% 55% / 0.15)", border: `2px solid ${AMBER}` }}
            >
              <Bell className="w-9 h-9" style={{ color: AMBER }} />
            </div>
            <h1 className="text-xl font-bold">{settings?.barbershopName || "Barbearia"}</h1>
            <p className="text-sm text-muted-foreground">Seu agendamento</p>
          </div>

          <div className="space-y-2">
            <p className="text-base font-semibold">Ativar lembrete do agendamento</p>
            <p className="text-sm text-muted-foreground">
              Receba uma notificação 15 minutos antes do seu corte para não perder o horário.
            </p>
          </div>

          {denied ? (
            <div className="space-y-4">
              <div
                className="rounded-xl py-3 px-4 flex items-center justify-center gap-2 text-sm"
                style={{ backgroundColor: "hsl(0 0% 14%)", border: "1px solid hsl(0 0% 22%)", color: "hsl(0 0% 55%)" }}
              >
                <BellOff className="w-4 h-4 flex-shrink-0" />
                Notificações bloqueadas neste dispositivo.
              </div>
              <button
                type="button"
                onClick={passGate}
                className="w-full rounded-xl py-3 text-sm font-semibold"
                style={{ backgroundColor: "hsl(0 0% 16%)", border: "1px solid hsl(0 0% 24%)", color: "hsl(0 0% 70%)", cursor: "pointer" }}
              >
                Continuar mesmo assim
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleEnableNotifications(true)}
                className="w-full rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
                style={{
                  backgroundColor: loading ? "hsl(38 88% 55% / 0.08)" : "hsl(38 88% 55% / 0.15)",
                  border: `1px solid ${loading ? "hsl(38 88% 55% / 0.3)" : "hsl(38 88% 55% / 0.6)"}`,
                  color: loading ? "hsl(38 88% 55% / 0.5)" : AMBER,
                  cursor: loading ? "default" : "pointer",
                }}
              >
                <Bell className="w-4 h-4" />
                {loading ? "Aguardando…" : "Ativar lembrete 15 min antes"}
              </button>
              <button
                type="button"
                onClick={passGate}
                className="w-full text-xs py-2"
                style={{ color: "hsl(0 0% 45%)", background: "none", border: "none", cursor: "pointer" }}
              >
                Agora não
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const openReschedule = () => {
    setErrorMsg(null);
    // Default the picker to the appointment's current date so the user sees
    // the day's slots straight away.
    const cur = appointment ? new Date(appointment.scheduledAt) : new Date();
    const y = cur.getFullYear();
    const m = (cur.getMonth() + 1).toString().padStart(2, "0");
    const d = cur.getDate().toString().padStart(2, "0");
    setReschedDate(`${y}-${m}-${d}`);
    setReschedTime("");
    setReschedOpen(true);
  };

  const handleReschedule = () => {
    if (!reschedDate || !reschedTime) return;
    setErrorMsg(null);
    // Fixed -03:00 (Brazil) — matches server's TZ assumption.
    const scheduledAt = new Date(`${reschedDate}T${reschedTime}:00-03:00`).toISOString();
    // Remember old date to invalidate its availability cache
    const oldDate = appointment ? new Date(appointment.scheduledAt).toISOString().split("T")[0] : "";
    rescheduleMut.mutate(
      { token, data: { scheduledAt } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAppointmentByTokenQueryKey(token) });
          // Invalidate new date and old date so the old slot frees up immediately
          queryClient.invalidateQueries({ queryKey: getGetAvailabilityQueryKey({ date: reschedDate, serviceDuration }) });
          if (oldDate && oldDate !== reschedDate) {
            queryClient.invalidateQueries({ queryKey: getGetAvailabilityQueryKey({ date: oldDate, serviceDuration }) });
          }
          queryClient.invalidateQueries({ queryKey: ["/api/availability"], exact: false });
          setReschedOpen(false);
          playRescheduled();
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } } | null)?.data;
          setErrorMsg(data?.error ?? "Não foi possível alterar o horário. Tente outro.");
          // If the slot was taken, clear it so the user picks again.
          setReschedTime("");
          queryClient.invalidateQueries({ queryKey: getGetAvailabilityQueryKey({ date: reschedDate, serviceDuration }) });
        },
      },
    );
  };

  const handleCancel = () => {
    setErrorMsg(null);
    cancelMut.mutate(
      { token },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAppointmentByTokenQueryKey(token) });
          localStorage.removeItem(`barber_pending_token_${shopId ?? "admin"}`);
          setConfirming(false);
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } } | null)?.data;
          setErrorMsg(data?.error ?? "Não foi possível cancelar. Tente novamente.");
          setConfirming(false);
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4 flex flex-col items-center">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-3">
          <div
            className="mx-auto rounded-full flex items-center justify-center"
            style={{ width: 72, height: 72, backgroundColor: AMBER_SOFT, border: `2px solid ${AMBER}` }}
          >
            <Scissors className="w-8 h-8" style={{ color: AMBER }} />
          </div>
          <h1 className="text-2xl font-bold">{settings?.barbershopName || "Barbearia"}</h1>
          <p className="text-sm text-muted-foreground">Seu agendamento</p>
        </div>

        {reminderBanner && !cancelled && !locked && (
          <div
            className="rounded-xl p-4 flex items-start gap-3"
            style={{ backgroundColor: "hsl(38 88% 55% / 0.12)", border: "1px solid hsl(38 88% 55% / 0.5)" }}
          >
            <Bell className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: AMBER }} />
            <div className="space-y-1">
              <p className="text-sm font-semibold" style={{ color: AMBER }}>Seu horário está chegando!</p>
              <p className="text-xs text-muted-foreground">Faltam 15 minutos ou menos para o seu agendamento.</p>
            </div>
          </div>
        )}

        {isNew && !cancelled && !locked && (
          <>
            <div
              className="rounded-xl p-4 flex items-start gap-3"
              data-testid="banner-new-booking"
              style={{ backgroundColor: "hsl(142 70% 45% / 0.12)", border: "1px solid hsl(142 70% 45% / 0.4)" }}
            >
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "hsl(142 70% 55%)" }} />
              <div className="space-y-1">
                <p className="text-sm font-semibold" style={{ color: "hsl(142 70% 75%)" }}>
                  Agendamento confirmado!
                </p>
                <p className="text-xs text-muted-foreground">
                  Salve esta página nos favoritos para mudar o horário ou cancelar depois.
                </p>
              </div>
            </div>
            {pushState === "subscribed" && (
              <div className="rounded-xl py-3 px-4 flex items-center justify-center gap-2 text-sm" style={{ backgroundColor: "hsl(38 88% 55% / 0.08)", border: "1px solid hsl(38 88% 55% / 0.3)", color: "hsl(38 88% 65%)" }}>
                <Bell className="w-4 h-4" />
                Lembrete ativado — você receberá uma notificação 15 min antes.
              </div>
            )}
          </>
        )}

        <div className="bg-card border border-border p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
            <span
              className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full"
              style={{
                backgroundColor: cancelled ? "hsl(0 62% 50% / 0.15)" : locked ? "hsl(0 0% 50% / 0.15)" : "hsl(142 70% 45% / 0.15)",
                color: cancelled ? "hsl(0 70% 65%)" : locked ? "hsl(0 0% 70%)" : "hsl(142 70% 55%)",
              }}
              data-testid="text-status"
            >
              {STATUS_LABEL[appointment.status] ?? appointment.status}
            </span>
          </div>

          <div className="space-y-3 pt-2">
            <Row icon={<User className="w-4 h-4" />} label="Cliente" value={appointment.clientName} />
            <Row icon={<Scissors className="w-4 h-4" />} label="Serviço" value={`${appointment.serviceName} · ${appointment.serviceDuration} min`} />
            <Row icon={<CalendarIcon className="w-4 h-4" />} label="Data" value={date} />
            <Row icon={<Clock className="w-4 h-4" />} label="Horário" value={time} />
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl p-4 flex items-start gap-3" style={{ backgroundColor: "hsl(0 62% 50% / 0.12)", border: "1px solid hsl(0 62% 50% / 0.4)" }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "hsl(0 70% 65%)" }} />
            <p className="text-sm" style={{ color: "hsl(0 70% 75%)" }}>{errorMsg}</p>
          </div>
        )}

        {cancelled ? (
          <div className="rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: "hsl(0 0% 14%)", border: "1px solid hsl(0 0% 20%)" }}>
            <CheckCircle2 className="w-5 h-5" style={{ color: "hsl(0 70% 65%)" }} />
            <p className="text-sm text-muted-foreground">Este agendamento foi cancelado.</p>
          </div>
        ) : locked ? (
          <p className="text-sm text-center text-muted-foreground">
            Este agendamento já está em andamento ou foi concluído e não pode ser cancelado pelo link.
          </p>
        ) : confirming ? (
          <div className="space-y-3">
            <p className="text-sm text-center text-muted-foreground">Tem certeza? Esta ação não pode ser desfeita.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={cancelMut.isPending}>
                Voltar
              </Button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelMut.isPending}
                data-testid="button-confirm-cancel"
                className="rounded-md text-sm font-semibold"
                style={{
                  backgroundColor: "hsl(0 62% 45%)",
                  color: "white",
                  border: "none",
                  cursor: cancelMut.isPending ? "not-allowed" : "pointer",
                  opacity: cancelMut.isPending ? 0.6 : 1,
                  padding: "0.5rem 1rem",
                }}
              >
                {cancelMut.isPending ? "Cancelando…" : "Sim, cancelar"}
              </button>
            </div>
          </div>
        ) : reschedOpen ? (
          <ReschedulePanel
            date={reschedDate}
            setDate={setReschedDate}
            time={reschedTime}
            setTime={setReschedTime}
            slots={availability?.slots ?? []}
            loadingSlots={loadingSlots}
            pending={rescheduleMut.isPending}
            onCancel={() => {
              setReschedOpen(false);
              setReschedTime("");
            }}
            onConfirm={handleReschedule}
          />
        ) : (
          <div className="space-y-3">
            {/* Agendar outro corte — pede nome antes de abrir */}
            {!childModal ? (
              <button
                type="button"
                onClick={() => { setChildName(""); setChildLastName(""); setChildModal(true); }}
                className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2"
                style={{
                  backgroundColor: "hsl(142 70% 45% / 0.12)",
                  border: "1px solid hsl(142 70% 45% / 0.4)",
                  color: "hsl(142 70% 55%)",
                  cursor: "pointer",
                }}
              >
                <Plus className="w-4 h-4" />
                Agendar outro corte
              </button>
            ) : (
              <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "hsl(0 0% 10%)", border: "1px solid hsl(142 70% 45% / 0.3)" }}>
                <p className="text-sm font-semibold" style={{ color: "hsl(142 70% 55%)" }}>Nome de quem vai cortar</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={childName}
                    onChange={e => setChildName(e.target.value)}
                    placeholder="Nome"
                    autoFocus
                    className="w-full rounded-xl px-3 text-sm outline-none"
                    style={{ backgroundColor: "hsl(0 0% 14%)", border: "1px solid hsl(0 0% 22%)", color: "#fff", height: 44 }}
                  />
                  <input
                    type="text"
                    value={childLastName}
                    onChange={e => setChildLastName(e.target.value)}
                    placeholder="Sobrenome"
                    className="w-full rounded-xl px-3 text-sm outline-none"
                    style={{ backgroundColor: "hsl(0 0% 14%)", border: "1px solid hsl(0 0% 22%)", color: "#fff", height: 44 }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChildModal(false)}
                    className="rounded-xl py-2.5 text-sm font-semibold"
                    style={{ backgroundColor: "hsl(0 0% 14%)", border: "1px solid hsl(0 0% 22%)", color: "hsl(0 0% 65%)", cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!childName.trim() || !childLastName.trim()}
                    onClick={() => {
                      if (!shopId) return;
                      const url = `${window.location.origin}/booking?shopId=${shopId}&novo=1&cn=${encodeURIComponent(childName.trim())}&cls=${encodeURIComponent(childLastName.trim())}`;
                      window.open(url, "_blank");
                      setChildModal(false);
                    }}
                    className="rounded-xl py-2.5 text-sm font-semibold"
                    style={{
                      backgroundColor: childName.trim() && childLastName.trim() ? "hsl(142 60% 40%)" : "hsl(142 60% 40% / 0.4)",
                      border: "none",
                      color: "#fff",
                      cursor: childName.trim() && childLastName.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    Agendar
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={openReschedule}
                data-testid="button-reschedule"
                className="rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2"
                style={{
                  backgroundColor: "hsl(0 0% 9%)",
                  border: `1px solid ${AMBER}`,
                  color: AMBER,
                  cursor: "pointer",
                }}
              >
                <CalendarClock className="w-4 h-4" />
                Mudar horário
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                data-testid="button-cancel"
                className="rounded-xl py-3 text-sm font-semibold"
                style={{
                  backgroundColor: "hsl(0 0% 9%)",
                  border: "1px solid hsl(0 62% 50% / 0.4)",
                  color: "hsl(0 70% 65%)",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReschedulePanel({
  date,
  setDate,
  time,
  setTime,
  slots,
  loadingSlots,
  pending,
  onCancel,
  onConfirm,
}: {
  date: string;
  setDate: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  slots: Array<{ time: string; available: boolean }>;
  loadingSlots: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Build a 14-day picker starting today (Brazil local).
  const today = new Date();
  const days: Array<{ key: string; weekday: string; dayNum: string }> = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    days.push({
      key: `${y}-${m}-${dd}`,
      weekday: ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][d.getDay()],
      dayNum: dd,
    });
  }

  return (
    <div className="space-y-4 bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-4 h-4" style={{ color: AMBER }} />
        <h2 className="text-sm font-bold uppercase tracking-wider">Escolha um novo horário</h2>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Dia</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="reschedule-days">
          {days.map((d) => {
            const active = d.key === date;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  setDate(d.key);
                  setTime("");
                }}
                data-testid={`day-${d.key}`}
                className="flex flex-col items-center rounded-lg flex-shrink-0"
                style={{
                  width: 48,
                  padding: "0.4rem 0",
                  backgroundColor: active ? AMBER : "hsl(0 0% 12%)",
                  color: active ? "hsl(0 0% 0%)" : "hsl(0 0% 70%)",
                  border: `1px solid ${active ? AMBER : "hsl(0 0% 18%)"}`,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.7rem",
                }}
              >
                <span style={{ opacity: 0.8 }}>{d.weekday}</span>
                <span style={{ fontSize: "1rem", fontWeight: 700 }}>{d.dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Horário</p>
        {loadingSlots ? (
          <p className="text-sm text-muted-foreground">Carregando horários…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem horários neste dia.</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5" data-testid="reschedule-slots">
            {slots.map((s) => {
              const active = s.time === time;
              return (
                <button
                  key={s.time}
                  type="button"
                  disabled={!s.available}
                  onClick={() => setTime(s.time)}
                  data-testid={`slot-${s.time}`}
                  className="rounded-md text-xs font-semibold py-2"
                  style={{
                    backgroundColor: active ? AMBER : s.available ? "hsl(0 0% 12%)" : "hsl(0 0% 8%)",
                    color: active ? "hsl(0 0% 0%)" : s.available ? "hsl(0 0% 80%)" : "hsl(0 0% 30%)",
                    border: `1px solid ${active ? AMBER : "hsl(0 0% 16%)"}`,
                    cursor: s.available ? "pointer" : "not-allowed",
                    textDecoration: s.available ? "none" : "line-through",
                  }}
                >
                  {s.time}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Voltar
        </Button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!time || pending}
          data-testid="button-confirm-reschedule"
          className="rounded-md text-sm font-semibold"
          style={{
            backgroundColor: !time || pending ? "hsl(38 30% 30%)" : AMBER,
            color: "hsl(0 0% 0%)",
            border: "none",
            cursor: !time || pending ? "not-allowed" : "pointer",
            padding: "0.5rem 1rem",
          }}
        >
          {pending ? "Salvando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function Centered({ icon, title, text }: { icon?: React.ReactNode; title: string; text: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
      {icon && <div className="text-muted-foreground mb-4">{icon}</div>}
      <h1 className="text-xl font-semibold mb-2">{title}</h1>
      {text && <p className="text-sm text-muted-foreground max-w-sm">{text}</p>}
    </div>
  );
}
