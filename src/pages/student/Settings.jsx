// In imports, we need to add authService and other icons/hooks
import React, { useState, useEffect } from 'react';
import styles from './Settings.module.css';
import ThemeToggle from '../../components/common/ThemeToggle';
import { useAuth } from '../../context/AuthContext';
import { FiUser, FiLock, FiMonitor, FiCheckCircle } from 'react-icons/fi';
import { authService } from '../../services/authService';

function Settings() {
    const { user } = useAuth();
    const [activeSection, setActiveSection] = useState('account');
    
    // Security Section State
    const [pwdStep, setPwdStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    // Timer state for resend cooldown
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        let timer;
        if (cooldown > 0) {
            timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [cooldown]);

    const maskEmail = (email) => {
        if (!email) return '';
        const [name, domain] = email.split('@');
        if (name.length <= 2) return `${name[0]}***@${domain}`;
        return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}@${domain}`;
    };

    const handleSendOtp = async () => {
        if (!user?.email) return;
        setError('');
        setLoading(true);
        try {
            await authService.forgotPassword(user.email);
            setPwdStep(2);
            setCooldown(60); // 60 seconds cooldown
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to send OTP. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = (e) => {
        e.preventDefault();
        setError('');
        if (otp.length !== 6) {
            setError('Please enter a valid 6-digit OTP.');
            return;
        }
        // Since verification and reset happen in one API call, we just move to Step 3 here in the UI
        setPwdStep(3);
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');
        
        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters long.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            await authService.resetPasswordOtp(user.email, otp, newPassword);
            setPwdStep(4);
            setSuccessMsg("Password updated successfully.");
            
            // Reset state after 3 seconds
            setTimeout(() => {
                setPwdStep(1);
                setOtp('');
                setNewPassword('');
                setConfirmPassword('');
                setSuccessMsg('');
            }, 3000);
        } catch (err) {
            if (err.response?.data) {
                const data = err.response.data;
                const msg = data.detail || data.non_field_errors?.[0] || data.new_password?.[0] || data.otp?.[0] || "Failed to update password.";
                setError(msg);
            } else {
                setError("Failed to update password. Please check your network.");
            }
        } finally {
            setLoading(false);
        }
    };

    const renderContent = () => {
        switch (activeSection) {
            case 'account':
                return (
                    <div className={styles.settingsCard}>
                        <div className={styles.cardHeader}>
                            <h2>Profile Information</h2>
                        </div>
                        <p className={styles.description}>Your core student account details.</p>
                        <div className={styles.settingRow}>
                            <div className={styles.settingInfo}>
                                <h3>Email Address</h3>
                                <p>{user?.email || "student@example.com"}</p>
                            </div>
                            <span className={styles.badge}>Verified</span>
                        </div>
                        <div className={styles.settingRow}>
                            <div className={styles.settingInfo}>
                                <h3>Account Role</h3>
                                <p style={{ textTransform: 'capitalize' }}>{user?.role?.toLowerCase() || "Student"}</p>
                            </div>
                        </div>
                    </div>
                );
            case 'security':
                return (
                    <div className={styles.settingsCard}>
                        <div className={styles.cardHeader}>
                            <h2>Change Password</h2>
                        </div>
                        <p className={styles.description}>Keep your account secure by regularly updating your password.</p>
                        
                        {error && (
                            <div className={styles.errorBanner} style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(239, 68, 68, 0.3)', fontSize: '14px' }}>
                                {error}
                            </div>
                        )}

                        {pwdStep === 1 && (
                            <div className={styles.passwordForm}>
                                <div className={styles.settingInfo} style={{ gridColumn: "1 / -1", marginBottom: '12px' }}>
                                    <h3>Step 1 — Verify your email</h3>
                                    <p>We will send a secure verification code to <strong>{maskEmail(user?.email)}</strong>.</p>
                                </div>
                                <button type="button" onClick={handleSendOtp} disabled={loading} className={styles.saveBtn} style={{ opacity: loading ? 0.7 : 1 }}>
                                    {loading ? 'Sending OTP...' : 'Send Verification Code'}
                                </button>
                            </div>
                        )}

                        {pwdStep === 2 && (
                            <form onSubmit={handleVerifyOtp} className={styles.passwordForm}>
                                <div className={styles.settingInfo} style={{ gridColumn: "1 / -1" }}>
                                    <h3>Step 2 — Enter verification code</h3>
                                    <p>We sent a 6-digit code to your email.</p>
                                </div>
                                <div className={styles.inputGroup}>
                                    <label htmlFor="otpCode">6-Digit OTP</label>
                                    <input 
                                        id="otpCode" 
                                        type="text" 
                                        maxLength={6}
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                        placeholder="000000" 
                                        required
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', gridColumn: '1 / -1' }}>
                                    <button type="submit" disabled={otp.length !== 6 || loading} className={styles.saveBtn}>
                                        Verify OTP
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={handleSendOtp} 
                                        disabled={cooldown > 0 || loading} 
                                        style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', cursor: cooldown > 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '14px', opacity: cooldown > 0 ? 0.5 : 1 }}
                                    >
                                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {pwdStep === 3 && (
                            <form onSubmit={handleResetPassword} className={styles.passwordForm}>
                                <div className={styles.settingInfo} style={{ gridColumn: "1 / -1" }}>
                                    <h3>Step 3 — Create new password</h3>
                                    <p>Enter your new secure password.</p>
                                </div>
                                <div className={styles.inputGroup}>
                                    <label htmlFor="newPassword">New Password</label>
                                    <input 
                                        id="newPassword" 
                                        type="password" 
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Enter new password" 
                                        required 
                                        minLength={8}
                                    />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label htmlFor="confirmPassword">Confirm New Password</label>
                                    <input 
                                        id="confirmPassword" 
                                        type="password" 
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Confirm new password" 
                                        required 
                                        minLength={8}
                                    />
                                </div>
                                <button type="submit" disabled={loading} className={styles.saveBtn} style={{ gridColumn: '1 / -1' }}>
                                    {loading ? 'Updating...' : 'Update Password'}
                                </button>
                            </form>
                        )}

                        {pwdStep === 4 && (
                            <div className={styles.passwordForm}>
                                <div className={styles.settingInfo} style={{ gridColumn: "1 / -1", display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
                                        <FiCheckCircle size={24} />
                                        <h3 style={{ margin: 0, color: '#10b981' }}>{successMsg}</h3>
                                    </div>
                                    <p>Your password has been changed and your account is now secured with your new password.</p>
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 'appearance':
                return (
                    <div className={styles.settingsCard}>
                        <div className={styles.cardHeader}>
                            <h2>Appearance</h2>
                        </div>
                        <p className={styles.description}>Customize how the platform looks on your device.</p>
                        <div className={styles.settingRow}>
                            <div className={styles.settingInfo}>
                                <h3>Theme Preference</h3>
                                <p>Toggle between Light, Dark, or System default themes.</p>
                            </div>
                            <div className={styles.settingAction}>
                                <ThemeToggle />
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className={styles.settingsPage}>
            <header className={styles.header}>
                <h1>Settings</h1>
                <p>Manage your preferences, security, and learning experience.</p>
            </header>

            <div className={styles.layout}>
                <aside className={styles.sidebar}>
                    <nav className={styles.navMenu}>
                        <button 
                            className={`${styles.navItem} ${activeSection === 'account' ? styles.active : ''}`}
                            onClick={() => setActiveSection('account')}
                        >
                            <FiUser /> Account
                        </button>
                        <button 
                            className={`${styles.navItem} ${activeSection === 'security' ? styles.active : ''}`}
                            onClick={() => setActiveSection('security')}
                        >
                            <FiLock /> Security
                        </button>
                        <button 
                            className={`${styles.navItem} ${activeSection === 'appearance' ? styles.active : ''}`}
                            onClick={() => setActiveSection('appearance')}
                        >
                            <FiMonitor /> Appearance
                        </button>
                    </nav>
                </aside>
                <main className={styles.content}>
                    {renderContent()}
                </main>
            </div>
        </div>
    );
}

export default Settings;