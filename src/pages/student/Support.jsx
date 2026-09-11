import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import PageHeader from "../../components/ui/PageHeader";
import GlassCard from "../../components/common/GlassCard";
import { supportService } from "../../services/supportService";
import { FiMessageSquare, FiHelpCircle, FiSend, FiClock, FiCheckCircle, FiAlertCircle } from "react-icons/fi";
import styles from "./Support.module.css"; // We will create this

const REQUEST_CATEGORIES = [
  { value: "OFFER_LETTER", label: "Offer Letter Request" },
  { value: "CERTIFICATE", label: "Certificate Issue Request" },
  { value: "VOLUNTEER_JOINING", label: "Volunteer Joining Request" },
  { value: "ASSIGNMENT_EXAM", label: "Assignment / Marks Query" },
  { value: "COURSE_INQUIRY", label: "Course / Curriculum Inquiry" },
  { value: "ATTENDANCE", label: "Attendance Correction" },
  { value: "TECHNICAL_ISSUE", label: "Technical Issue / Bug" },
  { value: "LEAVE_REQUEST", label: "Leave Request" }
];

const FEEDBACK_CATEGORIES = [
  { value: "COURSE", label: "Classes & Tutor Review" },
  { value: "SYSTEM", label: "General & App Support" }
];

function Support() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("request");
  const [requestSubTab, setRequestSubTab] = useState("new");
  const [feedbackSubTab, setFeedbackSubTab] = useState("COURSE");
  
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingRequests, setFetchingRequests] = useState(false);

  const [requestData, setRequestData] = useState({ category: "TECHNICAL_ISSUE", subject: "", description: "" });
  const [feedbackData, setFeedbackData] = useState({ rating: 5, comments: "" });

  useEffect(() => {
    if (activeTab === "request" && requestSubTab === "my_requests") {
      fetchMyRequests();
    }
  }, [activeTab, requestSubTab]);

  const fetchMyRequests = async () => {
    setFetchingRequests(true);
    try {
      const data = await supportService.getMyRequests();
      setMyRequests(data);
    } catch (error) {
      console.error("Failed to fetch requests", error);
    } finally {
      setFetchingRequests(false);
    }
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await supportService.createRequest({ ...requestData, sender_role: "STUDENT" });
      alert("Request submitted successfully!");
      setRequestData({ category: "TECHNICAL_ISSUE", subject: "", description: "" });
      setRequestSubTab("my_requests");
    } catch (err) {
      alert("Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await supportService.submitFeedback({
        feedback_type: feedbackSubTab,
        rating: feedbackData.rating,
        comments: feedbackData.comments
      });
      alert("Feedback submitted successfully. Thank you!");
      setFeedbackData({ rating: 5, comments: "" });
    } catch (err) {
      alert("Failed to submit feedback.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="premium-page-container">
      <PageHeader
        title="Help & Support"
        subtitle="Submit requests to the administration team or share your feedback."
        icon={<FiHelpCircle />}
      />

      <div className={styles.mainTabs}>
        <button className={`${styles.mainTab} ${activeTab === 'request' ? styles.activeMainTab : ''}`} onClick={() => setActiveTab('request')}>
          <FiMessageSquare /> Request Form
        </button>
        <button className={`${styles.mainTab} ${activeTab === 'feedback' ? styles.activeMainTab : ''}`} onClick={() => setActiveTab('feedback')}>
          <FiCheckCircle /> Feedback & Support
        </button>
      </div>

      <GlassCard>
        <AnimatePresence mode="wait">
          {activeTab === "request" && (
            <motion.div key="request" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className={styles.subTabs}>
                <button className={`${styles.subTab} ${requestSubTab === 'new' ? styles.activeSubTab : ''}`} onClick={() => setRequestSubTab('new')}>New Request</button>
                <button className={`${styles.subTab} ${requestSubTab === 'my_requests' ? styles.activeSubTab : ''}`} onClick={() => setRequestSubTab('my_requests')}>My Requests ({myRequests.length})</button>
              </div>

              {requestSubTab === "new" ? (
                <form onSubmit={handleRequestSubmit} className="premium-form" style={{ marginTop: "20px" }}>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>
                    Send a request to the SURE ProEd administration team. You can follow its status and resolution notes here.
                  </p>
                  
                  <div className="premium-form-group">
                    <label className="premium-label">Request Category</label>
                    <select 
                      className="premium-input" 
                      value={requestData.category} 
                      onChange={e => setRequestData({...requestData, category: e.target.value})}
                      required
                    >
                      {REQUEST_CATEGORIES.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="premium-form-group">
                    <label className="premium-label">Subject</label>
                    <input 
                      type="text" 
                      className="premium-input" 
                      placeholder="Brief description of the issue" 
                      value={requestData.subject}
                      onChange={e => setRequestData({...requestData, subject: e.target.value})}
                      required 
                    />
                  </div>

                  <div className="premium-form-group">
                    <label className="premium-label">Description</label>
                    <textarea 
                      className="premium-input" 
                      rows="5" 
                      placeholder="Please provide details about your request..." 
                      value={requestData.description}
                      onChange={e => setRequestData({...requestData, description: e.target.value})}
                      required
                    ></textarea>
                  </div>

                  <button type="submit" className="premium-btn premium-btn-primary" disabled={loading} style={{ marginTop: "16px" }}>
                    {loading ? "Submitting..." : <><FiSend /> Submit Request</>}
                  </button>
                </form>
              ) : (
                <div style={{ marginTop: "20px" }}>
                  {fetchingRequests ? (
                    <p>Loading requests...</p>
                  ) : myRequests.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                      <FiAlertCircle size={40} style={{ marginBottom: "16px", opacity: 0.5 }} />
                      <p>You haven't submitted any requests yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {myRequests.map(req => (
                        <div key={req.id} style={{ padding: "16px", background: "var(--bg-nested)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                            <h4 style={{ margin: 0, color: "var(--text-primary)" }}>{req.subject}</h4>
                            <span style={{ 
                              padding: "4px 10px", 
                              borderRadius: "12px", 
                              fontSize: "12px", 
                              fontWeight: "bold",
                              background: req.status === "RESOLVED" ? "#d1fae5" : req.status === "REJECTED" ? "#fee2e2" : "#fef3c7",
                              color: req.status === "RESOLVED" ? "#065f46" : req.status === "REJECTED" ? "#991b1b" : "#92400e"
                            }}>
                              {req.status}
                            </span>
                          </div>
                          <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--text-secondary)" }}>{req.description}</p>
                          <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", gap: "12px", alignItems: "center" }}>
                            <span><FiClock style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} /> {new Date(req.created_at).toLocaleDateString()}</span>
                            <span style={{ background: "var(--bg-default)", padding: "2px 8px", borderRadius: "8px" }}>
                              {REQUEST_CATEGORIES.find(c => c.value === req.category)?.label || req.category}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "feedback" && (
            <motion.div key="feedback" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className={styles.subTabs}>
                <button className={`${styles.subTab} ${feedbackSubTab === 'COURSE' ? styles.activeSubTab : ''}`} onClick={() => setFeedbackSubTab('COURSE')}>Classes & Tutor Review</button>
                <button className={`${styles.subTab} ${feedbackSubTab === 'SYSTEM' ? styles.activeSubTab : ''}`} onClick={() => setFeedbackSubTab('SYSTEM')}>General & App Support</button>
              </div>

              <form onSubmit={handleFeedbackSubmit} className="premium-form" style={{ marginTop: "20px" }}>
                <div className="premium-form-group">
                  <label className="premium-label">Overall Rating</label>
                  <div style={{ display: "flex", gap: "16px" }}>
                    {[1, 2, 3, 4, 5].map(num => (
                      <label key={num} style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                        <input type="radio" name="rating" value={num} checked={feedbackData.rating === num} onChange={() => setFeedbackData({...feedbackData, rating: num})} />
                        {num} {num === 1 ? "Poor" : num === 5 ? "Excellent" : ""}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="premium-form-group">
                  <label className="premium-label">{feedbackSubTab === 'COURSE' ? 'What did you like about the classes and tutor?' : 'What do you like about the platform?'}</label>
                  <textarea 
                    className="premium-input" 
                    rows="4" 
                    placeholder="Share your positive thoughts..."
                    value={feedbackData.comments}
                    onChange={e => setFeedbackData({...feedbackData, comments: e.target.value})}
                    required
                  ></textarea>
                </div>

                <button type="submit" className="premium-btn premium-btn-primary" disabled={loading} style={{ marginTop: "16px" }}>
                  {loading ? "Submitting..." : <><FiSend /> Submit Anonymous Feedback</>}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </div>
  );
}

export default Support;
