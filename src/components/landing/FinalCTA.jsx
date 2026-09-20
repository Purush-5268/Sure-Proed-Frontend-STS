import React from 'react';
import { Link } from 'react-router-dom';
import styles from './FinalCTA.module.css';

const FinalCTA = () => {
  return (
    <section className={styles.section}>
      {/* Background Image / Overlay */}
      <div className={styles.backgroundWrapper}>
        <img 
          src="https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=80" 
          alt="Starry mountain landscape" 
          className={styles.bgImage} 
        />
        <div className={styles.overlay}></div>
      </div>

      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.badge}>
            <span className={styles.lockIcon}>★</span> YOUR FUTURE STARTS HERE
          </div>
          <h2 className={styles.title}>Ready to build your future?</h2>
          <p className={styles.subtitle}>
            Join thousands of learners who are already building their careers with SURE ProEd.
          </p>
          <div className={styles.actionGroup}>
            <Link to="/signup" className={styles.primaryBtn}>
              Join Now
            </Link>
            <Link to="/student/courses" className={styles.secondaryBtn}>
              Explore Programs
            </Link>
          </div>
        </div>
        
        <div className={styles.visualSection}>
            <div className={styles.handwrittenText}>
                <span className={styles.hwText1}>Skills</span>
                <span className={styles.hwText2}>Projects</span>
                <span className={styles.hwText3}>Certificates</span>
                <span className={styles.hwText4}>Career Growth</span>
            </div>
            
            <div className={styles.logoSignatureGroup}>
              <svg viewBox="0 0 100 100" className={styles.curvedArrow}>
                <path d="M10,20 Q40,60 80,80" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <path d="M65,85 L85,82 L75,65" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <img src="/sure-logo.jpg" alt="SURE ProEd" className={styles.floatingLogo} />
              <div className={styles.shiningLine}></div>
              <div className={styles.heroSignature}>SURE ProEd</div>
            </div>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;