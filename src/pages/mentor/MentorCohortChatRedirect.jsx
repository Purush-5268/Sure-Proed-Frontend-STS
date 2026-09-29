import { useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

function MentorCohortChatRedirect() {
  const navigate = useNavigate();
  const { globalCohort } = useOutletContext();

  useEffect(() => {
    if (globalCohort) {
      navigate(`/mentor/cohort-chat/${globalCohort}`, { replace: true });
    }
  }, [globalCohort, navigate]);

  if (!globalCohort) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '85vh', background: 'var(--bg-secondary)', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Select a Cohort</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>Please select a cohort from the global filter in the top right corner to access its chat room.</p>
      </div>
    );
  }

  return null;
}

export default MentorCohortChatRedirect;
