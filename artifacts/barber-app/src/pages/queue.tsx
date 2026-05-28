import React, { useState, useEffect } from "react";
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
    <span style={{ color: "hsl(var(--sidebar-primary))", fontFamily: "monospace", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.1em" }}>
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
    <div className="w-full max-w-md" data-testid="service-progress">
      <div className="flex items-center justify-between mb-2" style={{ fontSize: "0.8rem" }}>
        <span style={{ color: "hsl(0 0% 55%)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {overdue ? "Tempo excedido" : "Em andamento"}
        </span>
        <span
          data-testid="text-remaining-time"
          style={{ color: accent, fontFamily: "monospace", fontWeight: 700, fontSize: "0.95rem", letterSpacing: "0.05em" }}
        >
          {label}
        </span>
      </div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: 8, backgroundColor: "hsl(0 0% 14%)" }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: accent,
            transition: "width 0.8s linear",
            boxShadow: overdue ? "none" : `0 0 12px ${accent}`,
          }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5" style={{ fontSize: "0.7rem", color: "hsl(0 0% 40%)" }}>
        <span>
          {Math.floor(elapsedMs / 60_000)}:{Math.floor((elapsedMs % 60_000) / 1000).toString().padStart(2, "0")} decorridos
        </span>
        <span>{durationMinutes} min</span>
      </div>
    </div>
  );
}

function DigitalTime({ scheduledAt }: { scheduledAt: string }) {
  const d = new Date(scheduledAt);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return (
    <div
      style={{
        backgroundColor: "hsl(0 0% 12%)",
        borderRadius: "0.5rem",
        padding: "0.5rem 1.25rem",
        fontFamily: "monospace",
        fontSize: "2rem",
        fontWeight: 700,
        letterSpacing: "0.15em",
        color: "hsl(var(--foreground))",
        flexShrink: 0,
      }}
    >
      {hh} : {mm}
    </div>
  );
}

