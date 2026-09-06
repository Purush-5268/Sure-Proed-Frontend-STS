import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { FaTimes, FaSpinner, FaStar } from "react-icons/fa";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import feedbackGoodUrl from "../../assets/animations/feedback-giving.lottie?url";
import feedbackBadUrl from "../../assets/animations/feedback-notgive.lottie?url";
import styles from "./FeedbackWidget.module.css";

// Feedback categories displayed to the user
const FEEDBACK_CATEGORIES = [
  { label: "System", value: "SYSTEM", hasRelated: false },
  { label: "Course", value: "COURSE", hasRelated: true, relatedLabel: "Course" },
  { label: "Training", value: "TRAINING", hasRelated: true, relatedLabel: "Training" },
  { label: "Mentor", value: "MENTOR", hasRelated: true, relatedLabel: "Mentor" },
  { label: "Other", value: "OTHER", hasRelated: false },
];

export default function FeedbackWidgetModal({ handleClose, feedbackState, setFeedbackState, showClose, currentMentor }) {
  const [feedbackType, setFeedbackType] = useState("SYSTEM");
  const [relatedId, setRelatedId] = useState("");
  const [rating, setRating] = useState(5);
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mentor list for the MENTOR feedback type
  const [mentors, setMentors] = useState([]);
  const [loadingMentors, setLoadingMentors] = useState(false);

  // Load mentors when MENTOR type is selected
  useEffect(() => {
    if (feedbackType !== "MENTOR") return;
    setLoadingMentors(true);
    apiClient.get(API_ENDPOINTS.MENTORS.BASE, { params: { page_size: 100 } })
      .then(res => {
        const results = res.data?.results || res.data || [];
        setMentors(Array.isArray(results) ? results : []);
      })
      .catch(() => setMentors([]))
      .finally(() => setLoadingMentors(false));
  }, [feedbackType]);

  // Load existing feedback when type changes
  useEffect(() => {
    const fetchExistingFeedback = async () => {
      try {
        const url = relatedId
          ? `${API_ENDPOINTS.FEEDBACK.BASE}?feedback_type=${feedbackType}&related_id=${relatedId}`
          : `${API_ENDPOINTS.FEEDBACK.BASE}?feedback_type=${feedbackType}`;
        const res = await apiClient.get(url);
        const results = res.data?.results || res.data;
        if (Array.isArray(results) && results.length > 0) {
          const item = results[0];
          setRating(item.rating || 5);
          setComments(item.comments || "");
        } else {
          setRating(5);
          setComments("");
        }
      } catch (err) {
        console.error("Failed to fetch existing feedback", err);
      }
    };
    fetchExistingFeedback();
  }, [feedbackType, relatedId]);

  const submitFeedback = async () => {
    setIsSubmitting(true);
    try {
      const cat = FEEDBACK_CATEGORIES.find(c => c.value === feedbackType);
      const payload = {
        feedback_type: feedbackType,
        rating,
        comments,
      };
      if (cat?.hasRelated && relatedId.trim() !== "") {
        payload.related_id = relatedId.trim();
      }

      await apiClient.post(API_ENDPOINTS.FEEDBACK.BASE, payload);
      setFeedbackState("success");
      setTimeout(() => handleClose(true), 2000);
    } catch (err) {
      console.error("Failed to submit feedback", err);
      setIsSubmitting(false);
      setFeedbackState("error");
      setTimeout(() => handleClose(true), 3000);
    }
  };

  const handleTypeChange = (type) => {
    setFeedbackType(type);
    
    // Default to current mentor if selecting MENTOR category
    if (type === "MENTOR" && currentMentor) {
      setRelatedId(currentMentor.user || currentMentor.id || "");
    } else {
      setRelatedId(""); // Clear related ID on type change for other types
    }
  };

  const currentCat = FEEDBACK_CATEGORIES.find(c => c.value === feedbackType);

  return (
    <div className={styles.overlay} onClick={() => handleClose(false)}>
      <motion.div
        className={styles.modal}
        initial={{ opacity: 0, scale: 0.8, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 50 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        style={{ padding: '24px', width: '100%', maxWidth: '450px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', borderRadius: '24px', position: 'relative', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {showClose && (
          <button className={styles.closeBtn} onClick={() => handleClose(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '20px' }}>
            <FaTimes />
          </button>
        )}

        <div className={styles.content} style={{ textAlign: 'center' }}>
          {feedbackState === "idle" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h3 style={{ color: 'var(--text-primary)', margin: '0 0 12px 0', fontSize: '24px' }}>Enjoying Sure ProEd?</h3>
              <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px 0', fontSize: '15px' }}>We'd love to hear how your experience has been!</p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button onClick={() => { setRating(5); setFeedbackState("form"); }}
                  style={{ padding: '12px 24px', borderRadius: '12px', background: 'var(--primary-color)', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer', flex: 1, fontSize: '15px' }}>
                  Yes, I love it! 😊
                </button>
                <button onClick={() => setFeedbackState("bad_animation")}
                  style={{ padding: '12px 24px', borderRadius: '12px', background: 'var(--bg-nested)', color: 'var(--text-primary)', fontWeight: 'bold', border: '1px solid var(--border-color)', cursor: 'pointer', flex: 1, fontSize: '15px' }}>
                  Not this time 😔
                </button>
              </div>
            </motion.div>
          )}

          {feedbackState === "bad_animation" && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}>
              <div style={{ height: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <DotLottieReact src={feedbackBadUrl} loop autoplay />
              </div>
              <h3 style={{ color: 'var(--text-primary)', margin: '0 0 12px 0', fontSize: '22px' }}>We're sorry to hear that.</h3>
              <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px 0', fontSize: '15px' }}>Please take some time to give us feedback so we can improve!</p>
              <button onClick={() => { setRating(1); setFeedbackState("form"); }}
                style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'var(--primary-color)', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: '15px' }}>
                Give Feedback
              </button>
            </motion.div>
          )}

          {feedbackState === "form" && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}>
              <div style={{ height: '140px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '16px' }}>
                <DotLottieReact key={rating >= 4 ? 'good' : 'bad'} src={rating >= 4 ? feedbackGoodUrl : feedbackBadUrl} loop autoplay />
              </div>
              <h3 style={{ color: 'var(--text-primary)', margin: '0 0 16px 0', fontSize: '20px' }}>
                {rating >= 4 ? "Tell us what you love!" : "How can we improve?"}
              </h3>

              {/* Feedback Category Selector */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '16px' }}>
                {FEEDBACK_CATEGORIES.map(cat => (
                  <button key={cat.value} onClick={() => handleTypeChange(cat.value)}
                    style={{
                      padding: '6px 12px', borderRadius: '20px', border: '1px solid',
                      borderColor: feedbackType === cat.value ? 'var(--primary-color)' : 'var(--border-color)',
                      background: feedbackType === cat.value ? 'var(--primary-color)' : 'var(--bg-nested)',
                      color: feedbackType === cat.value ? '#fff' : 'var(--text-secondary)',
                      fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s'
                    }}>
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Mentor dropdown when MENTOR is selected */}
              {feedbackType === "MENTOR" && (
                <div style={{ marginBottom: '16px', textAlign: 'left' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Select Mentor</label>
                  {loadingMentors ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px' }}>
                      <FaSpinner className="spin" style={{ color: 'var(--primary-color)' }} />
                    </div>
                  ) : (
                    <select
                      value={relatedId}
                      onChange={(e) => setRelatedId(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-nested)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }}
                    >
                      <option value="">— Select a mentor —</option>
                      {mentors.map(m => {
                        const mId = m.user || m.id;
                        const isCurrent = currentMentor && (currentMentor.user === mId || currentMentor.id === mId);
                        return (
                          <option key={m.id} value={mId}>
                            {m.full_name || m.name || m.first_name || `Mentor ${m.id?.slice(0,6)}`}
                            {m.designation ? ` · ${m.designation}` : ""}
                            {isCurrent ? " (Current Mentor)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              )}

              {/* Course / Training text input */}
              {(feedbackType === "COURSE" || feedbackType === "TRAINING") && (
                <input
                  type="text"
                  placeholder={`${currentCat?.relatedLabel} ID (optional)`}
                  value={relatedId}
                  onChange={(e) => setRelatedId(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-nested)', color: 'var(--text-primary)', marginBottom: '16px', fontSize: '14px', outline: 'none' }}
                />
              )}

              {/* Star Rating */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <FaStar key={star} onClick={() => setRating(star)}
                    style={{ cursor: 'pointer', fontSize: '28px', transition: '0.2s', color: star <= rating ? '#fbbf24' : 'var(--border-color)' }} />
                ))}
              </div>

              <textarea
                placeholder="Share your thoughts here..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                disabled={isSubmitting}
                style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', resize: 'none', fontFamily: 'inherit', background: 'var(--bg-nested)', color: 'var(--text-primary)', marginBottom: '20px', fontSize: '14px', outline: 'none' }}
              />

              <button onClick={submitFeedback} disabled={isSubmitting}
                style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'var(--primary-color)', color: 'white', fontWeight: 'bold', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {isSubmitting ? <FaSpinner className="spin" /> : "Submit Feedback"}
              </button>
            </motion.div>
          )}

          {feedbackState === "success" && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}>
              <div style={{ fontSize: '48px', color: '#10b981', marginBottom: '16px' }}>✨</div>
              <h3 style={{ color: 'var(--text-primary)', margin: '0 0 12px 0', fontSize: '24px' }}>Thank you!</h3>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '15px' }}>Your feedback has been submitted successfully.</p>
            </motion.div>
          )}

          {feedbackState === "error" && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}>
              <div style={{ height: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <DotLottieReact src={feedbackBadUrl} loop autoplay />
              </div>
              <h3 style={{ color: 'var(--text-primary)', margin: '0 0 12px 0', fontSize: '24px' }}>Oops!</h3>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '15px' }}>Something went wrong while submitting.</p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
