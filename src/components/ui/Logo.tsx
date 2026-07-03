export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#58a6ff" opacity="0.16" />
      <path
        d="M5 20l5-6 4 4 5-9 4 5 4-3"
        fill="none"
        stroke="#58a6ff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
