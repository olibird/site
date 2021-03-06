'use strict';

function BallotPickerCtrl($scope, $http, $location, $window) {
    var divisionPath = undefined;
    var division = {};
    var state = {};

    var storeURL = 'http://api.belowtheline.org.au/store';
    var pdfURL = 'http://api.belowtheline.org.au/pdf'

    $scope.orders = {};
    $scope.ballotOrders = {};
    $scope.parties = {};

    $scope.orderByGroup = true;

    $scope.saveURL = '';

    $scope.dirty = function(ordering) {
        return !(_.isEqual($scope.orders[ordering], $scope.ballotOrders[ordering]));
    };
    $scope.reset = function(ordering) {
        $scope.orders[ordering] = $scope.ballotOrders[ordering].slice();
    };

    $scope.showOrderByCandidate = function() {
        applyGroupOrdering();
        $scope.orderByGroup = false;
    };

    $scope.showOrderByGroup = function() {
        if(
            !$scope.dirty('state') ||
            $window.confirm("Are you sure? You'll lose any changes you made to candidate ordering.")
        ) {
            $scope.reset('state');
            $scope.orderByGroup = true;
        }
    };

    function makeTicket(order, ballotOrder) {
        var ticket = [];

        angular.forEach(ballotOrder, function (candidate, idx) {
            ticket.push(_.indexOf(order, candidate) + 1);
        });

        return ticket;
    }

    function unmakeTicket(ticket, ballotOrder) {
        var order = _.zip(ticket, ballotOrder);
        order.sort(function (a, b) { return a[0] - b[0]; });
        return _.map(order, function (a) { return a[1]; });
    }

    $scope.saveBallot = function () {
        var ballot = {
            division: divisionPath.slice(1),
            division_ticket: makeTicket($scope.orders.division,
                                        $scope.ballotOrders.division),
            order_by_group: $scope.orderByGroup
        };

        if ($scope.orderByGroup) {
            ballot.senate_ticket = makeTicket($scope.orders.group,
                                              $scope.ballotOrders.group);
        } else {
            ballot.senate_ticket = makeTicket($scope.orders.state,
                                              $scope.ballotOrders.state);
        }

        $http.post(storeURL, angular.toJson(ballot), {
            "Content-Type": "application/json"
        }).success(function (data) {
            $scope.saveURL = "http://btl.tv/b/" + data.ballot_id;
        });
    }

    $scope.downloadPDF = function () {
        if ($scope.orderByGroup) {
          applyGroupOrdering();
        }

        var division_ticket = makeTicket($scope.orders.division,
                                         $scope.ballotOrders.division);
        var senate_ticket = makeTicket($scope.orders.state,
                                       $scope.ballotOrders.state);

        function make_input(name, value) {
            return '<input type="hidden" name="' + name + '" value="' + value + '"/>';
        }

        var form = '<form action="' + pdfURL + '" method="POST">' +
                    make_input('division', divisionPath.slice(1)) +
                    make_input('state', division.division.state.split('/')[1]) +
                    make_input('division_ticket', division_ticket.join(',')) +
                    make_input('senate_ticket', senate_ticket.join(',')) +
                    '</form>';
        $(form).appendTo('body').submit().remove();
    }

    var initialize = function() {
        divisionPath = $location.path();
        $http.get('/division' + divisionPath + '.json').success(function(data) {
            division = data;
            $scope.divisionName = data.division.name
            $scope.orders.division = data.candidates;
            $scope.ballotOrders.division = data.candidates.slice();

            $http.get('/' + division.division.state + '.json').success(function(data) {
                state = data;
                $scope.orders.state = _.map(data.ballot_order, function(id) {
                    return data.candidates[id];
                });
                $scope.ballotOrders.state = $scope.orders.state.slice();

                var groupNames = _.without(_.uniq(_.pluck($scope.orders.state, 'group')), 'UG');
                var ungroupedCandidates = _.where($scope.orders.state, { group: 'UG' });
                $scope.orders.group = _.map(groupNames, function(name) { return state.groups[name]; });
                angular.forEach(ungroupedCandidates, function(candidate, idx) {
                  var newGroup = {
                    name: candidate.first_name + ' ' + candidate.last_name,
                  };
                  if(candidate.party) {
                    newGroup.parties = [ candidate.party ];
                  }

                  var newGroupName = 'UG' + (idx + 1);
                  state.groups[newGroupName] = newGroup;
                  $scope.orders.group = $scope.orders.group.concat(newGroup);
                  candidate.group = newGroupName;
                });
                $scope.ballotOrders.group = $scope.orders.group.slice();

                if ($location.hash()) {
                    loadBallot();
                }
            });
        });

        $http.get('/parties.json').success(function(data) {
            $scope.parties = data;
        });

        function loadBallot() {
            $http.get(storeURL + '/' + $location.hash(), {
                headers: {'Accept': 'application/json'}
            }).success(function (data) {
                if (divisionPath != '/' + data.division) {
                    return;
                }

                $scope.orders.division = unmakeTicket(data.division_ticket,
                                                      $scope.ballotOrders.division);

                $scope.orderByGroup = data.order_by_group;
                if (data.order_by_group) {
                    $scope.orders.group = unmakeTicket(data.senate_ticket,
                                                       $scope.ballotOrders.group);
                } else {
                    $scope.orders.state = unmakeTicket(data.senate_ticket,
                                                       $scope.ballotOrders.state);
                }
            }).error(function () {
                console.log('poot');
            });
        }
    };

    var applyGroupOrdering = function() {
        $scope.orders.state = _.sortBy($scope.orders.state, function(candidate) {
            return _.indexOf($scope.orders.group, state.groups[candidate.group]);
        });
    };

    initialize();
}
