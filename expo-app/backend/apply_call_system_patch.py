#!/usr/bin/env python3
"""
Removes the old notification / call-signalling code from app.py and wires in
call_system.py + push.py.

    python apply_call_system_patch.py            # patches ./app.py
    python apply_call_system_patch.py path/to/app.py --dry-run

A backup is written next to the file (app.py.bak-<timestamp>) and the result is
compiled before it is saved. Nothing is written if anything looks unexpected.
"""
import argparse
import ast
import os
import py_compile
import shutil
import sys
import tempfile
import time

# Top-level functions (with their decorators) to delete.
REMOVE_FUNCTIONS = [
    "initialize_firebase", "init_firebase_global",
    "send_fcm_notification", "send_call_notification", "send_message_notification",
    "decline_call_http",
    "register_fcm_token", "unregister_fcm_token",
    "send_test_notification", "test_call_notification",
    "handle_initiate_video_call_with_notification", "handle_call_accepted",
    "handle_call_declined", "handle_end_video_call",
    "handle_connect", "handle_disconnect",
]
# Module-level statements to delete.
REMOVE_IMPORT_MODULES = {"firebase_admin", "expo_push"}
REMOVE_ASSIGN_NAMES = {"FIREBASE_ENABLED", "FIREBASE_AVAILABLE"}
REMOVE_CALLS = {"init_firebase_global"}

REPLACEMENTS = [
    ("send_message_notification(", "call_system.notify_new_message("),
]

WIRING = '''
# ============================================================================
# CALLS + PUSH NOTIFICATIONS  (call_system.py, push.py)
# Registered last so its socket handlers (connect, disconnect, call events)
# are the only ones in effect.
# ============================================================================
from call_system import register_call_system  # noqa: E402

call_system = register_call_system(
    app, db, socketio, User, FCMToken,
    active_connections=active_connections,
    user_rooms=user_rooms,
)

'''


def node_range(node):
    start = min([node.lineno] + [d.lineno for d in getattr(node, "decorator_list", [])])
    return start, node.end_lineno


def is_firebase_try(node):
    if not isinstance(node, ast.Try):
        return False
    for stmt in node.body:
        if isinstance(stmt, (ast.Import, ast.ImportFrom)):
            names = [a.name for a in stmt.names] if isinstance(stmt, ast.Import) else [stmt.module or ""]
            if any(n.split(".")[0] == "firebase_admin" for n in names):
                return True
    return False


def plan(source):
    tree = ast.parse(source)
    ranges, found = [], set()
    main_line = None
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in REMOVE_FUNCTIONS:
            ranges.append(node_range(node))
            found.add(node.name)
        elif isinstance(node, ast.Import) and all(a.name.split(".")[0] in REMOVE_IMPORT_MODULES for a in node.names):
            ranges.append(node_range(node))
        elif isinstance(node, ast.ImportFrom) and (node.module or "").split(".")[0] in REMOVE_IMPORT_MODULES:
            ranges.append(node_range(node))
        elif isinstance(node, ast.Assign) and all(isinstance(t, ast.Name) and t.id in REMOVE_ASSIGN_NAMES
                                                  for t in node.targets):
            ranges.append(node_range(node))
        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and \
                isinstance(node.value.func, ast.Name) and node.value.func.id in REMOVE_CALLS:
            ranges.append(node_range(node))
        elif is_firebase_try(node):
            ranges.append(node_range(node))
        elif isinstance(node, ast.If) and "__main__" in ast.unparse(node.test):
            main_line = node.lineno
    return ranges, found, main_line


def apply(source):
    if "register_call_system" in source:
        raise SystemExit("app.py already contains register_call_system — already patched.")
    ranges, found, main_line = plan(source)
    if main_line is None:
        raise SystemExit("Could not find `if __name__ == '__main__':` in app.py.")
    lines = source.splitlines(keepends=True)
    drop = set()
    for start, end in ranges:
        drop.update(range(start, end + 1))
        # also drop the comment block that introduces it (comments / blank lines
        # directly above, up to the previous line of code)
        i = start - 1
        while i >= 1 and i not in drop and (lines[i - 1].strip() == "" or lines[i - 1].lstrip().startswith("#")):
            if lines[i - 1].lstrip().startswith("#"):
                drop.add(i)
            i -= 1

    out = []
    for n, line in enumerate(lines, start=1):
        if n == main_line:
            out.append(WIRING)
        if n not in drop:
            out.append(line)
    patched = "".join(out)
    # collapse the blank runs left behind (3+ blank lines -> 2)
    import re
    patched = re.sub(r"\n(?:[ \t]*\n){3,}", "\n\n\n", patched)
    for old, new in REPLACEMENTS:
        patched = patched.replace(old, new)

    # Nothing may still reference the removed names.
    tree = ast.parse(patched)
    removed = set(REMOVE_FUNCTIONS) | REMOVE_ASSIGN_NAMES | {"fcm_messaging", "is_expo_token", "send_expo_push"}
    dangling = sorted({n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and n.id in removed})
    if dangling:
        raise SystemExit(f"Refusing to write: app.py still references removed names: {dangling}")
    return patched, found, ranges


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", default="app.py")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with open(args.path, encoding="utf-8") as f:
        source = f.read()
    patched, found, ranges = apply(source)

    missing = [n for n in REMOVE_FUNCTIONS if n not in found]
    print(f"Removed {len(ranges)} blocks; functions removed: {len(found)}/{len(REMOVE_FUNCTIONS)}")
    for n in missing:
        print(f"  (not present, skipped) {n}")

    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as tmp:
        tmp.write(patched)
    try:
        py_compile.compile(tmp.name, doraise=True)
    finally:
        os.unlink(tmp.name)
    print("Patched file compiles.")

    if args.dry_run:
        print("Dry run — nothing written.")
        return
    backup = f"{args.path}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(args.path, backup)
    with open(args.path, "w", encoding="utf-8", newline="") as f:
        f.write(patched)
    print(f"Wrote {args.path} (backup: {backup})")

    old = os.path.join(os.path.dirname(os.path.abspath(args.path)), "expo_push.py")
    if os.path.exists(old):
        shutil.move(old, old + ".removed")
        print("Renamed expo_push.py -> expo_push.py.removed (replaced by push.py)")


if __name__ == "__main__":
    sys.exit(main())
