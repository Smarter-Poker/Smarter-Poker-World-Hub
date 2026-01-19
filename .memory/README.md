# Anti Gravity 2.0 Memory Bank

**Purpose:** Persistent memory system for AI agents to maintain context across sessions.

---

## 📁 Structure

```
.memory/
├── project_mission.md      # The North Star (project goals, tech stack, hard rules)
├── active_context.md       # The Short-Term RAM (current session state)
├── system_patterns.md      # The IQ Booster (architectural patterns)
└── README.md              # This file
```

---

## 🧠 How It Works

### For AI Agents
**On Session Start:**
1. Read `active_context.md` to understand current state
2. Read `project_mission.md` to understand project goals
3. Acknowledge current state in first response

**During Session:**
1. Update `active_context.md` when plans change
2. Reference `system_patterns.md` for architectural decisions
3. Follow rules defined in `.cursorrules`

**On Session End:**
1. Update `active_context.md` with progress
2. Document any new blockers or issues
3. Deploy changes to production

### For Developers
**When to Update:**
- **project_mission.md** — When adding new orbs, changing tech stack, or defining new hard rules
- **active_context.md** — At the end of each work session to document progress
- **system_patterns.md** — When establishing new architectural patterns or design standards

---

## 📖 File Descriptions

### `project_mission.md`
**The North Star** — High-level project overview

**Contains:**
- Project identity and vision
- Core goals (priority order)
- Tech stack
- Hard rules (non-negotiable constraints)
- Project structure

**Update Frequency:** Rarely (only when project direction changes)

---

### `active_context.md`
**The Short-Term RAM** — Current session state

**Contains:**
- Current focus and objectives
- Recent changes (last 24-48 hours)
- Current database state
- Technical debt and known issues
- Next steps (immediate priorities)
- Agent memory notes

**Update Frequency:** Every session (at minimum)

---

### `system_patterns.md`
**The IQ Booster** — Architectural patterns and standards

**Contains:**
- Visual design patterns (glassmorphism, neon accents)
- Code architecture patterns (Scorched Earth, No 404s)
- Security patterns (RLS, no sensitive data in client)
- Responsive design patterns (A/B/C)
- Deployment patterns
- Component patterns
- Data patterns (batch execution)
- Testing patterns

**Update Frequency:** When establishing new patterns or standards

---

## 🚀 Quick Start

### For New AI Agents
```bash
# 1. Read the memory files
cat .memory/active_context.md
cat .memory/project_mission.md

# 2. Understand current state
# 3. Proceed with task

# 4. Update context at end of session
nano .memory/active_context.md
```

### For Developers
```bash
# Update current session state
nano .memory/active_context.md

# Add new architectural pattern
nano .memory/system_patterns.md

# Define new project goal
nano .memory/project_mission.md
```

---

## 🔗 Integration with `.cursorrules`

The `.cursorrules` file enforces the Anti Gravity 2.0 system rules:

1. **Memory First** — Read memory files before responding
2. **Chain of Thought** — Explain reasoning before executing
3. **Scorched Earth Protocol** — Self-contained components only
4. **Project Isolation** — Verify workspace before changes
5. **Deployment Law** — All sessions end with deployment

**See:** `.cursorrules` for full rule set

---

## 📊 Current State (As of 2026-01-19)

**Active Phase:** Orb #9 (Poker Near Me) Database Population  
**Status:** Blocked by Supabase infrastructure issues  
**Next Steps:** Resolve billing/scaling, execute migration files

**See:** `active_context.md` for detailed current state

---

## 🎯 Benefits

### For AI Agents
- ✅ Never lose context between sessions
- ✅ Understand project constraints and goals
- ✅ Make architecturally consistent decisions
- ✅ Avoid repeating past mistakes

### For Developers
- ✅ Onboard new team members faster
- ✅ Maintain consistency across features
- ✅ Document architectural decisions
- ✅ Track project evolution over time

---

## 🔄 Maintenance

**Weekly:**
- Update `active_context.md` with current focus

**Monthly:**
- Review `system_patterns.md` for outdated patterns
- Archive completed goals in `project_mission.md`

**Quarterly:**
- Full audit of all memory files
- Remove obsolete information
- Update tech stack if changed

---

## 📝 Version History

- **v2.0** (2026-01-19) — Initial Anti Gravity 2.0 implementation
  - Created `.memory/` folder structure
  - Defined three core memory files
  - Integrated with `.cursorrules`

---

**Maintained by:** Smarter.Poker Development Team  
**Last Updated:** 2026-01-19
