# INTEX deployment operations

For the period before the November 30 project start, use the [dormancy and activation
runbook](DORMANCY.md). PR validation can run while the application environment is off.

## Ownership and approval boundaries

Repository: `nickgcioffi/intex`. Region: `us-east-2`. Stack: `IntexPipeline`.
Application: `intex`. Environment: `intex-dev`. Use a dedicated project AWS account
where possible. The implementation creates a dedicated VPC, subnets, security
groups, instance profile, service role, deployment role, S3 bucket, SNS topic,
CloudWatch health alarm and AWS Budget. It does not adopt or edit existing VPCs,
roles, databases or budgets. It requires no shared CDK bootstrap stack.

Obtain owner approval before creating paid resources, changing shared infrastructure,
merging infrastructure changes, deleting resources or performing rollback that may
lose application data. Application CI never deploys infrastructure. Review CDK and
CloudFormation changes separately with an authorized operator.

## Local development and onboarding

1. Clone this repository; create a feature branch and install Node.js 26 and npm.
2. Run `npm ci`, `npm run check`, `npm test`, `npm start`.
3. Request `http://localhost:5000/health`. Database access is not required.
4. Run `npm ci --prefix infra`, `npm --prefix infra run check`,
   `npm --prefix infra test`, `npm --prefix infra run synth` for infrastructure changes.
5. Open a pull request. Have another team member review changes before merging.
   Repository administrators should require the `validate` status check and one
   approval on `main`, and disallow force pushes. These settings are not silently
   changed by the implementation. Give students least-privilege access through
   institutional SSO/roles rather than sharing AWS root credentials or keys.

Dependencies are locked independently at the repository root and in `infra/`.
Dependabot proposes weekly npm and GitHub Actions updates. Actions are pinned to
commit SHAs. CI audits fail on high/critical advisories; review moderate advisories
as well. The current CDK package bundles a minimatch moderate DoS advisory; it is
in infrastructure tooling and does not ship in the application bundle. See validation.

## Preflight: verify AWS access independently

An authorized operator authenticates with the organization's existing AWS process.
This session used `aws login --profile intex` (AWS CLI >=2.32). Set:

```bash
export AWS_PROFILE=intex
export AWS_REGION=us-east-2
aws sts get-caller-identity
aws iam list-open-id-connect-providers
aws cloudformation list-stacks --region us-east-2
aws elasticbeanstalk describe-applications --application-names intex
aws elasticbeanstalk describe-environments --environment-names intex-dev
```

Confirm the intended account, absence of name collisions and permission to manage
the listed resources. IAM simulation is useful but does not prove every runtime
permission, quota or organization control. Never infer AWS access from GitHub access.

## Synthesize, review and provision (owner approval required)

The CDK TypeScript source is in `infra/stack.ts`. It uses only CloudFormation
resources, with a bootstrapless synthesizer; there is no `cdk bootstrap` step.

```bash
npm ci --prefix infra
npm --prefix infra run check
npm --prefix infra test
npm --prefix infra run synth
aws cloudformation validate-template \
  --template-body file://infra/cdk.out/IntexPipeline.template.json --region us-east-2
```

Inspect the synthesized template and create a non-executed CloudFormation change
set if required by your team. Expected provisioned resources are described above;
there must be no `AWS::RDS::DBInstance`, NAT gateway or load balancer. The template
pins the Node.js 26 AL2023 platform verified at implementation time. Before a later
rebuild, confirm it remains supported with `list-available-solution-stacks`; update
and review the pin if AWS retires it.

The `CreateOidcProvider` parameter defaults to `false` to reuse an existing account
provider without changing it. Set it to `true` only after confirming there is no
provider for `token.actions.githubusercontent.com`; creating it is an account-level
change requiring approval. New providers are retained on teardown to avoid breaking
future users of that account-wide identity provider.

After owner approval for an active environment, supply the alert recipient and execute:

