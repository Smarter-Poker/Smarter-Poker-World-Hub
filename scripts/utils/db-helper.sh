#!/bin/bash
# Database & Supabase Helper for Smarter.Poker
# Local database operations, migrations, and Supabase utilities

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
MIGRATIONS_DIR="$PROJECT_ROOT/supabase/migrations"
SEEDS_DIR="$PROJECT_ROOT/supabase/seeds"
BACKUPS_DIR="$PROJECT_ROOT/database-backups"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p "$BACKUPS_DIR"

# ============================================
# Migration Management
# ============================================

# Create new migration file
migration_new() {
    local name="$1"
    
    if [ -z "$name" ]; then
        echo -e "${RED}❌ Migration name required${NC}"
        echo "Usage: $0 new <name>"
        return 1
    fi
    
    local timestamp=$(date +%Y%m%d%H%M%S)
    local filename="${timestamp}_${name}.sql"
    local filepath="$MIGRATIONS_DIR/$filename"
    
    echo -e "${CYAN}📝 Creating migration: $filename${NC}"
    
    cat > "$filepath" << 'EOF'
-- Migration: {{NAME}}
-- Created: {{DATE}}

-- Write your migration SQL here

-- Example:
-- CREATE TABLE IF NOT EXISTS example (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     name TEXT NOT NULL,
--     created_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- Enable RLS
-- ALTER TABLE example ENABLE ROW LEVEL SECURITY;

-- Create policy
-- CREATE POLICY "Users can view their own data" ON example
--     FOR SELECT USING (auth.uid() = user_id);
EOF
    
    # Replace placeholders
    sed -i '' "s/{{NAME}}/$name/g" "$filepath"
    sed -i '' "s/{{DATE}}/$(date)/g" "$filepath"
    
    echo -e "${GREEN}✓ Created: $filepath${NC}"
    
    # Open in editor
    if [ -n "$EDITOR" ]; then
        $EDITOR "$filepath"
    fi
}

# List migrations
migration_list() {
    echo -e "${CYAN}📋 Migrations:${NC}"
    echo ""
    
    for file in "$MIGRATIONS_DIR"/*.sql; do
        if [ -f "$file" ]; then
            local name=$(basename "$file")
            local size=$(du -h "$file" | cut -f1)
            echo "  $name ($size)"
        fi
    done
}

# Show migration content
migration_show() {
    local name="$1"
    
    if [ -z "$name" ]; then
        # Show most recent
        name=$(ls -t "$MIGRATIONS_DIR"/*.sql 2>/dev/null | head -1)
    else
        # Find matching file
        name=$(ls "$MIGRATIONS_DIR"/*"$name"*.sql 2>/dev/null | head -1)
    fi
    
    if [ -f "$name" ]; then
        echo -e "${CYAN}📄 $(basename "$name")${NC}"
        echo ""
        cat "$name"
    else
        echo -e "${RED}❌ Migration not found${NC}"
    fi
}

# ============================================
# Seed Management
# ============================================

# Create new seed file
seed_new() {
    local name="$1"
    
    if [ -z "$name" ]; then
        echo -e "${RED}❌ Seed name required${NC}"
        return 1
    fi
    
    mkdir -p "$SEEDS_DIR"
    
    local filename="${name}.sql"
    local filepath="$SEEDS_DIR/$filename"
    
    cat > "$filepath" << 'EOF'
-- Seed: {{NAME}}
-- Created: {{DATE}}

-- Insert your seed data here
-- Example:
-- INSERT INTO example (name) VALUES
--     ('Value 1'),
--     ('Value 2'),
--     ('Value 3');
EOF
    
    sed -i '' "s/{{NAME}}/$name/g" "$filepath"
    sed -i '' "s/{{DATE}}/$(date)/g" "$filepath"
    
    echo -e "${GREEN}✓ Created: $filepath${NC}"
}

# List seeds
seed_list() {
    echo -e "${CYAN}🌱 Seeds:${NC}"
    echo ""
    
    for file in "$SEEDS_DIR"/*.sql; do
        if [ -f "$file" ]; then
            local name=$(basename "$file")
            echo "  $name"
        fi
    done
}

# ============================================
# Database Operations
# ============================================

# Export table to JSON
db_export_json() {
    local table="$1"
    local output="${2:-$BACKUPS_DIR/${table}_$(date +%Y%m%d_%H%M%S).json}"
    
    if [ -z "$table" ]; then
        echo -e "${RED}❌ Table name required${NC}"
        return 1
    fi
    
    echo -e "${CYAN}📤 Exporting $table to JSON...${NC}"
    
    # Using Supabase CLI if available
    if command -v supabase &> /dev/null; then
        supabase db dump --table "$table" --data-only --file "$output"
    else
        echo -e "${YELLOW}⚠️  Supabase CLI not installed. Using API...${NC}"
        # Would need API key for this
        echo "Please export manually or install Supabase CLI"
    fi
}

# Export table to CSV
db_export_csv() {
    local table="$1"
    local output="${2:-$BACKUPS_DIR/${table}_$(date +%Y%m%d_%H%M%S).csv}"
    
    echo -e "${CYAN}📤 Exporting $table to CSV...${NC}"
    
    if command -v supabase &> /dev/null; then
        supabase db dump --table "$table" --data-only --csv --file "$output"
        echo -e "${GREEN}✓ Exported to $output${NC}"
    else
        echo -e "${YELLOW}⚠️  Supabase CLI required${NC}"
    fi
}

# Full database backup
db_backup() {
    local output="${1:-$BACKUPS_DIR/full_backup_$(date +%Y%m%d_%H%M%S).sql}"
    
    echo -e "${CYAN}💾 Creating full database backup...${NC}"
    
    if command -v supabase &> /dev/null; then
        supabase db dump --file "$output"
        echo -e "${GREEN}✓ Backup saved to $output${NC}"
        
        # Compress
        gzip "$output"
        echo -e "${GREEN}✓ Compressed to ${output}.gz${NC}"
    else
        echo -e "${YELLOW}⚠️  Supabase CLI required${NC}"
    fi
}

# List backups
db_backup_list() {
    echo -e "${CYAN}💾 Database backups:${NC}"
    echo ""
    
    ls -lh "$BACKUPS_DIR" 2>/dev/null || echo "No backups found"
}

# ============================================
# Schema Inspection
# ============================================

# Generate TypeScript types from schema
generate_types() {
    local output="${1:-$PROJECT_ROOT/src/types/database.types.ts}"
    
    echo -e "${CYAN}🔧 Generating TypeScript types...${NC}"
    
    if command -v supabase &> /dev/null; then
        supabase gen types typescript --local > "$output"
        echo -e "${GREEN}✓ Types generated: $output${NC}"
    else
        echo -e "${YELLOW}⚠️  Supabase CLI required${NC}"
    fi
}

# Show table schema
show_schema() {
    local table="$1"
    
    echo -e "${CYAN}📊 Schema for $table:${NC}"
    
    if command -v supabase &> /dev/null; then
        supabase db dump --schema-only --table "$table" 2>/dev/null || echo "Table not found"
    else
        echo -e "${YELLOW}⚠️  Supabase CLI required${NC}"
    fi
}

# List all tables
list_tables() {
    echo -e "${CYAN}📋 Database tables:${NC}"
    
    if command -v supabase &> /dev/null; then
        supabase db dump --schema-only 2>/dev/null | grep -E "^CREATE TABLE" | awk '{print "  " $3}'
    else
        echo -e "${YELLOW}⚠️  Supabase CLI required${NC}"
    fi
}

# ============================================
# Quick Queries
# ============================================

# Execute SQL query
query() {
    local sql="$1"
    
    if [ -z "$sql" ]; then
        echo -e "${RED}❌ SQL query required${NC}"
        return 1
    fi
    
    echo -e "${CYAN}🔍 Executing query...${NC}"
    
    if command -v supabase &> /dev/null; then
        echo "$sql" | supabase db push --dry-run 2>/dev/null
    else
        echo -e "${YELLOW}⚠️  Supabase CLI required${NC}"
    fi
}

# Count rows in table
count_rows() {
    local table="$1"
    
    echo -e "${CYAN}📊 Row counts:${NC}"
    
    # This would need Supabase API access
    echo "Use Supabase dashboard for row counts"
}

# ============================================
# Development Helpers
# ============================================

# Reset local database
db_reset() {
    echo -e "${YELLOW}⚠️  This will reset the local database${NC}"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if command -v supabase &> /dev/null; then
            supabase db reset
            echo -e "${GREEN}✓ Database reset${NC}"
        else
            echo -e "${YELLOW}⚠️  Supabase CLI required${NC}"
        fi
    fi
}

# Start local Supabase
start_local() {
    echo -e "${CYAN}🚀 Starting local Supabase...${NC}"
    
    if command -v supabase &> /dev/null; then
        supabase start
    else
        echo -e "${YELLOW}⚠️  Supabase CLI required. Install with:${NC}"
        echo "  brew install supabase/tap/supabase"
    fi
}

# Stop local Supabase
stop_local() {
    echo -e "${CYAN}🛑 Stopping local Supabase...${NC}"
    
    if command -v supabase &> /dev/null; then
        supabase stop
    fi
}

# ============================================
# Main Command Handler
# ============================================

case "${1:-help}" in
    # Migrations
    new|create)
        migration_new "$2"
        ;;
    list|ls)
        migration_list
        ;;
    show)
        migration_show "$2"
        ;;
    
    # Seeds
    seed)
        seed_new "$2"
        ;;
    seeds)
        seed_list
        ;;
    
    # Export
    export-json)
        db_export_json "$2" "$3"
        ;;
    export-csv)
        db_export_csv "$2" "$3"
        ;;
    backup)
        db_backup "$2"
        ;;
    backups)
        db_backup_list
        ;;
    
    # Schema
    types)
        generate_types "$2"
        ;;
    schema)
        show_schema "$2"
        ;;
    tables)
        list_tables
        ;;
    
    # Queries
    query|q)
        query "$2"
        ;;
    count)
        count_rows "$2"
        ;;
    
    # Development
    reset)
        db_reset
        ;;
    start)
        start_local
        ;;
    stop)
        stop_local
        ;;
    
    help|*)
        echo "Database & Supabase Helper for Smarter.Poker"
        echo ""
        echo "Migrations:"
        echo "  $0 new|create <name>       - Create migration"
        echo "  $0 list|ls                 - List migrations"
        echo "  $0 show [name]             - Show migration content"
        echo ""
        echo "Seeds:"
        echo "  $0 seed <name>             - Create seed file"
        echo "  $0 seeds                   - List seeds"
        echo ""
        echo "Export:"
        echo "  $0 export-json <table>     - Export to JSON"
        echo "  $0 export-csv <table>      - Export to CSV"
        echo "  $0 backup                  - Full database backup"
        echo "  $0 backups                 - List backups"
        echo ""
        echo "Schema:"
        echo "  $0 types [output]          - Generate TypeScript types"
        echo "  $0 schema <table>          - Show table schema"
        echo "  $0 tables                  - List all tables"
        echo ""
        echo "Development:"
        echo "  $0 reset                   - Reset local database"
        echo "  $0 start                   - Start local Supabase"
        echo "  $0 stop                    - Stop local Supabase"
        echo ""
        ;;
esac
