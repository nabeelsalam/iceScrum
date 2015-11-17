/*
 * Copyright (c) 2015 Kagilum SAS.
 *
 * This file is part of iceScrum.
 *
 * iceScrum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License.
 *
 * iceScrum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with iceScrum.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Authors:
 *
 * Vincent Barrier (vbarrier@kagilum.com)
 * Nicolas Noullet (nnoullet@kagilum.com)
 *
 */

var services = angular.module('services', ['restResource']);

services.factory('AuthService', ['$http', '$rootScope', 'FormService', function($http, $rootScope, FormService) {
    return {
        login: function(credentials) {
            return $http.post($rootScope.serverUrl + '/j_spring_security_check', credentials, {
                headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
                transformRequest: function(data) {
                    return angular.isObject(data) && String(data) !== '[object File]' ? FormService.formObjectData(data) : data;
                }
            })
        }
    };
}]).service('Session', ['$timeout', '$http', '$rootScope', 'UserService', 'USER_ROLES', 'User', 'Project', 'PushService', 'IceScrumEventType', function($timeout, $http, $rootScope, UserService, USER_ROLES, User, Project, PushService, IceScrumEventType) {
    var self = this;
    self.user = new User();
    self.project = new Project();
    self.unreadActivitiesCount = 0;
    var defaultRoles = {
        productOwner: false,
        scrumMaster: false,
        teamMember: false,
        stakeHolder: false,
        admin: false
    };
    self.roles = _.clone(defaultRoles);

    var reload = function() {
        $timeout(function() {
            document.location.reload(true);
        }, 2000);
    };

    this.create = function() {
        UserService.getCurrent()
            .then(function(data) {
                if (data.user != "null") {
                    _.extend(self.user, data.user);
                    _.merge(self.roles, data.roles);
                    UserService.getUnreadActivities(self.user)
                        .then(function(data) {
                            self.unreadActivitiesCount = data.unreadActivitiesCount;
                        });
                }
            });
    };

    this.setUser = function(user) {
        _.extend(self.user, user);
        PushService.registerListener('activity', IceScrumEventType.CREATE, function(activity) {
            self.unreadActivitiesCount += 1;
        });
        PushService.registerListener('user', IceScrumEventType.UPDATE, function(user) {
            if (user.updatedRole) {
                var updatedRole = user.updatedRole;
                var project = updatedRole.product;
                if (updatedRole.role == undefined) {
                    $rootScope.notifyWarning($rootScope.message('is.user.role.removed.product') + ' ' + project.name);
                    if (project.id == self.project.id) {
                        $timeout(function() {
                            document.location = $rootScope.serverUrl
                        }, 2000);
                    }
                } else if (updatedRole.oldRole == undefined) {
                    $rootScope.notifySuccess($rootScope.message('is.user.role.added.product') + ' ' + project.name);
                    if (project.id == self.project.id) {
                        reload();
                    }
                } else {
                    $rootScope.notifySuccess($rootScope.message('is.user.role.updated.product') + ' ' + project.name);
                    if (project.id == self.project.id) {
                        reload();
                    }
                }
            }
        });
    };

    this.poOrSm = function() {
        return self.roles.productOwner || self.roles.scrumMaster;
    };
    this.po = function() {
        return self.roles.productOwner;
    };
    this.sm = function() {
        return self.roles.scrumMaster;
    };
    this.admin = function() {
        return self.roles.admin;
    };
    this.authenticated = function() {
        return !_.isEmpty(self.user);
    };
    this.inProduct = function() {
        return self.roles.productOwner || self.roles.scrumMaster || self.roles.teamMember;
    };
    this.tmOrSm = function() {
        return self.roles.scrumMaster || self.roles.teamMember;
    };
    this.creator = function(item) {
        return this.authenticated && !_.isEmpty(item) && !_.isEmpty(item.creator) && self.user.id == item.creator.id;
    };
    this.owner = function(item) {
        return !_.isEmpty(item) && !_.isEmpty(item.owner) && self.user.id == item.owner.id;
    };
    // TODO remove, user role change for dev only
    this.changeRole = function(newUserRole) {
        var newRoles = {};
        switch (newUserRole) {
            case USER_ROLES.PO_SM:
                newRoles.productOwner = true;
                newRoles.scrumMaster = true;
                break;
            case USER_ROLES.PO:
                newRoles.productOwner = true;
                break;
            case USER_ROLES.SM:
                newRoles.scrumMaster = true;
                break;
            case USER_ROLES.TM:
                newRoles.teamMember = true;
                break;
        }
        newRoles.stakeHolder = true;
        _.merge(self.roles, defaultRoles, newRoles);
    };

    this.setProject = function(project) {
        _.extend(self.project, project);
        PushService.registerListener('product', IceScrumEventType.UPDATE, function(updatedProject) {
            var localProject = self.project;
            if (updatedProject.pkey != localProject.pkey) {
                $rootScope.notifyWarning('todo.is.ui.project.updated.pkey');
                document.location = document.location.href.replace(localProject.pkey, updatedProject.pkey);
            } else if (updatedProject.preferences.hidden && !localProject.preferences.hidden && !self.inProduct()) {
                $rootScope.notifyWarning('todo.is.ui.project.updated.visibility');
                reload();
            } else if (updatedProject.preferences.archived != localProject.preferences.archived) {
                if (updatedProject.preferences.archived == true) {
                    $rootScope.notifyWarning('todo.is.ui.project.updated.archived');
                } else {
                    $rootScope.notifyWarning('todo.is.ui.project.updated.unarchived');
                }
                reload();
            } else {
                angular.extend(localProject, updatedProject);
            }
        });
        PushService.registerListener('product', IceScrumEventType.DELETE, function() {
            $rootScope.notifyWarning('todo.is.ui.project.deleted');
            reload();
        });
    };

    this.getProject = function() {
        return self.project;
    };

    this.getLanguages = function() {
        return $http.get($rootScope.serverUrl + '/scrumOS/languages', { cache: true }).then(function(response) {
            return response.data;
        })
    };
    this.getTimezones = function() {
        return $http.get($rootScope.serverUrl + '/scrumOS/timezones', { cache: true }).then(function(response) {
            return response.data;
        })
    };
}]).service('FormService', ['$filter', function($filter) {
    var self = this;
    this.previous = function(list, element) {
        var ind = list.indexOf(element);
        return ind > 0 ? list[ind - 1] : null;
    };
    this.next = function(list, element) {
        var ind = list.indexOf(element);
        return ind + 1 <= list.length ? list[ind + 1] : null;
    };
    this.formObjectData = function(obj, prefix) {
        var query = '', name, value, fullSubName, subName, subValue, innerObj, i, _prefix;
        _prefix = prefix ? prefix : (obj['class'] ? obj['class'] + '.' : '');
        function decapitalize(str) {
            return str.charAt(0).toLowerCase() + str.substring(1);
        }
        _prefix = decapitalize(_prefix);
        for (name in obj) {
            value = obj[name];
            if (value instanceof Array && !_.endsWith(name, '_ids')) {
                for (i = 0; i < value.length; ++i) {
                    subValue = value[i];
                    innerObj = {};
                    innerObj[name] = subValue;
                    query += self.formObjectData(innerObj, _prefix) + '&';
                }
            } else if (value instanceof Date) {
                var encodedDate = $filter('dateToIso')(value);
                query += encodeURIComponent(_prefix + name) + '=' + encodeURIComponent(encodedDate) + '&';
            } else if (value instanceof Object) {
                for (subName in value) {
                    if (subName != 'class' && !_.startsWith(subName, '$')) {
                        subValue = value[subName];
                        fullSubName = name + '.' + subName;
                        innerObj = {};
                        innerObj[fullSubName] = subValue;
                        query += self.formObjectData(innerObj, _prefix) + '&';
                    }
                }
            } else if (value !== undefined
                && value !== null
                    //no class info needed
                && !_.contains(['class', 'uid', 'lastUpdated', 'dateCreated'], name)
                    //no angular object
                && !_.startsWith(name, '$')
                    //no custom count / html values
                && !_.endsWith(name, '_count') && !_.endsWith(name, '_html')) {
                query += encodeURIComponent(_prefix + name) + '=' + encodeURIComponent(value) + '&';
            }
        }
        return query.length ? query.substr(0, query.length - 1) : query;
    };
    this.selectTagsOptions = {
        tags: [],
        multiple: true,
        array_tags: true,
        tokenSeparators: [",", " "],
        createSearchChoice: function(term) {
            return {id: term, text: term};
        },
        formatSelection: function(object) {
            return '<a href="#finder/?tag=' + object.text + '" onclick="document.location=this.href;"> <i class="fa fa-tag"></i> ' + object.text + '</a>';
        },
        ajax: {
            url: 'finder/tag',
            cache: 'true',
            data: function(term) {
                return {term: term};
            },
            results: function(data) {
                var results = [];
                angular.forEach(data, function(result) {
                    results.push({id: result, text: result});
                });
                return {results: results};
            }
        }
    };
}]).service('BundleService', [function() {
    this.bundles = {};
    this.initBundles = function(bundles) {
        this.bundles = bundles;
    };
    this.getBundle = function(bundleName) {
        return this.bundles[bundleName];
    }
}]);

