#!/usr/bin/env python3
"""Run the 30-instruction live-model trial using NVIDIA via the secure connector.

This is M4 Step 0: live-model verification. Uses meta/llama-3.2-90b-vision-instruct
via the custom.nvidia connector.
"""
import json
import subprocess
import sys
import time

# 30 instructions covering the agent's capabilities
INSTRUCTIONS = [
    "make it playful",
    "make the headlines more energetic",
    "friendlier tone",
    "change the headline to 'Welcome Back'",
    "make the CTA say 'Get Started Now'",
    "more professional tone",
    "add excitement to the subheadline",
    "make it sound luxurious",
    "simplify the headline",
    "make the CTA more urgent",
    "warmer tone",
    "bolder headlines",
    "more casual language",
    "make it sound trustworthy",
    "shorter headline",
    "more vibrant copy",
    "make the CTA friendlier",
    "sophisticated tone",
    "playful subheadline",
    "energetic CTA",
    "make headlines punchier",
    "inviting tone",
    "modern voice",
    "make it fun",
    "confident tone",
    "headline in all caps style",
    "make CTA action-oriented",
    "elegant tone",
    "bold and bright copy",
    "make it memorable",
]

SYSTEM_PROMPT = """You are a JSON-only planner for a mobile app config editor.
Output ONLY valid JSON, no other text, no markdown, no explanations.

Available editable paths: config.headline, config.subheadline, config.ctaText

Output format:
{"ops": [{"path": "config.headline", "value": "new text"}], "rationale": "brief reason"}

Rules:
- Only use the listed paths
- Keep values concise (under 60 chars)
- Output ONLY the JSON object"""


def call_nvidia(instruction: str, max_retries: int = 3) -> dict:
    """Call NVIDIA API via the skill CLI with retries."""
    payload = {
        "model": "meta/llama-3.2-90b-vision-instruct",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Instruction: {instruction}"},
        ],
        "max_tokens": 300,
        "temperature": 0.1,
    }
    for attempt in range(max_retries):
        try:
            result = subprocess.run(
                ["python3", "/home/hatch/workspace/skills/nvidia/bin/chat.py"],
                input=json.dumps(payload),
                capture_output=True,
                text=True,
                timeout=90,
            )
            if result.returncode != 0:
                if attempt < max_retries - 1:
                    time.sleep(2)
                    continue
                return {"error": result.stderr.strip()[:200]}
            try:
                data = json.loads(result.stdout)
                content = data["choices"][0]["message"]["content"]
                usage = data.get("usage", {})
                return {
                    "content": content,
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                }
            except Exception as e:
                return {"error": f"parse failed: {e}"}
        except subprocess.TimeoutExpired:
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            return {"error": "timeout after 3 attempts"}
    return {"error": "max retries exceeded"}


def main():
    print(f"Starting 30-instruction live-model trial")
    print(f"Model: meta/llama-3.2-90b-vision-instruct via NVIDIA")
    print("=" * 60)

    successes = 0
    failures = 0
    total_in = 0
    total_out = 0
    results = []

    for i, instruction in enumerate(INSTRUCTIONS, 1):
        print(f"\n[{i}/30] {instruction}")
        start = time.time()
        result = call_nvidia(instruction)
        elapsed = time.time() - start

        if "error" in result:
            print(f"  FAILED: {result['error']}")
            failures += 1
            results.append({"instruction": instruction, "ok": False, "error": result["error"]})
        else:
            content = result["content"]
            total_in += result["prompt_tokens"]
            total_out += result["completion_tokens"]
            # Try to parse as JSON
            try:
                # Extract JSON from response (might have extra text)
                json_start = content.find("{")
                json_end = content.rfind("}") + 1
                if json_start >= 0 and json_end > json_start:
                    parsed = json.loads(content[json_start:json_end])
                    ops = parsed.get("ops", [])
                    print(f"  OK: {len(ops)} ops ({elapsed:.1f}s, {result['prompt_tokens']}+{result['completion_tokens']} tokens)")
                    successes += 1
                    results.append({"instruction": instruction, "ok": True, "ops": len(ops)})
                else:
                    print(f"  FAILED: no JSON found")
                    failures += 1
                    results.append({"instruction": instruction, "ok": False, "error": "no JSON"})
            except json.JSONDecodeError as e:
                print(f"  FAILED: invalid JSON: {e}")
                failures += 1
                results.append({"instruction": instruction, "ok": False, "error": "invalid JSON"})

    print("\n" + "=" * 60)
    print(f"Results: {successes}/30 succeeded, {failures}/30 failed")
    print(f"Tokens: {total_in} in, {total_out} out")
    print(f"Success rate: {successes/30*100:.1f}%")

    # Save results
    with open("/tmp/nvidia-trial-results.json", "w") as f:
        json.dump({
            "model": "meta/llama-3.2-90b-vision-instruct",
            "provider": "nvidia",
            "total": 30,
            "successes": successes,
            "failures": failures,
            "tokens_in": total_in,
            "tokens_out": total_out,
            "results": results,
        }, f, indent=2)
    print("\nResults saved to /tmp/nvidia-trial-results.json")


if __name__ == "__main__":
    main()
