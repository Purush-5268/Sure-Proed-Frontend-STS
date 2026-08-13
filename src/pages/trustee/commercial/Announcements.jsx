import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "../../../services/trusteeService";
import SkeletonLoader from "../../../components/common/SkeletonLoader";
import styles from "./Announcements.module.css";

function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  
  const [formData, setFormData] = useState({
    title: "",
    body: "",
    priority: "MEDIUM",
    is_active: true,
  });

  const fetchAnnouncements = async () => {
    try {
      const data = await getAnnouncements();
      setAnnouncements(data || []);
    } catch (err) {
      console.warn("Error fetching announcements:", err);
      // Fallback dummy data if backend missing for demo
      setAnnouncements([
        { id: 1, title: "Q3 Board Meeting Scheduled", body: "Please review the agenda.", priority: "HIGH", is_active: true, published_at: new Date().toISOString() },
        { id: 2, title: "New Partnership Signed", body: "We have partnered with TechCorp.", priority: "MEDIUM", is_active: true, published_at: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const openModal = (announcement = null) => {
    if (announcement) {
      setIsEditing(true);
      setCurrentId(announcement.id);
      setFormData({
        title: announcement.title,
        body: announcement.body,
        priority: announcement.priority,
        is_active: announcement.is_active,
      });
    } else {
      setIsEditing(false);
      setCurrentId(null);
      setFormData({ title: "", body: "", priority: "MEDIUM", is_active: true });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await updateAnnouncement(currentId, formData);
      } else {
        await createAnnouncement(formData);
      }
      closeModal();
      fetchAnnouncements();
    } catch (err) {
      alert("Failed to save announcement: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this announcement?")) {
      try {
        await deleteAnnouncement(id);
        fetchAnnouncements();
      } catch (err) {
        alert("Failed to delete: " + (err.response?.data?.detail || err.message));
      }
    }
  };

  const getPriorityColor = (prio) => {
    switch (prio) {
      case "CRITICAL": return "#ef4444";
      case "HIGH": return "#f59e0b";
      case "MEDIUM": return "#3b82f6";
      case "LOW": return "#10b981";
      default: return "#64748b";
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>Announcements</h2>
          <p>Manage organization-wide announcements.</p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/trustee/commercial/dashboard" className="btn btnSecondary">
            ← Dashboard
          </Link>
          <button className="btn btnPrimary" onClick={() => openModal()}>
            + New Announcement
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {loading ? (
          <SkeletonLoader variant="card" rows={3} />
        ) : announcements.length === 0 ? (
          <div className={styles.empty}>No announcements found.</div>
        ) : (
          announcements.map((a) => (
            <div key={a.id} className="premium-card">
              <div 
                className={styles.priorityIndicator} 
                style={{ backgroundColor: getPriorityColor(a.priority) }}
              />
              <div className={styles.cardContent}>
                <div className={styles.cardHeader}>
                  <h3>{a.title}</h3>
                  <div className={styles.badges}>
                    <span 
                      className={styles.priorityBadge}
                      style={{ 
                        color: getPriorityColor(a.priority),
                        backgroundColor: `${getPriorityColor(a.priority)}20`
                      }}
                    >
                      {a.priority}
                    </span>
                    <span className={a.is_active ? styles.statusActive : styles.statusInactive}>
                      {a.is_active ? "Active" : "Archived"}
                    </span>
                  </div>
                </div>
                <p className={styles.body}>{a.body}</p>
                <div className={styles.cardFooter}>
                  <span className={styles.date}>
                    Published: {new Date(a.published_at).toLocaleDateString()}
                  </span>
                  <div className="actions" style={{display: "flex", gap: "8px"}}>
                    <button onClick={() => openModal(a)} className={styles.btnEdit}>Edit</button>
                    <button onClick={() => handleDelete(a.id)} className={styles.btnDelete}>Delete</button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>{isEditing ? "Edit Announcement" : "New Announcement"}</h3>
            <form onSubmit={handleSubmit}>
              <div className="formGroup">
                <label className="formLabel">Title</label>
                <input 
                  type="text" 
                  required 
                  className="formInput"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>
              <div className="formGroup">
                <label className="formLabel">Body</label>
                <textarea 
                  required 
                  className="formTextarea"
                  value={formData.body}
                  onChange={e => setFormData({...formData, body: e.target.value})}
                />
              </div>
              <div className="formGroup">
                <label className="formLabel">Priority</label>
                <select 
                  className="formSelect"
                  value={formData.priority}
                  onChange={e => setFormData({...formData, priority: e.target.value})}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div className={styles.checkboxGroup}>
                <input 
                  type="checkbox" 
                  id="isActive"
                  checked={formData.is_active}
                  onChange={e => setFormData({...formData, is_active: e.target.checked})}
                />
                <label htmlFor="isActive">Active (Visible to users)</label>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btnSecondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btnPrimary">Save Announcement</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Announcements;
