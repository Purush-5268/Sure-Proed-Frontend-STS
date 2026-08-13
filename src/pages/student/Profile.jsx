import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { studentService, resolveStudentEnrollment } from "../../services/studentService";
import { cohortService } from "../../services/cohortService";
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

  const [profileStatus, setProfileStatus] = useState("NOT_AVAILABLE");
  const [uploadedFileUrl, setUploadedFileUrl] = useState(null);
  const [isExistingStudent, setIsExistingStudent] = useState(false);
  const [serverProfile, setServerProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [allCohorts, setAllCohorts] = useState([]);
  const [verificationMetadata, setVerificationMetadata] = useState({ reviewRequired: false, automatedResult: "", rejectionReason: "" });
  const [studentApplications, setStudentApplications] = useState([]);

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phoneNumber: "",
    collegeName: "", degree: "", branch: "", graduationYear: "",
    address: "", city: "", state: "", technicalSkills: "",
    courseId: "", courseBatch: "", offerLetter: null,
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
            collegeName: profile?.collegeName || "",
            degree: profile?.degree || "",
            branch: profile?.branch || "",
            graduationYear: profile?.graduationYear || "",
            address: profile?.address || "",
            city: profile?.city || "",
            state: profile?.state || "",
            technicalSkills: profile?.technicalSkills || "",
            courseId: profile?.courseId || "",
            courseBatch: profile?.courseBatch || "",
            offerLetter: null,
          });
          if (profile) {
            setUploadedFileUrl(profile.uploaded_offer_letter || profile.uploadedOfferLetter || null);
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
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'courseBatch') {
      setFormData(prev => ({ ...prev, [name]: value.toUpperCase() }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e) => {
    setFormData(prev => ({ ...prev, offerLetter: e.target.files[0] }));
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

      // Re-fetch strictly from backend to get the authoritative status and file URL
      const latestProfile = await studentService.getProfile(user?.email);
      if (latestProfile) {
        setProfileStatus(latestProfile.status || "NOT_AVAILABLE");
        setUploadedFileUrl(latestProfile.uploaded_offer_letter || latestProfile.uploadedOfferLetter || null);
        setVerificationMetadata({
          reviewRequired: latestProfile.review_required || latestProfile.reviewRequired || false,
          automatedResult: latestProfile.automated_verification_result || latestProfile.automatedVerificationResult || "",
          rejectionReason: latestProfile.rejection_reason || latestProfile.rejectionReason || "",
        });
      }

      const isComplete = studentService.isProfileComplete(savedProfile);

      if (updateUser) {
        updateUser({
          first_name: savedProfile.firstName,
          last_name: savedProfile.lastName,
          phone_number: savedProfile.phoneNumber,
        });
      }

      // Reset file input state after successful upload
      setFormData(prev => ({ ...prev, offerLetter: null }));

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
  ];

  // Derive one authoritative enrollment state
  const resolvedEnrollment = resolveStudentEnrollment(serverProfile, studentApplications, courses);
  const hasEnrollment = resolvedEnrollment.isEnrolled;
  const showVerificationTab = resolvedEnrollment.showVerificationTab;

  if (hasEnrollment) {
    tabs.push({ id: "enrollment", label: "Enrollment", icon: <FiCheckCircle /> });
  } else if (showVerificationTab) {
    tabs.push({ id: "verification", label: "Verification", icon: <FiShield /> });
  }

  const requiredFields = ["firstName", "lastName", "email", "phoneNumber", "collegeName", "degree", "branch", "graduationYear"];
  const completedFields = requiredFields.filter(field => Boolean(formData[field]));
  const completionPercentage = Math.round((completedFields.length / requiredFields.length) * 100);

  return (
    <div className="premium-page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <PageHeader
          title="Profile Settings"
          description="Manage your account details and verification status."
        />
        {profileStatus === 'ADMIN_APPROVED' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', background: '#ecfdf5', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold' }}>
            <FiCheckCircle size={20} />
            <span>Verified Student</span>
          </div>
        ) : (
          completionPercentage < 100 && (
            <div style={{ width: '250px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                <span>Profile Completion</span>
                <span>{completionPercentage}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--bg-nested)', borderRadius: '4px', overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${completionPercentage}%` }} transition={{ duration: 0.5 }} style={{ height: '100%', background: 'var(--primary-color)', borderRadius: '4px' }} />
              </div>
            </div>
          )
        )}
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
            {activeTab === "personal" && (
              <motion.div key="personal" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h3 style={{ marginBottom: "16px", display: 'flex', alignItems: 'center', gap: '8px' }}><FiUser /> Personal Information</h3>
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

                  <div className="premium-form-group" style={{ marginTop: "16px" }}>
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
                  <h3 style={{ marginBottom: "16px", display: 'flex', alignItems: 'center', gap: '8px' }}><FiBook /> Academic Details</h3>
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
                    <StatusBadge status={isExistingStudent ? profileStatus : 'NOT_AVAILABLE'} />
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

                        {profileStatus === 'ADMIN_APPROVED' ? (
                          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '16px', borderRadius: '8px', marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center', color: '#047857' }}>
                            <FiCheckCircle size={24} />
                            <div>
                              <strong>Verification Complete</strong>
                              <p style={{ margin: 0, fontSize: '14px', color: '#065f46' }}>Your offer letter has been approved by an administrator.</p>
                            </div>
                          </div>
                        ) : profileStatus === 'PENDING_ADMIN_REVIEW' ? (
                          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '16px', borderRadius: '8px', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', color: '#1d4ed8' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              <FiClock size={24} />
                              <div>
                                <strong>Verification Pending</strong>
                                <p style={{ margin: 0, fontSize: '14px', color: '#1e3a8a' }}>
                                  Your profile has been submitted successfully and is currently being reviewed by an administrator.
                                  {uploadedFileUrl && <span> You can view your uploaded document <a href={uploadedFileUrl.startsWith('http') ? uploadedFileUrl : `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${uploadedFileUrl}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>here</a>.</span>}
                                </p>
                              </div>
                            </div>
                            {verificationMetadata.automatedResult?.toLowerCase().includes("passed") && (
                              <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '12px', borderRadius: '6px', fontSize: '13px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                <div style={{ color: '#065f46', fontWeight: 'bold' }}>✓ Document received successfully.</div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginTop: '16px' }}>
                            {profileStatus === 'ADMIN_REJECTED' && (
                              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', color: '#b91c1c' }}>
                                <FiAlertCircle size={24} style={{ minWidth: '24px' }} />
                                <div>
                                  <strong>Document Rejected</strong>
                                  <p style={{ margin: 0, fontSize: '14px', color: '#7f1d1d' }}>
                                    Your previously uploaded offer letter was rejected. Please upload a valid SURE Trust offer letter below.
                                  </p>
                                  {verificationMetadata.rejectionReason && (
                                    <p style={{ margin: '8px 0 0 0', fontSize: '13px', fontStyle: 'italic', background: 'rgba(255,255,255,0.5)', padding: '8px', borderRadius: '4px' }}>
                                      <strong>Reason:</strong> {verificationMetadata.rejectionReason}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                            {profileStatus === 'NOT_AVAILABLE' && (
                              <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', color: '#b45309' }}>
                                <FiClock size={24} style={{ minWidth: '24px' }} />
                                <div>
                                  <strong>Action Required</strong>
                                  <p style={{ margin: 0, fontSize: '14px', color: '#92400e' }}>Please upload your SURE Trust offer letter to proceed with course enrollment.</p>
                                </div>
                              </div>
                            )}

                            <div className="premium-grid-2">
                              <div className="premium-form-group">
                                <label className="premium-label">Course</label>
                                <select className="premium-input" name="courseId" value={formData.courseId} onChange={(e) => { handleChange(e); setFormData(prev => ({ ...prev, courseBatch: "" })); }} required>
                                  <option value="">Select your Course</option>
                                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </div>
                              <div className="premium-form-group">
                                <label className="premium-label">Group</label>
                                <input type="text" className="premium-input" name="courseBatch" value={formData.courseBatch} onChange={handleChange} placeholder="e.g. G2-26" required disabled={!formData.courseId} />
                              </div>
                            </div>

                            <div className="premium-form-group" style={{ marginTop: '16px' }}>
                              <label className="premium-label">Upload {uploadedFileUrl ? "New" : ""} Offer Letter (PDF)</label>
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
            {activeTab === "enrollment" && (
              <motion.div key="enrollment" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div className="premium-section">
                  <h3 style={{ marginBottom: "16px", display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-color)' }}>🎓 Current Enrollment</h3>
                  <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Course</p>
                        <h4 style={{ margin: '4px 0 0 0', fontSize: '20px' }}>{resolvedEnrollment.courseName}</h4>
                      </div>
                      {resolvedEnrollment.status && <StatusBadge status={resolvedEnrollment.status} />}
                    </div>

                    <div className="premium-grid-2">
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Group</p>
                        <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', fontSize: '16px' }}>{resolvedEnrollment.group}</p>
                      </div>
                      {resolvedEnrollment.application?.application_number && (
                        <div>
                          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Application ID</p>
                          <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', fontSize: '16px' }}>{resolvedEnrollment.application.application_number}</p>
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