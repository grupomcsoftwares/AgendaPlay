import React, { useState, useEffect, useRef } from "react";
import { playServiceStart, playServiceEnd, playAlert15 } from "@/lib/sounds";
import {
  useListQueue,
  useAddToQueue,
  useRemoveFromQueue,
  useStartQueueEntry,
  getListQueueQueryKey,
  useListServices,
  getListServicesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Scissors, Clock, Plus, Play, Trash2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ color: "hsl(var(--sidebar-primary))", fontFamily: "monospace", fontSize: "1.25em", fontWeight: 700, letterSpacing: "0.1em" }}>
      {time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

function ServiceProgress({ startedAt, durationMinutes }: { startedAt: string; durationMinutes: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startMs = new Date(startedAt).getTime();
  const totalMs = durationMinutes * 60_000;
  const elapsedMs = Math.max(0, now - startMs);
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const pct = Math.min(100, (elapsedMs / totalMs) * 100);
  const overdue = elapsedMs > totalMs;

  const mins = Math.floor(remainingMs / 60_000);
  const secs = Math.floor((remainingMs % 60_000) / 1000);
  const label = overdue
    ? `+${Math.floor(elapsedMs / 60_000) - durationMinutes} min em atraso`
    : `${mins}:${secs.toString().padStart(2, "0")} restantes`;

  const accent = overdue ? "hsl(0 72% 55%)" : "hsl(var(--sidebar-primary))";

  return (
    <div style={{ width: "100%", maxWidth: "36em" }} data-testid="service-progress">
      <div className="flex items-center justify-between" style={{ fontSize: "0.9em", marginBottom: "0.5em" }}>
        <span style={{ color: "hsl(0 0% 55%)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {overdue ? "Tempo excedido" : "Em andamento"}
        </span>
        <span
          data-testid="text-remaining-time"
          style={{ color: accent, fontFamily: "monospace", fontWeight: 700, fontSize: "1.15em", letterSpacing: "0.05em" }}
        >
          {label}
        </span>
      </div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: "0.6em", backgroundColor: "hsl(0 0% 14%)" }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: accent,
            transition: "width 0.8s linear",
            boxShadow: overdue ? "none" : `0 0 0.8em ${accent}`,
          }}
        />
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: "0.4em", fontSize: "0.75em", color: "hsl(0 0% 40%)" }}>
        <span>
          {Math.floor(elapsedMs / 60_000)}:{Math.floor((elapsedMs % 60_000) / 1000).toString().padStart(2, "0")} decorridos
        </span>
        <span>{durationMinutes} min</span>
      </div>
    </div>
  );
}

const WEEKDAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(d: Date): { label: string; isToday: boolean } {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (isSameDay(d, today)) return { label: "HOJE", isToday: true };
  if (isSameDay(d, tomorrow)) return { label: "AMANHÃ", isToday: false };
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  return { label: `${WEEKDAYS_SHORT[d.getDay()]} ${dd}/${mm}`, isToday: false };
}

function DigitalTime({ scheduledAt }: { scheduledAt: string }) {
  const d = new Date(scheduledAt);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const { label, isToday } = dayLabel(d);
  return (
    <div
      className="flex flex-col items-center"
      style={{
        backgroundColor: "hsl(0 0% 12%)",
        borderRadius: "0.4em",
        padding: "0.3em 0.8em 0.4em",
        flexShrink: 0,
      }}
    >
      <span
        data-testid="text-scheduled-day"
        style={{
          fontFamily: "monospace",
          fontSize: "0.54em",
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: isToday ? "hsl(var(--sidebar-primary))" : "hsl(0 0% 55%)",
          marginBottom: "0.15em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: "1.5em",
          fontWeight: 700,
          letterSpacing: "0.15em",
          color: "hsl(var(--foreground))",
          lineHeight: 1,
        }}
      >
        {hh} : {mm}
      </span>
    </div>
  );
}

