import type { Metadata } from "next";
import { RevolvingTitle } from "@/components/seo/revolving-title";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import HeroSection from "@/components/landing/hero-section";
import TickerTape from "@/components/landing/ticker-tape";
import MarketsSection from "@/components/landing/markets-section";
import HowItWorks from "@/components/landing/how-it-works";


export const metadata: Metadata = {
  title: "DEXI : Fantasy Sports Trading on Solana",
  description:
    "Trade athlete tokens, compete in fantasy contests, and win USDC prizes instantly on Solana.",
  openGraph: {
    title: "DEXI — Fantasy Sports Trading on Solana",
    description:
      "Trade athlete tokens, compete in fantasy contests, and win USDC prizes instantly on Solana.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "DEXI",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description:
    "Trade athlete tokens, compete in fantasy contests, and win USDC prizes instantly on Solana.",
  url: "https://dexi.xyz",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function LandingPage() {
  return (
    <>
      <RevolvingTitle
        titles={[
          "DEXI : Fantasy Sports Trading on Solana",
          "Trade Athlete Tokens | DEXI",
          "Compete in Fantasy Contests | DEXI",
          "Win USDC Prizes | DEXI",
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex flex-col min-h-screen overflow-x-hidden bg-[#0f131d]">
        <Navbar />
        <main className="flex-grow flex flex-col w-full">
          <HeroSection />
          <TickerTape />
          <HowItWorks />
          <MarketsSection />
        </main>
        <Footer />
      </div>
    </>
  );
}
