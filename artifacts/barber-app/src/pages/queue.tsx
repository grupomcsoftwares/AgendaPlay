import React, { useState } from "react";
import { useListQueue, useAddToQueue, useRemoveFromQueue, useStartQueueEntry, getListQueueQueryKey, useListServices, getListServicesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Trash2, ListOrdered, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function Queue() {
  const { data: queue, isLoading: isLoadingQueue } = useListQueue({ query: { queryKey: getListQueueQueryKey() } });
  const { data: services } = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  
  const addToQueue = useAddToQueue();
  const removeFromQueue = useRemoveFromQueue();
  const startQueueEntry = useStartQueueEntry();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    clientName: "",
    serviceId: "",
  });

  const handleAdd = () => {
    const service = services?.find(s => s.id.toString() === formData.serviceId);
    if (!service) return;

    addToQueue.mutate(
      { data: {
        clientName: formData.clientName,
        serviceName: service.name,
        servicePrice: service.price,
        serviceDuration: service.durationMinutes
      }},
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListQueueQueryKey() });
          setIsAddOpen(false);
          setFormData({ clientName: "", serviceId: "" });
          toast({ title: "Adicionado à fila" });
        }
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
        }
      }
    );
  };

  const handleRemove = (id: number) => {
    if (confirm("Tem certeza que deseja remover da fila?")) {
      removeFromQueue.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListQueueQueryKey() });
            toast({ title: "Removido da fila" });
          }
        }
      );
    }
  };

  const waitingQueue = queue?.filter(q => q.status === "waiting") || [];
  const inProgressQueue = queue?.filter(q => q.status === "in_progress") || [];

  return (
    <div className="flex-1 p-8 bg-background overflow-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel de Fila</h1>
          <p className="text-muted-foreground mt-1">Gerencie a fila de clientes sem agendamento.</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Adicionar à Fila
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Cliente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome do Cliente</Label>
                <Input 
                  value={formData.clientName} 
                  onChange={e => setFormData({...formData, clientName: e.target.value})} 
                  placeholder="Nome"
                />
              </div>
              <div className="space-y-2">
                <Label>Serviço</Label>
                <Select value={formData.serviceId} onValueChange={v => setFormData({...formData, serviceId: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {services?.map(s => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.name} - {s.durationMinutes} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancelar</Button>
              <Button onClick={handleAdd} disabled={!formData.clientName || !formData.serviceId || addToQueue.isPending}>
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            Aguardando
            <span className="bg-muted text-muted-foreground text-sm py-1 px-2 rounded-full">{waitingQueue.length}</span>
          </h2>
          <div className="border border-border rounded-lg bg-card">
            {isLoadingQueue ? (
              <div className="p-4 space-y-2"><Skeleton className="h-12 w-full" /></div>
            ) : waitingQueue.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                <ListOrdered className="h-8 w-8 mb-2 opacity-20" />
                Ninguém na fila
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pos</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waitingQueue.map((entry, idx) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-bold text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{entry.clientName}</TableCell>
                      <TableCell>{entry.serviceName}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="icon" className="text-teal-500 hover:text-teal-400 hover:bg-teal-500/10" onClick={() => handleStart(entry.id)}>
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleRemove(entry.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            Em Atendimento
            <span className="bg-primary/20 text-primary text-sm py-1 px-2 rounded-full">{inProgressQueue.length}</span>
          </h2>
          <div className="space-y-3">
            {inProgressQueue.length === 0 ? (
              <div className="border border-border rounded-lg bg-card p-8 text-center text-muted-foreground flex flex-col items-center">
                Nenhum atendimento no momento
              </div>
            ) : (
              inProgressQueue.map(entry => (
                <div key={entry.id} className="border border-primary/20 rounded-lg bg-primary/5 p-4 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg">{entry.clientName}</h3>
                    <p className="text-primary">{entry.serviceName}</p>
                  </div>
                  <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => handleRemove(entry.id)}>
                    Finalizar
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
