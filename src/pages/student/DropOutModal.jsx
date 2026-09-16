import React, { useState } from 'react';
import { FiAlertTriangle, FiX, FiCheckCircle } from 'react-icons/fi';
import apiClient from '../../services/apiClient';
import styles from './DropOutModal.module.css';

function DropOutModal({ applicationId, onClose, onSuccess }) {
    const [step, setStep] = useState(1); // 1: Warn/Send OTP, 2: Verify OTP
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [otp, setOtp] = useState('');
    const [reason, setReason] = useState('');

    const handleSendOtp = async () => {
        setLoading(true);
        setError('');
        try {
            await apiClient.post(`/api/applications/${applicationId}/send-discontinue-otp/`);
            setStep(2);
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.detail || "Failed to send OTP.");
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyAndDropOut = async (e) => {
        e.preventDefault();
        if (otp.length !== 6) {
            setError("Please enter a valid 6-digit OTP.");
            return;
        }

        setLoading(true);
        setError('');
        try {
            await apiClient.post(`/api/applications/${applicationId}/discontinue/`, {
                otp,
                reason: reason.trim() || "Student discontinued the course via verified OTP."
            });
            onSuccess();
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.detail || "Verification failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                    <FiX size={24} />
                </button>

                {step === 1 && (
                    <div className={styles.stepContainer}>
                        <div className={styles.warningIcon}>
                            <FiAlertTriangle size={48} color="#ef4444" />
                        </div>
                        <h2>Drop Out of Course</h2>
                        <p className={styles.warningText}>
                            Are you sure you want to drop out of your current course? This action is <strong>irreversible</strong>. 
                            You will lose access to your current cohort, scheduled classes, and all progress.
                        </p>
                        
                        {error && <div className={styles.errorBox}>{error}</div>}

                        <div className={styles.actionButtons}>
                            <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>
                                Cancel
                            </button>
                            <button className={styles.dangerBtn} onClick={handleSendOtp} disabled={loading}>
                                {loading ? "Sending Code..." : "Yes, Send Verification Code"}
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <form onSubmit={handleVerifyAndDropOut} className={styles.stepContainer}>
                        <div className={styles.warningIcon}>
                            <FiCheckCircle size={48} color="#10b981" />
                        </div>
                        <h2>Verify Drop Out</h2>
                        <p className={styles.instructionText}>
                            We've sent a 6-digit verification code to your email. Enter it below to confirm your drop out.
                        </p>

                        {error && <div className={styles.errorBox}>{error}</div>}

                        <div className={styles.inputGroup}>
                            <label htmlFor="dropoutOtp">6-Digit Verification Code</label>
                            <input
                                id="dropoutOtp"
                                type="text"
                                maxLength={6}
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                placeholder="000000"
                                required
                            />
                        </div>

                        <div className={styles.inputGroup}>
                            <label htmlFor="dropoutReason">Reason for Dropping Out (Optional)</label>
                            <textarea
                                id="dropoutReason"
                                rows="3"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="E.g., Time constraints, pursuing other opportunities..."
                            />
                        </div>

                        <div className={styles.actionButtons}>
                            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={loading}>
                                Cancel
                            </button>
                            <button type="submit" className={styles.dangerBtn} disabled={loading || otp.length !== 6}>
                                {loading ? "Verifying..." : "Confirm Drop Out"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

export default DropOutModal;
