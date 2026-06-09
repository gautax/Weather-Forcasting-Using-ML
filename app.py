from flask import Flask, jsonify, render_template, request
from io import StringIO
import pandas as pd
from src.predict import load_metadata, predict_next_24h
from src.raw_preprocess import parse_raw_station_file, prepare_latest_model_input_from_raw
from src.utils import make_forecast_long_format, summarize_forecast


app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True


@app.route("/")
def home():
    metadata = load_metadata()
    return render_template("index.html", metadata=metadata)


@app.route("/predict", methods=["POST"])
def predict():
    try:
        if "file" not in request.files:
            return jsonify({"success": False, "error": "No file uploaded."}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"success": False, "error": "Empty filename."}), 400

        input_mode = request.form.get("input_mode", "engineered")

        if input_mode == "raw":
            df_uploaded = parse_raw_station_file(file)
            x_input, base_timestamp = prepare_latest_model_input_from_raw(df_uploaded)
        else:
            content = file.read().decode("utf-8")
            df_uploaded = pd.read_csv(StringIO(content))

            base_timestamp = None

            if "TIMESTAMP" in df_uploaded.columns:
                base_timestamp = str(df_uploaded.iloc[0]["TIMESTAMP"])
                df_uploaded = df_uploaded.drop(columns=["TIMESTAMP"])

            x_input = df_uploaded.copy()

        forecast_df = predict_next_24h(x_input)
        forecast_long = make_forecast_long_format(forecast_df, base_timestamp=base_timestamp)
        summary = summarize_forecast(forecast_df)

        return jsonify({
            "success": True,
            "summary": summary,
            "forecast": forecast_long.to_dict(orient="records"),
            "base_timestamp": base_timestamp,
            "input_mode": input_mode
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=False, use_reloader=False)
