import React from "react";
import { motion } from "framer-motion";
import styles from "./StatCard.module.css";
import Card from "./Card";

const StatCard = ({ title, value, icon, trend, trendLabel, delay = 0 }) => {
  return (
    <Card hoverable delay={delay} className={styles.statCard}>
      <div className={styles.header}>
        <h4 className={styles.title}>{title}</h4>
        {icon && <div className={styles.iconWrapper}>{icon}</div>}
      </div>
      <div className={styles.valueSection}>
        <span className={styles.value}>{value}</span>
        {trend && (
          <span className={`${styles.trend} ${trend > 0 ? styles.trendUp : styles.trendDown}`}>
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
        )}
      </div>
      {trendLabel && <p className={styles.trendLabel}>{trendLabel}</p>}
    </Card>
  );
};

export default StatCard;
