import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { studentService } from "../../services/studentService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import GlassCard from "../../components/common/GlassCard";
import StatusBadge from "../../components/common/StatusBadge";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Profile.module.css";
import { FiUser, FiBook, FiShield, FiUploadCloud, FiCheckCircle, FiClock, FiAlertCircle } from "react-icons/fi";

function Profile() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState("personal");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [profileStatus, setProfileStatus] = useState("AVAILABLE");
  const [isExistingStudent, setIsExistingStudent] = useState(false);
  const [availableDomains, setAvailableDomains] = useState([]);
  
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phoneNumber: "",
    collegeName: "", degree: "", branch: "", graduationYear: "",
    address: "", city: "", state: "", technicalSkills: "",
    domain: "", courseBatch: "", offerLetter: null,
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const courseRes = await apiClient.get(API_ENDPOINTS.COURSES?.BASE || "/courses/");
        const results = courseRes.data?.results || courseRes.data || [];
        const uniqueDomains = [...new Set(results.map(c => c.domain || c.streamName || c.name).filter(Boolean))];
        if (isMounted) setAvailableDomains(uniqueDomains.sort());
      } catch (err) {
        console.warn("Could not fetch domains");
      }

      if (!user?.email) return;
      try {
        const profile = await studentService.getProfile(user.email);
        if (profile && isMounted) {
          setIsExistingStudent(profile.isExistingStudent === "yes" || profile.isExistingStudent === true);
          setProfileStatus(profile.status || "AVAILABLE");
          setFormData({
            firstName: profile?.firstName || user?.first_name || "",
            lastName: profile?.lastName || user?.last_name || "",
            email: profile?.email || user?.email || "",
            phoneNumber: profile?.phoneNumber || user?.phone_number || "",
            collegeName: profile?.collegeName || "",
            degree: profile?.degree || "",
            branch: profile?.branch || "",
            graduationYear: profile?.graduationYear || "",
            address: profile?.address || "",
            city: profile?.city || "",
            state: profile?.state || "",
            technicalSkills: profile?.technicalSkills || "",
            domain: profile?.domain || "",
            courseBatch: profile?.courseBatch || "",
            offerLetter: null,
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setFormData(prev => ({ ...prev, offerLetter: e.target.files[0] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.email) return;
    setSaving(true);
    
    try {
      const payload = { ...formData, isExistingStudent: isExistingStudent ? "yes" : "no" };
      if (isExistingStudent && profileStatus === "AVAILABLE") {
         payload.status = "NOT_AVAILABLE";
      }

      const savedProfile = await studentService.saveProfile(user?.email, payload);
      const isComplete = studentService.isProfileComplete(savedProfile);
      
      if (updateUser) {
        updateUser({
          first_name: savedProfile.firstName,
          last_name: savedProfile.lastName,
          phone_number: savedProfile.phoneNumber,
        });
      }

      if (formData.offerLetter) {
        setProfileStatus("NOT_AVAILABLE");
      } else {
        setProfileStatus(savedProfile.status || "AVAILABLE");
      }

      alert("Profile updated successfully");
      if (!isExistingStudent) {
        navigate("/student/apply-course", { state: { profileCompleted: isComplete } });
      }
    } catch (err) {
      alert("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="premium-page-container">
        <PageHeader title="Profile Settings" />
        <SkeletonLoader variant="detail" />
      </div>
    );
  }

  const tabs = [
    { id: "personal", label: "Personal Info", icon: <FiUser /> },
    { id: "academic", label: "Academic Details", icon: <FiBook /> },
    { id: "verification", label: "Verification", icon: <FiShield /> },
  ];

  return (
    <div className="premium-page-container">
      <PageHeader 
        title="Profile Settings" 
        description="Manage your account details and verification status."
      />
      
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
        <form onSubmit={handleSubmit} className="premium-form">
          <AnimatePresence mode="wait">
            {activeTab === "personal" && (
              <motion.div key="personal" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h3 style={{marginBottom: "16px", display: 'flex', alignItems: 'center', gap: '8px'}}><FiUser /> Personal Information</h3>
                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label className="premium-label">First Name</label>
                      <input className="premium-input" name="firstName" value={formData.firstName} onChange={handleChange} required />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Last Name</label>
                      <input className="premium-input" name="lastName" value={formData.lastName} onChange={handleChange} required />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Email</label>
                      <input className="premium-input" name="email" value={formData.email} onChange={handleChange} required disabled />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Phone</label>
                      <input className="premium-input" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} required />
                    </div>
                  </div>
                  
                  <div className="premium-form-group" style={{marginTop: "16px"}}>
                    <label className="premium-label">Address</label>
                    <textarea className="premium-input" name="address" value={formData.address} onChange={handleChange} rows="2" />
                  </div>
                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label className="premium-label">City</label>
                      <input className="premium-input" name="city" value={formData.city} onChange={handleChange} />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">State</label>
                      <input className="premium-input" name="state" value={formData.state} onChange={handleChange} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "academic" && (
              <motion.div key="academic" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h3 style={{marginBottom: "16px", display: 'flex', alignItems: 'center', gap: '8px'}}><FiBook /> Academic Details</h3>
                  <div className="premium-grid-2">
                    <div className="premium-form-group" style={{ gridColumn: 'span 2' }}>
                      <label className="premium-label">College Name</label>
                      <input className="premium-input" name="collegeName" value={formData.collegeName} onChange={handleChange} />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Degree</label>
                      <select className="premium-input" name="degree" value={formData.degree} onChange={handleChange}>
                        <option value="">Select Degree</option>
                        <option value="B.Tech">B.Tech</option>
                        <option value="B.Sc">B.Sc</option>
                        <option value="MCA">MCA</option>
                      </select>
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Branch</label>
                      <input className="premium-input" name="branch" value={formData.branch} onChange={handleChange} />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Graduation Year</label>
                      <input className="premium-input" type="number" name="graduationYear" value={formData.graduationYear} onChange={handleChange} />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Technical Skills</label>
                      <input className="premium-input" name="technicalSkills" value={formData.technicalSkills} onChange={handleChange} placeholder="e.g. React, Python" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "verification" && (
              <motion.div key="verification" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><FiShield /> Verification Status</h3>
                    <StatusBadge status={profileStatus} />
                  </div>

                  <div className="premium-form-group" style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <input 
                      type="checkbox" 
                      id="existingStudent" 
                      checked={isExistingStudent} 
                      onChange={(e) => setIsExistingStudent(e.target.checked)} 
                      style={{ width: '18px', height: '18px' }}
                    />
                    <label htmlFor="existingStudent" style={{ fontWeight: 'bold', cursor: 'pointer', margin: 0 }}>
                      I am an enrolled SURE ProEd Student
                    </label>
                  </div>

                  <AnimatePresence>
                    {isExistingStudent && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                        
                        {profileStatus === 'AVAILABLE' ? (
                          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '16px', borderRadius: '8px', marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center', color: '#047857' }}>
                            <FiCheckCircle size={24} />
                            <div>
                              <strong>Verification Complete</strong>
                              <p style={{ margin: 0, fontSize: '14px', color: '#065f46' }}>Your offer letter has been processed successfully.</p>
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: '16px' }}>
                            {profileStatus === 'NOT_AVAILABLE' && !formData.offerLetter && (
                              <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', color: '#b45309' }}>
                                <FiClock size={24} />
                                <div>
                                  <strong>Verification Pending</strong>
                                  <p style={{ margin: 0, fontSize: '14px', color: '#92400e' }}>Your uploaded document is being reviewed. This usually takes a few minutes.</p>
                                </div>
                              </div>
                            )}

                            <div className="premium-grid-2">
                              <div className="premium-form-group">
                                <label className="premium-label">Domain</label>
                                <select className="premium-input" name="domain" value={formData.domain} onChange={handleChange} required>
                                  <option value="">Select Domain</option>
                                  {availableDomains.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                              <div className="premium-form-group">
                                <label className="premium-label">Group Batch</label>
                                <input className="premium-input" name="courseBatch" value={formData.courseBatch} onChange={handleChange} required placeholder="e.g. G2-26" />
                              </div>
                            </div>
                            
                            <div className="premium-form-group">
                              <label className="premium-label">Upload Offer Letter (PDF)</label>
                              <div style={{ border: '2px dashed var(--border-color)', padding: '24px', textAlign: 'center', borderRadius: '8px', background: 'var(--bg-card)' }}>
                                <FiUploadCloud size={32} color="var(--primary-color)" style={{ marginBottom: '8px' }} />
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Drag and drop or click to upload</p>
                                <input type="file" accept=".pdf" onChange={handleFileChange} className="premium-input" style={{ width: '100%', maxWidth: '300px' }} />
                              </div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
            <button type="submit" className="premium-btn premium-btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Profile Updates"}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

export default Profile;