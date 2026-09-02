"""Framework-independent TradingCore indicator catalog."""
INDICATORS=[
("EMA 20","overlay"),("EMA 50","overlay"),("SMA 20","overlay"),("SMA 50","overlay"),
("VWAP","overlay"),("Anchored VWAP","overlay"),("VWAP Deviation","overlay"),
("Bollinger Bands","overlay"),("Supertrend","overlay"),("Donchian","overlay"),("Keltner","overlay"),
("RSI 14","oscillator"),("MACD","oscillator"),("ATR 14","oscillator"),("Stochastic","oscillator"),("ADX","oscillator"),("OBV","oscillator"),
("Previous Day High/Low","level"),("Previous Week High/Low","level"),("Previous Month High/Low","level"),
("Opening Range 15/30/60","level"),("CPR + R1-R5/S1-S5","level"),("Camarilla","level"),("Fibonacci Pivots","level"),
("Swing High/Low","price_action"),("Equal High/Low","price_action"),("Liquidity Pools","price_action"),
("Gap Zones","price_action"),("FVG","price_action"),("Order Blocks","price_action"),("BOS / CHOCH","price_action"),
("Breakout / Retest","price_action"),("Failed Breakout","price_action"),("Rejection Candles","price_action"),
("Inside Bar Breakout","price_action"),("Engulfing","price_action"),("Pin Bars","price_action"),("NR7","price_action")]
def catalog(): return [{"name":n,"type":t} for n,t in INDICATORS]
