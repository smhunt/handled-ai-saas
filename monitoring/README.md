# Handled Monitoring Stack

Prometheus + Grafana monitoring for Claude Code usage tracking.

## Quick Start

```bash
# Start the monitoring stack
docker-compose --profile monitoring up -d

# Access Grafana
open http://localhost:3003
# Default login: admin / handled123
```

## Components

| Service | Port | Description |
|---------|------|-------------|
| Prometheus | 9090 | Time-series metrics database |
| Grafana | 3003 | Visualization dashboards |
| Pushgateway | 9091 | Push endpoint for batch metrics |

## Collecting Claude Code Usage

Run the collector script to push metrics to Prometheus:

```bash
# Manual collection
./monitoring/scripts/collect-cc-usage.sh

# With custom Pushgateway URL
./monitoring/scripts/collect-cc-usage.sh http://your-pushgateway:9091
```

### Automated Collection (Cron)

Add to crontab for automatic collection:

```bash
# Every 15 minutes
*/15 * * * * /path/to/handled-ai-saas/monitoring/scripts/collect-cc-usage.sh

# Daily at midnight
0 0 * * * /path/to/handled-ai-saas/monitoring/scripts/collect-cc-usage.sh
```

## Metrics Collected

| Metric | Type | Description |
|--------|------|-------------|
| `claude_code_input_tokens_total` | gauge | Total input tokens used |
| `claude_code_output_tokens_total` | gauge | Total output tokens used |
| `claude_code_cost_usd_total` | gauge | Total cost in USD |
| `claude_code_active_days_total` | gauge | Number of active usage days |
| `claude_code_daily_input_tokens{date="..."}` | gauge | Daily input tokens |
| `claude_code_daily_output_tokens{date="..."}` | gauge | Daily output tokens |
| `claude_code_daily_cost_usd{date="..."}` | gauge | Daily cost in USD |
| `claude_code_last_collection_timestamp` | gauge | Unix timestamp of last collection |

## Grafana Dashboards

Pre-configured dashboard available at:
- **Claude Code Usage** - Token usage, costs, and daily breakdown

### Dashboard Features

- Total cost, input tokens, output tokens stats
- Daily cost bar chart with color thresholds
- Token usage over time (line chart)
- Token distribution (pie chart)
- Daily usage details table

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAFANA_ADMIN_USER` | admin | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | handled123 | Grafana admin password |
| `GRAFANA_ROOT_URL` | http://localhost:3003 | Grafana public URL |

### Data Retention

Prometheus is configured to retain data for 90 days. Adjust in `docker-compose.yml`:

```yaml
command:
  - '--storage.tsdb.retention.time=90d'
```

## Troubleshooting

### Metrics not showing in Grafana

1. Check Pushgateway has metrics: http://localhost:9091/metrics
2. Check Prometheus targets: http://localhost:9090/targets
3. Verify collector ran successfully: `./collect-cc-usage.sh`

### Grafana can't connect to Prometheus

Ensure both containers are on the same network:

```bash
docker network ls
docker network inspect handled-network
```
