import re

file_path = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/hub/poker-tours.js'
with open(file_path, 'r') as f:
    content = f.read()

content = content.replace('#d4a853', '#ffffff')
content = content.replace('#f5d799', '#ffffff')
content = content.replace('#b8860b', '#ffffff')

content = re.sub(r'rgba\(212,\s*168,\s*83,\s*([0-9.]+)\)', r'rgba(255,255,255,\1)', content)
content = re.sub(r'rgba\(184,\s*134,\s*11,\s*([0-9.]+)\)', r'rgba(255,255,255,\1)', content)

with open(file_path, 'w') as f:
    f.write(content)

print("Colors replaced.")
