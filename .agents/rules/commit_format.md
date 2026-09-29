# Workspace Rules & Commit Standards

## 1. Commit Message Standard
Every git commit MUST explicitly list all modified relative file paths/names in the commit message.
Pattern: `<Description of feature/fix>: updated <filepath_1>, <filepath_2>, ...`

## 2. File Isolation Standard (Server VM Safety)
- The user's colleague/friend works on `attendance/` directly on the server VM.
- NEVER run destructive commands like `git reset --hard` or `git clean -f` on the server VM without scoping strictly away from `attendance/`.
- Ensure all repository changes remain isolated to their target modules so `git pull` on the server VM never conflicts with uncommitted `attendance/` work.
