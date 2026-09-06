import React, { useState, useEffect, Suspense } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FaCommentDots, FaSpinner } from "react-icons/fa";
import styles from "./FeedbackWidget.module.css";

const FeedbackWidgetModal = React.lazy(() => import('./FeedbackWidgetModal'));

export default function FeedbackWidget({ currentMentor }) {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackState, setFeedbackState] = useState("idle"); // 'idle', 'bad_animation', 'form', 'success'
  const [showClose, setShowClose] = useState(true);

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
  };

  const handleClose = (force = false) => {
    if (!showClose && !force) return; 
    
    // If they try to close from idle or form, show the sad cat guilt trip first!
    if (!force && (feedbackState === "idle" || feedbackState === "form")) {
      setFeedbackState("bad_animation");
      return;
    }

    // Actually close the modal if they've already seen the sad cat or finished
    setIsOpen(false);
    setTimeout(() => {
      setFeedbackState("idle");
    }, 500);
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
      
      {isOpen && ReactDOM.createPortal(
        <Suspense fallback={
          <div className={styles.overlay}>
            <div style={{ padding: '24px', background: 'var(--bg-card)', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
              <FaSpinner className="spin" style={{ color: 'var(--primary-color)', fontSize: '32px' }} />
            </div>
          </div>
        }>
          <FeedbackWidgetModal 
            handleClose={handleClose} 
            feedbackState={feedbackState} 
            setFeedbackState={setFeedbackState} 
            showClose={showClose} 
            currentMentor={currentMentor}
          />
        </Suspense>,
        document.body
      )}
    </>
  );
}
