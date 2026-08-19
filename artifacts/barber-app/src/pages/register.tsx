import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Mail, Lock, User, Store, CreditCard, Phone } from "lucide-react";
import logoUrl from "../assets/agenda-play-logo-v2.png";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();
  const [form, setForm] = useState({
    barbershopName: "",
    ownerName: "",
    phone: "",
    email: "",
    documentType: "cpf" as "cpf" | "cnpj",
    documentNumber: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const formatDocument = (value: string, type: "cpf" | "cnpj") => {
    const digits = value.replace(/\D/g, "").slice(0, type === "cpf" ? 11 : 14);
    if (type === "cpf") {
      return digits
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1-$2");
    }
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.name === "documentNumber"
      ? formatDocument(e.target.value, form.documentType)
      : e.target.name === "phone"
        ? e.target.value.replace(/\D/g, "").slice(0, 11)
          .replace(/^(\d{2})(\d)/, "($1) $2")
          .replace(/(\d{5})(\d)/, "$1-$2")
        : e.target.value;
    setForm((prev) => ({ ...prev, [e.target.name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const registeredUser = await register(form);
      setLocation(registeredUser.returningCustomer ? "/subscribe?returning=1" : "/dashboard");
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
          <img src={logoUrl} alt="Agenda Play" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "contain" }} />
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Crie sua barbearia</h1>
          <p className="text-sm" style={{ color: "hsl(0 0% 60%)" }}>
            Novas contas recebem 30 dias grátis, sem cartão de crédito
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
            <label className="text-sm font-semibold" htmlFor="ownerName">Nome completo</label>
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
            <label className="text-sm font-semibold" htmlFor="phone">Telefone</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "hsl(0 0% 45%)" }} />
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={form.phone}
                onChange={handleChange}
                placeholder="(11) 99999-9999"
                maxLength={15}
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
            <label className="text-sm font-semibold" htmlFor="documentType">Documento da conta</label>
            <select
              id="documentType"
              name="documentType"
              value={form.documentType}
              onChange={(e) => setForm((prev) => ({
                ...prev,
                documentType: e.target.value as "cpf" | "cnpj",
                documentNumber: "",
              }))}
              className="w-full rounded-lg px-3 text-sm focus:outline-none"
              style={inputStyle}
            >
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold" htmlFor="documentNumber">
              {form.documentType === "cpf" ? "CPF do responsável" : "CNPJ da empresa"}
            </label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "hsl(0 0% 45%)" }} />
              <input
                id="documentNumber"
                name="documentNumber"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                required
                value={form.documentNumber}
                onChange={handleChange}
                placeholder={form.documentType === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                maxLength={form.documentType === "cpf" ? 14 : 18}
                className="w-full rounded-lg pl-9 pr-3 text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>
            <p className="text-xs" style={{ color: "hsl(0 0% 50%)" }}>
              Após excluir a conta, o documento pode ser usado novamente, mas o período grátis não se repete.
            </p>
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
            {loading ? "Criando conta..." : "Criar minha conta"}
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
