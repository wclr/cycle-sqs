'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.makeSQSDriver = undefined;

var _rx = require('rx');

var _awsSdk = require('aws-sdk');

var _awsSdk2 = _interopRequireDefault(_awsSdk);

var _cycleAsyncDriver = require('cycle-async-driver');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var makeSQSDriver = exports.makeSQSDriver = function makeSQSDriver(config) {
  var sqs = new _awsSdk2.default.SQS(config);

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
      throw new Error('Illegal SQS method ' + method);
    }
    return _rx.Observable.fromNodeCallback(sqs[method], sqs)(params);
  };

  return function sqsDriver(request$) {
    var response$$ = (0, _cycleAsyncDriver.createDriver)(createResponse$)(request$);

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
    // more simple version
    // that returns plain stream with messages
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
