import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Scissors } from "lucide-react";
import Booking from "./booking";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const AMBER = "hsl(38 88% 55%)";
const AMBER_SOFT = "hsl(38 88% 55% / 0.15)";

type ShopInfo = {
  shopId: string;
  barbershopName: string;
  slug: string;
  logoUrl: string | null;
};

export default function PublicBooking() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const [, navigate] = useLocation();

  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    fetch(`${BASE}/api/b/${encodeURIComponent(slug)}`, { redirect: "manual" })
      .then(async (res) => {
        if (res.status === 301 || res.type === "opaqueredirect") {
          const data = await res.json() as { redirectToSlug?: string };
          if (data.redirectToSlug) {
            navigate(`/b/${encodeURIComponent(data.redirectToSlug)}`, { replace: true });
            return;
          }
          setNotFound(true);
          return;
        }
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
  }, [slug, navigate]);

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

  return <Booking shopId={shopInfo.shopId} slug={shopInfo.slug} />;
}
