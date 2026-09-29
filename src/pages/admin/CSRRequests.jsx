import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./CSRRequests.module.css";
import { FaEye, FaBuilding, FaUser, FaEnvelope, FaPhoneAlt, FaCheckCircle, FaClock, FaTimesCircle, FaTasks } from "react-icons/fa";

function CSRRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(API_ENDPOINTS.COMMUNICATIONS.ADMIN_CSR_REQUESTS, {
        params: {
          search: searchTerm || undefined,
          status: statusFilter || undefined
        }
      });
      // Handle pagination or array directly
      setRequests(res.data.results || res.data || []);
    } catch (error) {
      console.error("Error fetching CSR requests:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [searchTerm, statusFilter]);

  const getStatusBadge = (status) => {
    switch (status) {
      case "NEW": return <span className={`${styles.statusBadge} ${styles.statusNew}`}><FaClock /> New</span>;
      case "CONTACTED": return <span className={`${styles.statusBadge} ${styles.statusContacted}`}><FaCheckCircle /> Contacted</span>;
      case "IN_PROGRESS": return <span className={`${styles.statusBadge} ${styles.statusInProgress}`}><FaTasks /> In Progress</span>;
      case "CLOSED": return <span className={`${styles.statusBadge} ${styles.statusClosed}`}><FaTimesCircle /> Closed</span>;
      default: return <span className={styles.statusBadge}>{status}</span>;
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.header}>
        <div>
          <h2>CSR Partnership Enquiries</h2>
          <p>Manage and track all corporate partnership leads</p>
        </div>
      </div>

      <div className={styles.filtersContainer}>
        <div className={styles.searchBox}>
          <input
            type="text"
            placeholder="Search by name, organization, email or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.filterBox}>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.statusSelect}
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="CONTACTED">Contacted</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "20px 0" }}>
          <SkeletonLoader variant="table" rows={6} />
        </div>
      ) : requests.length === 0 ? (
        <div className={styles.emptyState}>
          <FaBuilding size={48} color="#9ca3af" />
          <h3>No Enquiries Found</h3>
          <p>There are no CSR partnership enquiries matching your criteria.</p>
        </div>
      ) : (
        <div className={styles.gridContainer}>
          <AnimatePresence>
            {requests.map((req) => (
              <motion.div 
                key={req.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={styles.requestCard}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.reqId}>{req.reference_id}</div>
                  {getStatusBadge(req.status)}
                </div>

                <div className={styles.cardBody}>
                  <h3 className={styles.orgName}><FaBuilding /> {req.organization}</h3>
                  <div className={styles.contactInfo}>
                    <p><FaUser /> {req.name} {req.designation ? `(${req.designation})` : ''}</p>
                    <p><FaEnvelope /> <a href={`mailto:${req.email}`}>{req.email}</a></p>
                    {req.phone && <p><FaPhoneAlt /> <a href={`tel:${req.phone}`}>{req.phone}</a></p>}
                  </div>
                  
                  <div className={styles.interestArea}>
                    <strong>Interest:</strong> {req.area_of_interest}
                  </div>
                  
                  <div className={styles.dateInfo}>
                    Received: {new Date(req.created_at).toLocaleString()}
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <Link to={`/admin/csr-requests/${req.id}`} className={styles.viewBtn}>
                    <FaEye /> View Details & Manage
                  </Link>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default CSRRequests;
