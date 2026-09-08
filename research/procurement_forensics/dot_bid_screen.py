#!/usr/bin/env python3
"""Screen state-DOT bid item histories for repeated bidder-pair anomalies.

This is a lead-generation tool, not a finding of collusion. It rewards repeated co-bidding,
very small total-price gaps, winner alternation, and unusually high line-item price correlation.
All candidates require manual falsification (common ownership/JV, subcontracting, geography,
standard estimating software, market conditions, etc.).
"""
from __future__ import annotations
import argparse, io, json, math, re, sys, zipfile
from collections import defaultdict
from itertools import combinations
from pathlib import Path
import numpy as np
import pandas as pd
import requests

ODOT_ZIPS = {
    2026: "https://www.oregon.gov/odot/Business/Estimating/2026%20BID%20DATA%20PROGRAM.zip",
    2025: "https://www.oregon.gov/odot/Business/Estimating/2025%20BID%20DATA%20PROGRAM.zip",
    2024: "https://www.oregon.gov/odot/Business/Estimating/2024%20BID%20DATA%20PROGRAM.zip",
}
ALIASES = {
    "contract": ["contract number", "contract no", "contract", "contract id", "key number", "key no", "project number", "project no", "contract number text"],
    "bidder": ["bidder", "bidder name", "vendor", "vendor name", "contractor", "contractor name", "bidder contractor", "prime contractor"],
    "rank": ["bid rank", "bidder rank", "overall bid rank", "overall rank", "rank", "bid rank sequence number", "contractor rank"],
    "total": ["bid total", "total bid", "bid amount", "bid total amount", "total amount", "contract bid amount", "total bid amount"],
    "item": ["bid item", "bid item description", "item description", "description", "item", "item desc", "specification description"],
    "item_code": ["item code", "bid item code", "bid code", "item number", "item no", "bid item number", "spec number", "specification number"],
    "unit_price": ["unit bid price", "bid unit price", "unit price", "bid item unit price amount", "bid price", "item bid price", "contractor unit price"],
    "quantity": ["quantity", "bid item quantity", "item quantity", "qty", "estimated quantity"],
    "date": ["bid date", "letting date", "project actual let date", "date", "contract bid date"],
    "federal": ["federal aid number", "federal project number", "federal project", "fed aid", "federal aid no", "federal number"],
    "project": ["project name", "project", "short description", "contract description", "project description"],
}

def norm(s):
    s = str(s).strip().lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def find_col(cols, aliases):
    nmap = {norm(c): c for c in cols}
    for a in aliases:
        if norm(a) in nmap: return nmap[norm(a)]
    for a in aliases:
        na = norm(a)
        for nc, orig in nmap.items():
            if len(na) >= 5 and (na in nc or nc in na): return orig
    return None

def download_zip(url: str, timeout=90) -> bytes:
    r = requests.get(url, timeout=timeout, headers={"User-Agent":"Mozilla/5.0 procurement-research/1.0"})
    r.raise_for_status(); return r.content

def excel_frames_from_zip(blob: bytes, source: str):
    out=[]
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        names=[n for n in z.namelist() if n.lower().endswith((".xlsx",".xlsm",".xls")) and not n.startswith("__MACOSX")]
        if not names: raise RuntimeError(f"No Excel workbook found in {source}; members={z.namelist()[:30]}")
        print("ARCHIVE", source, "WORKBOOKS", names)
        for name in names:
            b=z.read(name); engine="openpyxl" if name.lower().endswith((".xlsx",".xlsm")) else None
            try:
                # Preserve every row. ODOT workbooks have changed header layout over time;
                # reading header=None lets the detector find the actual field-name row.
                sheets=pd.read_excel(io.BytesIO(b), sheet_name=None, engine=engine, header=None)
            except Exception as e: print(f"WARN: cannot read {source}:{name}: {e}", file=sys.stderr); continue
            for sh, df in sheets.items():
                if len(df)<2: continue
                df=df.copy(); df["_source_year_file"]=f"{source}:{name}:{sh}"
                print("SHEET", name, sh, "shape", df.shape)
                out.append(df)
    return out

def header_score(cols):
    mapping={k:find_col(cols,v) for k,v in ALIASES.items()}
    # Contract + bidder are essential. Item/unit/rank/total/date provide useful discrimination.
    score=0
    score += 4 if mapping["contract"] is not None else 0
    score += 4 if mapping["bidder"] is not None else 0
    for k in ["rank","total","unit_price","item","item_code","quantity","date","federal","project"]:
        score += 1 if mapping[k] is not None else 0
    return score,mapping

