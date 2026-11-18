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
