import React, { useRef, useState } from "react";
import { useListServices, useCreateService, useUpdateService, useDeleteService, getListServicesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Scissors, Upload, Clock, X, ImageIcon, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

function ServiceImageUpload({
  imageUrl,
  onPick,
  onRemove,
}: {
  imageUrl: string;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Foto do serviço
      </Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="input-service-image-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />

      {imageUrl ? (
        <div
          className="relative rounded-xl overflow-hidden border border-border/60 group"
          style={{ aspectRatio: "16/9", backgroundColor: "hsl(var(--muted))" }}
        >
          <img src={imageUrl} alt="Foto do serviço" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <Button type="button" size="sm" variant="secondary" onClick={openPicker} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Trocar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={onRemove}
              data-testid="button-remove-service-image"
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onPick(file);
          }}
          data-testid="button-upload-service-image"
          className="w-full rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 py-8 px-4"
          style={{
            borderColor: isDragging ? "hsl(var(--primary))" : "hsl(var(--border))",
            backgroundColor: isDragging ? "hsl(var(--primary) / 0.06)" : "hsl(var(--muted) / 0.3)",
            cursor: "pointer",
          }}
        >
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div className="text-center space-y-0.5">
            <p className="text-sm font-medium">
              <span className="text-primary">Clique para enviar</span>{" "}
              <span className="text-muted-foreground">ou arraste uma imagem</span>
            </p>
            <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP até 2MB</p>
          </div>
        </button>
      )}
    </div>
  );
}

export default function Services() {
  const { data: services, isLoading } = useListServices(undefined, { query: { queryKey: getListServicesQueryKey() } });
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isReordering, setIsReordering] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    durationMinutes: "30",
    price: "0.00",
    imageUrl: "",
  });

  const resetForm = () => {
    setFormData({ name: "", description: "", durationMinutes: "30", price: "0.00", imageUrl: "" });
    setEditingId(null);
  };

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione um arquivo de imagem", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagem muito grande (máx. 2MB)", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFormData((f) => ({ ...f, imageUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const payload = {
      name: formData.name,
      description: formData.description,
      durationMinutes: parseInt(formData.durationMinutes),
      price: parseFloat(formData.price),
      imageUrl: formData.imageUrl || undefined,
    };

    if (editingId) {
      updateService.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
            setIsCreateOpen(false);
            resetForm();
            toast({ title: "Serviço atualizado com sucesso" });
          }
        }
      );
    } else {
      createService.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
            setIsCreateOpen(false);
            resetForm();
            toast({ title: "Serviço criado com sucesso" });
          }
        }
      );
    }
  };

  const handleReorder = async (movedId: number, newIndex: number) => {
    if (!services) return;
    const list = [...services];
    const fromIndex = list.findIndex((s) => s.id === movedId);
    if (fromIndex === -1 || fromIndex === newIndex) return;
    const [moved] = list.splice(fromIndex, 1);
    list.splice(newIndex, 0, moved);
    const payload = list.map((s, i) => ({ id: s.id, sortOrder: i + 1 }));
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/services/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Falha ao reordenar");
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
      toast({ title: "Ordem atualizada" });
    } catch {
      toast({ title: "Erro ao reordenar", variant: "destructive" });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja remover este serviço?")) {
      deleteService.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
            toast({ title: "Serviço removido" });
          }
        }
      );
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="flex-1 p-4 md:p-8 bg-background overflow-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Serviços</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Gerencie os serviços oferecidos na barbearia.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant={isReordering ? "default" : "outline"}
            className="gap-2"
            onClick={() => setIsReordering(!isReordering)}
            data-testid="button-reorder-mode"
          >
            {isReordering ? "Pronto" : "Organizar"}
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Novo Serviço
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden border-border/60">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                {editingId ? "Editar serviço" : "Novo serviço"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {editingId
                  ? "Atualize as informações exibidas para seus clientes."
                  : "Cadastre um serviço que ficará disponível para agendamento."}
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <ServiceImageUpload
                imageUrl={formData.imageUrl}
                onPick={handleImageFile}
                onRemove={() => setFormData({ ...formData, imageUrl: "" })}
              />

              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Nome do serviço
                </Label>
                <Input
                  id="name"
                  data-testid="input-service-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Corte de cabelo"
                  className="h-11 bg-muted/40 border-border/60 focus-visible:bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Descrição
                </Label>
                <Textarea
                  id="description"
                  data-testid="input-service-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva o que está incluso (opcional)"
                  rows={2}
                  className="resize-none bg-muted/40 border-border/60 focus-visible:bg-background"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="duration" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Duração
                  </Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                    <Input
                      id="duration"
                      data-testid="input-service-duration"
                      type="number"
                      min={1}
                      value={formData.durationMinutes}
                      onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })}
                      className="h-11 pl-9 pr-12 bg-muted/40 border-border/60 focus-visible:bg-background tabular-nums"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                      min
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="price" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Preço
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                      R$
                    </span>
                    <Input
                      id="price"
                      data-testid="input-service-price"
                      type="number"
                      step="0.01"
                      min={0}
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="h-11 pl-10 bg-muted/40 border-border/60 focus-visible:bg-background tabular-nums"
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border/60 bg-muted/20 sm:justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsCreateOpen(false)}
                data-testid="button-cancel-service"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={!formData.name || createService.isPending || updateService.isPending}
                data-testid="button-save-service"
                className="min-w-[120px]"
              >
                {createService.isPending || updateService.isPending
                  ? "Salvando..."
                  : editingId
                    ? "Salvar alterações"
                    : "Criar serviço"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>

    <div className="border border-border rounded-lg bg-card overflow-x-auto">
        {isLoading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !services || services.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Scissors className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">Nenhum serviço encontrado</h3>
            <p className="text-muted-foreground">Cadastre seu primeiro serviço para começar.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[72px]">Foto</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell>
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                      {service.imageUrl ? (
                        <img src={service.imageUrl} alt={service.name} className="w-full h-full object-cover" />
                      ) : (
                        <Scissors className="w-4 h-4 text-muted-foreground/40" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {service.name}
                    {service.description && <p className="text-xs text-muted-foreground">{service.description}</p>}
                  </TableCell>
                  <TableCell>{service.durationMinutes} min</TableCell>
                  <TableCell>{formatCurrency(service.price)}</TableCell>
                  <TableCell className="text-right">
                    {isReordering ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={services.indexOf(service) === 0}
                          onClick={() => handleReorder(service.id, services.indexOf(service) - 1)}
                          data-testid={`button-service-up-${service.id}`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={services.indexOf(service) === services.length - 1}
                          onClick={() => handleReorder(service.id, services.indexOf(service) + 1)}
                          data-testid={`button-service-down-${service.id}`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingId(service.id);
                            setFormData({
                              name: service.name,
                              description: service.description || "",
                              durationMinutes: service.durationMinutes.toString(),
                              price: service.price.toString(),
                              imageUrl: service.imageUrl || "",
                            });
                            setIsCreateOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(service.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
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
