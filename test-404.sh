npm run dev > dev.log 2>&1 &
PID=$!
sleep 15
curl -s http://localhost:3000/does-not-exist > /dev/null
sleep 5
kill $PID
cat dev.log
