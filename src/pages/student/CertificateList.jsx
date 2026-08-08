import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { motion } from "framer-motion";
import PageHeader from "../../components/ui/PageHeader";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./CertificateList.module.css";

function CertificateList() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadCertificates = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.CERTIFICATES.BASE);
        if (isMounted) setCertificates(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error("Failed to load certificates:", err);
        if (isMounted) setCertificates([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCertificates();
    return () => {
      isMounted = false;
    };
  }, []);

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
        description="View and download your internship certificates."
      />

      <div className="premium-card" style={{ maxWidth: '900px', margin: '0 auto', padding: '1.75rem' }}>
        {loading ? (
          <SkeletonLoader variant="table" rows={4} />
        ) : certificates.length === 0 ? (
          <EmptyState 
            icon={<span style={{ fontSize: '2rem' }}>🎓</span>}
            title="No Certificates Found" 
            description="You don't have any certificates issued yet."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
                  </div>
                  <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0', color: 'var(--text-primary)' }}>{certificate.certificate_type || "Certificate"}</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <strong>ID:</strong> {certificate.certificate_number || certificate.id} &nbsp;|&nbsp; 
                    <strong> Issued:</strong> {formatDate(certificate.issued_at)}
                  </p>
                </div>
                
                <div>
                  <Link 
                    to="/student/certificate-view" 
                    state={{ certificate }} 
                    className="premium-btn premium-btn-primary"
                  >
                    View Certificate →
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