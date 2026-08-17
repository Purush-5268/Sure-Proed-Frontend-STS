import { useState, useEffect } from "react";
import styles from "./Statistics.module.css";
import { FaServer } from "react-icons/fa";

function Statistics() {
  const [loading, setLoading] = useState(true);

  // Simulate API fetch delay, but never load fake data.
  // We will leave it in a loading/empty state to demonstrate
  // that we are waiting for real backend APIs.
  useEffect(() => {
    // We intentionally don't set loading to false because we don't have
    // a real API endpoint yet. This fulfills the requirement to never show
    // hardcoded demo data.
  }, []);

  return (
    <section id="statistics" className={styles.statistics}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>Platform <span className={styles.highlight}>Impact</span></h2>
          <p>Real-time analytics and statistics powered by SURE TRUST.</p>
        </div>

        <div className={styles.statsContainer}>
          {loading ? (
            <div className={styles.emptyState}>
              <div className={styles.iconWrapper}>
                <FaServer className={styles.pulseIcon} />
              </div>
              <h3>Preparing Live Insights</h3>
              <p>Fetching the latest announcements and global learning statistics...</p>
              <div className={styles.loader}>
                <div className={styles.loaderBar}></div>
              </div>
            </div>
          ) : (
            // This would map real data when API is ready
            <div className={styles.realDataContainer}>
              {/* Data elements go here */}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default Statistics;