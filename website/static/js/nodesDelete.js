/**
 * Controller for deleting a node and it childs (if they exists)
 */
'use strict';

var $ = require('jquery');
var $3 = window.$3;
var ko = require('knockout');
var Raven = require('raven-js');
var $osf = require('./osfHelpers');
var osfHelpers = require('js/osfHelpers');
var m = require('mithril');
var NodesDeleteTreebeard = require('js/nodesDeleteTreebeard');

function _flattenNodeTree(nodeTree) {
    var ret = [];
    var stack = [nodeTree];
    while (stack.length) {
        var node = stack.pop();
        ret.push(node);
        stack = stack.concat(node.children);
    }
    return ret;
}

/**
 * take treebeard tree structure of nodes and get a dictionary of parent node and all its
 * children
 */
function getNodesOriginal(nodeTree, nodesOriginal) {
    var flatNodes = _flattenNodeTree(nodeTree);
    $.each(flatNodes, function(_, nodeMeta) {
        nodesOriginal[nodeMeta.node.id] = {
            public: nodeMeta.node.is_public,
            id: nodeMeta.node.id,
            title: nodeMeta.node.title,
            isAdmin: nodeMeta.node.is_admin,
            changed: false
        };
    });
    nodesOriginal[nodeTree.node.id].isRoot = true;
    return nodesOriginal;
}

/**
 * patches all the nodes in a changed state
 * uses API v2 bulk requests
 */
function patchNodesDelete(nodes) {
    var nodesV2Url = window.contextVars.apiV2Prefix + 'nodes/';
    var nodesPatch = $.map(nodes, function (node) {
        return {
            'type': 'nodes',
            'id': node.id,
            'attributes': {
                'public': node.public
            }
        };
    });

    //s3 is a very recent version of jQuery that fixes a known bug when used in internet explorer
    return $3.ajax({
        url: nodesV2Url,
        type: 'DELETE',
        dataType: 'json',
        contentType: 'application/vnd.api+json; ext=bulk',
        crossOrigin: true,
        xhrFields: {withCredentials: true},
        processData: false,
        data: JSON.stringify({
            data: nodesPatch
        })
    });
}

/**
 * view model which corresponds to nodes_delete.mako (#nodesDelete)
 *
 * @type {NodesPrivacyViewModel}
 */
var NodesDeleteViewModel = function(node, onSetDelete) {
    var self = this;
    self.WARNING = 'warning';
    self.SELECT = 'select';
    self.CONFIRM = 'confirm';

    self.onSetDelete = onSetDelete;

    self.parentIsEmbargoed = node.is_embargoed;
    self.parentIsPublic = node.is_public;
    self.parentNodeType = node.node_type;
    self.isPreprint = node.is_preprint;
    self.treebeardUrl = window.contextVars.node.urls.api  + 'tree/';
    self.nodesOriginal = {};
    self.nodesChanged = ko.observable();
    //state of current nodes
    self.nodesState = ko.observableArray();
    self.nodesState.subscribe(function(newValue) {
        var nodesChanged = 0;
        for (var key in newValue) {
            if (newValue[key].public !== self.nodesOriginal[key].public) {
                newValue[key].changed = true;
                nodesChanged++;
            }
            else {
                newValue[key].changed = false;
            }
        }
        self.nodesChanged(nodesChanged > 0);
        m.redraw(true);
    });
    //original node state on page load
    self.nodesChangedPublic = ko.observableArray([]);
    self.nodesChangedPrivate = ko.observableArray([]);
    self.hasChildren = ko.observable(false);
    $('#nodesDelete').on('hidden.bs.modal', function () {
        self.clear();
    });

    self.page = ko.observable(self.WARNING);

    self.pageTitle = ko.computed(function() {
        if (self.page() === self.WARNING &&  self.parentIsEmbargoed) {
            return "This is a message";
        }

        return {
            warning: self.parentIsPublic ?
                'Make ' + self.parentNodeType + ' private' :
                'Warning',
            select: 'Change privacy settings',
            confirm: 'Projects and components affected'
        }[self.page()];
    });

    self.message = ko.computed(function() {
        if (self.page() === self.WARNING &&  self.parentIsEmbargoed) {
            return "This is a message"
        }

        if (self.page() === self.WARNING &&  self.isPreprint) {
            return "messages"
        }

        return {
            warning: "messages",
            select: "messages",
            confirm: "messages"
        }[self.page()];
    });
};

/**
 * get node tree for treebeard from API V1
 */
