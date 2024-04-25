import {
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_events as events,
  aws_events_targets as eventsTargets,
  Stack,
  StackProps,
  Duration,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dotenv from "dotenv";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class PromobotMxCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    dotenv.config({
      path: __dirname + `/../.env`,
    });

    // IAM Role for Lambda Execution
    const lambdaExecutionRole = new iam.Role(
      this,
      "LambdaExecutionPromoBotMXRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        description: "Role to execute lambda functions of the promo-bot-mx",
        roleName: "LambdaExecutionPromoBotMXRole",
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
        ],
      }
    );

    // DynamoDB Tables
    const promosTable = new dynamodb.Table(this, "PromosTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "created_at", type: dynamodb.AttributeType.NUMBER },
      tableName: "PromoBotMXTable",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Inline Policies for the Lambda Execution Role
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
        ],
        resources: [promosTable.tableArn],
      })
    );

    // Lambda Functions
    const getHotPromos = new lambda.Function(this, "GetHotPromos", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda/get-hot-promos/"),
      handler: "app.handler",
      memorySize: 1024,
      timeout: Duration.seconds(15),
      role: lambdaExecutionRole,
      environment: {
        TELEGRAM_URL: process.env.TELEGRAM_URL!!,
        TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID!!,
        TABLE_NAME: promosTable.tableName,
        ENVIRONMENT: "prod",
        ENDPOINT: "https://dynamodb.us-east-1.amazonaws.com",
      },
    });

    const deleteHotPromos = new lambda.Function(this, "DeleteHotPromos", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda/delete-hot-promos/"),
      handler: "app.handler",
      memorySize: 128,
      timeout: Duration.seconds(40),
      role: lambdaExecutionRole,
      environment: {
        ENVIRONMENT: "prod",
        THRESHOLD_DAYS: "5",
        TABLE_NAME: promosTable.tableName,
        ENDPOINT: "https://dynamodb.us-east-1.amazonaws.com",
      },
    });

    // EventBridge

    // Rule to execute GetHotPromos every 20 minutes
    const getHotPromosRule = new events.Rule(this, "GetHotPromosSchedule", {
      schedule: events.Schedule.rate(Duration.minutes(20)),
    });

    // Adding GetHotPromos as the target for the rule
    getHotPromosRule.addTarget(new eventsTargets.LambdaFunction(getHotPromos));

    // Rule to execute DeleteHotPromos every day
    const deleteHotPromosRule = new events.Rule(
      this,
      "DeleteHotPromosSchedule",
      {
        schedule: events.Schedule.rate(Duration.days(1)),
      }
    );

    // Adding DeleteHotPromos as the target for the rule
    deleteHotPromosRule.addTarget(
      new eventsTargets.LambdaFunction(deleteHotPromos)
    );
  }
}
