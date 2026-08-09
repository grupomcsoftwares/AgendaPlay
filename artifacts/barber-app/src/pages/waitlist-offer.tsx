import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useAcceptWaitlistOffer, useDeclineWaitlistOffer, useGetWaitlistOffer, getGetWaitlistOfferQueryKey } from "@workspace/api-client-react";
import { CheckCircle2, Clock, Scissors, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WaitlistOffer() {
  const [, params] = useRoute("/fila-espera/:token");
  const [, setLocation] = useLocation();
  const token = params?.token ?? "";
  const { data: offer, isLoading, isError } = useGetWaitlistOffer(token, { query: { queryKey: getGetWaitlistOfferQueryKey(token), enabled: !!token } });
  const accept = useAcceptWaitlistOffer();
  const decline = useDeclineWaitlistOffer();
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const [appointmentToken, setAppointmentToken] = useState<string | null>(null);
  const errorText = (error: any) => error?.response?.data?.error ?? error?.message ?? "Não foi possível concluir.";

  if (isLoading) return <Centered title="Carregando oferta…" />;
  if (isError || !offer) return <Centered icon={<XCircle />} title="Oferta indisponível" text="Este horário pode já ter sido aceito ou expirado." />;
  if (done === "accepted") return <Centered icon={<CheckCircle2 />} title="Horário confirmado!" text="Seu agendamento foi criado com sucesso." action={<Button onClick={() => setLocation(appointmentToken ? `/agendamento/${appointmentToken}` : "/")}>Ver agendamento</Button>} />;
  if (done === "declined") return <Centered icon={<CheckCircle2 />} title="Oferta recusada" text="A vaga foi liberada para a próxima pessoa da fila." />;

  const scheduled = offer.offeredScheduledAt ? new Date(offer.offeredScheduledAt) : null;
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-16 w-16 rounded-full flex items-center justify-center" style={{ background: "hsl(38 88% 55% / .15)", color: "hsl(38 88% 55%)" }}><Clock /></div>
          <h1 className="text-2xl font-bold">Um horário ficou disponível</h1>
          <p className="text-muted-foreground">{offer.shopName}</p>
        </div>
        <div className="rounded-2xl border border-border p-5 space-y-4">
          <p className="font-semibold">Olá, {offer.clientName}!</p>
          <div className="flex items-center gap-3"><Scissors className="h-5 w-5 text-muted-foreground" /><span>{offer.serviceName}</span></div>
          <div className="flex items-center gap-3"><Clock className="h-5 w-5 text-muted-foreground" /><span>{scheduled?.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}</span></div>
          <p className="text-sm text-muted-foreground">Esta oferta fica disponível por 5 minutos. O horário só será reservado depois que você aceitar.</p>
        </div>
        <div className="space-y-3">
          <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate({ token }, { onSuccess: (appointment) => { setAppointmentToken(appointment.cancelToken ?? null); setDone("accepted"); }, onError: (error) => window.alert(errorText(error)) })}>Aceitar horário</Button>
          <Button variant="outline" className="w-full" disabled={decline.isPending} onClick={() => decline.mutate({ token }, { onSuccess: () => setDone("declined"), onError: (error) => window.alert(errorText(error)) })}>Recusar</Button>
        </div>
      </div>
    </div>
  );
}

function Centered({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 text-center"><div className="max-w-sm space-y-3">{icon && <div className="mx-auto h-14 w-14 flex items-center justify-center text-amber-500">{icon}</div>}<h1 className="text-xl font-bold">{title}</h1>{text && <p className="text-muted-foreground">{text}</p>}{action}</div></div>;
}