import React, { useState, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FaExclamationTriangle,
  FaUserGraduate,
  FaChalkboardTeacher,
  FaHandsHelping,
  FaUserTie,
  FaBuilding,
  FaAward,
  FaBriefcase,
  FaUsers
} from "react-icons/fa";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { companyService } from "../../services/companyService";
import AnimatedNumber from "../common/AnimatedNumber";
import CompanyShowcase from "./CompanyShowcase";
import PeopleModal from "./PeopleModal";
import styles from "./Statistics.module.css";

const StudentJourneyChart = lazy(() => import("./StatisticsCharts").then(module => ({ default: module.StudentJourneyChart })));
const EcosystemChart = lazy(() => import("./StatisticsCharts").then(module => ({ default: module.EcosystemChart })));

function useInViewOnce(options = { rootMargin: '400px' }) {
  const [inView, setInView] = useState(false);
  const ref = React.useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, options);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [options.rootMargin]);

  return [ref, inView];
}

// Animation Variants
const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 20 } }
};

const SkeletonCard = () => (
  <div className={`${styles.skeletonCard} ${styles.skeletonElement}`}></div>
);

const SkeletonSection = () => (
  <div className={styles.skeletonContainer}>
    <div className={`${styles.skeletonHero} ${styles.skeletonElement}`}></div>
    <div className={`${styles.skeletonChart} ${styles.skeletonElement}`}></div>
    <div className={styles.skeletonGrid}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </div>
);

const InteractivePeopleCard = ({ icon: Icon, label, value, onClick }) => (
  <motion.div
    variants={fadeUp}
    className={styles.peopleCard}
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
  >
    <div className={styles.peopleIcon}><Icon /></div>
    <div className={styles.peopleValue}><AnimatedNumber value={value} duration={1500} /></div>
    <div className={styles.peopleLabel}>{label}</div>
    <div className={styles.interactiveHint}>View Profiles</div>
  </motion.div>
);

