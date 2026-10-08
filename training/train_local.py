"""Train a local MLX candidate. Never changes application configuration or deploys it."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
from datetime import datetime, timezone


def verify_dataset(root):
    manifest = json.loads((root / "manifest.json").read_text())
    groups = set()
    for split in ("train", "valid", "test"):
        details = manifest["splits"][split]
        if hashlib.sha256((root / f"{split}.jsonl").read_bytes()).hexdigest() != details["sha256"]:
            raise ValueError("Dataset changed after manifest creation")
        ids = set(details["hotels"])
        if groups & ids:
            raise ValueError("Hotel leakage between dataset splits")
        groups |= ids
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=".local-ai/corpus")
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="Qwen/Qwen3-0.6B-MLX-4bit")
    parser.add_argument("--revision", default="main")
    parser.add_argument("--iters", type=int, default=80)
    args = parser.parse_args()
    if platform.machine() != "arm64" or platform.system() != "Darwin":
        raise SystemExit("This trainer uses the Apple Silicon GPU. Use the cloud trainer on Linux.")
    if not 1 <= args.iters <= 10000:
        raise ValueError("Iterations must be between 1 and 10000")
    data = Path(args.data).resolve()
    manifest = verify_dataset(data)
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    if shutil.disk_usage(output).free < 1200 * 1024 * 1024:
        raise SystemExit("At least 1.2 GB free disk space is required for this small-model experiment.")
    os.environ.setdefault("HF_HOME", str(Path(".local-ai/huggingface").resolve()))
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    from huggingface_hub import model_info, snapshot_download
    import mlx.core as mx
    if not mx.metal.is_available():
        raise SystemExit("Metal GPU unavailable")
    revision = model_info(args.model, revision=args.revision).sha
    model_path = snapshot_download(args.model, revision=revision, allow_patterns=["*.json", "*.safetensors", "*.model", "*.txt", "README.md", "LICENSE*"])
    command = [str(Path(sys.executable).with_name("mlx_lm.lora")), "--model", model_path, "--train", "--data", str(data), "--adapter-path", str(output / "adapters"), "--iters", str(args.iters), "--num-layers", "4", "--batch-size", "1", "--learning-rate", "0.0001", "--max-seq-length", "768", "--mask-prompt", "--grad-checkpoint", "--steps-per-report", "10", "--steps-per-eval", "40", "--val-batches", "4", "--save-every", "40", "--seed", "42"]
    record = {"baseModel": args.model, "baseRevision": revision, "localBasePath": model_path, "dataManifest": manifest, "engine": "mlx-lm", "status": "training", "productionEligible": False, "startedAt": datetime.now(timezone.utc).isoformat(), "command": command}
    report = output / "run.json"
    report.write_text(json.dumps(record, indent=2))
    try:
        subprocess.run(command, check=True)
        record["status"] = "candidate"
        record["adapterSha256"] = hashlib.sha256((output / "adapters/adapters.safetensors").read_bytes()).hexdigest()
    except BaseException:
        record["status"] = "failed"
        raise
    finally:
        record["finishedAt"] = datetime.now(timezone.utc).isoformat()
        report.write_text(json.dumps(record, indent=2))
    print(json.dumps({"status": "candidate", "run": str(output), "productionEligible": False}), flush=True)


if __name__ == "__main__":
    main()
