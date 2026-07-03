import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export default function WatchlistPage() {
  return (
    <PagePlaceholder
      title="Watchlist"
      subtitle="Cotations temps réel — max 50 symboles actifs (websocket)"
      milestone="JALON M2"
      description="Suivi des tickers avec cotations live Finnhub, variation du jour et plage 52 semaines. Chaque ligne permettra de créer une alerte en un clic."
    />
  );
}
