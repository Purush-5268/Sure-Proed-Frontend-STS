import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiAlertTriangle } from 'react-icons/fi';
import styles from './WarningModal.module.css';

const WarningModal = ({ isOpen, message, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className={styles.overlay}>
          <motion.div
            className={styles.modalContent}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <div className={styles.iconContainer}>
              <FiAlertTriangle className={styles.warningIcon} />
            </div>
            
            <h3 className={styles.title}>Action Required</h3>
            <p className={styles.message}>{message}</p>
            
            <div className={styles.actions}>
              <button className={styles.primaryButton} onClick={onClose}>
                Understood
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default WarningModal;
