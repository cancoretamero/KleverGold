"""
train_price_model.py

This script trains a time series forecasting model for gold prices using Prophet.
It loads historical gold OHLC data from the `public/data/xauusd_ohlc_clean.csv` file,
resamples it to daily frequency, and fits a Prophet model to forecast future prices.
The resulting forecast is saved to `public/data/price_forecast.csv`, and the trained
model is saved to `models/prophet_model.pkl`.

To use: pip install pandas prophet (or fbprophet for older versions of Prophet).
"""

import pandas as pd
from pathlib import Path
import pickle


def load_price_data():
    # Determine project root directory (two levels up from this script)
    root_dir = Path(__file__).resolve().parents[1]
    data_path = root_dir / 'public' / 'data' / 'xauusd_ohlc_clean.csv'
    df = pd.read_csv(data_path)
    # Parse dates and select closing price
    df['date'] = pd.to_datetime(df['date'])
    df = df[['date', 'close']].rename(columns={'date': 'ds', 'close': 'y'})
    # Resample to daily frequency; forward fill missing values
    df = df.set_index('ds').resample('D').last().ffill().reset_index()
    return df


def train_prophet_model(df):
    # Try to import Prophet from either `prophet` or `fbprophet`
    try:
        from prophet import Prophet
    except ImportError:
        from fbprophet import Prophet  # type: ignore
    model = Prophet(daily_seasonality=False, weekly_seasonality=False)
    model.fit(df)
    return model


def main():
    df = load_price_data()
    model = train_prophet_model(df)
    # Generate forecast for the next year
    future = model.make_future_dataframe(periods=365)
    forecast = model.predict(future)
    # Save forecast and model
    root_dir = Path(__file__).resolve().parents[1]
    output_dir = root_dir / 'public' / 'data'
    output_dir.mkdir(parents=True, exist_ok=True)
    forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].to_csv(output_dir / 'price_forecast.csv', index=False)
    # Save the trained model
    model_dir = root_dir / 'models'
    model_dir.mkdir(parents=True, exist_ok=True)
    with open(model_dir / 'prophet_model.pkl', 'wb') as f:
        pickle.dump(model, f)
    print('Training completed. Forecast saved to price_forecast.csv')


if __name__ == '__main__':
    main()
