import type { Metadata } from "next";
import { Inter, Archivo_Narrow, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { Providers } from "@/solana/providers/providers";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const archivoNarrow = Archivo_Narrow({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const BASE_URL = "https://dexi.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    template: "%s | DEXI",
    default: "DEXI : Fantasy Sports Trading on Solana",
  },
  description: "Trade athlete tokens, compete in fantasy contests, and win USDC prizes instantly on Solana.",
  keywords: ["fantasy sports", "Solana", "athlete tokens", "DeFi", "trading", "crypto", "sports betting", "USDC"],
  authors: [{ name: "DEXI Protocol" }],
  creator: "DEXI Protocol",
  publisher: "DEXI Protocol",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: BASE_URL,
  },
  icons: {
    icon: "/DEXI.svg",
    apple: "/DEXI.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "DEXI",
    title: "DEXI — Fantasy Sports Trading on Solana",
    description: "Trade athlete tokens, compete in fantasy contests, and win USDC prizes instantly on Solana.",
    images: [
      {
        url: "/DEXI.svg",
        width: 100,
        height: 100,
        alt: "DEXI Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DEXI — Fantasy Sports Trading on Solana",
    description: "Trade athlete tokens, compete in fantasy contests, and win USDC prizes instantly on Solana.",
    images: ["/DEXI.svg"],
    creator: "@dexiprotocol",
  },
  category: "finance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${archivoNarrow.variable} ${jetbrainsMono.variable} dark antialiased`}>
      <body className="min-h-screen bg-background text-foreground flex flex-col font-sans">
        <Providers>
          {children}
          <Toaster position="bottom-right" theme="dark" />
        </Providers>
      </body>
    </html>
  );
}
