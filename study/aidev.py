#!/usr/bin/env python3
"""Turn the AIDev dataset (agent-authored GitHub pull requests) into a study config.

    pip install pandas pyarrow huggingface_hub
    python study/aidev.py --out study/aidev.json --max-repos 40 --per-repo 5
    node study/run.mjs --config study/aidev.json --out study-out

Picks pull requests that edit both code and tests in Python / JavaScript /
TypeScript repositories, preferring bug fixes, and writes one config entry per
repository with the PR numbers and the agent that opened each one.

The dataset's table and column names are resolved defensively; if a name is
not found the script prints the columns it did find, so a schema change is a
one-line fix here.
"""

import argparse
import json
import re
import sys

import pandas as pd
from huggingface_hub import hf_hub_download

# Mirrors src/classify.ts: which paths are tests, which are environment.
TEST_RE = re.compile(
    r"(^|/)test_[^/]*\.py$|(^|/)[^/]*_test\.py$|\.(test|spec)\.[cm]?[jt]sx?$|(^|/)__tests__/|(^|/)tests?/"
)
ENV_RE = re.compile(
    r"(^|/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|pyproject\.toml|setup\.py|setup\.cfg|tox\.ini|"
    r"pytest\.ini|poetry\.lock|uv\.lock|requirements[^/]*\.txt|tsconfig[^/]*\.json)$|(^|/)\.github/"
)
CODE_RE = re.compile(r"\.(py|[cm]?[jt]sx?)$")
FIX_RE = re.compile(r"^(fix|bugfix|hotfix)\b|\bfix(es|ed)?\b|\bbug\b", re.I)
RUNNER = {"Python": "python", "TypeScript": "js", "JavaScript": "js"}


def load(dataset, name):
    path = hf_hub_download(repo_id=dataset, filename=name, repo_type="dataset")
    return pd.read_parquet(path)


def pick(df, table, *candidates):
    for c in candidates:
        if c in df.columns:
            return c
    sys.exit(f"{table}: none of {candidates} in columns {list(df.columns)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="hao-li/AIDev")
    ap.add_argument("--out", default="study/aidev.json")
    ap.add_argument("--max-repos", type=int, default=40)
    ap.add_argument("--per-repo", type=int, default=5)
    ap.add_argument("--all-types", action="store_true", help="keep features too, not only fixes")
    args = ap.parse_args()

    prs = load(args.dataset, "pull_request.parquet")
    repos = load(args.dataset, "repository.parquet")
    files = load(args.dataset, "pr_commit_details.parquet")
    try:
        types = load(args.dataset, "pr_task_type.parquet")
    except Exception:  # Optional table: fall back to the title.
        types = None

    pr_id = pick(prs, "pull_request", "id", "pr_id")
    pr_num = pick(prs, "pull_request", "number", "pr_number")
    pr_repo = pick(prs, "pull_request", "repo_id", "repository_id")
    pr_agent = pick(prs, "pull_request", "agent")
    pr_title = pick(prs, "pull_request", "title")
    pr_created = pick(prs, "pull_request", "created_at")
    repo_id = pick(repos, "repository", "id", "repo_id")
    repo_name = pick(repos, "repository", "full_name", "name")
    repo_lang = pick(repos, "repository", "language")
    f_pr = pick(files, "pr_commit_details", "pr_id", "pull_request_id")
    f_name = pick(files, "pr_commit_details", "filename", "file", "path")

    # Both tables have an "id": rename the repository side so the merge keeps the PR's.
    repo_cols = repos[[repo_id, repo_name, repo_lang]].rename(
        columns={repo_id: "_repo_key", repo_name: "_repo_name", repo_lang: "_repo_lang"}
    )
    df = prs.merge(repo_cols, left_on=pr_repo, right_on="_repo_key")
    repo_name, repo_lang = "_repo_name", "_repo_lang"
    df = df[df[repo_lang].isin(RUNNER.keys())]

    if not args.all_types:
        if types is not None:
            t_id = pick(types, "pr_task_type", "id", "pr_id")
            t_type = pick(types, "pr_task_type", "type", "task_type")
            fixes = set(types.loc[types[t_type].astype(str).str.lower().eq("fix"), t_id])
            df = df[df[pr_id].isin(fixes)]
        else:
            df = df[df[pr_title].astype(str).str.contains(FIX_RE)]

    # Keep PRs that edit code and tests: only those can be proven or not.
    by_pr = files.groupby(f_pr)[f_name].apply(list)

    def edits_code_and_tests(pid):
        names = by_pr.get(pid, [])
        tests = any(TEST_RE.search(n) and CODE_RE.search(n) for n in names)
        code = any(CODE_RE.search(n) and not TEST_RE.search(n) and not ENV_RE.search(n) for n in names)
        return tests and code

    df = df[df[pr_id].map(edits_code_and_tests)]
    df = df.sort_values(pr_created, ascending=False)

    counts = df.groupby(repo_name).size().sort_values(ascending=False)
    config = []
    for name in counts.index[: args.max_repos]:
        rows = df[df[repo_name] == name].head(args.per_repo)
        lang = rows[repo_lang].iloc[0]
        entry = {
            "name": name.replace("/", "__"),
            "url": f"https://github.com/{name}",
            "runner": RUNNER[lang],
            "history": False,
            "prs": [{"number": int(r[pr_num]), "agent": str(r[pr_agent])} for _, r in rows.iterrows()],
            "maxPulls": args.per_repo,
            "setup": "auto",
            "timeoutMin": 10,
        }
        if RUNNER[lang] == "js":
            entry["python"] = False
        config.append(entry)

    with open(args.out, "w") as fh:
        json.dump(config, fh, indent=2)
    total = sum(len(c["prs"]) for c in config)
    print(f"{total} pull requests from {len(config)} repositories -> {args.out}")


if __name__ == "__main__":
    main()
