import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient, { normalizeListResponse } from "../../services/apiClient";
import { certificateService } from "../../services/certificateService";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { motion } from "framer-motion";
import PageHeader from "../../components/ui/PageHeader";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./CertificateList.module.css";
import { useAuth } from "../../context/AuthContext";
import { studentService } from "../../services/studentService";

function CertificateList() {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const [certRes, profileRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.CERTIFICATES.BASE).catch(() => ({ data: [] })),
          user?.email ? studentService.getStudentProfiles({ user__email: user.email }).catch(() => null) : Promise.resolve(null)
        ]);

        if (isMounted) {
          setCertificates(normalizeListResponse(certRes?.data));
          
          const profileData = profileRes?.data || profileRes;
          const profileObj = Array.isArray(profileData?.results) ? profileData.results[0] : (Array.isArray(profileData) ? profileData[0] : profileData);
          
          if (profileObj?.current_application) {
            const status = profileObj.current_application.cohort_status || profileObj.current_application.status;
            setIsCompleted(status === "COMPLETED");
          }
          setProfileLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load certificate data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="premium-page-container">
      <PageHeader 
        title="My Certificates" 
        description="View and download your official course and internship completion certificates."
      />

      <div className="premium-card" style={{ maxWidth: '900px', margin: '0 auto', padding: '1.75rem' }}>
        
        {!loading && profileLoaded && (
          <div style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            borderRadius: '10px',
            background: isCompleted ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            border: `1px solid ${isCompleted ? '#10b981' : '#f59e0b'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: isCompleted ? '#059669' : '#d97706' }}>
              {isCompleted ? "🎉 Internship Completed!" : "⏳ Certificate Eligibility"}
            </h3>
            <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)' }}>
              {isCompleted 
                ? "Congratulations on completing your internship! You are now eligible to receive your certificate." 
                : "You need to complete this internship before you can request a certificate."}
            </p>
            {isCompleted && (
              <a 
                href="mailto:admin@sureproed.com?subject=Certificate Request&body=Hello Admin,%0D%0A%0D%0AI have completed my internship and would like to request my certificate.%0D%0A%0D%0AThank you."
                className="premium-btn premium-btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Ask for Certificate
              </a>
            )}
          </div>
        )}

        {loading ? (
          <SkeletonLoader variant="table" rows={4} />
        ) : certificates.length === 0 ? (
          <EmptyState 
            icon={<span style={{ fontSize: '2rem' }}>🎓</span>}
            title="No Certificates Found" 
            description="You don't have any certificates issued yet. Certificates will appear here once issued by the administration."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h2 className="sr-only">Issued Certificates</h2>
            {certificates.map((certificate, idx) => (
              <motion.div 
                key={certificate.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                whileHover={{ scale: 1.01 }}
                style={{ 
                  background: 'var(--bg-nested)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px', 
                  padding: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}
              >
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="premium-badge premium-badge-active">
                      {certificate.status || "ACTIVE"}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {certificate.certificate_type_display || certificate.certificate_type || "Course"}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                    {certificate.subject_display || certificate.title || certificate.certificate_type_display || "Certificate"}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <strong>ID:</strong> {certificate.certificate_number || certificate.id} &nbsp;|&nbsp; 
                    <strong>Code:</strong> <code>{certificate.verification_code}</code> &nbsp;|&nbsp;
                    <strong>Issued:</strong> {formatDate(certificate.issued_at)}
                  </p>
                </div>
                
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => certificateService.downloadCertificate(certificate)}
                    className="premium-btn premium-btn-secondary"
                    style={{ padding: "8px 14px", fontSize: "14px", cursor: "pointer", border: "none" }}
                    title="Download Certificate PDF"
                  >
                    📥 PDF
                  </button>
                  <Link 
                    to="/student/certificate-view" 
                    state={{ certificate }} 
                    className="premium-btn premium-btn-primary"
                    aria-label={`View certificate ${certificate.certificate_number || certificate.id || ''}`.trim()}
                  >
                    View Details →
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CertificateList;