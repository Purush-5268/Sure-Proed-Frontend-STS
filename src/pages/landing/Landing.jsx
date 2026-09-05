import React, { Suspense, lazy } from "react";
import Hero from "../../components/landing/Hero";
import Features from "../../components/landing/Features";
import PromotionalBanner from "../../components/landing/PromotionalBanner";

const Statistics = lazy(() => import("../../components/landing/Statistics"));

function Landing() {
  return (
    <>
      <Hero />
      <PromotionalBanner />
      <Features />
      <Suspense fallback={<div style={{ minHeight: '400px' }}></div>}>
        <Statistics />
      </Suspense>
    </>
  );
}


export default Landing;