```bash
aws cloudformation deploy --stack-name IntexPipeline \
  --template-file infra/cdk.out/IntexPipeline.template.json \
  --capabilities CAPABILITY_IAM --region us-east-2 \
  --parameter-overrides AlertEmail=YOUR_TEAM_EMAIL CreateOidcProvider=true EnvironmentEnabled=true
aws cloudformation describe-stacks --stack-name IntexPipeline \
  --region us-east-2 --query 'Stacks[0].Outputs'
```

Before enabling GitHub deployment, bind its runtime permissions to the newly
allocated environment ID (the default `unconfigured` fails closed):

```bash
runtime_environment_id="$(aws elasticbeanstalk describe-environments \
  --environment-names intex-dev --region us-east-2 \
  --query 'Environments[0].EnvironmentId' --output text)"
aws cloudformation deploy --stack-name IntexPipeline \
  --template-file infra/cdk.out/IntexPipeline.template.json \
  --capabilities CAPABILITY_IAM --region us-east-2 \
  --parameter-overrides RuntimeEnvironmentId="$runtime_environment_id"
```

For an existing stack, the CLI preserves other parameter values omitted from this
update. Confirm the ID is a real `e-...` value, not `None`. Rebind after an environment
rebuild. Only the deployment role policy changes; no database or extra instance is
created. Current environment binding: `e-8fetrwpb5e`.

On subsequent updates preserve `CreateOidcProvider=true` if this stack created it.
Changing the condition can orphan the retained provider; do not toggle it casually.
Keep the original alert email parameter for subsequent updates. Review a change set
before every infrastructure update; replacements may cause downtime. Confirm the
SNS email subscription. Initial stack creation serves the AWS sample application;
first deploy the project bundle using the CLI below or the reviewed main workflow.

## GitHub configuration and first deployment

Set repository **Actions variables**, not AWS access-key secrets:

| Variable | Value |
| --- | --- |
| `AWS_ACCOUNT_ID` | Approved target account ID |
| `AWS_DEPLOY_ROLE_ARN` | Stack output `DeployRoleArn` |
| `ARTIFACT_BUCKET` | Stack output `ArtifactBucket` |
| `APP_URL` | Stack output `Endpoint`, without trailing slash |
| `DEPLOY_ENABLED` | `true`, only after approved infrastructure is ready |

For example use `gh variable set ARTIFACT_BUCKET --body BUCKET_NAME` (same pattern
for the other values). Do not configure a GitHub Environment on the deployment job
without updating and reviewing the IAM subject: environments change the OIDC `sub`.

The trust policy requires audience `sts.amazonaws.com` and the exact immutable
repository subject verified using:

```bash
gh api repos/nickgcioffi/intex/actions/oidc/customization/sub
```

For this repository the allowed subject is:
`repo:nickgcioffi@206786338/intex@1460597852:ref:refs/heads/main`.
Forks, PR refs, feature branches and other repositories cannot assume this role.
The role can write `releases/*` in its artifact bucket and INTEX-only application
runtime paths in the regional service bucket, create INTEX application versions and
update `intex-dev`; it cannot create stacks, pass IAM roles, terminate environments or access future
database secrets. Beanstalk may update only its existing, environment-bound internal
stack with both INTEX tags and suspend/resume processes only on the matching tagged
Auto Scaling group. No EC2 launch/terminate or Auto Scaling resize permission is granted. Beanstalk also checks `s3:CreateBucket` and reasserts ownership controls on its exact
Ohio service bucket during updates, even when that bucket already exists. This is
an account/region-wide service bucket and can be shared with other applications.
Inspect its ownership, ACL, policy and contents before provisioning. Beanstalk may
add the INTEX instance role to its policy during environment creation; preserve all
other application grants and objects. Obtain explicit owner approval before allowing
shared bucket ownership/ACL/policy maintenance. Only add downstream actions actually
required by tested deployment, scoped to this exact bucket.
Runtime operations require bucket metadata/policy reads, ACL metadata reads and
read/write/ACL/cleanup access to the exact INTEX environment's `_runtime/` prefix
and central application paths containing `/intex/`. Source ZIPs in the dedicated
artifact bucket cannot be deleted by the deployment role. ACL metadata reads cover
the shared bucket, but object-body reads/writes/deletes on CougarCalc paths are not
granted. Internal stack diagnostics and updates require the exact environment ID
plus both `Project=intex` and `elasticbeanstalk:environment-name=intex-dev`.
Regional EC2/Auto Scaling discovery APIs require wildcard resources; their actions
are enumerated and region restricted.
Some Beanstalk describe
APIs require read-only wildcard resources; these are region-restricted.
Beanstalk runtime roles use AWS's standard WebTier and EnhancedHealth managed
policies; those are broader than the application deployment role and do not belong
to individual students. No managed-updates role or automatic platform update is enabled.

