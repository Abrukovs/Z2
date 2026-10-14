#!/bin/bash
# Wrapper для dev сервера с логированием
cd /home/z/my-project
exec bash start-dev.sh >> /home/z/my-project/dev.log 2>&1
