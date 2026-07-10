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

export const metadata: Metadata = {
  title: "DEXI — Fantasy Sports Trading on Solana",
  description: "Trade athlete tokens, compete in fantasy contests, and win USDC prizes instantly on Solana.",
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
