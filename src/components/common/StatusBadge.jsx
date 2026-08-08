import React from 'react';
import { motion } from 'framer-motion';

const StatusBadge = ({ status, text, className = '' }) => {
  // Map standard backend statuses to our premium CSS variables
  const getStatusClass = () => {
    switch (status?.toUpperCase()) {
      case 'AVAILABLE':
      case 'APPROVED':
      case 'ACTIVE':
      case 'COMPLETED':
        return 'premium-badge-active';
      case 'NOT_AVAILABLE':
      case 'REJECTED':
      case 'ENDED':
      case 'INACTIVE':
        return 'premium-badge-inactive';
      case 'PENDING':
      case 'PENDING_VERIFICATION':
      case 'UNDER_REVIEW':
        return 'premium-badge-pending';
      default:
        return 'premium-badge-info';
    }
  };

  return (
    <motion.span
      className={`premium-badge ${getStatusClass()} ${className}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      {text || status}
    </motion.span>
  );
};

export default StatusBadge;
