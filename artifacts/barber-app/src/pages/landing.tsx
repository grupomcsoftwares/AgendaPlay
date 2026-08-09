import { Link } from "wouter";
import logoUrl from "../assets/agenda-play-logo-v2.png";

export default function Landing() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-12 relative"
      style={{
        backgroundColor: "hsl(0 0% 4%)",
        backgroundImage:
          "radial-gradient(ellipse at center, hsl(0 0% 8%) 0%, hsl(0 0% 3%) 70%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(hsl(0 0% 0% / 0.55), hsl(0 0% 0% / 0.85)), repeating-linear-gradient(0deg, hsl(0 0% 8%) 0 38px, hsl(0 0% 6%) 38px 40px), repeating-linear-gradient(90deg, hsl(0 0% 9%) 0 78px, hsl(0 0% 5%) 78px 80px)",
          backgroundBlendMode: "multiply",
          opacity: 0.5,
        }}
      />

      <div className="relative max-w-2xl w-full text-center space-y-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <img
            src={logoUrl}
            alt="Agenda Play"
            style={{ width: 220, height: 220, borderRadius: 24, objectFit: "contain" }}
          />
        </div>

        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          Gerencie sua barbearia como um profissional.
        </h2>

        <p
          className="text-base sm:text-lg leading-relaxed max-w-xl mx-auto"
          style={{ color: "hsl(0 0% 65%)" }}
        >
          Agendamentos, controle de receita e um link de reserva moderno para seus
          clientes. 30 dias grátis, sem cartão de crédito.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link
            href="/register"
            data-testid="link-create-shop"
            className="rounded-xl px-8 py-3 font-semibold transition-opacity hover:opacity-90 inline-flex items-center justify-center"
            style={{
              backgroundColor: "hsl(var(--sidebar-primary))",
              color: "hsl(var(--sidebar-primary-foreground))",
              minWidth: 220,
              boxShadow: "0 10px 30px hsl(var(--sidebar-primary) / 0.35)",
            }}
          >
            Criar Minha Barbearia
          </Link>
          <Link
            href="/login"
            className="rounded-xl px-8 py-3 font-semibold transition-opacity hover:opacity-90 inline-flex items-center justify-center"
            style={{
              backgroundColor: "hsl(0 0% 10%)",
              color: "hsl(0 0% 90%)",
              border: "1px solid hsl(0 0% 18%)",
              minWidth: 140,
            }}
          >
            Entrar
          </Link>
        </div>
      </div>
    </div>
  );
}
