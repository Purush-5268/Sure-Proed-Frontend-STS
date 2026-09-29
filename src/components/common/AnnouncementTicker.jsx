import React, { useState, useEffect } from "react";
import "./AnnouncementTicker.css";
import apiClient from "../../services/apiClient";

const AnnouncementTicker = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchAnnouncements = async () => {
      try {
        const res = await apiClient.get("/system-information/SCROLLING_TICKER/");
        if (isMounted && res.data && res.data.value) {
          const parsed = JSON.parse(res.data.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAnnouncements(parsed);
          }
        }
      } catch (err) {
        if (isMounted && err.response?.status === 404) {
          // Defaults if no configuration yet
          setAnnouncements([
            "🔥 Registrations are now OPEN for the upcoming batch!",
            "🚀 Welcome to SURE ProEd - Empowering your career journey.",
          ]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchAnnouncements();
    return () => { isMounted = false; };
  }, []);

  if (loading || announcements.length === 0) return null;

  return (
    <div className="announcement-ticker-container">
      <div className="announcement-ticker-scroll">
        {/* We repeat the announcements twice to create a seamless infinite loop effect */}
        {[...announcements, ...announcements].map((msg, index) => (
          <span key={index} className="announcement-item">
            {msg}
          </span>
        ))}
      </div>
    </div>
  );
};

export default AnnouncementTicker;
