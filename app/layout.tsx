import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./refinement.css";
export const metadata: Metadata = {
  title: "Waffle — A little space for your day",
  description:
    "Your everyday journal. Words, photographs, and days worth keeping.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/waffle-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/waffle-icon-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: "/waffle-icon-180.png",
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Waffle" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: "#261e19",
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
