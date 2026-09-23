# Applied recovery patches

## 001 — canonical production signaling origin

**Reason:** app v0.3.0 used the pre-rename Render hostname and therefore created/joined rooms on a different signaling deployment from the current website.

**Before**
`https://lunirascreen.onrender.com`

**After**
`https://lunira-screen.onrender.com`

Applied by `tools/patch_endpoint.py`, which deliberately requires exactly one legacy endpoint occurrence before changing the bundle.

Verification is performed by `tools/verify_frontend.py`.