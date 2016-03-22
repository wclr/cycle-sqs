import {Observable as O} from 'rx'
import aws from 'aws-sdk'
import {createDriver} from 'cycle-async-driver'

export const makeSQSDriver = (config) => {
  var sqs = new aws.SQS(config);

  const createResponse$ = (request) => {
    var method = request.method
    var params = request.params
    if (!method){
      method = Object.keys(request).filter(m => 
        typeof sqs[m] === 'function'  
      )[0]
      params = request[method]
    }
    if (typeof sqs[method] !== 'function'){
      throw (new Error(`Illegal SQS method ${method}`))
    }
    return O.fromNodeCallback(sqs[method], sqs)(params)
  }

  return function sqsDriver(request$) {
    let response$$ = createDriver(createResponse$)(request$)

    response$$.poll = (params) => {
      return O.create(observer => {
        let stopped = false
        const receive = () => {
          let source = O.fromNodeCallback((params, cb) => {
            sqs.receiveMessage(params, (err, result) => {
              cb(err, result)
              !stopped && receive()
            })
          })(params)
          observer.onNext(source)
        }
        receive()
        return () => {
          stopped = true
        }
      })
    }
    // more simple version
    // that returns plain stream with messages
    response$$.get = (params) => {
      return O.create(observer => {
        let stopped = false
        const receive = () => {
          sqs.receiveMessage(params, (err, result) => {
            if (result && result.Messages){
              observer.onNext(result)  
            }
            !stopped && receive()
          })
        }
        receive()
        return () => {
          stopped = true
        }
      })
    }
    return response$$
  }
}
