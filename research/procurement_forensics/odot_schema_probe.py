#!/usr/bin/env python3
import io, zipfile, requests, pandas as pd
URLS=[
'https://www.oregon.gov/odot/Business/Estimating/2026%20BID%20DATA%20PROGRAM.zip',
'https://www.oregon.gov/odot/Business/Estimating/2025%20BID%20DATA%20PROGRAM.zip',
'https://www.oregon.gov/odot/Business/Estimating/2024%20BID%20DATA%20PROGRAM.zip']
for url in URLS:
    b=requests.get(url,timeout=90,headers={'User-Agent':'Mozilla/5.0'}).content
    with zipfile.ZipFile(io.BytesIO(b)) as z:
        for name in z.namelist():
            if not name.lower().endswith(('.xlsx','.xlsm','.xls')): continue
            engine='openpyxl' if name.lower().endswith(('.xlsx','.xlsm')) else None
            sheets=pd.read_excel(io.BytesIO(z.read(name)),sheet_name=None,header=None,engine=engine)
            for sh,df in sheets.items():
                print('\n===',name,'::',sh,'shape=',df.shape,'===')
                print(df.head(12).to_string(index=False,header=False,max_cols=30))
