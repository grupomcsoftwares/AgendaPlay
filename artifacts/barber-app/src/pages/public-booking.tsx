import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Scissors, CalendarClock } from "lucide-react";
import Booking from "./booking";
import { useGetNextAvailable, getGetNextAvailableQueryKey } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const AMBER = "hsl(38 88% 55%)";
const AMBER_SOFT = "hsl(38 88% 55% / 0.15)";
const AMBER_DEEP = "hsl(38 80% 45%)";

type ShopInfo = {
  shopId: string;
  barbershopName: string;
  slug: string;
  logoUrl: string | null;
};

function formatNextAvailableLabel(nextDate: string | null, nextTime: string | null): string | null {
  if (!nextDate || !nextTime) return null;

  const TZ = "America/Sao_Paulo";
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrowDate);

  const [hh, mm] = nextTime.split(":");
  const timeLabel = `${hh}h${mm !== "00" ? mm : ""}`;

  if (nextDate === todayStr) {
    return `Hoje às ${timeLabel}`;
  } else if (nextDate === tomorrowStr) {
    return `Amanhã às ${timeLabel}`;
  } else {
    const [year, month, day] = nextDate.split("-").map(Number);
    const d = new Date(year!, month! - 1, day!);
    const weekdays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return `${weekdays[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} às ${timeLabel}`;
  }
}

export default function PublicBooking() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    fetch(`${BASE}/api/b/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("Erro ao carregar barbearia");
        const data = await res.json() as ShopInfo;
        setShopInfo(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const { data: nextAvailable } = useGetNextAvailable(
    slug,
    { query: { queryKey: getGetNextAvailableQueryKey(slug), enabled: !!slug && !!shopInfo } }
  );

  const availabilityLabel = nextAvailable
    ? formatNextAvailableLabel(nextAvailable.nextDate ?? null, nextAvailable.nextTime ?? null)
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4">
        <div
          className="rounded-full flex items-center justify-center animate-pulse"
          style={{ width: 72, height: 72, backgroundColor: AMBER_SOFT, color: AMBER }}
        >
          <Scissors className="w-8 h-8" />
        </div>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (notFound || !shopInfo) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div
          className="rounded-full flex items-center justify-center"
          style={{ width: 72, height: 72, backgroundColor: AMBER_SOFT, color: AMBER }}
        >
          <Scissors className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold">Barbearia não encontrada</h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          O link que você acessou não existe ou foi removido. Verifique com o seu barbeiro.
        </p>
      </div>
    );
  }

  return (
    <div>
      {availabilityLabel && (
        <div className="w-full flex justify-center pt-6 px-4">
          <div
            className="flex items-center gap-3 rounded-2xl px-5 py-3 w-full max-w-md"
            style={{
              backgroundColor: AMBER_SOFT,
              border: `1px solid ${AMBER}`,
            }}
          >
            <CalendarClock
              className="w-5 h-5 flex-shrink-0"
              style={{ color: AMBER_DEEP }}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium" style={{ color: AMBER_DEEP }}>
                Próximo horário disponível
              </span>
              <span className="text-sm font-semibold truncate" style={{ color: "hsl(var(--foreground))" }}>
                {availabilityLabel}
              </span>
            </div>
          </div>
        </div>
      )}
      <Booking shopId={shopInfo.shopId} />
    </div>
  );
}