function Statistics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState(null);
  const [activeModal, setActiveModal] = useState(null);

  const [companies, setCompanies] = useState([]);
  const [chartsRef, chartsInView] = useInViewOnce({ rootMargin: '400px' });

  const fetchStats = async () => {
    setLoading(true);
    setError(false);
    try {
      const timestamp = new Date().getTime();
      const [statsRes, companiesRes] = await Promise.all([
        apiClient.get(`${API_ENDPOINTS.ANALYTICS.PLATFORM_STATS}?t=${timestamp}`),
        companyService.getCompanies({ limit: 50 }).catch(() => null)
      ]);
      setData(statsRes.data);
      if (companiesRes) {
        setCompanies(companiesRes.results || companiesRes || []);
      }
    } catch (err) {
      console.error("Failed to fetch platform impact statistics", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (error) {
    return (
      <section id="statistics" className={styles.statistics}>
        <div className={styles.starsOverlay}></div>
        <div className={styles.container}>
          <div className={styles.header}>
            <h2>Global <span className={styles.highlight}>Impact Ecosystem</span></h2>
            <p>Real-time insights into the learners, people, and partnerships powering SURE TRUST.</p>
          </div>
          <div className={styles.errorState}>
            <FaExclamationTriangle className={styles.errorIcon} />
            <p>Impact data temporarily unavailable</p>
            <button className={styles.retryBtn} onClick={fetchStats}>
              Retry Connection
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="statistics" className={styles.statistics} ref={chartsRef}>
      <div className={styles.starsOverlay}></div>
      <div className={styles.container}>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "0px" }}
          variants={fadeUp}
          className={styles.header}
        >
          <h2>Global <span className={styles.highlight}>Impact Ecosystem</span></h2>
          <p>Real-time insights into the learners, people, and partnerships powering SURE TRUST.</p>
        </motion.div>

        {loading ? (
          <SkeletonSection />
        ) : data ? (
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "0px" }}
            variants={staggerContainer}
            className={styles.dashboardContainer}
          >
            {/* GLOBAL IMPACT ECOSYSTEM */}
            <motion.div variants={fadeUp} className={styles.topCardsGrid}>
              <div className={styles.heroCard}>
                <div className={styles.heroIconWrapper}><FaUserGraduate className={styles.heroIcon} /></div>
                <div className={styles.heroText}>
                  <div className={styles.heroNumber}>
                    <AnimatedNumber value={data.students?.benefited} duration={2500} />
                  </div>
                  <div className={styles.heroLabel}>STUDENTS BENEFITED</div>
                  <div className={styles.heroSubtitle}>Transforming lives through free,<br/>high-quality technical education</div>
                </div>
              </div>
              <div className={styles.heroCard}>
                <div className={styles.heroIconWrapper}><FaBriefcase className={styles.heroIcon} /></div>
                <div className={styles.heroText}>
                  <div className={styles.heroNumber}>
                    <AnimatedNumber value={data.students?.placed || 0} duration={2500} />
                  </div>
                  <div className={styles.heroLabel}>STUDENTS PLACED</div>
                  <div className={styles.heroSubtitle}>Successfully transitioning into<br/>industry roles and internships</div>
                </div>
              </div>
            </motion.div>

            {/* STUDENT IMPACT JOURNEY */}
            <motion.div variants={fadeUp} className={styles.dashboardSection}>
              <div className={styles.sectionDivider}>
                <span>STUDENT IMPACT JOURNEY</span>
              </div>
              <div className={styles.dashboardCard}>
                {chartsInView ? (
                  <Suspense fallback={<div className={styles.chartFallback}>Loading chart...</div>}>
                    <StudentJourneyChart data={data.students} />
                  </Suspense>
                ) : (
                  <div className={styles.chartFallback}>Loading chart...</div>
                )}
              </div>
            </motion.div>

            {/* PEOPLE & ECOSYSTEM */}
            <motion.div variants={fadeUp} className={styles.dashboardSection}>
              <div className={styles.sectionDivider}>
                <span>PEOPLE & ECOSYSTEM</span>
              </div>
              <div className={`${styles.dashboardCard} ${styles.peopleEcosystemCard}`}>
                <div className={styles.ecosystemLeft}>
                  {chartsInView ? (
                    <Suspense fallback={<div className={styles.chartFallback}>Loading chart...</div>}>
                      <EcosystemChart data={data.people} />
                    </Suspense>
                  ) : (
                    <div className={styles.chartFallback}>Loading chart...</div>
                  )}
                </div>
                <div className={styles.ecosystemRight}>
                  <div className={styles.peopleGridSmall}>
                    <InteractivePeopleCard
                      icon={FaChalkboardTeacher}
                      label="Mentors"
                      value={data.people?.mentors}
                      onClick={() => setActiveModal('Mentors')}
                    />
                    <InteractivePeopleCard
                      icon={FaHandsHelping}
                      label="Volunteers"
                      value={data.people?.volunteers}
                      onClick={() => setActiveModal('Volunteers')}
                    />
                    <InteractivePeopleCard
                      icon={FaUserTie}
                      label="Trustees"
                      value={data.people?.trustees}
                      onClick={() => setActiveModal('Trustees')}
                    />
                    <InteractivePeopleCard
                      icon={FaUserGraduate}
                      label="Advisors"
                      value={data.people?.advisors}
                      onClick={() => setActiveModal('Advisors')}
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* INDUSTRY IMPACT */}
            <motion.div variants={fadeUp} className={styles.dashboardSection}>
              <div className={styles.sectionDivider}>
                <span>INDUSTRY IMPACT</span>
              </div>
              <div className={styles.dashboardCard} style={{ display: 'block' }}>
                <h3 className={styles.industryTitle}>Companies & Industry Partners</h3>
                <CompanyShowcase companies={companies} />
                <div className={styles.viewAllPartners}>
                  <Link to="/partners">View All Partners &rarr;</Link>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}

      </div>

      <PeopleModal
        isOpen={!!activeModal}
        category={activeModal}
        onClose={() => setActiveModal(null)}
      />
    </section>
  );
}

export default Statistics;