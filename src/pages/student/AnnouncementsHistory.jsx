import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiTrash2, FiArrowLeft } from 'react-icons/fi';
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import styles from './Dashboard.module.css'; // Reuse some styles or create new

export default function AnnouncementsHistory() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      // Assuming notifications endpoint for announcements
      const res = await apiClient.get(API_ENDPOINTS.NOTIFICATIONS.BASE);
      setAnnouncements(res.data?.results || res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleClearAll = async () => {
    if (window.confirm("Are you sure you want to clear all announcements?")) {
      try {
        // Optimistically clear UI
        const previous = [...announcements];
        setAnnouncements([]);
        
        // Attempt to delete from backend one-by-one since there's no bulk endpoint
        for (const a of previous) {
          try {
            await apiClient.delete(`${API_ENDPOINTS.NOTIFICATIONS.BASE}${a.id}/`);
          } catch (e) {
            console.error(`Failed to delete announcement ${a.id}`, e);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '24px', fontSize: '14px', fontWeight: '600' }}>
        <FiArrowLeft /> Back to Dashboard
      </button>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiBell color="var(--primary-color)" /> Announcements History
        </h1>
        {announcements.length > 0 && (
          <button onClick={handleClearAll} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            <FiTrash2 /> Clear All
          </button>
        )}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading announcements...</div>
        ) : announcements.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <FiBell size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p>No announcements found.</p>
          </div>
        ) : (
          announcements.map((a, idx) => (
            <div key={idx} style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '16px', transition: 'background 0.2s' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: a.is_read ? 'var(--text-muted)' : '#10b981', marginTop: '6px', flexShrink: 0 }}></div>
              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: 'var(--text-primary)' }}>{a.title || a.message}</h3>
                {a.description && <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{a.description}</p>}
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{a.created_at ? new Date(a.created_at).toLocaleString() : 'Recently'}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
