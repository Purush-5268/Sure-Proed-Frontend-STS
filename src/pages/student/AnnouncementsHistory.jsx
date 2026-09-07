import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiCheckCircle, FiArrowLeft, FiPaperclip, FiExternalLink } from 'react-icons/fi';
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';

const READ_KEY = 'sp_announcements_read';

function getReadIds() {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) || '[]');
  } catch { return []; }
}

function markIdRead(id) {
  const ids = new Set(getReadIds());
  ids.add(id);
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
}

function markAllIdsRead(ids) {
  const existing = new Set(getReadIds());
  ids.forEach(id => existing.add(id));
  localStorage.setItem(READ_KEY, JSON.stringify([...existing]));
}

export default function AnnouncementsHistory() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState(new Set(getReadIds()));
  const navigate = useNavigate();

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(API_ENDPOINTS.ANNOUNCEMENTS.BASE);
      const data = res.data?.results || res.data || [];
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch announcements:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleMarkRead = (id) => {
    markIdRead(id);
    setReadIds(new Set(getReadIds()));
  };

  const handleMarkAllRead = () => {
    markAllIdsRead(announcements.map(a => a.id));
    setReadIds(new Set(getReadIds()));
  };

  const unreadCount = announcements.filter(a => !readIds.has(a.id)).length;

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '24px', fontSize: '14px', fontWeight: '600' }}>
        <FiArrowLeft /> Back to Dashboard
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FiBell color="var(--primary-color)" /> Announcements
          {unreadCount > 0 && (
            <span style={{ fontSize: '13px', background: 'var(--primary-color)', color: '#fff', padding: '2px 10px', borderRadius: '12px', fontWeight: 'bold' }}>
              {unreadCount} unread
            </span>
          )}
        </h1>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
            <FiCheckCircle /> Mark All Read
          </button>
        )}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading announcements...</div>
        ) : announcements.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <FiBell size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p>No announcements yet.</p>
          </div>
        ) : (
          announcements.map((a) => {
            const isRead = readIds.has(a.id);
            return (
              <div
                key={a.id}
                onClick={() => handleMarkRead(a.id)}
                style={{
                  padding: '20px 24px',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  gap: '16px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  background: isRead ? 'transparent' : 'rgba(168, 85, 247, 0.04)',
                }}
              >
                {/* Unread dot */}
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: isRead ? 'var(--text-muted)' : 'var(--primary-color)',
                  marginTop: '6px', flexShrink: 0,
                  opacity: isRead ? 0.3 : 1,
                  boxShadow: isRead ? 'none' : '0 0 6px rgba(168, 85, 247, 0.5)',
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)', fontWeight: isRead ? '500' : '700' }}>
                      {a.title}
                    </h3>
                    {a.is_pinned && (
                      <span style={{ fontSize: '11px', background: '#f59e0b', color: '#fff', padding: '1px 8px', borderRadius: '6px', fontWeight: 'bold' }}>PINNED</span>
                    )}
                  </div>

                  {a.message && (
                    <p style={{ margin: '8px 0 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                      {a.message}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {a.created_at ? new Date(a.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently'}
                    </span>

                    {a.attachment && (
                      <a href={a.attachment} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                        style={{ fontSize: '12px', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                        <FiPaperclip size={12} /> Attachment
                      </a>
                    )}

                    {a.link_url && (
                      <a href={a.link_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                        style={{ fontSize: '12px', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                        <FiExternalLink size={12} /> Link
                      </a>
                    )}

                    {a.target_audience && a.target_audience !== 'ALL' && (
                      <span style={{ fontSize: '11px', background: 'var(--bg-nested)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '6px' }}>
                        {a.target_audience}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
