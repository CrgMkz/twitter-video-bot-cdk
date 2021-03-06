import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction as LambdaFunctionTarget, SfnStateMachine } from '@aws-cdk/aws-events-targets';
import { Code, Runtime, Function as LambdaFunction } from '@aws-cdk/aws-lambda';
import { LambdaRestApi } from '@aws-cdk/aws-apigateway';
import { StringParameter } from '@aws-cdk/aws-ssm';
import { Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { Table, AttributeType, BillingMode } from '@aws-cdk/aws-dynamodb';
import { RemovalPolicy } from '@aws-cdk/core';
import { PolicyStatement } from "@aws-cdk/aws-iam";
import { Task, Choice, Condition, StateMachine } from '@aws-cdk/aws-stepfunctions';
import { InvokeFunction } from '@aws-cdk/aws-stepfunctions-tasks';
import * as cdk from '@aws-cdk/core';

import path = require('path');

export class CdkTwitterStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const accountId = cdk.Stack.of(this).account;
        const region = cdk.Stack.of(this).region;
        const twitterSearchLambdaName = 'cdk-twitter-lambda';
        const dynamoPutLambdaName = 'dynamo-put-lambda';
        const dynamoQueryLambdaName = 'dynamo-query-lambda';
        const dynamoUpdateLambdaName = 'dynamo-update-lambda';
        const queryMediaLambdaName = 'query-media-lambda';
        const replyNoMediaLambdaName = 'reply-no-media-lambda';
        const replyWithMediaLambdaName = 'reply-with-media-lambda';
        const uiLambdaName = 'ui-lambda';
        const dynamoTableName = 'cdk-twitter-dynamo';
        const pythonPath = '/var/task/dependencies:/var/runtime';
        const stateMachineName = 'TwitterStateMachine';

        const accessToken = StringParameter.fromStringParameterAttributes(this, 'accessToken', {
            parameterName: '/twitterlambda/accesstoken',
        }).stringValue;

        const accessTokenSecret = StringParameter.fromStringParameterAttributes(this, 'accessTokenSecret', {
            parameterName: '/twitterlambda/accesstokensecret',
        }).stringValue;

        const consumerKey = StringParameter.fromStringParameterAttributes(this, 'consumerKey', {
            parameterName: '/twitterlambda/consumerkey',
        }).stringValue;

        const consumerSecret = StringParameter.fromStringParameterAttributes(this, 'consumerSecret', {
            parameterName: '/twitterlambda/consumersecretkey',
        }).stringValue;

        const searchString = StringParameter.fromStringParameterAttributes(this, 'searchString', {
            parameterName: '/twitterlambda/searchstring',
        }).stringValue;

        const twitterAccountName = StringParameter.fromStringParameterAttributes(this, 'twitterAccountName', {
            parameterName: '/twitterlambda/twitteraccountname',
        }).stringValue;

        const expiration = StringParameter.fromStringParameterAttributes(this, 'expiration', {
            parameterName: '/twitterlambda/expiration',
        }).stringValue;


        const twitterLambdaRole = new Role(this, 'twitterLambdaRole', {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com')
        });

        const dynamoLambdaRole = new Role(this, 'dynamoLambdaRole', {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com')
        });

        const uiLambdaRole = new Role(this, 'uiLambdaRole', {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com')
        });

        twitterLambdaRole.addToPolicy(new PolicyStatement({
            resources: ['*'],
            actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents']
        }));

        twitterLambdaRole.addToPolicy(new PolicyStatement({
            resources: [`arn:aws:states:${region}:${accountId}:stateMachine:${stateMachineName}*`],
            actions: [
                'states:StartExecution']
        }));

        dynamoLambdaRole.addToPolicy(new PolicyStatement({
            resources: [`arn:aws:dynamodb:${region}:${accountId}:table/${dynamoTableName}`],
            actions: [
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:GetItem']
        }));

        uiLambdaRole.addToPolicy(new PolicyStatement({
            resources: [`arn:aws:dynamodb:${region}:${accountId}:table/${dynamoTableName}`],
            actions: [
                'dynamodb:GetItem']
        }));

        dynamoLambdaRole.addToPolicy(new PolicyStatement({
            resources: ['*'],
            actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents']
        }));

        uiLambdaRole.addToPolicy(new PolicyStatement({
            resources: ['*'],
            actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents']
        }));

        const dynamoPutFunction = new LambdaFunction(this, dynamoPutLambdaName, {
            functionName: dynamoPutLambdaName,
            code: Code.fromAsset(path.join(__dirname, '../src/step_functions')),
            role: dynamoLambdaRole,
            handler: 'dynamo_put.main.handler',
            runtime: Runtime.PYTHON_3_8,
            timeout: cdk.Duration.seconds(10),
            environment: {
                'REGION': region,
                'EXPIRATION': expiration,
                'PYTHONPATH': pythonPath
            }
        });

        const dynamoQueryFunction = new LambdaFunction(this, dynamoQueryLambdaName, {
            functionName: dynamoQueryLambdaName,
            code: Code.fromAsset(path.join(__dirname, '../src/step_functions')),
            role: dynamoLambdaRole,
            handler: 'dynamo_query.main.handler',
            runtime: Runtime.PYTHON_3_8,
            timeout: cdk.Duration.seconds(10),
            environment: {
                'REGION': region,
                'EXPIRATION': expiration,
                'PYTHONPATH': pythonPath
            }
        });

        const dynamoUpdateFunction = new LambdaFunction(this, dynamoUpdateLambdaName, {
            functionName: dynamoUpdateLambdaName,
            code: Code.fromAsset(path.join(__dirname, '../src/step_functions')),
            role: dynamoLambdaRole,
            handler: 'dynamo_update.main.handler',
            runtime: Runtime.PYTHON_3_8,
            timeout: cdk.Duration.seconds(10),
            environment: {
                'REGION': region,
                'EXPIRATION': expiration,
                'PYTHONPATH': pythonPath
            }
        });

        const queryMediaFunction = new LambdaFunction(this, queryMediaLambdaName, {
            functionName: queryMediaLambdaName,
            code: Code.fromAsset(path.join(__dirname, '../src/step_functions')),
            role: twitterLambdaRole,
            handler: 'query_media.main.handler',
            runtime: Runtime.PYTHON_3_8,
            timeout: cdk.Duration.seconds(10),
            environment: {
                'CONSUMERKEY': consumerKey,
                'CONSUMERSECRET': consumerSecret,
                'ACCESSTOKEN': accessToken,
                'ACCESSTOKENSECRET': accessTokenSecret,
                'PYTHONPATH': pythonPath
            }
        });

        const replyNoMediaFunction = new LambdaFunction(this, replyNoMediaLambdaName, {
            functionName: replyNoMediaLambdaName,
            code: Code.fromAsset(path.join(__dirname, '../src/step_functions')),
            role: twitterLambdaRole,
            handler: 'reply_no_media.main.handler',
            runtime: Runtime.PYTHON_3_8,
            timeout: cdk.Duration.seconds(10),
            environment: {
                'CONSUMERKEY': consumerKey,
                'CONSUMERSECRET': consumerSecret,
                'ACCESSTOKEN': accessToken,
                'ACCESSTOKENSECRET': accessTokenSecret,
                'PYTHONPATH': pythonPath
            }
        });

        const replyWithMediaFunction = new LambdaFunction(this, replyWithMediaLambdaName, {
            functionName: replyWithMediaLambdaName,
            code: Code.fromAsset(path.join(__dirname, '../src/step_functions')),
            role: twitterLambdaRole,
            handler: 'reply_with_media.main.handler',
            runtime: Runtime.PYTHON_3_8,
            timeout: cdk.Duration.seconds(10),
            environment: {
                'CONSUMERKEY': consumerKey,
                'CONSUMERSECRET': consumerSecret,
                'ACCESSTOKEN': accessToken,
                'ACCESSTOKENSECRET': accessTokenSecret,
                'PYTHONPATH': pythonPath
            }
        });

        const uiLambdaFunction = new LambdaFunction(this, uiLambdaName, {
            functionName: uiLambdaName,
            code: Code.fromAsset(path.join(__dirname, '../src/lambda')),
            role: uiLambdaRole,
            handler: 'ui_lambda.main.handler',
            runtime: Runtime.PYTHON_3_8,
            timeout: cdk.Duration.seconds(10),
            environment: {
                'REGION': region,
                'PYTHONPATH': pythonPath
            }
        });

        new Table(this, dynamoTableName, {
            tableName: dynamoTableName,
            removalPolicy: RemovalPolicy.DESTROY,
            partitionKey: { name: 'username', type: AttributeType.STRING },
            billingMode: BillingMode.PAY_PER_REQUEST,
            timeToLiveAttribute: 'expiry'
        });

        const api = new LambdaRestApi(this, 'uiApi', {
            handler: uiLambdaFunction,
            proxy: false
        });

        const items = api.root.addResource('items');
        items.addMethod('GET');

        const item = items.addResource('{item}');
        item.addMethod('GET');

        const queryMediaTask = new Task(this, 'queryMediaTask', {
            task: new InvokeFunction(queryMediaFunction)
        });

        const replyWithMediaTask = new Task(this, 'replyWithMediaTask', {
            task: new InvokeFunction(replyWithMediaFunction)
        });

        const replyNoMediaTask = new Task(this, 'replyNoMediaTask', {
            task: new InvokeFunction(replyNoMediaFunction)
        });

        const dynamoQueryTask = new Task(this, 'dynamoQueryTask', {
            task: new InvokeFunction(dynamoQueryFunction)
        });

        const dynamoPutTask = new Task(this, 'dynamoPutTask', {
            task: new InvokeFunction(dynamoPutFunction)
        });

        const dynamoUpdateTask = new Task(this, 'dynamoUpdateTask', {
            task: new InvokeFunction(dynamoUpdateFunction)
        });

        const definition = queryMediaTask
            .next(new Choice(this, 'Tweet Has Media?')
                .when(Condition.numberEquals('$.has_media', 1), replyWithMediaTask
                .next(dynamoQueryTask)
                .next(new Choice(this, 'User Exists in Dynamo?')
                    .when(Condition.numberEquals('$.user_exists', 1), dynamoUpdateTask)
                    .otherwise(dynamoPutTask)))
                .otherwise(replyNoMediaTask))

        const SfnStateMachine = new StateMachine(this, 'TwitterStateMachine', {
            definition,
            timeout: cdk.Duration.minutes(5)
        });

        const twitterSearchFunction = new LambdaFunction(this, twitterSearchLambdaName, {
            functionName: twitterSearchLambdaName,
            code: Code.fromAsset(path.join(__dirname, '../src/lambda')),
            role: twitterLambdaRole,
            handler: 'twitter_search.main.handler',
            runtime: Runtime.PYTHON_3_8,
            timeout: cdk.Duration.seconds(10),
            environment: {
                'CONSUMERKEY': consumerKey,
                'CONSUMERSECRET': consumerSecret,
                'ACCESSTOKEN': accessToken,
                'ACCESSTOKENSECRET': accessTokenSecret,
                'SEARCHSTRING': searchString,
                'TWITTERACCOUNTNAME': twitterAccountName,
                'PYTHONPATH': pythonPath,
                'STATE_MACHINE_ARN': SfnStateMachine.stateMachineArn
            }
        });

        const twitterLambdaRule = new Rule(this, 'twitterLambdaRule', {
            schedule: Schedule.expression('cron(0/1 * * * ? *)')
        });

        twitterLambdaRule.addTarget(new LambdaFunctionTarget(twitterSearchFunction));
    }
}