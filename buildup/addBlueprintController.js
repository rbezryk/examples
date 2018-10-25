(function () {

    angular
        .module('app')
        .controller('addBlueprintController', ['$rootScope', '$scope', 'analyticsService', 'commonService', 'structureService',
                                               'dashboardService', '$filter', 'messagesService', '$mdDialog', 'documentService', addBlueprintController]);

    function addBlueprintController($rootScope, $scope, analyticsService, commonService, structureService,
                                    dashboardService, $filter, messagesService, $mdDialog, documentService) {

        var vm = this;

        vm.selectedUnits = [];
        vm.mdSeletedFilter = {};
        vm.errors = {
            name: "",
            units: "",
            file: "",
        };
        vm.rotateImg = '';

        vm.isImage = true;
        vm.item = null;
        vm.name = null;
        vm.fileType = null;
        vm.watingForData = true;
        vm.defAreas  = [];
        vm.defFloors = [];
        vm.defUnits  = [];

        vm.refreshBlueprints = function () {
            structureService.loadProjectUnits($rootScope.userProject.id, function (data) {
                vm.units     = angular.copy(data);
                vm.defUnits  = data;
                vm.floors    = structureService.getDistinctFloorsByUnits(vm.units);
                vm.defFloors = angular.copy(vm.floors);
                vm.watingForData = false;
            }, false);

            structureService.loadProjectAreas($rootScope.userProject.id, function (data) {
                vm.areas = angular.copy(data);
                vm.defAreas = data;
            }, true);
        };

        if ($rootScope.userProject) {
            vm.refreshBlueprints();
        }

        $scope.$on('languageChange', function() {
            vm.areas  = [];
            vm.floors = [];
            vm.units  = [];

            vm.areas  = angular.copy(vm.defAreas);
            vm.floors = angular.copy(vm.defFloors);
            vm.units  = angular.copy(vm.defUnits);
        });

        vm.isFormValid = function () {
            var isValid = true;
            vm.errors = {
                name: "",
                units: "",
                file: "",
            };

            if (!vm.name) {
                isValid = false;
                vm.errors.name = $filter('translate')('required');
            }

            if (vm.selectedUnits.length === 0) {
                isValid = false;
                vm.errors.units = $filter('translate')('required');
            }

            if (!vm.item) {
                isValid = false;
                vm.errors.file = $filter('translate')('required');
            }

            return isValid;
        };

        vm.save = function () {
            if (vm.isFormValid()) {
                var message = '';
                var unitsNames = [];
                var unitsId = [];
                var messageSave = $filter('translate')('plan_saved');
                var selectedUnitsClone = vm.selectedUnits;

                var exist = _.chain(vm.units)
                             .filter(function(unit) {
                                return _.find(unit.documents, function(plan) {
                                    return plan.name == vm.name && plan.plan_ext == vm.fileType;
                                });
                             })
                             .forEach(function(unit) {
                                unitsId.push(unit.id);
                             })
                             .value();

                if (exist) {
                    vm.selectedUnits = _.filter(vm.selectedUnits, function(itemId) {
                        return unitsId.indexOf(itemId) === -1;
                    });

                    if (vm.selectedUnits && vm.selectedUnits.length) {
                        messageSave = $filter('translate')('plan_was_updated');
                        vm.watingForData = true;
                        vm.saveNewDocument(messageSave);
                    } else {
                        unitsNames = _.chain(exist)
                                      .filter(function(unit) {
                                        return selectedUnitsClone.indexOf(unit.id) !== -1;
                                      })
                                      .map(function(unit) {
                                        return unit.name;
                                      })
                                      .value();

                        if (unitsNames.length == 1) {
                            message = $filter('translate')('el_plan') + ' "' + vm.name + '" ' + $filter('translate')('is_already_assigned_to') + ' "' + unitsNames.join() + '"';
                        } else {
                            message = $filter('translate')('el_plan') + ' "' + vm.name + '" ' + $filter('translate')('is_already_assigned_to_units') + ' ("' + unitsNames.join('", "') + '")';
                        }

                        var alert = $mdDialog.alert({
                            title: '',
                            textContent: message,
                            ok: $filter('translate')('Ok'),
                        });

                        $mdDialog
                            .show(alert)
                            .catch(function(error) {
                                console.log("dialog error: ", error);
                            });
                    }
                } else {
                    vm.watingForData = true;
                    vm.saveNewDocument(messageSave);
                }
            }
        };

        vm.saveNewDocument = function (messageSave) {
            vm.newPlan = {
                id: commonService.guid(),
                data: vm.item,
                name: vm.name,
                fileType: vm.fileType,
            };

            analyticsService.trackMixPanel("Blueprint Added", {
                'Blueprint Id': vm.newPlan.id,
                'Units Id': vm.selectedUnits,
                'File Name': vm.name,
            });

            documentService.save($rootScope.userProject.id, vm.newPlan, vm.selectedUnits, function(err, res) {
                if (err) {
                    vm.watingForData = false;
                    messagesService.showToast(err.buildupError);
                    errorNotify.notify("addBlueprintController", "save", err.data);
                } else {
                    vm.newPlan = {};

                    vm.isImage = null;
                    vm.item = null;
                    vm.name = null;
                    vm.fileType = null;

                    vm.selectedUnits = [];
                    $scope.selectedFloors = [];
                    $scope.selectedAreas = [];

                    vm.refreshBlueprints();

                    $rootScope.$broadcast('blueprintHasBeenAdded');
                    $rootScope.$broadcast('refreshLogs');

                    dashboardService.clearProjectData($rootScope.userProject.id);

                    messagesService.showToast(messageSave);
                }
            });
        };

        vm.createDocument = function(fileIndex, fileData, fileType, fileName) {
            if (['jpg', 'jpeg', 'png', 'gif', 'pdf'].indexOf(fileType) === -1) {
                messagesService.showToast($filter('translate')('oops_you_can_only_upload_images_pdf_files'));
            } else {
                if (fileData) {
                    vm.isImage = ['jpg', 'jpeg', 'png', 'gif'].indexOf(fileType) !== -1;
                    vm.item = fileData;
                    vm.name = fileName;
                    vm.fileType = fileType;
                }
            }
        };

        vm.removePlanDocument = function() {
            vm.item = null;
            vm.name = null;
            vm.fileType = null;
        };

        vm.criteriaMatchFloor = function () {
            return function (item) {
                var floorFound = false;

                if (!$scope.selectedAreas || $scope.selectedAreas.length == 0) {
                    return true;
                }

                vm.units.forEach(function (unit) {
                    if ($scope.selectedAreas.indexOf(unit.area_id) !== -1) {
                        if (unit.floor.toString().toLowerCase() == item.value.toString().toLowerCase()) {
                            floorFound = true;
                        }
                    }
                });

                return floorFound;
            }
        };

        vm.criteriaMatchUnit = function () {
            return function (item) {
                if ($scope.selectedAreas && $scope.selectedAreas.length && $scope.selectedAreas.indexOf(item.area_id) === -1) {
                    return false;
                } else if ($scope.selectedFloors && $scope.selectedFloors.length) {
                    return !!_.find($scope.selectedFloors, function(floor) {
                        return item.floor.toString().toLowerCase() == floor.toString().toLowerCase();
                    });
                }

                return true;
            };
        };

        vm.selectAllAreas = function (selectAll, allAreas) {
            $scope.selectedAreas = [];

            if (selectAll) {
                allAreas.forEach(function (area) {
                    $scope.selectedAreas.push(area.id);
                })
            }
        };

        vm.selectAllFloors = function (selectAll, allFloor) {
            $scope.selectedFloors = [];

            if (selectAll) {
                allFloor.forEach(function (floor) {
                    $scope.selectedFloors.push(floor.value);
                })
            }
        };

        vm.selectAllUnits = function (selectAll, allUnits) {
            vm.selectedUnits = [];

            if (selectAll) {
                allUnits.forEach(function (unit) {
                    vm.selectedUnits.push(unit.id);
                });
            }
        };

        vm.getSelectedValue = function (filterArray, array, filterName) {
            if (!filterArray || filterArray.length == 0) {
                return $filter('translate')('No ' + filterName);
            } else if (filterArray.length == 1) {
                var selected = _.find(array, function(item) {return (item.id == filterArray) || (item.value == filterArray)});

                return selected.name || selected.description || selected.value;
            } else {
                return filterArray.length + ' ' + $filter('translate')('Selected ' + filterName);
            }
        };

        vm.updateSearch = function (mdSelectName, e) {
            commonService.updateSearch(vm.mdSeletedFilter, mdSelectName, e);
        };

        vm.criteriaMdSelectMatch = function (mdSelectName, field) {
            return commonService.criteriaMdSelectMatch(vm.mdSeletedFilter, mdSelectName, field);
        };

        vm.clearClicked = function (mdSelectName) {
            vm.mdSeletedFilter[mdSelectName] = '';
        };
    }
})();