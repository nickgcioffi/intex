import {
  Stack, StackProps, CfnOutput, CfnParameter, CfnCondition, Fn,
  BootstraplessSynthesizer, RemovalPolicy, Duration, Tags,
  aws_ec2 as ec2, aws_iam as iam, aws_s3 as s3,
  aws_elasticbeanstalk as eb, aws_cloudwatch as cw,
  aws_sns as sns, aws_sns_subscriptions as subscriptions, aws_cloudwatch_actions as actions,
  aws_budgets as budgets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class IntexStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    // No CDK assets or account-wide bootstrap stack required.
    super(scope, id, { ...props, synthesizer: new BootstraplessSynthesizer() });
    this.templateOptions.description = 'Dedicated INTEX single-instance Node.js deployment. No database, NAT or load balancer.';
    Tags.of(this).add('Project', 'intex');
    const email = new CfnParameter(this, 'AlertEmail', { type: 'String', allowedPattern: '[^@\\s]+@[^@\\s]+\\.[^@\\s]+', description: 'Team owner email for budget and health alerts.' });
    const createProvider = new CfnParameter(this, 'CreateOidcProvider', { type: 'String', default: 'false', allowedValues: ['true', 'false'], description: 'Set true ONLY after confirming the account has no GitHub OIDC provider.' });
    const providerCondition = new CfnCondition(this, 'NeedsProvider', { expression: Fn.conditionEquals(createProvider.valueAsString, 'true') });
    const oidc = new iam.CfnOIDCProvider(this, 'GitHubProvider', {
      url: 'https://token.actions.githubusercontent.com', clientIdList: ['sts.amazonaws.com'],
    });
    oidc.cfnOptions.condition = providerCondition;
    oidc.applyRemovalPolicy(RemovalPolicy.RETAIN);
    const providerArn = Fn.conditionIf(providerCondition.logicalId, oidc.ref,
      `arn:${this.partition}:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`).toString();
    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.42.0.0/16'), maxAzs: 2, natGateways: 0,
      subnetConfiguration: [
        { name: 'public-app', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'isolated-database', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    const appSg = new ec2.SecurityGroup(this, 'ApplicationSecurityGroup', { vpc, description: 'INTEX application: HTTP only; no SSH' });
    // Public placeholder web service; this SG is new and dedicated to INTEX.
    appSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Public placeholder HTTP');
    const dbSg = new ec2.SecurityGroup(this, 'FutureDatabaseSecurityGroup', { vpc, description: 'Reserved for future approved RDS; no database provisioned' });
    dbSg.addIngressRule(appSg, ec2.Port.tcp(5432), 'PostgreSQL from application only');
    const artifacts = new s3.Bucket(this, 'Artifacts', {
      encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30), abortIncompleteMultipartUploadAfter: Duration.days(1) }],
    });
    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier')],
    });
    artifacts.grantRead(instanceRole);
    const profile = new iam.CfnInstanceProfile(this, 'InstanceProfile', { roles: [instanceRole.roleName] });
    const serviceRole = new iam.Role(this, 'ServiceRole', {
      assumedBy: new iam.ServicePrincipal('elasticbeanstalk.amazonaws.com', { conditions: { StringEquals: { 'sts:ExternalId': 'elasticbeanstalk' } } }),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSElasticBeanstalkEnhancedHealth')],
    });
    const application = new eb.CfnApplication(this, 'Application', { applicationName: 'intex', description: 'BYU IS INTEX placeholder and future application' });
    const option = (namespace: string, optionName: string, value: string) => ({ namespace, optionName, value });
    const environment = new eb.CfnEnvironment(this, 'Environment', {
      applicationName: application.ref, environmentName: 'intex-dev',
      solutionStackName: '64bit Amazon Linux 2023 v6.12.3 running Node.js 26',
      // Omitted VersionLabel intentionally: GitHub owns application version updates.
      // Initial creation runs the AWS sample until the first app deploy.
      optionSettings: [
        option('aws:elasticbeanstalk:environment', 'EnvironmentType', 'SingleInstance'),
        option('aws:elasticbeanstalk:environment', 'ServiceRole', serviceRole.roleArn),
        option('aws:autoscaling:launchconfiguration', 'IamInstanceProfile', profile.ref),
        option('aws:autoscaling:launchconfiguration', 'SecurityGroups', appSg.securityGroupId),
        option('aws:autoscaling:launchconfiguration', 'DisableDefaultEC2SecurityGroup', 'true'),
        option('aws:autoscaling:launchconfiguration', 'DisableIMDSv1', 'true'),
        option('aws:autoscaling:launchconfiguration', 'RootVolumeType', 'gp3'),
        option('aws:autoscaling:launchconfiguration', 'RootVolumeSize', '10'),
        option('aws:ec2:instances', 'InstanceTypes', 't3.micro'),
        option('aws:autoscaling:asg', 'MinSize', '1'), option('aws:autoscaling:asg', 'MaxSize', '1'),
        option('aws:ec2:vpc', 'VPCId', vpc.vpcId),
        option('aws:ec2:vpc', 'Subnets', vpc.publicSubnets[0].subnetId),
        option('aws:ec2:vpc', 'AssociatePublicIpAddress', 'true'),
        option('aws:elasticbeanstalk:application:environment', 'NODE_ENV', 'production'),
        option('aws:elasticbeanstalk:application:environment', 'PORT', '5000'),
        option('aws:elasticbeanstalk:command', 'DeploymentPolicy', 'AllAtOnce'),
        option('aws:elasticbeanstalk:command', 'Timeout', '600'),
        option('aws:elasticbeanstalk:healthreporting:system', 'SystemType', 'enhanced'),
        option('aws:elasticbeanstalk:cloudwatch:logs', 'StreamLogs', 'true'),
        option('aws:elasticbeanstalk:cloudwatch:logs', 'RetentionInDays', '7'),
        option('aws:elasticbeanstalk:cloudwatch:logs', 'DeleteOnTerminate', 'true'),
        option('aws:elasticbeanstalk:managedactions', 'ManagedActionsEnabled', 'false'),
      ],
    });
    // The instance's source-bundle permission must exist before EC2 bootstraps.
    environment.node.addDependency(instanceRole.node.findChild('DefaultPolicy'));
    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      assumedBy: new iam.FederatedPrincipal(providerArn, { StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub': 'repo:nickgcioffi@206786338/intex@1460597852:ref:refs/heads/main',
      } }, 'sts:AssumeRoleWithWebIdentity'), maxSessionDuration: Duration.hours(1),
    });
    const appArn = `arn:${this.partition}:elasticbeanstalk:${this.region}:${this.account}:application/intex`;
    const envArn = `arn:${this.partition}:elasticbeanstalk:${this.region}:${this.account}:environment/intex/intex-dev`;
    const versionArn = `arn:${this.partition}:elasticbeanstalk:${this.region}:${this.account}:applicationversion/intex/*`;
    const regionCondition = { StringEquals: { 'aws:RequestedRegion': 'us-east-2' } };
    deployRole.addToPolicy(new iam.PolicyStatement({ actions: ['elasticbeanstalk:CreateApplicationVersion'], resources: [appArn, versionArn], conditions: regionCondition }));
    deployRole.addToPolicy(new iam.PolicyStatement({ actions: ['elasticbeanstalk:UpdateEnvironment'], resources: [envArn, versionArn], conditions: regionCondition }));
    // Describe APIs do not all support resource-level authorization; read only.
    deployRole.addToPolicy(new iam.PolicyStatement({ actions: ['elasticbeanstalk:DescribeEnvironments', 'elasticbeanstalk:DescribeEvents', 'elasticbeanstalk:DescribeApplicationVersions'], resources: ['*'], conditions: regionCondition }));
    deployRole.addToPolicy(new iam.PolicyStatement({ actions: ['s3:PutObject', 's3:GetObject'], resources: [artifacts.arnForObjects('releases/*')] }));
    deployRole.addToPolicy(new iam.PolicyStatement({ actions: ['s3:ListBucket', 's3:GetBucketLocation'], resources: [artifacts.bucketArn] }));
    const topic = new sns.Topic(this, 'Alerts');
    topic.addSubscription(new subscriptions.EmailSubscription(email.valueAsString));
    const alarm = new cw.Alarm(this, 'HealthAlarm', {
      metric: new cw.Metric({ namespace: 'AWS/ElasticBeanstalk', metricName: 'EnvironmentHealth', dimensionsMap: { EnvironmentName: 'intex-dev' }, period: Duration.minutes(5), statistic: 'Maximum' }),
      threshold: 10, comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD, evaluationPeriods: 2,
      treatMissingData: cw.TreatMissingData.MISSING,
    });
    alarm.addAlarmAction(new actions.SnsAction(topic));
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: { budgetName: 'intex-us-east-2', budgetType: 'COST', timeUnit: 'MONTHLY', budgetLimit: { amount: 20, unit: 'USD' }, costFilters: { Region: ['us-east-2'] } },
      notificationsWithSubscribers: [80, 100].map(threshold => ({ notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold, thresholdType: 'PERCENTAGE' }, subscribers: [{ subscriptionType: 'EMAIL', address: email.valueAsString }] })),
    });
    for (const [key, value] of Object.entries({ DeployRoleArn: deployRole.roleArn, ArtifactBucket: artifacts.bucketName, ApplicationName: application.ref, EnvironmentName: environment.ref, Endpoint: `http://${environment.attrEndpointUrl}`, VpcId: vpc.vpcId, FutureDatabaseSecurityGroup: dbSg.securityGroupId, IsolatedDatabaseSubnets: vpc.isolatedSubnets.map(s => s.subnetId).join(',') })) new CfnOutput(this, `${key}Output`, { value }).overrideLogicalId(key);
  }
}
