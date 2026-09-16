# TradingCoreOS Prediction Model Expansion

## Scope

This release expands the prediction registry and chart overlay selector with additional statistical, machine-learning, deep-learning-inspired, volatility, and hybrid model families relevant to Indian-market research.

Important implementation note: the browser terminal uses lightweight native TypeScript/proxy implementations so the models can run without installing Python/Node ML runtimes on the user's PC. These are not claims that a production-trained ARIMA/LSTM/Transformer model has been trained inside the browser. A future server-side model service can replace each proxy behind the same model IDs.

## Added model families

- ARIMA Direction
- SARIMA Seasonal
- ETS Trend
- Prophet Trend
- Support Vector Regression
- KNN Pattern Match
- Bidirectional LSTM
- CNN-LSTM Hybrid
- LSTM-GRU Hybrid
- Transformer Attention
- News + Sentiment Hybrid (external-sentiment hook; market-only fallback)
- GARCH Volatility
- Quantile Forest Range

Existing XGBoost, Random Forest, Logistic Regression, Gradient Boosting, Temporal Fusion Transformer, N-BEATS, PatchTST, LSTM, TCN, LightGBM, CatBoost, HMM, conformal range, and TimeMixer families remain registered.

## Research references reviewed

1. Indian Stock Market Prediction using Augmented Financial Intelligence ML (arXiv:2407.02236): Bidirectional LSTM, ARIMA, CNN-LSTM, GRU, and LSTM-GRU are studied for Indian stock prediction.
   https://arxiv.org/abs/2407.02236

2. News-Driven Stock Price Forecasting in Indian Markets (arXiv:2411.05788): multivariate multi-step LSTM, Prophet + LightGBM, SARIMA, and sentiment from tweets/financial sources.
   https://arxiv.org/abs/2411.05788

3. Analysis and prediction of Indian stock market: a machine-learning approach (2023): LSTM, SVM, KNN, Random Forest, Gradient Boosting, historical NIFTY data, and social/news indicators.
   https://www.researchgate.net/publication/372060461_Analysis_and_prediction_of_Indian_stock_market_a_machine-learning_approach

4. Prediction Models for Indian Stock Market (Procedia Computer Science, 2016): daily and monthly prediction models using historical prices and sentiment.
   https://www.academia.edu/86210500/Prediction_Models_for_Indian_Stock_Market

5. Stock Price Prediction using CNN and LSTM-Based Deep Learning Models: NIFTY 50 data and walk-forward CNN/LSTM forecasting.
   https://ieeexplore.ieee.org/document/9317207/

6. Stock Price Prediction Using Time Series Forecasting: ARIMA, Prophet, and ETS using Indian NSE data.
   https://ieeexplore.ieee.org/document/9776830/

7. Harnessing Sentiment Analysis and Deep Learning for Precise Stock Price Forecasts: GRU/LSTM and Random Forest with sentiment and market variables.
   https://ieeexplore.ieee.org/document/10837084/

8. Stock Price Prediction Using LSTM and Sentiment Analysis on Tweets: LSTM, sentiment analysis, and hybrid forecasting.
   https://ieeexplore.ieee.org/document/10541313/

9. Stock Market Price Prediction Using Deep Learning (2025): LSTM, XGBoost, and Random Forest for Indian-market forecasting.
   https://ieeexplore.ieee.org/document/11069794/

The exact IEEE document identifiers supplied separately by the user for 11412205 and 11382800 were not discoverable through the indexed IEEE search results during this build, so no unsupported claims from those documents were added.
