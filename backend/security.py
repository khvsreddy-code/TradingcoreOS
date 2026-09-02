"""Security primitives: encrypted secrets, bounded rate limiting and hardened responses."""
from __future__ import annotations
import os,time,hashlib,secrets,threading
from collections import defaultdict,deque
from cryptography.fernet import Fernet
from fastapi import HTTPException,Request
_raw=os.getenv("TOKEN_ENCRYPTION_KEY")
if _raw:
    try: _fernet=Fernet(_raw.encode())
    except Exception: raise RuntimeError("TOKEN_ENCRYPTION_KEY must be a valid Fernet key")
else:
    _fernet=None
if os.getenv("TRADINGCORE_REQUIRE_ENCRYPTION","0")=="1" and not _fernet:
    raise RuntimeError("TOKEN_ENCRYPTION_KEY is required")
class RateLimiter:
    def __init__(self,max_keys=20000): self._hits=defaultdict(deque); self._last={}; self._lock=threading.Lock(); self.max_keys=max_keys
    def check(self,key,limit=120,window=60):
        now=time.monotonic()
        with self._lock:
            q=self._hits[key]; self._last[key]=now
            while q and now-q[0]>window:q.popleft()
            if len(q)>=limit: raise HTTPException(429,"Too many requests; retry shortly")
            q.append(now)
            if len(self._hits)>self.max_keys:
                for k,_ in sorted(self._last.items(),key=lambda x:x[1])[:max(1,len(self._hits)-self.max_keys)]: self._hits.pop(k,None);self._last.pop(k,None)
limiter=RateLimiter()
def client_key(r:Request):
    # Trust proxy headers only when explicitly enabled.
    if os.getenv("TRADINGCORE_TRUST_PROXY","0")=="1":
        x=r.headers.get("x-forwarded-for","").split(",")[0].strip()
        if x:return x
    return r.client.host if r.client else "unknown"
def encrypt(v):
    if not _fernet:return v
    return _fernet.encrypt(v.encode()).decode()
def decrypt(v):
    if not _fernet:return v
    return _fernet.decrypt(v.encode()).decode()
def token_fingerprint(v):return hashlib.sha256(v.encode()).hexdigest()[:12]
def opaque_id():return secrets.token_urlsafe(32)
def security_headers(response):
    h={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store, private'}
    if os.getenv('TRADINGCORE_HTTPS','0')=='1':h['Strict-Transport-Security']='max-age=31536000; includeSubDomains'
    response.headers.update(h)
    if os.getenv('TRADINGCORE_ENABLE_CSP','1')=='1':response.headers['Content-Security-Policy']="default-src 'self'; connect-src 'self' ws: wss:; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
