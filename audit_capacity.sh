#!/bin/bash
echo "=== SERVER CAPACITY AUDIT ==="
echo "1. CPU Cores (nproc):"
nproc
echo ""
echo "2. Available RAM (free -m):"
free -m
echo ""
echo "3. Gunicorn Config:"
systemctl cat gunicorn | grep -E 'workers|ExecStart=' | grep -v '#'
echo ""
echo "4. Database Configuration (From .env):"
grep -E 'POSTGRES|USE_SQLITE' /home/dev1/pradeep-backend/.env
echo "============================="
