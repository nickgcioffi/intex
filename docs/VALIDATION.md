# Validation evidence

Validated 2026-11-18. Implementation began from main commit `95c911b`.

## End-to-end deployment

[Deploy main run 44403190311, attempt 10](https://github.com/nickgcioffi/intex/actions/runs/44403190311/attempts/10)
completed successfully. It revalidated the main commit, exchanged GitHub OIDC for
short-lived AWS credentials, uploaded the release, registered a Beanstalk application
version, updated the environment, waited for Ready/Green and verified the exact
release over HTTP.

Verified release:
`git-97dd7ecf543e16ac127b41481e884a450219ddd5-44403190311-10`.

Live health: <http://intex-dev.eba-yv2pttdh.us-east-2.elasticbeanstalk.com/health>.
Enhanced health reported one healthy instance and application update complete.

PR #2 was merged with explicit owner approval. PR #7 records the downstream
permissions discovered during live validation, the environment-ID binding, the
fail-fast deployment error check, and the updated operations runbook. Consult its
linked Actions checks for the latest source revision and subsequent deployment run.

## Application and infrastructure checks

- Nine application/deployment tests pass: health/version, routes, opt-in PostgreSQL,
  verified TLS configuration, busy-environment rejection, synchronous AWS denial,
  exact HTTP verification after a mocked AWS update, invalid artifact configuration,
  and prompt failure on asynchronous Beanstalk errors. Control-plane unit tests use
  mocks; the end-to-end run above used real AWS.
- Five CDK assertions pass, covering single-instance/no-RDS/no-NAT/no-ALB sizing,
  exact immutable OIDC subject, private artifacts/monitoring, the AWS enhanced-health
  policy path and internal stack tag restrictions.
- TypeScript checking, CDK synthesis, cfn-lint 1.60.1, AWS validate-template,
  shell syntax and source-bundle integrity passed.
- The extracted deployment ZIP ran using production dependencies only and returned
  its packaged release. No credentials, IaC, `.git` or `node_modules` were bundled.
- GitHub pull-request validation ran successfully on Ubuntu. The manually dispatched
  [health-monitor workflow](https://github.com/nickgcioffi/intex/actions/runs/44404374201)
  also passed against the live environment.
- The application dependency audit has no findings. CDK tooling has a documented
  moderate bundled minimatch advisory; there are no high/critical audit findings.

## AWS access, resources and IAM

- AWS access was verified independently of GitHub after owner-approved sign-in:
  account `600138214348`, IAM user `nickgboff`, local profile `intex`.
- The supported Node.js 26 AL2023 v6.12.3 platform was confirmed through AWS.
- `IntexPipeline` creation and subsequent IAM-only updates completed successfully.
  The enhanced-health policy path is `service-role/AWSElasticBeanstalkEnhancedHealth`.
- Actual topology: one t3.micro, 10 GiB gp3, one public IPv4 address, IMDSv2 required,
  no load balancer, no NAT gateway and no database. Auto Scaling min/max/desired are
  all 1; no processes remained suspended after deployment.
- Application logs arrived in CloudWatch with seven-day retention. The
  EnvironmentHealth metric, health alarm and $20 Ohio budget were verified.
- The actual GitHub subject prefix was obtained from the repository API:
  `repo:nickgcioffi@206786338/intex@1460597852`. Trust requires the full main-branch
  subject and audience `sts.amazonaws.com`. The real workflow's OIDC exchange passed.
- CloudTrail from the successful operator smoke deployment established the required
  downstream API calls. Stack update and Auto Scaling process permissions were
  explicitly approved by the owner after automatic approval review requested
  additional authorization. They are bound to environment `e-8fetrwpb5e`, Project
  `intex`, environment name `intex-dev`, and region `us-east-2`.
- IAM Access Analyzer validated the deployed identity policy with zero findings.
- Final IAM simulations denied reading/writing/deleting CougarCalc object bodies,
  updating an unrelated stack, creating a stack, passing IAM roles, launching EC2
  and terminating the INTEX environment. No static AWS access keys were added to GitHub.

## Shared regional service bucket

`elasticbeanstalk-us-east-2-600138214348` predates INTEX and contains CougarCalc data.
Beanstalk environment creation automatically added the INTEX instance role to its
existing bucket policy. That dependency was disclosed; the owner explicitly approved
subsequent scoped maintenance while requiring CougarCalc preservation.

After the successful GitHub deployment, comparison with the saved pre-maintenance
baseline found all 18 protected/non-INTEX objects unchanged by key, ETag and size.
The bucket policy, ownership controls and public-access settings were also unchanged
from that baseline. INTEX runtime copies/manifests changed as expected. The deployment
role can read shared ACL metadata, but cannot read/write/delete CougarCalc object
bodies. Preserve this bucket during project teardown.

## Remaining manual steps and limits

- Confirm the latest SNS subscription email; the subscription was still pending
  confirmation at final inspection. Alarm email delivery is not claimed as tested.
- Review/merge the scoped fix in PR #7 and require PR approvals/status checks on main
  according to team policy. No unreviewed changes were pushed directly to main.
- No RDS connection, destructive teardown or database rollback test was performed.
- The placeholder uses HTTP and all-at-once deployment downtime. Add TLS before
  using real credentials or sensitive data.
- Planning allowance: $13–17/month before credits, taxes and variable usage. The
  $20 regional budget is an alert, not a spending cap, and includes other Ohio costs.
