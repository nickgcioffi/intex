#!/usr/bin/env bash
set -euo pipefail
: "${ARTIFACT_BUCKET:?Set ARTIFACT_BUCKET}"
: "${VERSION:?Set VERSION}"
[[ "$ARTIFACT_BUCKET" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || { echo 'Invalid ARTIFACT_BUCKET; wait for stack outputs and configure it' >&2; exit 1; }
export AWS_DEFAULT_REGION=us-east-2
export AWS_REGION=us-east-2
export AWS_PAGER=''
[[ "$VERSION" =~ ^[a-zA-Z0-9._-]{1,100}$ ]] || { echo 'Invalid release version' >&2; exit 1; }
app=intex
environment=intex-dev
key="releases/$VERSION.zip"
# Do not race another deployment or silently overwrite an existing version.
status="$(aws elasticbeanstalk describe-environments --environment-names "$environment" --query 'Environments[0].Status' --output text)"
[[ "$status" == Ready ]] || { echo "Environment is $status; expected Ready" >&2; exit 1; }
aws s3 cp dist/application.zip "s3://$ARTIFACT_BUCKET/$key" --only-show-errors
aws elasticbeanstalk create-application-version --application-name "$app" --version-label "$VERSION" \
  --source-bundle "S3Bucket=$ARTIFACT_BUCKET,S3Key=$key" --description "INTEX release $VERSION"
previous="$(aws elasticbeanstalk describe-environments --environment-names "$environment" --query 'Environments[0].VersionLabel' --output text)"
printf 'Previous version: %s\nNew version: %s\n' "$previous" "$VERSION"
# Wait for Ready + exact version + Green, then exercise the actual HTTP application.
deployment_started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
aws elasticbeanstalk update-environment --environment-name "$environment" --version-label "$VERSION" --output json > dist/update.json
for attempt in $(seq 1 90); do
  aws elasticbeanstalk describe-environments --environment-names "$environment" --output json > dist/environment.json
  if node --input-type=module - "$VERSION" <<'JS'
import fs from 'node:fs';
const e = JSON.parse(fs.readFileSync('dist/environment.json')).Environments[0];
process.exit(e?.Status === 'Ready' && e.VersionLabel === process.argv[2] && e.Health === 'Green' ? 0 : 1);
JS
  then
    endpoint="$(node --input-type=module -e "import fs from 'node:fs'; console.log('http://' + JSON.parse(fs.readFileSync('dist/environment.json')).Environments[0].CNAME)")"
    node scripts/verify-health.mjs "$endpoint" "$VERSION"
    printf 'Deployed %s to %s\n' "$VERSION" "$endpoint"
    exit 0
  fi
  # API acceptance is not deployment success: surface asynchronous service denials.
  aws elasticbeanstalk describe-events --environment-name "$environment" --start-time "$deployment_started" --severity ERROR --output json > dist/errors.json
  if ! node --input-type=module <<'JS'
import fs from 'node:fs';
const events = JSON.parse(fs.readFileSync('dist/errors.json')).Events || [];
for (const event of events) console.error(event.Message);
process.exit(events.length ? 1 : 0);
JS
  then
    echo 'Beanstalk reported a deployment error; inspect the emitted events.' >&2
    exit 1
  fi
  sleep 10
done
echo 'Deployment did not become Ready/Green with the expected version. Inspect events; use documented rollback.' >&2
aws elasticbeanstalk describe-events --environment-name "$environment" --max-records 20 --output table
exit 1
