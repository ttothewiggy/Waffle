import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Waffle — A little space for your day",
  description:
    "Your everyday journal. Words, photographs, and days worth keeping.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Waffle" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#203b55",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
