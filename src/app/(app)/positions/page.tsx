import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export default function PositionsPage() {
  return (
    <PagePlaceholder
      title="Positions"
      subtitle="Import automatique IBKR Flex — positions groupées par sous-jacent"
      milestone="JALON M1"
      description="Les positions ouvertes (actions et options) apparaîtront ici après la connexion d'un compte IBKR et le premier import Flex. Le P&L latent en direct arrive au jalon M2."
    />
  );
}
