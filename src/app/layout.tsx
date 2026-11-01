import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "De Olho na República",
  description:
    "Transparência política com dados oficiais: impostômetro, parlamentares, leis e votações e eleições 2026.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={plex.variable}>
      <body>{children}</body>
    </html>
  );
}
