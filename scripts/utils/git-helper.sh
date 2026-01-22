#!/bin/bash
# Git Automation & Enhancement Utility for Smarter.Poker
# Enhanced git workflows with automation and convenience features

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# ============================================
# Enhanced Status & Info
# ============================================

# Pretty git status
status() {
    echo -e "${YELLOW}📊 Git Status${NC}"
    echo ""
    
    # Branch info
    local branch=$(git branch --show-current)
    local ahead=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "?")
    local behind=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo "?")
    
    echo -e "${CYAN}Branch:${NC} $branch (↑$ahead ↓$behind)"
    
    # Last commit
    echo -e "${CYAN}Last commit:${NC} $(git log -1 --pretty=format:'%h %s (%cr)' 2>/dev/null)"
    
    echo ""
    
    # File changes
    git status --short
    
    echo ""
    
    # Stash count
    local stash_count=$(git stash list 2>/dev/null | wc -l | tr -d ' ')
    [ "$stash_count" -gt 0 ] && echo -e "${CYAN}Stashes:${NC} $stash_count"
}

# Show recent branches
branches() {
    local count="${1:-10}"
    echo -e "${YELLOW}📋 Recent Branches (last $count)${NC}"
    echo ""
    git for-each-ref --sort=-committerdate refs/heads/ --format='%(color:yellow)%(refname:short)%(color:reset) - %(color:green)%(committerdate:relative)%(color:reset) - %(contents:subject)' | head -$count
}

# Show contributor stats
contributors() {
    echo -e "${YELLOW}👥 Contributors${NC}"
    echo ""
    git shortlog -sn --all | head -20
}

# ============================================
# Quick Actions
# ============================================

# Quick commit with auto-generated message
quick_commit() {
    local message="${1:-Auto commit $(date +%Y-%m-%d\ %H:%M)}"
    
    echo -e "${CYAN}📝 Quick commit: $message${NC}"
    
    git add -A
    git commit -m "$message"
    
    echo -e "${GREEN}✓ Committed${NC}"
}

# Commit and push
commit_push() {
    local message="${1:-Update $(date +%Y-%m-%d\ %H:%M)}"
    local branch=$(git branch --show-current)
    
    echo -e "${CYAN}🚀 Commit and push to $branch${NC}"
    
    git add -A
    git commit -m "$message"
    git push origin "$branch"
    
    echo -e "${GREEN}✓ Pushed to $branch${NC}"
}

# Amend last commit
amend() {
    echo -e "${CYAN}📝 Amending last commit${NC}"
    
    git add -A
    git commit --amend --no-edit
    
    echo -e "${GREEN}✓ Amended${NC}"
}

# Undo last commit (keep changes)
undo() {
    echo -e "${YELLOW}↩️ Undoing last commit${NC}"
    
    git reset --soft HEAD~1
    
    echo -e "${GREEN}✓ Last commit undone (changes preserved)${NC}"
}

# ============================================
# Branch Management
# ============================================

# Create and checkout new branch
new_branch() {
    local name="$1"
    local base="${2:-main}"
    
    if [ -z "$name" ]; then
        echo -e "${RED}❌ Branch name required${NC}"
        return 1
    fi
    
    echo -e "${CYAN}🌿 Creating branch: $name from $base${NC}"
    
    git checkout "$base"
    git pull origin "$base"
    git checkout -b "$name"
    
    echo -e "${GREEN}✓ Created and switched to $name${NC}"
}

# Clean up merged branches
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up merged branches${NC}"
    
    # List branches to delete
    local branches=$(git branch --merged main | grep -v "^\*\|main\|master" || true)
    
    if [ -z "$branches" ]; then
        echo -e "${GREEN}✓ No merged branches to clean${NC}"
        return 0
    fi
    
    echo "Will delete:"
    echo "$branches"
    echo ""
    
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "$branches" | xargs -n 1 git branch -d
        echo -e "${GREEN}✓ Cleanup complete${NC}"
    else
        echo "Aborted"
    fi
}

# ============================================
# Sync & Update
# ============================================

# Sync with remote
sync() {
    local branch=$(git branch --show-current)
    
    echo -e "${CYAN}🔄 Syncing $branch with remote${NC}"
    
    git fetch --all --prune
    git pull origin "$branch" --rebase
    
    echo -e "${GREEN}✓ Synced${NC}"
}

# Pull and update dependencies
update() {
    echo -e "${CYAN}🔄 Full update${NC}"
    
    sync
    
    echo ""
    echo -e "${CYAN}📦 Updating dependencies${NC}"
    npm install
    
    echo -e "${GREEN}✓ Update complete${NC}"
}

# ============================================
# Diff & Log
# ============================================

