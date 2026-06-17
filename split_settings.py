import re
import os

with open('pages/hub/settings.js', 'r') as f:
    content = f.read()

# We will just write a script to extract the modals out of settings.js.
# But actually, doing this via Python is risky if brackets don't match perfectly.
