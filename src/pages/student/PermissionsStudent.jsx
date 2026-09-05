import React, { useState, useEffect } from "react";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./PermissionsStudent.module.css";
import PermissionChatModal from "../../components/chat/PermissionChatModal";

function PermissionsStudent() {
  const [warnings, setWarnings] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedWarningId, setSelectedWarningId] = useState(null);
  const [apologyInputs, setApologyInputs] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [warnRes, appRes] = await Promise.all([
        apiClient.get(API_ENDPOINTS.ATTENDANCE.WARNINGS),
        apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE)
      ]);
      // Safely handle DRF paginated responses
      const rawWarnings = warnRes.data?.results ?? warnRes.data ?? [];
      const safeWarnings = Array.isArray(rawWarnings) ? rawWarnings : [];
      
      const rawApps = appRes.data?.results ?? appRes.data ?? [];
      const safeApps = Array.isArray(rawApps) ? rawApps : [];

      setWarnings(safeWarnings);
      setApplications(safeApps);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApologyChange = (id, text) => {
    setApologyInputs(prev => ({ ...prev, [id]: text }));
  };

  const submitApology = async (warningId) => {
    const text = apologyInputs[warningId];
    if (!text?.trim()) return;

    try {
      await apiClient.post(API_ENDPOINTS.ATTENDANCE.RESOLVE_WARNING, {
        warning_id: warningId,
        apology_text: text
      });
      alert("Apology submitted. Awaiting Admin review.");
      fetchData();
    } catch (err) {
      alert("Failed to submit apology.");
    }
  };

  const isRestricted = (applications || []).some(app => app?.is_restricted);

  if (loading) return <div className={styles.container}>Loading permissions...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Permission Requests & Alerts</h1>
        <p>Review and resolve attendance warnings or permission issues.</p>
      </div>

      {isRestricted && (
        <div className={styles.restrictedAlert}>
          <h2>ACCOUNT RESTRICTED</h2>
          <p>Your access to live classes and cohort resources has been revoked due to low attendance or unpaid fees. Please resolve the pending warnings below or contact support.</p>
        </div>
      )}

      <div className={styles.permissionsList}>
        {(warnings || []).length === 0 ? (
          <p className={styles.emptyState}>You have no pending warnings.</p>
        ) : (
          (warnings || []).map(w => (
            <div key={w.id} className={styles.permissionCard}>
              <div className={styles.permissionInfo}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <h3>Low Attendance Warning</h3>
                  <span className={styles[w.status?.toLowerCase()] || styles.pending}>{w.status}</span>
                </div>
                <p><strong>Session:</strong> {w.session_title}</p>
                <p><strong>Date:</strong> {w.class_date}</p>
                
                {w.apology_text ? (
                  <div className={styles.submittedApology}>
                    <strong>Your Apology:</strong>
                    <p>{w.apology_text}</p>
                  </div>
                ) : (
                  <div className={styles.apologyForm}>
                    <textarea 
                      placeholder="Type your explanation/apology here..."
                      value={apologyInputs[w.id] || ""}
                      onChange={(e) => handleApologyChange(w.id, e.target.value)}
                    ></textarea>
                    <button onClick={() => submitApology(w.id)} className={styles.submitBtn}>
                      Submit Explanation
                    </button>
                  </div>
                )}
              </div>
              <div className={styles.cardActions}>
                <button 
                  className={styles.chatBtn} 
                  onClick={() => setSelectedWarningId(w.id)}
                >
                  Message Admin
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedWarningId && (
        <PermissionChatModal 
          warningId={selectedWarningId} 
          onClose={() => setSelectedWarningId(null)} 
        />
      )}
    </div>
  );
}

export default PermissionsStudent;
