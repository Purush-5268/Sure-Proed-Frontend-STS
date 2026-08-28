import Hero from "../../components/landing/Hero";
import Features from "../../components/landing/Features";
import Statistics from "../../components/landing/Statistics";
import PromotionalBanner from "../../components/landing/PromotionalBanner";

function Landing() {
  return (
    <>
      <Hero />
      <PromotionalBanner />
      <Features />
      <Statistics />
    </>
  );
}

export default Landing;