import React, { useState, useEffect } from "react";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./PermissionsAdmin.module.css";
import PermissionChatModal from "../../components/chat/PermissionChatModal";

function PermissionsAdmin() {
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarningId, setSelectedWarningId] = useState(null);

  useEffect(() => {
    fetchQueries();
  }, []);

  const fetchQueries = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(API_ENDPOINTS.ATTENDANCE.ADMIN_QUERIES);
      setQueries(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (warningId, action) => {
    try {
      await apiClient.post(API_ENDPOINTS.ATTENDANCE.ADMIN_UPDATE_QUERY, {
        warning_id: warningId,
        action: action // "ACCEPT" or "REJECT"
      });
      fetchQueries();
    } catch (err) {
      alert("Failed to update query status.");
    }
  };

  if (loading) return <div className={styles.container}>Loading permissions...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Permission Requests Inbox</h1>
      </div>

      <div className={styles.list}>
        {queries.length === 0 ? (
          <p>No permission requests found.</p>
        ) : (
          queries.map(q => (
            <div key={q.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>{q.student_name || "Unknown Student"}</h3>
                <span className={styles[q.status.toLowerCase()]}>{q.status}</span>
              </div>
              <div className={styles.cardBody}>
                <p><strong>Session:</strong> {q.session_title}</p>
                <p><strong>Apology:</strong> {q.apology_text || "No formal apology submitted yet."}</p>
              </div>
              <div className={styles.cardActions}>
                <button 
                  className={styles.chatBtn} 
                  onClick={() => setSelectedWarningId(q.id)}
                >
                  Open Chat
                </button>
                {q.status !== 'ACCEPTED' && q.status !== 'REJECTED' && (
                  <>
                    <button className={styles.acceptBtn} onClick={() => handleAction(q.id, 'ACCEPT')}>Accept</button>
                    <button className={styles.rejectBtn} onClick={() => handleAction(q.id, 'REJECT')}>Reject</button>
                  </>
                )}
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

export default PermissionsAdmin;