def detect_header_and_normalize(df):
    raw=df.copy(); candidates=[]
    # Candidate A: occasionally callers may already supply real column names.
    score,mapping=header_score(raw.columns)
    candidates.append((score,-1,raw.copy(),mapping))
    # Candidate B: test each of the first 35 raw rows as a possible header row.
    for header_row in range(0,min(35,len(raw))):
        vals=[str(x).strip() if pd.notna(x) else "" for x in raw.iloc[header_row].tolist()]
        # Ignore our provenance helper as a candidate header token.
        if "_source_year_file" in raw.columns:
            vals = vals[:-1]
            body = raw.iloc[header_row+1:, :-1].copy()
            prov = raw.iloc[header_row+1:, -1].copy()
        else:
            body=raw.iloc[header_row+1:].copy(); prov=None
        if not any(vals): continue
        # Make duplicate headers unique but retain visible wording for matching.
        seen={}; unique=[]
        for v in vals:
            base=v or "unnamed"
            n=seen.get(base,0);seen[base]=n+1
            unique.append(base if n==0 else f"{base}__{n+1}")
        if len(unique)!=body.shape[1]: continue
        body.columns=unique
        if prov is not None: body["_source_year_file"]=list(prov)
        score,mapping=header_score(body.columns)
        candidates.append((score,header_row,body,mapping))
    score,hrow,test,mapping=max(candidates,key=lambda x:x[0])
    if mapping["contract"] is None or mapping["bidder"] is None:
        return None
    keep={}
    for std,orig in mapping.items():
        if orig is not None and orig not in keep: keep[orig]=std
    d=test.rename(columns=keep).copy()
    d["_detected_header_row"]=hrow
    return d

def debug_unrecognized(frames, limit=8):
    print("=== UNRECOGNIZED ODOT WORKBOOK SCHEMA ===", file=sys.stderr)
    for i,f in enumerate(frames[:limit]):
        src="?"
        if "_source_year_file" in f.columns and len(f): src=str(f["_source_year_file"].iloc[0])
        print(f"FRAME {i}: {src} shape={f.shape}", file=sys.stderr)
        print("RAW COLUMNS:", [str(x) for x in f.columns], file=sys.stderr)
        print(f.head(20).to_string(index=False, header=False), file=sys.stderr)
        print("---", file=sys.stderr)

def clean_frames(frames):
    chunks=[]
    for f in frames:
        d=detect_header_and_normalize(f)
        if d is None: continue
        for c in ["contract","bidder","item","item_code","federal","project"]:
            if c in d:
                d[c]=d[c].where(d[c].notna(),"").astype(str).str.strip()
        for c in ["rank","total","unit_price","quantity"]:
            if c in d:d[c]=pd.to_numeric(d[c],errors="coerce")
        if "date" in d:d["date"]=pd.to_datetime(d["date"],errors="coerce")
        d=d[(d["contract"].astype(str).str.len()>0)&(d["bidder"].astype(str).str.len()>1)]
        chunks.append(d)
    if not chunks:
        debug_unrecognized(frames)
        raise RuntimeError("Could not recognize bid-data columns in any workbook sheet")
    cols=sorted(set().union(*(set(x.columns) for x in chunks)),key=str)
    return pd.concat([x.reindex(columns=cols) for x in chunks],ignore_index=True)

def canonical_bidder(s): return norm(s)

def build_bid_table(df):
    d=df.copy(); d["bidder_key"]=d["bidder"].map(canonical_bidder); aggs={"bidder":"first"}
    for c in ["rank","total","date","federal","project"]:
        if c in d:aggs[c]="first"
    b=d.groupby(["contract","bidder_key"],dropna=False).agg(aggs).reset_index()
    if "total" not in b or b["total"].notna().sum()==0:
        if {"quantity","unit_price"}.issubset(d.columns):
            d["ext"]=d["quantity"]*d["unit_price"]
            sums=d.groupby(["contract","bidder_key"])["ext"].sum(min_count=1).reset_index(name="total_derived")
            b=b.merge(sums,on=["contract","bidder_key"],how="left"); b["total"]=b.get("total",np.nan); b["total"]=b["total"].fillna(b["total_derived"])
    return b,d

def item_corr(d,contract,a,b):
    if "unit_price" not in d:return np.nan,0
    key="item_code" if "item_code" in d and d["item_code"].astype(str).str.len().gt(0).any() else ("item" if "item" in d else None)
    if not key:return np.nan,0
    x=d[(d.contract==contract)&(d.bidder_key.isin([a,b]))][["bidder_key",key,"unit_price"]].dropna()
    if x.empty:return np.nan,0
    p=x.pivot_table(index=key,columns="bidder_key",values="unit_price",aggfunc="first")
    if a not in p or b not in p:return np.nan,0
    p=p[[a,b]].dropna(); n=len(p)
    if n<4 or p[a].nunique()<2 or p[b].nunique()<2:return np.nan,n
    return float(p[a].corr(p[b])),n

