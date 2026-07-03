import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export default function ReglagesPage() {
  return (
    <PagePlaceholder
      title="Réglages"
      subtitle="Comptes IBKR · notifications · préférences · allowlist"
      milestone="JALON M1"
      description="Connexion des comptes IBKR (token Flex chiffré + query IDs Trade Confirms / Activity), configuration Telegram et Discord, devise d'affichage et gestion de l'allowlist d'emails."
    />
  );
}
