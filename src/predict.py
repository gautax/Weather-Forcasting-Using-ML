import json
import joblib
import pandas as pd
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"


def load_model():
    return joblib.load(MODELS_DIR / "multioutput_xgb.pkl")


def load_feature_columns():
    with open(MODELS_DIR / "feature_columns.json", "r", encoding="utf-8") as f:
        return json.load(f)


def load_metadata():
    with open(MODELS_DIR / "metadata.json", "r", encoding="utf-8") as f:
        return json.load(f)


def prepare_input_dataframe(df_input: pd.DataFrame, feature_columns: list[str]) -> pd.DataFrame:
    missing_cols = [col for col in feature_columns if col not in df_input.columns]
    if missing_cols:
        raise ValueError(f"Missing required columns: {missing_cols}")

    df_prepared = df_input[feature_columns].copy()

    for col in feature_columns:
        df_prepared[col] = pd.to_numeric(df_prepared[col], errors="raise")

    return df_prepared


def predict_next_24h(df_input: pd.DataFrame) -> pd.DataFrame:
    model = load_model()
    feature_columns = load_feature_columns()

    df_prepared = prepare_input_dataframe(df_input, feature_columns)
    predictions = model.predict(df_prepared)

    forecast_cols = [f"t+{i}" for i in range(1, 25)]
    return pd.DataFrame(predictions, columns=forecast_cols)