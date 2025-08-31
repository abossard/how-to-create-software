#!/bin/bash
# 🚀 OpenTelemetry Aspire Dashboard Launcher
# This script opens the Aspire observability dashboard in your default browser

DASHBOARD_URL="http://localhost:18888"

echo "🎯 Opening OpenTelemetry Aspire Dashboard..."
echo "📍 URL: $DASHBOARD_URL"

# Check if dashboard is accessible
if curl -s --connect-timeout 5 "$DASHBOARD_URL" > /dev/null 2>&1; then
    echo "✅ Dashboard is running!"
    
    # Try to open in browser (works on most systems)
    if command -v xdg-open > /dev/null; then
        xdg-open "$DASHBOARD_URL"
    elif command -v open > /dev/null; then
        open "$DASHBOARD_URL"
    elif command -v start > /dev/null; then
        start "$DASHBOARD_URL"
    else
        echo "🌐 Please open this URL manually in your browser:"
        echo "   $DASHBOARD_URL"
    fi
else
    echo "❌ Dashboard is not accessible. Make sure the otel_python stack is running:"
    echo "   docker compose up -d"
fi