import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  ApiError,
  getGetAdminOnlineUsersQueryKey,
  useGetAdminOnlineUsers,
} from "@workspace/api-client-react";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  Clock3,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  Users,
  UserRoundPlus,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminOnline() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = Boolean(user?.isSystemAdmin);
  const {
    data,
    error,
    isLoading,
    isFetching,
  } = useGetAdminOnlineUsers({
    query: {
      queryKey: getGetAdminOnlineUsersQueryKey(),
      enabled: isAdmin,
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });

  useEffect(() => {
    if (user && !isAdmin) setLocation("/dashboard");
  }, [isAdmin, setLocation, user]);

  if (!isAdmin) return null;

  const errorStatus = error instanceof ApiError ? error.status : null;
  const updatedAt = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div className="flex-1 overflow-auto bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <ShieldCheck className="h-4 w-4" />
              Área restrita
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Administração do AgendaPlay
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Presença global de contas autenticadas em tempo real.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualização automática a cada 10 segundos
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : error ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex min-h-48 items-center gap-4 p-6">
              <AlertTriangle className="h-9 w-9 flex-shrink-0 text-destructive" />
              <div>
                <p className="font-semibold">
                  {errorStatus === 403
                    ? "Esta conta não possui acesso administrativo"
                    : "Não foi possível consultar os usuários online"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {errorStatus === 403
                    ? "Confirme se o e-mail está autorizado na configuração do sistema."
                    : "A consulta será tentada novamente automaticamente."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/10 via-background to-background">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-medium">
                    <Activity className="h-5 w-5 text-primary" />
                    Usuários online agora
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-8 pt-3">
                  <div className="flex items-end gap-4">
                    <div className="text-6xl font-bold tracking-tight md:text-7xl">
                      {data?.onlineUsers ?? 0}
                    </div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-500">
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                      </span>
                      Ao vivo
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Contas distintas com atividade recente no painel web ou aplicativo.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-5 w-5 text-primary" />
                    Como a contagem funciona
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Uma conta fica offline após{" "}
                      <span className="font-medium text-foreground">
                        {data?.activeWindowSeconds ?? 60} segundos
                      </span>{" "}
                      sem atividade.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      A mesma conta aberta em vários dispositivos é contada apenas uma vez.
                    </p>
                  </div>
                  {updatedAt && (
                    <p className="border-t pt-4 text-xs text-muted-foreground">
                      Última leitura do servidor: {updatedAt}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserRoundPlus className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">
                    Contas de barbearias cadastradas
                  </p>
                  <p className="mt-1 text-3xl font-bold tracking-tight">
                    {data?.registeredAccounts ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Proprietários com conta no AgendaPlay
                  </p>
                </div>
                <div className="grid w-full gap-2 border-t pt-4 sm:ml-auto sm:max-w-md sm:border-l sm:border-t-0 sm:pl-5">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <BadgeDollarSign className="h-4 w-4 text-emerald-500" />
                      Assinatura paga
                    </span>
                    <span className="font-semibold text-emerald-500">
                      {data?.paidAccounts ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <FlaskConical className="h-4 w-4 text-sky-500" />
                      Em período de teste
                    </span>
                    <span className="font-semibold text-sky-500">
                      {data?.trialAccounts ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Expirada
                    </span>
                    <span className="font-semibold text-amber-500">
                      {data?.expiredAccounts ?? 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}