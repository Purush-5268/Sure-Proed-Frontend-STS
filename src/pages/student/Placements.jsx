import React, { useState, useEffect } from "react";
import { FaBriefcase, FaBuilding, FaCalendarAlt, FaEnvelope, FaLink, FaSpinner, FaClock, FaCheckCircle, FaExclamationCircle, FaPlus } from "react-icons/fa";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Placements.module.css";

const EMPLOYMENT_TYPES = [
  { value: "FULL_TIME", label: "Full Time" },
  { value: "PART_TIME", label: "Part Time" },
  { value: "INTERNSHIP", label: "Internship" },
  { value: "CONTRACT", label: "Contract" },
  { value: "FREELANCE", label: "Freelance" }
];

function Placements() {
  const [placements, setPlacements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [applicationStatus, setApplicationStatus] = useState(null);
  
  const [formData, setFormData] = useState({
    company_name: "",
    designation: "",
    employment_type: "FULL_TIME",
    joining_date: "",
    official_email: "",
    linkedin_url: "",
  });
  const [file, setFile] = useState(null);

  useEffect(() => {
    fetchPlacements();
    fetchApplicationStatus();
  }, []);

  const fetchApplicationStatus = async () => {
    try {
      const res = await apiClient.get(API_ENDPOINTS.STUDENTS.STATISTICS);
      setApplicationStatus(res.data.application_status);
    } catch (err) {
      console.error("Failed to fetch application status", err);
    }
  };

  const fetchPlacements = async () => {
    try {
      const res = await apiClient.get(API_ENDPOINTS.PLACEMENTS.BASE);
      // Ensure we extract the results correctly (handling pagination if any)
      const data = res.data.results || res.data;
      setPlacements(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch placements", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleEdit = (placement) => {
    setFormData({
      company_name: placement.company_name || "",
      designation: placement.designation || "",
      employment_type: placement.employment_type || "FULL_TIME",
      joining_date: placement.joining_date || "",
      official_email: placement.official_email || "",
      linkedin_url: placement.linkedin_url || "",
    });
    setEditingId(placement.id);
    setIsFormVisible(true);
    setFile(null); // Clear previous file since we can't prepopulate file inputs
  };

  const resetForm = () => {
    setFormData({
      company_name: "",
      designation: "",
      employment_type: "FULL_TIME",
      joining_date: "",
      official_email: "",
      linkedin_url: "",
    });
    setFile(null);
    setEditingId(null);
    setIsFormVisible(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    const payload = new FormData();
    payload.append("company_name", formData.company_name);
    payload.append("designation", formData.designation);
    payload.append("employment_type", formData.employment_type);
    payload.append("joining_date", formData.joining_date);
    
    if (formData.official_email) {
      payload.append("official_email", formData.official_email);
    }
    if (formData.linkedin_url) {
      payload.append("linkedin_url", formData.linkedin_url);
    }
    if (file) {
      payload.append("offer_letter", file);
    }

    try {
      if (editingId) {
        await apiClient.patch(API_ENDPOINTS.PLACEMENTS.BY_ID(editingId), payload, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        await apiClient.post(API_ENDPOINTS.PLACEMENTS.BASE, payload, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      await fetchPlacements();
      resetForm();
    } catch (err) {
      console.error("Failed to submit placement", err);
      alert("Failed to submit placement. Please check your inputs.");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "PENDING_VERIFICATION":
        return <span className={`${styles.statusBadge} ${styles.statusPending}`}><FaClock /> Under Review</span>;
      case "VERIFIED":
        return <span className={`${styles.statusBadge} ${styles.statusVerified}`}><FaCheckCircle /> Verified</span>;
      case "REJECTED":
        return <span className={`${styles.statusBadge} ${styles.statusRejected}`}><FaExclamationCircle /> Verification Required</span>;
      default:
        return <span className={`${styles.statusBadge} ${styles.statusPending}`}><FaClock /> Under Review</span>;
    }
  };

  const getStatusMessage = (status) => {
    switch (status) {
      case "PENDING_VERIFICATION":
        return "Your placement has been submitted and is awaiting verification.";
      case "VERIFIED":
        return "Your placement has been verified by SURE TRUST.";
      case "REJECTED":
        return "Verification Required";
      default:
        return null;
    }
  };

  const allowedStatuses = ["COHORT_ASSIGNED", "TRAINING", "INTERNSHIP_ASSIGNED", "COMPLETED", "PLACED", "ALUMNI"];
  const canReportPlacement = applicationStatus && allowedStatuses.includes(applicationStatus);

  if (loading) {
    return <div className={styles.container}><SkeletonLoader variant="cards" count={3} /></div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Report Your Placement</h1>
        <p className={styles.subtitle}>
          Share your success! Reported placements are reviewed by the SURE TRUST team before they are officially verified and included in our global impact statistics.
        </p>
      </div>

      <div className={styles.grid}>
        <div>
        {canReportPlacement && (
          !isFormVisible && placements.length > 0 ? (
            <button className={styles.submitBtn} onClick={() => setIsFormVisible(true)}>
              <FaPlus /> Report Another Placement
            </button>
          ) : (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <FaBriefcase /> {editingId ? "Update Placement" : "Placement Details"}
              </h2>
              
              <div className={styles.infoBox}>
                Your submission will be reviewed by the SURE TRUST team before it is verified and included in public placement statistics.
              </div>

              <form onSubmit={handleSubmit}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label htmlFor="placement_company_name" className={styles.label}>Company Name *</label>
                    <input
                      id="placement_company_name"
                      type="text"
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleInputChange}
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="placement_designation" className={styles.label}>Designation *</label>
                    <input
                      id="placement_designation"
                      type="text"
                      name="designation"
                      value={formData.designation}
                      onChange={handleInputChange}
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="placement_employment_type" className={styles.label}>Employment Type *</label>
                    <select
                      id="placement_employment_type"
                      name="employment_type"
                      value={formData.employment_type}
                      onChange={handleInputChange}
                      className={styles.select}
                      required
                    >
                      {EMPLOYMENT_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="placement_joining_date" className={styles.label}>Joining Date *</label>
                    <input
                      id="placement_joining_date"
                      type="date"
                      name="joining_date"
                      value={formData.joining_date}
                      onChange={handleInputChange}
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="placement_official_email" className={styles.label}>Official Company Email (Optional)</label>
                    <input
                      id="placement_official_email"
                      type="email"
                      name="official_email"
                      value={formData.official_email}
                      onChange={handleInputChange}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="placement_linkedin_url" className={styles.label}>LinkedIn URL (Optional)</label>
                    <input
                      id="placement_linkedin_url"
                      type="url"
                      name="linkedin_url"
                      value={formData.linkedin_url}
                      onChange={handleInputChange}
                      className={styles.input}
                      placeholder="https://linkedin.com/in/yourprofile"
                    />
                  </div>

                  <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                    <label htmlFor="placement_evidence_file" className={styles.label}>Employment Evidence / Offer Letter (Optional)</label>
                    <input
                      id="placement_evidence_file"
                      type="file"
                      onChange={handleFileChange}
                      className={styles.fileInput}
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    />
                  </div>

                  <div className={styles.fullWidth} style={{ display: 'flex', gap: '12px' }}>
                    {placements.length > 0 && (
                      <button type="button" className={styles.editBtn} onClick={resetForm} style={{ flex: 1, marginTop: 0 }}>
                        Cancel
                      </button>
                    )}
                    <button type="submit" className={styles.submitBtn} disabled={submitting} style={{ flex: 2 }}>
                      {submitting ? <FaSpinner className={styles.spinner} /> : (editingId ? "Update Submission" : "Submit Placement")}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )
        )}
        </div>

        <div>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>My Placements</h2>
            
            <div className={styles.placementList}>
              {placements.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}><FaBriefcase /></div>
                  <h3>No Placements Reported</h3>
                  {canReportPlacement ? (
                    <p>Have you been placed? Use the form to report your placement!</p>
                  ) : (
                    <p>You can report your placements here once you are assigned to a cohort.</p>
                  )}
                </div>
              ) : (
                placements.map(placement => (
                  <div key={placement.id} className={styles.placementItem}>
                    <div className={styles.placementHeader}>
                      <div>
                        <h3 className={styles.company}>{placement.company_name}</h3>
                        <p className={styles.designation}>{placement.designation}</p>
                      </div>
                      {getStatusBadge(placement.status)}
                    </div>
                    
                    <div className={styles.placementDetails}>
                      <div className={styles.detailRow}>
                        <FaCalendarAlt className={styles.detailIcon} />
                        {placement.joining_date}
                      </div>
                      <div className={styles.detailRow}>
                        <FaBriefcase className={styles.detailIcon} />
                        {EMPLOYMENT_TYPES.find(t => t.value === placement.employment_type)?.label || placement.employment_type}
                      </div>
                    </div>

                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 0 }}>
                      {getStatusMessage(placement.status)}
                    </p>

                    {placement.status === "REJECTED" && placement.verification_remarks && (
                      <div className={styles.remarksBox}>
                        <div className={styles.remarksTitle}>Remarks:</div>
                        {placement.verification_remarks}
                      </div>
                    )}

                    {placement.status !== "VERIFIED" && (
                      <button className={styles.editBtn} onClick={() => handleEdit(placement)}>
                        Edit Submission
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Placements;
