import { useState, useEffect, useRef } from 'react';
import apiClient from './apiClient';
import { API_ENDPOINTS } from '../constants/apiEndpoints';

export function useAttendanceTracker() {
  const [sessionId, setSessionId] = useState(localStorage.getItem('active_session_id'));
  const [isTracking, setIsTracking] = useState(!!sessionId);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const handleSessionStarted = () => {
      const id = localStorage.getItem('active_session_id');
      if (id) {
        setSessionId(id);
        setIsTracking(true);
      }
    };

    window.addEventListener('session_started', handleSessionStarted);
    return () => window.removeEventListener('session_started', handleSessionStarted);
  }, []);

  const sendHeartbeat = async (id) => {
    if (!id) return;
    try {
      await apiClient.post(`${API_ENDPOINTS.ATTENDANCE.BASE}${id}/heartbeat/`);
      setError(null);
    } catch (err) {
      if (err.response?.status === 403 || err.response?.status === 401 || err.response?.status === 404) {
        stopTracking();
      } else {
        setError('Lost connection. Retrying...');
      }
    }
  };

  const startTracking = (id) => {
    if (timerRef.current) clearInterval(timerRef.current);
    sendHeartbeat(id);
    timerRef.current = setInterval(() => sendHeartbeat(id), 120000);
  };

  const stopTracking = () => {
    setIsTracking(false);
    setSessionId(null);
    localStorage.removeItem('active_session_id');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (sessionId && isTracking) {
      startTracking(sessionId);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionId, isTracking]);

  return { isTracking, stopTracking, error };
}
