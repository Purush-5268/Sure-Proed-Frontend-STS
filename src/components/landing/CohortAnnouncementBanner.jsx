import React, { useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import styles from './CohortAnnouncementBanner.module.css';

const LeftAccent = () => (
  <svg width="24" height="40" viewBox="0 0 24 40" fill="none" className={styles.sparkleLeft}>
    <path d="M18 6 C8 14 8 26 18 34" stroke="#a855f7" strokeWidth="2.5" strokeDasharray="3 5" strokeLinecap="round" opacity="0.6"/>
  </svg>
);

const RightAccent = () => (
  <svg width="24" height="40" viewBox="0 0 24 40" fill="none" className={styles.sparkleRight}>
    <path d="M6 6 C16 14 16 26 6 34" stroke="#a855f7" strokeWidth="2.5" strokeDasharray="3 5" strokeLinecap="round" opacity="0.6"/>
  </svg>
);

const CohortAnnouncementBanner = () => {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  const handleScroll = () => {
    const section = document.getElementById('open-cohorts');
    if (section) {
      // standard offset for fixed navbar
      const yOffset = -80; 
      const y = section.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return (
    <div className={styles.bannerContainer}>
      <div className={styles.bannerContent}>
        <div className={styles.leftSection}>
          <span className={styles.emojiIcon} role="img" aria-label="megaphone">📣</span>
          <span className={styles.primaryText}>New Cohorts Are Open!</span>
          <span className={styles.divider}>|</span>
          <span className={styles.secondaryText}>Start your next learning journey with SURE ProEd.</span>
        </div>
        <div className={styles.rightSection}>
          <div className={styles.buttonWrapper}>
            <LeftAccent />
            <button onClick={handleScroll} className={styles.ctaButton}>
              View Open Cohorts &rarr;
            </button>
            <RightAccent />
          </div>
          <button onClick={() => setIsVisible(false)} className={styles.closeButton} aria-label="Dismiss">
            <FaTimes />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CohortAnnouncementBanner;
