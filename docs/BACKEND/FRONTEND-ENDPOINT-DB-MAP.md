# Frontend Endpoint DB Map

This document lists frontend-consumed analytics/health endpoints and the backend read source used by each endpoint.

Legend:
- `Postgres only`: reads from Postgres only
- `ClickHouse or Postgres fallback`: tries ClickHouse first when flag is enabled, falls back to Postgres on disabled/unavailable/error (unless strict mode)
- `Hybrid`: endpoint combines data paths where some parts may use ClickHouse and others use Postgres

## Engagement / Dashboard / Monetization / Level Funnel

| Endpoint | Used by | DB source | Flag / Notes |
|---|---|---|---|
| `/api/analytics/events` | Live Events page | ClickHouse or Postgres fallback | `ANALYTICS_READ_EVENTS_FROM_CLICKHOUSE` |
| `/api/analytics/dashboard` | Dashboard summary cards | ClickHouse or Postgres fallback | `ANALYTICS_READ_DASHBOARD_FROM_CLICKHOUSE` |
| `/api/analytics/metrics/retention` | Dashboard + analytics retention views | ClickHouse or Postgres fallback | `ANALYTICS_READ_RETENTION_FROM_CLICKHOUSE` |
| `/api/analytics/retention/cohorts` | Dashboard retention chart | ClickHouse or Postgres fallback | Proxies to retention metrics controller |
| `/api/analytics/metrics/active-users` | Dashboard active users chart | ClickHouse or Postgres fallback | `ANALYTICS_READ_ACTIVE_USERS_FROM_CLICKHOUSE` |
| `/api/analytics/metrics/playtime` | Dashboard playtime chart | ClickHouse or Postgres fallback | `ANALYTICS_READ_PLAYTIME_FROM_CLICKHOUSE` |
| `/api/analytics/filters/options` | Analytics filters + Level Funnel filters | ClickHouse or Postgres fallback | `ANALYTICS_READ_FILTER_OPTIONS_FROM_CLICKHOUSE` |
| `/api/analytics/cohort/retention` | Engagement analytics | ClickHouse or Postgres fallback | `ANALYTICS_READ_COHORT_FROM_CLICKHOUSE` |
| `/api/analytics/cohort/playtime` | Engagement analytics | ClickHouse or Postgres fallback | `ANALYTICS_READ_COHORT_FROM_CLICKHOUSE` |
| `/api/analytics/cohort/session-count` | Engagement analytics | ClickHouse or Postgres fallback | `ANALYTICS_READ_COHORT_FROM_CLICKHOUSE` |
| `/api/analytics/cohort/session-length` | Engagement analytics | ClickHouse or Postgres fallback | `ANALYTICS_READ_COHORT_FROM_CLICKHOUSE` |
| `/api/analytics/cohort/avg-completed-levels` | Engagement analytics | ClickHouse or Postgres fallback | `ANALYTICS_READ_COHORT_FROM_CLICKHOUSE` |
| `/api/analytics/cohort/avg-reached-level` | Engagement analytics | ClickHouse or Postgres fallback | `ANALYTICS_READ_COHORT_FROM_CLICKHOUSE` |
| `/api/analytics/metrics/monetization-cohorts` | Monetization tab | ClickHouse or Postgres fallback | `ANALYTICS_READ_MONETIZATION_COHORTS_FROM_CLICKHOUSE` |
| `/api/analytics/metrics/revenue-summary` | Monetization summary cards | ClickHouse or Postgres fallback | `ANALYTICS_READ_REVENUE_SUMMARY_FROM_CLICKHOUSE` |
| `/api/analytics/level-funnel` | Level Funnel dashboard | ClickHouse or Postgres fallback | `ANALYTICS_READ_LEVEL_FUNNEL_FROM_CLICKHOUSE` |

## Health & Errors

| Endpoint | Used by | DB source | Flag / Notes |
|---|---|---|---|
| `/api/games/:gameId/health/metrics` | Health tab cards + top errors | ClickHouse or Postgres fallback | `ANALYTICS_READ_HEALTH_FROM_CLICKHOUSE` |
| `/api/games/:gameId/health/timeline` | Health error timeline chart | ClickHouse or Postgres fallback | `ANALYTICS_READ_HEALTH_FROM_CLICKHOUSE` |
| `/api/games/:gameId/health/crashes` | Health recent error logs | ClickHouse or Postgres fallback | `ANALYTICS_READ_HEALTH_FROM_CLICKHOUSE` |
| `/api/games/:gameId/health/error-instances` | Health error details modal/tooltip | ClickHouse or Postgres fallback | `ANALYTICS_READ_HEALTH_FROM_CLICKHOUSE` |

## Unmatched Frontend Calls (currently)

| Frontend-called endpoint | Status |
|---|---|
| `/api/games/:gameId/health/filter-options` | No matching backend route found in current `games/health` routes |
| `/api/analytics/users` | No matching backend analytics route found |

## Related Strict Mode

If strict mode is enabled:
- `ANALYTICS_CLICKHOUSE_STRICT=true`

Then ClickHouse read failures do not fall back and endpoint request can fail instead.
