#!/bin/bash
# Run this locally (not from cloud) to fetch Smartraveller data
# Smartraveller blocks all datacenter/cloud IPs
# Usage: ./scripts/fetch-australia.sh

set -e
OUTPUT="data/australia-advisories.json"
URL="https://www.smartraveller.gov.au/destinations-export"

echo "Fetching Smartraveller data..."
RAW=$(curl -s -L "$URL" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -H "Accept: application/json")

if [ -z "$RAW" ] || [ "$RAW" = "[]" ]; then
  echo "ERROR: Could not fetch data. Are you running this from a residential IP?"
  exit 1
fi

echo "$RAW" | python3 -c "
import json, sys
data = json.load(sys.stdin)
out = []
for d in data:
    iso2 = (d.get('iso2') or d.get('iso') or d.get('country_code') or '').upper()
    level = d.get('advisory_level') or d.get('level') or d.get('overall_advisory_level') or 0
    if not iso2 or not level: continue
    summary = (d.get('summary') or '')
    import re
    summary = re.sub(r'<[^>]+>', ' ', summary).strip()[:300]
    out.append({
        'iso2': iso2,
        'level': level,
        'summary': summary,
        'url': d.get('url', ''),
        'updatedAt': d.get('updated_at') or d.get('last_updated') or None
    })
print(f'Found {len(out)} advisories')
with open('$OUTPUT', 'w') as f:
    json.dump(out, f, indent=2)
print(f'Saved to $OUTPUT')
"

echo "Done! Now commit and push data/australia-advisories.json"
