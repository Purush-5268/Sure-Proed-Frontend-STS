import React from "react";
import { motion } from "framer-motion";
import styles from "./Card.module.css";

const Card = ({ children, className = "", delay = 0, hoverable = false, ...props }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={hoverable ? { y: -2, boxShadow: "var(--shadow-md)" } : {}}
      className={`${styles.card} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default Card;
