import { useEffect, useState } from "react";
import { requestService } from "../../services/requestService";
import styles from "./RequestsSupport.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import { FiRefreshCw, FiInbox, FiAlertCircle, FiCheckCircle, FiXCircle, FiClock, FiFilter, FiBriefcase } from "react-icons/fi";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import AdminPlacements from "./AdminPlacements";

/**
 * Admin Requests & Support page.
 * Fetches from real backend: GET /api/requests/
 * Admin actions: POST /api/requests/{id}/update-status/ with {new_status, admin_remarks}
 *
 * Valid status transitions per backend:
 *   PENDING → IN_PROGRESS, RESOLVED, REJECTED
 *   IN_PROGRESS → RESOLVED, REJECTED
 *   RESOLVED/REJECTED → CLOSED
 */

const STATUS_COLORS = {
  PENDING: { bg: '#fef3c7', color: '#d97706', border: '#f59e0b' },
  IN_PROGRESS: { bg: '#eff6ff', color: '#1d4ed8', border: '#3b82f6' },
  RESOLVED: { bg: '#f0fdf4', color: '#15803d', border: '#22c55e' },
  REJECTED: { bg: '#fef2f2', color: '#b91c1c', border: '#ef4444' },
  CLOSED: { bg: '#f8fafc', color: '#64748b', border: '#94a3b8' },
};

const ALLOWED_TRANSITIONS = {
  PENDING: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  CLOSED: [],
};

const CATEGORY_LABELS = {
  OFFER_LETTER: '📄 Offer Letter',
  PERMISSION: '🔐 Permission',
  ATTENDANCE: '📋 Attendance',
  QUERY: '💬 Student Query',
  OTHER: '📌 Other',
  PLACEMENTS: '💼 Placements',
};

const TABS = ['ALL', 'OFFER_LETTER', 'PERMISSION', 'ATTENDANCE', 'QUERY', 'PLACEMENTS', 'OTHER'];

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.CLOSED;
  return (
    <span style={{
      padding: '3px 10px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '700',
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      letterSpacing: '0.5px',
    }}>
      {status}
    </span>
  );
}

