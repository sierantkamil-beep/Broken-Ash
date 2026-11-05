"""
Thin client for PixelLab's REST API (v2), used to build the game's sprites.

Auth comes from the environment's network proxy, which injects the account's token into requests to
api.pixellab.ai: no key lives in this repo. Every paid call is logged with what it made into
tools/pixellab/ids.json, so assets can be re-downloaded for free and nothing is generated twice.

  python tools/pixellab/api.py balance
  python tools/pixellab/api.py post <endpoint> '<json body>' <label>   # e.g. create-character-v3
  python tools/pixellab/api.py job <background_job_id>
  python tools/pixellab/api.py character <character_id>
  python tools/pixellab/api.py zip <character_id> <out.zip>
"""
import json
import os
import sys
import time
import urllib.request

API = "https://api.pixellab.ai/v2"
IDS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ids.json")


def call(method, path, body=None, raw=False):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        # The proxy replaces this placeholder with the real token.
        headers={"Authorization": "Bearer proxy-injected", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{e.code} {path}: {e.read().decode()[:2000]}")
    return data if raw else json.loads(data)


def log(label, entry):
    ids = json.load(open(IDS)) if os.path.exists(IDS) else {}
    ids.setdefault(label, []).append(entry)
    with open(IDS, "w") as f:
        json.dump(ids, f, indent=2)


def wait(job_id, every=8, limit=1800):
    t0 = time.time()
    while time.time() - t0 < limit:
        j = call("GET", f"/background-jobs/{job_id}")
        if j.get("status") != "processing":
            return j
        time.sleep(every)
    raise SystemExit(f"job {job_id} still processing after {limit}s")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "balance":
        print(json.dumps(call("GET", "/balance")))
    elif cmd == "post":
        endpoint, body, label = sys.argv[2], json.loads(sys.argv[3]), sys.argv[4]
        res = call("POST", "/" + endpoint, body)
        log(label, {"endpoint": endpoint, "body": body, "response": res, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        print(json.dumps(res, indent=1)[:3000])
    elif cmd == "job":
        print(json.dumps(wait(sys.argv[2]), indent=1)[:4000])
    elif cmd == "character":
        print(json.dumps(call("GET", f"/characters/{sys.argv[2]}"), indent=1)[:6000])
    elif cmd == "zip":
        open(sys.argv[3], "wb").write(call("GET", f"/characters/{sys.argv[2]}/zip", raw=True))
        print("saved", sys.argv[3])
