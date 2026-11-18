# Dormant foundation until INTEX

INTEX starts **November 30, 2026**. The GitHub → OIDC → Beanstalk pipeline has
already passed a real deployment. The application server does not need to keep
running before the project starts.

`EnvironmentEnabled=false` removes the live environment and its health alarm while
preserving the foundation. The parameter defaults to `true` for compatibility with
existing deployments; dormancy must be requested explicitly. Nothing automatically
provisions paid resources on November 30.

## What persists

- Repository, PR validation, deployment/health workflow definitions and CDK source.
- OIDC trust, IAM roles/instance profile, VPC/subnets/security groups.
- Beanstalk application and application-version history.
- Encrypted, versioned source-artifact bucket and rollback ZIPs.
- Confirmed SNS subscription and regional cost budget.

The running EC2 instance, its root EBS volume, public Elastic IP, environment-managed
Auto Scaling/launch-template resources, health alarm and temporary environment logs
are removed. The old endpoint stops serving traffic. There is no database to remove.
The shared regional Beanstalk service bucket and CougarCalc resources are preserved.
Retained artifact storage can still incur small charges; prior usage and unrelated
AWS charges remain billable.

## Enter dormancy — owner approval required

Use the approved account `600138214348`, region `us-east-2`, stack `IntexPipeline`.
Do not execute the resource-removal change set without owner approval.

1. Verify identity and ensure no deployment is running. Disable live automation:

   ```bash
   gh variable set DEPLOY_ENABLED --repo nickgcioffi/intex --body false
   gh variable delete APP_URL --repo nickgcioffi/intex
   ```

   PR/main validation still runs. The deployment and scheduled HTTP jobs skip while
   `DEPLOY_ENABLED` is false. Clear the old URL because recreation may change it.

2. Synthesize and prepare an unexecuted change set:

   ```bash
   npm ci --prefix infra
   npm --prefix infra run check
   npm --prefix infra test
   npm --prefix infra run synth
   aws cloudformation deploy --stack-name IntexPipeline --region us-east-2 \
     --template-file infra/cdk.out/IntexPipeline.template.json \
     --capabilities CAPABILITY_IAM --no-execute-changeset \
     --parameter-overrides EnvironmentEnabled=false RuntimeEnvironmentId=unconfigured
   ```

   The CLI preserves other existing parameters. Review the generated change set:
   expected removals are `Environment` and `HealthAlarm`; the deployment role's inline
   policy changes to an unconfigured environment binding. There must be no removal
   of IAM roles, the artifact bucket, VPC, SNS subscription, budget or application.

3. After explicit owner approval, execute that change set and wait for stack update
   completion. Verify the EC2 instance is terminated, root disk and Elastic IP are
   gone, and the environment is terminated. Verify the preserved resources remain.
   Environment deletion also deletes its temporary CloudWatch log groups under the
   existing `DeleteOnTerminate=true` configuration.

Keep the application, its versions, artifact bucket and shared regional service
bucket. This is a controlled environment removal inside the existing stack, not a
whole-stack teardown or a direct EC2 stop.

## Activate on or before November 30 — owner approval required

Allow time for AWS environment creation and a deployment; avoid leaving activation
until the last minute. An authorized operator should:

1. Review [operations preflight](OPERATIONS.md), verify AWS identity/permissions,
   confirm the pinned Node.js platform is still available and approve renewed
   compute/storage/IPv4 charges. Keep `DEPLOY_ENABLED=false` during provisioning.
2. Recreate the environment with the same reviewed CDK template:

   ```bash
   npm ci --prefix infra
   npm --prefix infra run synth
   aws cloudformation deploy --stack-name IntexPipeline --region us-east-2 \
     --template-file infra/cdk.out/IntexPipeline.template.json \
     --capabilities CAPABILITY_IAM \
     --parameter-overrides EnvironmentEnabled=true RuntimeEnvironmentId=unconfigured
   ```

   Wait for the stack update to finish. The initial application is AWS's sample.
3. Bind the deployment policy to the newly allocated environment ID:

   ```bash
   runtime_environment_id="$(aws elasticbeanstalk describe-environments \
     --environment-names intex-dev --region us-east-2 \
     --query 'Environments[0].EnvironmentId' --output text)"
   aws cloudformation deploy --stack-name IntexPipeline --region us-east-2 \
     --template-file infra/cdk.out/IntexPipeline.template.json \
     --capabilities CAPABILITY_IAM \
     --parameter-overrides EnvironmentEnabled=true RuntimeEnvironmentId="$runtime_environment_id"
   ```

   Confirm the ID is a real `e-...` value, not `None`; do not reuse the terminated ID.
4. Read the new CNAME and update GitHub:

   ```bash
   application_cname="$(aws elasticbeanstalk describe-environments \
     --environment-names intex-dev --region us-east-2 \
     --query 'Environments[0].CNAME' --output text)"
   gh variable set APP_URL --repo nickgcioffi/intex --body "http://$application_cname"
   gh variable set DEPLOY_ENABLED --repo nickgcioffi/intex --body true
   gh workflow run deploy.yml --repo nickgcioffi/intex --ref main
   ```

   Existing account, deploy-role ARN and artifact-bucket variables remain valid
   because those foundation resources were retained.
5. Follow the workflow through successful OIDC authentication, Ready/Green and exact
   `/health` release verification. Verify scheduled health checks and CloudWatch
   logging resume. No RDS is provisioned by activation.

For context, the tested active configuration costs approximately $13–17/month
before credits/tax/variable usage. Dormancy removes its EC2/root-disk/public-IPv4 and
health-alarm costs; small retained-storage charges can remain. See [cost details and
teardown procedures](OPERATIONS.md).
