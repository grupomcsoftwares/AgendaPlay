import { useState } from "react";
import { useRoute } from "wouter";
import { useGetAppointmentByToken, useCancelAppointmentByToken, getGetAppointmentByTokenQueryKey, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Clock, User, Scissors, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const token = params?.token ?? "";
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const { data: appointment, isLoading, isError } = useGetAppointmentByToken(token, {
    query: { queryKey: getGetAppointmentByTokenQueryKey(token), enabled: !!token },
  });
  const cancelMut = useCancelAppointmentByToken();

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

  const handleCancel = () => {
    setErrorMsg(null);
    cancelMut.mutate(
      { token },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAppointmentByTokenQueryKey(token) });
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
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            data-testid="button-cancel"
            className="w-full rounded-xl py-3 text-sm font-semibold"
            style={{
              backgroundColor: "hsl(0 0% 9%)",
              border: "1px solid hsl(0 62% 50% / 0.4)",
              color: "hsl(0 70% 65%)",
              cursor: "pointer",
            }}
          >
            Cancelar agendamento
          </button>
        )}
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
