"""Tests for ``DATABASE_URL`` normalization."""

from tunde_agent.config.database_url import engine_connect_args, normalize_database_url


def test_normalize_mysql_scheme_adds_pymysql() -> None:
    assert normalize_database_url("mysql://user:pass@db:3306/app") == "mysql+pymysql://user:pass@db:3306/app"


def test_normalize_mariadb_scheme_adds_pymysql() -> None:
    assert normalize_database_url("mariadb://u:p@h/db") == "mysql+pymysql://u:p@h/db"


def test_explicit_mysql_driver_unchanged() -> None:
    url = "mysql+mysqlconnector://user:pass@db:3306/app"
    assert normalize_database_url(url) == url


def test_postgresql_unchanged() -> None:
    url = "postgresql://tunde_app:pw@localhost:5433/tunde"
    assert normalize_database_url(url) == url


def test_strips_whitespace() -> None:
    assert normalize_database_url("  mysql://x:y@h/d  ") == "mysql+pymysql://x:y@h/d"


def test_engine_connect_args_mysql_charset() -> None:
    assert engine_connect_args("mysql+pymysql://u:p@h/d") == {"charset": "utf8mb4"}


def test_engine_connect_args_postgres_empty() -> None:
    assert engine_connect_args("postgresql://u:p@h/d") == {}
