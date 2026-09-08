import React, { Suspense, lazy, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Hero from "../../components/landing/Hero";
import Features from "../../components/landing/Features";
import PromotionalBanner from "../../components/landing/PromotionalBanner";

const Statistics = lazy(() => import("../../components/landing/Statistics"));

function Landing() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }, 300); // Short delay to allow lazy components to render
    }
  }, [location]);

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