#!/usr/bin/env python3
"""Minimal worker — download figures, scan with pHash+ORB, loop forever."""
import requests, json, time, cv2, numpy as np, hashlib
from pathlib import Path
from datetime import datetime
from itertools import combinations
import imagehash
from PIL import Image as PILImage

WORK = Path("/root/scrape")
WORK.mkdir(exist_ok=True)
LOG = WORK / "log.txt"

def log(msg):
    s = f"[{datetime.now().isoformat()}] {msg}"
    print(s, flush=True)
    with open(LOG, "a") as f: f.write(s + "\n")

PAPERS = [
    ("10.1371/journal.pone.0002020", "Firestein/Hahn PLoS 2008"),
    ("10.1182/blood-2008-10-186668", "Anderson Blood 2009"),
]

for round_num in range(1, 9999):
    log(f"=== ROUND {round_num} ===")
    for doi, label in PAPERS:
        log(f"Download: {label}")
        d = WORK / hashlib.md5(doi.encode()).hexdigest()[:12]
        d.mkdir(parents=True, exist_ok=True)

        # Download figures
        figs = []
        for i in range(1, 10):
            url = f"https://journals.plos.org/plosone/article/figure/image?id={doi}.g{i:03d}&size=large"
            try:
                r = requests.get(url, timeout=15)
                if r.status_code == 200 and len(r.content) > 2000:
                    p = d / f"fig_{i:03d}.jpg"
                    p.write_bytes(r.content)
                    figs.append(p)
                else:
                    break
            except:
                break
        
        if len(figs) < 2:
            log(f"  -> only {len(figs)} figures, skipping")
            continue
        
        # Load and scan
        panels = {}
        for fp in figs:
            g = cv2.imread(str(fp), cv2.IMREAD_GRAYSCALE)
            if g is not None and g.shape[0] > 30:
                panels[fp.name] = g
        
        if len(panels) < 2:
            log(f"  -> only {len(panels)} panels loaded")
            continue
        
        # pHash + ORB
        findings = []
        keys = list(panels.keys())
        for a, b in combinations(keys, 2):
            ha = imagehash.phash(PILImage.fromarray(panels[a]))
            hb = imagehash.phash(PILImage.fromarray(panels[b]))
            d_ph = ha - hb
            if d_ph > 8:
                continue
            try:
                orb = cv2.ORB_create(500)
                ka, da = orb.detectAndCompute(panels[a], None)
                kb, db = orb.detectAndCompute(panels[b], None)
                if da is not None and db is not None:
                    raw = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da, db, k=2)
                    good = [p for p, n in raw if p.distance < 0.75 * n.distance]
                    if len(good) >= 8:
                        src = np.float32([ka[p.queryIdx].pt for p in good]).reshape(-1, 1, 2)
                        dst = np.float32([kb[p.trainIdx].pt for p in good]).reshape(-1, 1, 2)
                        _, mk = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
                        if mk is not None and int(mk.sum()) >= 10:
                            findings.append({"a": a, "b": b, "pHash": d_ph, "ORB": int(mk.sum()), "doi": doi, "label": label})
            except:
                pass
        
        log(f"  -> {len(panels)} panels, {len(findings)} suspicious pairs")
        if findings:
            with open(WORK / "findings.jsonl", "a") as f:
                for fn in findings:
                    f.write(json.dumps(fn) + "\n")
                    log(f"  *** [{fn['pHash']}/{fn['ORB']}] {fn['a']} <-> {fn['b']}")
        
        # Delete figures to save space
        import shutil
        shutil.rmtree(d)
        
        time.sleep(60)  # Rate limit per paper
    
    log(f"Round {round_num} complete. Sleeping 4h...")
    time.sleep(4 * 3600)
