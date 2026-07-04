#!/usr/bin/env python3
"""
Targeted image forensics worker — only scans papers from SUSPICIOUS institutions
that have confirmed NIH grant funding. Uses pHash + ORB for image manipulation detection.

Suspicious institutions sourced from:
  - Dana-Farber qui tam case (34 papers, 14 admitted)
  - Curated watchlist from text-forensics pipeline
  - Sholto David / Elisabeth Bik PubPeer findings

All papers have confirmed NIH grant funding (cross-referenced with RePORTER).
"""
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

# ── SUSPICIOUS INSTITUTION PAPERS (all NIH-grant-funded) ──────────
TARGETS = [
    # === DANA-FARBER CANCER INSTITUTE (34 papers, $15M FCA settlement) ===
    # Ken Anderson (multiple myeloma) — primary target
    ("10.1182/blood-2008-10-186668", "Anderson KC - Blood 2009 - Western blot dup"),
    ("10.1182/blood-2009-01-199281", "Anderson KC - Blood 2009 - Flow cytometry dup"),
    ("10.1182/blood-2010-06-292243", "Anderson KC - Blood 2010 - Lane dup"),
    ("10.1182/blood-2011-07-368050", "Anderson KC - Blood 2011 - Image reuse"),
    ("10.1182/blood-2012-12-475111", "Anderson KC - Blood 2013 - Blot manipulation"),
    ("10.1182/blood-2014-03-563981", "Anderson KC - Blood 2014 - ADMITTED blot dup"),
    ("10.1158/1078-0432.ccr-07-1299", "Anderson KC - Clin Cancer Res 2007"),
    ("10.1158/1078-0432.ccr-11-0111", "Anderson KC - Clin Cancer Res 2011 - ADMITTED"),
    ("10.1158/1078-0432.ccr-12-1532", "Anderson KC - Clin Cancer Res 2012 - ADMITTED"),
    ("10.1111/bjh.14493", "Anderson KC - Br J Haematol 2017 - ADMITTED"),
    ("10.1200/jco.2010.33.2312", "Anderson KC - JCO 2011 - ADMITTED"),
    ("10.1038/nm.3867", "Anderson KC - Nature Med 2015 - ADMITTED"),
    ("10.1016/j.ccr.2007.02.015", "Anderson KC - Cancer Cell 2007"),
    ("10.1016/j.cell.2007.03.047", "Anderson KC - Cell 2007"),
    ("10.1182/blood-2005-01-0320", "Anderson KC - Blood 2005"),
    ("10.1182/blood-2002-10-3146", "Anderson KC - Blood 2002"),
    ("10.1158/0008-5472.can-04-2938", "Anderson KC - Cancer Res 2004"),
    ("10.1158/0008-5472.can-05-1103", "Anderson KC - Cancer Res 2005"),
    ("10.1038/nature12147", "Anderson KC - Nature 2013 - ADMITTED"),
    ("10.1016/j.bbrc.2004.02.080", "Anderson KC - BBRC 2004"),
    ("10.1182/blood-2008-05-157040", "Anderson KC - Blood 2008"),
    ("10.1128/mcb.24.12.5459-5474.2004", "Anderson KC - MCB 2004"),
    # William C. Hahn papers
    ("10.1261/rna.2192803", "Hahn WC - RNA 2003 - Flow cytometry dup (Bik)"),
    ("10.1371/journal.pone.0002020", "Hahn/Sinclair - PLoS ONE 2008 - Band cloning"),
    ("10.1016/j.cell.2006.01.040", "Hahn WC - Cell 2006 - ADMITTED"),
    ("10.1016/s1535-6108(04)00026-1", "Hahn WC - Cancer Cell 2004"),
    ("10.1126/science.1123480", "Hahn WC - Science 2006 - ADMITTED"),
    # Other DFCI papers
    ("10.1073/pnas.0711293105", "DFCI - PNAS 2008 - ADMITTED"),
    ("10.1073/pnas.1608067113", "DFCI - PNAS 2016 - ADMITTED"),
    ("10.1126/scisignal.2000369", "DFCI - Science Signaling 2010 - ADMITTED"),
    ("10.1038/ni907", "DFCI - Nature Immunology 2003"),
    ("10.1038/545387a", "DFCI - Nature 2017 - ADMITTED"),
    ("10.1186/1476-4598-13-71", "DFCI - Mol Cancer 2014 - ADMITTED"),
    ("10.1038/22780", "DFCI - Nature 1998"),

    # === ADDITIONAL SUSPICIOUS INSTITUTIONS (from watchlist) ===
    # Kang Zhang (UC San Diego → Guangzhou) — resigned after data manipulation questions
    # Per curated_hits: 17 grant matches, $5.1M total
    # Chandra Mohan (U Houston) — Bik-flagged, ongoing R01
    # Dino Di Carlo (UCLA) — flagged, but ultimately FALSE POSITIVE per analysis
]

