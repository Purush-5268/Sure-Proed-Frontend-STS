import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./CSRRequestDetails.module.css";
import { FaArrowLeft, FaBuilding, FaUser, FaEnvelope, FaPhoneAlt, FaClock, FaCheckCircle, FaTasks, FaTimesCircle, FaSave } from "react-icons/fa";
import { useAuth } from "../../context/AuthContext";

function CSRRequestDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  const [status, setStatus] = useState("");
  const [adminNotes, setAdminNotes] = useState("");

  const fetchRequestDetails = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(API_ENDPOINTS.COMMUNICATIONS.ADMIN_CSR_REQUEST_BY_ID(id));
      setRequest(res.data);
      setStatus(res.data.status);
      setAdminNotes(res.data.admin_notes || "");
    } catch (error) {
      console.error("Error fetching request details:", error);
      alert("Failed to load request details");
      navigate("/admin/csr-requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequestDetails();
  }, [id]);

  const handleUpdate = async () => {
    try {
      setUpdating(true);
      const payload = {
        status,
        admin_notes: adminNotes
      };
      
      // Auto-set contacted_by if status changes from NEW to something else and hasn't been set
      if (status !== "NEW" && !request.contacted_by) {
        payload.contacted_by = user?.id;
        payload.contacted_at = new Date().toISOString();
      }

      await apiClient.patch(API_ENDPOINTS.COMMUNICATIONS.ADMIN_CSR_REQUEST_BY_ID(id), payload);
      alert("✅ CSR request updated successfully!");
      fetchRequestDetails();
    } catch (error) {
      console.error("Error updating request:", error);
      alert("❌ Failed to update request.");
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (s) => {
    switch (s) {
      case "NEW": return <span className={`${styles.statusBadge} ${styles.statusNew}`}><FaClock /> New</span>;
      case "CONTACTED": return <span className={`${styles.statusBadge} ${styles.statusContacted}`}><FaCheckCircle /> Contacted</span>;
      case "IN_PROGRESS": return <span className={`${styles.statusBadge} ${styles.statusInProgress}`}><FaTasks /> In Progress</span>;
      case "CLOSED": return <span className={`${styles.statusBadge} ${styles.statusClosed}`}><FaTimesCircle /> Closed</span>;
      default: return <span className={styles.statusBadge}>{s}</span>;
    }
  };

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <SkeletonLoader variant="form" rows={5} />
      </div>
    );
  }

  if (!request) return null;

  return (
    <div className={styles.pageContainer}>
      <div className={styles.header}>
        <Link to="/admin/csr-requests" className={styles.backLink}>
          <FaArrowLeft /> Back to List
        </Link>
        <div className={styles.headerContent}>
          <h2>{request.organization}</h2>
          {getStatusBadge(request.status)}
        </div>
        <p className={styles.reqId}>Request ID: <strong>{request.reference_id}</strong></p>
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          <div className={styles.card}>
            <h3>Message & Details</h3>
            
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Area of Interest:</span>
              <span className={styles.detailValue}><strong>{request.area_of_interest}</strong></span>
            </div>
            
            <div className={styles.messageBox}>
              <h4>Enquiry Message</h4>
              <p>{request.message}</p>
            </div>
            
            <div className={styles.timestampInfo}>
              Received on {new Date(request.created_at).toLocaleString()}
            </div>
          </div>

          <div className={styles.card}>
            <h3>Admin Management</h3>
            
            <div className={styles.formGroup}>
              <label>Status</label>
              <select 
                value={status} 
                onChange={(e) => setStatus(e.target.value)}
                className={styles.selectInput}
              >
                <option value="NEW">New</option>
                <option value="CONTACTED">Contacted</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Internal Notes</label>
              <textarea 
                value={adminNotes} 
                onChange={(e) => setAdminNotes(e.target.value)}
                className={styles.textareaInput}
                placeholder="Add notes about your contact with this organization..."
                rows={5}
              />
            </div>
            
            {request.contacted_by_name && (
              <div className={styles.contactedByInfo}>
                Initially contacted by {request.contacted_by_name} on {new Date(request.contacted_at).toLocaleDateString()}
              </div>
            )}

            <button 
              onClick={handleUpdate} 
              disabled={updating}
              className={styles.saveBtn}
            >
              {updating ? "Saving..." : <><FaSave /> Save Changes</>}
            </button>
          </div>
        </div>

        <div className={styles.sideColumn}>
          <div className={styles.card}>
            <h3>Contact Information</h3>
            
            <div className={styles.contactItem}>
              <FaUser />
              <div>
                <strong>{request.name}</strong>
                {request.designation && <span>{request.designation}</span>}
              </div>
            </div>
            
            <div className={styles.contactItem}>
              <FaBuilding />
              <div>
                <strong>Organization</strong>
                <span>{request.organization}</span>
              </div>
            </div>
            
            <div className={styles.contactItem}>
              <FaEnvelope />
              <div>
                <strong>Email</strong>
                <a href={`mailto:${request.email}`}>{request.email}</a>
              </div>
            </div>
            
            {request.phone && (
              <div className={styles.contactItem}>
                <FaPhoneAlt />
                <div>
                  <strong>Phone</strong>
                  <a href={`tel:${request.phone}`}>{request.phone}</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CSRRequestDetails;
