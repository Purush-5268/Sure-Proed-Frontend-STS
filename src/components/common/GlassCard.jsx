import React from 'react';
import { motion } from 'framer-motion';

const GlassCard = ({ children, className = '', hoverable = false, delay = 0, ...props }) => {
  const hoverStyles = hoverable ? 'premium-card-hoverable' : '';
  
  return (
    <motion.div
      className={`premium-glass-card ${hoverStyles} ${className}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ 
        duration: 0.35, 
        ease: [0.25, 0.1, 0.25, 1],
        delay: delay
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default GlassCard;
