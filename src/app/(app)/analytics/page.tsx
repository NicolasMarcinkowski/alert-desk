import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export default function AnalyticsPage() {
  return (
    <PagePlaceholder
      title="Analytics"
      subtitle="Calculé sur les trades clôturés uniquement · sans ratio de Sharpe"
      milestone="JALON M4"
      description="Win rate, profit factor, expectancy, max drawdown sur la courbe d'equity ajustée des dépôts/retraits, heatmap de P&L quotidien et répartition par sous-jacent et par stratégie."
    />
  );
}
