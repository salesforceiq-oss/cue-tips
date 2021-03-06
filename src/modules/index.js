var CUE_TIPS_CUE_CLASS = 'cue-tips-cue';
var _observers = [];

module.exports = make;
module.exports._observers = _observers; // for testing
module.exports._disconnectObserver = disconnectObserver; // for testing

function make(cueConfigArray, tipInterface, onRemove) {
    var isValidConfig = assertValidCueConfigArray(cueConfigArray);
    tipInterface = extendDefaultTipInterface(tipInterface);
    cueConfigArray = cueConfigArray.slice(); // make a copy
    var isValidTipInterface = assertValidTipInterface(tipInterface);

    if (isValidConfig && isValidTipInterface) {
        var attributes = getAttributes(cueConfigArray);
        var props = {
            cueConfigArray: cueConfigArray,
            tipInterface: tipInterface,
            attributes: attributes,
            attrQuerySelector: getAttributeQuerySelector(attributes),
            onRemove: onRemove
        };

        registerObserver(props);
        return getInstanceAPI(props);
    }
}

function registerObserver(props) {
    if (props.attributes.length) {

        // look through the current state of the body first (the mutation observer will miss these)
        findCueTipsForAddedNode(props, document.body);

        props.observer = new MutationObserver(mutationHandler.bind(this, props));

        props.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });

        _observers.push(props.observer);
    }
}

function getInstanceAPI(props) {
    return {
        add: function(cueConfig) {
            if (!~props.cueConfigArray.indexOf(cueConfig) && assertValidCueConfigArray([cueConfig])) {
                var needsNewObserver = !props.cueConfigArray.length;

                props.cueConfigArray.push(cueConfig);
                props.attributes = getAttributes(props.cueConfigArray);
                props.attrQuerySelector = getAttributeQuerySelector(props.attributes);

                if (needsNewObserver) {
                    registerObserver(props);
                } else {
                    // look through the current state of the body
                    findCueTipsForAddedNode(props, document.body);
                }
            }
        },
        remove: function(cueConfig) {
            removeCueConfig(cueConfig, props);
        },
        stop: function() {
            disconnectObserver(props.observer);
            props.observer = null;
        },
        _props: props // for testing
    };
}

function mutationHandler(props, mutations) {
    mutations.forEach(function forEachCueTipMutation(mutation) {
        if (mutation.addedNodes && mutation.addedNodes.length) {
            Array.prototype.slice.call(mutation.addedNodes).forEach(findCueTipsForAddedNode.bind(null, props));
        } else if (mutation.type === 'attributes' && mutation.attributeName) {
            if (~props.attributes.indexOf(mutation.attributeName)) {
                maybeHandleAttributeMatchesForNode(mutation.target, props, [mutation.attributeName]);
            }
        }
    });
}

function findCueTipsForAddedNode(props, node) {
    if (node.nodeType !== 1) {
        return;
    }

    maybeHandleAttributeMatchesForNode(node, props);

    // should only be falsy on last turn after removing mutation observer
    if (props.attrQuerySelector) {
        Array.prototype.slice.call(node.querySelectorAll(props.attrQuerySelector)).forEach(function forEachCueTipAddedNodeDescendant(descendant) {
            maybeHandleAttributeMatchesForNode(descendant, props);
        });
    }
}

function maybeHandleAttributeMatchesForNode(node, props, customAttributes) {
    (customAttributes || props.attributes).forEach(function(attr) {
        if (node.hasAttribute(attr)) {
            handleAttributeMatch(attr, node, props);
        }
    });
}

function handleAttributeMatch(attr, target, props) {
    var cueConfig = findCueConfigForAttribute(attr, props);

    if (cueConfig) {
        if (cueConfig.cueAttr === attr) {
            addCue(target, cueConfig, props);
        } else if (cueConfig.cueTipAttr === attr) {
            showCueTip(target, cueConfig, props);
        } else {
            throw new Error('cue-tips: invalid cue config for attribute "' + attr + '"');
        }
    }
}

function addCue(target, cueConfig, props) {
    if (cueConfig.cueParentSelector && !findParentBySelector(target, cueConfig.cueParentSelector)) {
        return;
    }

    if (cueConfig.cueClass !== false) {
        target.classList.add(CUE_TIPS_CUE_CLASS);
    }

    props.tipInterface.showCueTargetTip(cueConfig, target);

    if (!cueConfig.cueTipAttr) {
        removeCueConfig(cueConfig, props);
    }
}