NodesDeleteViewModel.prototype.fetchNodeTree = function() {
    var self = this;

    return $.ajax({
        url: self.treebeardUrl,
        type: 'GET',
        dataType: 'json'
    }).done(function(response) {
        self.nodesOriginal = getNodesOriginal(response[0], self.nodesOriginal);
        var size = 0;
        $.each(Object.keys(self.nodesOriginal), function(_, key) {
            if (self.nodesOriginal.hasOwnProperty(key)) {
                size++;
            }
        });
        self.hasChildren(size > 1);
        var nodesState = $.extend(true, {}, self.nodesOriginal);
        var nodeParent = response[0].node.id;
        //change node state and response to reflect button push by user on project page (make public | make private)
        nodesState[nodeParent].public = response[0].node.is_public = !self.parentIsPublic;
        nodesState[nodeParent].changed = true;
        self.nodesState(nodesState);
    }).fail(function(xhr, status, error) {
        $osf.growl('Error', 'Unable to retrieve project settings');
        Raven.captureMessage('Could not GET project settings.', {
            extra: {
                url: self.treebeardUrl, status: status, error: error
            }
        });
    });
};

NodesDeleteViewModel.prototype.selectProjects = function() {
    this.page(this.SELECT);
};

NodesDeleteViewModel.prototype.confirmWarning =  function() {
    var nodesState = ko.toJS(this.nodesState);
    for (var node in nodesState) {
        if (nodesState[node].changed) {
            if (nodesState[node].public) {
                this.nodesChangedPublic().push(nodesState[node].title);
            }
            else {
                this.nodesChangedPrivate().push(nodesState[node].title);
            }
        }
    }
    this.page(this.CONFIRM);
};

NodesDeleteViewModel.prototype.confirmChanges =  function() {
    var self = this;

    var nodesState = ko.toJS(this.nodesState());
    nodesState = Object.keys(nodesState).map(function(key) {
        return nodesState[key];
    });
    var nodesChanged = nodesState.filter(function(node) {
        return node.changed;
    });
    //The API's bulk limit is 100 nodes.  We catch the exception in nodes_privacy.mako.
    if (nodesChanged.length <= 100) {
        $osf.block('Deleting Project');
        patchNodesDelete(nodesChanged.reverse()).then(function () {
            self.onSetDelete(nodesChanged);
            self.nodesChangedPublic([]);
            self.nodesChangedPrivate([]);
            self.page(self.WARNING);
            window.location.reload();
        }).fail(function (xhr) {
            $osf.unblock();
            var errorMessage = 'Unable to update project privacy';
            if (xhr.responseJSON && xhr.responseJSON.errors) {
                errorMessage = xhr.responseJSON.errors[0].detail;
            }
            $osf.growl('Problem changing privacy', errorMessage);
            Raven.captureMessage('Could not PATCH project settings.');
            self.clear();
            $('#nodesDelete').modal('hide');
        }).always(function() {
            $osf.unblock();
        });
    }
};

NodesDeleteViewModel.prototype.clear = function() {
    this.nodesChangedPublic([]);
    this.nodesChangedPrivate([]);
    this.page(this.WARNING);
};

NodesDeleteViewModel.prototype.back = function() {
    this.nodesChangedPublic([]);
    this.nodesChangedPrivate([]);
    this.page(this.SELECT);
};

NodesDeleteViewModel.prototype.makeEmbargoPublic = function() {
    var self = this;

    var nodesChanged = $.map(self.nodesOriginal, function(node) {
	if (node.isRoot) {
            node.public = true;
	    return node;
	}
	return null;
    }).filter(Boolean);
    $osf.block('Submitting request to end embargo early ...');
    patchNodesDelete(nodesChanged).then(function (res) {
        $osf.unblock();
        $('.modal').modal('hide');
        self.onSetPrivacy(nodesChanged, true);
        $osf.growl(
            'Email sent',
            'The administrator(s) can approve or cancel the action within 48 hours. If 48 hours pass without any action taken, then the registration will become public.',
            'success'
        );
    });
};

function NodesDelete(selector, node, onSetDelete) {
    var self = this;

    self.selector = selector;
    self.$element = $(self.selector);
    self.viewModel = new NodesDeleteViewModel(node, onSetDelete);
    self.viewModel.fetchNodeTree().done(function(response) {
        new NodesDeleteTreebeard('nodesDeleteTreebeard', response, self.viewModel.nodesState, self.viewModel.nodesOriginal);
    });
    self.init();
}

NodesDelete.prototype.init = function() {
    osfHelpers.applyBindings(this.viewModel, this.selector);
};

module.exports = {
    _NodesDeleteViewModel: NodesDeleteViewModel,
    NodesDelete: NodesDelete
};

