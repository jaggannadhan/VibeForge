.PHONY: setup dev run-fe run-be build typecheck lint clean

BOLD   := \033[1m
GREEN  := \033[32m
CYAN   := \033[36m
RESET  := \033[0m

define progress
	@printf "\n$(BOLD)$(CYAN)[%3d%%]$(RESET) $(BOLD)%s$(RESET)\n" $(1) $(2)
	@printf "$(CYAN)%0.s─$(RESET)" $$(seq 1 $(1)); printf "%0.s " $$(seq $(1) 100); printf "\n"
endef

# ── Setup (one command) ───────────────────────────────

setup:
	$(call progress,0,"Starting Vibe Studio setup...")
	$(call progress,5,"Checking prerequisites...")
	@command -v node >/dev/null 2>&1 || { echo "\033[31mNode.js is required but not installed.\033[0m"; exit 1; }
	@command -v pnpm >/dev/null 2>&1 || { echo "\033[31mpnpm is required. Run: npm install -g pnpm\033[0m"; exit 1; }
	@echo "  node $$(node -v) | pnpm $$(pnpm -v)"
	$(call progress,10,"Installing dependencies...")
	@pnpm install
	$(call progress,50,"Creating environment file...")
	@if [ ! -f apps/api/.env ]; then \
		echo "ANTHROPIC_API_KEY=" > apps/api/.env; \
		echo "  Created apps/api/.env"; \
	else \
		echo "  apps/api/.env already exists, skipping"; \
	fi
	$(call progress,60,"Installing Playwright (Chromium)...")
	@pnpm -C apps/api exec playwright install chromium
	$(call progress,90,"Verifying installation...")
	@pnpm typecheck
	$(call progress,100,"Setup complete!")
	@printf "\n$(BOLD)$(GREEN)  Vibe Studio is ready.$(RESET)\n"
	@printf "  1. Add your API key:  $(BOLD)apps/api/.env$(RESET)\n"
	@printf "  2. Start dev server:  $(BOLD)make dev$(RESET)\n\n"

# ── Dev ────────────────────────────────────────────────

dev:
	pnpm dev

run-fe:
	pnpm -C apps/web dev

run-be:
	pnpm -C apps/api dev

# ── Build & Quality ───────────────────────────────────

build:
	pnpm build

typecheck:
	pnpm typecheck

lint:
	pnpm lint

clean:
	pnpm clean
