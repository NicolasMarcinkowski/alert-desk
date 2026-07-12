export type Platform = "MANUAL" | "IBKR" | "TRADE_REPUBLIC";

export const PLATFORM_LABEL: Record<Platform, string> = {
  MANUAL: "Saisie manuelle",
  IBKR: "Interactive Brokers",
  TRADE_REPUBLIC: "Trade Republic",
};

/**
 * Pastille logo d'une plateforme. Marques simplifiées dessinées en SVG inline
 * (pas d'assets externes) : barres montantes IBKR, fanion Trade Republic,
 * crayon pour la saisie manuelle.
 */
export function PlatformLogo({
  platform,
  size = 36,
  muted = false,
}: {
  platform: Platform;
  size?: number;
  muted?: boolean;
}) {
  const icon = Math.round(size * 0.5);
  const tile: Record<Platform, string> = {
    MANUAL: "bg-accent/10",
    IBKR: "bg-[#D81222]/10",
    TRADE_REPUBLIC: "bg-surface-2",
  };

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-[25%] ${
        muted ? "bg-surface-2" : tile[platform]
      }`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {platform === "IBKR" && (
        // Marque IBKR simplifiée : barres de cours ascendantes
        <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none">
          {/* Rouge marque IBKR (#D81222), distinct du rouge P&L (--color-loss) */}
          <rect x="2" y="14" width="4" height="8" rx="1" fill={muted ? "#3E5570" : "#D81222"} />
          <rect x="8" y="10" width="4" height="12" rx="1" fill={muted ? "#3E5570" : "#D81222"} />
          <rect x="14" y="5" width="4" height="17" rx="1" fill={muted ? "#3E5570" : "#B00E1C"} />
          <path
            d="M3 8.5L11 4l4 2.5L21 2"
            stroke={muted ? "#3E5570" : "#F0565F"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {platform === "TRADE_REPUBLIC" && (
        // Marque Trade Republic simplifiée : fanion
        <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 3v18"
            stroke={muted ? "#3E5570" : "#DFE8F0"}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M5 4h13.5L15 8.5l3.5 4.5H5V4z"
            fill={muted ? "#3E5570" : "#DFE8F0"}
          />
        </svg>
      )}
      {platform === "MANUAL" && (
        <svg
          width={icon}
          height={icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke={muted ? "#3E5570" : "#58a6ff"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      )}
    </div>
  );
}
