/*
 * Copyright (c) 2016 Kagilum SAS.
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

extensibleController('taskBoardCtrl', ['$scope', '$state', '$filter', 'UserService', 'StoryService', 'TaskService', 'SprintService', 'Session', 'SprintStatesByName', 'StoryStatesByName', 'TaskStatesByName', 'TaskTypesByName', 'project', 'sprint', 'releases', function($scope, $state, $filter, UserService, StoryService, TaskService, SprintService, Session, SprintStatesByName, StoryStatesByName, TaskStatesByName, TaskTypesByName, project, sprint, releases) {
    $scope.viewName = 'taskBoard';
    // Functions
    $scope.isSelected = function(selectable) {
        if (selectable.class == "Story") {
            return $state.params.storyId ? $state.params.storyId == selectable.id : false;
        } else {
            return $state.params.taskId ? $state.params.taskId == selectable.id : false;
        }
    };
    $scope.hasSelected = function() {
        return $state.params.taskId != undefined;
    };
    $scope.isSortableTaskBoard = function(sprint) {
        return Session.authenticated() && sprint.state < SprintStatesByName.DONE;
    };
    $scope.isSortingTaskBoard = function(sprint) {
        return $scope.isSortableTaskBoard(sprint) && $scope.currentSprintFilter.id == 'allTasks' && !$scope.hasContextOrSearch();
    };
    $scope.isSortingStory = function(story) {
        return story.state < StoryStatesByName.DONE;
    };
    $scope.openSprintUrl = function(sprint, keepDetails) {
        var stateName = 'taskBoard';
        if (keepDetails && $state.current.name == 'taskBoard.details' || !keepDetails && $state.current.name != 'taskBoard.details') {
            stateName += '.details';
        }
        return $state.href(stateName, {sprintId: sprint.id});
    };
    $scope.openNewTaskByStory = function(story) {
        $state.go('taskBoard.task.new', {taskCategory: _.pick(story, ['id', 'name', 'class'])});
    };
    $scope.openNewTaskByType = function(type) {
        $state.go('taskBoard.task.new', {taskCategory: {id: type, name: $filter('i18n')(type, 'TaskTypes')}});
    };
    $scope.copyRecurrentTasks = function(sprint) {
        SprintService.copyRecurrentTasks(sprint, project);
    };
    $scope.refreshTasks = function() {
        var tasks;
        tasks = $scope.sprint.tasks;
        $scope.taskCountByState = _.countBy(tasks, 'state');
        switch ($scope.sprint.state) {
            case SprintStatesByName.TODO:
                $scope.sprintTaskStates = [TaskStatesByName.TODO];
                break;
            case SprintStatesByName.IN_PROGRESS:
                $scope.sprintTaskStates = $scope.taskStates;
                break;
            case SprintStatesByName.DONE:
                $scope.sprintTaskStates = [TaskStatesByName.DONE];
                break;
        }
        var partitionedTasks = _.partition(tasks, function(task) {
            return _.isNull(task.parentStory);
        });
        var groupByStateAndSort = function(tasksDictionnary) {
            return _.mapValues(tasksDictionnary, function(tasks) {
                return _.mapValues(_.groupBy(tasks, 'state'), function(tasks) {
                    return _.sortBy($filter('filter')(tasks, $scope.currentSprintFilter.filter), 'rank');
                });
            });
        };
        $scope.tasksByTypeByState = groupByStateAndSort(_.groupBy(partitionedTasks[0], 'type'));
        $scope.tasksByStoryByState = groupByStateAndSort(_.groupBy(partitionedTasks[1], 'parentStory.id'));
        var sprintStoriesIds = _.map($scope.sprint.stories, 'id');
        var allStoriesIds = _.union(sprintStoriesIds, _.map(partitionedTasks[1], 'parentStory.id'));
        var ghostStoriesIds = _.difference(allStoriesIds, sprintStoriesIds);
        if (ghostStoriesIds) {
            StoryService.getMultiple(ghostStoriesIds).then(function(ghostStories) {
                $scope.ghostStories = ghostStories;
            });
        }
        var fillGapsInDictionnary = function(dictionnary, firstLevelKeys, secondLevelKeys) {
            _.each(firstLevelKeys, function(firstLevelKey) {
                if (!dictionnary[firstLevelKey]) {
                    dictionnary[firstLevelKey] = {};
                }
                _.each(secondLevelKeys, function(secondLevelKey) {
                    if (!dictionnary[firstLevelKey][secondLevelKey]) {
                        dictionnary[firstLevelKey][secondLevelKey] = [];
                    }
                });
            });
        };
        fillGapsInDictionnary($scope.tasksByTypeByState, $scope.taskTypes, $scope.sprintTaskStates);
        fillGapsInDictionnary($scope.tasksByStoryByState, allStoriesIds, $scope.sprintTaskStates);
    };
    $scope.changeSprintFilter = function(sprintFilter) {
        $scope.currentSprintFilter = sprintFilter;
        $scope.refreshTasks();
        var editableUser = angular.copy(Session.user);
        editableUser.preferences.filterTask = sprintFilter.id;
        UserService.update(editableUser);
    };
    $scope.enableSortable = function() {
        $scope.clearContextAndSearch();
        $scope.changeSprintFilter(_.find($scope.sprintFilters, {id: 'allTasks'}));
    };
    $scope.storyFilter = function(story) {
        return $scope.currentSprintFilter.id == 'allTasks' || _.some($scope.tasksByStoryByState[story.id], function(tasks) {
            return tasks.length > 0;
        });
    };
    $scope.openStoryUrl = function(storyId) {
        return '#/' + $scope.viewName + ($state.params.sprintId ? '/' + $state.params.sprintId : '') + '/story/' + storyId;
    };
    $scope.selectStory = function(event, storyId) {
        if (angular.element(event.target).closest('.action, button, a').length == 0) {
            $state.go('taskBoard.story.details' + ($state.params.storyTabId ? '.tab' : ''), {storyId: storyId});
        }
    };
    $scope.tasksShown = function(taskState, typeOrStory) {
        var taskLimit = 5;
        if (taskState == TaskStatesByName.DONE && $scope.sprint.state < SprintStatesByName.DONE) {
            if (_.isObject(typeOrStory)) {
                var story = typeOrStory;
                return $scope.tasksByStoryByState[story.id][taskState].length < taskLimit || $scope.tasksShownByTypeOrStory.stories[story.id];
            } else {
                var type = typeOrStory;
                return $scope.tasksByTypeByState[type][taskState].length < taskLimit || $scope.tasksShownByTypeOrStory[type];
            }
        } else {
            return true;
        }
    };
    $scope.tasksHidden = function(taskState, typeOrStory) {
        var taskLimit = 5;
        if (taskState == TaskStatesByName.DONE && $scope.sprint.state < SprintStatesByName.DONE) {
            if (_.isObject(typeOrStory)) {
                var story = typeOrStory;
                return $scope.tasksByStoryByState[story.id][taskState].length >= taskLimit && $scope.tasksShownByTypeOrStory.stories[story.id];
            } else {
                var type = typeOrStory;
                return $scope.tasksByTypeByState[type][taskState].length >= taskLimit && $scope.tasksShownByTypeOrStory[type];
            }
        } else {
            return false;
        }
    };
    $scope.showTasks = function(typeOrStory, show) {
        if (_.isObject(typeOrStory)) {
            $scope.tasksShownByTypeOrStory.stories[typeOrStory.id] = show;
        } else {
            $scope.tasksShownByTypeOrStory[typeOrStory] = show;
        }
    };
    $scope.sprintRemainingTime = function(sprint) {
        return _.sumBy(sprint.tasks, 'estimation');
    };
    $scope.scrollToActiveSprint = function(open) {
        if (open) {
            var dropdown = angular.element('.sprints-dropdown');
            var ele = dropdown.find("li>a.active");
            var list = dropdown.find('.sprints-menu');
            var posi = list.scrollTop() + ele.offset().top - ele.innerHeight();
            list.animate({
                scrollTop: posi - 60
            }, 200);
        }
    };
    // Init
    $scope.project = project;
    $scope.taskSortableOptions = {
        itemMoved: function(event) {
            var destScope = event.dest.sortableScope;
            var task = event.source.itemScope.modelValue;
            task.rank = event.dest.index + 1;
            task.state = destScope.taskState;
            if (destScope.story) {
                task.parentStory = {id: destScope.story.id};
                task.type = null;
            } else {
                task.type = destScope.taskType;
                task.parentStory = null;
            }
            TaskService.update(task).catch(function() {
                $scope.revertSortable(event);
            });
        },
        orderChanged: function(event) {
            var task = event.source.itemScope.modelValue;
            task.rank = event.dest.index + 1;
            TaskService.update(task).catch(function() {
                $scope.revertSortable(event);
            });
        },
        accept: function(sourceItemHandleScope, destSortableScope) {
            var sameSortable = sourceItemHandleScope.itemScope.sortableScope.sortableId === destSortableScope.sortableId;
            var isSortableDest = destSortableScope.story ? $scope.isSortingStory(destSortableScope.story) : true;
            return sameSortable && isSortableDest;
        }
    };
    $scope.selectableOptions = {
        notSelectableSelector: '.action, button, a, .story-container',
        allowMultiple: false,
        selectionUpdated: function(selectedIds) {
            switch (selectedIds.length) {
                case 0:
                    $state.go($scope.viewName);
                    break;
                case 1:
                    $state.go($scope.viewName + '.task.details' + ($state.params.taskTabId ? '.tab' : ''), {taskId: selectedIds});
                    break;
            }
        }
    };
    //give capabilities to plugin to register theirs filters;
    $scope.sprintFilters = $scope.sprintFilters ? $scope.sprintFilters : [];
    $scope.sprintFilters = $scope.sprintFilters.concat([
        {id: 'allTasks', name: $scope.message('is.ui.sprintPlan.toolbar.filter.allTasks'), filter: {}},
        {id: 'myTasks', name: $scope.message('is.ui.sprintPlan.toolbar.filter.myTasks'), filter: {responsible: {id: Session.user.id}}},
        {id: 'freeTasks', name: $scope.message('is.ui.sprintPlan.toolbar.filter.freeTasks'), filter: {responsible: null}},
        {id: 'blockedTasks', name: $scope.message('is.ui.sprintPlan.toolbar.filter.blockedTasks'), filter: {blocked: true}}
    ]);
    var sprintFilter = Session.authenticated() ? Session.user.preferences.filterTask : 'allTasks';
    $scope.currentSprintFilter = _.find($scope.sprintFilters, {id: sprintFilter});
    //if saved filter is not available anymore
    $scope.currentSprintFilter = $scope.currentSprintFilter ? $scope.currentSprintFilter : 'allTasks';

    $scope.sortableId = 'taskBoard';
    $scope.sprint = sprint;
    $scope.tasksByTypeByState = {};
    $scope.tasksByStoryByState = {};
    $scope.taskCountByState = {};
    $scope.taskStatesByName = TaskStatesByName;
    $scope.sprintStatesByName = SprintStatesByName;
    $scope.taskTypesByName = TaskTypesByName;
    $scope.ghostStories = [];
    $scope.$watch('sprint.tasks', function() {
        if ($scope.sprint) {
            $scope.refreshTasks();
        }
    }, true);  // Be careful of circular objects, it will blow up the stack when comparing equality by value
    $scope.$watch('sprint.state', function() { // To generate the proper $scope.sprintTaskStates when changing state
        if ($scope.sprint) {
            $scope.refreshTasks();
        }
    });
    $scope.sprintEntries = [];
    _.each(_.sortBy(releases, 'orderNumber'), function(release) {
        if (release.sprints && release.sprints.length > 0) {
            if ($scope.sprintEntries.length > 0) {
                $scope.sprintEntries.push({type: 'divider'});
            }
            $scope.sprintEntries.push({type: 'release', item: release});
            _.each(_.sortBy(release.sprints, 'orderNumber'), function(sprint) {
                $scope.sprintEntries.push({type: 'sprint', item: sprint})
            });
        }
    });

    $scope.tasksShownByTypeOrStory = {'stories': {}};
}]);
