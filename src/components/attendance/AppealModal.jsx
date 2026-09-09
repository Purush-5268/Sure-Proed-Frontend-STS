import React, { useState } from "react";
import { FiX, FiAlertCircle } from "react-icons/fi";
import styles from "./AppealModal.module.css";

/**
 * Reusable Appeal Modal for students to submit appeals/apologies
 * 
 * Props:
 *   isOpen: boolean - Controls modal visibility
 *   onClose: function - Called when modal is closed
 *   onSubmit: function - Called when form is submitted with { reason: string }
 *   title: string - Modal title (default: "Submit Attendance Appeal")
 *   placeholder: string - Textarea placeholder
 *   isLoading: boolean - Shows loading state on submit button
 *   error: string - Error message to display
 *   successMessage: string - Success message to display
 */

function AppealModal({
  isOpen = false,
  onClose = () => {},
  onSubmit = () => {},
  title = "Submit Attendance Appeal",
  placeholder = "Explain your absence or circumstances...",
  isLoading = false,
  error = null,
  successMessage = null,
}) {
  const [reason, setReason] = useState("");
  const [charCount, setCharCount] = useState(0);
  const maxChars = 500;

  if (!isOpen) return null;

  const handleReasonChange = (e) => {
    const value = e.target.value;
    if (value.length <= maxChars) {
      setReason(value);
      setCharCount(value.length);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert("Please provide a reason for your appeal.");
      return;
    }
    onSubmit({ reason: reason.trim() });
  };

  const handleClose = () => {
    if (!isLoading) {
      setReason("");
      setCharCount(0);
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={styles.backdrop}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="appeal-modal-title">
        <div className={styles.modalContent}>
          {/* Header */}
          <div className={styles.header}>
            <h2 id="appeal-modal-title" className={styles.title}>{title}</h2>
            <button
              className={styles.closeBtn}
              onClick={handleClose}
              disabled={isLoading}
              aria-label="Close modal"
            >
              <FiX size={24} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Error Message */}
            {error && (
              <div className={styles.alertBox} style={{ borderColor: "var(--status-error, #ef4444)" }}>
                <FiAlertCircle style={{ color: "var(--status-error, #ef4444)" }} />
                <span>{error}</span>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className={styles.alertBox} style={{ borderColor: "var(--status-success, #10b981)" }}>
                <span style={{ color: "var(--status-success, #10b981)" }}>✓</span>
                <span>{successMessage}</span>
              </div>
            )}

            {/* Textarea */}
            <div className={styles.formGroup}>
              <label htmlFor="appeal-reason" className={styles.label}>
                Your Appeal
              </label>
              <textarea
                id="appeal-reason"
                className={styles.textarea}
                value={reason}
                onChange={handleReasonChange}
                placeholder={placeholder}
                maxLength={maxChars}
                disabled={isLoading || !!successMessage}
                rows={6}
              />
              <div className={styles.charCount}>
                {charCount} / {maxChars} characters
              </div>
            </div>

            {/* Buttons */}
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={isLoading || !reason.trim() || !!successMessage}
              >
                {isLoading ? "Submitting..." : "Submit Appeal"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default AppealModal;
