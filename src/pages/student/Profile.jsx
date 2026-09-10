import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { FiUser, FiBook, FiShield, FiUploadCloud, FiCheckCircle, FiClock, FiAlertCircle, FiSettings, FiGithub, FiLinkedin, FiBriefcase, FiExternalLink } from "react-icons/fi";

function Profile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState("personal");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [googleOAuthToast, setGoogleOAuthToast] = useState(null);

  const [profileStatus, setProfileStatus] = useState("NOT_AVAILABLE");
  const [isExistingStudent, setIsExistingStudent] = useState(false);
  const [serverProfile, setServerProfile] = useState(null);
  const [verificationMetadata, setVerificationMetadata] = useState({ reviewRequired: false, automatedResult: "", rejectionReason: "" });

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
            gender: (profile?.gender || user?.gender || "").toUpperCase(),
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

  // Handle Google OAuth callback query params
  useEffect(() => {
    const oauthStatus = searchParams.get("google_oauth");
    if (oauthStatus) {
      if (oauthStatus === "success") {
        setGoogleOAuthToast({ type: "success", message: "Google account connected successfully!" });
        setActiveTab("integrations");
      } else if (oauthStatus === "error") {
        const errorMsg = searchParams.get("message") || "Google connection failed. Please try again.";
        setGoogleOAuthToast({ type: "error", message: errorMsg });
        setActiveTab("integrations");
      }
      // Clean up URL params
      searchParams.delete("google_oauth");
      searchParams.delete("message");
      setSearchParams(searchParams, { replace: true });
      // Auto-dismiss toast
      setTimeout(() => setGoogleOAuthToast(null), 6000);
    }
  }, [searchParams, setSearchParams]);

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
      const msg = err.response?.data ? JSON.stringify(err.response.data) : "Save failed";
      alert("Save failed: " + msg);
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

  const handleGoogleConnect = async () => {
    try {
      const data = await authService.getGoogleConnectUrl();
      if (data && data.authorization_url) {
        window.location.href = data.authorization_url;
      }
    } catch (err) {
      alert("Could not initiate Google connection. Please try again.");
    }
  };

  const handleAddSkill = () => {
    if (skillInput.trim()) {
      const currentSkills = formData.skills ? formData.skills.split(",").map(s => s.trim()).filter(Boolean) : [];
      if (!currentSkills.includes(skillInput.trim())) {
        const newSkills = [...currentSkills, skillInput.trim()];
        setFormData(prev => ({ ...prev, skills: newSkills.join(", ") }));
      }
      setSkillInput("");
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    const currentSkills = formData.skills ? formData.skills.split(",").map(s => s.trim()).filter(Boolean) : [];
    const newSkills = currentSkills.filter(s => s !== skillToRemove);
    setFormData(prev => ({ ...prev, skills: newSkills.join(", ") }));
  };

  const handleSkillKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSkill();
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
    { id: "verification", label: "Verification", icon: <FiCheckCircle /> },
    { id: "integrations", label: "Integrations", icon: <FiShield /> },
  ];

  const requiredFields = ["firstName", "lastName", "email", "phoneNumber", "college", "degree", "specialization", "graduation_year"];
  const completedFields = requiredFields.filter(field => Boolean(formData[field]));
  const completionPercentage = Math.round((completedFields.length / requiredFields.length) * 100);

  return (
    <div className="premium-page-container">
      <div className={styles.profileHeader}>
        <div className={styles.profileHeaderLeft}>
          <div style={{ position: 'relative' }}>
            {serverProfile?.profile_photo ? (
              <img
                src={serverProfile.profile_photo}
                alt="Profile"
                style={{ width: "120px", height: "120px", borderRadius: "50%", objectFit: "cover", border: "4px solid var(--bg-nested)", boxShadow: "0 8px 16px rgba(0,0,0,0.1)" }}
              />
            ) : (
              <div style={{ width: "120px", height: "120px", borderRadius: "50%", background: "var(--primary-color)", color: "var(--text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px", fontWeight: "bold", boxShadow: "0 8px 16px rgba(0,0,0,0.1)" }}>
                {user?.first_name?.charAt(0) || <FiUser />}
              </div>
            )}
            {profileStatus === 'ADMIN_APPROVED' && (
              <div style={{ position: 'absolute', bottom: '0', right: '0', background: '#059669', color: 'var(--text-inverse)', borderRadius: '50%', padding: '6px', border: '3px solid var(--bg-default)' }}>
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

        <div className={styles.profileHeaderRight}>
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
                  <h2 style={{ marginBottom: "16px", color: "var(--text-primary)", display: 'flex', alignItems: 'center', gap: '8px' }}><FiUser /> Personal Information</h2>

                  {serverProfile?.profile_photo && (
                    <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
                      <img src={serverProfile.profile_photo} alt="Profile" style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--primary-color)" }} />
                      <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Current Profile Photo</div>
                    </div>
                  )}

                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label htmlFor="profile_photo" className="premium-label">Profile Photo (Update)</label>
                      <input id="profile_photo" className="premium-input" type="file" name="profile_photo" onChange={handleChange} accept="image/*" />
                      <small style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px", display: "block" }}>Max size: 1MB</small>
                    </div>

                    <div className="premium-form-group">
                      <label htmlFor="profile_resume" className="premium-label">Resume (Upload)</label>
                      <input id="profile_resume" className="premium-input" type="file" name="resume" onChange={handleChange} accept=".pdf,.doc,.docx" />
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
                      <label htmlFor="profile_firstName" className="premium-label">First Name *</label>
                      <input id="profile_firstName" className="premium-input" name="firstName" value={formData.firstName} onChange={handleChange} required />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_lastName" className="premium-label">Last Name *</label>
                      <input id="profile_lastName" className="premium-input" name="lastName" value={formData.lastName} onChange={handleChange} required />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_email" className="premium-label">Email *</label>
                      <input id="profile_email" className="premium-input" name="email" value={formData.email} onChange={handleChange} required disabled />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_phoneNumber" className="premium-label">Phone *</label>
                      <input id="profile_phoneNumber" className="premium-input" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} required />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_gender" className="premium-label">Gender</label>
                      <select id="profile_gender" className="premium-input" name="gender" value={formData.gender} onChange={handleChange}>
                        <option value="">Select Gender</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_dob" className="premium-label">Date of Birth</label>
                      <input id="profile_dob" className="premium-input" type="date" name="dob" value={formData.dob} onChange={handleChange} />
                    </div>
                  </div>

                  <div className="premium-form-group" style={{ marginTop: "16px" }}>
                    <label htmlFor="profile_tagline" className="premium-label">Tagline / Headline</label>
                    <input id="profile_tagline" className="premium-input" name="tagline" value={formData.tagline} onChange={handleChange} placeholder="e.g. Aspiring Full-Stack Developer" />
                  </div>
                  <div className="premium-form-group" style={{ marginTop: "16px" }}>
                    <label htmlFor="profile_bio" className="premium-label">Bio</label>
                    <textarea id="profile_bio" className="premium-input" name="bio" value={formData.bio} onChange={handleChange} rows="3" placeholder="Tell us about yourself..." />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ACADEMIC TAB */}
            {activeTab === "academic" && (
              <motion.div key="academic" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h2 style={{ marginBottom: "16px", display: 'flex', alignItems: 'center', gap: '8px' }}><FiBook /> Education & Location</h2>
                  <div className="premium-grid-2">
                    <div className="premium-form-group" style={{ gridColumn: 'span 2' }}>
                      <label htmlFor="profile_college" className="premium-label">College / University Name *</label>
                      <input id="profile_college" className="premium-input" name="college" value={formData.college} onChange={handleChange} required />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_education_level" className="premium-label">Education Level</label>
                      <select id="profile_education_level" className="premium-input" name="education_level" value={formData.education_level} onChange={handleChange}>
                        <option value="">Select Level</option>
                        <option value="Undergraduate">Undergraduate</option>
                        <option value="Postgraduate">Postgraduate</option>
                        <option value="Diploma">Diploma</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_degree" className="premium-label">Degree *</label>
                      <input id="profile_degree" className="premium-input" name="degree" value={formData.degree} onChange={handleChange} placeholder="e.g. B.Tech" required />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_specialization" className="premium-label">Specialization / Branch *</label>
                      <input id="profile_specialization" className="premium-input" name="specialization" value={formData.specialization} onChange={handleChange} placeholder="e.g. Computer Science" required />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_graduation_year" className="premium-label">Graduation Year *</label>
                      <input id="profile_graduation_year" className="premium-input" type="number" name="graduation_year" value={formData.graduation_year} onChange={handleChange} required />
                    </div>
                  </div>

                  <h2 style={{ marginTop: "24px", marginBottom: "16px", color: "var(--text-primary)" }}>Location</h2>
                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label htmlFor="profile_city" className="premium-label">City</label>
                      <input id="profile_city" className="premium-input" name="city" value={formData.city} onChange={handleChange} />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_state" className="premium-label">State</label>
                      <input id="profile_state" className="premium-input" name="state" value={formData.state} onChange={handleChange} />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_country" className="premium-label">Country</label>
                      <input id="profile_country" className="premium-input" name="country" value={formData.country} onChange={handleChange} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* SKILLS TAB */}
            {activeTab === "skills" && (
              <motion.div key="skills" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h2 style={{ marginBottom: "16px", display: 'flex', alignItems: 'center', gap: '8px' }}><FiSettings /> Skills & Preferences</h2>
                  <div className="premium-form-group">
                    <label className="premium-label">Technical Skills</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                      {(formData.skills ? formData.skills.split(",").map(s => s.trim()).filter(Boolean) : []).map((skill, index) => (
                        <div key={index} style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          background: 'var(--primary-color)', color: 'white',
                          padding: '6px 12px', borderRadius: '16px', fontSize: '13px', fontWeight: '500'
                        }}>
                          {skill}
                          <button
                            type="button"
                            onClick={() => handleRemoveSkill(skill)}
                            style={{
                              background: 'transparent', border: 'none', color: 'white',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: '0', margin: '0'
                            }}
                            title="Remove Skill"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        id="profile_skill_input"
                        className="premium-input"
                        value={skillInput}
                        onChange={(e) => setSkillInput(e.target.value)}
                        onKeyDown={handleSkillKeyDown}
                        placeholder="e.g. React, Python, Django (Press Enter to add)"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={handleAddSkill}
                        className="premium-btn premium-btn-primary"
                        style={{ padding: '0 16px', minHeight: 'auto' }}
                      >
                        Add Skill
                      </button>
                    </div>
                  </div>
                  <div className="premium-form-group" style={{ marginTop: "16px" }}>
                    <label htmlFor="profile_hobbies" className="premium-label">Hobbies</label>
                    <input id="profile_hobbies" className="premium-input" name="hobbies" value={formData.hobbies} onChange={handleChange} placeholder="e.g. Reading, Coding, Travel" />
                  </div>
                  <div className="premium-form-group" style={{ marginTop: "16px" }}>
                    <label htmlFor="profile_languages" className="premium-label">Languages</label>
                    <input id="profile_languages" className="premium-input" name="languages" value={formData.languages} onChange={handleChange} placeholder="e.g. English, Telugu, Hindi" />
                  </div>
                  <div className="premium-grid" style={{ marginTop: "16px" }}>
                    <div className="premium-form-group">
                      <label htmlFor="profile_portfolio_url" className="premium-label">Portfolio URL</label>
                      <input id="profile_portfolio_url" className="premium-input" name="portfolio_url" value={formData.portfolio_url || ""} onChange={handleChange} placeholder="https://yourportfolio.com" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* VERIFICATION TAB — Google Identity (Required) */}
            {activeTab === "verification" && (
              <motion.div key="verification" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h2 style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}><FiCheckCircle /> SURE ProEd Verification</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>Your verified identity for attendance tracking and Google Meet sessions.</p>

                  {/* Google OAuth Toast */}
                  {googleOAuthToast && (
                    <motion.div
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      style={{
                        padding: '14px 20px',
                        borderRadius: '12px',
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontWeight: 600,
                        fontSize: '14px',
                        background: googleOAuthToast.type === 'success'
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.08))'
                          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(220, 38, 38, 0.08))',
                        border: `1px solid ${googleOAuthToast.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        color: googleOAuthToast.type === 'success' ? '#059669' : '#dc2626',
                      }}
                    >
                      {googleOAuthToast.type === 'success' ? <FiCheckCircle size={18} /> : <FiAlertCircle size={18} />}
                      {googleOAuthToast.message}
                      <button
                        type="button"
                        onClick={() => setGoogleOAuthToast(null)}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '18px', lineHeight: 1 }}
                        aria-label="Dismiss"
                      >
                        ×
                      </button>
                    </motion.div>
                  )}

                  {/* Google Identity Card */}
                  <div style={{
                    padding: '24px',
                    background: 'var(--bg-nested)',
                    borderRadius: '14px',
                    border: serverProfile?.google_identity?.is_connected
                      ? '1px solid rgba(16, 185, 129, 0.3)'
                      : '1px solid var(--border-color)',
                    position: 'relative',
                    overflow: 'hidden',
                    marginBottom: '20px',
                  }}>
                    {/* Top accent bar for connected state */}
                    {serverProfile?.google_identity?.is_connected && (
                      <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0,
                        height: '3px',
                        background: 'linear-gradient(90deg, #10b981, #34d399, #10b981)',
                        borderRadius: '14px 14px 0 0',
                      }} />
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', fontSize: '16px' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Google Identity
                      </div>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.06))',
                        color: '#dc2626',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                      }}>Required</span>
                    </div>

                    {serverProfile?.google_identity?.is_connected ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.1))',
                            color: '#059669',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                          }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)' }} />
                            Verified — Connected
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                          <div style={{ padding: '14px', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Google Email</div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{serverProfile.google_identity.google_email}</div>
                          </div>
                          <div style={{ padding: '14px', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Google Profile Name</div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{serverProfile.google_identity.google_profile_name}</div>
                          </div>
                        </div>

                        {/* Required Meet Name & Naming Compliance */}
                        {serverProfile?.current_application?.required_meet_display_name && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div style={{ padding: '14px', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Required Meet Name</div>
                              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{serverProfile.current_application.required_meet_display_name}</div>
                            </div>
                            <div style={{ padding: '14px', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Naming Compliance</div>
                              {serverProfile.google_identity.naming_compliant?.is_compliant === true || serverProfile.google_identity.naming_compliant === true ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <FiCheckCircle size={16} color="#059669" />
                                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#059669' }}>Compliant</span>
                                </div>
                              ) : serverProfile.google_identity.naming_compliant?.is_compliant === false || serverProfile.google_identity.naming_compliant === false ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <FiAlertCircle size={16} color="#d97706" />
                                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#d97706' }}>Name Change Required</span>
                                </div>
                              ) : (
                                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>—</div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Non-compliant advisory */}
                        {(serverProfile.google_identity.naming_compliant?.is_compliant === false || serverProfile.google_identity.naming_compliant === false) && (
                          <div style={{
                            padding: '12px 16px',
                            borderRadius: '10px',
                            marginBottom: '16px',
                            background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.08), rgba(245, 158, 11, 0.05))',
                            border: '1px solid rgba(217, 119, 6, 0.2)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                          }}>
                            <FiAlertCircle size={16} color="#d97706" style={{ marginTop: '2px', flexShrink: 0 }} />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <strong style={{ color: 'var(--text-primary)', fontSize: '13px', marginBottom: '4px' }}>Name Change Required</strong>
                              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                {serverProfile.google_identity.naming_compliant?.message ? (
                                  serverProfile.google_identity.naming_compliant.message
                                ) : (
                                  <>Your Google Account name does not follow the recommended SURE ProEd naming format (<strong style={{ color: 'var(--text-primary)' }}>{serverProfile.current_application?.required_meet_display_name}</strong>). This is for identification consistency only and does not affect your attendance.</>
                                )}
                              </p>
                            </div>
                          </div>
                        )}

                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          Connected on {new Date(serverProfile.google_identity.connected_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: 1.6 }}>
                          Connect the same Google account you use for SURE ProEd Google Meet classes. Your Google Meet identity will be verified for accurate attendance tracking.
                        </p>
                        <button
                          type="button"
                          onClick={handleGoogleConnect}
                          className="premium-btn"
                          style={{
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            width: '100%',
                            justifyContent: 'center',
                            gap: '10px',
                            fontWeight: 600,
                            padding: '14px 20px',
                            borderRadius: '10px',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          Connect with Google
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Read-Only Admin Information */}
                  <h3 className="premium-h4" style={{ marginTop: '24px' }}>Academic Status</h3>
                  <div className="premium-grid-2">
                    <div className="premium-form-group">
                      <label htmlFor="profile_student_code" className="premium-label">Student Code</label>
                      <input id="profile_student_code" className="premium-input" value={serverProfile?.student_code || "Not Generated"} disabled />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_identity_issued_at" className="premium-label">Identity Issued At</label>
                      <input id="profile_identity_issued_at" className="premium-input" value={serverProfile?.student_identity_issued_at ? new Date(serverProfile.student_identity_issued_at).toLocaleString() : "Pending Qualification"} disabled />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_current_course" className="premium-label">Current Course</label>
                      <input id="profile_current_course" className="premium-input" value={serverProfile?.current_application?.course?.name || "Not Enrolled"} disabled />
                    </div>
                    <div className="premium-form-group">
                      <label htmlFor="profile_current_cohort" className="premium-label">Current Cohort</label>
                      <input id="profile_current_cohort" className="premium-input" value={serverProfile?.current_application?.assigned_cohort?.name || "Not Assigned"} disabled />
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* INTEGRATIONS TAB — Professional Links (Optional) */}
            {activeTab === "integrations" && (
              <motion.div key="integrations" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h2 style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}><FiShield /> Professional Integrations</h2>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>Optional links to your professional profiles.</p>

                  <div className="premium-grid-2" style={{ marginBottom: '24px' }}>
                    <div style={{ padding: '16px', background: 'var(--bg-nested)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold' }}><FiLinkedin color="#0a66c2" size={20} /> LinkedIn Status</div>
                      {serverProfile?.is_linkedin_connected ? (
                        <div style={{ color: '#059669', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          ✅ Connected via Auth
                          {serverProfile.linkedin_url && (
                            <a href={serverProfile.linkedin_url} target="_blank" rel="noreferrer" className="premium-btn" style={{ padding: '6px 14px', fontSize: '13px', background: 'var(--student-glow-primary)', color: 'var(--primary-color)', border: '1px solid var(--primary-color)', minHeight: 'auto', gap: '6px', borderRadius: '8px', marginLeft: 'auto' }}>
                              <FiExternalLink /> View Profile
                            </a>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div style={{ color: '#d97706', fontWeight: 'bold', marginBottom: '12px' }}>⏳ Not Connected via Auth</div>
                          <button type="button" onClick={handleLinkedInConnect} className="premium-btn" style={{ background: '#0a66c2', color: 'var(--text-inverse)', width: '100%', justifyContent: 'center' }}>
                            Connect LinkedIn
                          </button>
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '16px', background: 'var(--bg-nested)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold' }}><FiGithub color="var(--text-primary)" size={20} /> GitHub Status</div>
                      {serverProfile?.is_github_connected ? (
                        <div style={{ color: '#059669', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          ✅ Connected ({serverProfile.github_username})
                          {serverProfile.github_username && (
                            <a href={`https://github.com/${serverProfile.github_username}`} target="_blank" rel="noreferrer" className="premium-btn" style={{ padding: '6px 14px', fontSize: '13px', background: 'var(--student-glow-primary)', color: 'var(--primary-color)', border: '1px solid var(--primary-color)', minHeight: 'auto', gap: '6px', borderRadius: '8px', marginLeft: 'auto' }}>
                              <FiExternalLink /> View Profile
                            </a>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div style={{ color: '#d97706', fontWeight: 'bold', marginBottom: '12px' }}>⏳ Not Connected via Auth</div>
                          <button type="button" onClick={handleGithubConnect} className="premium-btn" style={{ background: '#24292e', color: 'var(--text-inverse)', width: '100%', justifyContent: 'center' }}>
                            Connect GitHub
                          </button>
                        </div>
                      )}
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
