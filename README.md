# cycle-sqs
Cycle.js driver for connecting to Amazon SQS (Simple Queue Service).

## API
Official API docs:
http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html
All methods are supported for using in declarative style.

```js
  // sends two messages to queue
  const main = ({sqs}) => {
    return {
      sqs: O.timer(0, 100).map(x => ({
        method: 'sendMessage',
        params: {MessageBody: 'message' + x}
      })).take(2),
      result: sqs.flatMap(_ => _)
    }
  }
  run(main, {
    sqs: makeSQSDriver(),
    result: (response$) => {
      response$.forEach(r => {
        console.log('message sent', r.MessageId)
      })
    }
  })
```

`makeSQSDriver()` driver returns meta stream of responses.
It also adds two methods for queue polling `get` and `poll` witch polling the queue 
by constantly calling `receiveMessage` method with passed params 
(consider using long polling using `WaitTimeSeconds`).
``` js
  const main = ({sqs}) => {
    console.log('main')
    return {
      log: sqs.poll({
          QueueUrl,
          WaitTimeSeconds: 1
        })
        .switch()
        .filter(x => x.Messages)
    }
  }
  run(main, {
    sqs: makeSQSDriver(),
    log: (r$) => {
      r$.forEach(r => {
        Console.log('message received', r.Messages[0].MessageId)
      })
    }
  })
```

Also see tests for example of usage.

### Tests
```
npm install
npm run test
```
For running tests you need AWS credentials, if not globally available place them to hem to`./aws-config.json` with config, for example:
``` json
{
  "region": "us-east-1",
  "accessKeyId": "...",
  "secretAccessKey": "....",  
}
```
For running test in dev mode with watching `node-dev` should be installed globally 


### Good resources on SQS:
* https://www.youtube.com/watch?v=4Z74luiE2bg
* https://www.youtube.com/watch?v=rxnuioFAxa