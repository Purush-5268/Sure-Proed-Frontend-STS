import { Link } from "react-router-dom";
import styles from "./Hero.module.css";
import heroImage from "../../assets/images/hero.svg";

function Hero() {
  return (
    <section id="home" className={styles.hero}>
      <div className={styles.container}>
        <div className={styles.left}>
          <div className={styles.badge}>
            <span className={styles.badgeDot}></span>
            Next-Gen Learning Platform
          </div>
          
          <h1 className={styles.title}>
            Master Your Future With <span className={styles.highlight}>SURE ProEd</span>
          </h1>

          <p className={styles.description}>
            Manage your learning journey, live sessions, assignments, and secure your
            future with the SURE TRUST advanced learning management platform.
          </p>

          <div className={styles.actionGroup}>
            <Link to="/signup" className={styles.primaryBtn}>
              Get Started Now
            </Link>
            <Link to="/login" className={styles.secondaryBtn}>
              Sign In to Dashboard
            </Link>
          </div>

          <div className={styles.statsRow}>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>SURE TRUST</span>
              <span className={styles.statLabel}>Excellence in Education</span>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.statItem}>
              <span className={styles.statNumber}>Unified</span>
              <span className={styles.statLabel}>Learning Management</span>
            </div>
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.imageWrapper}>
            <div className={styles.blob}></div>
            <img
              src={heroImage}
              alt="SURE ProEd Platform"
              className={styles.heroImage}
            />
            
            {/* Glassmorphic floating elements */}
            <div className={`${styles.glassCard} ${styles.float1}`}>
              <div className={styles.glassIcon}>🎓</div>
              <div>
                <h4>Interactive Learning</h4>
                <p>Track your progress</p>
              </div>
            </div>
            
            <div className={`${styles.glassCard} ${styles.float2}`}>
              <div className={styles.glassIcon}>📊</div>
              <div>
                <h4>Live Analytics</h4>
                <p>Real-time updates</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;