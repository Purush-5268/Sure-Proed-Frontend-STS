import { useState, useEffect, useRef } from 'react';
import apiClient from './apiClient';
import { API_ENDPOINTS } from '../constants/apiEndpoints';

export function useAttendanceTracker() {
  const [sessionId, setSessionId] = useState(localStorage.getItem('active_session_id'));
  const [isTracking, setIsTracking] = useState(!!sessionId);
  const [error, setError] = useState(null);
  
  const timerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const releaseLockRef = useRef(null);

  const handleStopTrackingLocally = () => {
    setIsTracking(false);
    setSessionId(null);
    localStorage.removeItem('active_session_id');
    localStorage.removeItem('attendance_tracker_token');
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Release the web lock if we hold it
    if (releaseLockRef.current) {
      releaseLockRef.current();
      releaseLockRef.current = null;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    const handleSessionStarted = () => {
      const id = localStorage.getItem('active_session_id');
      if (id) {
        setSessionId(id);
        setIsTracking(true);
      }
    };

    window.addEventListener('session_started', handleSessionStarted);
    // Listen for custom stop event from other tabs (if they explicitly clicked leave)
    const handleStorageChange = (e) => {
      if (e.key === 'active_session_id' && e.newValue === null) {
        handleStopTrackingLocally();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('session_started', handleSessionStarted);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const sendHeartbeat = async (id) => {
    if (!id) return;
    
    const token = localStorage.getItem('attendance_tracker_token');
    try {
      await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}${id}/heartbeat/`, {
        tracker_token: token
      });
      setError(null);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403 || status === 401 || status === 404) {
        // Backend actively rejected tracking or session forcibly closed
        stopTracking();
      } else {
        // Network instability. Keep trying so we don't accidentally burn chances.
        setError('Connection unstable. Reconnecting...');
      }
    }
  };

  const startTracking = (id) => {
    // Attempt to acquire an exclusive lock for this session
    // If another tab holds the lock, this tab will simply wait gracefully until that tab closes.
    // This provides 100% deterministic split-brain protection natively.
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    navigator.locks.request('attendance_tracker_lock', { mode: 'exclusive', signal: abortControllerRef.current.signal }, async (lock) => {
      // 🚀 We acquired the lock! This tab is the deterministic master.
      return new Promise((resolve) => {
        releaseLockRef.current = resolve;
        
        // Initial ping immediately
        sendHeartbeat(id);
        
        // Backend consumes a chance if gap > 60s.
        // Pinging every 30s ensures normal latency doesn't burn a chance.
        timerRef.current = setInterval(() => sendHeartbeat(id), 30000);
      });
    }).catch(err => {
      if (err.name === 'AbortError') {
        // We stopped tracking before acquiring the lock, ignore safely.
      } else {
        console.error("Failed to acquire Web Lock for tracker", err);
      }
    });
  };

  const stopTracking = () => {
    handleStopTrackingLocally();
    // Notify other tabs via storage event if they were waiting for the lock
    localStorage.removeItem('active_session_id');
  };

  useEffect(() => {
    if (sessionId && isTracking) {
      startTracking(sessionId);
    } else {
      handleStopTrackingLocally();
    }
    
    return () => {
      handleStopTrackingLocally();
    };
  }, [sessionId, isTracking]);

  return { isTracking, stopTracking, error };
}
