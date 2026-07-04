#!/usr/bin/env python3
"""Clean and deduplicate the DOI list from Sholto David's blog post."""
import re, json, subprocess

# Clean DOIs from the extracted list
raw = [
    "10.1016/j.bbrc.2004.02.080", "10.1016/j.ccr.2007.02.015",
    "10.1016/j.cell.2007.03.047", "10.1038/22780",
    "10.1038/nm.3867", "10.1073/pnas.0711293105",
    "10.1073/pnas.1608067113", "10.1111/bjh.14493",
    "10.1126/scisignal.2000369", "10.1158/0008-5472.can-04-2938",
    "10.1158/0008-5472.can-05-1103", "10.1158/1078-0432.ccr-07-1299",
    "10.1158/1078-0432.ccr-11-0111", "10.1158/1078-0432.ccr-12-1532",
    "10.1182/blood-2002-10-3146", "10.1182/blood-2005-01-0320",
    "10.1182/blood-2008-10-186668", "10.1182/blood-2009-01-199281",
    "10.1182/blood-2010-06-292243", "10.1182/blood-2011-07-368050",
    "10.1182/blood-2012-12-475111", "10.1182/blood-2014-03-563981",
    "10.1200/jco.2010.33.2312", "10.1261/rna.2192803",
    "10.1371/journal.pone.0002020", "10.1016/s1535-6108(04)00026-1",
    "10.1038/545387a", "10.1038/nature12147", "10.1038/ni907",
    "10.1126/science.1123480", "10.1128/mcb.24.12.5459-5474.2004",
    "10.1182/blood-2008-05-157040", "10.1186/1476-4598-13-71",
    "10.1016/j.cell.2006.01.040",
]

unique = sorted(set(raw))
print(f"=== {len(unique)} Dana-Farber papers with image concerns ===")
print()
for i, doi in enumerate(unique, 1):
    print(f"{i:2d}. https://doi.org/{doi}")

print(f"\n=== Settlement Papers (14 admitted by Dana-Farber) ===")
print("The DOJ settlement covers 14 publications from 2014-2020.")
print("These are the specific papers with admitted image manipulation.")
print()
print("PubPeer threads for each: https://pubpeer.com/search?q=")
