import React, { useState } from "react";
import { 
  useListAppointments, 
  useCreateAppointment, 
  useUpdateAppointment, 
  useDeleteAppointment, 
  useStartAppointment, 
  useCompleteAppointment, 
  useCancelAppointment, 
  getListAppointmentsQueryKey,
  useListServices,
  getListServicesQueryKey,
  useListClients,
  getListClientsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Plus, Check, Play, X, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

export default function Appointments() {
  const [date, setDate] = useState<Date>(new Date());
  const dateStr = format(date, "yyyy-MM-dd");
  
  const { data: appointments, isLoading } = useListAppointments({ date: dateStr }, { query: { queryKey: getListAppointmentsQueryKey({ date: dateStr }) } });
  const { data: services } = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  const { data: clients } = useListClients({}, { query: { queryKey: getListClientsQueryKey({}) } });

  const createAppointment = useCreateAppointment();
  const updateAppointment = useUpdateAppointment();
  const deleteAppointment = useDeleteAppointment();
  const startAppointment = useStartAppointment();
  const completeAppointment = useCompleteAppointment();
  const cancelAppointment = useCancelAppointment();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    clientId: "new",
    clientName: "",
    serviceId: "",
    time: "10:00",
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey({ date: dateStr }) });

  const handleCreate = () => {
    const service = services?.find(s => s.id.toString() === formData.serviceId);
    if (!service) return;

    let cName = formData.clientName;
    if (formData.clientId !== "new") {
      const client = clients?.find(c => c.id.toString() === formData.clientId);
      if (client) cName = client.name;
    }

    const scheduledAt = new Date(`${dateStr}T${formData.time}:00`).toISOString();

    createAppointment.mutate(
      { data: {
        clientId: formData.clientId !== "new" ? parseInt(formData.clientId) : undefined,
        clientName: cName,
        serviceId: parseInt(formData.serviceId),
        serviceName: service.name,
        servicePrice: service.price,
        serviceDuration: service.durationMinutes,
        scheduledAt
      }},
      {
        onSuccess: () => {
          invalidate();
          setIsCreateOpen(false);
          toast({ title: "Agendamento criado" });
        }
      }
    );
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'pending': return <Badge variant="outline" className="text-yellow-500 border-yellow-500/20 bg-yellow-500/10">Pendente</Badge>;
      case 'in_progress': return <Badge variant="outline" className="text-teal-500 border-teal-500/20 bg-teal-500/10">Em Andamento</Badge>;
      case 'completed': return <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/10">Concluído</Badge>;
      case 'cancelled': return <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/10">Cancelado</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 p-8 bg-background overflow-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agendamentos</h1>
          <p className="text-muted-foreground mt-1">Gerencie a agenda do dia.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 border-border">
                <CalendarIcon className="h-4 w-4" />
                {format(date, "dd 'de' MMMM, yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} />
            </PopoverContent>
          </Popover>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Novo Agendamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agendar Horário</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={formData.clientId} onValueChange={v => setFormData({...formData, clientId: v, clientName: v === "new" ? formData.clientName : ""})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">+ Novo Cliente (Sem cadastro)</SelectItem>
                      {clients?.map(c => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {formData.clientId === "new" && (
                  <div className="space-y-2">
                    <Label>Nome do Cliente</Label>
                    <Input 
                      value={formData.clientName} 
                      onChange={e => setFormData({...formData, clientName: e.target.value})} 
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Serviço</Label>
                    <Select value={formData.serviceId} onValueChange={v => setFormData({...formData, serviceId: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Serviço" />
                      </SelectTrigger>
                      <SelectContent>
                        {services?.map(s => (
                          <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Horário</Label>
                    <Input 
                      type="time"
                      value={formData.time} 
                      onChange={e => setFormData({...formData, time: e.target.value})} 
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={(!formData.clientName && formData.clientId === "new") || !formData.serviceId || createAppointment.isPending}>
                  Confirmar Agendamento
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border border-border rounded-lg bg-card">
        {isLoading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !appointments || appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <CalendarIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">Nenhum agendamento</h3>
            <p className="text-muted-foreground">Não há horários marcados para esta data.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Horário</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.sort((a,b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()).map((apt) => (
                <TableRow key={apt.id}>
                  <TableCell className="font-bold text-lg">
                    {format(new Date(apt.scheduledAt), "HH:mm")}
                  </TableCell>
                  <TableCell className="font-medium">{apt.clientName}</TableCell>
                  <TableCell>{apt.serviceName}</TableCell>
                  <TableCell>{getStatusBadge(apt.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {apt.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="icon" title="Iniciar" className="text-teal-500 hover:text-teal-400 hover:bg-teal-500/10" onClick={() => startAppointment.mutate({id: apt.id}, { onSuccess: invalidate })}>
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Cancelar" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => cancelAppointment.mutate({id: apt.id}, { onSuccess: invalidate })}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {apt.status === 'in_progress' && (
                        <Button variant="ghost" size="icon" title="Concluir" className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => completeAppointment.mutate({id: apt.id}, { onSuccess: invalidate })}>
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => {
                        if (confirm("Deletar este registro?")) deleteAppointment.mutate({id: apt.id}, { onSuccess: invalidate });
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
