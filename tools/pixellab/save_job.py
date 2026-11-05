"""Saves a finished animation job's frames: save_job.py <job_id> <key> <anim> <direction>
into tools/pixellab/src/<key>/<anim>/<direction>/<n>.png (the layout pack.py reads)."""
import base64, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from api import wait

job, key, anim, direction = sys.argv[1:5]
j = wait(job)
if j.get("status") != "completed":
    raise SystemExit(f"{job}: {j.get('status')} {str(j)[:500]}")
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", key, anim, direction)
os.makedirs(out, exist_ok=True)
for i, im in enumerate(j["last_response"]["images"]):
    with open(os.path.join(out, f"{i}.png"), "wb") as f:
        f.write(base64.b64decode(im["base64"]))
print(out, len(j["last_response"]["images"]), "frames, used", j.get("usage"))
