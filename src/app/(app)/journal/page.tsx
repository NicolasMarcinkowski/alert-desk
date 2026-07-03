import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export default function JournalPage() {
  return (
    <PagePlaceholder
      title="Journal de trades"
      subtitle="Round-trips clôturés · P&L réalisé IBKR · annotations"
      milestone="JALON M1"
      description="L'historique des exécutions importées d'IBKR, regroupées en round-trips avec P&L réalisé (fifoPnlRealized), s'affichera ici. Notes, tags et stratégies arrivent au jalon M4."
    />
  );
}
