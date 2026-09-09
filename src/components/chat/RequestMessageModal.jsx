import React, { useState } from "react";
import apiClient from "../../services/apiClient";
import styles from "./PermissionChatModal.module.css"; // Reuse the same styles

function RequestMessageModal({ requestId, onClose }) {
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);

  const sendMessage = async () => {
    if (!inputValue.trim()) return;
    
    setIsSending(true);
    try {
      await apiClient.post(`/api/common/user-requests/${requestId}/message/`, {
        message: inputValue
      });
      alert("Message sent successfully!");
      setInputValue("");
      onClose();
    } catch (err) {
      console.error("Failed to send message:", err);
      alert(err.response?.data?.error || "Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") sendMessage();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} style={{ maxHeight: '300px', display: 'flex', flexDirection: 'column' }}>
        <div className={styles.header}>
          <h2>Message Student</h2>
          <button className={styles.closeBtn} onClick={onClose} disabled={isSending}>&times;</button>
        </div>

        <div className={styles.chatArea} style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Send a direct notification message to the student regarding this request.
          </p>
          <div className={styles.inputArea} style={{ padding: 0, border: 'none', background: 'transparent' }}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className={styles.inputField}
              disabled={isSending}
              autoFocus
            />
            <button onClick={sendMessage} className={styles.sendBtn} disabled={isSending}>
              {isSending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RequestMessageModal;
