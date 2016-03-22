import {run} from '@cycle/core'
import {makeSQSDriver} from '../lib/index'
import {Observable as O} from 'rx'
import isolate from '@cycle/isolate'
import test from 'tape'
import aws from 'aws-sdk'
var crypto = require('crypto')

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
          .catch(e => O.just({}))
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

test('Send two messages to Queue using isolated methods', (t) => {
  const SendMessage = ({message, sqs}) => {
    return {
      sqs: O.just(message).map(message => ({
        method: 'sendMessage',
        params: {MessageBody: message, QueueUrl}
      })),
      result: sqs.flatMap(_ => _)
        .map(response => ({
          ...response,
          _hash: crypto.createHash('md5')
            .update(message).digest('hex')
        }))
    }
  }
  const main = ({sqs}) => {
    var sendMessage1 = isolate(SendMessage)({sqs, message: 'message 1'})
    var sendMessage2 = isolate(SendMessage)({sqs, message: 'message 2'})
    return {
      sqs: O.merge(sendMessage1.sqs, sendMessage2.sqs.delay(1)),
      result: O.merge([
        sendMessage1.result, sendMessage2.result
      ])
    }
  }
  let count = 0
  run(main, {
    sqs: makeSQSDriver(),
    result: (response$) => {
      response$.forEach(r => {
        t.ok(r.MD5OfMessageBody === r._hash, 'message sent, isolated response is ok for message' + (count + 1) )
        if (++count === 2){
          setTimeout(() => {
            t.is(count, 2, 'responses count is ok')
            t.end()
          })
        }
      })
    }
  })
})

test('Poll one messages', (t) => {
  const main = ({sqs}) => {
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