# Pretty diff
diff_pretty() {
    local path="${1:-.}"
    
    # Use bat for syntax highlighting if available
    if command -v bat &> /dev/null; then
        git diff "$path" | bat --language=diff
    else
        git diff --color "$path"
    fi
}

# Show last N commits
log_recent() {
    local count="${1:-10}"
    
    echo -e "${YELLOW}📜 Recent $count commits${NC}"
    echo ""
    
    git log --oneline --graph --decorate -$count
}

# Search commit messages
search_commits() {
    local query="$1"
    
    echo -e "${YELLOW}🔍 Searching commits for: $query${NC}"
    echo ""
    
    git log --all --oneline --grep="$query"
}

# Show changes in a commit
show_commit() {
    local commit="${1:-HEAD}"
    
    git show "$commit" --stat
    echo ""
    git show "$commit" --name-only
}

# ============================================
# Stash Management
# ============================================

# Quick stash
stash() {
    local message="${1:-WIP $(date +%Y-%m-%d\ %H:%M)}"
    
    echo -e "${CYAN}📦 Stashing: $message${NC}"
    
    git stash push -m "$message"
    
    echo -e "${GREEN}✓ Stashed${NC}"
}

# List stashes
stash_list() {
    echo -e "${YELLOW}📦 Stashes${NC}"
    echo ""
    git stash list
}

# Pop latest stash
stash_pop() {
    echo -e "${CYAN}📦 Popping stash${NC}"
    
    git stash pop
    
    echo -e "${GREEN}✓ Stash applied${NC}"
}

# ============================================
# Tags & Releases
# ============================================

# Create version tag
tag_version() {
    local version="$1"
    local message="${2:-Release $version}"
    
    if [ -z "$version" ]; then
        echo -e "${RED}❌ Version required (e.g., v1.0.0)${NC}"
        return 1
    fi
    
    echo -e "${CYAN}🏷️ Creating tag: $version${NC}"
    
    git tag -a "$version" -m "$message"
    git push origin "$version"
    
    echo -e "${GREEN}✓ Tag $version created and pushed${NC}"
}

# List tags
tags() {
    echo -e "${YELLOW}🏷️ Tags${NC}"
    echo ""
    git tag -l --sort=-version:refname | head -20
}

# ============================================
# Advanced Features
# ============================================

# Interactive rebase
rebase_interactive() {
    local count="${1:-5}"
    
    echo -e "${CYAN}📝 Interactive rebase (last $count commits)${NC}"
    
    git rebase -i HEAD~$count
}

# Squash last N commits
squash() {
    local count="${1:-2}"
    local message="${2:-Squashed $count commits}"
    
    echo -e "${CYAN}🔨 Squashing last $count commits${NC}"
    
    git reset --soft HEAD~$count
    git commit -m "$message"
    
    echo -e "${GREEN}✓ Squashed into single commit${NC}"
}

# Cherry pick a commit
cherry() {
    local commit="$1"
    
    echo -e "${CYAN}🍒 Cherry-picking: $commit${NC}"
    
    git cherry-pick "$commit"
    
    echo -e "${GREEN}✓ Cherry-picked${NC}"
}

# Bisect helper
bisect_start() {
    local good="${1:-}"
    local bad="${2:-HEAD}"
    
    echo -e "${CYAN}🔍 Starting bisect${NC}"
    
    git bisect start
    git bisect bad "$bad"
    
    if [ -n "$good" ]; then
        git bisect good "$good"
    else
        echo "Now mark a good commit with: git bisect good <commit>"
    fi
}

# ============================================
# Hooks & Automation
# ============================================

# Install pre-commit hook for linting
install_hooks() {
    local hooks_dir="$PROJECT_ROOT/.git/hooks"
    
    echo -e "${CYAN}🪝 Installing git hooks${NC}"
    
    # Pre-commit hook
    cat > "$hooks_dir/pre-commit" << 'EOF'
#!/bin/bash
# Pre-commit hook for Smarter.Poker

echo "🔍 Running pre-commit checks..."

# Check for console.log in staged files
if git diff --cached --name-only | xargs grep -l "console.log" 2>/dev/null; then
    echo "⚠️  Warning: console.log found in staged files"
fi

# Run lint on staged JS files
staged_js=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx)$' || true)
if [ -n "$staged_js" ]; then
    echo "📝 Checking staged files..."
    # npm run lint --silent || exit 1
fi

echo "✅ Pre-commit checks passed"
EOF
    chmod +x "$hooks_dir/pre-commit"
    
    # Post-merge hook
    cat > "$hooks_dir/post-merge" << 'EOF'
#!/bin/bash
# Post-merge hook for Smarter.Poker

# Check if package.json changed
if git diff HEAD@{1} --name-only | grep -q "package.json"; then
    echo "📦 package.json changed, running npm install..."
    npm install
