import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  FaComments, 
  FaPaperclip, 
  FaPaperPlane, 
  FaTimes, 
  FaFilePdf, 
  FaFileWord, 
  FaFileExcel, 
  FaFilePowerpoint, 
  FaFileAlt, 
  FaFileImage, 
  FaDownload, 
  FaUsers, 
  FaUserShield, 
  FaHandsHelping,
  FaShieldAlt
} from "react-icons/fa";
import { useAuth } from "../../context/AuthContext";
import communicationService from "../../services/communicationService";
import styles from "./Messages.module.css";

const GROUP_CONFIG = {
  TRUSTEE_GROUP: {
    title: "Trustee Board Communication",
    subtitle: "Direct private channel between Board Trustees and Platform Administration",
    icon: <FaShieldAlt />,
    tabLabel: "Trustees",
  },
  ADVISOR_GROUP: {
    title: "Advisory Council Communication",
    subtitle: "Direct private channel between Advisory Members and Platform Administration",
    icon: <FaUsers />,
    tabLabel: "Advisors",
  },
  VOLUNTEER_GROUP: {
    title: "Volunteer Team Communication",
    subtitle: "Direct private channel between Operations Volunteers and Platform Administration",
    icon: <FaHandsHelping />,
    tabLabel: "Volunteers",
  },
};

function getFileIcon(filename) {
  if (!filename) return <FaFileAlt className={styles.attachmentIcon} />;
  const ext = filename.split(".").pop().toLowerCase();
  if (["pdf"].includes(ext)) return <FaFilePdf className={styles.attachmentIcon} style={{ color: "#ef4444" }} />;
  if (["doc", "docx"].includes(ext)) return <FaFileWord className={styles.attachmentIcon} style={{ color: "#2563eb" }} />;
  if (["xls", "xlsx"].includes(ext)) return <FaFileExcel className={styles.attachmentIcon} style={{ color: "#16a34a" }} />;
  if (["ppt", "pptx"].includes(ext)) return <FaFilePowerpoint className={styles.attachmentIcon} style={{ color: "#ea580c" }} />;
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return <FaFileImage className={styles.attachmentIcon} style={{ color: "#8b5cf6" }} />;
  return <FaFileAlt className={styles.attachmentIcon} style={{ color: "#64748b" }} />;
}

function formatMessageTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return timeStr;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;
}

