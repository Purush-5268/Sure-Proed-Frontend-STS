import React from 'react';
import { motion } from 'framer-motion';

export const fadeUpVariant = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 80, damping: 20 } }
};

export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
};

const ScrollReveal = ({ children, variant = fadeUpVariant, delay = 0, threshold = 0.2, className = "" }) => {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: threshold }}
      variants={variant}
      style={{ width: '100%' }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default ScrollReveal;
