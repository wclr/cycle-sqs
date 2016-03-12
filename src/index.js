import {Observable as O} from 'rx'
import aws from 'aws-sdk'

const isolateSink = (request$, scope) => {
  return request$.map((query) => {
    request._namespace = request._namespace || []
    request._namespace.push(scope)
    return request
  })
}

const isolateSource = (response$$, scope) => {
  var isolated$$ = response$$.filter((res$) => {
    return Array.isArray(res$.query._namespace)
      && res$.query._namespace.indexOf(scope) !== -1
  });
  isolated$$.isolateSource = isolateSource;
  isolated$$.isolateSink = isolateSink;
  return isolated$$;
}

export const makeSQSDriver = (config) => {
  var sqs = new aws.SQS(config);
  var eager = true
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
      throw `Illegal SQS method ${method}`
    }
    return O.create(observer => {
      sqs[method](params, (err, result) => {
        err
          ? observer.onError(err)
          : observer.onNext(result)
      })
    })
  }
  
  return function sqsDriver(request$) {
    let response$$ = request$
      .map(request => {
        let response$ = createResponse$(request)
        let doEager = request.eager !== undefined ? request.eager : eager
        if (doEager) {
          response$ = response$.replay(null, 1)
          response$.connect()
        }
        response$.request = request
        return response$
      })
      .replay(null, 1)

    response$$.connect()
    response$$.isolateSource = isolateSource
    response$$.isolateSink = isolateSink
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
    // more simple version that returns plain stream with messages
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
