"""Compare a candidate with its base on held-out facts and reversed ranking order.

These narrow automated checks are not production approval or customer-quality
evidence. Outputs and test cases are retained for human review.
"""
import argparse
import gc
import json
from pathlib import Path
import re
import time
from collections import defaultdict
from train_local import verify_dataset


def cases_from(path, per_task):
    groups = defaultdict(list)
    for line in path.read_text().splitlines():
        row = json.loads(line)
        groups[row["provenance"]["task"]].append(row)
    cases = [row for rows in groups.values() for row in rows[:per_task]]
    for row in groups["ranking"][:per_task]:
        reversed_row = json.loads(json.dumps(row))
        query = json.loads(reversed_row["messages"][1]["content"])
        query["candidates"].reverse()
        reversed_row["messages"][1]["content"] = json.dumps(query)
        reversed_row["provenance"]["task"] = "ranking_reversed"
        cases.append(reversed_row)
    return cases


def check(row, text):
    try:
        value = json.loads(text)
    except (ValueError, TypeError):
        return {"json": False, "task": False}
    task = row["provenance"]["task"]
    expected = json.loads(row["messages"][-1]["content"])
    if task.startswith("ranking"):
        return {"json": isinstance(value, dict) and isinstance(value.get("ids"), list), "task": value == expected}
    schema = isinstance(value, dict) and set(value) == {"message", "followUpQuestions", "handover", "handoverReason"} and isinstance(value["message"], str) and isinstance(value["followUpQuestions"], list) and len(value["followUpQuestions"]) <= 3 and all(isinstance(question, str) for question in value["followUpQuestions"]) and isinstance(value["handover"], bool) and isinstance(value["handoverReason"], str)
    if not schema:
        return {"json": False, "task": False}
    message = value["message"].lower()
    evidence = json.loads(row["messages"][1]["content"].split("CATALOGUE EVIDENCE:\n", 1)[1])[0]
    supported = evidence["title"].lower() in message
    if task == "facts":
        supported &= str(evidence["stars"]) in message and evidence["city"].lower() in message
    elif task == "facility":
        supported &= evidence["facilities"][0].lower() in message
    elif task == "price":
        supported &= bool(re.search(r"no current|no live|do not have|don't have|does not|cannot|can't|live (search|check)|needs? .*search", message)) and not bool(re.search(r"(?:₹|\binr\b|\busd\b|\$)\s*\d|guaranteed available", message))
    elif task == "unknown":
        supported &= bool(re.search(r"not confirm|does not|don't|cannot|can't|not listed|no information|not.*guarantee", message))
    elif task == "handoff":
        # Explicit denials must not be counted as booking claims.
        claims = re.sub(r"\bno (?:room|hotel|stay) is (?:booked|reserved)\b", "", message)
        supported &= value["handover"] and not bool(re.search(r"(?:is|has been) (?:booked|reserved)|charged your card", claims))
    return {"json": bool(schema), "task": bool(supported)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    parser.add_argument("--per-task", type=int, default=3)
    parser.add_argument("--rescore", action="store_true")
    args = parser.parse_args()
    root = Path(args.run)
    run = json.loads((root / "run.json").read_text())
    command = run["command"]
    data = Path(command[command.index("--data") + 1])
    verify_dataset(data)
    if json.loads((data / "manifest.json").read_text()) != run["dataManifest"]:
        raise ValueError("Evaluate with the immutable dataset used for this run")
    cases = cases_from(data / "test.jsonl", args.per_task)
    if args.rescore:
        path = root / "evaluation.json"
        report = json.loads(path.read_text())
        lookup = {(case["provenance"]["task"], case["provenance"]["group"]): case for case in cases}
        (root / "evaluation.previous.json").write_text(path.read_text())
        for result in report["results"].values():
            for row in result["rows"]:
                row["checks"] = check(lookup[(row["task"], row["group"])], row["output"])
            result["jsonPass"] = sum(row["checks"]["json"] for row in result["rows"])
            result["taskPass"] = sum(row["checks"]["task"] for row in result["rows"])
        report["rubricVersion"] = "grounding-v2-negation-aware"
        path.write_text(json.dumps(report, indent=2))
        print(json.dumps({label: {key: value for key, value in result.items() if key != "rows"} for label, result in report["results"].items()}))
        return
    from mlx_lm import load, generate
    from mlx_lm.sample_utils import make_sampler
    import mlx.core as mx
    report = {"rubricVersion": "grounding-v2-negation-aware", "baseModel": run["baseModel"], "baseRevision": run["baseRevision"], "adapterSha256": run["adapterSha256"], "testCases": len(cases), "productionEligible": False, "limitations": ["Catalogue-generated templates; no customer outcomes", "Single-city sample", "Lexical checks cannot detect every unsupported claim", "Human quality review and broader adversarial evaluation still required"], "results": {}}
    for label, adapter in (("base", None), ("candidate", str(root / "adapters"))):
        model, tokenizer = load(run["localBasePath"], adapter_path=adapter)
        rows = []
        for index, case in enumerate(cases):
            prompt = tokenizer.apply_chat_template(case["messages"][:-1], tokenize=False, add_generation_prompt=True, enable_thinking=False)
            started = time.monotonic()
            output = generate(model, tokenizer, prompt=prompt, max_tokens=320, sampler=make_sampler(temp=0), verbose=False)
            rows.append({"task": case["provenance"]["task"], "group": case["provenance"]["group"], "checks": check(case, output), "seconds": round(time.monotonic() - started, 3), "output": output})
            print(json.dumps({"model": label, "case": index + 1, "total": len(cases), "checks": rows[-1]["checks"]}), flush=True)
        report["results"][label] = {"jsonPass": sum(row["checks"]["json"] for row in rows), "taskPass": sum(row["checks"]["task"] for row in rows), "rows": rows}
        del model, tokenizer
        gc.collect()
        mx.clear_cache()
        (root / "evaluation.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({label: {key: value for key, value in result.items() if key != "rows"} for label, result in report["results"].items()}), flush=True)


if __name__ == "__main__":
    main()
