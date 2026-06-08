.PHONY: install dev run build migrate makemigrations test lint format type

install:
	uv sync
	npm install

dev:
	uv run uvicorn config.asgi:application --reload

run: dev

build:
	npm run build

migrate:
	uv run python manage.py migrate

makemigrations:
	uv run python manage.py makemigrations

test:
	uv run pytest

lint:
	uv run ruff check .

format:
	uv run ruff format .

type:
	uv run pyright
