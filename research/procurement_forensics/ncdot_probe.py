#!/usr/bin/env python3
"""Probe NCDOT central letting XLS bid tabs for a machine-readable bidder schema."""
from __future__ import annotations
import io, re
from urllib.parse import urljoin
import requests
import pandas as pd
from bs4 import BeautifulSoup

PAGE='https://connect.ncdot.gov/letting/pages/bid-tabs.aspx'
UA={'User-Agent':'Mozilla/5.0 procurement-research/1.0'}

r=requests.get(PAGE,headers=UA,timeout=60); r.raise_for_status()
soup=BeautifulSoup(r.text,'html.parser')
links=[]
for a in soup.find_all('a',href=True):
    href=urljoin(PAGE,a['href'])
    txt=' '.join(a.stripped_strings)
    if re.search(r'\.xls(?:x)?(?:$|\?)',href,re.I) or re.search(r'\bXLS\b',txt,re.I):
        links.append((txt,href))
# dedupe while retaining page order
seen=set(); links=[x for x in links if not (x[1] in seen or seen.add(x[1]))]
print('XLS LINKS',len(links))
for txt,url in links[:30]: print('LINK',repr(txt),url)

for txt,url in links[:5]:
    print('\nDOWNLOAD',url)
    rr=requests.get(url,headers=UA,timeout=90); print('STATUS',rr.status_code,'BYTES',len(rr.content),'CTYPE',rr.headers.get('content-type')); rr.raise_for_status()
    try:
        sheets=pd.read_excel(io.BytesIO(rr.content),sheet_name=None,header=None)
    except Exception as e:
        print('READ ERROR',repr(e)); continue
    for sh,df in sheets.items():
        print('SHEET',repr(sh),'SHAPE',df.shape)
        for i in range(min(35,len(df))):
            vals=['' if pd.isna(x) else str(x).strip() for x in df.iloc[i].tolist()]
            joined=' | '.join(vals)
            if i<15 or re.search(r'bidder|contractor|proposal|bid amount|total bid|unit price|item',joined,re.I):
                print('ROW',i,'::',joined[:2500])
