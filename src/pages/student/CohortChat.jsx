import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { cohortChatService } from "../../services/cohortChatService";
import { cohortService } from "../../services/cohortService";
import { courseService } from "../../services/courseService";
import { getAccessToken } from "../../utils/tokenStorage";
import { FiSend, FiWifi, FiWifiOff, FiLoader, FiAlertCircle, FiArrowLeft, FiTrash2 } from "react-icons/fi";

/**
 * Cohort Group Chat page.
 *
 * Route: /student/cohort-chat/:cohortId  (or /admin/cohort-chat/:cohortId)
 *
 * WebSocket: ws/cohort-chat/{cohort_id}/?token=<jwt>
 * REST GET:  /api/cohorts/{cohort_id}/chat/messages/?before=<msg_id>
 * REST POST: /api/cohorts/{cohort_id}/chat/messages/
 * Unread:    /api/cohorts/{cohort_id}/chat/unread-count/
 * Read:      POST /api/cohorts/{cohort_id}/chat/read/
 *
 * DOES NOT touch PermissionChatConsumer or attendance chat.
 */

const WS_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const PAGE_SIZE = 50;

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function getDateLabel(iso) {
  if (!iso) return "";
  return new Date(iso).toDateString();
}

function MessageBubble({ msg, isOwnMessage, onDelete, canDelete }) {
  const [showDelete, setShowDelete] = useState(false);

  if (msg.is_deleted) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: isOwnMessage ? 'flex-end' : 'flex-start',
        marginBottom: '4px',
        padding: '0 16px',
      }}>
        <span style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--text-muted)', padding: '4px 12px' }}>
          [Message deleted]
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isOwnMessage ? 'flex-end' : 'flex-start',
        marginBottom: '6px',
        padding: '0 12px',
      }}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <div style={{ maxWidth: '70%', position: 'relative' }}>
        {/* Sender info (only for others) */}
        {!isOwnMessage && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', paddingLeft: '4px' }}>
            {msg.sender_name}
            {msg.sender_role && msg.sender_role !== 'STUDENT' && (
              <span style={{ marginLeft: '4px', background: 'var(--primary-color)', color: 'white', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>
                {msg.sender_role}
              </span>
            )}
          </div>
        )}

        <div style={{
          background: isOwnMessage ? 'var(--primary-color)' : 'var(--bg-card)',
          color: isOwnMessage ? 'white' : 'var(--text-primary)',
          padding: '8px 12px',
          borderRadius: isOwnMessage ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          border: isOwnMessage ? 'none' : '1px solid var(--border-color)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          wordBreak: 'break-word',
          lineHeight: 1.5,
          fontSize: '14px',
        }}>
          {msg.body}
          <div style={{ fontSize: '11px', opacity: 0.6, textAlign: 'right', marginTop: '2px' }}>
            {formatTime(msg.created_at)}
          </div>
        </div>

        {/* Delete button */}
        {canDelete && showDelete && (
          <button
            onClick={() => onDelete(msg.id)}
            style={{
              position: 'absolute',
              top: '-8px',
              right: isOwnMessage ? '0' : 'auto',
              left: isOwnMessage ? 'auto' : '0',
              background: '#ef4444',
              border: 'none',
              borderRadius: '50%',
              width: '22px',
              height: '22px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            title="Delete message"
          >
            <FiTrash2 size={11} color="white" />
          </button>
        )}
      </div>
    </div>
  );
}

function CohortChat() {
  const { cohortId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isInvalidCohort = !cohortId || cohortId === "undefined" || cohortId === "null";

  const [messages, setMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [wsStatus, setWsStatus] = useState("CONNECTING"); // CONNECTING | CONNECTED | RECONNECTING | OFFLINE | ACCESS DENIED
  const [wsError, setWsError] = useState("");
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [cohortInfo, setCohortInfo] = useState(null);
  const [cohortData, setCohortData] = useState(null);
  const [courseName, setCourseName] = useState("");

  const wsRef = useRef(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef(null);
  const bottomRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const seenIds = useRef(new Set());

  const isAdmin = user?.role === 'ADMIN' || user?.is_superuser;
  const userId = user?.id;

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = false) => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  // Load initial history and cohort info
  useEffect(() => {
    if (isInvalidCohort) return;
    let isMounted = true;
    setLoadingHistory(true);

    // Fetch messages
    cohortChatService.getMessages(cohortId)
      .then(data => {
        if (!isMounted) return;
        const msgs = data.results || [];
        msgs.forEach(m => seenIds.current.add(m.id));
        setMessages(msgs);
        setHasMore(data.has_more || false);
        setCohortInfo({ cohort_id: data.cohort_id, conversation_id: data.conversation_id });
        setLoadingHistory(false);
        requestAnimationFrame(() => scrollToBottom(false));
      })
      .catch(err => {
        if (!isMounted) return;
        if (err.response?.status === 403) {
          setWsStatus("ACCESS DENIED");
          setWsError(err.response?.data?.error || "You do not have access to this cohort chat.");
        }
        setLoadingHistory(false);
      });

    // Fetch cohort data for header
    cohortService.getCohortById(cohortId).then(data => {
      if (!isMounted) return;
      setCohortData(data);
      if (data.course && typeof data.course === "string") {
        courseService.getCourseById(data.course).then(courseRes => {
          if (!isMounted) return;
          setCourseName(courseRes?.name || courseRes?.title || data.course);
        }).catch(() => {});
      }
    }).catch(() => {});

    // Mark as read on enter
    cohortChatService.markRead(cohortId).catch(() => {});

    return () => { isMounted = false; };
  }, [cohortId, scrollToBottom, isInvalidCohort]);

  // Load older messages
  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    const oldestMsg = messages[0];
    setLoadingOlder(true);
    try {
      const data = await cohortChatService.getMessages(cohortId, oldestMsg.id);
      const older = (data.results || []).filter(m => !seenIds.current.has(m.id));
      older.forEach(m => seenIds.current.add(m.id));
      setMessages(prev => [...older, ...prev]);
      setHasMore(data.has_more || false);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setLoadingOlder(false);
    }
  }, [cohortId, messages, hasMore, loadingOlder]);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (isInvalidCohort) return;
    const token = getAccessToken();
    if (!token) {
      setWsStatus("OFFLINE");
      setWsError("Authentication required.");
      return;
    }

    try {
      const url = cohortChatService.buildWebSocketUrl(cohortId);
      const ws = new WebSocket(url, ["Bearer", token]);
      wsRef.current = ws;
      setWsStatus(reconnectCount.current === 0 ? "CONNECTING" : "RECONNECTING");

      ws.onopen = () => {
        setWsStatus("CONNECTED");
        setWsError("");
        reconnectCount.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Error from server
          if (data.error) {
            if (data.error.includes("suspended") || data.error.includes("Access revoked")) {
              setWsStatus("ACCESS DENIED");
              setWsError(data.error);
              ws.close();
            }
            return;
          }

          // New message broadcast
          if (data.message_id && data.body) {
            const newMsg = {
              id: data.message_id,
              sender_id: data.sender_id,
              sender_name: data.sender_name,
              sender_role: data.sender_role,
              body: data.body,
              created_at: data.created_at,
              is_deleted: false,
            };
            if (!seenIds.current.has(newMsg.id)) {
              seenIds.current.add(newMsg.id);
              setMessages(prev => [...prev, newMsg]);
              // Auto scroll only if near bottom
              setTimeout(() => scrollToBottom(true), 50);
              // Mark read
              cohortChatService.markRead(cohortId).catch(() => {});
            }
          }
        } catch (e) {
          console.error("WS message parse error", e);
        }
      };

      ws.onerror = () => {
        // Will be handled in onclose
      };

      ws.onclose = (ev) => {
        // 4001 = auth failed, 4003 = permission denied
        if (ev.code === 4001) {
          setWsStatus("ACCESS DENIED");
          setWsError("Authentication failed. Please refresh the page.");
          return;
        }
        if (ev.code === 4003) {
          setWsStatus("ACCESS DENIED");
          setWsError("Your access to this cohort chat is suspended or revoked.");
          return;
        }
        
        // Auto-reconnect with exponential backoff (max 5 retries)
        if (reconnectCount.current < MAX_RECONNECT_ATTEMPTS) {
          setWsStatus("RECONNECTING");
          reconnectCount.current += 1;
          const backoffTime = Math.min(3000 * Math.pow(2, reconnectCount.current - 1), 30000);
          reconnectTimer.current = setTimeout(() => {
            connectWebSocket();
          }, backoffTime);
        } else {
          setWsStatus("OFFLINE");
          setWsError("Unable to connect to chat server.");
        }
      };
    } catch (e) {
      setWsStatus("OFFLINE");
      setWsError("Failed to connect to chat.");
    }
  }, [cohortId, scrollToBottom, isInvalidCohort]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const handleSend = async () => {
    const body = inputText.trim();
    if (!body || sending || wsStatus !== "CONNECTED") return;

    // Send via WebSocket for instant delivery
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setSending(true);
      wsRef.current.send(JSON.stringify({ body }));
      setInputText("");
      setSending(false);
    } else {
      // Fallback: REST send
      setSending(true);
      try {
        const msg = await cohortChatService.sendMessage(cohortId, body);
        if (!seenIds.current.has(msg.id)) {
          seenIds.current.add(msg.id);
          setMessages(prev => [...prev, msg]);
          scrollToBottom(true);
        }
        setInputText("");
      } catch (err) {
        alert(err.response?.data?.error || "Failed to send message.");
      } finally {
        setSending(false);
      }
    }
  };

  const handleDelete = async (messageId) => {
    if (!window.confirm("Delete this message?")) return;
    try {
      await cohortChatService.deleteMessage(cohortId, messageId);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true } : m));
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete message.");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Status indicator
  const wsStatusEl = () => {
    if (wsStatus === "CONNECTED") return <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '500' }}><FiWifi size={12} /> Live</span>;
    if (wsStatus === "CONNECTING") return <span style={{ color: '#f59e0b', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '500' }}><FiLoader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Connecting...</span>;
    if (wsStatus === "RECONNECTING") return <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '500' }}><FiWifiOff size={12} /> Reconnecting...</span>;
    if (wsStatus === "ACCESS DENIED") return <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '500' }}><FiAlertCircle size={12} /> Access Denied</span>;
    return <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '500' }}><FiWifiOff size={12} /> Offline</span>;
  };

  // Group messages by date
  const groupedMessages = [];
  let lastDateLabel = null;
  messages.forEach(msg => {
    const dl = getDateLabel(msg.created_at);
    if (dl !== lastDateLabel) {
      groupedMessages.push({ type: 'date', label: formatDate(msg.created_at), key: dl });
      lastDateLabel = dl;
    }
    groupedMessages.push({ type: 'message', msg });
  });

  // Suspended screen
  if (wsStatus === "ACCESS DENIED" && !loadingHistory) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
        <FiAlertCircle size={48} color="#f59e0b" style={{ marginBottom: '16px' }} />
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Cohort Chat Access Suspended</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.6 }}>
          {wsError || "Your access to this cohort's chat is currently suspended. Please contact administration."}
        </p>
        <button
          onClick={() => navigate(-1)}
          style={{ marginTop: '20px', padding: '10px 20px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
        >
          Go Back
        </button>
      </div>
    );
  }

  if (isInvalidCohort) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '85vh', background: 'var(--bg-secondary)', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <FiAlertCircle size={48} color="#ef4444" style={{ marginBottom: "16px" }} />
        <h2>Invalid Cohort</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>Unable to load chat because the cohort ID is missing or invalid.</p>
        <button onClick={() => navigate(-1)} style={{ background: 'var(--primary-color)', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', background: 'var(--bg-default)' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px 20px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'var(--bg-nested)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', padding: '8px', transition: 'all 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-nested)'}
        >
          <FiArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {cohortData?.code ? (
              <>
                <span style={{ color: 'var(--primary-color)', fontSize: '18px' }}>●</span>
                {cohortData.code} {courseName && `— ${courseName.split('-')[0].trim()}`}
              </>
            ) : (
              "Cohort Group Chat"
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {courseName && cohortData?.code ? courseName : (cohortData?.code || "Loading cohort data...")}
          </div>
        </div>
        <div style={{ background: 'var(--bg-nested)', padding: '6px 12px', borderRadius: '16px' }}>
          {wsStatusEl()}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
        onScroll={(e) => {
          if (e.target.scrollTop < 80 && hasMore && !loadingOlder) {
            loadOlderMessages();
          }
        }}
      >
        {/* Load older */}
        {loadingOlder && (
          <div style={{ textAlign: 'center', padding: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
            <FiLoader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading older messages...
          </div>
        )}
        {hasMore && !loadingOlder && (
          <div style={{ textAlign: 'center', padding: '8px' }}>
            <button onClick={loadOlderMessages} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px 14px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px' }}>
              Load older messages
            </button>
          </div>
        )}

        {loadingHistory && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            <FiLoader size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
            <p style={{ margin: 0 }}>Loading conversation...</p>
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
            <div style={{ fontSize: '40px' }}>💬</div>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--text-secondary)' }}>No messages yet</p>
            <p style={{ margin: 0, fontSize: '13px' }}>Be the first to say something!</p>
          </div>
        )}

        {groupedMessages.map((item, idx) => {
          if (item.type === 'date') {
            return (
              <div key={item.key} style={{ textAlign: 'center', margin: '12px 0 8px 0' }}>
                <span style={{ background: 'var(--bg-nested)', color: 'var(--text-muted)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                  {item.label}
                </span>
              </div>
            );
          }
          const msg = item.msg;
          const isOwn = msg.sender_id === userId;
          return (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwnMessage={isOwn}
              onDelete={handleDelete}
              canDelete={isOwn || isAdmin}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Connection error banner */}
      {(wsStatus === "error") && wsError && (
        <div style={{ padding: '8px 16px', background: 'rgba(239, 68, 68, 0.1)', borderTop: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '13px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiAlertCircle size={14} /> {wsError}
          <button onClick={connectWebSocket} style={{ marginLeft: 'auto', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px' }}>
            Retry
          </button>
        </div>
      )}

      {/* Input */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 16px',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-color)',
        flexShrink: 0,
        alignItems: 'flex-end',
      }}>
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={wsStatus === 'suspended' ? "Chat access suspended" : (wsStatus === 'connected' ? "Type a message... (Enter to send)" : "Connecting...")}
          disabled={wsStatus === 'suspended' || wsStatus === 'error'}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            padding: '10px 14px',
            borderRadius: '20px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none',
            maxHeight: '120px',
            overflowY: 'auto',
            lineHeight: 1.5,
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || sending || wsStatus === 'suspended' || wsStatus === 'error'}
          style={{
            background: 'var(--primary-color)',
            border: 'none',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            opacity: (!inputText.trim() || sending || wsStatus !== 'connected') ? 0.5 : 1,
            transition: 'opacity 0.2s',
          }}
          title="Send message"
        >
          {sending ? <FiLoader size={18} color="white" style={{ animation: 'spin 1s linear infinite' }} /> : <FiSend size={18} color="white" />}
        </button>
      </div>
    </div>
  );
}

export default CohortChat;
