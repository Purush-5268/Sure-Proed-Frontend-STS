const fs = require('fs');
const filePath = 'src/pages/student/CourseDetails.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Add states
content = content.replace(
    'const [applyError, setApplyError] = useState("");',
    'const [applyError, setApplyError] = useState("");\n  const [openCohorts, setOpenCohorts] = useState([]);\n  const [selectedCohort, setSelectedCohort] = useState("");\n  const [cohortsLoading, setCohortsLoading] = useState(false);'
);

// Add fetch for cohorts
content = content.replace(
    'if (isMounted) setLoading(false);\n      }',
    `if (isMounted) setLoading(false);\n      }\n\n      // Fetch open cohorts for this course\n      try {\n        setCohortsLoading(true);\n        const cohortsRes = await apiClient.get('/api/cohorts/', { params: { course: id, status: 'OPEN' } });\n        if (isMounted) {\n           const cohortsData = Array.isArray(cohortsRes.data) ? cohortsRes.data : (cohortsRes.data?.results || []);\n           setOpenCohorts(cohortsData);\n           if (cohortsData.length === 1) {\n               setSelectedCohort(cohortsData[0].id);\n           }\n        }\n      } catch (err) {\n        console.error("Failed to load cohorts:", err);\n      } finally {\n        if (isMounted) setCohortsLoading(false);\n      }`
);

// Add import
if (!content.includes('import apiClient from')) {
    content = content.replace(
        'import styles from "./CourseDetails.module.css";',
        'import styles from "./CourseDetails.module.css";\nimport apiClient from "../../services/apiClient";'
    );
}

// Add UI for selecting cohort
const cohortUI = `
            {openCohorts.length > 0 && !hasApplied && (
              <div className={styles.section} style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-nested)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ margin: '0 0 12px 0' }}>Select a Cohort</h3>
                {openCohorts.length > 1 ? (
                  <select 
                    value={selectedCohort}
                    onChange={(e) => setSelectedCohort(e.target.value)}
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '15px' }}
                  >
                    <option value="">-- Choose a Cohort --</option>
                    {openCohorts.map(c => (
                      <option key={c.id} value={c.id}>{c.name || c.code} (Starts: {c.start_date || 'TBD'})</option>
                    ))}
                  </select>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--primary-color)' }}>
                      <input type="radio" checked readOnly />
                      <span><strong>{openCohorts[0].name || openCohorts[0].code}</strong> (Starts: {openCohorts[0].start_date || 'TBD'})</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {applyError && (
`;

content = content.replace('{applyError && (', cohortUI);

// Update apply button logic
content = content.replace(
    'await applicationService.createApplication({ course_id: id });',
    `if (!selectedCohort) {\n                  setApplyError("Please select a cohort before applying.");\n                  setIsApplying(false);\n                  return;\n                }\n                await applicationService.createApplication({ course_id: id, assigned_cohort: selectedCohort });`
);

fs.writeFileSync(filePath, content);
