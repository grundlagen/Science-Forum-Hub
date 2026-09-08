#!/usr/bin/env python3
import re, requests
from bs4 import BeautifulSoup
from pypdf import PdfReader
from io import BytesIO

PAGES=[
 'https://www.oregon.gov/odot/Business/Procurement/Pages/BT.aspx',
 'https://www.oregon.gov/odot/Business/Procurement/Pages/PBR.aspx',
 'https://www.oregon.gov/odot/Business/Procurement/Pages/Archive.aspx',
]
s=requests.Session();s.headers['User-Agent']='Mozilla/5.0 procurement-research/1.0'
seen=[]
for page in PAGES:
    try:
        r=s.get(page,timeout=60);print('\nPAGE',page,r.status_code,len(r.content),r.url)
        soup=BeautifulSoup(r.text,'html.parser')
        links=[]
        for a in soup.find_all('a',href=True):
            href=requests.compat.urljoin(r.url,a['href'])
            text=' '.join(a.stripped_strings)
            if '.pdf' in href.lower() or 'bid' in text.lower() or 'tab' in text.lower():
                links.append((text,href))
        print('CANDIDATE LINKS',len(links))
        for text,href in links[:80]: print('LINK',repr(text),href)
        for text,href in links:
            if re.search(r'C\d+_BT\.pdf',href,re.I) and href not in seen: seen.append(href)
    except Exception as e: print('PAGE ERROR',page,repr(e))
print('\nBIDTAB PDFS',len(seen))
for url in seen[:8]:
    try:
        r=s.get(url,timeout=60);print('\nPDF',url,r.status_code,len(r.content),r.headers.get('content-type'))
        reader=PdfReader(BytesIO(r.content));print('PAGES',len(reader.pages))
        for pno in range(min(2,len(reader.pages))):
            txt=reader.pages[pno].extract_text() or ''
            print('---PAGE',pno+1,'---')
            print(txt[:7000])
    except Exception as e: print('PDF ERROR',url,repr(e))
