#!/bin/bash
# Wrapper для запуска loop в фоне с логированием
cd /home/z/my-project
exec >> /tmp/crosscheck-loop.log 2>&1
echo "=== Loop wrapper started $(date) ==="
bash /home/z/my-project/run-crosscheck-loop.sh
echo "=== Loop wrapper finished $(date) ==="
