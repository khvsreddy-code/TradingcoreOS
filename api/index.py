"""Vercel Python entrypoint for the persistent TradingCore FastAPI backend."""
from backend.server import app

# Vercel discovers the ASGI application exported as `app`.
