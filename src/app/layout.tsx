import type { Metadata, Viewport } from "next";
import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";
import { themeScript } from "@/components/providers/ThemeToggle";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "ComercioClaro — Gestión para tu negocio",
  description:
    "Plataforma simple y amigable para administrar ventas, compras, inventario y ganancias de tu pequeño negocio.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ComercioClaro", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: "/icons/icon-192.png",
  },
};

// Sin maximumScale: bloquear el zoom incumple WCAG 1.4.4.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0e7a4e" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1512" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
