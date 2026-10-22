SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose

.PHONY: help install env up down restart logs migrate ensure-bucket seed dev build start lint typecheck clean \
	bootstrap check-env test e2e-install test-e2e validate-adrs verify-fast verify drills verify-all

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-26s\033[0m %s\n", $$1, $$2}'

install: ## Installe les dépendances npm
	npm install

bootstrap: env ## Environnement reproductible : npm ci (lockfile), .env, hooks git versionnés
	npm ci
	@git config core.hooksPath .githooks
	@# `gh pr create` vise par défaut le dépôt amont d'un fork : on fixe le fork.
	@command -v gh >/dev/null && gh repo set-default Erwen-Beauvinon/expense-io-IPv6 || true
	@echo "Bootstrap terminé. Vérifie avec : make check-env puis make verify"

check-env: ## Vérifie que Node correspond à .nvmrc et que les outils sont installés
	@want=$$(cat .nvmrc); have=$$(node -p 'process.versions.node.split(".")[0]'); \
		if [ "$$have" -lt "$$want" ]; then echo "Node $$have < $$want (.nvmrc)" >&2; exit 1; fi; \
		echo "Node $$have (>= $$want requis)"
	@test -x node_modules/.bin/eslint -a -x node_modules/.bin/vitest || { echo "Dépendances absentes : make bootstrap" >&2; exit 1; }
	@echo "Environnement OK"

env: ## Crée .env depuis .env.example si absent, génère AUTH_SECRET si besoin
	@if [ ! -f .env ]; then cp .env.example .env; echo ".env créé depuis .env.example"; fi
	@VALEUR=$$(grep '^AUTH_SECRET=' .env 2>/dev/null | cut -d= -f2-); \
	case "$$VALEUR" in changeme*|"") BESOIN=1;; *) [ $${#VALEUR} -ge 32 ] || BESOIN=1;; esac; \
	if [ -n "$$BESOIN" ]; then \
		if command -v openssl >/dev/null 2>&1; then SECRET=$$(openssl rand -hex 32); \
		else SECRET=$$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"); fi; \
		if [ -z "$$SECRET" ]; then echo "Génération impossible : définis AUTH_SECRET à la main (npx auth secret)" >&2; exit 1; fi; \
		if grep -q '^AUTH_SECRET=' .env 2>/dev/null; then sed -i "s/^AUTH_SECRET=.*/AUTH_SECRET=$$SECRET/" .env; \
		else printf '\nAUTH_SECRET=%s\n' "$$SECRET" >> .env; fi; \
		echo "AUTH_SECRET généré dans .env"; \
	fi

up: env ## Démarre Postgres + LocalStack (Docker) et attend qu'ils soient prêts
	$(COMPOSE) up -d
	@echo "En attente que Postgres et LocalStack soient opérationnels..."
	@for i in $$(seq 1 30); do \
		pg_ok=$$($(COMPOSE) ps postgres 2>/dev/null | grep -c "healthy"); \
		localstack_ok=$$($(COMPOSE) ps localstack 2>/dev/null | grep -c "healthy"); \
		if [ "$$pg_ok" -ge 1 ] && [ "$$localstack_ok" -ge 1 ]; then echo "Postgres + LocalStack prêts."; exit 0; fi; \
		sleep 2; \
	done; \
	echo "Timeout en attendant Postgres/LocalStack — vérifie 'docker compose ps' et 'make logs'." >&2; exit 1

down: ## Arrête Postgres + LocalStack (conserve les données)
	$(COMPOSE) down

restart: down up ## Redémarre Postgres + LocalStack

logs: ## Suit les logs de Postgres + LocalStack
	$(COMPOSE) logs -f

migrate: ## Applique les migrations SQL (idempotent)
	npm run migrate:up

ensure-bucket: ## Crée le bucket S3 "receipts" s'il n'existe pas déjà
	npm run ensure-bucket

seed: ## Peuple une base de démonstration navigable (RH, manager, employé, notes de frais)
	npm run seed

dev: install up migrate ensure-bucket seed ## Tout lancer : install, Docker, migrations, bucket, seed, puis le serveur de dev
	npm run dev

build: ## Build de production
	npm run build

start: build ## Build puis lance le serveur de prod
	npm run start

lint: ## Lint du code
	npm run lint

typecheck: ## Vérifie les types
	npm run typecheck

test: ## Tests unitaires (Vitest, sans Docker)
	npm test

e2e-install: ## Installe le navigateur Chromium de Playwright (une fois)
	npx playwright install chromium

test-e2e: up migrate ensure-bucket ## Tests E2E Playwright (Docker requis ; démarre `next dev` si besoin)
	npm run test:e2e

validate-adrs: ## Vérifie le format des ADR (docs/adr/)
	@node scripts/validate-adrs.mjs

# ── Vérification ─────────────────────────────────────────────────────────────

verify-fast: lint typecheck ## Vérification rapide pendant l'édition (lint + types, frontières incluses)
	@echo "✓ Vérification rapide OK"

verify: lint typecheck test validate-adrs ## Lint, types, tests unitaires, ADR (sans les drills — voir verify-all)
	@echo "✓ Vérification OK"

# ── Drills : prouver que chaque garde rejette une violation plantée ──────────
# Ils tournent dans une copie jetable du dépôt (scripts/drills/workspace.mjs).

drill-boundaries-deny: ## ADR-ARCH-001 : chaque import interdit planté est rejeté par ESLint
	@node scripts/drills/boundaries.mjs deny

drill-boundaries-permit: ## ADR-ARCH-001 : chaque import légal planté est accepté
	@node scripts/drills/boundaries.mjs permit

drill-boundaries-reason: ## ADR-ARCH-001 : une erreur de syntaxe n'est pas prise pour une violation
	@node scripts/drills/boundaries.mjs reason

drill-transition-guard: ## ADR-DOMAIN-001 : retirer la garde approve()/reject() fait échouer les tests
	@node scripts/drills/transition-guard.mjs

drill-fork-guard: ## Le hook pre-push refuse tout push hors du fork Erwen-Beauvinon/expense-io-IPv6
	@bash scripts/drills/fork-guard.sh

DRILLS := $(shell grep -oE '^drill-[a-z-]+:' Makefile | tr -d ':' | sort -u)

drills: ## Lance tous les drills ; échoue si l'un d'eux n'est pas exécuté en CI
	@for d in $(DRILLS); do \
		grep -q "make $$d$$" .github/workflows/ci.yml || { \
			echo "✗ $$d n'est jamais lancé en CI : ajoute-le à .github/workflows/ci.yml" >&2; exit 1; }; \
	done
	@for d in $(DRILLS); do \
		printf '  %-28s' "$$d"; \
		log=$$(mktemp); \
		if $(MAKE) --no-print-directory "$$d" >"$$log" 2>&1; then echo "ok"; rm -f "$$log"; \
		else echo "ÉCHEC"; cat "$$log"; rm -f "$$log"; exit 1; fi; \
	done
	@echo "✓ $(words $(DRILLS)) drills OK"

verify-all: verify drills ## Définition de « terminé » : verify puis tous les drills
	@echo "✓ Vérifié, et chaque garde a rejeté sa violation plantée"

clean: ## Arrête Docker et supprime les volumes — efface les données locales (Postgres/LocalStack)
	$(COMPOSE) down -v
