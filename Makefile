# Smarter.Poker Development Makefile
# Run 'make help' for available commands

.PHONY: help dev build start test lint format clean install deploy

# Colors
GREEN := $(shell tput setaf 2)
YELLOW := $(shell tput setaf 3)
CYAN := $(shell tput setaf 6)
RESET := $(shell tput sgr0)

# Default target
.DEFAULT_GOAL := help

## Help
help: ## Show this help message
	@echo '$(CYAN)Smarter.Poker Development Commands$(RESET)'
	@echo ''
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## Development
dev: ## Start development server
	npm run dev

start: ## Start production server
	npm run start

build: ## Build for production
	npm run build

## Testing & Quality
test: ## Run tests
	npm test

lint: ## Run linter
	npm run lint

format: ## Format code with Prettier
	npx prettier --write .

type-check: ## Run TypeScript type checking
	npm run type-check

## Dependencies
install: ## Install dependencies
	npm ci

update-deps: ## Update dependencies
	npm update
	npm audit fix

outdated: ## Check for outdated dependencies
	npm outdated

## Database
db-migrate: ## Run database migrations
	npx supabase db push

db-reset: ## Reset database
	npx supabase db reset

db-types: ## Generate TypeScript types from database
	npx supabase gen types typescript --local > src/types/database.types.ts

## Deployment
deploy: build ## Deploy to production
	npx vercel --prod

deploy-preview: build ## Deploy preview
	npx vercel

## Cleanup
clean: ## Clean build artifacts
	rm -rf .next
	rm -rf node_modules/.cache
	rm -rf coverage

clean-all: clean ## Clean everything including node_modules
	rm -rf node_modules

## Docker
docker-build: ## Build Docker image
	docker build -t smarter-poker .

docker-run: ## Run Docker container
	docker run -p 3000:3000 smarter-poker

docker-compose-up: ## Start with docker-compose
	docker-compose up -d

docker-compose-down: ## Stop docker-compose
	docker-compose down

## Analysis
analyze: ## Analyze bundle size
	ANALYZE=true npm run build

benchmark: ## Run performance benchmarks
	./scripts/utils/benchmark.sh full

## Utilities
poker-status: ## Show development status
	./scripts/utils/poker.sh status

poker-startup: ## Start development environment
	./scripts/utils/poker.sh startup

poker-shutdown: ## Stop development environment
	./scripts/utils/poker.sh shutdown

## Quick commands
q: dev ## Quick: start dev server
p: deploy ## Quick: deploy to production
t: test ## Quick: run tests
l: lint ## Quick: run linter
