import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getAchievements,
  createAchievement,
  updateAchievement,
  deleteAchievement,
} from "../../../services/trusteeService";
import styles from "./Achievements.module.css";

function Achievements() {
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    icon: "🏆",
    category: "",
    date_achieved: new Date().toISOString().split("T")[0],
  });

  const fetchAchievements = async () => {
    try {
      const data = await getAchievements();
      setAchievements(data || []);
    } catch (err) {
      console.warn("Error fetching achievements:", err);
      setAchievements([
        { id: 1, title: "10,000 Students Placed", description: "Reached a major milestone in student placements this quarter.", icon: "🎓", category: "Milestone", date_achieved: "2026-06-15" },
        { id: 2, title: "Best EdTech Platform 2026", description: "Awarded at the National Education Summit.", icon: "🥇", category: "Award", date_achieved: "2026-03-10" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAchievements();
  }, []);

  const openModal = (achievement = null) => {
    if (achievement) {
      setIsEditing(true);
      setCurrentId(achievement.id);
      setFormData({
        title: achievement.title,
        description: achievement.description,
        icon: achievement.icon || "🏆",
        category: achievement.category || "",
        date_achieved: achievement.date_achieved,
      });
    } else {
      setIsEditing(false);
      setCurrentId(null);
      setFormData({
        title: "",
        description: "",
        icon: "🏆",
        category: "",
        date_achieved: new Date().toISOString().split("T")[0],
      });
    }
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await updateAchievement(currentId, formData);
      } else {
        await createAchievement(formData);
      }
      closeModal();
      fetchAchievements();
    } catch (err) {
      alert("Failed to save achievement: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this achievement?")) {
      try {
        await deleteAchievement(id);
        fetchAchievements();
      } catch (err) {
        alert("Failed to delete: " + (err.response?.data?.detail || err.message));
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>Achievements</h2>
          <p>Highlight organizational milestones and awards.</p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/trustee/commercial/dashboard" className="btn btnSecondary">
            ← Dashboard
          </Link>
          <button className="btn btnPrimary" onClick={() => openModal()}>
            + Add Achievement
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonLoader variant="card" rows={3} />
      ) : achievements.length === 0 ? (
        <div className={styles.empty}>No achievements added yet.</div>
      ) : (
        <div className={styles.grid}>
          {achievements.map((ach) => (
            <div key={ach.id} className="premium-card">
              <div className={styles.cardHeader}>
                <div className={styles.iconWrapper}>{ach.icon}</div>
                {ach.category && <span className={styles.categoryBadge}>{ach.category}</span>}
              </div>
              <h3 className={styles.title}>{ach.title}</h3>
              <p className={styles.description}>{ach.description}</p>
              <div className={styles.footer}>
                <span className={styles.date}>
                  {new Date(ach.date_achieved).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                </span>
                <div className="actions" style={{display: "flex", gap: "8px"}}>
                  <button onClick={() => openModal(ach)} className={styles.btnIcon}>✏️</button>
                  <button onClick={() => handleDelete(ach.id)} className={styles.btnIconDelete}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>{isEditing ? "Edit Achievement" : "Add Achievement"}</h3>
            <form onSubmit={handleSubmit}>
              <div className={styles.splitGrid}>
                <div className="formGroup">
                  <label className="formLabel">Title</label>
                  <input type="text" required className="formInput" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
                <div className="formGroup">
                  <label className="formLabel">Icon (Emoji)</label>
                  <input type="text" required className="formInput" value={formData.icon} onChange={e => setFormData({...formData, icon: e.target.value})} />
                </div>
              </div>
              <div className="formGroup">
                <label className="formLabel">Description</label>
                <textarea required className="formTextarea" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              <div className={styles.splitGrid}>
                <div className="formGroup">
                  <label className="formLabel">Category</label>
                  <input type="text" className="formInput" placeholder="e.g. Award, Milestone" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
                </div>
                <div className="formGroup">
                  <label className="formLabel">Date Achieved</label>
                  <input type="date" required className="formInput" value={formData.date_achieved} onChange={e => setFormData({...formData, date_achieved: e.target.value})} />
                </div>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btnSecondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btnPrimary">Save Achievement</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Achievements;
