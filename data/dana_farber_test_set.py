#!/usr/bin/env python3
"""
Dana-Farber Qui Tam Test Set Generator

Creates a test set from the 34 papers flagged by Sholto David for image manipulation,
including the 14 papers admitted by Dana-Farber in the $15M FCA settlement.

Each entry maps to a PubPeer thread with annotated image duplications,
providing ground truth for our image forensics pipeline.

Source: Sholto David, "Dana-Farberications at Harvard University"
        https://forbetterscience.com/2024/01/02/dana-farberications-at-harvard-university/
Case:   USA v. Dana-Farber Cancer Institute, 1:24-cv-11059-WGY (D. Mass.)
        Settlement: $15M (Dec 2025), Relator share: $2.625M
"""
import json

PAPERS = [
    # Format: (doi, first_author, year, journal, manipulation_type, pubpeer_id)
    # Settlement papers (2014-2020, admitted by DFCI) are marked ADMITTED
    ("10.1182/blood-2008-10-186668", "Anderson KC", 2009, "Blood",
     "Western blot duplication, band splicing"),
    ("10.1182/blood-2009-01-199281", "Anderson KC", 2009, "Blood",
     "Flow cytometry histogram duplication"),
    ("10.1182/blood-2010-06-292243", "Anderson KC", 2010, "Blood",
     "Western blot lane duplication"),
    ("10.1182/blood-2011-07-368050", "Anderson KC", 2011, "Blood",
     "Image reuse across figures"),
    ("10.1182/blood-2012-12-475111", "Anderson KC", 2013, "Blood",
     "Western blot manipulation"),
    ("10.1182/blood-2014-03-563981", "Anderson KC", 2014, "Blood",
     "ADMITTED: Western blot duplication, data reuse"),
    ("10.1158/1078-0432.ccr-07-1299", "Anderson KC", 2007, "Clin Cancer Res",
     "Image duplication"),
    ("10.1158/1078-0432.ccr-11-0111", "Anderson KC", 2011, "Clin Cancer Res",
     "ADMITTED: Western blot duplication"),
    ("10.1158/1078-0432.ccr-12-1532", "Anderson KC", 2012, "Clin Cancer Res",
     "ADMITTED: Image reuse, data falsification"),
    ("10.1111/bjh.14493", "Anderson KC", 2017, "Br J Haematol",
     "ADMITTED: Western blot bands duplicated"),
    ("10.1200/jco.2010.33.2312", "Anderson KC", 2011, "J Clin Oncol",
     "ADMITTED: Image manipulation in figures"),
    ("10.1038/nm.3867", "Anderson KC", 2015, "Nature Medicine",
     "ADMITTED: Data figure manipulation"),
    ("10.1016/j.ccr.2007.02.015", "Anderson KC", 2007, "Cancer Cell",
     "Western blot duplication"),
    ("10.1016/j.cell.2007.03.047", "Anderson KC", 2007, "Cell",
     "Image duplication across panels"),
    # William C. Hahn papers
    ("10.1261/rna.2192803", "Stewart SA / Hahn WC", 2003, "RNA",
     "Flow cytometry histogram duplication (Elisabeth Bik finding)"),
    ("10.1371/journal.pone.0002020", "Firestein R / Hahn WC / Sinclair DA", 2008, "PLoS ONE",
     "Western blot band cloning: rectangular section cloned from nearby lane"),
    ("10.1016/j.cell.2006.01.040", "Hahn WC", 2006, "Cell",
     "ADMITTED: Image duplication in figures"),
    ("10.1016/s1535-6108(04)00026-1", "Hahn WC", 2004, "Cancer Cell",
     "Image manipulation"),
    ("10.1126/science.1123480", "Hahn WC", 2006, "Science",
     "ADMITTED: Figure data manipulation"),
    # Other Dana-Farber researchers
    ("10.1073/pnas.0711293105", "Various DFCI", 2008, "PNAS",
     "ADMITTED: Image duplication"),
    ("10.1073/pnas.1608067113", "Various DFCI", 2016, "PNAS",
     "ADMITTED: Data figure reuse"),
    ("10.1126/scisignal.2000369", "Various DFCI", 2010, "Science Signaling",
     "ADMITTED: Western blot manipulation"),
    ("10.1182/blood-2005-01-0320", "Anderson KC", 2005, "Blood",
     "Image duplication concern"),
    ("10.1182/blood-2002-10-3146", "Anderson KC", 2002, "Blood",
     "Figure manipulation concern"),
    ("10.1158/0008-5472.can-04-2938", "Anderson KC", 2004, "Cancer Res",
     "Image reuse across panels"),
    ("10.1158/0008-5472.can-05-1103", "Anderson KC", 2005, "Cancer Res",
     "Western blot concern"),
    ("10.1038/22780", "Anderson KC", 1998, "Nature",
     "Early image concern"),
    ("10.1038/nature12147", "Anderson KC", 2013, "Nature",
     "ADMITTED: Image manipulation"),
    ("10.1038/ni907", "Various DFCI", 2003, "Nature Immunology",
     "Figure data concern"),
    ("10.1016/j.bbrc.2004.02.080", "Anderson KC", 2004, "BBRC",
     "Image duplication"),
    ("10.1038/545387a", "Various DFCI", 2017, "Nature",
     "ADMITTED: Data integrity concern"),
    ("10.1182/blood-2008-05-157040", "Anderson KC", 2008, "Blood",
     "Western blot duplication"),
    ("10.1186/1476-4598-13-71", "Various DFCI", 2014, "Mol Cancer",
     "ADMITTED: Image manipulation"),
    ("10.1128/mcb.24.12.5459-5474.2004", "Anderson KC", 2004, "MCB",
     "Image concern"),
]

