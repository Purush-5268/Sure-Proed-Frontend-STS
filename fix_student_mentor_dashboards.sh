# Mentor Dashboard
sed -i 's/let isMounted = true;/const abortController = new AbortController();\n    let isMounted = true;/' src/pages/mentor/MentorDashboard.jsx
sed -i 's/studentService.getStudentProfiles()/studentService.getStudentProfiles({}, { signal: abortController.signal })/' src/pages/mentor/MentorDashboard.jsx
sed -i 's/return () => { isMounted = false; };/return () => { isMounted = false; abortController.abort(); };/' src/pages/mentor/MentorDashboard.jsx

# Student Dashboard
sed -i 's/let isMounted = true;/const abortController = new AbortController();\n    let isMounted = true;/' src/pages/student/Dashboard.jsx
sed -i 's/studentService.getStudentProfiles()/studentService.getStudentProfiles({}, { signal: abortController.signal })/' src/pages/student/Dashboard.jsx
sed -i 's/return () => { isMounted = false; };/return () => { isMounted = false; abortController.abort(); };/' src/pages/student/Dashboard.jsx
