export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5B6EF5" />
          <stop offset="1" stopColor="#9B6BFF" />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="8" fill="url(#logo-gradient)" />
      <path d="M11.5 9.2C11.5 8.53 12.23 8.12 12.8 8.46L19.4 12.36C19.96 12.69 19.96 13.51 19.4 13.84L12.8 17.74C12.23 18.08 11.5 17.67 11.5 17V9.2Z" fill="white" />
    </svg>
  );
}
