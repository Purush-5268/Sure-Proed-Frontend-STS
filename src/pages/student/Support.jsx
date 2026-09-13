import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import PageHeader from "../../components/ui/PageHeader";
import GlassCard from "../../components/common/GlassCard";
import { supportService } from "../../services/supportService";
import { studentService } from "../../services/studentService";
import { FiMessageSquare, FiHelpCircle, FiSend, FiClock, FiCheckCircle, FiAlertCircle } from "react-icons/fi";
import styles from "./Support.module.css";
import MentorFeedbackForm from "./MentorFeedbackForm";
import FeedbackWidgetModal from "../../components/common/FeedbackWidgetModal";

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
  
  // Profile state for Mentor Feedback
  const [profile, setProfile] = useState(null);
  const [inlineFeedbackState, setInlineFeedbackState] = useState("idle");

  useEffect(() => {
    if (activeTab === "request" && requestSubTab === "my_requests") {
      fetchMyRequests();
    }
  }, [activeTab, requestSubTab]);

  useEffect(() => {
    // Fetch profile to get modules and mentors
    if (user?.email) {
      studentService.getStudentProfiles({ user__email: user.email })
        .then(res => {
          const profileData = res?.data || res;
          const profileObj = Array.isArray(profileData?.results) ? profileData.results[0] : (Array.isArray(profileData) ? profileData[0] : profileData);
          setProfile(profileObj);
        })
        .catch(err => console.error("Failed to load profile for feedback", err));
    }
  }, [user]);

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

  // Feedback submission is now handled individually by the respective components

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
              
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginBottom: '8px' }}>Share your experience</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Your feedback helps us improve your learning experience.</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
                <div style={{ display: 'flex', background: 'var(--bg-nested)', padding: '6px', borderRadius: '12px', gap: '8px' }}>
                  <button 
                    onClick={() => setFeedbackSubTab('COURSE')}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: feedbackSubTab === 'COURSE' ? 'var(--primary-color)' : 'transparent', color: feedbackSubTab === 'COURSE' ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' }}
                  >
                    🎓 Class & Tutor Review
                  </button>
                  <button 
                    onClick={() => setFeedbackSubTab('SYSTEM')}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: feedbackSubTab === 'SYSTEM' ? 'var(--primary-color)' : 'transparent', color: feedbackSubTab === 'SYSTEM' ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' }}
                  >
                    💬 App & Support
                  </button>
                </div>
              </div>

              <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <AnimatePresence mode="wait">
                  {feedbackSubTab === "COURSE" && (
                    <motion.div key="COURSE" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                      <MentorFeedbackForm profile={profile} />
                    </motion.div>
                  )}
                  {feedbackSubTab === "SYSTEM" && (
                    <motion.div key="SYSTEM" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                      <FeedbackWidgetModal 
                        inline={true}
                        feedbackState={inlineFeedbackState}
                        setFeedbackState={setInlineFeedbackState}
                        showClose={true}
                        handleClose={() => setInlineFeedbackState("idle")}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </div>
  );
}

export default Support;