function showCueTip(target, cueConfig, props) {
    if (cueConfig.cueTipParentSelector && !findParentBySelector(target, cueConfig.cueTipParentSelector)) {
        return;
    }

    var cueSelector = ((cueConfig.cueParentSelector || '') + ' [' + cueConfig.cueAttr + ']').trim();
    var cueEls = document.querySelectorAll(cueSelector);
    props.tipInterface.hideCueTargetTip(cueConfig);
    props.tipInterface.showCueTip(cueConfig, target);
    removeCueConfig(cueConfig, props);

    if (cueEls && cueEls.length) {
        for (var i = 0; i < cueEls.length; i++) {
            cueEls[i].classList.remove(CUE_TIPS_CUE_CLASS);
        }
    }
}

function removeCueConfig(cueConfig, props) {
    var i = props.cueConfigArray.indexOf(cueConfig);

    if (~i) {
        var doRemove = true;

        if (typeof props.onRemove === 'function') {
            doRemove = props.onRemove(cueConfig);
        }

        if (doRemove !== false) {
            // need to reevaluate index in case things have synchronously changed
            i = props.cueConfigArray.indexOf(cueConfig);

            if (~i) {
                props.cueConfigArray.splice(i, 1);
                props.attributes = getAttributes(props.cueConfigArray);
                props.attrQuerySelector = getAttributeQuerySelector(props.attributes);
            }
        }
    }

    maybeDisconnectObserver(props);
}

function maybeDisconnectObserver(props) {
    if (!props.cueConfigArray.length) {
        disconnectObserver(props.observer);
        props.observer = null;
    }
}

function disconnectObserver(observer) {
    if (observer) {
        observer.disconnect();

        var i = _observers.indexOf(observer);

        if (~i) {
            _observers.splice(i, 1);
        }
    }
}

function findCueConfigForAttribute(attributeName, props) {
    var result;

    props.cueConfigArray.some(function(obj) {
        if (obj.cueAttr === attributeName || obj.cueTipAttr === attributeName) {
            result = obj;
            return true;
        }
    });

    return result;
}

function findParentBySelector(el, parentSelector) {
    var p = el;

    while ((p = p.parentElement)) {
        if (p.matches(parentSelector)) {
            return true;
        }
    }

    return false;
}

function getAttributes(cueConfigArray) {
    var result = [];

    if (cueConfigArray) {
        cueConfigArray.forEach(function(obj) {
            result.push(obj.cueAttr);

            if (obj.cueTipAttr) {
                result.push(obj.cueTipAttr);
            }
        });
    }

    return result;
}

function extendDefaultTipInterface(tipInterface) {
    tipInterface.showCueTargetTip = tipInterface.showCueTargetTip || noop;
    tipInterface.hideCueTargetTip = tipInterface.hideCueTargetTip || noop;

    return tipInterface;
}

function getAttributeQuerySelector(attributes) {
    if (!attributes || !attributes.length) {
        return '';
    } else {
        return '[' + attributes.join('],[') + ']';
    }
}

function assertValidCueConfigArray(cueConfigArray) {
    if (Array.isArray(cueConfigArray)) {
        var hasValidCueConfigs = cueConfigArray.every(function(obj) {
            if (isObject(obj)) {
                if (!isStringWithValue(obj.cueAttr)) {
                    throw new Error('cue-tips: cue config require a `cueAttr` attribute selector');
                }

                return true;
            } else {
                return false;
            }
        });

        if (hasValidCueConfigs) {
            return true;
        }
    }

    throw new Error('cue-tips: requires the cueConfigArray to be an array of cue config objects');
}

function assertValidTipInterface(tipInterface) {
    if (isObject(tipInterface)) {
        return ['showCueTip', 'showCueTargetTip', 'hideCueTargetTip'].every(function(fnName) {
            if (typeof tipInterface[fnName] === 'function') {
                return true;
            } else {
                throw new Error('cue-tips: tipInterface requires a ' + fnName + ' function');
            }
        });
    } else {
        throw new Error('cue-tips: invalid tipInterface');
    }
}

function isStringWithValue(str) {
    return !!str && typeof str === 'string';
}

function isObject(obj) {
    return typeof obj === 'object' && !Array.isArray(obj);
}

function noop() {

}