export default function Queue() {
  const { data: queue, isLoading } = useListQueue({ query: { queryKey: getListQueueQueryKey() } });
  const { data: services } = useListServices(undefined, { query: { queryKey: getListServicesQueryKey() } });
  const addToQueue = useAddToQueue();
  const removeFromQueue = useRemoveFromQueue();
  const startQueueEntry = useStartQueueEntry();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({ clientName: "", serviceId: "" });

  const currentEntry = queue?.find((q) => q.status === "in_progress") ?? null;
  const waitingQueue = queue?.filter((q) => q.status === "waiting") ?? [];

  const prevEntryId = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getListQueueQueryKey() });
    }, 5000);
    return () => clearInterval(id);
  }, [queryClient]);

  // ── TV remote / D-pad navigation ──────────────────────────────────────────
  // Implements spatial navigation for TV remotes that send arrow key events.
  // Any element with data-tvfocus is part of the navigable grid.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"];
      if (!KEYS.includes(e.key)) return;

      const focusables = Array.from(
        document.querySelectorAll<HTMLElement>("[data-tvfocus]")
      ).filter((el) => !el.hasAttribute("disabled") && !el.closest("[hidden]"));

      if (focusables.length === 0) return;

      e.preventDefault();

      const active = document.activeElement as HTMLElement | null;

      // Enter — click the focused element
      if (e.key === "Enter") {
        active?.click();
        return;
      }

      // If nothing focused yet, focus the first element
      if (!active || !focusables.includes(active)) {
        focusables[0].focus();
        return;
      }

      const cur = active.getBoundingClientRect();

      let best: HTMLElement | null = null;
      let bestScore = Infinity;

      for (const el of focusables) {
        if (el === active) continue;
        const r = el.getBoundingClientRect();
        let candidate = false;
        let score = 0;

        if (e.key === "ArrowDown") {
          candidate = r.top >= cur.bottom - 4;
          score = (r.top - cur.bottom) + Math.abs((r.left + r.right) / 2 - (cur.left + cur.right) / 2) * 0.3;
        } else if (e.key === "ArrowUp") {
          candidate = r.bottom <= cur.top + 4;
          score = (cur.top - r.bottom) + Math.abs((r.left + r.right) / 2 - (cur.left + cur.right) / 2) * 0.3;
        } else if (e.key === "ArrowRight") {
          candidate = r.left >= cur.right - 4;
          score = (r.left - cur.right) + Math.abs((r.top + r.bottom) / 2 - (cur.top + cur.bottom) / 2) * 0.3;
        } else if (e.key === "ArrowLeft") {
          candidate = r.right <= cur.left + 4;
          score = (cur.left - r.right) + Math.abs((r.top + r.bottom) / 2 - (cur.top + cur.bottom) / 2) * 0.3;
        }

        if (candidate && score < bestScore) {
          bestScore = score;
          best = el;
        }
      }

      if (best) best.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  // ──────────────────────────────────────────────────────────────────────────

  // Sounds: play when service starts or ends
  useEffect(() => {
    const newId = currentEntry?.id ?? null;
    if (prevEntryId.current !== newId) {
      if (newId !== null && prevEntryId.current === null) {
        playServiceStart();
      } else if (newId === null && prevEntryId.current !== null) {
        playServiceEnd();
      }
      prevEntryId.current = newId;
    }
  }, [currentEntry?.id]);

  // Alert: play sound when next appointment is ~15 min away
  useEffect(() => {
    const id = setInterval(() => {
      const upcoming = waitingQueue.find(e => e.scheduledAt != null);
      if (!upcoming?.scheduledAt) return;
      const diff = new Date(upcoming.scheduledAt).getTime() - Date.now();
      if (diff > 14 * 60_000 && diff < 15 * 60_000) {
        playAlert15();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [waitingQueue]);
  const nextEntry = waitingQueue[0] ?? null;
  const upcomingBooked = waitingQueue.find(
    (q) => q.scheduledAt !== null && q.scheduledAt !== undefined && new Date(q.scheduledAt) > new Date(),
  ) ?? null;

  const handleAdd = () => {
    const service = services?.find((s) => s.id.toString() === formData.serviceId);
    if (!service || !formData.clientName) return;
    addToQueue.mutate(
      {
        data: {
          clientName: formData.clientName,
          serviceName: service.name,
          servicePrice: service.price,
          serviceDuration: service.durationMinutes,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQueueQueryKey() });
          setIsAddOpen(false);
          setFormData({ clientName: "", serviceId: "" });
          toast({ title: "Cliente adicionado à fila" });
        },
      }
    );
  };

  const handleStart = (id: number) => {
    startQueueEntry.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQueueQueryKey() });
          toast({ title: "Atendimento iniciado" });
        },
      }
    );
  };

  const handleRemove = (id: number) => {
    removeFromQueue.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQueueQueryKey() });
          toast({ title: "Removido da fila" });
        },
      }
    );
  };

  return (
    /* 1em = 1vw — everything inside scales with viewport width */
    <div
      className="flex flex-col"
      style={{
        fontSize: "1vw",
        height: "100dvh",
        width: "100vw",
        overflow: "hidden",
        backgroundColor: "hsl(0 0% 3%)",
        color: "hsl(var(--foreground))",
      }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between"
        style={{ height: "3em", padding: "0 1.5em", borderBottom: "1px solid hsl(0 0% 10%)", flexShrink: 0 }}
      >
        <div className="flex items-center" style={{ gap: "0.75em" }}>
          <Link href="/">
            <button
              className="flex items-center opacity-40 hover:opacity-70 transition-opacity"
              style={{ color: "hsl(var(--foreground))", background: "none", border: "none", cursor: "pointer", marginRight: "0.75em" }}
              data-testid="button-back-queue"
            >
              <ArrowLeft style={{ width: "0.9em", height: "0.9em" }} />
            </button>
          </Link>
          <Scissors style={{ width: "1em", height: "1em", color: "hsl(var(--sidebar-primary))" }} />
          <span style={{ fontWeight: 700, fontSize: "0.85em", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Fila ao Vivo
          </span>
        </div>
        <div className="flex items-center" style={{ gap: "1.2em" }}>
          <button
            onClick={() => setIsAddOpen(true)}
            data-testid="button-add-queue"
            data-tvfocus
            tabIndex={0}
            className="flex items-center transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            style={{
              gap: "0.4em",
              padding: "0.3em 0.75em",
              borderRadius: "0.3em",
              fontSize: "0.75em",
              fontWeight: 600,
              backgroundColor: "hsl(var(--sidebar-primary))",
              color: "hsl(var(--sidebar-primary-foreground))",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Plus style={{ width: "0.9em", height: "0.9em" }} />
            Adicionar
          </button>
          <LiveClock />
        </div>
      </div>

      {/* Main content */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{ gap: "0.75em", padding: "0.75em", minHeight: 0 }}
      >
        {/* Left column */}
        <div className="flex flex-col overflow-hidden" style={{ flex: "1 1 65%", gap: "0.75em", minHeight: 0 }}>

          {/* Cadeira atual */}
          <div
            className="relative flex flex-col items-center justify-center overflow-hidden"
            style={{
              flex: "1 1 0%",
              minHeight: 0,
              borderRadius: "0.6em",
              border: currentEntry
                ? "2px solid hsl(var(--sidebar-primary))"
                : "2px solid hsl(0 0% 14%)",
              backgroundColor: "hsl(0 0% 6%)",
            }}
          >
            {/* Badge */}
            <div
              className="absolute"
              style={{
                top: "0.8em",
                right: "0.8em",
                padding: "0.25em 0.6em",
                borderRadius: "0.3em",
                fontSize: "0.6em",
                fontWeight: 700,
                backgroundColor: "hsl(var(--sidebar-primary))",
                color: "hsl(var(--sidebar-primary-foreground))",
                letterSpacing: "0.08em",
              }}
            >
              ATENDENDO AGORA
            </div>

            {currentEntry ? (
              <div
                className="flex flex-col items-center justify-evenly w-full"
                style={{ gap: "0.4em", padding: "0.8em 1.5em", height: "100%", overflow: "hidden" }}
              >
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: "3em",
                    height: "3em",
                    backgroundColor: "hsl(var(--sidebar-primary) / 0.15)",
                    flexShrink: 0,
                  }}
                >
                  <Scissors style={{ width: "1.4em", height: "1.4em", color: "hsl(var(--sidebar-primary))" }} />
                </div>
                <div className="text-center" style={{ overflow: "hidden", flexShrink: 1 }}>
                  <h2
                    data-testid="text-current-name"
                    style={{
                      fontSize: "clamp(2.5rem, 8vw, 12rem)",
                      fontWeight: 900,
                      lineHeight: 0.95,
                      letterSpacing: "-0.03em",
                      textTransform: "uppercase",
                      wordBreak: "break-word",
                      overflow: "hidden",
                    }}
                  >
                    {currentEntry.clientName}
                  </h2>
                  <p style={{ color: "hsl(var(--sidebar-primary))", fontSize: "1.1em", fontWeight: 600, marginTop: "0.4em" }}>
                    {currentEntry.serviceName}
                  </p>
                </div>
                {currentEntry.startedAt && (
                  <ServiceProgress
                    startedAt={currentEntry.startedAt}
                    durationMinutes={currentEntry.serviceDuration}
                  />
                )}
                <button
                  onClick={() => handleRemove(currentEntry.id)}
                  data-testid={`button-complete-${currentEntry.id}`}
                  data-tvfocus
                  tabIndex={0}
                  className="transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                  style={{
                    padding: "0.5em 1.6em",
                    borderRadius: "0.4em",
                    fontSize: "0.9em",
                    fontWeight: 500,
                    border: "1px solid hsl(0 0% 25%)",
                    backgroundColor: "transparent",
                    color: "hsl(0 0% 70%)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Finalizar Atendimento
                </button>
              </div>
            ) : upcomingBooked && upcomingBooked.scheduledAt ? (
              <div
                className="flex flex-col items-center justify-evenly text-center"
                style={{ gap: "0.5em", padding: "0.8em 1.5em", width: "100%", height: "100%", overflow: "hidden" }}
              >
                <Clock style={{ width: "2.5em", height: "2.5em", color: "hsl(var(--sidebar-primary))", flexShrink: 0 }} />
                <span
                  data-testid="text-waiting-next"
                  style={{
                    fontSize: "clamp(2rem, 4.5vw, 6rem)",
                    fontWeight: 900,
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                    textTransform: "uppercase",
                    color: "hsl(var(--foreground))",
                    flexShrink: 1,
                  }}
                >
                  Aguardem um momento
                </span>
                <span
                  style={{
                    color: "hsl(0 0% 65%)",
                    fontSize: "clamp(0.9rem, 1.5vw, 2rem)",
                    fontWeight: 500,
                    lineHeight: 1.3,
                    flexShrink: 1,
                  }}
                >
                  O próximo atendimento começa às
                </span>
                <span
                  data-testid="text-waiting-next-time"
                  style={{
                    color: "hsl(var(--sidebar-primary))",
                    fontSize: "clamp(3rem, 8vw, 12rem)",
                    fontWeight: 900,
                    letterSpacing: "0.04em",
                    fontFamily: "monospace",
                    lineHeight: 1,
                    flexShrink: 1,
                  }}
                >
                  {new Date(upcomingBooked.scheduledAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center" style={{ gap: "0.6em", color: "hsl(0 0% 30%)" }}>
                <Scissors style={{ width: "2em", height: "2em" }} />
                <span style={{ fontSize: "1em", fontWeight: 600 }}>Cadeira Disponível</span>
              </div>
            )}
          </div>

          {/* Próximo */}
          <div
            className="relative"
            style={{
              borderRadius: "0.6em",
              padding: "0.75em 1em",
              backgroundColor: "hsl(0 0% 6%)",
              border: "1px solid hsl(0 0% 12%)",
              flexShrink: 0,
            }}
          >
            <div
              className="absolute"
              style={{
                top: "0.6em",
                left: "1em",
                padding: "0.15em 0.5em",
                borderRadius: "0.2em",
                fontSize: "0.55em",
                fontWeight: 600,
                backgroundColor: "hsl(0 0% 16%)",
                color: "hsl(0 0% 60%)",
                letterSpacing: "0.05em",
              }}
            >
              PRÓXIMO
            </div>

            {nextEntry ? (
              <div className="flex items-center justify-between" style={{ marginTop: "1.2em" }}>
                <div>
                  <h3 style={{ fontSize: "1.5em", fontWeight: 800, lineHeight: 1.1 }}>{nextEntry.clientName}</h3>
                  <p style={{ color: "hsl(0 0% 45%)", fontSize: "0.7em", marginTop: "0.3em" }}>
                    {nextEntry.serviceName} · {nextEntry.serviceDuration} min
                  </p>
                </div>
                <div className="flex items-center" style={{ gap: "0.6em" }}>
                  {nextEntry.scheduledAt && <DigitalTime scheduledAt={nextEntry.scheduledAt} />}
                  {!currentEntry && (
                    <button
                      onClick={() => handleStart(nextEntry.id)}
                      data-testid={`button-start-${nextEntry.id}`}
                      data-tvfocus
                      tabIndex={0}
                      className="flex items-center transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                      style={{
                        gap: "0.4em",
                        padding: "0.4em 0.9em",
                        borderRadius: "0.3em",
                        fontWeight: 600,
                        fontSize: "0.75em",
                        backgroundColor: "hsl(var(--sidebar-primary))",
                        color: "hsl(var(--sidebar-primary-foreground))",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      <Play style={{ width: "0.9em", height: "0.9em" }} />
                      Iniciar Agora
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center" style={{ marginTop: "1.2em", color: "hsl(0 0% 30%)", fontSize: "0.83em" }}>
                Nenhum cliente aguardando
              </div>
            )}
          </div>
        </div>

        {/* Right column — Próximos da Fila */}
        <div
          className="flex flex-col overflow-hidden"
          style={{
            flex: "0 0 32%",
            minHeight: 0,
            borderRadius: "0.6em",
            backgroundColor: "hsl(0 0% 6%)",
            border: "1px solid hsl(0 0% 12%)",
          }}
        >
          <div
            className="flex items-center"
            style={{
              gap: "0.4em",
              padding: "0.6em 1em",
              borderBottom: "1px solid hsl(0 0% 10%)",
              flexShrink: 0,
            }}
          >
            <Clock style={{ width: "0.8em", height: "0.8em", color: "hsl(var(--sidebar-primary))" }} />
            <span style={{ fontWeight: 700, fontSize: "0.67em", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Próximos da Fila
            </span>
            {waitingQueue.length > 0 && (
              <span
                className="ml-auto"
                style={{
                  fontSize: "0.6em",
                  padding: "0.1em 0.5em",
                  borderRadius: "9999px",
                  backgroundColor: "hsl(var(--sidebar-primary) / 0.15)",
                  color: "hsl(var(--sidebar-primary))",
                  fontWeight: 600,
                }}
              >
                {waitingQueue.length}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div style={{ padding: "0.6em", display: "flex", flexDirection: "column", gap: "0.5em" }}>
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse" style={{ height: "2.5em", borderRadius: "0.4em", backgroundColor: "hsl(0 0% 10%)" }} />
                ))}
              </div>
            ) : waitingQueue.length === 0 ? (
              <div
                className="flex items-center justify-center h-full"
                style={{ color: "hsl(0 0% 30%)", fontSize: "0.73em" }}
              >
                Nenhum cliente na fila
              </div>
            ) : (
              <div style={{ padding: "0.5em", display: "flex", flexDirection: "column", gap: "0.35em" }}>
                {waitingQueue.map((entry, idx) => (
                  <div
                    key={entry.id}
                    data-testid={`queue-item-${entry.id}`}
                    className="flex items-center justify-between group"
                    style={{
                      padding: "0.5em 0.75em",
                      borderRadius: "0.4em",
                      backgroundColor: "hsl(0 0% 9%)",
                      border: "1px solid hsl(0 0% 13%)",
                    }}
                  >
                    <div className="flex items-center" style={{ gap: "0.5em" }}>
                      <span
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: "1.3em",
                          height: "1.3em",
                          fontSize: "0.83em",
                          backgroundColor: "hsl(0 0% 14%)",
                          color: "hsl(0 0% 50%)",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: "0.73em" }}>{entry.clientName}</p>
                        <p style={{ color: "hsl(0 0% 40%)", fontSize: "0.62em" }}>{entry.serviceName}</p>
                      </div>
                    </div>
                    <div className="flex items-center" style={{ gap: "0.3em" }}>
                      {entry.scheduledAt && (() => {
                        const sd = new Date(entry.scheduledAt);
                        const { label, isToday } = dayLabel(sd);
                        const time = sd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                        const accent = isToday ? "hsl(var(--sidebar-primary))" : "hsl(0 0% 65%)";
                        const bg = isToday ? "hsl(var(--sidebar-primary) / 0.1)" : "hsl(0 0% 14%)";
                        return (
                          <span
                            data-testid={`queue-time-${entry.id}`}
                            className="flex flex-col items-end"
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 700,
                              letterSpacing: "0.05em",
                              backgroundColor: bg,
                              padding: "0.2em 0.4em",
                              borderRadius: "0.25em",
                              lineHeight: 1.2,
                            }}
                          >
                            <span style={{ fontSize: "0.5em", color: accent, letterSpacing: "0.08em" }}>{label}</span>
                            <span style={{ fontSize: "0.7em", color: accent }}>{time}</span>
                          </span>
                        );
                      })()}
                      <div className="flex items-center transition-opacity" style={{ gap: "0.15em", opacity: 0.35 }}
                        onFocus={(e) => (e.currentTarget.style.opacity = "1")}
                        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.style.opacity = "0.35"; }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.35")}
                      >
                        <button
                          onClick={() => handleStart(entry.id)}
                          data-testid={`button-start-list-${entry.id}`}
                          data-tvfocus
                          tabIndex={0}
                          className="hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400"
                          style={{
                            padding: "0.3em",
                            borderRadius: "0.2em",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "hsl(var(--sidebar-primary))",
                          }}
                          title="Iniciar"
                        >
                          <Play style={{ width: "0.75em", height: "0.75em" }} />
                        </button>
                        <button
                          onClick={() => handleRemove(entry.id)}
                          data-testid={`button-remove-list-${entry.id}`}
                          data-tvfocus
                          tabIndex={0}
                          className="hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-400"
                          style={{
                            padding: "0.3em",
                            borderRadius: "0.2em",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "hsl(0 62% 50%)",
                          }}
                          title="Remover"
                        >
                          <Trash2 style={{ width: "0.75em", height: "0.75em" }} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add to queue dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar à Fila</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do Cliente</Label>
              <Input
                data-testid="input-queue-client-name"
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-2">
              <Label>Serviço</Label>
              <Select value={formData.serviceId} onValueChange={(v) => setFormData({ ...formData, serviceId: v })}>
                <SelectTrigger data-testid="select-queue-service">
                  <SelectValue placeholder="Selecione um serviço" />
                </SelectTrigger>
                <SelectContent>
                  {services?.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name} — {s.durationMinutes} min · R$ {s.price.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              data-testid="button-confirm-add-queue"
              onClick={handleAdd}
              disabled={!formData.clientName || !formData.serviceId || addToQueue.isPending}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
