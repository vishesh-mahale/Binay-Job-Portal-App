"""Parity guard against test_parser.py, the designated known-good backup.

test_parser.py is a standalone snapshot of the resume-parsing logic that was verified
working against live Gemini. The production copy in app/api/v1/task_handlers.py must not
drift from it. Every assertion here compares the two files directly, so editing either one
without the other fails this suite.
"""
from __future__ import annotations

import ast
import os
import sys
from typing import Any, Dict, Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

WORKER_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BACKUP = os.path.join(WORKER_ROOT, "test_parser.py")
PRODUCTION = os.path.join(WORKER_ROOT, "app", "api", "v1", "task_handlers.py")

pytestmark = pytest.mark.skipif(
    not os.path.exists(BACKUP), reason="test_parser.py backup is not present"
)

HELPERS = [
    "_widen_date",
    "_normalize_url",
    "_filter_skills",
    "_normalize_gender",
    "_clean_nulls",
    "_infer_edu_start_date",
    "_normalize_tech_list",
]


def _tree(path: str) -> ast.Module:
    with open(path, encoding="utf-8") as handle:
        return ast.parse(handle.read())


def _constants(path: str, names: set) -> Dict[str, Any]:
    """Pull module-level constants, plus the handler-local system_prompt/response_schema."""
    found: Dict[str, Any] = {}
    for node in ast.walk(_tree(path)):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in names:
                    try:
                        found[target.id] = ast.literal_eval(node.value)
                    except ValueError:
                        pass
    return found


def _isolate(path: str, names: set) -> Dict[str, Any]:
    """Exec only the named top-level defs, so the backup's module-level .env/SDK imports
    and the production module's FastAPI app never load."""
    keep = []
    for node in _tree(path).body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names:
            keep.append(node)
        elif isinstance(node, ast.Assign):
            if any(isinstance(t, ast.Name) and t.id in names for t in node.targets):
                keep.append(node)
    namespace: Dict[str, Any] = {"Optional": Optional, "Any": Any, "Dict": dict, "List": list}
    exec(compile(ast.fix_missing_locations(ast.Module(body=keep, type_ignores=[])), path, "exec"), namespace)
    return namespace


# ── 1. Prompt and schema ────────────────────────────────────────────────────

def test_system_prompt_is_identical_to_backup():
    backup = _constants(BACKUP, {"SYSTEM_PROMPT"})["SYSTEM_PROMPT"]
    production = _constants(PRODUCTION, {"system_prompt"})["system_prompt"]
    assert production == backup, (
        "system_prompt in task_handlers.py has drifted from SYSTEM_PROMPT in test_parser.py"
    )


def test_response_schema_is_identical_to_backup():
    backup = _constants(BACKUP, {"RESPONSE_SCHEMA"})["RESPONSE_SCHEMA"]
    production = _constants(PRODUCTION, {"response_schema"})["response_schema"]
    assert production == backup, (
        "response_schema in task_handlers.py has drifted from RESPONSE_SCHEMA in "
        "test_parser.py; Gemini constrained decoding will accept a different shape"
    )


def test_link_type_stays_constrained_to_the_backup_enum():
    schema = _constants(PRODUCTION, {"response_schema"})["response_schema"]
    assert schema["properties"]["links"]["items"]["properties"]["link_type"]["enum"] == [
        "linkedin", "github", "portfolio", "certificate", "personal", "other",
    ]


def test_false_skill_positives_are_identical_to_backup():
    assert _isolate(BACKUP, {"_FALSE_SKILL_POSITIVES"})["_FALSE_SKILL_POSITIVES"] == \
        _isolate(PRODUCTION, {"_FALSE_SKILL_POSITIVES"})["_FALSE_SKILL_POSITIVES"]


# ── 2. Helper behaviour ─────────────────────────────────────────────────────
# The two copies differ cosmetically (docstrings, `val` vs `raw`, if/elif vs
# if+return None). Compare behaviour, not source text.

DATE_INPUTS: list = ["", "   ", None, 123, True, ["2020"], {"a": 1},
                     "null", "None", "N/A", "na", "undefined", "Present",
                     "2020 - 2023", "Jan 2020-Feb 2021", "Summer 2021", "March 2023 to Present",
                     "01-March-2023", "2017- B.E", "B.Tech (2017)", "2020/13/45", "00/00/2020"]
for _year in (2000, 2020, 2021, 2024):
    for _a, _b in ((1, 1), (3, 4), (4, 3), (13, 5), (5, 13), (31, 2), (29, 2), (0, 0), (32, 12)):
        for _sep in ("/", "-", "."):
            DATE_INPUTS += [f"{_a}{_sep}{_b}{_sep}{_year}", f"{_year}{_sep}{_b}{_sep}{_a}"]
        DATE_INPUTS += [f"{_year}-{_b:02d}-{_a:02d}", str(_year), f"{_year}01", f"{_year}13",
                        f"{_year}/3", f"{_year}-11", f"3/{_year}", f"13/{_year}"]
    for _m in ("jan", "March", "december", "xyz", ""):
        DATE_INPUTS += [f"{_m} {_year}", f"{_m}, {_year}", f"01 {_m} {_year}", f"15 {_m}, {_year}"]

