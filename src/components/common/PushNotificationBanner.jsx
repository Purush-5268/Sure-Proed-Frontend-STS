import { useState, useEffect } from "react";
import { pushNotificationService } from "../../services/pushNotificationService";

const PushNotificationBanner = () => {
  const [pushStatus, setPushStatus] = useState("default");
  const [isPushLoading, setIsPushLoading] = useState(false);

  useEffect(() => {
    if ("Notification" in window) {
      setPushStatus(Notification.permission);
      
      // Listen for permission changes dynamically
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: "notifications" }).then(permissionStatus => {
          permissionStatus.onchange = () => {
            setPushStatus(permissionStatus.state);
          };
        }).catch(err => console.warn("Permissions query failed", err));
      }
    }
  }, []);

  if (!pushNotificationService.isSupported()) return null;
  if (pushStatus === "granted") return null;

  return (
    <div style={{
      background: pushStatus === "denied" ? 'var(--primary-dark)' : 'var(--student-btn-gradient, var(--primary-color))',
      padding: '20px 24px',
      borderRadius: 'var(--radius-lg)',
      marginBottom: '24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: pushStatus === "denied" ? '0 8px 20px var(--student-glow-primary, rgba(147, 51, 234, 0.3))' : '0 8px 20px var(--student-glow-primary, rgba(147, 51, 234, 0.3))',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <div>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#ffffff', fontWeight: '800', letterSpacing: '0.5px' }}>
          <span style={{ fontSize: '20px' }}>{pushStatus === "denied" ? "⚠️" : "🔔"}</span>
          {pushStatus === "denied" ? "Notifications are Blocked!" : "Never Miss an Update!"}
        </h4>
        <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255, 255, 255, 0.9)', lineHeight: '1.5' }}>
          {pushStatus === "denied"
            ? "You are missing important alerts! Please click the 'Site Information' icon (🎛️ or 🔒) in your browser's URL bar, change Notifications to 'Allow', and refresh this page."
            : "Enable browser notifications to receive instant alerts for classes, assignments, and announcements."}
        </p>
      </div>
      {(pushStatus === "default" || pushStatus === "denied") && (
        <button
          onClick={async () => {
            if (pushStatus === "denied") {
              alert("Push notifications are currently blocked by your browser. Please click the 'Site Information' icon (the sliders 🎛️ or padlock 🔒) next to the URL in the address bar, set Notifications to 'Allow', and reload the page.");
              return;
            }
            setIsPushLoading(true);
            try {
              const perm = await Notification.requestPermission();
              setPushStatus(perm);
              if (perm === "granted") await pushNotificationService.subscribe();
            } catch (e) { console.error(e); }
            setIsPushLoading(false);
          }}
          disabled={isPushLoading}
          style={{
            padding: '12px 24px',
            borderRadius: 'var(--radius-full)',
            background: '#ffffff',
            color: pushStatus === "denied" ? '#ef4444' : 'var(--primary-color)',
            border: 'none',
            fontWeight: '800',
            cursor: isPushLoading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            whiteSpace: 'nowrap',
            marginLeft: '20px',
            transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)'
          }}
          onMouseEnter={(e) => { if(!isPushLoading) e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)' }}
          onMouseLeave={(e) => { if(!isPushLoading) e.currentTarget.style.transform = 'translateY(0) scale(1)' }}
        >
          {isPushLoading ? "Enabling..." : pushStatus === "denied" ? "Unblock Notifications" : "Enable Notifications"}
        </button>
      )}
    </div>
  );
};

export default PushNotificationBanner;
