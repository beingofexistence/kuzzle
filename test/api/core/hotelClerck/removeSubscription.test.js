var
  should = require('should'),
  winston = require('winston'),
  RequestObject = require.main.require('lib/api/core/models/requestObject'),
  params = require('rc')('kuzzle'),
  Kuzzle = require.main.require('lib/api/Kuzzle');

require('should-promised');

describe('Test: hotelClerk.removeSubscription', function () {

  var
    kuzzle,
    roomId,
    connection = {id: 'connectionid'},
    badConnection = {id: 'badconnectionid'},
    roomName1 = 'roomName1',
    roomName2 = 'roomName2',
    collection = 'user',
    filter1 = {
      term: {
        firstName: 'Ada'
      }
    },
    filter2 = {
      terms: {
        firstName: ['Ada', 'Grace']
      }
    },
    requestObject1 = new RequestObject({
      controller: 'subscribe',
      action: 'on',
      requestId: roomName1,
      collection: collection,
      body: filter1
    }),
    requestObject2 = new RequestObject({
      controller: 'subscribe',
      action: 'on',
      requestId: roomName2,
      collection: collection,
      body: filter2
    }),
    unsubscribeRequest,
    notified,
    mockupNotifier = function (roomId, notification) {
      notified = { roomId: roomId, notification: notification };
    };


  beforeEach(function (done) {
    notified = null;
    kuzzle = new Kuzzle();
    kuzzle.log = new (winston.Logger)({transports: [new (winston.transports.Console)({level: 'silent'})]});
    kuzzle.removeAllListeners();
    kuzzle.start(params, {dummy: true})
      .then(function () {
        kuzzle.notifier.notify = mockupNotifier;
        return kuzzle.hotelClerk.addSubscription(requestObject1, connection);
      })
      .then(function (realTimeResponseObject) {
        roomId = realTimeResponseObject.roomId;
        unsubscribeRequest = new RequestObject({
          controller: 'subscribe',
          action: 'off',
          collection: collection,
          body: { roomId: roomId }
        });

        done();
      });
  });

  it('should do nothing when a bad connectionId is given', function () {
    return should(kuzzle.hotelClerk.removeSubscription(requestObject1, badConnection)).be.rejected();
  });

  it('should do nothing when a badly formed unsubscribe request is provided', function () {
    var badRequestObject = new RequestObject({
      controller: 'subscribe',
      action: 'on',
      collection: collection,
      body: filter1
    });

    return should(kuzzle.hotelClerk.removeSubscription(badRequestObject, connection)).be.rejected();
  });

  it('should do nothing if a bad room name is given', function () {
    var badRequestObject = new RequestObject({
      controller: 'subscribe',
      action: 'on',
      collection: collection,
      body: { roomId: 'this is not a room ID' }
    });

    return should(kuzzle.hotelClerk.removeSubscription(badRequestObject, connection)).be.rejected();
  });

  it('should clean up customers, rooms and filtersTree object', function () {
    return kuzzle.hotelClerk.removeSubscription(unsubscribeRequest, connection)
      .then(function () {
        should(kuzzle.dsl.filtersTree).be.an.Object();
        should(kuzzle.dsl.filtersTree).be.empty();

        should(kuzzle.hotelClerk.rooms).be.an.Object();
        should(kuzzle.hotelClerk.rooms).be.empty();

        should(kuzzle.hotelClerk.customers).be.an.Object();
        should(kuzzle.hotelClerk.customers).be.empty();
      });
  });

  it('should not delete all subscriptions when we want to just remove one', function () {
    return kuzzle.hotelClerk.addSubscription(requestObject2, connection)
      .then(function () {
        return kuzzle.hotelClerk.removeSubscription(unsubscribeRequest, connection)
          .then(function () {
            should(kuzzle.dsl.filtersTree).be.an.Object();
            should(kuzzle.dsl.filtersTree).not.be.empty();

            should(kuzzle.hotelClerk.rooms).be.an.Object();
            should(kuzzle.hotelClerk.rooms).not.be.empty();

            should(kuzzle.hotelClerk.customers).be.an.Object();
            should(kuzzle.hotelClerk.customers).not.be.empty();
          });
      });
  });

  it('should send a notification to other users connected on that room', function () {
    var roomId;
    return kuzzle.hotelClerk.addSubscription(requestObject1, { id: 'anotherconnection'})
      .then(function (createdRoom) {
        roomId = createdRoom.roomId;
        return kuzzle.hotelClerk.removeSubscription(unsubscribeRequest, connection);
      })
      .then(function () {
        should(notified.roomId).be.exactly(roomId);
        should(notified.notification.error).be.null();
        should(notified.notification.result.count).be.exactly(1);
      });
  });

  it('should call a function leave when the type is websocket', function () {
    var leavedRooms = [];

    connection.type = 'websocket';
    kuzzle.io = {
      sockets: {
        connected: {
          connectionid: {
            leave: function (roomId) {
              leavedRooms.push(roomId);
            }
          }
        }
      }
    };
    kuzzle.notifier = {notify: function () {}};

    return kuzzle.hotelClerk.removeSubscription(unsubscribeRequest, connection)
      .then(function () {
        should(leavedRooms).containEql(roomId);
        delete connection.type;
      });
  });
});
