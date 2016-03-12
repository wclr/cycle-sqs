'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.makeSQSDriver = undefined;

var _rx = require('rx');

var _awsSdk = require('aws-sdk');

var _awsSdk2 = _interopRequireDefault(_awsSdk);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var isolateSink = function isolateSink(request$, scope) {
  return request$.map(function (query) {
    request._namespace = request._namespace || [];
    request._namespace.push(scope);
    return request;
  });
};

var isolateSource = function isolateSource(response$$, scope) {
  var isolated$$ = response$$.filter(function (res$) {
    return Array.isArray(res$.query._namespace) && res$.query._namespace.indexOf(scope) !== -1;
  });
  isolated$$.isolateSource = isolateSource;
  isolated$$.isolateSink = isolateSink;
  return isolated$$;
};

var makeSQSDriver = exports.makeSQSDriver = function makeSQSDriver(config) {
  var sqs = new _awsSdk2.default.SQS(config);
  var eager = true;
  var createResponse$ = function createResponse$(request) {
    var method = request.method;
    var params = request.params;
    if (!method) {
      method = Object.keys(request).filter(function (m) {
        return typeof sqs[m] === 'function';
      })[0];
      params = request[method];
    }
    if (typeof sqs[method] !== 'function') {
      throw 'Illegal SQS method ' + method;
    }
    return _rx.Observable.create(function (observer) {
      sqs[method](params, function (err, result) {
        err ? observer.onError(err) : observer.onNext(result);
      });
    });
  };

  return function sqsDriver(request$) {
    var response$$ = request$.map(function (request) {
      var response$ = createResponse$(request);
      var doEager = request.eager !== undefined ? request.eager : eager;
      if (doEager) {
        response$ = response$.replay(null, 1);
        response$.connect();
      }
      response$.request = request;
      return response$;
    }).replay(null, 1);

    response$$.connect();
    response$$.isolateSource = isolateSource;
    response$$.isolateSink = isolateSink;
    response$$.poll = function (params) {

      return _rx.Observable.create(function (observer) {
        var stopped = false;
        var receive = function receive() {

          var source = _rx.Observable.fromNodeCallback(function (params, cb) {
            sqs.receiveMessage(params, function (err, result) {
              cb(err, result);
              !stopped && receive();
            });
          })(params);
          observer.onNext(source);
        };
        receive();
        return function () {
          stopped = true;
        };
      });
    };
    // more simple version that returns plain stream with messages
    response$$.get = function (params) {
      return _rx.Observable.create(function (observer) {
        var stopped = false;
        var receive = function receive() {
          sqs.receiveMessage(params, function (err, result) {
            if (result && result.Messages) {
              observer.onNext(result);
            }
            !stopped && receive();
          });
        };
        receive();
        return function () {
          stopped = true;
        };
      });
    };

    return response$$;
  };
};
