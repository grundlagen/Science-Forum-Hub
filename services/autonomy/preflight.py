"""
Preflight health check — run this FIRST in Colab. It answers the two things that just
went wrong: "did Drive actually mount + persist?" and "is anything going to produce
output?". It prints a loud PASS/WARN/FAIL table and exits non-zero if a *critical* check
fails, so the run never silently does nothing.

    python -u services/autonomy/preflight.py [--runs-dir /content/drive/MyDrive/Research_Integrity_Runs]
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

CRIT = "CRIT"
WARN = "WARN"
OK = "OK"
rows: list[tuple[str, str, str]] = []


def add(name: str, status: str, detail: str) -> None:
    rows.append((name, status, detail))
    print(f"[{status:4}] {name}: {detail}", flush=True)


def check_drive(runs_dir: str | None) -> Path | None:
    """Confirm Drive is mounted AND writable by round-tripping a probe file."""
    mnt = Path("/content/drive/MyDrive")
    if not mnt.exists():
        add("drive", WARN, "/content/drive/MyDrive not found — mount it or output won't persist")
        return None
    target = Path(runs_dir) if runs_dir else mnt / "Research_Integrity_Runs"
    try:
        target.mkdir(parents=True, exist_ok=True)
        probe = target / ".write_probe"
        probe.write_text(f"probe {time.time()}")
        back = probe.read_text()
        probe.unlink()
        if back.startswith("probe"):
            add("drive", OK, f"mounted + writable at {target}")
            return target
    except Exception as e:  # noqa: BLE001
        add("drive", CRIT, f"present but NOT writable: {e}")
        return None
    add("drive", CRIT, "probe round-trip failed")
    return None


def check_gpu() -> None:
    try:
        import torch

        if torch.cuda.is_available():
            add("gpu", OK, f"CUDA: {torch.cuda.get_device_name(0)}")
        else:
            add("gpu", WARN, "no CUDA — DINOv2 will run on CPU (slow); classic backend still works")
    except Exception:
        add("gpu", WARN, "torch not installed — image index will use the classic backend")


def check_deps() -> None:
    import importlib

    for mod, crit in [("cv2", True), ("numpy", True), ("PIL", True), ("imagehash", True),
                      ("faiss", False), ("torch", False)]:
        try:
            importlib.import_module(mod)
            add(f"dep:{mod}", OK, "importable")
        except Exception:
            add(f"dep:{mod}", CRIT if crit else WARN, "missing" + ("" if crit else " (optional)"))


def check_git(root: Path) -> None:
    try:
        rc = subprocess.run(["git", "ls-remote", "--heads", "origin"], cwd=root,
                            capture_output=True, text=True, timeout=60)
        if rc.returncode == 0:
            branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=root,
                                    capture_output=True, text=True).stdout.strip()
            has_token = "@github.com" in subprocess.run(["git", "remote", "get-url", "origin"], cwd=root,
                                                        capture_output=True, text=True).stdout
            auth = "set" if has_token else "MISSING (results cannot push)"
            add("git", OK, f"remote reachable, on {branch}, push-auth={auth}")
        else:
            add("git", CRIT, f"remote unreachable: {rc.stderr.strip()[:120]}")
    except Exception as e:  # noqa: BLE001
        add("git", CRIT, f"git check failed: {e}")


def check_network() -> None:
    import urllib.request

    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=test&format=json&pageSize=1"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            add("network", OK if r.status == 200 else WARN, f"Europe PMC HTTP {r.status}")
    except Exception as e:  # noqa: BLE001
        add("network", CRIT, f"cannot reach Europe PMC (harvest will fail): {e}")


def check_disk() -> None:
    free_gb = shutil.disk_usage("/content" if Path("/content").exists() else ".").free / 1e9
    add("disk", OK if free_gb > 5 else WARN, f"{free_gb:.1f} GB free")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs-dir", default=os.environ.get("RI_RUNS_DIR"))
    ap.add_argument("--require-drive", action="store_true", help="fail if Drive isn't writable")
    args = ap.parse_args()
    root = Path(__file__).resolve().parents[2]

    print("=" * 60, flush=True)
    print("PREFLIGHT — research-integrity autonomous run", flush=True)
    print("=" * 60, flush=True)
    runs = check_drive(args.runs_dir)
    check_gpu()
    check_deps()
    check_git(root)
    check_network()
    check_disk()

    crits = [r for r in rows if r[1] == CRIT]
    if args.require_drive and runs is None:
        crits.append(("drive", CRIT, "required"))
    print("=" * 60, flush=True)
    if crits:
        print(f"PREFLIGHT FAILED — {len(crits)} critical issue(s). Fix these before launching:", flush=True)
        for n, _, d in crits:
            print(f"  - {n}: {d}", flush=True)
        return 1
    print("PREFLIGHT OK — safe to launch the loop.", flush=True)
    if runs:
        print(f"Set RI_RUNS_DIR={runs} so all output persists to Drive.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
