import { Link } from "wouter";
import logoUrl from "../assets/agenda-play-logo-v2.png";

const features = [
  {
    title: "Agenda online",
    text: "Organize horários, profissionais e serviços em uma agenda simples de usar.",
  },
  {
    title: "Fila em tempo real",
    text: "Acompanhe a fila no celular ou na TV e mantenha o atendimento fluindo.",
  },
  {
    title: "Clientes sempre por perto",
    text: "Tenha o histórico de cada cliente e facilite o retorno para a próxima visita.",
  },
  {
    title: "Controle financeiro",
    text: "Veja faturamento, serviços realizados e os horários que mais movimentam sua barbearia.",
  },
  {
    title: "Programa de fidelidade",
    text: "Use pontos e recompensas para transformar bons atendimentos em clientes recorrentes.",
  },
  {
    title: "Seu link de agendamento",
    text: "Compartilhe um link moderno para o cliente escolher serviço, profissional e horário.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen w-full overflow-hidden bg-[#080909] text-white">
      <header className="relative z-10 border-b border-white/10">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-5 sm:py-4 lg:px-8" aria-label="Navegação principal">
          <a href="/" className="flex items-center gap-2 sm:gap-3" aria-label="AgendaPlay início">
            <img src={logoUrl} alt="Logo AgendaPlay" width={42} height={42} className="h-9 w-9 rounded-xl object-contain sm:h-[42px] sm:w-[42px]" />
            <span className="text-base font-bold tracking-tight sm:text-lg">Agenda<span className="text-emerald-400">Play</span></span>
          </a>
          <div className="hidden items-center gap-8 text-sm text-white/65 md:flex">
            <a href="#recursos" className="transition-colors hover:text-white">Recursos</a>
            <a href="#como-funciona" className="transition-colors hover:text-white">Como funciona</a>
            <a href="#para-quem" className="transition-colors hover:text-white">Para sua barbearia</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="shrink-0 text-xs font-medium text-white/70 transition-colors hover:text-white sm:text-sm">Entrar</Link>
            <Link href="/register" className="shrink-0 whitespace-nowrap rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-[#06100b] transition hover:bg-emerald-300 sm:px-4 sm:text-sm">Começar grátis</Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative isolate">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_20%,rgba(52,211,153,0.16),transparent_32%),radial-gradient(circle_at_18%_38%,rgba(16,185,129,0.08),transparent_28%)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-28 lg:pt-24">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                Sistema de gestão para barbearias
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-[-0.04em] sm:text-6xl">
                Mais organização para você.{" "}
                <span className="text-emerald-400">Mais tempo para atender.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-white/65">
                O AgendaPlay reúne agenda online, fila, clientes, financeiro e fidelidade em um só lugar — feito para a rotina real da sua barbearia.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/register" data-testid="link-create-shop" className="inline-flex items-center justify-center rounded-xl bg-emerald-400 px-6 py-3.5 font-bold text-[#06100b] shadow-[0_12px_36px_rgba(52,211,153,0.2)] transition hover:-translate-y-0.5 hover:bg-emerald-300">
                  Criar minha barbearia
                </Link>
                <a href="#recursos" className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 font-semibold text-white/80 transition hover:border-white/30 hover:bg-white/5 hover:text-white">
                  Conhecer recursos
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/50">
                <span>✓ 30 dias grátis</span>
                <span>✓ Sem cartão de crédito</span>
                <span>✓ Feito para barbearias</span>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute -inset-8 rounded-full bg-emerald-400/10 blur-3xl" />
              <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-[#101312] p-4 shadow-2xl shadow-black/40">
                <div className="mb-4 flex items-center justify-between border-b border-white/10 px-2 pb-4">
                  <div>
                    <p className="text-xs text-white/45">Visão geral</p>
                    <p className="mt-1 font-bold">Sua barbearia hoje</p>
                  </div>
                  <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">Ao vivo</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Agendamentos", "24", "Hoje"],
                    ["Faturamento", "R$ 1.840", "Este mês"],
                    ["Na fila", "05", "Agora"],
                    ["Clientes", "318", "Cadastrados"],
                  ].map(([label, value, detail]) => (
                    <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                      <p className="text-xs text-white/45">{label}</p>
                      <p className="mt-2 text-xl font-bold">{value}</p>
                      <p className="mt-1 text-xs text-emerald-300/75">{detail}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Próximos horários</p>
                    <span className="text-xs text-emerald-300">Ver agenda</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {["09:30  ·  Carlos Mendes", "10:15  ·  Rafael Souza", "11:00  ·  João Pedro"].map((item, index) => (
                      <div key={item} className="flex items-center gap-3 text-sm text-white/70">
                        <span className={`h-2 w-2 rounded-full ${index === 0 ? "bg-emerald-400" : "bg-white/20"}`} />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="recursos" className="border-y border-white/8 bg-white/[0.025]">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">Tudo no seu controle</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">As ferramentas que sua barbearia precisa para crescer.</h2>
              <p className="mt-4 text-lg leading-8 text-white/55">Menos planilhas, menos mensagens perdidas e mais clareza para tomar decisões todos os dias.</p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <article key={feature.title} className="rounded-2xl border border-white/10 bg-[#101312] p-6 transition hover:-translate-y-1 hover:border-emerald-400/30">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/12 text-sm font-bold text-emerald-300">0{index + 1}</span>
                  <h3 className="mt-5 text-lg font-bold">{feature.title}</h3>
                  <p className="mt-2 leading-7 text-white/55">{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">Comece em poucos minutos</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Sua operação mais leve, a partir de hoje.</h2>
              <p className="mt-4 leading-7 text-white/55">Você configura o essencial e o AgendaPlay acompanha o crescimento do seu negócio.</p>
            </div>
            <div className="grid gap-8 sm:grid-cols-3">
              {[
                ["01", "Crie sua conta", "Cadastre a barbearia, os profissionais e os serviços."],
                ["02", "Compartilhe seu link", "Deixe seus clientes agendarem o melhor horário."],
                ["03", "Acompanhe tudo", "Use dados reais para atender melhor e crescer."],
              ].map(([number, title, text]) => (
                <article key={number} className="border-l border-emerald-400/40 pl-5">
                  <span className="text-sm font-bold text-emerald-300">{number}</span>
                  <h3 className="mt-4 font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/50">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="para-quem" className="border-t border-white/8 bg-emerald-400/[0.06]">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-5 py-16 lg:flex-row lg:items-center lg:px-8">
            <div>
              <h2 className="text-3xl font-black tracking-tight">Pronto para profissionalizar sua barbearia?</h2>
              <p className="mt-3 max-w-xl text-white/60">Teste o AgendaPlay por 30 dias, sem cartão de crédito, e descubra uma rotina mais organizada.</p>
            </div>
            <Link href="/register" className="shrink-0 rounded-xl bg-emerald-400 px-6 py-3.5 font-bold text-[#06100b] transition hover:bg-emerald-300">Começar agora</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>© {new Date().getFullYear()} AgendaPlay. Gestão inteligente para barbearias.</p>
          <div className="flex gap-5">
            <Link href="/login" className="transition hover:text-white">Entrar</Link>
            <Link href="/register" className="transition hover:text-white">Criar conta</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
