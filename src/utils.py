import pandas as pd


def make_forecast_long_format(forecast_df: pd.DataFrame, base_timestamp: str | None = None) -> pd.DataFrame:
    row = forecast_df.iloc[0]
    hours = list(range(1, len(row) + 1))
    values = row.values.tolist()

    result = pd.DataFrame({
        "hour_ahead": hours,
        "predicted_temperature": values
    })

    if base_timestamp is not None:
        base_ts = pd.to_datetime(base_timestamp)
        result["forecast_time"] = [
            (base_ts + pd.Timedelta(hours=h)).strftime("%Y-%m-%d %H:%M")
            for h in hours
        ]
    else:
        result["forecast_time"] = [f"t+{h}" for h in hours]

    return result


def summarize_forecast(forecast_df: pd.DataFrame) -> dict:
    values = forecast_df.iloc[0].values
    return {
        "min_temp": round(float(values.min()), 2),
        "max_temp": round(float(values.max()), 2),
        "avg_temp": round(float(values.mean()), 2),
    }