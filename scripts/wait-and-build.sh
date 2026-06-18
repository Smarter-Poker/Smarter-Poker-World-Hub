#!/bin/bash
while ps aux | grep -v grep | grep -q "next build"; do
  echo "Waiting for other builds to finish..."
  sleep 5
done
echo "No other builds running. Starting my build..."
node scripts/upgrade-portfolio-ui.js
npx next build > my-build.log 2>&1
