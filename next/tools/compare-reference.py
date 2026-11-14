"""Compare six frame pairs produced by ReferenceParityTest (NumPy/Pillow required)."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path)
folder = parser.parse_args().directory
results = []
for reference in sorted(folder.glob("*-reference.png")):
    native = reference.with_name(reference.name.replace("-reference", "-native"))
    expected = np.asarray(Image.open(reference).convert("RGB"), dtype=np.int16)
    actual = np.asarray(Image.open(native).convert("RGB"), dtype=np.int16)
    assert expected.shape == actual.shape, f"Frame dimensions differ: {reference.name}"
    delta = np.abs(expected - actual)
    results.append({
        "frame": reference.stem,
        "mean_channel_error": float(delta.mean()),
        "pixels_within_16": float((delta.max(axis=2) <= 16).mean()),
        "max_error": int(delta.max()),
    })

report = json.dumps(results, indent=2) + "\n"
print(report, end="")
(folder / "metrics.json").write_text(report, encoding="utf-8")
assert len(results) == 6, "Expected six reference/native frame pairs"
assert all(
    row["mean_channel_error"] < 3 and row["pixels_within_16"] > .97
    for row in results
), "Renderer deviates from editor 0.80; inspect the frames"
