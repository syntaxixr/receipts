"""pytest plugin loaded by receipts: records one outcome per test item as JSON.

Loaded with `-p receipts_pytest`; the output path comes from RECEIPTS_PYTEST_OUT.
Reports are read in pytest_runtest_logreport, which also fires in the
controlling process under pytest-xdist, so `-n auto` in a project's addopts
still yields every result.

Each finished test is appended as one JSON line right away, so when a run is
killed for hanging (a fix for a hang: the old code never returns), the tests
that did finish keep their results.
"""

import json
import os
import sys

_root = None
_config = None


def _trim(text, limit=4000):
    text = str(text)
    return text if len(text) <= limit else text[-limit:]


def pytest_configure(config):
    global _root, _config
    _config = config
    _root = str(getattr(config, "rootpath", None) or config.rootdir)


def _emit(record):
    out = os.environ.get("RECEIPTS_PYTEST_OUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record) + "\n")


def pytest_collectreport(report):
    if report.failed and not hasattr(_config, "workerinput"):
        _emit(
            {
                "type": "collectError",
                "path": os.path.abspath(str(report.fspath)) if report.fspath else None,
                "nodeid": report.nodeid,
                "detail": _trim(report.longrepr),
            }
        )


def pytest_runtest_logreport(report):
    # Only the controlling process writes: under xdist, workers forward their
    # reports to it and would otherwise record every test twice.
    if hasattr(_config, "workerinput"):
        return
    fspath, _lineno, domain = report.location
    # "TestClass.test_name[param]" or "test_name[param]": drop the parameters,
    # keep the innermost class.
    parts = domain.split("[", 1)[0].split(".")
    record = {
        "type": "result",
        "nodeid": report.nodeid,
        "when": report.when,
        "path": os.path.abspath(os.path.join(_root or os.getcwd(), fspath)),
        "cls": parts[-2] if len(parts) > 1 else None,
        "name": parts[-1],
        "outcome": "failed" if report.failed else "skipped" if report.skipped else "passed",
        "detail": _trim(report.longrepr) if report.failed else "",
    }
    _emit(record)


def pytest_sessionfinish(session, exitstatus):
    # Every process (xdist workers included) reports which files it imported,
    # so receipts can tell when the code under test came from site-packages
    # instead of the checkout it is swapping.
    files = set()
    for module in list(sys.modules.values()):
        path = getattr(module, "__file__", None)
        if path and path.endswith(".py"):
            files.add(os.path.realpath(path))
    _emit({"type": "modules", "files": sorted(files)})
    if not hasattr(session.config, "workerinput"):
        _emit({"type": "end", "exitstatus": int(exitstatus)})
