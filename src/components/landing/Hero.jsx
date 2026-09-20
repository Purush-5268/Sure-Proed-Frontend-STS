import { Link } from "react-router-dom";
import styles from "./Hero.module.css";
import { useAuth } from "../../context/AuthContext";
import HeroProductShowcase from "./HeroProductShowcase";
import { FaUserTie, FaLaptopCode, FaBriefcase } from "react-icons/fa";

function Hero({ cohorts, courses, loading }) {
  const { isAuthenticated, user } = useAuth();

  const getDashboardPath = () => {
    if (user?.role === "ADMIN") return "/admin/dashboard";
    if (user?.role === "MENTOR") return "/mentor/dashboard";
    if (user?.role === "TRUSTEE" || user?.role === "VOLUNTEER" || user?.role === "ADVISOR") return "/trustee/dashboard";
    return "/student/dashboard";
  };

  return (
    <section id="home" className={styles.hero}>
      <div className={styles.container}>
        <div className={styles.left}>
          <div className={styles.badge}>
            <span className={styles.badgeIcon}>✨</span>
            Next-Gen Learning Platform
          </div>

          <h1 className={styles.title}>
            Learn. Build.<br/>
            Get <span className={styles.highlight}>Career-Ready.</span>
          </h1>

          <p className={styles.description}>
            Learn practical skills through live training, hands-on projects, expert guidance, and real-world opportunities — all in one learning platform.
          </p>

          <div className={styles.actionGroup}>
            {isAuthenticated ? (
              <Link to={getDashboardPath()} className={styles.primaryBtn}>
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link to="/#programs" className={styles.primaryBtn}>
                  Explore Programs →
                </Link>
                <Link to="/signup" className={styles.secondaryBtn}>
                  Join SURE ProEd
                </Link>
              </>
            )}
          </div>

          <div className={styles.credibilityRow}>
            <div className={styles.credItem}>
              <div className={styles.credIcon}><FaUserTie /></div>
              <div className={styles.credText}>
                <strong>Industry Experts</strong>
                <span>Learn from Professionals</span>
              </div>
            </div>
            
            <div className={styles.credItem}>
              <div className={styles.credIcon}><FaLaptopCode /></div>
              <div className={styles.credText}>
                <strong>Hands-on Projects</strong>
                <span>Build Real Skills</span>
              </div>
            </div>
            
            <div className={styles.credItem}>
              <div className={styles.credIcon}><FaBriefcase /></div>
              <div className={styles.credText}>
                <strong>Career Focused</strong>
                <span>From Learning to Opportunities</span>
              </div>
            </div>
          </div>
          
          <div className={styles.heroArrowLeft}>
            <span>Skills today,<br/>A brighter<br/>tomorrow !</span>
            <svg viewBox="0 0 100 100" className={styles.svgArrowLeft}>
              <path d="M10,20 Q30,80 80,90" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M70,80 L82,90 L70,100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <div className={styles.right}>
          <HeroProductShowcase cohorts={cohorts} courses={courses} loading={loading} />
        </div>
      </div>
      
      {/* Background ambient gradients */}
      <div className={styles.ambientGlow1}></div>
      <div className={styles.ambientGlow2}></div>
    </section>
  );
}

export default Hero;