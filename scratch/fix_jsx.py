with open("pages/hub/MLB-ANALYTICS/index.tsx", "r") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if '<main className="mx-auto max-w-2xl bg-[#0a0a15] min-h-screen shadow-2xl relative pb-16 text-slate-300' in line:
        new_lines.append(line.replace('<main', '<div').replace('</main>', '</div>'))
    else:
        new_lines.append(line)

with open("pages/hub/MLB-ANALYTICS/index.tsx", "w") as f:
    f.writelines(new_lines)
