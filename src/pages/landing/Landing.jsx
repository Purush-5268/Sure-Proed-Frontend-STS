import React, { Suspense, lazy, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Hero from "../../components/landing/Hero";
import CohortAnnouncementBanner from "../../components/landing/CohortAnnouncementBanner";
import OpenCohorts from "./OpenCohorts";
import { useLandingData } from "../../hooks/useLandingData";
import LazySection from "../../components/common/LazySection";

const WhySureProed = lazy(() => import("../../components/landing/WhySureProed"));
const LearningPrograms = lazy(() => import("../../components/landing/LearningPrograms"));
const Statistics = lazy(() => import("../../components/landing/Statistics"));
const FinalCTA = lazy(() => import("../../components/landing/FinalCTA"));
import ScrollReveal from "../../components/common/ScrollReveal";

function Landing() {
  const location = useLocation();
  const { cohorts, courses, loading } = useLandingData();
  const hasOpenCohorts = cohorts && cohorts.some(c => c.status === 'OPEN');

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
      {hasOpenCohorts && <CohortAnnouncementBanner />}
      <Hero cohorts={cohorts} courses={courses} loading={loading} />
      <ScrollReveal>
        <OpenCohorts cohorts={cohorts} loading={loading} />
      </ScrollReveal>
      
      <LazySection fallback={<div style={{ minHeight: '400px' }}></div>}>
        <Suspense fallback={<div style={{ minHeight: '400px' }}></div>}>
          <ScrollReveal>
            <WhySureProed />
          </ScrollReveal>
        </Suspense>
      </LazySection>

      <LazySection fallback={<div style={{ minHeight: '400px' }}></div>}>
        <Suspense fallback={<div style={{ minHeight: '400px' }}></div>}>
          <ScrollReveal>
            <LearningPrograms courses={courses} loading={loading} />
          </ScrollReveal>
        </Suspense>
      </LazySection>

      <LazySection fallback={<div style={{ minHeight: '400px' }}></div>}>
        <Suspense fallback={<div style={{ minHeight: '400px' }}></div>}>
          <ScrollReveal>
            <Statistics />
          </ScrollReveal>
        </Suspense>
      </LazySection>

      <LazySection fallback={<div style={{ minHeight: '300px' }}></div>}>
        <Suspense fallback={<div style={{ minHeight: '300px' }}></div>}>
          <ScrollReveal>
            <FinalCTA />
          </ScrollReveal>
        </Suspense>
      </LazySection>
    </div>
  );
}

export default Landing;