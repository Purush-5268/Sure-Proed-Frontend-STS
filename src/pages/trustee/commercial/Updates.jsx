import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getUpdates,
  createUpdate,
  updateUpdate,
  deleteUpdate,
} from "../../../services/trusteeService";
import SkeletonLoader from "../../../components/common/SkeletonLoader";
import styles from "./Updates.module.css";

function Updates() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "GENERAL",
    is_published: true,
  });

  const fetchUpdates = async () => {
    try {
      const data = await getUpdates();
      setUpdates(data?.results || data || []);
    } catch (err) {
      console.warn("Error fetching updates:", err);
      setUpdates([
        { id: 1, title: "Series B Funding Secured", content: "We are thrilled to announce a successful funding round...", category: "FUNDING", is_published: true, published_at: new Date().toISOString() },
        { id: 2, title: "Expansion to Europe", content: "Opening new operational centers in London and Berlin.", category: "EXPANSION", is_published: true, published_at: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpdates();
  }, []);

  const openModal = (updateObj = null) => {
    if (updateObj) {
      setIsEditing(true);
      setCurrentId(updateObj.id);
      setFormData({
        title: updateObj.title,
        content: updateObj.content,
        category: updateObj.category,
        is_published: updateObj.is_published,
      });
    } else {
      setIsEditing(false);
      setCurrentId(null);
      setFormData({ title: "", content: "", category: "GENERAL", is_published: true });
    }
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await updateUpdate(currentId, formData);
      } else {
        await createUpdate(formData);
      }
      closeModal();
      fetchUpdates();
    } catch (err) {
      alert("Failed to save update: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this update?")) {
      try {
        await deleteUpdate(id);
        fetchUpdates();
      } catch (err) {
        alert("Failed to delete: " + (err.response?.data?.detail || err.message));
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>Organization Updates</h2>
          <p>Publish news related to partnerships, funding, and expansion.</p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/trustee/commercial/dashboard" className="btn btnSecondary">
            ← Dashboard
          </Link>
          <button className="btn btnPrimary" onClick={() => openModal()}>
            + Post Update
          </button>
        </div>
      </div>

      <div className={styles.timeline}>
        {loading ? (
          <SkeletonLoader variant="card" rows={3} />
        ) : updates.length === 0 ? (
          <div className={styles.empty}>No updates published yet.</div>
        ) : (
          updates.map((update) => (
            <div key={update.id} className={styles.timelineItem}>
              <div className={styles.timelineMarker}></div>
              <div className={styles.timelineContent}>
                <div className={styles.updateHeader}>
                  <div className={styles.updateMeta}>
                    <span className={styles.categoryTag}>{update.category}</span>
                    <span className={styles.date}>
                      {new Date(update.published_at).toLocaleDateString(undefined, {
                        year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className="actions" style={{display: "flex", gap: "8px"}}>
                    <button onClick={() => openModal(update)} className={styles.btnAction}>Edit</button>
                    <button onClick={() => handleDelete(update.id)} className={`${styles.btnAction} ${styles.danger}`}>Delete</button>
                  </div>
                </div>
                <h3 className={styles.title}>{update.title}</h3>
                <p className={styles.body}>{update.content}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>{isEditing ? "Edit Update" : "Post Update"}</h3>
            <form onSubmit={handleSubmit}>
              <div className="formGroup">
                <label className="formLabel">Title</label>
                <input type="text" required className="formInput" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>
              <div className="formGroup">
                <label className="formLabel">Category</label>
                <select className="formSelect" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                  <option value="PARTNERSHIP">Partnership</option>
                  <option value="FUNDING">Funding</option>
                  <option value="EXPANSION">Expansion</option>
                  <option value="GENERAL">General</option>
                </select>
              </div>
              <div className="formGroup">
                <label className="formLabel">Content</label>
                <textarea required className="formTextarea" style={{ minHeight: '150px' }} value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} />
              </div>
              <div className={styles.checkboxGroup}>
                <input type="checkbox" id="isPublished" checked={formData.is_published} onChange={e => setFormData({...formData, is_published: e.target.checked})} />
                <label htmlFor="isPublished">Publish immediately</label>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btnSecondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btnPrimary">Save Update</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Updates;
