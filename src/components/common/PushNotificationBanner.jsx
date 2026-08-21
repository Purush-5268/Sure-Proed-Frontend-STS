import { useState, useEffect } from "react";
import { pushNotificationService } from "../../services/pushNotificationService";

const PushNotificationBanner = () => {
  const [pushStatus, setPushStatus] = useState("default");
  const [isPushLoading, setIsPushLoading] = useState(false);

  useEffect(() => {
    if ("Notification" in window) {
      setPushStatus(Notification.permission);
    }
  }, []);

  if (!pushNotificationService.isSupported()) return null;
  if (pushStatus === "granted") return null;

  return (
    <div style={{ background: pushStatus === "denied" ? 'var(--danger-color)' : 'var(--primary-color)', color: 'white', padding: '16px 24px', borderRadius: '12px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: `0 4px 12px ${pushStatus === "denied" ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}` }}>
      <div>
        <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>{pushStatus === "denied" ? "⚠️" : "🔔"}</span>
          {pushStatus === "denied" ? "Notifications are Blocked!" : "Never Miss an Update!"}
        </h4>
        <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
          {pushStatus === "denied"
            ? "You are missing important alerts! Please click the 🔒 icon in your browser's URL bar, change Notifications to 'Allow', and refresh this page."
            : "Enable browser notifications to receive instant alerts for classes, assignments, and announcements."}
        </p>
      </div>
      {pushStatus === "default" && (
        <button
          onClick={async () => {
            setIsPushLoading(true);
            try {
              const perm = await Notification.requestPermission();
              setPushStatus(perm);
              if (perm === "granted") await pushNotificationService.subscribe();
            } catch (e) { console.error(e); }
            setIsPushLoading(false);
          }}
          disabled={isPushLoading}
          style={{ padding: '10px 20px', borderRadius: '8px', background: 'white', color: 'var(--primary-color)', border: 'none', fontWeight: 'bold', cursor: isPushLoading ? 'not-allowed' : 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', whiteSpace: 'nowrap', marginLeft: '16px' }}
        >
          {isPushLoading ? "Enabling..." : "Enable Notifications"}
        </button>
      )}
    </div>
  );
};

export default PushNotificationBanner;
