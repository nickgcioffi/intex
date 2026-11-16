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