export default function Queue() {
  const { data: queue, isLoading } = useListQueue({ query: { queryKey: getListQueueQueryKey() } });
  const { data: services } = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  const addToQueue = useAddToQueue();
  const removeFromQueue = useRemoveFromQueue();
  const startQueueEntry = useStartQueueEntry();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({ clientName: "", serviceId: "" });

  // Refresh queue every 10s for live feel
  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getListQueueQueryKey() });
    }, 10000);
    return () => clearInterval(id);
  }, [queryClient]);

  const currentEntry = queue?.find((q) => q.status === "in_progress") ?? null;
  const waitingQueue = queue?.filter((q) => q.status === "waiting") ?? [];
  const nextEntry = waitingQueue[0] ?? null;

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
    <div
      className="flex flex-col"
      style={{ height: "100vh", backgroundColor: "hsl(0 0% 3%)", color: "hsl(var(--foreground))" }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6"
        style={{ height: 56, borderBottom: "1px solid hsl(0 0% 10%)", flexShrink: 0 }}
      >
        <div className="flex items-center gap-3">
          <Link href="/">
            <button
              className="flex items-center gap-1 mr-3 opacity-40 hover:opacity-70 transition-opacity"
              style={{ color: "hsl(var(--foreground))", background: "none", border: "none", cursor: "pointer" }}
              data-testid="button-back-queue"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <Scissors className="h-5 w-5" style={{ color: "hsl(var(--sidebar-primary))" }} />
          <span style={{ fontWeight: 700, fontSize: "1rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Fila ao Vivo
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsAddOpen(true)}
            data-testid="button-add-queue"
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "hsl(var(--sidebar-primary))",
              color: "hsl(var(--sidebar-primary-foreground))",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
          <LiveClock />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 gap-3 p-4 overflow-hidden">
        {/* Left column */}
        <div className="flex flex-col gap-3" style={{ flex: "1 1 65%" }}>
          {/* Cadeira atual */}
          <div
            className="relative flex flex-col items-center justify-center rounded-xl"
            style={{
              flex: "1 1 60%",
              border: currentEntry
                ? "2px solid hsl(var(--sidebar-primary))"
                : "2px solid hsl(0 0% 14%)",
              backgroundColor: "hsl(0 0% 6%)",
            }}
          >
            {/* Badge */}
            <div
              className="absolute top-4 right-4 px-3 py-1 rounded-md text-xs font-bold"
              style={{
                backgroundColor: "hsl(var(--sidebar-primary))",
                color: "hsl(var(--sidebar-primary-foreground))",
                letterSpacing: "0.08em",
              }}
            >
              ATENDENDO AGORA
            </div>

            {currentEntry ? (
              <div className="flex flex-col items-center gap-4 p-8 w-full">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 72,
                    height: 72,
                    backgroundColor: "hsl(var(--sidebar-primary) / 0.15)",
                  }}
                >
                  <Scissors className="h-8 w-8" style={{ color: "hsl(var(--sidebar-primary))" }} />
                </div>
                <div className="text-center">
                  <h2 style={{ fontSize: "2.5rem", fontWeight: 800, lineHeight: 1.1 }}>{currentEntry.clientName}</h2>
                  <p className="mt-2" style={{ color: "hsl(var(--sidebar-primary))", fontSize: "1.125rem", fontWeight: 500 }}>
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
                  className="mt-2 px-5 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    border: "1px solid hsl(0 0% 25%)",
                    backgroundColor: "transparent",
                    color: "hsl(0 0% 70%)",
                    cursor: "pointer",
                  }}
                >
                  Finalizar Atendimento
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3" style={{ color: "hsl(0 0% 30%)" }}>
                <Scissors className="h-10 w-10" />
                <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>Cadeira Disponível</span>
              </div>
            )}
          </div>

          {/* Próximo */}
          <div
            className="relative rounded-xl p-5"
            style={{ backgroundColor: "hsl(0 0% 6%)", border: "1px solid hsl(0 0% 12%)", flexShrink: 0 }}
          >
            <div
              className="absolute top-4 left-5 px-2.5 py-0.5 rounded text-xs font-semibold"
              style={{
                backgroundColor: "hsl(0 0% 16%)",
                color: "hsl(0 0% 60%)",
                letterSpacing: "0.05em",
              }}
            >
              PRÓXIMO
            </div>

            {nextEntry ? (
              <div className="flex items-center justify-between mt-6">
                <div>
                  <h3 style={{ fontSize: "2rem", fontWeight: 800, lineHeight: 1.1 }}>{nextEntry.clientName}</h3>
                  <p style={{ color: "hsl(0 0% 45%)", fontSize: "0.9rem", marginTop: 4 }}>
                    {nextEntry.serviceName} · {nextEntry.serviceDuration} min
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {nextEntry.createdAt && <DigitalTime scheduledAt={nextEntry.createdAt} />}
                  {!currentEntry && (
                    <button
                      onClick={() => handleStart(nextEntry.id)}
                      data-testid={`button-start-${nextEntry.id}`}
                      className="flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: "hsl(var(--sidebar-primary))",
                        color: "hsl(var(--sidebar-primary-foreground))",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                      }}
                    >
                      <Play className="h-4 w-4" />
                      Iniciar Agora
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-6 flex items-center" style={{ color: "hsl(0 0% 30%)", fontSize: "1rem" }}>
                Nenhum cliente aguardando
              </div>
            )}
          </div>
        </div>

        {/* Right column — Fila de hoje */}
        <div
          className="flex flex-col rounded-xl overflow-hidden"
          style={{ flex: "0 0 32%", backgroundColor: "hsl(0 0% 6%)", border: "1px solid hsl(0 0% 12%)" }}
        >
          <div
            className="flex items-center gap-2 px-5 py-4"
            style={{ borderBottom: "1px solid hsl(0 0% 10%)", flexShrink: 0 }}
          >
            <Clock className="h-4 w-4" style={{ color: "hsl(var(--sidebar-primary))" }} />
            <span style={{ fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Fila de Hoje
            </span>
            {waitingQueue.length > 0 && (
              <span
                className="ml-auto text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "hsl(var(--sidebar-primary) / 0.15)", color: "hsl(var(--sidebar-primary))", fontWeight: 600 }}
              >
                {waitingQueue.length}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-5 space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-lg animate-pulse" style={{ backgroundColor: "hsl(0 0% 10%)" }} />
                ))}
              </div>
            ) : waitingQueue.length === 0 ? (
              <div
                className="flex items-center justify-center h-full"
                style={{ color: "hsl(0 0% 30%)", fontSize: "0.875rem" }}
              >
                Nenhum agendamento restante hoje
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {waitingQueue.map((entry, idx) => (
                  <div
                    key={entry.id}
                    data-testid={`queue-item-${entry.id}`}
                    className="flex items-center justify-between px-4 py-3 rounded-lg group"
                    style={{ backgroundColor: "hsl(0 0% 9%)", border: "1px solid hsl(0 0% 13%)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex items-center justify-center rounded-full text-xs font-bold"
                        style={{
                          width: 26,
                          height: 26,
                          backgroundColor: "hsl(0 0% 14%)",
                          color: "hsl(0 0% 50%)",
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: "0.875rem" }}>{entry.clientName}</p>
                        <p style={{ color: "hsl(0 0% 40%)", fontSize: "0.75rem" }}>{entry.serviceName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStart(entry.id)}
                        data-testid={`button-start-list-${entry.id}`}
                        className="p-1.5 rounded hover:opacity-80"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(var(--sidebar-primary))" }}
                        title="Iniciar"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemove(entry.id)}
                        data-testid={`button-remove-list-${entry.id}`}
                        className="p-1.5 rounded hover:opacity-80"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(0 62% 50%)" }}
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