After PR review and merge, `Deploy main` runs automatically. It also supports manual
**Run workflow** on `main`. Runs from other branches are skipped. Every deploy
revalidates the exact main commit and packages it with an immutable release label.
GitHub serializes deployment jobs; do not deploy concurrently from a local terminal.

For an approved pre-merge AWS smoke test using the operator's credentials:

```bash
export VERSION="smoke-$(git rev-parse HEAD)-$(date +%s)"
export ARTIFACT_BUCKET=STACK_OUTPUT_BUCKET
bash scripts/bundle.sh "$VERSION"
bash scripts/deploy.sh
```

This verifies the deployment mechanism but **does not prove GitHub OIDC**. End-to-end
GitHub → OIDC → Beanstalk verification requires the reviewed workflow on `main`.
Do not widen trust to feature branches merely to bypass this review boundary.

## Health, logs and deployment verification

A deploy succeeds only after Beanstalk reports `Ready`, `Green`, and the expected
version label, followed by HTTP `/health` returning `status: ok` and that same
release label. This detects stale releases and failed startups. The workflow retains
the bundle and deployment responses for seven days and emits deployment events on
failure. A failed deployment fails the workflow; rollback is explicit.

Single-instance Beanstalk uses EC2 status and enhanced health; an ALB health-check
path is not applicable because there is no ALB. The application liveness check is
exercised after deployment and every 15 minutes by `Scheduled health check` on the
default branch. Scheduled checks can be delayed and are not an availability SLA.
A CloudWatch EnvironmentHealth alarm triggers after two five-minute warning-or-worse
periods, with SNS email notification after subscription confirmation. Health metrics
and log delivery can take several minutes to appear after creation.

Application requests are JSON logged to stdout without query strings, headers or
bodies. Beanstalk streams platform/nginx/application logs to CloudWatch with seven
days retention; logs are deleted when the environment is terminated. Find groups:

```bash
aws logs describe-log-groups --log-group-name-prefix /aws/elasticbeanstalk/intex-dev/ --region us-east-2
aws logs tail /aws/elasticbeanstalk/intex-dev/var/log/web.stdout.log --since 30m --region us-east-2
aws elasticbeanstalk describe-events --environment-name intex-dev --max-records 20 --region us-east-2
```

No TLS endpoint is provisioned in this minimal cost configuration. Before real
application data or sign-in flows, separately review TLS/domain/ALB or proxy design
and its costs. All-at-once deployment intentionally has downtime on one instance.

## Rollback

1. Pause new deploys with `gh variable set DEPLOY_ENABLED --body false` and ensure
   no deployment is running. Capture the failed run's events and previous version.
2. List versions: `aws elasticbeanstalk describe-application-versions --application-name intex`.
3. With authorized operator credentials, run:
   `aws elasticbeanstalk update-environment --environment-name intex-dev --version-label PREVIOUS_LABEL`.
4. Run `aws elasticbeanstalk wait environment-updated --environment-names intex-dev`.
   Confirm Ready/Green and the previous VersionLabel, then run
   `node scripts/verify-health.mjs http://ENVIRONMENT_CNAME PREVIOUS_LABEL`.
5. Revert the faulty code through a reviewed PR and re-enable deployment.

Keep application versions and source bundles needed for rollback. Do not delete
active or known-good versions. The bucket retains current artifacts; only noncurrent
object revisions expire after 30 days. Prune unused Beanstalk versions and their
matching bundles deliberately as the project grows (Beanstalk has version quotas).
Future database migrations must be backward compatible; app rollback does not undo
schema changes or restore data.

