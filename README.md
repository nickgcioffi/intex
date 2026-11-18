# intex
The INTEX project for BYU IS Fall 2026

## AWS Infrastructure

Our INTEX application is hosted on Amazon Web Services (AWS). The following services support application hosting, database management, security, and monitoring.

| AWS Service | Purpose | Priority |
|---|---|---|
| **AWS Elastic Beanstalk** | Deploys and manages the Node.js/Express application. | Required |
| **Amazon EC2** | Provides the compute resources used by Elastic Beanstalk. | Required |
| **Amazon RDS (PostgreSQL)** | Hosts the application's relational PostgreSQL database. | Required |
| **AWS Identity and Access Management (IAM)** | Manages team member accounts, roles, and permissions. | Required |
| **Amazon VPC** | Provides networking and security groups for the application and database. | Required |
| **Amazon CloudWatch** | Monitors application performance, logs, and infrastructure health. | Recommended |
| **AWS Budgets** | Tracks spending and sends alerts to help manage AWS credits. | Recommended |
| **AWS Certificate Manager (ACM)** | Manages SSL/TLS certificates for HTTPS with supported AWS integrations. | Optional |
| **Amazon Route 53** | Manages DNS records for a custom domain. | Optional |
| **AWS Secrets Manager** | Securely stores database passwords, API keys, and other secrets. | Optional |
| **Amazon S3** | Stores uploaded files, images, and other application assets. | Optional |

### Deployment Architecture

```text
Users
  |
  v
AWS Elastic Beanstalk
  |
  +-- Amazon EC2
  |     |
  |     +-- Node.js / Express Application
  |     |
  |     +-- Amazon RDS (PostgreSQL)
  |
  +-- Amazon CloudWatch

Supporting Services:
- IAM: Team access and permissions
- VPC: Networking and security groups
- AWS Budgets: Cost monitoring
- GitHub: Source control and collaboration
```

### Deployment Workflow

1. Develop and test the application locally.
2. Push code changes to GitHub.
3. Package the application for Elastic Beanstalk.
4. Deploy the new application version to AWS.
5. Verify connectivity to PostgreSQL.
6. Monitor application health and logs through AWS.

### Cost Management

The project uses AWS promotional credits to offset eligible infrastructure expenses. Resources should be sized appropriately, monitored through AWS Budgets, and terminated when no longer needed.

## CI/CD implementation

The architecture above is the project roadmap. The initial implementation deliberately
runs **only a placeholder application**; **RDS is not provisioned** and PostgreSQL is
not yet part of deployment verification.

- Node.js 26 / Express: `npm ci`, `npm test`, `npm start` (port 5000).
- `GET /health` returns `{"status":"ok","version":"local"}` locally and the release
  identifier when deployed. `GET /` identifies the project.
- Pull requests run application tests, dependency audits, CDK checks, infrastructure
  assertions, synthesis and deployment packaging without AWS credentials.
- Pushes to `main` repeat checks, obtain a short-lived AWS role through GitHub OIDC,
  upload a versioned bundle, deploy to `intex-dev` in `us-east-2`, and verify both
  Beanstalk health and the exact release served by `/health`.
- Deployment is intentionally inactive until the owner approves infrastructure,
  provisions the stack and sets `DEPLOY_ENABLED=true` in GitHub repository variables.
- The single-instance environment uses HTTP and accepts brief downtime during
  deployment. Add TLS before using real credentials or sensitive application data.

See [the operations runbook](docs/OPERATIONS.md) for AWS setup, GitHub configuration,
team onboarding, testing, rollback, PostgreSQL preparation, costs and teardown.
See [validation evidence](docs/VALIDATION.md) for what has actually been verified.
