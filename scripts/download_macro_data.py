#!/usr/bin/env python3
"""
Download macroeconomic indicators from the Federal Reserve Economic Database (FRED).

This script uses the fredapi package to retrieve time series for specific macro
indicators such as the Consumer Price Index (CPI) and the Federal Funds Rate.
An API key from FRED is required. Obtain one for free from https://fred.stlouisfed.org/faq.

The resulting data is saved to 'public/data/macro_data.csv' for integration
into the Klever Orion pipeline.
"""

from datetime import datetime
import os
import pandas as pd

try:
    from fredapi import Fred
except ImportError:
    raise ImportError(
        "fredapi is required to download macroeconomic data. Install it via 'pip install fredapi'."
    )

def download_macro_data(api_key: str, series_ids: list, start_date: str = '1990-01-01') -> pd.DataFrame:
    """Fetch multiple FRED series and combine them into a single DataFrame."""
    fred = Fred(api_key=api_key)
    df_combined: pd.DataFrame | None = None
    for series_id in series_ids:
        data = fred.get_series(series_id, observation_start=start_date)
        df_series = data.to_frame(name=series_id).reset_index().rename(columns={'index': 'date'})
        if df_combined is None:
            df_combined = df_series
        else:
            df_combined = pd.merge(df_combined, df_series, on='date', how='outer')
    df_combined = df_combined.sort_values('date').reset_index(drop=True)
    return df_combined

def main():
    api_key = os.getenv('FRED_API_KEY')
    if not api_key:
        raise EnvironmentError('FRED_API_KEY environment variable not set. Please set it to your FRED API key.')
    # Define macro series to download
    series_ids = [
        'CPIAUCSL',  # Consumer Price Index for All Urban Consumers: All Items
        'FEDFUNDS',  # Effective Federal Funds Rate
        'DGS10',    # 10-Year Treasury Constant Maturity Rate
        'DEXUSUK',  # U.S. to U.K. Foreign Exchange Rate
    ]
    macro_df = download_macro_data(api_key, series_ids)
    output_path = os.path.join('public', 'data', 'macro_data.csv')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    macro_df.to_csv(output_path, index=False)
    print(f'Macro data saved to {output_path}')


if __name__ == '__main__':
    main()
