# Validation evidence

Implementation started 2026-11-18 from main commit `95c911b`.

- GitHub repository read/write and Actions permissions verified independently.
- AWS account identity verified after explicit user-approved browser sign-in:
  account `600138214348`, IAM user `nickgboff`, profile `intex`.
- Read-only discovery: no existing GitHub OIDC providers and no active CloudFormation
  stacks in `us-east-2` at preflight. Node.js 26 AL2023 v6.12.3 is available.
- IAM simulator allowed key CloudFormation/IAM/Beanstalk/EC2/S3/Budgets creation
  actions. This is not proof of every deployment permission or account quota.
- Actual immutable GitHub OIDC subject prefix obtained through the repository API:
  `repo:nickgcioffi@206786338/intex@1460597852`.

Application tests, CDK assertions, packaging, GitHub CI and live deployment evidence
are updated below as validation completes. Provisioning requires explicit approval;
no live deployment or OIDC success should be inferred from synthesized templates.

## Verified results

- Eight application/deployment tests pass, including real HTTP health/version checks,
  opt-in PostgreSQL/TLS configuration, a busy-environment guard, AWS denial handling
  and invalid artifact configuration. AWS control-plane unit tests use mocks.
- Four CDK assertions pass; TypeScript checking, synthesis, `cfn-lint 1.60.1`, AWS
  `validate-template`, shell syntax and source-bundle integrity checks pass.
- The extracted production ZIP was installed with production dependencies only and
  served the expected release without a database. No credentials, IaC, `.git` or
  `node_modules` were packaged.
- GitHub Actions PR validation passed on the implementation branch, including the
  real Ubuntu-runner application/CDK tests, audit gates, synthesis and template linting.
- Live AWS creation exposed an incorrect enhanced-health managed-policy path. It was
  corrected to `service-role/AWSElasticBeanstalkEnhancedHealth`, regression tested, and
  the failed stack was removed with explicit owner approval before successful retry.
- `IntexPipeline` reached `CREATE_COMPLETE` in `us-east-2`. Its approved GitHub OIDC
  provider was retained from the failed attempt and is reused (`CreateOidcProvider=false`).
- Actual topology verified: one running `t3.micro`, IMDSv2 required, no load balancer,
  seven-day CloudWatch log groups, a health alarm and a $20 Ohio budget.
- Actual deployed IAM trust was inspected. IAM simulation allowed INTEX application
  version creation/update and denied an unrelated environment update, environment
  termination, CloudFormation stack creation and `iam:PassRole`.
- Operator-credential live smoke deployment succeeded for release
  `smoke-8a4c9a101def17cafa8b473dd579b07a052690ec-1795037356`.
  Beanstalk was Ready/Green with the matching VersionLabel and HTTP `/health` returned
  that same release identifier.
- GitHub repository variables were configured from the deployed stack. No static
  AWS access keys were added to GitHub.

Live URL: <http://intex-dev.eba-yv2pttdh.us-east-2.elasticbeanstalk.com/health>.
The definitive GitHub OIDC/main deployment run and latest validation status are
recorded in [PR #2](https://github.com/nickgcioffi/intex/pull/2) and its linked Actions
runs. A successful operator smoke test alone is not evidence of an OIDC exchange.
SNS alarm delivery also requires the owner to confirm the latest subscription email.
No RDS/database connectivity or destructive teardown test was performed.
