/*
 * Copyright (c) 2014 Kagilum SAS.
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
services.factory('Task', [ 'Resource', function($resource) {
    return $resource('task/:type/:typeId/:id/:action');
}]);

services.service("TaskService", ['$q', '$state', '$rootScope', 'Task', 'Session', 'IceScrumEventType', 'PushService', 'TaskStatesByName', 'SprintStatesByName', 'StoryStatesByName', function($q, $state, $rootScope, Task, Session, IceScrumEventType, PushService, TaskStatesByName, SprintStatesByName, StoryStatesByName) {
    var self = this;
    this.getCrudMethods = function(obj) {
        var crudMethods = {};
        crudMethods[IceScrumEventType.CREATE] = function(task) {
            if (obj.class == 'Story' ? task.parentStory.id == obj.id : task.sprint.id == obj.id) {
                var existingTask = _.find(obj.tasks, {id: task.id});
                if (existingTask) {
                    angular.extend(existingTask, task);
                } else {
                    obj.tasks.push(new Task(task));
                    obj.tasks_count = obj.tasks.length;
                }
            }
        };
        crudMethods[IceScrumEventType.UPDATE] = function(task) {
            angular.extend(_.find(obj.tasks, { id: task.id }), task);
        };
        crudMethods[IceScrumEventType.DELETE] = function(task) {
            if ($state.includes("taskBoard.task.details", {taskId: task.id}) ||
                ($state.includes("taskBoard.task.multiple") && _.contains($state.params.taskListId.split(','), task.id.toString()))) {
                $state.go('taskBoard');
            }
            _.remove(obj.tasks, { id: task.id });
            obj.tasks_count = obj.tasks.length;
        };
        return crudMethods;
    };
    this.save = function(task, sprintOrStory) {
        task.class = 'task';
        return Task.save(task, self.getCrudMethods(sprintOrStory)[IceScrumEventType.CREATE]).$promise;
    };
    this.update = function(task, obj) {
        return task.$update(self.getCrudMethods(obj)[IceScrumEventType.UPDATE]);
    };
    this.block = function(task, sprint) {
        task.blocked = true;
        return self.update(task, sprint);
    };
    this.unBlock = function(task, sprint) {
        task.blocked = false;
        return self.update(task, sprint);
    };
    this.take = function(task, sprint) {
        return Task.update({id: task.id, action: 'take'}, {}, self.getCrudMethods(sprint)[IceScrumEventType.UPDATE]).$promise;
    };
    this.release = function(task, sprint) {
        return Task.update({id: task.id, action: 'unassign'}, {}, self.getCrudMethods(sprint)[IceScrumEventType.UPDATE]).$promise;
    };
    this['delete'] = function(task, sprintOrStory) {
        return task.$delete(self.getCrudMethods(sprintOrStory)[IceScrumEventType.DELETE]);
    };
    this.copy = function(task, obj) {
        return Task.update({id: task.id, action: 'copy'}, {}, self.getCrudMethods(obj)[IceScrumEventType.CREATE]).$promise;
    };
    this.list = function(obj) {
        var params = {typeId: obj.id, type: obj.class.toLowerCase()};
        if ($rootScope.app.context) {
            _.merge(params, {'context.type': $rootScope.app.context.type, 'context.id': $rootScope.app.context.id});
        }
        return Task.query(params, function(data) {
            obj.tasks = data;
            obj.tasks_count = obj.tasks.length;
            var crudMethods = self.getCrudMethods(obj);
            _.each(crudMethods, function(crudMethod, eventType) {
                PushService.registerListener('task', eventType, crudMethod);
            });
        }).$promise;
    };
    this.authorizedTask = function(action, task) {
        switch (action) {
            case 'create':
            case 'copy':
                return Session.inProduct() &&
                      (!task || !task.parentStory && task.sprint.state != SprintStatesByName.DONE || task.parentStory && task.parentStory.state != StoryStatesByName.DONE);
            case 'rank':
                return Session.sm() || Session.responsible(task) || Session.creator(task); // no check on sprint & story state because rank cannot be called from there
            case 'update':
                return (Session.sm() || Session.responsible(task) || Session.creator(task)) && task.state != TaskStatesByName.DONE;
            case 'delete':
                return (Session.sm() || Session.responsible(task) || Session.creator(task)) && (!task.sprint || task.sprint.state != SprintStatesByName.DONE);
            case 'block':
                return !task.blocked && (Session.sm() || Session.responsible(task)) && task.state != TaskStatesByName.DONE && task.sprint.state == SprintStatesByName.IN_PROGRESS;
            case 'unBlock':
                return task.blocked && (Session.sm() || Session.responsible(task)) && task.state != TaskStatesByName.DONE;
            case 'take':
                return !Session.responsible(task) && task.state != TaskStatesByName.DONE;
            case 'release':
                return Session.responsible(task) && task.state != TaskStatesByName.DONE;
            default:
                return false;
        }
    };
    this.listByUser = function() {
        return Task.query({action: 'listByUser'}).$promise;
    };
}]);