URL_INPUTS: list = ["", "   ", None, 123, ["a"], True,
                    "null", "None", "n/a", "NA", "undefined",
                    "https://x.com", "HTTP://X.com", "http://x.com", "Https://X.com/a?b=c",
                    "x.com", "www.x.com", "linkedin.com/in/foo", "//cdn.x.com/a", "not a url",
                    "mailto:a@b.com", "tel:+123", "ftp://x.com", "javascript:alert(1)", "https://"]

SKILL_INPUTS: list = [[{"name": n} for n in combo] for combo in (
    ["Rust"], ["rust"], ["Dart"], ["Swift"], ["R"], ["Go"], ["Objective-C"],
    ["Spring Boot"], ["Go lang"], ["Argo CD"], ["Node.js"], ["C++"], ["a/b"], ["Python"],
    [""], ["   "], [None], ["Rust", "Spring Boot"], ["Go", "Argo CD"], ["R", "Python"],
)]
SKILL_INPUTS += [[{"name": "X", "proficiency_level": 7}], [{"name": "X", "years_of_experience": 3.5}],
                 [{}], []]

GENDER_INPUTS: list = ["male", "Male", "M", "m.", "man", "female", "F", "woman", "non-binary",
                       "non_binary", "transgender", "other", "prefer_not_to_say", "", "  ",
                       None, "x", 123, ["m"], True]

CLEAN_INPUTS: list = [None, "", "null", "None", "n/a", "NA", "undefined", " x ", "ok", 0, False,
                      [], {}, [None, "null", "x"], {"a": None, "b": "null", "c": {"d": "n/a"}},
                      [{"a": "null"}], 3.5]

EDU_INPUTS: list = [(s, e, d)
                    for s in (None, "", "2019", "2019-08-01", "08/2019", "null", "xyz")
                    for e in (None, "", "2023", "2023-05-01", "05/2023", "null", "xyz")
                    for d in ("B.Tech", "B.E", "B.Sc", "M.Tech", "MBA", "12th", "10th",
                              "High School", "Diploma", "", None)]

TECH_INPUTS: list = [None, "", "a,b", "a, b ,c", ["a", "b"], ["a,b", "c"], ["a", None, 123],
                     "null", ["null", "x"], ["n/a"], 123, {}, [], [" x ", ""],
                     "Python, Java,, Kotlin", ["JAVA, AWS cloud, Spring Boot"]]


@pytest.mark.parametrize("helper,inputs", [
    ("_widen_date", DATE_INPUTS),
    ("_normalize_url", URL_INPUTS),
    ("_normalize_gender", GENDER_INPUTS),
    ("_clean_nulls", CLEAN_INPUTS),
    ("_normalize_tech_list", TECH_INPUTS),
])
def test_helper_matches_backup(helper: str, inputs: list):
    backup = _isolate(BACKUP, set(HELPERS) | {"_FALSE_SKILL_POSITIVES"})
    production = _isolate(PRODUCTION, set(HELPERS) | {"_FALSE_SKILL_POSITIVES"})
    for value in inputs:
        assert production[helper](value) == backup[helper](value), (
            f"{helper}({value!r}) differs from test_parser.py"
        )


def test_filter_skills_matches_backup():
    backup = _isolate(BACKUP, set(HELPERS) | {"_FALSE_SKILL_POSITIVES"})
    production = _isolate(PRODUCTION, set(HELPERS) | {"_FALSE_SKILL_POSITIVES"})
    for value in SKILL_INPUTS:
        assert production["_filter_skills"](value) == backup["_filter_skills"](value), (
            f"_filter_skills({value!r}) differs from test_parser.py"
        )


def test_infer_edu_start_date_matches_backup():
    backup = _isolate(BACKUP, set(HELPERS) | {"_FALSE_SKILL_POSITIVES"})
    production = _isolate(PRODUCTION, set(HELPERS) | {"_FALSE_SKILL_POSITIVES"})
    for start, end, degree in EDU_INPUTS:
        assert production["_infer_edu_start_date"](start, end, degree) == \
            backup["_infer_edu_start_date"](start, end, degree), (
                f"_infer_edu_start_date({start!r}, {end!r}, {degree!r}) differs from test_parser.py"
            )


# ── 3. Generation config ────────────────────────────────────────────────────
# test_parser.py reads GEMINI_TEMPERATURE / GEMINI_MAX_TOKENS from .env and passes both
# to GenerateContentConfig. The handler must do the same: vertexai.generate_structured
# otherwise falls back to a hardcoded temperature of 0.0 and the settings are dead.

def test_resume_parse_passes_generation_config_from_settings():
    handler = next(
        n for n in ast.walk(_tree(PRODUCTION))
        if isinstance(n, ast.AsyncFunctionDef) and n.name == "handle_resume_parse_task"
    )
    call = next(
        n.value for n in ast.walk(handler)
        if isinstance(n, ast.Await) and isinstance(n.value, ast.Call)
        and getattr(n.value.func, "attr", None) == "generate_structured"
    )
    passed = {kw.arg: ast.unparse(kw.value) for kw in call.keywords}
    assert passed.get("temperature") == "settings.GEMINI_TEMPERATURE", (
        f"generate_structured temperature is {passed.get('temperature')!r}; test_parser.py "
        "sends GEMINI_TEMPERATURE, so production would silently run at the provider default"
    )
    assert passed.get("max_tokens") == "settings.GEMINI_MAX_TOKENS", (
        f"generate_structured max_tokens is {passed.get('max_tokens')!r}; test_parser.py "
        "sends GEMINI_MAX_TOKENS"
    )