def screen(df):
    bids,items=build_bid_table(df)
    pairs=defaultdict(lambda:{"common_contracts":0,"small_gap_05":0,"small_gap_10":0,"l1_l2":0,"a_wins":0,"b_wins":0,"high_corr":0,"corr_n":0,"contracts":[]})
    contract_rows=[]
    for contract,g0 in bids.groupby("contract"):
        g=g0.drop_duplicates("bidder_key").copy()
        if len(g)<2:continue
        if "rank" not in g:g["rank"]=np.nan
        if "total" in g and g["total"].notna().sum()>=2:g["rank"]=g["rank"].fillna(g["total"].rank(method="min"))
        sort_cols=[c for c in ["rank","total"] if c in g]
        gs=g.sort_values(sort_cols,na_position="last") if sort_cols else g
        if len(gs)>=2 and "total" in gs and pd.notna(gs.iloc[0].get("total")) and pd.notna(gs.iloc[1].get("total")):
            t1=float(gs.iloc[0]["total"]);t2=float(gs.iloc[1]["total"]);gap=abs(t2-t1)/max(abs(t1),1)*100
            contract_rows.append({"contract":contract,"l1":gs.iloc[0].bidder,"l2":gs.iloc[1].bidder,"l1_total":t1,"l2_total":t2,"gap_pct":gap,"federal":gs.iloc[0].get("federal"),"project":gs.iloc[0].get("project")})
        for ra,rb in combinations(g.to_dict("records"),2):
            a,b=sorted([ra["bidder_key"],rb["bidder_key"]]);p=pairs[(a,b)];p["common_contracts"]+=1
            ta,tb=ra.get("total"),rb.get("total");gap=np.nan
            if pd.notna(ta) and pd.notna(tb):
                gap=abs(float(ta)-float(tb))/max(min(abs(float(ta)),abs(float(tb))),1)*100
                if gap<=0.5:p["small_gap_05"]+=1
                if gap<=1.0:p["small_gap_10"]+=1
            rka,rkb=ra.get("rank"),rb.get("rank")
            if set([rka,rkb])==set([1,2]):p["l1_l2"]+=1
            if rka==1:p["a_wins" if ra["bidder_key"]==a else "b_wins"]+=1
            if rkb==1:p["a_wins" if rb["bidder_key"]==a else "b_wins"]+=1
            corr,n=item_corr(items,contract,a,b)
            if pd.notna(corr):
                p["corr_n"]+=1
                if corr>=0.995 and n>=5:p["high_corr"]+=1
            p["contracts"].append({"contract":str(contract),"gap_pct":None if pd.isna(gap) else round(float(gap),4),"corr":None if pd.isna(corr) else round(float(corr),6),"items":n,"ranks":[None if pd.isna(rka) else float(rka),None if pd.isna(rkb) else float(rkb)]})
    rows=[]
    for (a,b),p in pairs.items():
        rotation=min(p["a_wins"],p["b_wins"])
        score=math.log1p(p["common_contracts"])*1.5+p["small_gap_05"]*2.5+p["small_gap_10"]+p["l1_l2"]*.7+rotation*1.5+p["high_corr"]*1.5
        rows.append({"bidder_a":a,"bidder_b":b,**{k:v for k,v in p.items() if k!="contracts"},"winner_rotation":rotation,"lead_score":round(score,3),"contracts_json":json.dumps(p["contracts"],separators=(",",":"))})
    pairdf=pd.DataFrame(rows).sort_values(["lead_score","common_contracts"],ascending=False) if rows else pd.DataFrame()
    return pairdf,pd.DataFrame(contract_rows),bids

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--years",nargs="*",type=int,default=[2026,2025,2024]);ap.add_argument("--out",default="artifacts/procurement_forensics/odot");ap.add_argument("--zip",action="append",default=[])
    args=ap.parse_args();out=Path(args.out);out.mkdir(parents=True,exist_ok=True);frames=[];sources=[]
    for url in [ODOT_ZIPS[y] for y in args.years if y in ODOT_ZIPS]+args.zip:
        try:
            print("DOWNLOAD",url);blob=download_zip(url);print("BYTES",len(blob));sources.append({"url":url,"bytes":len(blob),"ok":True});frames.extend(excel_frames_from_zip(blob,url))
        except Exception as e:print("ERROR",url,e,file=sys.stderr);sources.append({"url":url,"ok":False,"error":str(e)})
    if not frames:
        (out/"sources.json").write_text(json.dumps(sources,indent=2));raise SystemExit("No source workbook could be loaded")
    df=clean_frames(frames);print("ROWS",len(df),"COLS",list(df.columns));pairdf,contracts,bids=screen(df)
    pairdf.to_csv(out/"pair_screen.csv",index=False);contracts.to_csv(out/"contract_screen.csv",index=False);bids.to_csv(out/"bids_normalized.csv",index=False)
    summary={"sources":sources,"rows":len(df),"contracts":int(bids.contract.nunique()),"bidders":int(bids.bidder_key.nunique()),"pairs":len(pairdf),"top_pairs":pairdf.head(25).drop(columns=["contracts_json"],errors="ignore").to_dict("records")}
    (out/"summary.json").write_text(json.dumps(summary,indent=2,default=str));print(json.dumps(summary,indent=2,default=str)[:15000])
if __name__=="__main__":main()
