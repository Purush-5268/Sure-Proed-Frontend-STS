const fs = require('fs');
const file = 'src/pages/admin/TrusteeDetails.jsx';
let content = fs.readFileSync(file, 'utf8');

// Add imports
if (!content.includes('import { FiArrowLeft, FiShield, FiCheck }')) {
  content = content.replace('import { FiArrowLeft, FiShield }', 'import { FiArrowLeft, FiShield, FiCheck }');
}

// Add state
const stateCode = `
  const [cohorts, setCohorts] = useState([]);
  const [selectedCohorts, setSelectedCohorts] = useState(new Set());
  const [savingCohorts, setSavingCohorts] = useState(false);
`;
content = content.replace('const [error, setError] = useState("");', 'const [error, setError] = useState("");\n' + stateCode);

// Add fetch
const fetchCode = `
        // Fetch User object
        const [userRes, cohortsRes] = await Promise.all([
          apiClient.get(API_ENDPOINTS.USERS.BY_ID(id)),
          apiClient.get(API_ENDPOINTS.COHORTS.BASE)
        ]);
        const userData = userRes.data;
        const allCohorts = normalizeListResponse(cohortsRes.data);
        
        // Find which cohorts have this user as a volunteer
        const userCohortIds = new Set();
        allCohorts.forEach(c => {
          if (c.volunteers && c.volunteers.includes(userData.id)) {
            userCohortIds.add(c.id);
          }
        });

        if (isMounted) {
          setUser(userData);
          setProfile(null);
          setCohorts(allCohorts);
          setSelectedCohorts(userCohortIds);
        }
`;
content = content.replace(/ \/\/ Fetch User object\s+const userRes = await apiClient.get\(API_ENDPOINTS.USERS.BY_ID\(id\)\);\s+const userData = userRes.data;\s+if \(isMounted\) {\s+setUser\(userData\);\s+setProfile\(null\);\s+}/, fetchCode);

// Add save handler
const saveHandler = `
  const handleToggleCohort = (cohortId) => {
    const next = new Set(selectedCohorts);
    if (next.has(cohortId)) next.delete(cohortId);
    else next.add(cohortId);
    setSelectedCohorts(next);
  };

  const handleSaveCohorts = async () => {
    setSavingCohorts(true);
    try {
      await apiClient.post(\`/api/users/\${id}/assign-cohorts/\`, {
        cohort_ids: Array.from(selectedCohorts)
      });
      alert("Cohorts assigned successfully!");
    } catch (err) {
      alert("Failed to assign cohorts: " + (err.response?.data?.detail || err.message));
    } finally {
      setSavingCohorts(false);
    }
  };
`;
content = content.replace('if (loading) {', saveHandler + '\n  if (loading) {');

// Add UI
const uiCode = `
        <div style={{ marginTop: "32px" }}>
          <h3 style={{ fontSize: "16px", color: "var(--text-primary)", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>Assigned Cohorts</h3>
          {user?.role === "VOLUNTEER" || user?.role === "TRUSTEE" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                {cohorts.map(c => (
                  <label key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px", background: "var(--bg-nested)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer" }}>
                    <input 
                      type="checkbox" 
                      checked={selectedCohorts.has(c.id)}
                      onChange={() => handleToggleCohort(c.id)}
                      style={{ marginTop: "4px" }}
                    />
                    <div>
                      <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>{c.name || c.code}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{c.course_name}</div>
                    </div>
                  </label>
                ))}
              </div>
              <button 
                onClick={handleSaveCohorts}
                disabled={savingCohorts}
                className="premium-btn premium-btn-primary"
              >
                {savingCohorts ? "Saving..." : "Save Cohort Assignments"}
              </button>
            </>
          ) : (
            <p style={{ color: "var(--text-secondary)" }}>Cohort assignment is only available for Volunteers and Trustees.</p>
          )}
        </div>
      </div>
    </div>
  );
`;
content = content.replace(/<\/div>\s+<\/div>\s+<\/div>\s+\);\s+}\s+export default TrusteeDetails;/s, uiCode + '\n}\n\nexport default TrusteeDetails;\n');

fs.writeFileSync(file, content);
