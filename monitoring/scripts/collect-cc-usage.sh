#!/bin/bash
# Claude Code Usage Collector
# Collects usage metrics and pushes to Prometheus Pushgateway
#
# Usage: ./collect-cc-usage.sh [pushgateway_url]
# Default pushgateway URL: http://localhost:9091
#
# Run via cron: */15 * * * * /path/to/collect-cc-usage.sh
# Or daily:     0 0 * * * /path/to/collect-cc-usage.sh

set -e

PUSHGATEWAY_URL="${1:-http://localhost:9091}"
JOB_NAME="claude_code_usage"
INSTANCE="${HOSTNAME:-local}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Check if claude CLI is available
if ! command -v claude &> /dev/null; then
    error "Claude CLI not found. Please install Claude Code first."
    exit 1
fi

log "Collecting Claude Code usage metrics..."

# Get usage data from Claude CLI
# The output format is a table with Date, Models, Input, Output, Cost columns
USAGE_OUTPUT=$(claude usage 2>/dev/null || echo "")

if [ -z "$USAGE_OUTPUT" ]; then
    error "Failed to get Claude Code usage data"
    exit 1
fi

# Parse the usage output and extract metrics
# Initialize accumulators
TOTAL_INPUT=0
TOTAL_OUTPUT=0
TOTAL_COST=0
DAYS_COUNT=0

# Temporary file for metrics
METRICS_FILE=$(mktemp)

cat << EOF > "$METRICS_FILE"
# HELP claude_code_input_tokens_total Total input tokens used
# TYPE claude_code_input_tokens_total gauge
# HELP claude_code_output_tokens_total Total output tokens used
# TYPE claude_code_output_tokens_total gauge
# HELP claude_code_cost_usd_total Total cost in USD
# TYPE claude_code_cost_usd_total gauge
# HELP claude_code_active_days_total Number of active usage days
# TYPE claude_code_active_days_total gauge
# HELP claude_code_daily_input_tokens Daily input tokens
# TYPE claude_code_daily_input_tokens gauge
# HELP claude_code_daily_output_tokens Daily output tokens
# TYPE claude_code_daily_output_tokens gauge
# HELP claude_code_daily_cost_usd Daily cost in USD
# TYPE claude_code_daily_cost_usd gauge
# HELP claude_code_last_collection_timestamp Unix timestamp of last collection
# TYPE claude_code_last_collection_timestamp gauge
EOF

# Parse each line of the usage output
# Expected format: Date | Models | Input | Output | Cost
while IFS= read -r line; do
    # Skip header lines and separators
    if [[ "$line" =~ ^[│├┌└─┬┴┼┐┘┤] ]] || [[ "$line" =~ "Date" ]] || [[ -z "$line" ]]; then
        continue
    fi

    # Extract date (format: YYYY MM-DD or similar)
    if [[ "$line" =~ ([0-9]{4})[[:space:]]+([0-9]{2}-[0-9]{2}) ]]; then
        YEAR="${BASH_REMATCH[1]}"
        MONTH_DAY="${BASH_REMATCH[2]}"
        DATE="${YEAR}-${MONTH_DAY}"

        # Extract numbers from the line
        # Input tokens (with comma separators)
        if [[ "$line" =~ ([0-9,]+)[[:space:]]+│[[:space:]]+([0-9,]+)[[:space:]]+│[[:space:]]+\$([0-9.]+) ]]; then
            INPUT=$(echo "${BASH_REMATCH[1]}" | tr -d ',')
            OUTPUT=$(echo "${BASH_REMATCH[2]}" | tr -d ',')
            COST="${BASH_REMATCH[3]}"

            # Add to totals
            TOTAL_INPUT=$((TOTAL_INPUT + INPUT))
            TOTAL_OUTPUT=$((TOTAL_OUTPUT + OUTPUT))
            TOTAL_COST=$(echo "$TOTAL_COST + $COST" | bc)
            DAYS_COUNT=$((DAYS_COUNT + 1))

            # Convert date to Unix timestamp for the label
            DATE_LABEL=$(echo "$DATE" | tr '-' '_')

            # Add daily metrics
            echo "claude_code_daily_input_tokens{date=\"$DATE\"} $INPUT" >> "$METRICS_FILE"
            echo "claude_code_daily_output_tokens{date=\"$DATE\"} $OUTPUT" >> "$METRICS_FILE"
            echo "claude_code_daily_cost_usd{date=\"$DATE\"} $COST" >> "$METRICS_FILE"
        fi
    fi

    # Check for total line
    if [[ "$line" =~ "Total" ]]; then
        # Try to extract totals from the Total line
        if [[ "$line" =~ ([0-9,]+)[[:space:]]*…?[[:space:]]+│[[:space:]]+([0-9,]+)[[:space:]]*…?[[:space:]]+│[[:space:]]+\$([0-9.]+) ]]; then
            TOTAL_INPUT=$(echo "${BASH_REMATCH[1]}" | tr -d ',…')
            TOTAL_OUTPUT=$(echo "${BASH_REMATCH[2]}" | tr -d ',…')
            TOTAL_COST="${BASH_REMATCH[3]}"
        fi
    fi
done <<< "$USAGE_OUTPUT"

# Add total metrics
echo "claude_code_input_tokens_total $TOTAL_INPUT" >> "$METRICS_FILE"
echo "claude_code_output_tokens_total $TOTAL_OUTPUT" >> "$METRICS_FILE"
echo "claude_code_cost_usd_total $TOTAL_COST" >> "$METRICS_FILE"
echo "claude_code_active_days_total $DAYS_COUNT" >> "$METRICS_FILE"
echo "claude_code_last_collection_timestamp $(date +%s)" >> "$METRICS_FILE"

log "Parsed metrics:"
log "  Total Input Tokens:  $TOTAL_INPUT"
log "  Total Output Tokens: $TOTAL_OUTPUT"
log "  Total Cost:          \$$TOTAL_COST"
log "  Active Days:         $DAYS_COUNT"

# Push to Pushgateway
log "Pushing metrics to Pushgateway at $PUSHGATEWAY_URL..."

if curl -s --data-binary @"$METRICS_FILE" "$PUSHGATEWAY_URL/metrics/job/$JOB_NAME/instance/$INSTANCE" > /dev/null 2>&1; then
    log "Metrics pushed successfully!"
else
    error "Failed to push metrics to Pushgateway"
    rm -f "$METRICS_FILE"
    exit 1
fi

# Cleanup
rm -f "$METRICS_FILE"

log "Collection complete!"