export default function Messages() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.is_superuser;
  const isAdvisor = user?.admin_category === "ADVISORY" || user?.role === "ADVISOR";

  // Determine user's native role group
  const defaultGroup = isAdmin
    ? "TRUSTEE_GROUP"
    : isAdvisor
    ? "ADVISOR_GROUP"
    : user?.role === "VOLUNTEER"
    ? "VOLUNTEER_GROUP"
    : "TRUSTEE_GROUP";

  const [activeGroup, setActiveGroup] = useState(defaultGroup);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [inputText, setInputText] = useState("");
  const [stagedFile, setStagedFile] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const isInitialLoad = useRef(true);

  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Fetch unread count badges
  const fetchUnreadCounts = useCallback(async () => {
    try {
      const summary = await communicationService.getUnreadSummary();
      if (summary?.groups) {
        setUnreadCounts(summary.groups);
      }
    } catch {
      // Ignore background unread polling errors
    }
  }, []);

  // Fetch messages for active group
  const fetchMessages = useCallback(async (isPolling = false) => {
    if (!activeGroup) return;
    try {
      if (!isPolling) setLoading(true);
      const data = await communicationService.getMessages(activeGroup);
      setMessages(data.results || []);
      setError(null);

      // Auto mark read
      communicationService.markRead(activeGroup).catch(() => {});
      fetchUnreadCounts();

      if (isInitialLoad.current || !isPolling) {
        setTimeout(() => scrollToBottom("auto"), 100);
        isInitialLoad.current = false;
      }
    } catch (err) {
      if (!isPolling) {
        setError(err.response?.data?.error || err.response?.data?.detail || "Failed to load messages.");
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [activeGroup, fetchUnreadCounts]);

  // Initial load and group change
  useEffect(() => {
    isInitialLoad.current = true;
    fetchMessages(false);
  }, [fetchMessages]);

  // Periodic polling every 8 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchMessages(true);
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [fetchMessages]);

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed && !stagedFile) return;

    try {
      setSending(true);
      setError(null);

      const newMsg = await communicationService.sendMessage(activeGroup, {
        content: trimmed,
        file: stagedFile,
      });

      setInputText("");
      setStagedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setMessages((prev) => [...prev, newMsg]);
      setTimeout(() => scrollToBottom("smooth"), 100);
      fetchUnreadCounts();
    } catch (err) {
      const data = err.response?.data;
      let errorMsg = "";
      if (typeof data === "string") {
        errorMsg = data;
      } else if (data?.error) {
        errorMsg = Array.isArray(data.error) ? data.error.join(" ") : String(data.error);
      } else if (data?.detail) {
        errorMsg = Array.isArray(data.detail) ? data.detail.join(" ") : String(data.detail);
      } else if (data && typeof data === "object") {
        const firstKey = Object.keys(data)[0];
        if (firstKey) {
          const val = data[firstKey];
          errorMsg = Array.isArray(val) ? val.join(" ") : String(val);
        }
      }

      if (!errorMsg) {
        errorMsg = stagedFile
          ? "Failed to send message with attachment. Please check file type and size."
          : (err.message || "Failed to send message.");
      }
      setError(errorMsg);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size (< 15MB)
    if (file.size > 15 * 1024 * 1024) {
      setError("File exceeds maximum allowed size of 15MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setError(null);
    setStagedFile(file);
  };

  const removeStagedFile = () => {
    setStagedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const currentConfig = GROUP_CONFIG[activeGroup] || GROUP_CONFIG.TRUSTEE_GROUP;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.channelIcon}>
            {currentConfig.icon}
          </div>
          <div>
            <h1 className={styles.channelTitle}>{currentConfig.title}</h1>
            <p className={styles.channelSubtitle}>{currentConfig.subtitle}</p>
          </div>
        </div>

        {/* Admin Channel Switcher Tabs */}
        {isAdmin && (
          <div className={styles.groupTabs}>
            {Object.keys(GROUP_CONFIG).map((groupKey) => {
              const cfg = GROUP_CONFIG[groupKey];
              const unread = unreadCounts[groupKey] || 0;
              const isActive = activeGroup === groupKey;
              return (
                <button
                  key={groupKey}
                  type="button"
                  className={`${styles.groupTab} ${isActive ? styles.activeTab : ""}`}
                  onClick={() => setActiveGroup(groupKey)}
                >
                  {cfg.tabLabel}
                  {unread > 0 && <span className={styles.badge}>{unread}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Chat Stream */}
      <div className={styles.mainLayout}>
        <div className={styles.chatArea}>
          {error && <div className={styles.errorBanner}>{error}</div>}

          <div className={styles.messageStream}>
            {loading ? (
              <div className={styles.emptyState}>
                <p>Loading conversation...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className={styles.emptyState}>
                <FaComments className={styles.emptyIcon} />
                <h3>No messages yet</h3>
                <p>Start the conversation by sending a message or attaching a document below.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_id === user?.id;
                const roleClass =
                  msg.sender_role === "ADMIN"
                    ? styles.roleTagAdmin
                    : msg.sender_role === "ADVISOR"
                    ? styles.roleTagAdvisor
                    : msg.sender_role === "TRUSTEE"
                    ? styles.roleTagTrustee
                    : styles.roleTagVolunteer;

                return (
                  <div
                    key={msg.id}
                    className={`${styles.messageGroup} ${isMine ? styles.myMessage : styles.otherMessage}`}
                  >
                    {!isMine && (
                      <div className={styles.senderMeta}>
                        <span className={styles.senderName}>{msg.sender_name}</span>
                        <span className={`${styles.roleTag} ${roleClass}`}>
                          {msg.sender_role}
                        </span>
                      </div>
                    )}

                    <div className={`${styles.messageBubble} ${isMine ? styles.bubbleMine : styles.bubbleOther}`}>
                      {msg.content && <p className={styles.messageText}>{msg.content}</p>}

                      {msg.attachments && msg.attachments.length > 0 && (
                        <div>
                          {msg.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={att.download_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.attachmentCard}
                            >
                              {getFileIcon(att.original_filename)}
                              <div className={styles.attachmentMeta}>
                                <span className={styles.attachmentName}>{att.original_filename}</span>
                                <span className={styles.attachmentSize}>
                                  {communicationService.formatFileSize(att.file_size)}
                                </span>
                              </div>
                              <FaDownload className={styles.downloadIcon} />
                            </a>
                          ))}
                        </div>
                      )}

                      <div className={styles.timestamp}>{formatMessageTime(msg.created_at)}</div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input & Upload Bar */}
          <div className={styles.inputArea}>
            {stagedFile && (
              <div className={styles.stagedFilePreview}>
                <div className={styles.fileChipInfo}>
                  {getFileIcon(stagedFile.name)}
                  <span>
                    <strong>{stagedFile.name}</strong> ({communicationService.formatFileSize(stagedFile.size)})
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.removeFileBtn}
                  onClick={removeStagedFile}
                  title="Remove attachment"
                >
                  <FaTimes />
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className={styles.inputControls}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/*"
              />

              <button
                type="button"
                className={`${styles.actionBtn} ${styles.attachBtn}`}
                onClick={() => fileInputRef.current?.click()}
                title="Attach Document or Image"
              >
                <FaPaperclip />
              </button>

              <textarea
                className={styles.textInput}
                rows={1}
                placeholder={`Type a message to ${currentConfig.title}...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              <button
                type="submit"
                className={`${styles.actionBtn} ${styles.sendBtn}`}
                disabled={sending || (!inputText.trim() && !stagedFile)}
                title="Send Message"
              >
                <FaPaperPlane />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
