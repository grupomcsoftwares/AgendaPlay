import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Mail, Lock, User, Store } from "lucide-react";
import logoUrl from "../assets/agenda-play-logo.png";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();
  const [form, setForm] = useState({
    barbershopName: "",
    ownerName: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      setLocation("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    height: 44,
    backgroundColor: "hsl(0 0% 4%)",
    color: "hsl(var(--foreground))",
    border: "1px solid hsl(0 0% 16%)",
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "hsl(0 0% 4%)" }}
    >
      <div className="max-w-md w-full space-y-8">
        <div className="flex items-center justify-center gap-3">
          <img src={logoUrl} alt="Agenda Play" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
          <span className="text-2xl font-bold">Agenda Play</span>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Crie sua barbearia</h1>
          <p className="text-sm" style={{ color: "hsl(0 0% 60%)" }}>
            7 dias grátis, sem cartão de crédito
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: "hsl(0 0% 7%)", border: "1px solid hsl(0 0% 14%)" }}
        >
          <div className="space-y-2">
            <label className="text-sm font-semibold" htmlFor="barbershopName">Nome da Barbearia</label>
            <div className="relative">
              <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "hsl(0 0% 45%)" }} />
              <input
                id="barbershopName"
                name="barbershopName"
                type="text"
                required
                value={form.barbershopName}
                onChange={handleChange}
                placeholder="Barbearia do João"
                className="w-full rounded-lg pl-9 pr-3 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold" htmlFor="ownerName">Seu Nome</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "hsl(0 0% 45%)" }} />
              <input
                id="ownerName"
                name="ownerName"
                type="text"
                required
                value={form.ownerName}
                onChange={handleChange}
                placeholder="João Silva"
                className="w-full rounded-lg pl-9 pr-3 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold" htmlFor="email">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "hsl(0 0% 45%)" }} />
              <input
                id="email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="voce@exemplo.com"
                className="w-full rounded-lg pl-9 pr-3 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold" htmlFor="password">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "hsl(0 0% 45%)" }} />
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={handleChange}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-lg pl-9 pr-3 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{
              height: 48,
              backgroundColor: "hsl(var(--sidebar-primary))",
              color: "hsl(var(--sidebar-primary-foreground))",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Criando conta..." : "Começar 7 dias grátis"}
          </button>

          <p className="text-center text-sm pt-2" style={{ color: "hsl(0 0% 55%)" }}>
            Já tem conta?{" "}
            <Link href="/login" className="font-semibold" style={{ color: "hsl(var(--sidebar-primary))" }}>
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