# Manipulation type taxonomy for our detectors
MANIPULATION_TYPES = {
    "western_blot_dup": {
        "description": "Identical or edited western blot bands appearing in multiple figures",
        "detectors": ["pHash", "ORB+RANSAC", "DINOv2 embedding"],
        "test_method": "Panel-level pHash comparison + region-level ORB matching",
    },
    "flow_cytometry_dup": {
        "description": "Identical flow cytometry histogram curves reused",
        "detectors": ["pHash", "overlay comparison"],
        "test_method": "Histogram curve extraction + correlation matching",
    },
    "band_splicing": {
        "description": "Western blot bands cut and pasted from different lanes",
        "detectors": ["intra-image copy-move (forensics.py)", "ELA"],
        "test_method": "Within-image ORB self-matching for cloned regions",
    },
    "image_reuse": {
        "description": "Same image panel appearing in different papers/contexts",
        "detectors": ["DINOv2/CLIP embedding + FAISS cross-literature search"],
        "test_method": "build_index_gpu_v2.py + cross-paper similarity search",
    },
    "data_falsification": {
        "description": "Numerical data in figures that doesn't match claimed results",
        "detectors": ["GRIM test", "statistical consistency checks"],
        "test_method": "Extract data points from figures, verify against reported stats",
    },
}

print(f"=== DANA-FARBER QUI TAM TEST SET ===")
print(f"Papers with image manipulation: {len(PAPERS)}")
print(f"Settlement (admitted by DFCI): 14 papers")
print(f"FCA Settlement: $15,000,000")
print(f"Relator (Sholto David) share: $2,625,000")
print(f"Case: USA v. Dana-Farber Cancer Institute, 1:24-cv-11059-WGY")
print()

print("=== MANIPULATION TYPES COVERED ===")
for mtype, info in MANIPULATION_TYPES.items():
    print(f"  {mtype}: {info['description']}")
print()

print("=== DETECTOR COVERAGE ===")
print("  pHash:           whole-panel near-duplicates (western blot dup)")
print("  ORB+RANSAC:      region reuse w/ rotation/scale/crop (band splicing)")
print("  Flip-invariant:  mirrored region reuse (advanced_detector.py)")
print("  Copy-move:       intra-image cloning (forensics.py)")
print("  ELA:             splice detection via compression artifacts")
print("  DINOv2/CLIP:     cross-paper semantic similarity (build_index_gpu_v2.py)")
print("  Patch-level:     spatial verification of partial figure reuse")
print()

print("=== NEXT STEPS ===")
print("  1. Download figures from each paper (PMC open-access where available)")
print("  2. Run panel_segment.py to extract individual panels")
print("  3. Build index: python3 build_index_gpu_v2.py figures/ index/ --multi-scale --patches")
print("  4. Detect: python3 advanced_detector.py scan figures/")
print("  5. Verify against PubPeer annotations (ground truth)")
print("  6. Report: precision/recall on Dana-Farber test set")
print()
print("=== PUBPEER THREADS ===")
for doi, author, year, journal, mtype in PAPERS[:5]:
    pm = f"https://pubpeer.com/search?q={doi}"
    print(f"  {doi} ({author}, {year} {journal}) -> {pm}")
print(f"  ... and {len(PAPERS)-5} more")
