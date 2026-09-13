import React, { useState } from "react";
import { motion } from "framer-motion";
import { FaSpinner } from "react-icons/fa";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import feedbackGoodUrl from "../../assets/animations/feedback-giving.lottie?url";

export default function MentorFeedbackForm({ profile }) {
  const currentApp = profile?.current_application;
  
  // Extract modules and mentors from authoritative profile state
  const modules = currentApp?.applied_course?.modules || [];
  
  // Combine current mentor and any other assigned mentors, ensuring uniqueness by ID
  const allMentors = [];
  if (currentApp?.assigned_cohort?.current_mentor_details) {
    allMentors.push(currentApp.assigned_cohort.current_mentor_details);
  }
  (currentApp?.assigned_cohort?.mentors || []).forEach(m => {
    const mId = m.user || m.id;
    if (!allMentors.find(existing => (existing.user || existing.id) === mId)) {
      allMentors.push(m);
    }
  });

  const [formData, setFormData] = useState({
    module: "",
    related_id: "", // mentor UUID
    rating: "",
    explanation_rating: "",
    interaction_rating: "",
    comments: "",
    improvements_text: ""
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        feedback_type: "MENTOR",
        ...formData
      };
      
      await apiClient.post(API_ENDPOINTS.FEEDBACK.BASE, payload);
      setSuccess(true);
      
      // Auto-reset after a few seconds
      setTimeout(() => {
        setSuccess(false);
        setFormData({
          module: "",
          related_id: "",
          rating: "",
          explanation_rating: "",
          interaction_rating: "",
          comments: "",
          improvements_text: ""
        });
      }, 3000);
    } catch (err) {
      console.error("Mentor feedback submission failed", err);
      // Try to extract readable error
      const errorMsg = err.response?.data?.detail || 
                       err.response?.data?.non_field_errors?.[0] || 
                       "Failed to submit feedback. Please ensure all fields are filled out.";
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (success) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ height: "180px", display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "20px" }}>
          <DotLottieReact src={feedbackGoodUrl} loop autoplay />
        </div>
        <h3 style={{ color: "var(--text-primary)", fontSize: "24px", marginBottom: "12px" }}>Thank you!</h3>
        <p style={{ color: "var(--text-secondary)" }}>Your feedback has been submitted anonymously.</p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {error && (
        <div style={{ padding: "12px", background: "#fee2e2", color: "#991b1b", borderRadius: "8px", fontSize: "14px", border: "1px solid #fca5a5" }}>
          {error}
        </div>
      )}

      {/* SECTION 1: SELECTIONS */}
      <div style={{ background: "var(--bg-nested)", padding: "20px", borderRadius: "16px", border: "1px solid var(--border-color)" }}>
        <h4 style={{ margin: "0 0 16px 0", color: "var(--text-primary)", fontSize: "16px" }}>Cohort Module & Mentor Selection</h4>
        
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", color: "var(--text-secondary)", fontWeight: "500" }}>Select Cohort Module *</label>
          <select 
            required
            value={formData.module}
            onChange={(e) => updateField("module", e.target.value)}
            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--border-color)", background: "var(--bg-default)", color: "var(--text-primary)", fontSize: "15px", outline: "none", appearance: "auto" }}
          >
            <option value="">— Select a module —</option>
            {modules.map(mod => (
              <option key={mod.id} value={mod.id}>{mod.name || mod.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", color: "var(--text-secondary)", fontWeight: "500" }}>Select Cohort Mentor / Tutor *</label>
          <select 
            required
            value={formData.related_id}
            onChange={(e) => updateField("related_id", e.target.value)}
            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--border-color)", background: "var(--bg-default)", color: "var(--text-primary)", fontSize: "15px", outline: "none", appearance: "auto" }}
          >
            <option value="">— Select a mentor —</option>
            {allMentors.map(m => {
              const mId = m.user || m.id;
              return (
                <option key={mId} value={mId}>
                  {m.full_name || m.name || m.first_name || `Mentor ${mId?.slice(0, 6)}`}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* QUESTION 1 */}
      <div style={{ background: "var(--bg-nested)", padding: "20px", borderRadius: "16px", border: "1px solid var(--border-color)" }}>
        <label style={{ display: "block", marginBottom: "16px", fontSize: "15px", color: "var(--text-primary)", fontWeight: "bold" }}>How would you rate the classes overall? <span style={{color: "#ef4444"}}>*</span></label>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[
            { label: "Excellent", value: 5 },
            { label: "Good", value: 4 },
            { label: "Average", value: 3 },
            { label: "Poor", value: 2 }
          ].map(opt => (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", fontSize: "15px", color: "var(--text-primary)" }}>
              <input type="radio" required name="rating" value={opt.value} checked={formData.rating == opt.value} onChange={() => updateField("rating", opt.value)} style={{ width: "20px", height: "20px", accentColor: "var(--primary-color)" }} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* QUESTION 2 */}
      <div style={{ background: "var(--bg-nested)", padding: "20px", borderRadius: "16px", border: "1px solid var(--border-color)" }}>
        <label style={{ display: "block", marginBottom: "16px", fontSize: "15px", color: "var(--text-primary)", fontWeight: "bold" }}>How was the tutor's explanation of concepts? <span style={{color: "#ef4444"}}>*</span></label>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[
            { label: "Very clear", value: "VERY_CLEAR" },
            { label: "Clear", value: "CLEAR" },
            { label: "Average", value: "AVERAGE" },
            { label: "Difficult to understand", value: "DIFFICULT_TO_UNDERSTAND" }
          ].map(opt => (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", fontSize: "15px", color: "var(--text-primary)" }}>
              <input type="radio" required name="explanation_rating" value={opt.value} checked={formData.explanation_rating === opt.value} onChange={() => updateField("explanation_rating", opt.value)} style={{ width: "20px", height: "20px", accentColor: "var(--primary-color)" }} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* QUESTION 3 */}
      <div style={{ background: "var(--bg-nested)", padding: "20px", borderRadius: "16px", border: "1px solid var(--border-color)" }}>
        <label style={{ display: "block", marginBottom: "16px", fontSize: "15px", color: "var(--text-primary)", fontWeight: "bold" }}>Was the tutor interactive and approachable for doubts? <span style={{color: "#ef4444"}}>*</span></label>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[
            { label: "Yes always", value: "YES_ALWAYS" },
            { label: "Sometimes", value: "SOMETIMES" },
            { label: "No", value: "NO" }
          ].map(opt => (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", fontSize: "15px", color: "var(--text-primary)" }}>
              <input type="radio" required name="interaction_rating" value={opt.value} checked={formData.interaction_rating === opt.value} onChange={() => updateField("interaction_rating", opt.value)} style={{ width: "20px", height: "20px", accentColor: "var(--primary-color)" }} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* QUESTION 4 */}
      <div style={{ background: "var(--bg-nested)", padding: "20px", borderRadius: "16px", border: "1px solid var(--border-color)" }}>
        <label style={{ display: "block", marginBottom: "12px", fontSize: "15px", color: "var(--text-primary)", fontWeight: "bold" }}>What did you like about the classes and tutor? <span style={{color: "#ef4444"}}>*</span></label>
        <textarea 
          required
          rows="4"
          value={formData.comments}
          onChange={(e) => updateField("comments", e.target.value)}
          placeholder="Share what went well during classes..."
          style={{ width: "100%", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-color)", background: "var(--bg-default)", color: "var(--text-primary)", fontSize: "15px", outline: "none", resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      {/* QUESTION 5 */}
      <div style={{ background: "var(--bg-nested)", padding: "20px", borderRadius: "16px", border: "1px solid var(--border-color)" }}>
        <label style={{ display: "block", marginBottom: "12px", fontSize: "15px", color: "var(--text-primary)", fontWeight: "bold" }}>What improvements would you suggest for the tutor/classes? <span style={{color: "#ef4444"}}>*</span></label>
        <textarea 
          required
          rows="4"
          value={formData.improvements_text}
          onChange={(e) => updateField("improvements_text", e.target.value)}
          placeholder="Share your suggestions for improvement..."
          style={{ width: "100%", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-color)", background: "var(--bg-default)", color: "var(--text-primary)", fontSize: "15px", outline: "none", resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting}
        style={{ 
          background: "var(--primary-color)", 
          color: "white", 
          border: "none", 
          padding: "16px", 
          borderRadius: "100px", 
          fontSize: "16px", 
          fontWeight: "bold", 
          cursor: isSubmitting ? "not-allowed" : "pointer", 
          display: "flex", 
          justifyContent: "center", 
          alignItems: "center",
          gap: "8px",
          marginTop: "8px",
          transition: "opacity 0.2s",
          opacity: isSubmitting ? 0.7 : 1
        }}
      >
        {isSubmitting ? <FaSpinner className="spin" /> : "SUBMIT ANONYMOUS FEEDBACK"}
      </button>

    </form>
  );
}
