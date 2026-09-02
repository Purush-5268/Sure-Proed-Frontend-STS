import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { FaCommentDots, FaTimes, FaSpinner, FaStar } from "react-icons/fa";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import feedbackGoodUrl from "../../assets/animations/feedback-giving.lottie?url";
import feedbackBadUrl from "../../assets/animations/feedback-notgive.lottie?url";
import styles from "./FeedbackWidget.module.css";

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackState, setFeedbackState] = useState("idle"); // 'idle', 'bad_animation', 'form', 'success'
  const [showClose, setShowClose] = useState(true);
  
  // Backend payload state
  const [feedbackType, setFeedbackType] = useState("SYSTEM");
  const [relatedId, setRelatedId] = useState("");
  const [rating, setRating] = useState(5);
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When 'bad_animation' or 'error' is active, delay showing the close button
  useEffect(() => {
    if (feedbackState === "bad_animation" || feedbackState === "error") {
      setShowClose(false);
      const timer = setTimeout(() => {
        setShowClose(true);
      }, 3000); 
      return () => clearTimeout(timer);
    } else {
      setShowClose(true);
    }
  }, [feedbackState]);

  const handleOpen = () => {
    setIsOpen(true);
    setFeedbackState("idle");
    setFeedbackType("SYSTEM");
    setRelatedId("");
    setRating(5);
    setComments("");
  };

  const handleClose = () => {
    if (!showClose) return; 
    
    // If they try to close from idle or form, show the sad cat guilt trip first!
    if (feedbackState === "idle" || feedbackState === "form") {
      setFeedbackState("bad_animation");
      return;
    }

    // Actually close the modal if they've already seen the sad cat or finished
    setIsOpen(false);
    setTimeout(() => {
      setFeedbackState("idle");
      setComments("");
      setRating(5);
    }, 500);
  };

  const submitFeedback = async () => {
    setIsSubmitting(true);
    try {
      const payload = {
        feedback_type: feedbackType,
        rating: rating,
        comments: comments
      };
      if ((feedbackType === "COURSE" || feedbackType === "TRAINING") && relatedId.trim() !== "") {
        payload.related_id = relatedId.trim();
      }
      
      await apiClient.post(API_ENDPOINTS.FEEDBACK.BASE, payload);
      setFeedbackState("success");
      setTimeout(() => handleClose(), 2000);
    } catch (err) {
      console.error("Failed to submit feedback", err);
      setIsSubmitting(false);
      setFeedbackState("error");
      setTimeout(() => handleClose(), 3000);
    }
  };

  const handleStarClick = (selectedRating) => {
    setRating(selectedRating);
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className={styles.overlay}>
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ padding: '24px', width: '100%', maxWidth: '450px', background: 'var(--bg-card)', borderRadius: '24px', position: 'relative', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}
          >
            {showClose && (
              <button className={styles.closeBtn} onClick={handleClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '20px' }}>
                <FaTimes />
              </button>
            )}

            <div className={styles.content} style={{ textAlign: 'center' }}>
              {feedbackState === "idle" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <h3 style={{ color: 'var(--text-primary)', margin: '0 0 12px 0', fontSize: '24px' }}>Enjoying Sure ProEd?</h3>
                    <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px 0', fontSize: '15px' }}>We'd love to hear how your experience has been!</p>
                    
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                      <button
                        onClick={() => { setRating(5); setFeedbackState("form"); }}
                        style={{ padding: '12px 24px', borderRadius: '12px', background: 'var(--primary-color)', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer', flex: 1, transition: '0.2s', fontSize: '15px' }}
                      >
                        Yes, I love it! 😊
                      </button>
                      <button
                        onClick={() => { setFeedbackState("bad_animation"); }}
                        style={{ padding: '12px 24px', borderRadius: '12px', background: 'var(--bg-nested)', color: 'var(--text-primary)', fontWeight: 'bold', border: '1px solid var(--border-color)', cursor: 'pointer', flex: 1, transition: '0.2s', fontSize: '15px' }}
                      >
                        Not this time 😔
                      </button>
                    </div>
                  </motion.div>
                )}

                {feedbackState === "bad_animation" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <div style={{ height: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <DotLottieReact src={feedbackBadUrl} loop autoplay />
                    </div>
                    <h3 style={{ color: 'var(--text-primary)', margin: '0 0 12px 0', fontSize: '22px' }}>We're sorry to hear that.</h3>
                    <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px 0', fontSize: '15px' }}>Please take some time to give us feedback so we can improve!</p>
                    
                    <button
                      onClick={() => { setRating(1); setFeedbackState("form"); }}
                      style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'var(--primary-color)', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: '15px' }}
                    >
                      Give Feedback
                    </button>
                  </motion.div>
                )}

                {feedbackState === "form" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <div style={{ height: '140px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '16px', transition: '0.3s' }}>
                      <DotLottieReact key={rating >= 4 ? 'good' : 'bad'} src={rating >= 4 ? feedbackGoodUrl : feedbackBadUrl} loop autoplay />
                    </div>
                    <h3 style={{ color: 'var(--text-primary)', margin: '0 0 16px 0', fontSize: '20px' }}>
                      {rating >= 4 ? "Tell us what you love!" : "How can we improve?"}
                    </h3>
                    
                    {/* Elegant Type Selector */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '16px' }}>
                      {["SYSTEM", "COURSE", "TRAINING", "OTHER"].map(type => (
                        <button
                          key={type}
                          onClick={() => setFeedbackType(type)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '20px',
                            border: '1px solid',
                            borderColor: feedbackType === type ? 'var(--primary-color)' : 'var(--border-color)',
                            background: feedbackType === type ? 'var(--primary-color)' : 'var(--bg-nested)',
                            color: feedbackType === type ? '#fff' : 'var(--text-secondary)',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: '0.2s'
                          }}
                        >
                          {type}
                        </button>
                      ))}
                    </div>

                    {(feedbackType === "COURSE" || feedbackType === "TRAINING") && (
                      <input 
                        type="text"
                        placeholder={`${feedbackType === "COURSE" ? "Course" : "Training"} ID (optional)`}
                        value={relatedId}
                        onChange={(e) => setRelatedId(e.target.value)}
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-nested)', color: 'var(--text-primary)', marginBottom: '16px', fontSize: '14px', outline: 'none' }}
                      />
                    )}

                    {/* Star Rating */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <FaStar
                          key={star}
                          onClick={() => handleStarClick(star)}
                          style={{
                            cursor: 'pointer',
                            fontSize: '28px',
                            transition: '0.2s',
                            color: star <= rating ? '#fbbf24' : 'var(--border-color)'
                          }}
                        />
                      ))}
                    </div>
                    
                    <textarea 
                      placeholder="Share your thoughts here..."
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      disabled={isSubmitting}
                      style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-color)', resize: 'none', fontFamily: 'inherit', background: 'var(--bg-nested)', color: 'var(--text-primary)', marginBottom: '20px', fontSize: '14px', outline: 'none' }}
                    />

                    <button
                      onClick={submitFeedback}
                      disabled={isSubmitting}
                      style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'var(--primary-color)', color: 'white', fontWeight: 'bold', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    >
                      {isSubmitting ? <FaSpinner className="spin" /> : "Submit Feedback"}
                    </button>
                  </motion.div>
                )}

              {feedbackState === "success" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <div style={{ fontSize: '48px', color: '#10b981', marginBottom: '16px' }}>✨</div>
                  <h3 style={{ color: 'var(--text-primary)', margin: '0 0 12px 0', fontSize: '24px' }}>Thank you!</h3>
                  <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '15px' }}>Your feedback has been submitted successfully.</p>
                </motion.div>
              )}

              {feedbackState === "error" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
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
      )}
    </AnimatePresence>
  );

  return (
    <>
      <motion.button
        className={styles.inlineBtn}
        onClick={handleOpen}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <FaCommentDots />
        <span className={styles.btnText}>Give Feedback</span>
      </motion.button>
      
      {isOpen && ReactDOM.createPortal(modalContent, document.body)}
    </>
  );
}