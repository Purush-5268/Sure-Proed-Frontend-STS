import os
import re

file_path = '/home/dev1/Student-Tracking-Application-Frontend/src/pages/admin/AttendanceDetails.jsx'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Add state for allStudents
old_state = "  const [selectedResolveStudentId, setSelectedResolveStudentId] = useState(\"\");"
new_state = """  const [selectedResolveStudentId, setSelectedResolveStudentId] = useState("");
  const [allStudents, setAllStudents] = useState([]);
  const [isFetchingStudents, setIsFetchingStudents] = useState(false);"""
if old_state in content and "const [allStudents" not in content:
    content = content.replace(old_state, new_state)

# 2. Add useEffect to fetch all students when modal opens
old_effect = "  const handleResolveSubmit = async (e) => {"
new_effect = """  useEffect(() => {
    if (showResolveModal && allStudents.length === 0) {
      setIsFetchingStudents(true);
      apiClient.get('/api/applications/')
        .then(res => {
          // Filter to active students
          const activeApps = res.data.filter(app => !["DROPPED", "SUSPENDED", "CANCELLED", "REJECTED"].includes(app.status));
          
          // Deduplicate by student id
          const uniqueStudents = [];
          const seen = new Set();
          activeApps.forEach(app => {
             if (app.student && !seen.has(app.student.id)) {
                 seen.add(app.student.id);
                 uniqueStudents.push({
                     id: app.student.id,
                     name: app.student.user ? `${app.student.user.first_name} ${app.student.user.last_name}` : "Unknown",
                     email: app.student.user ? app.student.user.email : "",
                     cohort: app.assigned_cohort ? app.assigned_cohort.name : "No Cohort"
                 });
             }
          });
          
          // Sort alphabetically
          uniqueStudents.sort((a, b) => a.name.localeCompare(b.name));
          setAllStudents(uniqueStudents);
        })
        .catch(err => console.error("Failed to fetch students for mapping", err))
        .finally(() => setIsFetchingStudents(false));
    }
  }, [showResolveModal]);

  const handleResolveSubmit = async (e) => {"""
if old_effect in content and "apiClient.get('/api/applications/')" not in content:
    content = content.replace(old_effect, new_effect)

# 3. Update the <select> dropdown in the modal
old_select = """                    <option value="">-- Select an Expected Student --</option>
                    {officialData?.expected_students && Object.entries(officialData.expected_students)
                      .sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""))
                      .map(([id, s]) => (
                        <option key={id} value={id}>
                          {s.name} ({s.email}) - {s.status}
                        </option>
                      ))}"""

new_select = """                    <option value="">-- Select ANY Student in Platform --</option>
                    {isFetchingStudents ? (
                        <option value="" disabled>Loading all students...</option>
                    ) : (
                        allStudents.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.email}) - {s.cohort}
                          </option>
                        ))
                    )}"""

if old_select in content:
    content = content.replace(old_select, new_select)

with open(file_path, 'w') as f:
    f.write(content)
print("Patched AttendanceDetails.jsx")
