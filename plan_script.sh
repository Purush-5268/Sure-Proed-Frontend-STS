#!/bin/bash
cd /home/purush/DEV/Sure-Proed-V2/Frontend/src/pages/mentor
echo "=== Assignments ==="
cat Assignments.jsx | grep -i "apiClient"
echo "=== AssignmentFeedback ==="
cat AssignmentFeedback.jsx | grep -i "apiClient"
