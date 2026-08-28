import React, { useState, useEffect } from "react";
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
import AnimatedNumber from "../common/AnimatedNumber";
import { StudentJourneyChart, EcosystemChart } from "./StatisticsCharts";
import PeopleModal from "./PeopleModal";
import styles from "./Statistics.module.css";

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

  const fetchStats = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiClient.get(API_ENDPOINTS.ANALYTICS.PLATFORM_STATS);
      setData(res.data);
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
    <section id="statistics" className={styles.statistics}>
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
          >
            {/* HERO KPI */}
            <motion.div variants={fadeUp} className={styles.heroImpact}>
              <div className={styles.heroMetric}>
                <div className={styles.heroNumber}>
                  <AnimatedNumber value={data.students?.benefited} duration={2500} />+
                </div>
                <div className={styles.heroLabel}>Students Benefited</div>
                <div className={styles.heroSubtitle}>Transforming lives through free, high-quality technical education</div>
              </div>
              
              <div className={styles.heroMetric}>
                <div className={styles.heroNumber}>
                  {data.students?.placed != null ? (
                    <><AnimatedNumber value={data.students.placed} duration={2500} />+</>
                  ) : (
                    <span style={{ fontSize: '24px', fontWeight: '500', color: 'var(--text-muted, #9ca3af)', letterSpacing: 'normal' }}>Data coming soon</span>
                  )}
                </div>
                <div className={styles.heroLabel}>Students Placed</div>
                <div className={styles.heroSubtitle}>Successfully transitioning into industry roles and internships</div>
              </div>
            </motion.div>

            {/* STUDENT JOURNEY CHART */}
            <motion.div variants={fadeUp} className={styles.storySection}>
              <div className={styles.storyTitle}>Student Impact Journey</div>
              <div className={styles.chartContainer}>
                <StudentJourneyChart data={data.students} />
                
                {data.students?.placed === null && (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted, #9ca3af)', fontSize: '13px', marginTop: '16px', fontStyle: 'italic' }}>
                    Placement outcomes tracking coming soon.
                  </p>
                )}
              </div>
            </motion.div>

            {/* PEOPLE / ECOSYSTEM */}
            <motion.div variants={fadeUp} className={styles.storySection}>
              <div className={styles.storyTitle}>People & Ecosystem</div>
              
              {/* Optional: We can show the bar chart for people here, alongside the interactive cards */}
              <div className={styles.chartContainer} style={{ marginBottom: '32px' }}>
                <EcosystemChart data={data.people} />
              </div>

              <div className={styles.peopleGrid}>
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
            </motion.div>

            {/* INDUSTRY PARTNERS */}
            <motion.div variants={fadeUp} className={styles.storySection} style={{ marginBottom: 0 }}>
              <div className={styles.storyTitle}>Industry Impact</div>
              <div className={styles.metricCard}>
                <div className={styles.metricValue}>
                  <AnimatedNumber value={data.industry?.companies} duration={2000} />
                </div>
                <div className={styles.metricLabel}>
                  Companies & Industry Partners
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