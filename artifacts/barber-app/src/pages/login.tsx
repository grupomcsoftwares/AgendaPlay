import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Scissors, Mail, Lock } from "lucide-react";
import { useGetSettings } from "@workspace/api-client-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const { data: settings } = useGetSettings({ query: { queryKey: ["settings"] } });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocation("/dashboard");
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "hsl(0 0% 4%)" }}
    >
      <div className="max-w-md w-full space-y-8">
        <Link href="/" className="flex items-center justify-center gap-3" data-testid="link-home">
          <Scissors className="w-8 h-8" style={{ color: "hsl(var(--sidebar-primary))" }} />
          <span className="text-2xl font-bold">{settings?.barbershopName || "Barbearia"}</span>
        </Link>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Entrar na sua conta</h1>
          <p className="text-sm" style={{ color: "hsl(0 0% 60%)" }}>
            Acesse o painel da sua barbearia
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 space-y-4"
          style={{
            backgroundColor: "hsl(0 0% 7%)",
            border: "1px solid hsl(0 0% 14%)",
          }}
        >
          <div className="space-y-2">
            <label className="text-sm font-semibold" htmlFor="email">E-mail</label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                style={{ color: "hsl(0 0% 45%)" }}
              />
              <input
                id="email"
                type="email"
                required
                data-testid="input-login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                className="w-full rounded-lg pl-9 pr-3 text-sm focus:outline-none"
                style={{
                  height: 44,
                  backgroundColor: "hsl(0 0% 4%)",
                  color: "hsl(var(--foreground))",
                  border: "1px solid hsl(0 0% 16%)",
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold" htmlFor="password">Senha</label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                style={{ color: "hsl(0 0% 45%)" }}
              />
              <input
                id="password"
                type="password"
                required
                data-testid="input-login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg pl-9 pr-3 text-sm focus:outline-none"
                style={{
                  height: 44,
                  backgroundColor: "hsl(0 0% 4%)",
                  color: "hsl(var(--foreground))",
                  border: "1px solid hsl(0 0% 16%)",
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            data-testid="button-login-submit"
            className="w-full rounded-xl font-semibold transition-opacity hover:opacity-90"
            style={{
              height: 48,
              backgroundColor: "hsl(var(--sidebar-primary))",
              color: "hsl(var(--sidebar-primary-foreground))",
              border: "none",
              cursor: "pointer",
            }}
          >
            Entrar no painel
          </button>

          <p className="text-center text-sm pt-2" style={{ color: "hsl(0 0% 55%)" }}>
            Não tem conta?{" "}
            <Link href="/" className="font-semibold" style={{ color: "hsl(var(--sidebar-primary))" }}>
              Criar barbearia
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
