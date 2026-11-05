"""
Fetches the MakeHuman assets the character pipeline uses into tools/art/.mh (gitignored).

MakeHuman's base mesh, skeleton, weights, targets and eyes are CC0 1.0 (see the MakeHuman repository's
LICENSE.ASSETS.md); we take only those folders with a sparse git checkout.

    python tools/art/mh_fetch.py
"""
import os
import shutil
import subprocess
import tempfile

REPO = "https://github.com/makehumancommunity/makehuman.git"
DEST = os.path.join(os.path.dirname(__file__), ".mh")
FOLDERS = ["3dobjs", "rigs", "targets/macrodetails", "targets/ears", "targets/head", "targets/torso", "targets/armslegs"]


def main():
    if os.path.exists(os.path.join(DEST, "3dobjs", "base.obj")):
        print("MakeHuman assets already in", DEST)
        return
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse", REPO, tmp], check=True)
        subprocess.run(["git", "-C", tmp, "sparse-checkout", "set", *[f"makehuman/data/{f}" for f in FOLDERS]], check=True)
        for f in FOLDERS:
            shutil.copytree(os.path.join(tmp, "makehuman", "data", f), os.path.join(DEST, f), dirs_exist_ok=True)
        for lic in ("LICENSE.ASSETS.md", "LICENSE.md"):
            src = os.path.join(tmp, lic)
            if os.path.exists(src):
                shutil.copy(src, DEST)
    print("MakeHuman assets in", DEST)


if __name__ == "__main__":
    main()
