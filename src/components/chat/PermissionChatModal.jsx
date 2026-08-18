import React, { useState, useEffect, useRef } from "react";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import { getAccessToken } from "../../utils/tokenStorage";
import styles from "./PermissionChatModal.module.css";

function PermissionChatModal({ warningId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // 1. Fetch initial chat history via REST API
    const fetchHistory = async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.ATTENDANCE.CHAT_HISTORY + `?warning_id=${warningId}`);
        setMessages(res.data || []);
      } catch (e) {
        console.error("Failed to load chat history:", e);
      }
    };
    fetchHistory();

    // 2. Initialize WebSocket Connection
    const token = getAccessToken();
    const wsHost = window.location.protocol === "https:" ? "wss" : "ws";
    const host = process.env.NODE_ENV === "development" ? "106.51.129.34:8000" : window.location.host;
    const wsUrl = `${wsHost}://${host}/ws/chat/${warningId}/?token=${token}`;
    
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log("WebSocket connected");
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "chat_message") {
        setMessages((prev) => [...prev, data]);
      }
    };

    wsRef.current.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    wsRef.current.onclose = () => {
      console.log("WebSocket disconnected");
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [warningId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!inputValue.trim() || !wsRef.current) return;
    
    wsRef.current.send(JSON.stringify({
      message: inputValue
    }));
    
    setInputValue("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") sendMessage();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <h2>Permission Chat</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>
        
        <div className={styles.chatArea}>
          {messages.length === 0 ? (
            <p className={styles.emptyMsg}>No messages yet.</p>
          ) : (
            messages.map((msg, idx) => {
              // We don't know my user ID easily here, so we just show sender name.
              // A real app might check if msg.sender_id === myUserId to align right.
              return (
                <div key={idx} className={styles.messageRow}>
                  <div className={styles.messageBubble}>
                    <span className={styles.sender}>{msg.sender_name}</span>
                    <span className={styles.text}>{msg.message}</span>
                    <span className={styles.time}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <div className={styles.inputArea}>
          <input 
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className={styles.inputField}
          />
          <button onClick={sendMessage} className={styles.sendBtn}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default PermissionChatModal;
