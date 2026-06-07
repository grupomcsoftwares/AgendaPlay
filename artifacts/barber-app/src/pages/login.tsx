import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Mail, Lock } from "lucide-react";
import logoUrl from "../assets/agenda-play-logo-v2.png";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      setLocation("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao fazer login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "hsl(0 0% 4%)" }}
    >
      <div className="max-w-md w-full space-y-8">
        <div className="flex items-center justify-center gap-3">
          <img src={logoUrl} alt="Agenda Play" style={{ width: 200, height: 200, objectFit: "contain", imageRendering: "high-quality" } as React.CSSProperties} />
        </div>

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

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            data-testid="button-login-submit"
            className="w-full rounded-xl font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{
              height: 48,
              backgroundColor: "hsl(var(--sidebar-primary))",
              color: "hsl(var(--sidebar-primary-foreground))",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Entrando..." : "Entrar no painel"}
          </button>

          <p className="text-center text-sm pt-2" style={{ color: "hsl(0 0% 55%)" }}>
            Não tem conta?{" "}
            <Link href="/register" className="font-semibold" style={{ color: "hsl(var(--sidebar-primary))" }}>
              Criar barbearia
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
