"""Single-GPU CUDA training entry point for a future Google Cloud job.

Reuses the audited corpus and split. MLX adapters are not silently treated as
PEFT adapters: this creates a new candidate from the specified HF base revision.
"""
import argparse
import json
from pathlib import Path
from train_local import verify_dataset


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--revision", required=True, help="Immutable Hugging Face commit hash")
    args = parser.parse_args()
    if len(args.revision) != 40 or any(char not in "0123456789abcdef" for char in args.revision):
        raise ValueError("Pin a model commit for a reproducible cloud run")
    root = Path(args.data)
    manifest = verify_dataset(root)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=False)
    import torch
    from datasets import Dataset
    from peft import LoraConfig
    from trl import SFTConfig, SFTTrainer
    if not torch.cuda.is_available():
        raise SystemExit("A CUDA GPU is required. Use train_local.py on Apple Silicon.")

    def dataset(split):
        rows = [json.loads(line) for line in (root / f"{split}.jsonl").read_text().splitlines()]
        return Dataset.from_list([{"prompt": row["messages"][:-1], "completion": [row["messages"][-1]]} for row in rows])

    trainer = SFTTrainer(
        model=args.model,
        args=SFTConfig(output_dir=str(output), model_init_kwargs={"revision": args.revision, "trust_remote_code": False, "dtype": "bfloat16" if torch.cuda.is_bf16_supported() else "float16"}, num_train_epochs=2, per_device_train_batch_size=1, per_device_eval_batch_size=1, gradient_accumulation_steps=8, learning_rate=1e-4, max_length=1024, completion_only_loss=True, gradient_checkpointing=True, eval_strategy="epoch", save_strategy="epoch", save_total_limit=2, report_to="none", push_to_hub=False, seed=42, bf16=torch.cuda.is_bf16_supported(), fp16=not torch.cuda.is_bf16_supported()),
        train_dataset=dataset("train"), eval_dataset=dataset("valid"),
        peft_config=LoraConfig(r=8, lora_alpha=20, lora_dropout=0.05, target_modules="all-linear", task_type="CAUSAL_LM"),
    )
    trainer.train()
    trainer.save_model(str(output / "adapter"))
    trainer.processing_class.save_pretrained(str(output / "adapter"))
    (output / "candidate.json").write_text(json.dumps({"baseModel": args.model, "baseRevision": args.revision, "dataManifest": manifest, "productionEligible": False, "validation": trainer.evaluate()}, indent=2))


if __name__ == "__main__":
    main()
