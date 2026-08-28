const fs = require('fs');
const path = require('path');

const filesToFix = [
  "src/pages/mentor/CohortDetails.jsx",
  "src/pages/mentor/AssignmentFeedback.jsx",
  "src/pages/mentor/StudentDetails.jsx",
  "src/pages/admin/AddTrustee.jsx",
  "src/pages/admin/AddNotification.jsx",
  "src/pages/admin/SecuritySettings.jsx",
  "src/pages/admin/AddCourse.jsx",
  "src/pages/admin/AddMentor.jsx",
  "src/pages/admin/TrusteeDetails.jsx",
  "src/pages/admin/AddCohort.jsx",
  "src/pages/admin/CohortDetails.jsx",
  "src/pages/admin/AddStudent.jsx",
  "src/pages/admin/CourseDetails.jsx",
  "src/pages/admin/StudentDetails.jsx",
  "src/pages/student/MentorDetails.jsx",
  "src/pages/student/ApplicationStatus.jsx",
  "src/pages/exams/ExamResult.jsx",
  "src/pages/trustee/volunteer/Users.jsx",
  "src/pages/trustee/volunteer/Attendance.jsx",
  "src/pages/trustee/volunteer/Alerts.jsx",
  "src/pages/trustee/volunteer/Schedule.jsx"
];

const basePath = "/home/purush/DEV/Sure-Proed-V2/Frontend/";

for (const relPath of filesToFix) {
  const fullPath = path.join(basePath, relPath);
  if (!fs.existsSync(fullPath)) {
    console.log("Missing", fullPath);
    continue;
  }
  let content = fs.readFileSync(fullPath, "utf-8");
  
  // 1. Ensure useNavigate is imported
  if (!content.includes('useNavigate')) {
    content = content.replace(/import\s+{([^}]*)}\s+from\s+['"]react-router-dom['"];/, (match, p1) => {
      return `import { ${p1.trim()}, useNavigate } from "react-router-dom";`;
    });
  }
  
  // 2. Ensure navigate is initialized
  // We'll insert it right after the component declaration
  // e.g. function CohortDetails() { or const StudentDetails = () => {
  const componentRegex = /(?:function\s+\w+\s*\([^)]*\)\s*{|const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*{)/;
  const match = content.match(componentRegex);
  if (match && !content.includes('const navigate = useNavigate();')) {
    content = content.replace(componentRegex, `${match[0]}\n  const navigate = useNavigate();`);
  }
  
  // 3. Replace <Link to="...">...Back to...</Link>
  // We will replace <Link to="<anything>" className="<anything>">...Back to...</Link>
  // with <a href="#" onClick={(e) => { e.preventDefault(); navigate(-1); }} className="<anything>">...Back to...</a>
  content = content.replace(/<Link\s+to=["'][^"']+["']([^>]*)>(.*?Back to.*?)<\/Link>/gi, (match, attrs, inner) => {
    return `<a href="#" onClick={(e) => { e.preventDefault(); navigate(-1); }} ${attrs}>${inner}</a>`;
  });
  
  fs.writeFileSync(fullPath, content);
  console.log("Fixed", relPath);
}
