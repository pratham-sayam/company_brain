import argparse
import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Orvyn Python Backend")
    parser.add_argument("--port", type=int, default=None, help="Port to listen on")
    parser.add_argument("--host", type=str, default=None, help="Host to bind to")
    args = parser.parse_args()

    # CLI args take priority → env vars → defaults
    host = args.host or os.getenv("PYTHON_HOST", "127.0.0.1")
    port = args.port or int(os.getenv("PYTHON_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, reload=False)