function RequestCard({ req, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const allowed = ALLOWED_TRANSITIONS[req.status] || [];

  const handleAction = async (newStatus) => {
    const remarks = newStatus === 'RESOLVED' || newStatus === 'REJECTED' || newStatus === 'CLOSED'
      ? window.prompt(`Enter remarks for "${newStatus}" (optional):`) ?? ""
      : "";
    setSubmitting(true);
    try {
      const updated = await requestService.updateRequestStatus(req.id, newStatus, remarks);
      onAction(req.id, updated);
    } catch (err) {
      const msg = err.response?.data?.new_status?.[0] || err.response?.data?.error || `Failed to transition to ${newStatus}.`;
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueOfferLetter = async () => {
    if (!req.related_application) {
      alert("Cannot issue offer letter: No related application found.");
      return;
    }
    setSubmitting(true);
    try {
      // Direct call to generate offer letter backend
      await apiClient.post(API_ENDPOINTS.APPLICATIONS.GENERATE_OFFER_LETTER(req.related_application));
      // Refresh request status explicitly, or transition it if backend doesn't automatically return the updated object
      const updated = await requestService.getRequests({ status: 'RESOLVED', category: 'OFFER_LETTER' }).then(res => res.find(r => r.id === req.id));
      if (updated) {
         onAction(req.id, updated);
      } else {
         onAction(req.id, { ...req, status: 'RESOLVED' });
      }
      alert("Offer letter issued successfully!");
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || "Failed to generate offer letter.";
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const senderLabel = req.sender_email || (req.sender?.email) || "Unknown";
  const categoryLabel = CATEGORY_LABELS[req.category] || req.category;
  const createdDate = req.created_at ? new Date(req.created_at).toLocaleString() : '';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderLeft: `4px solid ${STATUS_COLORS[req.status]?.border || '#94a3b8'}`,
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '10px',
      transition: 'box-shadow 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px' }}>
              {req.subject || 'No subject'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-nested)', padding: '2px 6px', borderRadius: '4px' }}>
              {req.request_number || req.id?.slice(0, 8)}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span>👤 {senderLabel}</span>
            <span>{categoryLabel}</span>
            <span><FiClock size={12} style={{ verticalAlign: 'middle' }} /> {createdDate}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StatusBadge status={req.status} />
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px' }}
          >
            {expanded ? 'Less' : 'Details'}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
          {req.description && (
            <div style={{ background: 'var(--bg-nested)', padding: '10px 14px', borderRadius: '8px', fontSize: '14px', color: 'var(--text-primary)', marginBottom: '10px' }}>
              <strong>Description:</strong>
              <p style={{ margin: '6px 0 0 0', lineHeight: 1.6 }}>{req.description}</p>
            </div>
          )}

          {req.admin_remarks && (
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', color: 'var(--primary-color)', marginBottom: '10px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <strong>Admin Remarks:</strong> {req.admin_remarks}
            </div>
          )}

          {req.resolved_at && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Resolved at: {new Date(req.resolved_at).toLocaleString()}
              {req.resolved_by && ` by ${req.resolved_by}`}
            </div>
          )}

          {allowed.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {allowed.map(newStatus => (
                <button
                  key={newStatus}
                  disabled={submitting}
                  onClick={() => handleAction(newStatus)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                    background: newStatus === 'RESOLVED' ? '#10b981' : (newStatus === 'REJECTED' ? '#ef4444' : 'var(--primary-color)'),
                    color: 'white',
                    opacity: submitting ? 0.6 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {submitting ? '...' : `→ ${newStatus}`}
                </button>
              ))}

              {req.category === 'OFFER_LETTER' && req.status !== 'RESOLVED' && req.status !== 'CLOSED' && req.status !== 'REJECTED' && (
                <button
                  disabled={submitting}
                  onClick={handleIssueOfferLetter}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                    background: '#2563eb',
                    color: 'white',
                    opacity: submitting ? 0.6 : 1,
                    transition: 'opacity 0.2s',
                    marginLeft: '8px'
                  }}
                >
                  {submitting ? '...' : '📄 Issue Offer Letter'}
                </button>
              )}
            </div>
          )}
          {allowed.length === 0 && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Terminal state — no further actions available.</span>
          )}
        </div>
      )}
    </div>
  );
}

function RequestsSupport() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    const params = {};
    if (activeTab !== 'ALL') params.category = activeTab;
    if (statusFilter) params.status = statusFilter;

    requestService.getRequests(params)
      .then(data => { if (isMounted) setRequests(data); })
      .catch(err => console.error("Failed to load requests:", err))
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, [activeTab, statusFilter, refreshKey]);

  const handleAction = (requestId, updated) => {
    setRequests(prev => prev.map(r => r.id === requestId ? updated : r));
  };

  const pending = requests.filter(r => r.status === 'PENDING').length;

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FiInbox size={24} color="var(--primary-color)" />
            Requests &amp; Support
          </h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
            Manage all student requests — offer letters, permissions, attendance queries, and support tickets.
            {pending > 0 && <span style={{ marginLeft: '8px', background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold', fontSize: '12px' }}>{pending} pending</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer' }}
          >
            <option value="">All Statuses</option>
            {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <FiRefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', overflowX: 'auto', paddingBottom: '1px' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 14px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === tab ? '700' : '500',
              color: activeTab === tab ? 'var(--primary-color)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab ? '2px solid var(--primary-color)' : '2px solid transparent',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {tab === 'ALL' ? 'All' : (CATEGORY_LABELS[tab] || tab)}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'PLACEMENTS' ? (
        <AdminPlacements />
      ) : loading ? (
        <SkeletonLoader variant="table" rows={5} />
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <FiInbox size={48} style={{ opacity: 0.4, marginBottom: '12px' }} />
          <p style={{ margin: 0, fontSize: '16px' }}>No requests found</p>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', opacity: 0.7 }}>
            {statusFilter ? `No requests with status "${statusFilter}"` : 'No requests in this category yet.'}
          </p>
        </div>
      ) : (
        <div>
          {requests.map(req => (
            <RequestCard key={req.id} req={req} onAction={handleAction} />
          ))}
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>
            Showing {requests.length} request{requests.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

export default RequestsSupport;
