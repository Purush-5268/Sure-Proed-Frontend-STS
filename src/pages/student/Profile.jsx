import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { studentService, resolveStudentEnrollment } from "../../services/studentService";
import { cohortService } from "../../services/cohortService";
import { authService } from "../../services/authService";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import GlassCard from "../../components/common/GlassCard";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Profile.module.css";
import { FiUser, FiBook, FiShield, FiUploadCloud, FiCheckCircle, FiClock, FiAlertCircle, FiSettings, FiGithub, FiLinkedin, FiBriefcase } from "react-icons/fi";

function Profile() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState("personal");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profileStatus, setProfileStatus] = useState("NOT_AVAILABLE");
  const [isExistingStudent, setIsExistingStudent] = useState(false);
  const [serverProfile, setServerProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [allCohorts, setAllCohorts] = useState([]);
  const [verificationMetadata, setVerificationMetadata] = useState({ reviewRequired: false, automatedResult: "", rejectionReason: "" });
  const [studentApplications, setStudentApplications] = useState([]);

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phoneNumber: "",
    gender: "", dob: "",
    college: "", degree: "", specialization: "", education_level: "", graduation_year: "",
    city: "", state: "", country: "", bio: "", tagline: "",
    skills: "", hobbies: "", languages: "", portfolio_url: "",
    linkedin_url: "", github_username: "",
    courseId: "", courseBatch: "", profile_photo: null, resume: null,
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [courseRes, cohortRes, appRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.COURSES?.BASE || "/courses/"),
          cohortService.getCohorts(),
          user?.email ? apiClient.get(API_ENDPOINTS.APPLICATIONS?.BASE || "/applications/") : Promise.resolve({ data: [] })
        ]);
        const results = courseRes.data?.results || courseRes.data || [];
        const cohorts = cohortRes?.results || cohortRes || [];
        const apps = appRes.data?.results || appRes.data || [];

        if (isMounted) {
          setCourses(results);
          setAllCohorts(cohorts);
          setStudentApplications(apps);
        }
      } catch (err) {
        console.warn("Could not fetch domain, cohorts or applications");
      }

      if (!user?.email) return;
      try {
        const profile = await studentService.getProfile(user.email);
        if (isMounted) {
          if (profile) {
            setServerProfile(profile);
            setIsExistingStudent(profile.isExistingStudent === "yes" || profile.isExistingStudent === true);
            setProfileStatus(profile.status || "NOT_AVAILABLE");
          }
          setFormData({
            firstName: profile?.firstName || user?.first_name || "",
            lastName: profile?.lastName || user?.last_name || "",
            email: profile?.email || user?.email || "",
            phoneNumber: profile?.phoneNumber || user?.phone_number || "",
            gender: profile?.gender || user?.gender || "",
            dob: profile?.dob || user?.date_of_birth || "",
            
            college: profile?.college || "",
            degree: profile?.degree || "",
            specialization: profile?.specialization || "",
            education_level: profile?.education_level || "",
            graduation_year: profile?.graduation_year || "",
            
            city: profile?.city || "",
            state: profile?.state || "",
            country: profile?.country || "",
            bio: profile?.bio || "",
            tagline: profile?.tagline || "",
            
            skills: profile?.skills || "",
            hobbies: profile?.hobbies || "",
            languages: profile?.languages || "",
            portfolio_url: profile?.portfolio_url || "",
            
            linkedin_url: profile?.linkedin_url || "",
            github_username: profile?.github_username || "",
            
            courseId: profile?.courseId || "",
            courseBatch: profile?.courseBatch || "",
          });
          if (profile) {
            setVerificationMetadata({
              reviewRequired: profile.review_required || profile.reviewRequired || false,
              automatedResult: profile.automated_verification_result || profile.automatedVerificationResult || "",
              rejectionReason: profile.rejection_reason || profile.rejectionReason || "",
            });
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [user?.email]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === 'profile_photo') {
      if (files[0] && files[0].size > 1024 * 1024) {
        alert("Caution: Profile photo must be less than 1MB.");
        e.target.value = "";
        return;
      }
      setFormData(prev => ({ ...prev, profile_photo: files[0] }));
    } else if (name === 'resume') {
      if (files[0] && files[0].size > 1024 * 1024) {
        alert("Caution: Resume must be less than 1MB.");
        e.target.value = "";
        return;
      }
      setFormData(prev => ({ ...prev, resume: files[0] }));
    } else if (name === 'courseBatch') {
      setFormData(prev => ({ ...prev, [name]: value.toUpperCase() }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.email) return;
    setSaving(true);

    try {
      const payload = { 
        ...formData, 
        courseBatch: formData.courseBatch.trim(),
        isExistingStudent: isExistingStudent ? "yes" : "no" 
      };

      const savedProfile = await studentService.saveProfile(user?.email, payload);

      const latestProfile = await studentService.getProfile(user?.email);
      if (latestProfile) {
        setServerProfile(latestProfile);
        setProfileStatus(latestProfile.status || "NOT_AVAILABLE");
      }

      if (updateUser) {
        updateUser({
          first_name: formData.firstName,
          last_name: formData.lastName,
          phone_number: formData.phoneNumber,
        });
      }

      alert("Profile updated successfully");
    } catch (err) {
      alert("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleLinkedInConnect = async () => {
    try {
      const data = await authService.getLinkedInConnectUrl();
      if (data && data.authorization_url) {
        window.location.href = data.authorization_url;
      }
    } catch (err) {
      alert("Could not initiate LinkedIn connection");
    }
  };

  const handleGithubConnect = async () => {
    try {
      const data = await authService.getGithubConnectUrl();
      if (data && data.authorization_url) {
        window.location.href = data.authorization_url;
      }
    } catch (err) {
      alert("Could not initiate GitHub connection");
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
    { id: "personal", label: "Basic Info", icon: <FiUser /> },
    { id: "academic", label: "Education & Location", icon: <FiBook /> },
    { id: "skills", label: "Skills & Preferences", icon: <FiSettings /> },
    { id: "integrations", label: "Integrations & Read-Only", icon: <FiShield /> },
  ];

  const requiredFields = ["firstName", "lastName", "email", "phoneNumber", "college", "degree", "specialization", "graduation_year"];
  const completedFields = requiredFields.filter(field => Boolean(formData[field]));
  const completionPercentage = Math.round((completedFields.length / requiredFields.length) * 100);

  return (
    <div className="premium-page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ position: 'relative' }}>
            {serverProfile?.profile_photo ? (
              <img 
                src={serverProfile.profile_photo} 
                alt="Profile" 
                style={{ width: "120px", height: "120px", borderRadius: "50%", objectFit: "cover", border: "4px solid var(--bg-nested)", boxShadow: "0 8px 16px rgba(0,0,0,0.1)" }} 
              />
            ) : (
              <div style={{ width: "120px", height: "120px", borderRadius: "50%", background: "var(--primary-color)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px", fontWeight: "bold", boxShadow: "0 8px 16px rgba(0,0,0,0.1)" }}>
                {user?.first_name?.charAt(0) || <FiUser />}
              </div>
            )}
            {profileStatus === 'ADMIN_APPROVED' && (
              <div style={{ position: 'absolute', bottom: '0', right: '0', background: '#059669', color: '#fff', borderRadius: '50%', padding: '6px', border: '3px solid var(--bg-default)' }}>
                <FiCheckCircle size={18} />
              </div>
            )}
          </div>
          <div>
            <h1 style={{ margin: "0 0 8px 0", fontSize: "28px", color: "var(--text-primary)" }}>
              {formData.firstName || user?.first_name} {formData.lastName || user?.last_name}
            </h1>
            <p style={{ margin: "0 0 12px 0", fontSize: "16px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
              <FiBriefcase /> {formData.tagline || formData.degree || "Sure Trust Student"}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <span style={{ fontSize: '13px', background: 'var(--bg-nested)', padding: '4px 12px', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                {user?.email}
              </span>
              <span style={{ fontSize: '13px', background: 'var(--bg-nested)', padding: '4px 12px', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                {formData.phoneNumber || user?.phone_number || "No Phone"}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '16px' }}>
          {profileStatus === 'ADMIN_APPROVED' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', background: '#ecfdf5', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold' }}>
              <FiCheckCircle size={20} />
              <span>Verified Student</span>
            </div>
          ) : (
            completionPercentage < 100 && (
              <div style={{ width: '250px', background: 'var(--bg-nested)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                  <span>Profile Completion</span>
                  <span>{completionPercentage}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'var(--bg-default)', borderRadius: '4px', overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${completionPercentage}%` }} transition={{ duration: 0.5 }} style={{ height: '100%', background: 'var(--primary-color)', borderRadius: '4px' }} />
                </div>
              </div>
            )
          )}
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
        <form onSubmit={handleSubmit} className="premium-form">
          <AnimatePresence mode="wait">
            
            {/* PERSONAL TAB */}
            {activeTab === "personal" && (
              <motion.div key="personal" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h3 style={{ marginBottom: "16px", color: "var(--text-primary)", display: 'flex', alignItems: 'center', gap: '8px' }}><FiUser /> Personal Information</h3>
                  
                  {serverProfile?.profile_photo && (
                    <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
                      <img src={serverProfile.profile_photo} alt="Profile" style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--primary-color)" }} />
                      <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Current Profile Photo</div>
                    </div>
                  )}

                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label className="premium-label">Profile Photo (Update)</label>
                      <input className="premium-input" type="file" name="profile_photo" onChange={handleChange} accept="image/*" />
                      <small style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px", display: "block" }}>Max size: 1MB</small>
                    </div>

                    <div className="premium-form-group">
                      <label className="premium-label">Resume (Upload)</label>
                      <input className="premium-input" type="file" name="resume" onChange={handleChange} accept=".pdf,.doc,.docx" />
                      <small style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px", display: "block" }}>Max size: 1MB</small>
                      {serverProfile?.resume && (
                        <a href={serverProfile.resume} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--primary-color)', marginTop: '4px', display: 'inline-block' }}>
                          View Current Resume
                        </a>
                      )}
                    </div>
                  </div>
                  
                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label className="premium-label">First Name *</label>
                      <input className="premium-input" name="firstName" value={formData.firstName} onChange={handleChange} required />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Last Name *</label>
                      <input className="premium-input" name="lastName" value={formData.lastName} onChange={handleChange} required />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Email *</label>
                      <input className="premium-input" name="email" value={formData.email} onChange={handleChange} required disabled />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Phone *</label>
                      <input className="premium-input" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} required />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Gender</label>
                      <select className="premium-input" name="gender" value={formData.gender} onChange={handleChange}>
                        <option value="">Select Gender</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Date of Birth</label>
                      <input className="premium-input" type="date" name="dob" value={formData.dob} onChange={handleChange} />
                    </div>
                  </div>
                  
                  <div className="premium-form-group" style={{ marginTop: "16px" }}>
                    <label className="premium-label">Tagline / Headline</label>
                    <input className="premium-input" name="tagline" value={formData.tagline} onChange={handleChange} placeholder="e.g. Aspiring Full-Stack Developer" />
                  </div>
                  <div className="premium-form-group" style={{ marginTop: "16px" }}>
                    <label className="premium-label">Bio</label>
                    <textarea className="premium-input" name="bio" value={formData.bio} onChange={handleChange} rows="3" placeholder="Tell us about yourself..." />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ACADEMIC TAB */}
            {activeTab === "academic" && (
              <motion.div key="academic" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h3 style={{ marginBottom: "16px", display: 'flex', alignItems: 'center', gap: '8px' }}><FiBook /> Education & Location</h3>
                  <div className="premium-grid-2">
                    <div className="premium-form-group" style={{ gridColumn: 'span 2' }}>
                      <label className="premium-label">College / University Name *</label>
                      <input className="premium-input" name="college" value={formData.college} onChange={handleChange} required />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Education Level</label>
                      <select className="premium-input" name="education_level" value={formData.education_level} onChange={handleChange}>
                        <option value="">Select Level</option>
                        <option value="Undergraduate">Undergraduate</option>
                        <option value="Postgraduate">Postgraduate</option>
                        <option value="Diploma">Diploma</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Degree *</label>
                      <input className="premium-input" name="degree" value={formData.degree} onChange={handleChange} placeholder="e.g. B.Tech" required />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Specialization / Branch *</label>
                      <input className="premium-input" name="specialization" value={formData.specialization} onChange={handleChange} placeholder="e.g. Computer Science" required />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Graduation Year *</label>
                      <input className="premium-input" type="number" name="graduation_year" value={formData.graduation_year} onChange={handleChange} required />
                    </div>
                  </div>

                  <h4 style={{ marginTop: "24px", marginBottom: "16px", color: "var(--text-primary)" }}>Location</h4>
                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label className="premium-label">City</label>
                      <input className="premium-input" name="city" value={formData.city} onChange={handleChange} />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">State</label>
                      <input className="premium-input" name="state" value={formData.state} onChange={handleChange} />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Country</label>
                      <input className="premium-input" name="country" value={formData.country} onChange={handleChange} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* SKILLS TAB */}
            {activeTab === "skills" && (
              <motion.div key="skills" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h3 style={{ marginBottom: "16px", display: 'flex', alignItems: 'center', gap: '8px' }}><FiSettings /> Skills & Preferences</h3>
                  <div className="premium-form-group">
                    <label className="premium-label">Technical Skills</label>
                    <input className="premium-input" name="skills" value={formData.skills} onChange={handleChange} placeholder="e.g. React, Python, Django" />
                  </div>
                  <div className="premium-form-group" style={{ marginTop: "16px" }}>
                    <label className="premium-label">Hobbies</label>
                    <input className="premium-input" name="hobbies" value={formData.hobbies} onChange={handleChange} placeholder="e.g. Reading, Coding, Travel" />
                  </div>
                  <div className="premium-form-group" style={{ marginTop: "16px" }}>
                    <label className="premium-label">Languages</label>
                    <input className="premium-input" name="languages" value={formData.languages} onChange={handleChange} placeholder="e.g. English, Telugu, Hindi" />
                  </div>
                  <div className="premium-grid" style={{ marginTop: "16px" }}>
                    <div className="premium-form-group">
                      <label className="premium-label">Portfolio URL</label>
                      <input className="premium-input" name="portfolio_url" value={formData.portfolio_url || ""} onChange={handleChange} placeholder="https://yourportfolio.com" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* INTEGRATIONS TAB */}
            {activeTab === "integrations" && (
              <motion.div key="integrations" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h3 style={{ marginBottom: "16px", display: 'flex', alignItems: 'center', gap: '8px' }}><FiShield /> Integrations & Admin Data</h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ padding: '16px', background: 'var(--bg-nested)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold' }}><FiLinkedin color="#0a66c2" size={20}/> LinkedIn Status</div>
                      {serverProfile?.is_linkedin_connected ? (
                        <div style={{ color: '#059669', fontWeight: 'bold' }}>✅ Connected via Auth</div>
                      ) : (
                        <div>
                          <div style={{ color: '#d97706', fontWeight: 'bold', marginBottom: '12px' }}>⏳ Not Connected via Auth</div>
                          <button type="button" onClick={handleLinkedInConnect} className="premium-btn" style={{ background: '#0a66c2', color: '#fff', width: '100%', justifyContent: 'center' }}>
                            Connect LinkedIn
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div style={{ padding: '16px', background: 'var(--bg-nested)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold' }}><FiGithub color="var(--text-primary)" size={20}/> GitHub Status</div>
                      {serverProfile?.is_github_connected ? (
                        <div style={{ color: '#059669', fontWeight: 'bold' }}>✅ Connected ({serverProfile.github_username})</div>
                      ) : (
                        <div>
                          <div style={{ color: '#d97706', fontWeight: 'bold', marginBottom: '12px' }}>⏳ Not Connected via Auth</div>
                          <button type="button" onClick={handleGithubConnect} className="premium-btn" style={{ background: '#24292e', color: '#fff', width: '100%', justifyContent: 'center' }}>
                            Connect GitHub
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h4 style={{ marginBottom: "16px", color: "var(--text-primary)" }}>Read-Only Admin Information</h4>
                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label className="premium-label">Student Code</label>
                      <input className="premium-input" value={serverProfile?.student_code || "Not Generated"} disabled />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Identity Issued At</label>
                      <input className="premium-input" value={serverProfile?.student_identity_issued_at ? new Date(serverProfile.student_identity_issued_at).toLocaleString() : "Pending Qualification"} disabled />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Current Course</label>
                      <input className="premium-input" value={serverProfile?.current_application?.course?.name || "Not Enrolled"} disabled />
                    </div>
                    <div className="premium-form-group">
                      <label className="premium-label">Current Cohort</label>
                      <input className="premium-input" value={serverProfile?.current_application?.assigned_cohort?.name || "Not Assigned"} disabled />
                    </div>
                  </div>

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