var restResource = angular.module('restResource', ['ngResource']);
restResource.factory('Resource', ['$resource', 'FormService', function($resource, FormService) {
    return function(url, params, methods) {
        var defaultParams = {
            id: '@id'
        };
        var transformStringToDate = function(item) {
            if (item.hasOwnProperty('startDate')) {
                item.startDate = new Date(item.startDate);
            }
            if (item.hasOwnProperty('endDate')) {
                item.endDate = new Date(item.endDate);
            }
        };
        var arrayInterceptor = {
            response: function(response) {
                _.each(response.resource, transformStringToDate);
                return response.resource;
            }
        };
        var singleInterceptor = {
            response: function(response) {
                transformStringToDate(response.resource);
                return response.resource;
            }
        };
        var transformRequest = function(data) {
            return angular.isObject(data) && String(data) !== '[object File]' ? FormService.formObjectData(data) : data;
        };
        var defaultMethods = {
            save: {
                method: 'post',
                isArray: false,
                headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
                transformRequest: transformRequest,
                interceptor: singleInterceptor
            },
            updateArray: {
                method: 'post',
                isArray: true,
                headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
                transformRequest: transformRequest,
                interceptor: arrayInterceptor
            },
            get: {
                method: 'get',
                cache: true,
                interceptor: singleInterceptor
            },
            query: {
                method: 'get',
                isArray: true,
                cache: true,
                interceptor: arrayInterceptor
            }
        };
        defaultMethods.update = angular.copy(defaultMethods.save); // for the moment there is no difference between save & update
        return $resource(url, angular.extend(defaultParams, params), angular.extend(defaultMethods, methods));
    };
}]);