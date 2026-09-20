import React, { Suspense, lazy, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Hero from "../../components/landing/Hero";
import OpenCohorts from "./OpenCohorts";
import { useLandingData } from "../../hooks/useLandingData";
import LazySection from "../../components/common/LazySection";

const WhySureProed = lazy(() => import("../../components/landing/WhySureProed"));
const LearningPrograms = lazy(() => import("../../components/landing/LearningPrograms"));
const Statistics = lazy(() => import("../../components/landing/Statistics"));
const FinalCTA = lazy(() => import("../../components/landing/FinalCTA"));

function Landing() {
  const location = useLocation();
  const { cohorts, courses, loading } = useLandingData();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }, 300);
    }
  }, [location]);

  return (
    <div className="landing-page-wrapper">
      <Hero cohorts={cohorts} loading={loading} />
      <OpenCohorts cohorts={cohorts} loading={loading} />
      
      <LazySection fallback={<div style={{ minHeight: '400px' }}></div>}>
        <Suspense fallback={<div style={{ minHeight: '400px' }}></div>}>
          <WhySureProed />
        </Suspense>
      </LazySection>

      <LazySection fallback={<div style={{ minHeight: '400px' }}></div>}>
        <Suspense fallback={<div style={{ minHeight: '400px' }}></div>}>
          <LearningPrograms courses={courses} loading={loading} />
        </Suspense>
      </LazySection>

      <LazySection fallback={<div style={{ minHeight: '400px' }}></div>}>
        <Suspense fallback={<div style={{ minHeight: '400px' }}></div>}>
          <Statistics />
        </Suspense>
      </LazySection>

      <LazySection fallback={<div style={{ minHeight: '300px' }}></div>}>
        <Suspense fallback={<div style={{ minHeight: '300px' }}></div>}>
          <FinalCTA />
        </Suspense>
      </LazySection>
    </div>
  );
}

export default Landing;