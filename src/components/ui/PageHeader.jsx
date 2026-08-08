import React from "react";
import { motion } from "framer-motion";
import styles from "./PageHeader.module.css";

const PageHeader = ({ title, description, actions, children }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={styles.headerContainer}
    >
      <div className={styles.headerMain}>
        <div className={styles.titleSection}>
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions && (
          <div className={styles.actionsSection}>
            {actions}
          </div>
        )}
      </div>
      {children && <div className={styles.headerContent}>{children}</div>}
    </motion.div>
  );
};

export default PageHeader;
