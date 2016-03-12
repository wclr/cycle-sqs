import {run} from '@cycle/core'
import {makeSQSDriver} from '../src/index'
import {Observable as O} from 'rx'
import test from 'tape'
import aws from 'aws-sdk'

try {
  aws.config.loadFromPath(__dirname + '/../aws-config.json')
} catch(e){

}

var QueueUrl

test('Create/purge test Queue or and url', (t) => {
  const main = ({sqs}) => {
    return {
      sqs: O.just(({
        createQueue: {
          QueueName: 'cycle-sqs-test'
        }
      })).concat(
        sqs.filter(r$ => r$.request.createQueue)
          .switch().delay(100)
          .catch(e => {})
          .map(r => ({
            purgeQueue: {
              QueueUrl: r.QueueUrl
            }
          }))
      ),
      url: sqs.filter(r$ => r$.request.createQueue)
        .switch().map(r => r.QueueUrl),
      result: sqs
        .filter(r$ => r$.request.purgeQueue)
        .switch()
        .catch(e => O.just({}))
    }
  }
  run(main, {
    sqs: makeSQSDriver(),
    url: (url$) => {
      url$.forEach(url => {
        t.ok(url && /amazonaws.com/.test(url), 'Get url')
        QueueUrl = url
      })
    },
    result: (response$) => {
      response$.subscribe(r => {
        t.ok(r, 'Queue purged')
        t.end()
      })
    }
  })
})

test('Send two messages to Queue', (t) => {
  t.plan(2)
  const main = ({sqs}) => {
    return {
      sqs: O.timer(0, 100).map(x => ({
        method: 'sendMessage',
        params: {MessageBody: 'message' + x, QueueUrl}
      })).take(2),
      result: sqs.flatMap(_ => _)
    }
  }
  run(main, {
    sqs: makeSQSDriver(),
    result: (response$) => {
      response$.forEach(r => {
        t.ok(r.MessageId, 'message sent')
      })
    }
  })
})


test('Poll one messages', (t) => {
  const main = ({sqs}) => {
    console.log('main')
    return {
      result: sqs.poll({
          QueueUrl,
          WaitTimeSeconds: 1
        })
        .switch()
        .filter(x => x.Messages).take(1)
    }
  }
  run(main, {
    sqs: makeSQSDriver(),
    result: (r$) => {
      r$.forEach(r => {
        t.ok(r.Messages[0].MessageId, 'message received')
        t.end()
      })
    }
  })
})

test('Get one messages', (t) => {
  const main = ({sqs}) => {
    return {
      result: sqs.get({QueueUrl}).take(1)
    }
  }
  run(main, {
    sqs: makeSQSDriver(),
    result: (r$) => {
      r$.forEach(r => {
        t.ok(r.Messages[0].MessageId, 'message received')
        t.end()
      })
    }
  })
})


test('Delete queue', (t) => {
  const main = ({sqs}) => {
    return {
      sqs: O.just(1).map(() => ({
        deleteQueue: {QueueUrl}
      })),
      result: sqs.switch()
    }
  }
  run(main, {
    sqs: makeSQSDriver(),
    result: (r$) => {
      r$.forEach(r => {
        t.ok(r.ResponseMetadata, 'Queue deleted')
        t.end()
      })
    }
  })
})
