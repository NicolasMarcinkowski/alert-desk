import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export default function AlertesPage() {
  return (
    <PagePlaceholder
      title="Alertes"
      subtitle="Règles de prix et de P&L — notifications Telegram / Discord"
      milestone="JALON M3"
      description="Builder de règles (SI un instrument franchit un seuil ALORS notifier), avec cooldown, réarmement automatique et historique des déclenchements. Évaluées côté serveur : les notifications partent même navigateur fermé."
    />
  );
}
