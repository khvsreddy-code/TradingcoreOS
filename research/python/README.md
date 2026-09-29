# CoreSpirit Python Research Client

The intended workflow is:

```python
from tradingcore import CoreSpiritClient

client = CoreSpiritClient(transport)

model = client.load("NiftyMomentum")

data = client.market.history(
    symbol="NIFTY",
    timeframe="5m",
)

result = model.replay(data)

print(result.metrics())
print(result.signals())
print(result.equity_curve())
```

The production contract remains independent of Python.

Python is a research client that talks to the artifact/replay/model services. It does not embed the broker layer and it does not submit orders.
