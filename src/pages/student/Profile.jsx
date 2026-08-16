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
    gender: "", dob: "",
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
            gender: profile?.gender || user?.gender || "",
            dob: profile?.dob || user?.date_of_birth || "",
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
  }, [user?.email]);

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