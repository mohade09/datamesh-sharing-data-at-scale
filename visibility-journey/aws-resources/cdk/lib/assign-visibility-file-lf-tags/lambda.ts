import { Construct, Duration, Stack } from '@aws-cdk/core';
import { Function as LambdaFunction, Code, Runtime } from '@aws-cdk/aws-lambda';
import { DeploymentEnvironment, DEV_DEPLOYMENT_ENVIRONMENT, PROD_DEPLOYMENT_ENVIRONMENT } from '@adidas-data-mesh/common';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import defaultConfig from './config/lambdas.config.default.json';
import devConfig from './config/lambdas.config.dev.json';
import prodConfig from './config/lambdas.config.prod.json';

export type AssignVisibilityFileLFTagsLambdaProps = {
  readonly deploymentEnvironment: DeploymentEnvironment;
  readonly stackBaseName: string;
};

export type LambdaConfig = {
  Logging: {
    LogLevel: string;
    RetentionInDays: number;
  };
  Lambda: {
    TimeoutSeconds: number;
    MemorySizeMB: number;
    MaxNameLength: number;
  };
};

export class AssignVisibilityFileLFTagsLambda extends Construct {
  /* AWS resources attached to this construct */
  public readonly lambda: LambdaFunction;

  public constructor(scope: Construct, id: string, props: AssignVisibilityFileLFTagsLambdaProps) {
    super(scope, id);

    this.lambda = this.setupLambda(this, props);
  }

  private setupLambda(scope: Construct, {
    deploymentEnvironment, stackBaseName
  }: AssignVisibilityFileLFTagsLambdaProps): LambdaFunction {
    const {
      Logging: configLogging, Lambda: configLambda
    } = this.loadConfig(deploymentEnvironment);

    const lambdaFunctionId = 'AssignVisibilityFileLFTags';
    const lakeFormationAdminRoleName = deploymentEnvironment === PROD_DEPLOYMENT_ENVIRONMENT
      ? 'data-lake-administrator-prod' : 'data-lake-administrator-dev';
    const accountId = Stack.of(this).account;
    const lambda = new LambdaFunction(scope, lambdaFunctionId, {
      runtime: Runtime.NODEJS_14_X,
      code: Code.fromAsset('./visibility-journey/assign-visibility-file-lf-tags-lambda/dist'),
      handler: 'index.assignVisibilityFileLFTagsHandler',
      description: 'Assign Lake Formation Tags from visibility json file',
      timeout: Duration.seconds(configLambda.TimeoutSeconds),
      environment: {
        LOGGER_LEVEL: configLogging.LogLevel,
        DATA_LAKE_ADMIN_ROLE_SESSION_NAME: lakeFormationAdminRoleName,
        ACCOUNT_ID: accountId
      },
      functionName: `${ stackBaseName }-${ lambdaFunctionId }-${ deploymentEnvironment }`
        .substring(0, configLambda.MaxNameLength),
      memorySize: configLambda.MemorySizeMB,
      logRetention: configLogging.RetentionInDays
    });

    lambda.addToRolePolicy(
      new PolicyStatement({
        actions: [ 'sts:AssumeRole' ],
        resources: [ `arn:aws:iam::${ accountId }:role/${ lakeFormationAdminRoleName }` ]
      })
    );

    return lambda;
  }

  private loadConfig(deploymentEnvironment: DeploymentEnvironment): LambdaConfig {
    switch (deploymentEnvironment) {
    case PROD_DEPLOYMENT_ENVIRONMENT: return { ...defaultConfig, ...prodConfig };
    case DEV_DEPLOYMENT_ENVIRONMENT: return { ...defaultConfig, ...devConfig };
    default: return defaultConfig;
    }
  }
}