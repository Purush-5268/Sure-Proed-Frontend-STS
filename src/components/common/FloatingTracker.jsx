import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAttendanceTracker } from '../../services/useAttendanceTracker';
import { FiClock, FiActivity, FiAlertCircle } from 'react-icons/fi';
import styles from './FloatingTracker.module.css';

const FloatingTracker = () => {
  const { isTracking, stopTracking, error } = useAttendanceTracker();

  return (
    <AnimatePresence>
      {isTracking && (
        <motion.div
          className={styles.trackerContainer}
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <div className={styles.trackerContent}>
            <div className={styles.pulseIndicator}>
              <FiActivity className={error ? styles.errorIcon : styles.activeIcon} />
              <div className={error ? styles.pulseRingError : styles.pulseRing} />
            </div>
            
            <div className={styles.trackerText}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Live Session Active
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: error ? '#dc2626' : 'var(--text-secondary)' }}>
                {error || "Attendance is being tracked"}
              </p>
            </div>

            <button 
              className={styles.stopButton} 
              onClick={stopTracking}
              title="Leave Session"
            >
              Leave
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FloatingTracker;
