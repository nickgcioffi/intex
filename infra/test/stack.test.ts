import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { IntexStack } from '../stack.js';
const template = () => Template.fromStack(new IntexStack(new App(), 'Test', { env: { account: '123456789012', region: 'us-east-2' } }));
test('single instance and no RDS, NAT gateway or load balancer', () => {
  const t = template();
  for (const type of ['AWS::RDS::DBInstance', 'AWS::RDS::DBCluster', 'AWS::EC2::NatGateway', 'AWS::ElasticLoadBalancingV2::LoadBalancer']) t.resourceCountIs(type, 0);
  t.hasResourceProperties('AWS::ElasticBeanstalk::Environment', { OptionSettings: Match.arrayWith([
    { Namespace: 'aws:elasticbeanstalk:environment', OptionName: 'EnvironmentType', Value: 'SingleInstance' },
    { Namespace: 'aws:ec2:instances', OptionName: 'InstanceTypes', Value: 't3.micro' },
    { Namespace: 'aws:elasticbeanstalk:cloudwatch:logs', OptionName: 'RetentionInDays', Value: '7' },
  ]) });
});
test('OIDC accepts only actual immutable repository subject and main', () => {
  template().hasResourceProperties('AWS::IAM::Role', { AssumeRolePolicyDocument: { Statement: Match.arrayWith([Match.objectLike({
    Action: 'sts:AssumeRoleWithWebIdentity', Condition: { StringEquals: {
      'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      'token.actions.githubusercontent.com:sub': 'repo:nickgcioffi@206786338/intex@1460597852:ref:refs/heads/main',
    } },
  })]) } });
});
test('private versioned artifact bucket, isolated DB subnets, budget and health alarm', () => {
  const t = template();
  t.hasResourceProperties('AWS::S3::Bucket', { VersioningConfiguration: { Status: 'Enabled' }, PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true } });
  t.resourceCountIs('AWS::EC2::Subnet', 4);
  t.resourceCountIs('AWS::Budgets::Budget', 1);
  t.resourceCountIs('AWS::CloudWatch::Alarm', 1);
});

test('enhanced health service policy uses the AWS service-role path', () => {
  template().hasResourceProperties('AWS::IAM::Role', { ManagedPolicyArns: Match.arrayWith([Match.objectLike({
    'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp('.*policy/service-role/AWSElasticBeanstalkEnhancedHealth')])]),
  })]) });
});

test('internal stack diagnostics require both project and exact environment tags', () => {
  template().hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({
      Action: ['cloudformation:GetTemplate', 'cloudformation:DescribeStacks', 'cloudformation:DescribeStackResource', 'cloudformation:DescribeStackResources'],
      Condition: { StringEquals: {
        'aws:RequestedRegion': 'us-east-2',
        'aws:ResourceTag/Project': 'intex',
        'aws:ResourceTag/elasticbeanstalk:environment-name': 'intex-dev',
      } },
    })]) },
  });
});
