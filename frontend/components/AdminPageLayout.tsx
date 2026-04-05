import { type ReactNode } from "react";

interface Props {
  /** Nur noch für semantische Zwecke (z.B. <title>) — Header liegt im Layout */
  title?: string;
  children: ReactNode;
  /** Tailwind max-w-Klasse. Default: max-w-7xl */
  maxWidth?: string;
  /** Kein automatisches Padding/MaxWidth — für Pages mit eigenem Layout */
  fullWidth?: boolean;
}

/**
 * Inhaltbreite-Wrapper für Admin-Seiten.
 * Auth-Check, Sidebar und Mobile-Header werden jetzt von /admin/layout.tsx bereitgestellt.
 */
export default function AdminPageLayout({
  children,
  maxWidth = "max-w-7xl",
  fullWidth = false,
}: Props) {
  if (fullWidth) return <>{children}</>;
  return (
    <div className={`${maxWidth} mx-auto px-4 py-8`}>
      {children}
    </div>
  );
}
