FROM python:3.14-slim AS build

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./
RUN python -m pip install --requirement requirements.txt

FROM python:3.14-slim

ENV DJANGO_DEBUG=false \
    DOCS_ENABLED=false \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8000 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY --chown=10001:10001 . .

USER 10001
EXPOSE 8000

CMD ["gunicorn", "purchases_service.wsgi:application", "--config", "gunicorn.conf.py"]
