"""Generate avatar and cover art with Z-Image-Turbo (GGUF) on an 8 GB GPU.

The text encoder runs on the CPU first, then is freed before the 4-bit image model
is loaded on the GPU, so both never have to fit in VRAM at the same time.

Usage:  Z:\\venvs\\zimage\\Scripts\\python.exe tools\\generate_assets.py [--only id,id] [--seed N]
"""
import argparse
import gc
import json
import time
from pathlib import Path

import torch
from diffusers import GGUFQuantizationConfig, ZImagePipeline, ZImageTransformer2DModel

HUB = Path(r"Z:\huggingface\hub")
SNAPSHOT = next((HUB / "models--Tongyi-MAI--Z-Image-Turbo" / "snapshots").iterdir())
GGUF = next((HUB / "models--unsloth--Z-Image-Turbo-GGUF" / "snapshots").rglob("*Q4_K_M.gguf"))
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets"
WEB_SIZE = {"avatars": (384, 384), "covers": (800, 500)}


def jobs(spec, only):
    for kind in ("avatars", "covers"):
        group = spec[kind]
        for item in group["items"]:
            if only and item["id"] not in only:
                continue
            prompt = group["template"].format(**item) + ", " + spec["style"]
            yield kind, item["id"], prompt, group["size"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="")
    parser.add_argument("--seed", type=int, default=7)
    # fp16 overflows to a black image with this model; bf16 is slower on older GPUs but works.
    parser.add_argument("--dtype", choices=["fp16", "bf16"], default="bf16")
    parser.add_argument("--steps", type=int, default=9)
    args = parser.parse_args()
    dtype = torch.float16 if args.dtype == "fp16" else torch.bfloat16
    only = {x for x in args.only.split(",") if x}

    spec = json.loads((ROOT / "tools" / "assets.json").read_text(encoding="utf-8"))
    todo = list(jobs(spec, only))
    print(f"{len(todo)} images to generate", flush=True)

    # 1. Encode every prompt on the CPU.
    t0 = time.time()
    encoder = ZImagePipeline.from_pretrained(SNAPSHOT, transformer=None, vae=None, torch_dtype=torch.bfloat16)
    with torch.no_grad():
        embeds = [encoder.encode_prompt(p, device="cpu", do_classifier_free_guidance=False, max_sequence_length=256)[0][0] for _, _, p, _ in todo]
    del encoder
    gc.collect()
    print(f"encoded prompts in {time.time() - t0:.0f}s", flush=True)

    # 2. Load the 4-bit transformer and VAE on the GPU.
    transformer = ZImageTransformer2DModel.from_single_file(
        str(GGUF),
        quantization_config=GGUFQuantizationConfig(compute_dtype=dtype),
        config=str(SNAPSHOT),
        subfolder="transformer",
        torch_dtype=dtype,
    )
    pipe = ZImagePipeline.from_pretrained(SNAPSHOT, transformer=transformer, text_encoder=None, tokenizer=None, torch_dtype=dtype)
    pipe.to("cuda")
    if args.dtype == "fp16":
        pipe.vae.to(torch.float32)  # the VAE overflows in fp16

    # 3. Generate.
    for (kind, name, _, (w, h)), emb in zip(todo, embeds):
        t1 = time.time()
        image = pipe(
            prompt_embeds=[emb.to("cuda", dtype)],
            width=w,
            height=h,
            num_inference_steps=args.steps,
            guidance_scale=0.0,
            generator=torch.Generator("cuda").manual_seed(args.seed),
        ).images[0]
        folder = OUT / kind
        folder.mkdir(parents=True, exist_ok=True)
        image.save(folder / f"{name}-full.png")
        image.resize(WEB_SIZE[kind], resample=3).save(folder / f"{name}.webp", quality=88)
        print(f"{kind}/{name} done in {time.time() - t1:.0f}s", flush=True)


if __name__ == "__main__":
    main()