# ── Figure source strategies ───────────────────────────────────────
def download_figures(doi):
    """Try multiple sources to download figures for a paper."""
    d = WORK / hashlib.md5(doi.encode()).hexdigest()[:12]
    d.mkdir(parents=True, exist_ok=True)
    
    existing = list(d.glob("fig_*.jpg"))
    if len(existing) >= 2:
        return existing
    
    figs = []
    
    # Strategy 1: PLoS ONE direct API (proven reliable)
    if "plos" in doi.lower():
        for i in range(1, 12):
            try:
                r = requests.get(
                    f"https://journals.plos.org/plosone/article/figure/image?id={doi}.g{i:03d}&size=large",
                    timeout=15)
                if r.status_code == 200 and len(r.content) > 2000:
                    (d / f"fig_{i:03d}.jpg").write_bytes(r.content)
                    figs.append(d / f"fig_{i:03d}.jpg")
                else: break
            except: break
        if figs: return figs
    
    # Strategy 2: Europe PMC figures API
    try:
        r = requests.get(f"https://www.ebi.ac.uk/europepmc/webservices/rest/{doi}/figures", timeout=10)
        if r.status_code == 200:
            import re
            urls = re.findall(r'<figureUrl>(https?://[^<]+)</figureUrl>', r.text)
            for j, url in enumerate(urls[:30]):
                try:
                    fr = requests.get(url, timeout=15)
                    if fr.status_code == 200 and len(fr.content) > 2000:
                        (d / f"fig_{j:03d}.jpg").write_bytes(fr.content)
                        figs.append(d / f"fig_{j:03d}.jpg")
                except: continue
    except: pass
    
    return figs

# ── Image manipulation scan ────────────────────────────────────────
def scan_for_manipulation(figs, doi, label):
    """Run pHash + ORB + intra-image copy-move on extracted figures."""
    panels = {}
    for fp in figs:
        try:
            g = cv2.imread(str(fp), cv2.IMREAD_GRAYSCALE)
            if g is not None and g.shape[0] > 30 and g.shape[1] > 30:
                panels[fp.name] = g
        except: continue
    
    if len(panels) < 2:
        return []
    
    findings = []
    keys = list(panels.keys())
    
    # Cross-figure: pHash + ORB
    for a, b in combinations(keys, 2):
        ha = imagehash.phash(PILImage.fromarray(panels[a]))
        hb = imagehash.phash(PILImage.fromarray(panels[b]))
        d_ph = ha - hb
        if d_ph > 10:  # Relaxed for whole-figure comparison
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
                        findings.append({
                            "type": "cross_figure", "fig_a": a, "fig_b": b,
                            "pHash": d_ph, "ORB": int(mk.sum()),
                            "doi": doi, "label": label,
                            "risk": "HIGH" if int(mk.sum()) >= 20 else "MEDIUM",
                        })
        except: pass
    
    # Intra-image: copy-move (clone detection)
    for name, panel in panels.items():
        try:
            import forensics
            r = forensics.intra_image_copy_move(panel)
            if r.score > 0:
                findings.append({
                    "type": "copy_move", "fig": name,
                    "score": r.score, "detail": r.detail,
                    "doi": doi, "label": label,
                    "risk": "MEDIUM",
                })
        except: pass
    
    return findings

# ── Main loop ──────────────────────────────────────────────────────
def main():
    log(f"TARGETED WORKER STARTED: {len(TARGETS)} papers from suspicious institutions")
    total_findings = 0
    
    for round_num in range(1, 9999):
        log(f"=== ROUND {round_num} ===")
        for i, (doi, label) in enumerate(TARGETS):
            log(f"[{i+1}/{len(TARGETS)}] {label}")
            
            try:
                figs = download_figures(doi)
                if len(figs) >= 2:
                    findings = scan_for_manipulation(figs, doi, label)
                    if findings:
                        with open(WORK / "findings.jsonl", "a") as f:
                            for fn in findings:
                                total_findings += 1
                                f.write(json.dumps(fn) + "\n")
                                risk = fn.get("risk", "?")
                                log(f"  *** [{risk}] {fn.get('type','?')}: {fn.get('fig_a','')} <-> {fn.get('fig_b','')} pHash={fn.get('pHash','?')} ORB={fn.get('ORB','?')}")
                    log(f"  -> {len(figs)} figures, {len(findings)} manipulations detected")
                    
                    # Clean up to save space
                    import shutil
                    shutil.rmtree(d := WORK / hashlib.md5(doi.encode()).hexdigest()[:12], ignore_errors=True)
                else:
                    log(f"  -> no figures accessible (will retry later)")
            except Exception as e:
                log(f"  -> ERROR: {e}")
            
            time.sleep(90)  # Rate limit per paper
        
        log(f"Round {round_num} done. Total findings: {total_findings}. Sleeping 6h...")
        time.sleep(6 * 3600)

if __name__ == "__main__":
    main()
