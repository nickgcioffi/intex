import { App } from 'aws-cdk-lib';
import { IntexStack } from './stack.js';
const app = new App();
new IntexStack(app, 'IntexPipeline', { env: { region: 'us-east-2' } });
