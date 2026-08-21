# Common commands for Vibe. Install just: https://github.com/casey/just
# Run `just` to list available recipes.

default:
    @just --list

# Download Sona runner binaries and platform deps
setup:
    uv run scripts/pre_build.py

# Install frontend dependencies
install:
    cd desktop && pnpm install

# Run the app in dev mode (runs pre-build first)
dev: setup
    cd desktop && pnpm exec tauri dev

# Run only the desktop frontend in the browser (mock Tauri, no Rust build)
dev-web:
    cd desktop && pnpm dev

# Build the app for production (runs pre-build first)
build: setup
    cd desktop && pnpm exec tauri build

# Run the website (landing page) in dev mode
website:
    cd website && pnpm install && pnpm dev

# Run frontend tests
test:
    cd desktop && pnpm test

# Lint frontend and Rust
lint:
    cd desktop && pnpm lint
    cargo fmt --check
    cargo clippy

# Format everything
format:
    pnpm format
    cargo fmt

# Regenerate i18n files
i18n:
    cd desktop && pnpm i18n:generate

# Check translations
check-i18n:
    uv run scripts/check_i18n.py

# Type-check desktop and website
check-types:
    pnpm check-types