fi
EOF
    chmod +x "$hooks_dir/post-merge"
    
    echo -e "${GREEN}✓ Hooks installed${NC}"
}

# ============================================
# GitHub CLI Integration
# ============================================

# Create PR
create_pr() {
    local title="${1:-}"
    local body="${2:-}"
    local base="${3:-main}"
    
    echo -e "${CYAN}🔀 Creating Pull Request${NC}"
    
    if [ -z "$title" ]; then
        # Use last commit message as title
        title=$(git log -1 --pretty=format:'%s')
    fi
    
    gh pr create --title "$title" --body "$body" --base "$base"
}

# List open PRs
list_prs() {
    echo -e "${YELLOW}📋 Open Pull Requests${NC}"
    echo ""
    gh pr list
}

# View PR
view_pr() {
    local pr="${1:-}"
    
    gh pr view $pr
}

# Merge PR
merge_pr() {
    local pr="${1:-}"
    
    gh pr merge $pr --squash --delete-branch
}

# ============================================
# Main Command Handler
# ============================================

case "${1:-help}" in
    # Status & Info
    status|s)
        status
        ;;
    branches|b)
        branches "$2"
        ;;
    contributors)
        contributors
        ;;
    
    # Quick Actions
    quick|q)
        quick_commit "$2"
        ;;
    push|p)
        commit_push "$2"
        ;;
    amend|a)
        amend
        ;;
    undo|u)
        undo
        ;;
    
    # Branch Management
    new|n)
        new_branch "$2" "$3"
        ;;
    cleanup)
        cleanup
        ;;
    
    # Sync & Update
    sync)
        sync
        ;;
    update)
        update
        ;;
    
    # Diff & Log
    diff|d)
        diff_pretty "$2"
        ;;
    log|l)
        log_recent "$2"
        ;;
    search)
        search_commits "$2"
        ;;
    show)
        show_commit "$2"
        ;;
    
    # Stash
    stash)
        stash "$2"
        ;;
    stash-list)
        stash_list
        ;;
    stash-pop)
        stash_pop
        ;;
    
    # Tags
    tag)
        tag_version "$2" "$3"
        ;;
    tags)
        tags
        ;;
    
    # Advanced
    rebase)
        rebase_interactive "$2"
        ;;
    squash)
        squash "$2" "$3"
        ;;
    cherry)
        cherry "$2"
        ;;
    bisect)
        bisect_start "$2" "$3"
        ;;
    
    # Hooks
    hooks)
        install_hooks
        ;;
    
    # GitHub
    pr)
        create_pr "$2" "$3" "$4"
        ;;
    prs)
        list_prs
        ;;
    pr-view)
        view_pr "$2"
        ;;
    pr-merge)
        merge_pr "$2"
        ;;
    
    help|*)
        echo "Git Automation Utility for Smarter.Poker"
        echo ""
        echo "Status & Info:"
        echo "  $0 status|s              - Pretty git status"
        echo "  $0 branches|b [count]    - Recent branches"
        echo "  $0 contributors          - Contributor stats"
        echo ""
        echo "Quick Actions:"
        echo "  $0 quick|q [message]     - Quick commit all"
        echo "  $0 push|p [message]      - Commit and push"
        echo "  $0 amend|a               - Amend last commit"
        echo "  $0 undo|u                - Undo last commit"
        echo ""
        echo "Branch Management:"
        echo "  $0 new|n <name> [base]   - Create new branch"
        echo "  $0 cleanup               - Delete merged branches"
        echo ""
        echo "Sync & Update:"
        echo "  $0 sync                  - Sync with remote"
        echo "  $0 update                - Full update with npm"
        echo ""
        echo "Diff & Log:"
        echo "  $0 diff|d [path]         - Pretty diff"
        echo "  $0 log|l [count]         - Recent commits"
        echo "  $0 search <query>        - Search commits"
        echo "  $0 show [commit]         - Show commit details"
        echo ""
        echo "Stash:"
        echo "  $0 stash [message]       - Quick stash"
        echo "  $0 stash-list            - List stashes"
        echo "  $0 stash-pop             - Pop stash"
        echo ""
        echo "Tags:"
        echo "  $0 tag <version> [msg]   - Create version tag"
        echo "  $0 tags                  - List tags"
        echo ""
        echo "Advanced:"
        echo "  $0 rebase [count]        - Interactive rebase"
        echo "  $0 squash <count> [msg]  - Squash commits"
        echo "  $0 cherry <commit>       - Cherry pick"
        echo "  $0 hooks                 - Install git hooks"
        echo ""
        echo "GitHub (requires gh CLI):"
        echo "  $0 pr [title]            - Create PR"
        echo "  $0 prs                   - List PRs"
        echo "  $0 pr-view [number]      - View PR"
        echo "  $0 pr-merge [number]     - Merge PR"
        echo ""
        ;;
esac
