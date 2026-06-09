import json
from io import StringIO
from pathlib import Path

import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"


RAW_REQUIRED_COLUMNS = [
    "TIMESTAMP",
    "Barometric_Pressure",
    "Rain",
    "Air_Temperature",
    "Air_Dew_Point",
    "Air_Wet_Bulb",
    "Air_RH",
    "Air_Heat_Index",
    "Solar_Horizontal_Total",
    "Solar_Horizontal_Diffuse",
    "Solar_Vertical_Total",
    "Solar_Latitude_Diffuse",
    "Wind_Speed",
    "Wind_Speed_MAX",
    "Wind_Speed_STD",
    "Wind_Speed_WVT",
    "Wind_Direction_WVT",
    "Soil_Temperature",
    "Soil_Electrical_Conductivity",
]


def load_feature_columns() -> list[str]:
    with open(MODELS_DIR / "feature_columns.json", "r", encoding="utf-8") as f:
        return json.load(f)

def detect_header_row(df_preview: pd.DataFrame) -> int | None:
    """
    Detect the row index that contains the real column headers.
    We use TIMESTAMP as the main marker.
    """
    for i in range(min(len(df_preview), 10)):
        row_values = df_preview.iloc[i].astype(str).str.strip().tolist()
        if "TIMESTAMP" in row_values:
            return i
    return None

def parse_raw_station_file(file_storage) -> pd.DataFrame:
    """
    Parse raw station uploads.

    Supports:
    - normal CSV/XLSX with headers on the first row
    - TOA5-style files where the real header row must be detected dynamically
    """
    filename = (file_storage.filename or "").lower()

    if filename.endswith(".xlsx") or filename.endswith(".xls"):
        preview = pd.read_excel(file_storage, header=None)
        file_storage.stream.seek(0)

        header_row = detect_header_row(preview)
        if header_row is None:
            raise ValueError("Could not find the header row containing TIMESTAMP in the uploaded Excel file.")

        # Data rows start after the two metadata rows following the real header
        df = pd.read_excel(file_storage, header=header_row, skiprows=[header_row + 1, header_row + 2])
        return df

    # CSV / TXT branch
    raw_text = file_storage.read().decode("utf-8", errors="replace")
    file_storage.stream.seek(0)

    preview = pd.read_csv(StringIO(raw_text), header=None, nrows=10)
    header_row = detect_header_row(preview)
    if header_row is None:
        raise ValueError("Could not find the header row containing TIMESTAMP in the uploaded CSV file.")

    df = pd.read_csv(StringIO(raw_text), header=header_row, skiprows=[header_row + 1, header_row + 2])
    return df


def validate_raw_columns(df: pd.DataFrame) -> None:
    missing_cols = [col for col in RAW_REQUIRED_COLUMNS if col not in df.columns]
    if missing_cols:
        raise ValueError(
            f"Raw input is missing required columns: {missing_cols}"
        )


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    df["hour"] = df["TIMESTAMP"].dt.hour
    df["month"] = df["TIMESTAMP"].dt.month
    df["dayofweek"] = df["TIMESTAMP"].dt.dayofweek
    df["dayofyear"] = df["TIMESTAMP"].dt.dayofyear
    df["is_weekend"] = (df["dayofweek"] >= 5).astype(int)

    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)

    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)

    df["dayofyear_sin"] = np.sin(2 * np.pi * df["dayofyear"] / 365)
    df["dayofyear_cos"] = np.cos(2 * np.pi * df["dayofyear"] / 365)

    return df


def add_lag_features(df: pd.DataFrame, target_col: str = "Air_Temperature") -> pd.DataFrame:
    df = df.copy()

    lag_hours = [1, 3, 6, 12, 24]
    for lag in lag_hours:
        df[f"{target_col}_lag{lag}"] = df[target_col].shift(lag)

    return df


def add_rolling_features(df: pd.DataFrame, target_col: str = "Air_Temperature") -> pd.DataFrame:
    df = df.copy()

    rolling_windows = [3, 6, 12, 24]
    for window in rolling_windows:
        df[f"{target_col}_roll_mean_{window}"] = df[target_col].rolling(window=window).mean()
        df[f"{target_col}_roll_std_{window}"] = df[target_col].rolling(window=window).std()

    return df


def preprocess_raw_dataframe(df_raw: pd.DataFrame) -> pd.DataFrame:
    df = df_raw.copy()

    validate_raw_columns(df)

    df["TIMESTAMP"] = pd.to_datetime(df["TIMESTAMP"], errors="raise")
    df = df.sort_values("TIMESTAMP").reset_index(drop=True)

    # Convert all required numeric columns except TIMESTAMP
    numeric_cols = [col for col in RAW_REQUIRED_COLUMNS if col != "TIMESTAMP"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Drop rows where key raw values are missing
    df = df.dropna(subset=numeric_cols).reset_index(drop=True)

    if len(df) < 24:
        raise ValueError(
            "Raw input does not contain enough valid hourly rows. At least 24 recent rows are required."
        )

    df = add_time_features(df)
    df = add_lag_features(df, target_col="Air_Temperature")
    df = add_rolling_features(df, target_col="Air_Temperature")

    return df


def prepare_latest_model_input_from_raw(df_raw: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    feature_columns = load_feature_columns()
    df_features = preprocess_raw_dataframe(df_raw)

    missing_needed = [col for col in feature_columns if col not in df_features.columns]
    if missing_needed:
        raise ValueError(
            f"After preprocessing, these required model columns are still missing: {missing_needed}"
        )

    df_features = df_features.dropna(subset=feature_columns).reset_index(drop=True)

    if df_features.empty:
        raise ValueError(
            "No valid model row could be created. Upload more recent hourly rows so lag and rolling features can be computed."
        )

    latest_row = df_features.iloc[[-1]].copy()
    latest_timestamp = str(latest_row.iloc[0]["TIMESTAMP"])

    X_latest = latest_row[feature_columns].copy()

    for col in feature_columns:
        X_latest[col] = pd.to_numeric(X_latest[col], errors="raise")

    return X_latest, latest_timestamp