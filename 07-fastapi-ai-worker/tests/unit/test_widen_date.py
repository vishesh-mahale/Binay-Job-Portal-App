"""Tests for _widen_date() and _normalize_url() from task_handlers."""
import sys
import os
import inspect

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from app.api.v1.task_handlers import _widen_date, _normalize_url


class TestWidenDate:
    def test_none_returns_none(self):
        assert _widen_date(None) is None

    def test_empty_string_returns_none(self):
        assert _widen_date("") is None

    def test_whitespace_returns_none(self):
        assert _widen_date("   ") is None

    def test_exact_iso_date_passthrough(self):
        assert _widen_date("2021-05-15") == "2021-05-15"

    def test_year_only(self):
        assert _widen_date("2020") == "2020-01-01"

    def test_year_month_dash(self):
        assert _widen_date("2021-05") == "2021-05-01"

    def test_year_month_single_digit(self):
        assert _widen_date("2021-5") == "2021-05-01"

    def test_year_month_slash(self):
        assert _widen_date("2020/05") == "2020-05-01"

    def test_month_name_year(self):
        assert _widen_date("May 2021") == "2021-05-01"

    def test_month_name_year_lowercase(self):
        assert _widen_date("jan 2020") == "2020-01-01"

    def test_month_name_year_abbreviated(self):
        assert _widen_date("Sep 2019") == "2019-09-01"

    def test_month_name_with_comma(self):
        assert _widen_date("May, 2021") == "2021-05-01"

    def test_dd_mm_yyyy_slash(self):
        assert _widen_date("15/05/2021") == "2021-05-15"

    def test_dd_mm_yyyy_dash(self):
        assert _widen_date("15-05-2021") == "2021-05-15"

    def test_mm_dd_yyyy_slash(self):
        assert _widen_date("05/15/2021") == "2021-05-15"

    def test_mm_dd_ambiguous_defaults_to_dd_mm(self):
        assert _widen_date("05/06/2021") == "2021-06-05"

    def test_invalid_day_for_month(self):
        assert _widen_date("31/02/2021") is None

    def test_mm_slash_yyyy(self):
        assert _widen_date("05/2021") == "2021-05-01"

    def test_mm_dash_yyyy(self):
        assert _widen_date("05-2020") == "2020-05-01"

    def test_unparseable_returns_none(self):
        assert _widen_date("5+ years") is None
        assert _widen_date("ongoing") is None
        assert _widen_date("Summer 2021") is None
        assert _widen_date("FY 2020-21") is None

    def test_non_string_returns_none(self):
        assert _widen_date(2020) is None


class TestNormalizeUrl:
    def test_already_has_https(self):
        assert _normalize_url("https://example.com") == "https://example.com"

    def test_already_has_http(self):
        assert _normalize_url("http://example.com") == "http://example.com"

    def test_uppercase_scheme_lowercased(self):
        assert _normalize_url("HTTP://UPPER.com") == "http://UPPER.com"

    def test_bare_domain_gets_https(self):
        assert _normalize_url("linkedin.com/in/foo") == "https://linkedin.com/in/foo"

    def test_www_gets_https(self):
        assert _normalize_url("www.github.com/x") == "https://www.github.com/x"

    def test_mailto_dropped(self):
        assert _normalize_url("mailto:a@b.com") is None

    def test_none_passthrough(self):
        assert _normalize_url(None) is None

    def test_empty_dropped(self):
        assert _normalize_url("") is None
        assert _normalize_url("   ") is None

    def test_null_placeholder_strings_dropped(self):
        for placeholder in ("null", "None", "N/A", "NA", "na", "NULL"):
            assert _normalize_url(placeholder) is None

    def test_widen_date_rejects_null_placeholder_strings(self):
        for placeholder in ("null", "None", "N/A", "NA", "na"):
            assert _widen_date(placeholder) is None


class TestMarkCompletedSignature:
    def test_mark_completed_has_status_param(self):
        from app.repositories.parsing_job_repo import ResumeParsingJobRepository
        sig = inspect.signature(ResumeParsingJobRepository.mark_completed)
        assert "status" in sig.parameters
        assert sig.parameters["status"].default == "completed"

    def test_mark_failed_has_retryable_param(self):
        from app.repositories.parsing_job_repo import ResumeParsingJobRepository
        sig = inspect.signature(ResumeParsingJobRepository.mark_failed)
        assert "retryable" in sig.parameters
        assert sig.parameters["retryable"].default is False
