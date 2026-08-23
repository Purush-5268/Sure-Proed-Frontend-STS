import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { FiCheckCircle, FiXCircle, FiLoader } from "react-icons/fi";
import GlassCard from "../../components/common/GlassCard";

/**
 * Public QR verification page.
 * Backend endpoint: GET /api/offer-letters/verify/{uuid}/
 *
 * Backend response fields:
 *   valid: boolean
 *   status: string (e.g. "COHORT_ASSIGNED", "SUSPENDED")
 *   uuid: string
 *   full_name: string
 *   domain_of_internship: string
 *   duration: string (months)
 *   start_date: string ("DD-MM-YYYY")
 *   mentor: string
 */
function OfferLetterVerify() {
  const { hash } = useParams();
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    const verifyDocument = async () => {
      if (!hash) return;
      try {
        // Use native fetch to avoid triggering the global apiClient 401 interceptor (which redirects to login)
        const baseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/api\/?$/, "");
        const response = await fetch(`${baseUrl}/api/offer-letters/verify/${hash}/`);
        
        if (!response.ok) {
           const data = await response.json().catch(() => ({}));
           throw { response: { data } };
        }
        
        const data = await response.json();
        
        if (!data.valid) {
          if (data.status === "SUSPENDED") {
            setSuspended(true);
            setError("This offer letter is currently suspended due to cohort suspension.");
          } else {
            setError(data.message || "Document verification failed.");
          }
        } else {
          setVerificationResult(data);
        }
      } catch (err) {
        const data = err.response?.data;
        if (data?.status === "SUSPENDED") {
          setSuspended(true);
          setError("This offer letter is currently suspended due to cohort suspension.");
        } else {
          setError(data?.message || data?.error || "Document verification failed or the document does not exist.");
        }
      } finally {
        setLoading(false);
      }
    };

    verifyDocument();
  }, [hash]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px', background: 'var(--bg-default)' }}>
      <GlassCard style={{ maxWidth: '600px', width: '100%', padding: '40px', textAlign: 'center' }}>
        <h1 style={{ color: 'var(--text-primary)', marginBottom: '20px' }}>SURE ProEd Document Verification</h1>
        
        {loading && (
          <div style={{ padding: '40px 0' }}>
            <FiLoader size={48} color="var(--primary-color)" style={{ animation: "spin 1s linear infinite" }} />
            <p style={{ marginTop: '20px', color: 'var(--text-secondary)' }}>Verifying digital signature...</p>
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: '20px', background: suspended ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${suspended ? '#f59e0b' : '#ef4444'}`, borderRadius: '12px' }}>
            <FiXCircle size={64} color={suspended ? '#f59e0b' : '#ef4444'} style={{ marginBottom: '16px' }} />
            <h2 style={{ color: suspended ? '#d97706' : '#b91c1c', margin: '0 0 12px 0' }}>
              {suspended ? 'Access Suspended' : 'Verification Failed'}
            </h2>
            <p style={{ color: 'var(--text-primary)', margin: 0 }}>{error}</p>
            {suspended && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>
                The student's cohort access has been temporarily suspended. The letter was validly issued but is not currently active.
              </p>
            )}
          </div>
        )}

        {!loading && verificationResult && (
          <div style={{ padding: '30px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '16px' }}>
            <div style={{ display: 'inline-flex', background: '#10b981', borderRadius: '50%', padding: '16px', marginBottom: '20px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}>
              <FiCheckCircle size={48} color="#ffffff" />
            </div>
            
            <h2 style={{ color: '#047857', fontSize: '28px', margin: '0 0 8px 0' }}>Verified Offer Letter</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>This document is authentic and issued by SURE Trust.</p>
            
            <div style={{ textAlign: 'left', background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
              <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>Candidate Name</span>
                <strong style={{ fontSize: '18px', color: 'var(--text-primary)' }}>{verificationResult.full_name}</strong>
              </div>
              <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>Domain of Internship</span>
                <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>{verificationResult.domain_of_internship || "N/A"}</strong>
              </div>
              <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>Duration</span>
                <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>{verificationResult.duration ? `${verificationResult.duration} months` : "N/A"}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>Cohort Start Date</span>
                <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>{verificationResult.start_date || "N/A"}</strong>
              </div>
              
              {(verificationResult.internship_phase || verificationResult.phase) && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>Current Internship Phase</span>
                  <strong style={{ fontSize: '16px', color: '#047857', background: '#d1fae5', padding: '4px 8px', borderRadius: '4px', width: 'fit-content' }}>
                    {verificationResult.internship_phase || verificationResult.phase}
                  </strong>
                </div>
              )}
            </div>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '13px', color: '#475569', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
              Verification ID: <code style={{ wordBreak: 'break-all' }}>{hash}</code>
            </div>
          </div>
        )}

        <div style={{ marginTop: '30px' }}>
          <Link to="/" className="premium-btn premium-btn-secondary">
            Return to Homepage
          </Link>
        </div>
      </GlassCard>
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default OfferLetterVerify;
