FROM python:3.12-slim-bookworm AS base
WORKDIR /app

FROM base AS build
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /usr/local/bin/uv
ENV UV_PYTHON_DOWNLOADS=0
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project --no-cache

FROM base
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY --from=build /app/.venv /app/.venv
COPY main.py ./
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
