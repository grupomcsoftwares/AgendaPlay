import React, { useEffect, useState } from "react";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    barbershopName: "",
    ownerName: "",
    phone: "",
    address: "",
    openTime: "",
    closeTime: "",
    bookingPageMessage: ""
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        barbershopName: settings.barbershopName || "",
        ownerName: settings.ownerName || "",
        phone: settings.phone || "",
        address: settings.address || "",
        openTime: settings.openTime || "",
        closeTime: settings.closeTime || "",
        bookingPageMessage: settings.bookingPageMessage || ""
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(
      { data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({ title: "Configurações salvas com sucesso" });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 bg-background overflow-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1">Gerencie as informações da barbearia.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Informações Gerais</CardTitle>
            <CardDescription>Dados principais da barbearia</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Barbearia</Label>
              <Input 
                value={formData.barbershopName} 
                onChange={e => setFormData({...formData, barbershopName: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do Proprietário</Label>
              <Input 
                value={formData.ownerName} 
                onChange={e => setFormData({...formData, ownerName: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone de Contato</Label>
              <Input 
                value={formData.phone} 
                onChange={e => setFormData({...formData, phone: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Textarea 
                value={formData.address} 
                onChange={e => setFormData({...formData, address: e.target.value})} 
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Horário de Funcionamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Abertura</Label>
                  <Input 
                    type="time"
                    value={formData.openTime} 
                    onChange={e => setFormData({...formData, openTime: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fechamento</Label>
                  <Input 
                    type="time"
                    value={formData.closeTime} 
                    onChange={e => setFormData({...formData, closeTime: e.target.value})} 
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Página de Agendamento</CardTitle>
              <CardDescription>Mensagem exibida para os clientes na página pública</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mensagem de Boas-vindas</Label>
                <Textarea 
                  value={formData.bookingPageMessage} 
                  onChange={e => setFormData({...formData, bookingPageMessage: e.target.value})} 
                  placeholder="Olá! Seja bem-vindo à nossa barbearia..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end max-w-5xl">
        <Button onClick={handleSave} disabled={updateSettings.isPending} className="gap-2">
          <Save className="h-4 w-4" /> Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
