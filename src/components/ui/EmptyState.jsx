import React from "react";
import { motion } from "framer-motion";
import styles from "./EmptyState.module.css";

const EmptyState = ({ title, description, icon, action }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={styles.container}
    >
      {icon && <div className={styles.iconWrapper}>{icon}</div>}
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.actionWrapper}>{action}</div>}
    </motion.div>
  );
};

export default EmptyState;
