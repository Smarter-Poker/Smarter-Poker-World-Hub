import sys

file_path = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/hub/poker-tours.js'
with open(file_path, 'r') as f:
    content = f.read()

content = content.replace('/api/notifications/send-push', '/api/notifications/track-tour')

with open(file_path, 'w') as f:
    f.write(content)

print('Fixed track-tour endpoint successfully')
