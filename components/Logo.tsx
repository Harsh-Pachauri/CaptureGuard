import Image from "next/image";

/**
 * The CaptureGuard brand mark — replaces the 🛡 emoji previously used
 * inline everywhere the brand name appears (landing/about headers,
 * dashboard nav, login/judge access cards). `size` is a single square
 * dimension in px; the source asset is a rounded-square icon, so no
 * extra border-radius is applied here. `priority` is on unconditionally —
 * every current usage is a small, always-above-the-fold brand mark, never
 * worth the default lazy-load's flash-in.
 */
export function Logo({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="CaptureGuard"
      width={size}
      height={size}
      priority
      className={`inline-block align-[-0.2em] ${className}`}
    />
  );
}
