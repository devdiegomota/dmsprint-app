import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dmsprint-app--dmsprintapp.us-east4.hosted.app"),
  title: "DMS Print — Tratamento de Arte e Imposição A4 300 DPI",
  description:
    "Gráfica rápida DMS Print: melhora artes de clientes (nitidez e textos finos), impõe cartões de visita e panfletos em folhas A4 a 300 DPI e exporta PDF pronto para impressão. Sua ideia, impressa com qualidade!",
  keywords: ["gráfica", "imposição", "A4", "300 DPI", "cartão de visita", "panfleto", "PDF", "impressão"],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "DMS Print",
    title: "DMS Print — Sua ideia, impressa com qualidade!",
    description: "Tratamento de arte e imposição A4 a 300 DPI para gráfica rápida.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "DMS Print — Sua ideia, impressa com qualidade!",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
