import { useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiVideo } from "react-icons/fi";
import styles from "./JitsiExamRoom.module.css";

const loadedScripts = new Map();
const noop = () => {};

const loadJitsiApi = (domain) => {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (loadedScripts.has(domain)) return loadedScripts.get(domain);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://${domain}/external_api.js`;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("The Jitsi video service could not be loaded."));
    document.head.appendChild(script);
  });
  loadedScripts.set(domain, promise);
  return promise;
};

function JitsiExamRoom({ session, mode = "candidate", className = "", onEvent = noop }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const onEventRef = useRef(onEvent);
  const [status, setStatus] = useState(session?.enabled ? "CONNECTING" : "DISABLED");
  const [error, setError] = useState("");

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let cancelled = false;
    if (!session?.enabled || !session.domain || !session.room_name || !containerRef.current) {
      setStatus("DISABLED");
      return undefined;
    }

    // Copy primitive values once. Parents refresh exam telemetry frequently and may
    // provide a new session object/callback on every render; neither should recreate
    // the conference iframe while the assigned room itself is unchanged.
    const config = {
      domain: session.domain,
      room_name: session.room_name,
      room_code: session.room_code,
      room_password: session.room_password,
      display_name: session.display_name,
    };

    const emit = (type, detail = "") =>
      onEventRef.current({ type, detail, timestamp: new Date().toISOString() });
    const connect = async () => {
      try {
        setStatus("CONNECTING");
        setError("");
        await loadJitsiApi(config.domain);
        if (cancelled || !containerRef.current) return;
        const api = new window.JitsiMeetExternalAPI(config.domain, {
          roomName: config.room_name,
          width: "100%",
          height: "100%",
          parentNode: containerRef.current,
          userInfo: { displayName: config.display_name || (mode === "proctor" ? "Proctor" : "Candidate") },
          configOverwrite: {
            prejoinConfig: { enabled: false },
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            toolbarButtons:
              mode === "proctor"
                ? ["microphone", "camera", "tileview", "fullscreen", "settings", "hangup"]
                : ["microphone", "camera", "fullscreen", "settings", "hangup"],
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
          },
        });
        apiRef.current = api;

        const applyPasswordAsModerator = (event = {}) => {
          if (event.role === "moderator" && config.room_password) {
            api.executeCommand("password", config.room_password);
          }
        };
        api.addEventListener("participantRoleChanged", applyPasswordAsModerator);
        api.addEventListener("passwordRequired", () => {
          if (config.room_password) api.executeCommand("password", config.room_password);
        });
        api.addEventListener("videoConferenceJoined", () => {
          setStatus("CONNECTED");
          emit("JITSI_JOINED", `Joined protected proctoring room ${config.room_code || ""}`.trim());
        });
        api.addEventListener("readyToClose", () => {
          setStatus("DISCONNECTED");
          emit("JITSI_LEFT", "The embedded proctoring conference was closed.");
        });
        api.addEventListener("errorOccurred", (event) => {
          const detail = event?.message || event?.error?.message || "Jitsi reported a conference error.";
          setStatus("ERROR");
          setError(detail);
          emit("JITSI_ERROR", detail);
        });
      } catch (connectionError) {
        if (!cancelled) {
          setStatus("ERROR");
          setError(connectionError.message || "Unable to connect to the proctoring room.");
          emit("JITSI_ERROR", connectionError.message || "Jitsi initialization failed.");
        }
      }
    };

    connect();
    return () => {
      cancelled = true;
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [
    mode,
    session?.display_name,
    session?.domain,
    session?.enabled,
    session?.room_code,
    session?.room_name,
    session?.room_password,
  ]);

  if (!session?.enabled) return null;

  return (
    <section className={`${styles.card} ${mode === "proctor" ? styles.proctorCard : ""} ${className}`}>
      <div className={styles.header}>
        <span><FiVideo /> Live proctoring · Room {session.room_code}</span>
        <strong className={styles[status.toLowerCase()] || ""}>{status}</strong>
      </div>
      <div ref={containerRef} className={styles.frame} data-testid="jitsi-exam-room">
        {status === "CONNECTING" && <span className={styles.placeholder}>Connecting camera and microphone…</span>}
      </div>
      {error && (
        <div className={styles.error} role="alert">
          <FiAlertTriangle /> {error}
        </div>
      )}
    </section>
  );
}

export default JitsiExamRoom;
