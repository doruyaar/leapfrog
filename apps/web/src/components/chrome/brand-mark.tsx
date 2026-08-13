/** Simple frog silhouette used as the product mark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.6 3.1c.72 0 1.3.6 1.3 1.35 0 .32-.1.6-.28.83.76-.2 1.6-.2 2.36 0a1.37 1.37 0 0 1-.28-.83c0-.75.58-1.35 1.3-1.35.71 0 1.29.6 1.29 1.35 0 .5-.25.93-.63 1.17 1.3.75 2.14 2 2.14 3.4 0 .5-.1.98-.3 1.4l1.2 1.05a.72.72 0 0 1-.44 1.27h-1.7c-.32.2-.68.35-1.06.45l.5.63a.7.7 0 0 1-.54 1.15H5.53a.7.7 0 0 1-.54-1.15l.5-.63c-.38-.1-.74-.25-1.06-.45H2.73a.72.72 0 0 1-.44-1.27l1.2-1.05a3.5 3.5 0 0 1-.3-1.4c0-1.4.84-2.65 2.14-3.4a1.4 1.4 0 0 1-.63-1.17c0-.75.58-1.35 1.3-1.35Z" />
    </svg>
  );
}
