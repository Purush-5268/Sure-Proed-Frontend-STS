import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { FaCommentDots, FaTimes } from "react-icons/fa";
import feedbackGoodUrl from "../../assets/animations/feedback-giving.lottie?url";
import feedbackBadUrl from "../../assets/animations/feedback-notgive.lottie?url";
import styles from "./FeedbackWidget.module.css";

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackState, setFeedbackState] = useState("idle"); // 'idle', 'good', 'bad'
  const [showClose, setShowClose] = useState(true);

  // When 'bad' is clicked, delay showing the close button to enforce them seeing the animation
  useEffect(() => {
    if (feedbackState === "bad") {
      setShowClose(false);
      const timer = setTimeout(() => {
        setShowClose(true);
      }, 2500); // 2.5 seconds before close button appears
      return () => clearTimeout(timer);
    } else {
      setShowClose(true);
    }
  }, [feedbackState]);

  const handleOpen = () => {
    setIsOpen(true);
    setFeedbackState("idle");
  };

  const handleClose = () => {
    if (!showClose) return; // Prevent closing if close button is disabled
    setIsOpen(false);
    setTimeout(() => setFeedbackState("idle"), 500); // Reset after closing animation
  };

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

      <AnimatePresence>
        {isOpen && (
          <div className={styles.overlay}>
            <motion.div 
              className={styles.modal}
              initial={{ opacity: 0, scale: 0.8, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 50 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {showClose && (
                <button className={styles.closeBtn} onClick={handleClose}>
                  <FaTimes />
                </button>
              )}

              <div className={styles.content}>
                {feedbackState === "idle" && (
                  <motion.div 
                    className={styles.idleState}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <h3>Enjoying Sure ProEd?</h3>
                    <p>We'd love to hear how your experience has been!</p>
                    <div className={styles.actions}>
                      <button 
                        className={styles.goodBtn} 
                        onClick={() => setFeedbackState("good")}
                      >
                        Yes, I love it! 😊
                      </button>
                      <button 
                        className={styles.badBtn} 
                        onClick={() => setFeedbackState("bad")}
                      >
                        Not this time 😔
                      </button>
                    </div>
                  </motion.div>
                )}

                {feedbackState === "good" && (
                  <motion.div 
                    className={styles.animationState}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <div className={styles.lottieContainer}>
                      <DotLottieReact src={feedbackGoodUrl} loop autoplay />
                    </div>
                    <h3>Thank you!</h3>
                    <p>We're thrilled you're having a great experience.</p>
                  </motion.div>
                )}

                {feedbackState === "bad" && (
                  <motion.div 
                    className={styles.animationState}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <div className={styles.lottieContainer}>
                      <DotLottieReact src={feedbackBadUrl} loop autoplay />
                    </div>
                    <h3>We're sorry to hear that.</h3>
                    <p>We're constantly working to improve!</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
