"""Explicit local preview of one candidate, bound to loopback only."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--run", required=True)
parser.add_argument("--port", type=int, default=8088)
args = parser.parse_args()
run = Path(args.run).resolve()
manifest = json.loads((run / "run.json").read_text())
if manifest["status"] != "candidate" or not 1024 <= args.port <= 65535:
    raise SystemExit("Select a completed candidate and an unprivileged port.")
print("LOCAL CANDIDATE PREVIEW: not production-approved. No public network binding.", flush=True)
subprocess.run([str(Path(sys.executable).with_name("mlx_lm.server")), "--model", manifest["localBasePath"], "--adapter-path", str(run / "adapters"), "--host", "127.0.0.1", "--port", str(args.port)], check=True)
