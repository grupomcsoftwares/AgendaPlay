import React, { useRef, useState } from "react";
import {
  useListBarbers,
  useCreateBarber,
  useUpdateBarber,
  useDeleteBarber,
  useListServices,
  getListBarbersQueryKey,
  getListServicesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, User, Upload, X, ImageIcon, Power } from "lucide-react";
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
  const { data: services } = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  const createBarber = useCreateBarber();
  const updateBarber = useUpdateBarber();
  const deleteBarber = useDeleteBarber();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    photoUrl: string;
    bio: string;
    active: boolean;
    serviceIds: number[];
  }>({ name: "", photoUrl: "", bio: "", active: true, serviceIds: [] });

  const resetForm = () => {
    setFormData({ name: "", photoUrl: "", bio: "", active: true, serviceIds: [] });
    setEditingId(null);
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

  const handleSave = () => {
    if (!formData.name.trim()) return;
    const payload = {
      name: formData.name.trim(),
      photoUrl: formData.photoUrl || undefined,
      bio: formData.bio || undefined,
      active: formData.active,
      serviceIds: formData.serviceIds,
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
        },
      );
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
    <div className="flex-1 p-8 bg-background overflow-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Barbeiros</h1>
          <p className="text-muted-foreground mt-1">
            Cadastre os profissionais que atendem. Quando houver mais de um, o cliente escolhe na hora de agendar.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-new-barber">
              <Plus className="h-4 w-4" /> Novo Barbeiro
            </Button>
          </DialogTrigger>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[72px]">Foto</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Serviços</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {barbers.map((b) => {
                const serviceNames = b.serviceIds.length === 0
                  ? "Todos"
                  : (services ?? [])
                      .filter((s) => b.serviceIds.includes(s.id))
                      .map((s) => s.name)
                      .join(", ") || "—";
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
                    <TableCell>
                      <Badge variant={b.active ? "default" : "secondary"} data-testid={`badge-barber-status-${b.id}`}>
                        {b.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={b.active ? "Desativar" : "Ativar"}
                        onClick={() => toggleActive(b.id, b.active)}
                        data-testid={`button-toggle-barber-${b.id}`}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`button-edit-barber-${b.id}`}
                        onClick={() => {
                          setEditingId(b.id);
                          setFormData({
                            name: b.name,
                            photoUrl: b.photoUrl || "",
                            bio: b.bio || "",
                            active: b.active,
                            serviceIds: [...b.serviceIds],
                          });
                          setIsOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(b.id)}
                        data-testid={`button-delete-barber-${b.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
