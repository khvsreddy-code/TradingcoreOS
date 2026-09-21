"""Backward-compatible entrypoint. Use app.train_all for the full 39-model pipeline."""
from app.train_all import main
if __name__ == '__main__': main()
