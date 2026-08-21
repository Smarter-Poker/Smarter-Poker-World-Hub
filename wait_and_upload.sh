#!/bin/bash
echo "Waiting for process_images to finish..."
while pgrep -f "process_images.py" > /dev/null; do
    sleep 5
done
echo "Processing done, uploading..."
node upload_throwables.js
echo "Upload complete!"
