import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import HeroSection from '@/components/landing/hero-section';
import TickerTape from '@/components/landing/ticker-tape';
import HowItWorks from '@/components/landing/how-it-works';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden bg-[#0f131d]">
      <Navbar />
      <main className="flex-grow flex flex-col w-full">
        <HeroSection />
        <TickerTape />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}
