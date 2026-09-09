import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import GlassCard from "../../components/common/GlassCard";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "../student/Profile.module.css";
import { FiUser, FiActivity, FiBriefcase, FiMail, FiCalendar } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";

function Profile() {
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState("personal");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  const [profileId, setProfileId] = useState(null);
  const [statsData, setStatsData] = useState(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    mappedEmail: "",
    gender: "",
    dob: "",
    trusteeType: "",
    organization: "",
    designation: "",
    bio: "",
    skills: "",
    profile_photo: null,
    banner_image: null,
  });

  const [serverPhoto, setServerPhoto] = useState(null);
  
  const isVolunteer = user?.role === "VOLUNTEER";

  useEffect(() => {
    let isMounted = true;
    async function fetchProfile() {
      if (!user?.id) return;
      try {
        const res = await apiClient.get(API_ENDPOINTS.VOLUNTEER_PROFILES.PROFILE_BY_USER(user.id));
        if (isMounted && res.data && res.data.results && res.data.results.length > 0) {
          const profile = res.data.results[0];
          setProfileId(profile.id);
          setServerPhoto(profile.profile_photo);
          
          setFormData({
            firstName: profile.first_name || user.first_name || "",
            lastName: profile.last_name || user.last_name || "",
            email: user.email || "",
            mappedEmail: user.mapped_email || "",
            gender: user.gender || "",
            dob: profile.date_of_birth || user.date_of_birth || "",
            trusteeType: user.role === "TRUSTEE" ? (user.admin_category || "Commercial") : "Volunteer",
            organization: profile.organization_name || "",
            designation: profile.occupation || "",
            bio: profile.bio || "",
            skills: profile.skills || "",
            profile_photo: null,
            banner_image: null,
          });
        }
      } catch (err) {
        console.error("Failed to load profile", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchProfile();
    return () => { isMounted = false; };
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    async function fetchStats() {
      if (activeTab === "contribution" && profileId && isVolunteer && !statsData) {
        setStatsLoading(true);
        try {
          const res = await apiClient.get(API_ENDPOINTS.VOLUNTEER_PROFILES.STATS(profileId));
          if (isMounted) setStatsData(res.data);
        } catch (err) {
          console.error("Failed to fetch volunteer stats", err);
        } finally {
          if (isMounted) setStatsLoading(false);
        }
      }
    }
    fetchStats();
    return () => { isMounted = false; };
  }, [activeTab, profileId, isVolunteer, statsData]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === 'profile_photo' || name === 'banner_image') {
      if (files[0] && files[0].size > 5 * 1024 * 1024) {
        alert("Image must be less than 5MB.");
        e.target.value = "";
        return;
      }
      setFormData(prev => ({ ...prev, [name]: files[0] }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!profileId) return;
    setSaving(true);
    
    try {
      const formPayload = new FormData();
      // AssignedStaffProfileSerializer maps 'user' related fields via to_internal_value and update
      formPayload.append("user.first_name", formData.firstName);
      formPayload.append("user.last_name", formData.lastName);
      formPayload.append("organization_name", formData.organization);
      formPayload.append("occupation", formData.designation);
      formPayload.append("bio", formData.bio);
      formPayload.append("skills", formData.skills);
      if (formData.dob) formPayload.append("date_of_birth", formData.dob);
      
      if (formData.profile_photo) {
        formPayload.append("profile_photo", formData.profile_photo);
      }
      
      const res = await apiClient.patch(API_ENDPOINTS.VOLUNTEER_PROFILES.BY_ID(profileId), formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (res.data) {
        setServerPhoto(res.data.profile_photo);
        setFormData(prev => ({ ...prev, profile_photo: null }));
        if (updateUser) {
          updateUser({
            first_name: formData.firstName,
            last_name: formData.lastName,
          });
        }
        alert("Profile updated successfully");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to update profile. " + (err.response?.data ? JSON.stringify(err.response.data) : ""));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="premium-page-container">
        <PageHeader title="My Profile" />
        <SkeletonLoader variant="detail" />
      </div>
    );
  }

  const tabs = [
    { id: "personal", label: "Personal Details", icon: <FiUser /> },
  ];
  if (isVolunteer) {
    tabs.push({ id: "contribution", label: "Contribution", icon: <FiActivity /> });
  }

  return (
    <div className="premium-page-container">
      <div className={styles.profileHeader}>
        <div className={styles.profileHeaderLeft}>
          <div style={{ position: 'relative' }}>
            {serverPhoto ? (
              <img
                src={serverPhoto}
                alt="Profile"
                style={{ width: "100px", height: "100px", borderRadius: "50%", objectFit: "cover", border: "3px solid var(--bg-nested)" }}
              />
            ) : (
              <div style={{ width: "100px", height: "100px", borderRadius: "50%", background: "var(--primary-color)", color: "var(--text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "36px", fontWeight: "bold" }}>
                {user?.first_name?.charAt(0) || <FiUser />}
              </div>
            )}
          </div>
          <div>
            <h1 style={{ margin: "0 0 8px 0", fontSize: "24px", color: "var(--text-primary)" }}>
              {formData.firstName || user?.first_name} {formData.lastName || user?.last_name}
            </h1>
            <p style={{ margin: "0 0 12px 0", fontSize: "15px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
              <FiBriefcase /> {formData.designation || "Staff Member"} {formData.organization ? `at ${formData.organization}` : ""}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <span style={{ fontSize: '13px', background: 'var(--bg-nested)', padding: '4px 12px', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                {user?.email}
              </span>
              <span style={{ fontSize: '13px', background: 'var(--bg-nested)', padding: '4px 12px', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                Role: {formData.trusteeType}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.tabContainer}>
        <div className={styles.tabList}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${styles.tabBtn} ${activeTab === tab.id ? styles.activeTab : ""}`}
            >
              {tab.icon} {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="activeTabIndicator" className={styles.tabIndicator} />
              )}
            </button>
          ))}
        </div>
      </div>

      <GlassCard>
        <AnimatePresence mode="wait">
          {activeTab === "personal" && (
            <motion.div key="personal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <form onSubmit={handleSubmit} className="premium-form">
                <div className="premium-section">
                  <h2 style={{ marginBottom: "16px", color: "var(--text-primary)" }}>Basic Information</h2>
                  
                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label className="premium-label">Profile Photo</label>
                      <input className="premium-input" type="file" name="profile_photo" onChange={handleChange} accept="image/*" />
                      <small style={{ color: "var(--text-secondary)" }}>Leave empty to keep current photo.</small>
                    </div>
                  </div>

                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label className="premium-label">First Name *</label>
                      <input className="premium-input" name="firstName" value={formData.firstName} onChange={handleChange} required />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Last Name</label>
                      <input className="premium-input" name="lastName" value={formData.lastName} onChange={handleChange} />
                    </div>
                  </div>

                  <h2 style={{ marginTop: "24px", marginBottom: "16px", color: "var(--text-primary)" }}>Account Data (Read-Only)</h2>
                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label className="premium-label"><FiMail style={{marginRight: 6}}/> Email Address</label>
                      <input className="premium-input" value={formData.email} disabled />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label"><FiMail style={{marginRight: 6}}/> Mapped Email</label>
                      <input className="premium-input" value={formData.mappedEmail || "N/A"} disabled />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label"><FiUser style={{marginRight: 6}}/> Gender</label>
                      <input className="premium-input" value={formData.gender || "N/A"} disabled />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label"><FiUser style={{marginRight: 6}}/> Account Type</label>
                      <input className="premium-input" value={formData.trusteeType} disabled />
                    </div>
                  </div>

                  <h2 style={{ marginTop: "24px", marginBottom: "16px", color: "var(--text-primary)" }}>Professional Details</h2>
                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label className="premium-label">Organization</label>
                      <input className="premium-input" name="organization" value={formData.organization} onChange={handleChange} />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Designation</label>
                      <input className="premium-input" name="designation" value={formData.designation} onChange={handleChange} />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Date of Birth</label>
                      <input type="date" className="premium-input" name="dob" value={formData.dob} onChange={handleChange} />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Skills</label>
                      <input className="premium-input" name="skills" value={formData.skills} onChange={handleChange} placeholder="e.g. Teaching, Management" />
                    </div>
                  </div>
                  
                  <div className="premium-form-group" style={{ marginTop: "16px" }}>
                    <label className="premium-label">Bio</label>
                    <textarea className="premium-input" name="bio" value={formData.bio} onChange={handleChange} rows="3" />
                  </div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                  <button type="submit" className="premium-btn premium-btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save Profile Updates"}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {activeTab === "contribution" && isVolunteer && (
            <motion.div key="contribution" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {statsLoading ? (
                <div style={{ padding: "40px" }}><SkeletonLoader variant="table" rows={6} /></div>
              ) : statsData ? (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
                    <div style={{ background: "var(--bg-nested)", padding: "20px", borderRadius: "12px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "32px", fontWeight: "bold", color: "var(--primary-color)" }}>{statsData.classes_generated}</span>
                      <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Classes Generated</span>
                    </div>
                    <div style={{ background: "var(--bg-nested)", padding: "20px", borderRadius: "12px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "32px", fontWeight: "bold", color: "#059669" }}>{statsData.classes_completed}</span>
                      <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Classes Completed</span>
                    </div>
                    <div style={{ background: "var(--bg-nested)", padding: "20px", borderRadius: "12px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "32px", fontWeight: "bold", color: "#8b5cf6" }}>{statsData.total_completed_class_hours}</span>
                      <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Completed Hours</span>
                    </div>
                    <div style={{ background: "var(--bg-nested)", padding: "20px", borderRadius: "12px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "32px", fontWeight: "bold", color: "#f59e0b" }}>{statsData.cohort_breakdown.length}</span>
                      <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Cohorts Supported</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "24px", marginBottom: "32px", flexWrap: "wrap" }}>
                    {statsData.first_contribution_date && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
                        <FiCalendar style={{ color: "var(--text-secondary)" }} />
                        <span><strong>First Contribution:</strong> {statsData.first_contribution_date}</span>
                      </div>
                    )}
                    {statsData.latest_contribution_date && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
                        <FiCalendar style={{ color: "var(--text-secondary)" }} />
                        <span><strong>Latest Contribution:</strong> {statsData.latest_contribution_date}</span>
                      </div>
                    )}
                  </div>

                  <h3 className="premium-h4" style={{ marginBottom: "16px" }}>Class Type Breakdown</h3>
                  <div style={{ overflowX: "auto", marginBottom: "32px" }}>
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>Class Type</th>
                          <th>Generated</th>
                          <th>Completed</th>
                          <th>Cancelled</th>
                          <th>Completed Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsData.class_type_breakdown.map((ct) => (
                          <tr key={ct.class_type}>
                            <td style={{ fontWeight: "600" }}>{ct.class_type}</td>
                            <td>{ct.generated}</td>
                            <td>{ct.completed}</td>
                            <td>{ct.cancelled}</td>
                            <td>{ct.completed_hours}</td>
                          </tr>
                        ))}
                        {statsData.class_type_breakdown.length === 0 && (
                          <tr><td colSpan="5" style={{ textAlign: "center" }}>No class types recorded</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <h3 className="premium-h4" style={{ marginBottom: "16px" }}>Cohort Contribution</h3>
                  <div style={{ overflowX: "auto" }}>
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>Cohort Name</th>
                          <th>Course</th>
                          <th>Generated</th>
                          <th>Completed</th>
                          <th>Cancelled</th>
                          <th>Completed Hours</th>
                          <th>Last Class Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsData.cohort_breakdown.map((ch) => (
                          <tr key={ch.cohort_id}>
                            <td style={{ fontWeight: "600" }}>{ch.cohort_name}</td>
                            <td>{ch.course_name}</td>
                            <td>{ch.classes_generated}</td>
                            <td>{ch.classes_completed}</td>
                            <td>{ch.classes_cancelled}</td>
                            <td>{ch.total_completed_hours}</td>
                            <td>{ch.last_class_date || "N/A"}</td>
                          </tr>
                        ))}
                        {statsData.cohort_breakdown.length === 0 && (
                          <tr><td colSpan="7" style={{ textAlign: "center" }}>No cohorts supported yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
                  Failed to load statistics.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </div>
  );
}

export default Profile;
