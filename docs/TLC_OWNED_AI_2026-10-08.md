# TLC-owned AI: local training and deployment status

## What is implemented

TLC can run its own adapted open-weight language model through a server-side OpenAI-compatible inference endpoint. The website planner, catalogue ranking, live hotel shortlist ranking, and channel conversation worker use the shared model client. OpenAI is used only if `TLC_AI_PROVIDER=openai` is explicitly configured. Missing or invalid model responses fall back to catalogue/rule-based planning or intake. Hotel ranking accepts only a complete permutation of supplied candidate IDs; supplier prices and availability remain live TBO data.

This is fine-tuning an existing neural network, not training a foundation model from scratch. The existing TensorFlow.js marketing model is a separate recommendation system using customer outcomes. There are currently no approved historical customer conversations or booking outcomes for the new conversational model.

## Actual laptop experiment

- Apple M2, 10 GPU cores, 8 GB unified memory; MLX Metal training completed.
- Official base: `Qwen/Qwen3-0.6B-MLX-4bit`, pinned revision `173234aa840d113125e9f2271100ddbaf16c9620`.
- Read-only TBO static export: 59 usable Dubai hotels, excluding customer data, prices, credentials and booking identifiers.
- 354 factual template examples: 222 train, 66 validation, 66 test. Hotels are disjoint across splits; ranking pairs stay within a split and alternate candidate positions.
- Candidate `tbo-grounding-002`: 120 iterations, quantized LoRA, four layers, rank 8, batch 1, 768-token limit, learning rate 0.0001.
- Local artifacts live under ignored `.local-ai/`, including immutable data manifests, model revision, adapters, training report and evaluation output. They are not committed or uploaded.

The 21-case held-out template evaluation measured base JSON/task success at 2/21, versus adapted JSON success 21/21 and task success 19/21. The two remaining template failures shortened hotel names. A rubric correction recognizes negative statements such as “No room is reserved”; the preceding report is retained alongside the corrected one.

**The candidate is not approved for production.** The separate application-prompt integration test still fails: a new hotel name is shortened and the ranking prompt does not produce an accepted permutation. Template accuracy and low validation loss do not establish conversational quality, generalization or good personalization. The candidate is inactive; it must not be advertised as the website's production brain.

## Reproduce locally

```sh
python3 -m venv .local-ai/venv
.local-ai/venv/bin/pip install -r training/requirements-mlx.lock.txt
node --env-file=.env scripts/export-tbo-training.mjs --city 115936 --limit 60
.local-ai/venv/bin/python training/build_corpus.py --source .local-ai/source/tbo-hotels.jsonl --output .local-ai/corpus-next
.local-ai/venv/bin/python training/train_local.py --data .local-ai/corpus-next --output .local-ai/runs/next-candidate --revision 173234aa840d113125e9f2271100ddbaf16c9620 --iters 120
.local-ai/venv/bin/python training/evaluate_local.py --run .local-ai/runs/next-candidate
.local-ai/venv/bin/python training/serve_local.py --run .local-ai/runs/next-candidate
```

The development server is loopback-only on port 8088. For MLX, set `TLC_AI_BASE_URL=http://127.0.0.1:8088/v1`, `TLC_AI_MODEL=default_model`, and `TLC_AI_STRUCTURED_OUTPUT=off` in the evaluation process. `default_model` is essential: naming the base model path can load it without the adapter. Do not change production environment settings to evaluate a candidate.

Run the opt-in application test with `TLC_AI_LIVE_TEST=1`; it intentionally fails a candidate that does not satisfy the real prompt contract. Normal CI skips GPU-dependent live inference. `python -m unittest discover -s training -p 'test_*.py'` checks corpus integrity and evaluator expectations.

## Before activation and Google Cloud migration

Expand destination coverage and train on the exact production schemas and prompt formats, with independently reviewed examples and adversarial tests. Test unseen hotel names, multi-turn corrections, budget and dates, missing amenities, provider outages, refusals, human handover, multilingual requests, and ranking quality against a rule baseline. Collect approved feedback prospectively; no customer history is opted into model training by default.

`training/train_cloud.py` and `requirements-cloud.txt` provide a CUDA/TRL/PEFT recipe using the audited corpus and an immutable base-model revision. This recipe has not been executed on Google Cloud. It trains a new cloud candidate; MLX adapters are not automatically portable to PEFT. Hosting, conversion, latency, cost, model licensing and supplier-data permissions need verification for the chosen production model and TBO agreement.

Sources: [MLX LoRA](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md), [official Qwen model](https://huggingface.co/Qwen/Qwen3-0.6B-MLX-4bit), [TRL SFT](https://huggingface.co/docs/trl/v0.29.0/en/sft_trainer), [vLLM structured output](https://docs.vllm.ai/en/v0.19.0/features/structured_outputs/).