## PostgreSQL/RDS preparation — no database provisioned

The VPC has two isolated subnets across AZs and a reserved DB security group allowing
5432 only from the app security group. No database, subnet group, DB secret or paid
DB storage is created. `src/database.js` lazily creates a small `pg` pool only when
explicitly called with `DATABASE_URL`; the placeholder never calls it.

For future separately approved RDS work: create a separate database stack with a DB
subnet group using output `IsolatedDatabaseSubnets`, output DB security group,
private access (`PubliclyAccessible=false`), encryption, backups and retention or
snapshot deletion policy. Preserve VPC ownership/lifecycle dependencies before
splitting stacks. RDS must outlive app deployments; do not use Beanstalk-coupled RDS.

Store the PostgreSQL URL in Secrets Manager, grant the instance role read access only
to that secret (and its KMS key if applicable), and use Beanstalk's
`aws:elasticbeanstalk:application:environmentsecrets` integration for `DATABASE_URL`.
Do not put passwords in Actions variables, ordinary Beanstalk environment options,
CloudFormation parameters, logs or Git. Supply the regional AWS RDS CA bundle as a
verified application asset and set `DB_SSL_CA_FILE`. The module requires certificate
validation for remote hosts and rejects URL TLS overrides. Add a separate authenticated
readiness check and database integration/migration tests when a DB is provisioned;
keep `/health` independent. No database connectivity has been claimed or tested here.

## Costs and monitoring

Planning allowance in Ohio, 730 running hours/month, USD before tax/credits:

| Resource | Approximate monthly allowance |
| --- | ---: |
| One Linux t3.micro | $7.60 |
| 10 GiB gp3 root disk | $0.80 |
| One public IPv4 address ($0.005/hour) | $3.65 |
| CloudWatch logs, one health metric/alarm, S3 and SNS at light traffic | $1–4 |
| Total placeholder | **$13–17/month** |
| RDS / NAT gateway / load balancer | **$0: not provisioned** |

These are estimates, not a quote or spending cap; traffic, log volume, CPU surplus
credits, storage growth and taxes can increase them. Promotional credits are not
assumed. Beanstalk itself has no extra service charge. The $20 monthly AWS Budget
alerts at 80% and 100% actual spend for `us-east-2`. It is deliberately regional and
can include other Ohio resources; it does not alter other budgets and does not shut
anything down. Account-wide/global service costs are outside this budget. Budget
updates lag usage. Review billing daily during INTEX.

Sources: [Beanstalk pricing](https://aws.amazon.com/elasticbeanstalk/pricing/),
[EC2 On-Demand](https://aws.amazon.com/ec2/pricing/on-demand/),
[EBS pricing](https://aws.amazon.com/ebs/pricing/),
[public IPv4 pricing](https://aws.amazon.com/vpc/pricing/),
[CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/),
[Budgets pricing](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/).

## Teardown — destructive, owner approval required

1. Disable `DEPLOY_ENABLED`; wait for deploys to finish. Export any required logs
   and artifacts. Confirm no future database relies on this VPC.
2. Review `aws cloudformation list-stack-resources --stack-name IntexPipeline`.
   Delete **only** this stack with `aws cloudformation delete-stack --stack-name IntexPipeline`
   and wait using `aws cloudformation wait stack-delete-complete --stack-name IntexPipeline`.
3. Confirm the environment's EC2 instance, EBS disk, Elastic IP, SNS subscription,
   alarm and budget are gone. Logs configured DeleteOnTerminate are also removed.
4. The versioned artifact bucket and any newly created OIDC provider are retained.
   Bucket storage can still cost money. With separate explicit deletion approval,
   remove all object versions/delete markers and the bucket. Inspect OIDC consumers
   before deleting a retained account-level provider; leave it if another role uses it.
5. Beanstalk may create its regional service bucket and service-linked roles.
   These can be shared; do not delete them as part of project teardown. Inspect
   residual project storage and billing without changing unrelated resources.
6. Remove the project repository variables after verifying teardown.
