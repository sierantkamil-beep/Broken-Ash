"""
Runs animation requests one at a time (the trial plan allows a single job in flight) and saves each
direction's frames into tools/pixellab/src/<key>/<anim>/<direction>/.

  python tools/pixellab/queue.py <key> <anim> <character_id> '<extra json>' dir1 dir2 ...

A direction whose folder already has frames is skipped, so a rerun never pays twice.
"""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from api import call, log, wait

HERE = os.path.dirname(os.path.abspath(__file__))
key, anim, cid, extra = sys.argv[1:5]
group = None
for d in sys.argv[5:]:
    out = os.path.join(HERE, "src", key, anim, d)
    if os.path.isdir(out) and os.listdir(out):
        print("skip", d, flush=True)
        continue
    body = {"character_id": cid, "animation_name": f"{key}_{anim}", "directions": [d], **json.loads(extra)}
    if group:
        body["animation_group_id"] = group
    res = call("POST", "/characters/animations", body)
    log(f"{key}_{anim}", {"body": {k: v for k, v in body.items() if k != "target_palette"}, "response": res})
    group = res.get("animation_group_id", group)
    job = res["background_job_ids"][0]
    print(d, "job", job, flush=True)
    subprocess.run([sys.executable, os.path.join(HERE, "save_job.py"), job, key, anim, d], check=True)
print(json.dumps(call("GET", "/balance")["subscription"]), flush=True)
