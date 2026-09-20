const fs = require('fs');
const file = 'src/pages/trustee/volunteer/Alerts.jsx';
let content = fs.readFileSync(file, 'utf8');

// The backend returns keys like:
// id, student_name, session_title, class_date, domain_name, group_name, total_duration_percent
content = content.replace(/student\.name/g, 'student.student_name');
content = content.replace(/student\.sessionType/g, 'student.session_title');
content = content.replace(/student\.streamName/g, 'student.domain_name');
content = content.replace(/student\.groupName/g, 'student.group_name');
content = content.replace(/student\.sessionDate/g, 'student.class_date');
content = content.replace(/student\.totalDurationPercent/g, 'student.total_duration_percent');

// For warning submission
content = content.replace(/student\.studentId \|\| student\.student_id \|\| student\.id/g, 'student.student_id || student.id');
content = content.replace(/student\.sessionId \|\| student\.session_id/g, 'student.session_id || student.session');

fs.writeFileSync(file, content);
