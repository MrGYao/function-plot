(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.functionPlot = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
 * function-plot
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */
'use strict';
require('./lib/polyfills');

var d3 = window.d3;

var events = require('events');
var extend = require('extend');

var mousetip = require('./lib/tip');
var utils = require('./lib/utils');
var helpers = require('./lib/helpers/');
var annotations = require('./lib/helpers/annotations');

var assert = utils.assert;

var Const;
var types;
var cache = [];

module.exports = function (options) {
  options = options || {};
  options.data = options.data || [];

  // globals
  var width, height;
  var margin;
  var zoomBehavior;
  var xScale, yScale;
  var line = d3.svg.line()
    .x(function (d) { return xScale(d[0]); })
    .y(function (d) { return yScale(d[1]); });

  function Chart() {
    var n = Math.random();
    var letter = String.fromCharCode(Math.floor(n * 26) + 97);
    this.id = letter + n.toString(16).substr(2);
    this.linkedGraphs = [this];

    options.id = this.id;
    cache[this.id] = this;
  }

  Chart.prototype = Object.create(events.prototype);

  Chart.prototype.update = function () {
    this.setVars();
    this.setUpEventListeners();
    this.build();
    return this;
  };

  Chart.prototype.updateBounds = function () {
    width = this.meta.width = (options.width || Const.DEFAULT_WIDTH)
      - margin.left - margin.right;
    height = this.meta.height = (options.height || Const.DEFAULT_HEIGHT)
      - margin.top - margin.bottom;

    var xDomain = this.meta.xDomain;
    var yDomain = this.meta.yDomain;

    var si = d3.format('s');
    var r = d3.format('.0r');
    //var tickFormat = function (d) {
    //  if (Math.abs(d) >= 1) {
    //    return si(d);
    //  }
    //  return r(d);
    //};

    xScale = this.meta.xScale = d3.scale.linear()
      .domain(xDomain)
      .range([0, width]);
    yScale = this.meta.yScale = d3.scale.linear()
      .domain(yDomain)
      .range([height, 0]);
    this.meta.xAxis = d3.svg.axis()
      .scale(xScale)
      .orient('bottom');
      //.tickSize(-height)
      //.tickFormat(tickFormat);
    this.meta.yAxis = d3.svg.axis()
      .scale(yScale)
      .orient('left');
      //.tickSize(-width)
      //.tickFormat(si);
  };

  Chart.prototype.setVars = function () {
    var limit = 10;

    this.meta = {};
    margin = this.meta.margin = {left: 30, right: 30, top: 20, bottom: 20};
    zoomBehavior = this.meta.zoomBehavior = d3.behavior.zoom();

    var xDomain = this.meta.xDomain = options.xDomain || [-limit / 2, limit / 2];
    var yDomain = this.meta.yDomain = options.yDomain || [-limit / 2, limit / 2];

    assert(xDomain[0] < xDomain[1]);
    assert(yDomain[0] < yDomain[1]);

    if (options.title) {
      this.meta.margin.top = 40;
    }

    this.updateBounds();
  };

  Chart.prototype.build = function () {
    var root = this.root = d3.select(options.target).selectAll('svg')
      .data([options]);

    // enter
    this.root.enter = root.enter()
      .append('svg')
        .attr('class', 'function-plot')
        .attr('font-size', this.getFontSize());

    // merge
    root
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

    this.buildTitle();
    this.buildLegend();
    this.buildCanvas();
    this.buildClip();
    this.buildAxis();
    this.buildAxisLabel();
    this.buildContent();

    // helper to detect the closest fn to the cursor's current abscissa
    var tip = this.tip = mousetip(extend(options.tip, { owner: this }));
    this.canvas
      .call(tip);

    this.buildZoomHelper();
  };

  Chart.prototype.buildTitle = function () {
    // join
    var selection = this.root.selectAll('text.title')
      .data(function (d) {
        return [d.title].filter(Boolean);
      });

    // enter
    selection.enter()
      .append('text')
      .attr('class', 'title')
      .attr('y', margin.top / 2)
      .attr('x', margin.left + width / 2)
      .attr('font-size', 25)
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .text(options.title);

    // exit
    selection.exit().remove();
  };

  Chart.prototype.buildLegend = function () {
    // enter
    this.root.enter
      .append('text')
      .attr('class', 'top-right-legend')
      .attr('text-anchor', 'end');

    // update + enter
    this.root.select('.top-right-legend')
      .attr('y', margin.top / 2)
      .attr('x', width + margin.left);
  };

  Chart.prototype.buildCanvas = function () {
    var self = this;

    this.meta.zoomBehavior
      .x(xScale)
      .y(yScale)
      .scaleExtent([0.00001, Infinity])
      .on('zoom', function onZoom() {
        self.emit('all:zoom', xScale, yScale);
      });

    // enter
    var canvas = this.canvas = this.root
      .selectAll('.canvas')
      .data(function (d) { return [d]; });

    this.canvas.enter = canvas.enter()
      .append('g')
        .attr('class', 'canvas');

    // enter + update
    canvas
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
      .call(zoomBehavior)
      .each(function () {
        var el = d3.select(this);
        if (options.disableZoom) {
          // https://github.com/mbostock/d3/issues/894
          el.on('.zoom', null);
        }
      });
  };

  Chart.prototype.buildClip = function () {
    // (so that the functions don't overflow on zoom or drag)
    var id = this.id;
    var defs = this.canvas.enter.append('defs');
    defs.append('clipPath')
      .attr('id', 'function-plot-clip-' + id)
      .append('rect')
      .attr('class', 'clip static-clip');

    // enter + update
    this.canvas.selectAll('.clip')
      .attr('width', width)
      .attr('height', height);
  };

  Chart.prototype.buildAxis = function () {
    // axis creation
    var canvasEnter = this.canvas.enter;
    canvasEnter.append('g')
      .attr('class', 'x axis');
    canvasEnter.append('g')
      .attr('class', 'y axis');

    // update
    this.canvas.select('.x.axis')
      .attr('transform', 'translate(0,' + height + ')')
      .call(this.meta.xAxis);
    this.canvas.select('.y.axis')
      .call(this.meta.yAxis);

    this.canvas.selectAll('.axis path, .axis line')
      .attr('fill', 'none')
      .attr('stroke', 'black')
      .attr('shape-rendering', 'crispedges')
      .attr('opacity', 0.1);
  };

  Chart.prototype.buildAxisLabel = function () {
    // axis labeling
    var xLabel, yLabel;
    var canvas = this.canvas;

    xLabel = canvas.selectAll('text.x.axis-label')
      .data(function (d) {
        return [d.xLabel].filter(Boolean);
      });
    xLabel.enter()
      .append('text')
      .attr('class', 'x axis-label')
      .attr('text-anchor', 'end');
    xLabel
      .attr('x', width)
      .attr('y', height - 6)
      .text(function (d) { return d; });
    xLabel.exit().remove();

    yLabel = canvas.selectAll('text.y.axis-label')
      .data(function (d) {
        return [d.yLabel].filter(Boolean);
      });
    yLabel.enter()
      .append('text')
      .attr('class', 'y axis-label')
      .attr('y', 6)
      .attr('dy', '.75em')
      .attr('text-anchor', 'end')
      .attr('transform', 'rotate(-90)');
    yLabel
      .text(function (d) { return d; });
    yLabel.exit().remove();
  };

  Chart.prototype.buildContent = function () {
    var self = this;
    var canvas = this.canvas;
    var content = this.content = canvas.selectAll('g.content')
      .data(function (d) { return [d]; });

    content.enter()
      .append('g')
      .attr('clip-path', 'url(#function-plot-clip-' + this.id + ')')
      .attr('class', 'content');

    // helper line, x = 0
    var yOrigin = content.selectAll('path.y.origin')
      .data([ [[0, yScale.domain()[0]], [0, yScale.domain()[1]]] ]);
    yOrigin.enter()
      .append('path')
      .attr('class', 'y origin')
      .attr('stroke', '#eee');
    yOrigin.attr('d', line);

    // helper line y = 0
    var xOrigin = content.selectAll('path.x.origin')
      .data([ [[xScale.domain()[0], 0], [xScale.domain()[1], 0]] ]);
    xOrigin.enter()
      .append('path')
      .attr('class', 'x origin')
      .attr('stroke', '#eee');
    xOrigin.attr('d', line);

    // annotations (parallel to the y-axis)
    content
      .call(annotations({ owner: self }));

    // content construction (based on graphOptions)
    // join
    var graphs = content.selectAll('g.graph')
      .data(function (d) { return d.data; });
    // enter
    graphs
      .enter()
        .append('g')
        .attr('class', 'graph');
    // enter + update
    graphs
      .each(function (data, index) {
        data.graphOptions = extend({
          type: 'interval'
        }, data.graphOptions);

        var options = extend({
          owner: self,
          index: index
        }, data.graphOptions);

        d3.select(this)
          .call(types[options.type](options));
        d3.select(this)
          .call(helpers(options));
      });
  };

  Chart.prototype.buildZoomHelper = function () {
    // dummy rect (detects the zoom + drag)
    var self = this;

    // enter
    this.canvas.enter
      .append('rect')
      .attr('class', 'zoom-and-drag')
      .style('fill', 'none')
      .style('pointer-events', 'all');

    // update
    this.canvas.select('.zoom-and-drag')
      .attr('width', width)
      .attr('height', height)
      .on('mouseover', function () {
        self.emit('all:mouseover');
      })
      .on('mouseout', function () {
        self.emit('all:mouseout');
      })
      .on('mousemove', function () {
        self.emit('all:mousemove');
      });
  };

  Chart.prototype.addLink = function () {
    for (var i = 0; i < arguments.length; i += 1) {
      this.linkedGraphs.push(arguments[i]);
    }
  };

  Chart.prototype.getFontSize = function () {
    return Math.max(Math.max(width, height) / 50, 8);
  };

  Chart.prototype.setUpEventListeners = function () {
    var instance = this;

    var events = {
      mousemove: function (x, y) {
        instance.tip.move(x, y);
      },
      mouseover: function () {
        instance.tip.show();
      },
      mouseout: function () {
        instance.tip.hide();
      },
      draw: function () {
        // update the stroke width of the origin lines
        instance.buildContent();
      },
      'zoom:scaleUpdate': function (xOther, yOther) {
        zoomBehavior
          .x(xScale.domain( xOther.domain() ))
          .y(yScale.domain( yOther.domain() ));
      },
      'tip:update': function (x, y, index) {
        var meta = instance.root.datum().data[index];
        var title = meta.title || '';
        var format = meta.renderer || function (x, y) {
            return x.toFixed(3) + ', ' + y.toFixed(3);
          };

        var text = [];
        title && text.push(title);
        text.push(format(x, y));

        instance.root.select('.top-right-legend')
          .attr('fill', Const.COLORS[index])
          //.text(x.toFixed(3) + ', ' + y.toFixed(3));
          .text(text.join(' '));
      }
    };

    var all = {
      mousemove: function () {
        var mouse = d3.mouse(instance.root.select('rect.zoom-and-drag').node());
        var x = xScale.invert(mouse[0]);
        var y = yScale.invert(mouse[1]);
        instance.linkedGraphs.forEach(function (graph) {
          graph.emit('mousemove', x, y);
        });
      },

      zoom: function (xScale, yScale) {
        instance.linkedGraphs.forEach(function (graph, i) {
          // - updates the position of the axes
          // - updates the position/scale of the clipping rectangle
          var canvas = graph.canvas;
          canvas.select('.x.axis').call(graph.meta.xAxis);
          canvas.select('.y.axis').call(graph.meta.yAxis);
          if (i) {
            graph.emit('zoom:scaleUpdate', xScale, yScale);
          }

          // content draw
          graph.emit('draw');
        });

        instance.emit('all:mousemove');
      }
    };

    Object.keys(events).forEach(function (e) {
      instance.removeAllListeners(e);
      instance.removeAllListeners('all:' + e);
      instance.on(e, events[e]);
      // create an event for each event existing on `events` in the form 'all:' event
      // e.g. all:mouseover all:mouseout
      // the objective is that all the linked graphs receive the same event as the current graph
      !all[e] && instance.on('all:' + e, function () {
        var args = Array.prototype.slice.call(arguments);
        instance.linkedGraphs.forEach(function (graph) {
          var localArgs = args.slice();
          localArgs.unshift(e);
          graph.emit.apply(graph, localArgs);
        });
      });
    });

    Object.keys(all).forEach(function (e) {
      instance.removeAllListeners('all:' + e);
      instance.on('all:' + e, all[e]);
    });
  };

  var instance = cache[options.id];
  if (!instance) {
    instance = new Chart();
  }
  return instance.update();
};
Const = module.exports.constants = require('./lib/constants');
types = module.exports.types = require('./lib/types/');

},{"./lib/constants":2,"./lib/helpers/":7,"./lib/helpers/annotations":4,"./lib/polyfills":9,"./lib/tip":13,"./lib/types/":14,"./lib/utils":18,"events":98,"extend":51}],2:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict';

var d3 = window.d3;
var Constants = {
  COLORS: [
    'steelblue',
    'red',
    '#05b378',      // green
    'orange',
    '#4040e8',      // purple
    'yellow',
    'black',
    'magenta',
    'cyan'
  ].map(function (v) {
    return d3.hsl(v);
  }),
  DEFAULT_WIDTH: 550,
  DEFAULT_HEIGHT: 350,
  TIP_X_EPS: 1
};

Constants.DEFAULT_ITERATIONS = null;
Constants.MAX_ITERATIONS = Constants.DEFAULT_WIDTH * 4;

module.exports = Constants;

},{}],3:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict';
var utils = require('./utils');
var constants = require('./constants');
var assert = utils.assert;

var evalTypeFn = {
  interval: require('./samplers/interval'),
  scatter: require('./samplers/scatter'),
  line: require('./samplers/line')
};

var evaluator = {
  range: function (chart, meta) {
    var range = meta.range || [-Infinity, Infinity];
    var scale = chart.meta.xScale;
    var start = Math.max(scale.domain()[0], range[0]);
    var end = Math.min(scale.domain()[1], range[1]);
    return [start, end];
  },

  eval: function (chart, meta) {
    var range = this.range(chart, meta);
    var data;
    var evalFn = evalTypeFn[meta.graphOptions.type];
    var nSamples = meta.samples || Math.min(
      constants.MAX_ITERATIONS,
      constants.DEFAULT_ITERATIONS || (chart.meta.width * 3)
    );
    data = evalFn(chart, meta, range, nSamples);
    return data;
  }
};

module.exports = evaluator;

},{"./constants":2,"./samplers/interval":10,"./samplers/line":11,"./samplers/scatter":12,"./utils":18}],4:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict';
var d3 = window.d3;

var line = require('../types/line');
var assert = require('../utils').assert;

module.exports = function (options) {
  var annotations;
  var xScale = options.owner.meta.xScale;
  var yScale = options.owner.meta.yScale;

  var line = d3.svg.line()
    .x(function (d) { return d[0]; })
    .y(function (d) { return d[1]; });

  annotations = function (parentSelection) {
    parentSelection.each(function () {
      // join
      var current = d3.select(this);
      var selection = current.selectAll('g.annotations')
        .data(function (d) { return d.annotations || []; });

      // enter
      selection.enter()
        .append('g')
        .attr('class', 'annotations');

      selection.each(function (d) {
        assert(!(d.hasOwnProperty('x') && d.hasOwnProperty('y')));
        assert(typeof d.x === 'number' || typeof d.y === 'number');
      });

      // enter + update
      // - path
      var yRange = yScale.range();
      var xRange = xScale.range();
      var path = selection.selectAll('path')
        .data(function (d) {
          if (d.hasOwnProperty('x')) {
            return [ [[0, yRange[0]], [0, yRange[1]]] ];
          } else {
            return [ [[xRange[0], 0], [xRange[1], 0]] ];
          }
        });
      path.enter()
        .append('path')
        .attr('stroke', '#eee')
        .attr('d', line);
      path.exit().remove();

      // enter + update
      // - text
      var text = selection.selectAll('text')
        .data(function (d) {
          return [{
            text: d.text || '',
            hasX: d.hasOwnProperty('x')
          }];
        });
      text.enter()
        .append('text')
        .attr('y', function (d) {
          return d.hasX ? 3 : 0;
        })
        .attr('x', function (d) {
          return d.hasX ? 0 : 3;
        })
        .attr('dy', function (d) {
          return d.hasX ? 5 : -5;
        })
        .attr('text-anchor', function (d) {
          return d.hasX ? 'end' : '';
        })
        .attr('transform', function (d) {
          return d.hasX ? 'rotate(-90)' : '';
        })
        .text(function (d) { return d.text; });
      text.exit().remove();

      // enter + update
      // move group
      selection
        .attr('transform', function (d) {
          if (d.hasOwnProperty('x')) {
            return 'translate(' + xScale(d.x) + ', 0)';
          } else {
            return 'translate(0, ' + yScale(d.y) + ')';
          }
        });

      // exit
      selection.exit()
        .remove();
    });
  };

  return annotations;
};

},{"../types/line":16,"../utils":18}],5:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict';
var d3 = window.d3;

var evaluate = require('./eval');
var line = require('../types/line');

module.exports = function (options) {
  var dataBuilderConfig = {
    skipTip: true,
    samples: 2,
    graphOptions: {
      type: 'scatter'
    }
  };
  var derivative;

  function computeLine(d) {
    if (!d.derivative) {
      return [];
    }
    var x0 = typeof d.derivative.x0 === 'number' ? d.derivative.x0 : Infinity;
    dataBuilderConfig.scope = {
      m: evaluate(d.derivative, x0),
      x0: x0,
      y0: evaluate(d, x0)
    };
    dataBuilderConfig.fn = 'm * (x - x0) + y0';
    return [dataBuilderConfig];
  }

  function checkAutoUpdate(d) {
    var self = this;
    if (!d.derivative) {
      return;
    }
    if (d.derivative.updateOnMouseMove && !d.derivative.$$mouseListener) {
      d.derivative.$$mouseListener = function (x0) {
        // update initial value to be the position of the mouse
        d.derivative.x0 = x0;
        // trigger update (selection = self)
        derivative(self);
      };
      options.owner.on('tip:update', d.derivative.$$mouseListener);
    }
  }

  derivative = function (selection) {
    selection.each(function (d) {
      var el = d3.select(this);
      var data = computeLine.call(selection, d);
      checkAutoUpdate.call(selection, d);
      var innerSelection = el.selectAll('g.derivative')
          .data(data);

      innerSelection.enter()
          .append('g')
          .attr('class', 'derivative');

      // enter + update
      innerSelection
          .call(line(options));

      // change the opacity of the line
      innerSelection.selectAll('path')
        .attr('opacity', 0.5);

      innerSelection.exit().remove();
    });
  };

  return derivative;
};

},{"../types/line":16,"./eval":6}],6:[function(require,module,exports){
'use strict';
var mathCompile = require('built-in-math-eval');
var extend = require('extend');

function compile(meta) {
  if (!meta.fn) {
    throw new Error('fn is required');
  }

  /* eslint-disable */
  if (meta._expression !== meta.fn) {
    meta._fn = mathCompile(meta.fn);
    meta._expression = meta.fn;
  }
  /* eslint-enable */

  // make sure that scope also exists for fn
  meta.scope = meta.scope || {};
}

module.exports = function (meta, x) {
  compile(meta);

  /* eslint-disable */
  return meta._fn.eval(
    extend({x: x}, meta.scope)
  );
  /* eslint-enable */
};

module.exports.compile = compile;

},{"built-in-math-eval":19,"extend":51}],7:[function(require,module,exports){
/**
 * Created by mauricio on 4/8/15.
 */
'use strict';
var d3 = window.d3;
var derivative = require('./derivative');
var secant = require('./secant');
module.exports = function (options) {
  function helper(selection) {
    selection.each(function () {
      var el = d3.select(this);
      el.call(derivative(options));
      el.call(secant(options));
    });
  }

  return helper;
};

},{"./derivative":5,"./secant":8}],8:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict';
var d3 = window.d3;

var extend = require('extend');
var evaluate = require('./eval');
var line = require('../types/line');
var assert = require('../utils').assert;

module.exports = function (options) {
  var secantDefaults = {
    skipTip: true,
    samples: 2,
    graphOptions: {
      type: 'scatter'
    }
  };
  var secant;

  function computeSlope(scope) {
    scope.m = (scope.y1 - scope.y0) / (scope.x1 - scope.x0);
  }

  function updateLine(d, secant) {
    assert(secant.x0);
    secant.scope = secant.scope || {};

    var x0 = secant.x0;
    var x1 = typeof secant.x1 === 'number' ? secant.x1 : Infinity;
    extend(secant.scope, {
      x0: x0,
      x1: x1,
      y0: evaluate(d, x0),
      y1: evaluate(d, x1)
    });
    computeSlope(secant.scope);
  }

  function setFn(d, secant) {
    updateLine(d, secant);
    secant.fn = 'm * (x - x0) + y0';
  }

  function setMouseListener(d, config) {
    var self = this;
    if (config.updateOnMouseMove && !config.$$mouseListener) {
      config.$$mouseListener = function (x1) {
        config.x1 = x1;
        updateLine(d, config);
        secant(self);
      };
      options.owner.on('tip:update', config.$$mouseListener);
    }
  }

  function computeLines(d) {
    var self = this;
    var data = [];
    for (var i = 0; i < d.secants.length; i += 1) {
      var secant = d.secants[i] = extend({}, secantDefaults, d.secants[i]);
      if (!secant.fn) {
        setFn.call(self, d, secant);
        setMouseListener.call(self, d, secant);
      }
      data.push(secant);
    }
    return data;
  }

  secant = function (selection) {
    selection.each(function (d) {
      var el = d3.select(this);
      var data = computeLines.call(selection, d);
      var innerSelection = el.selectAll('g.secant')
          .data(data);

      innerSelection.enter()
          .append('g')
          .attr('class', 'secant');

      // enter + update
      innerSelection
          .call(line(options));

      // change the opacity of the secants
      innerSelection.selectAll('path')
        .attr('opacity', 0.5);

      // exit
      innerSelection.exit().remove();
    });
  };

  return secant;
};

},{"../types/line":16,"../utils":18,"./eval":6,"extend":51}],9:[function(require,module,exports){
// issue: https://github.com/maurizzzio/function-plot/issues/6
// solution: the line type is selecting the derivative line when the content is re-drawn, then when the
// derivative was redrawn an already selected line (by the line type) was used thus making a single line
// disappear from the graph, to avoid the selection of the derivative line the selector needs to
// work only for immediate children which is done with `:scope >`
// src: http://stackoverflow.com/questions/6481612/queryselector-search-immediate-children
/*eslint-disable */
(function(doc, proto) {
  try { // check if browser supports :scope natively
    doc.querySelector(':scope body');
  } catch (err) { // polyfill native methods if it doesn't
    ['querySelector', 'querySelectorAll'].forEach(function(method) {
      var native = proto[method];
      proto[method] = function(selectors) {
        if (/(^|,)\s*:scope/.test(selectors)) { // only if selectors contains :scope
          var id = this.id; // remember current element id
          this.id = 'ID_' + Date.now(); // assign new unique id
          selectors = selectors.replace(/((^|,)\s*):scope/g, '$1#' + this.id); // replace :scope with #ID
          var result = doc[method](selectors);
          this.id = id; // restore previous id
          return result;
        } else {
          return native.call(this, selectors); // use native code for other selectors
        }
      }
    });
  }
})(window.document, Element.prototype);
/*eslint-enable */

},{}],10:[function(require,module,exports){
/**
 * Created by mauricio on 5/14/15.
 */
'use strict';
var compile = require('interval-arithmetic-eval');
var Interval = compile.Interval;
var extend = require('extend');

var utils = require('../utils');

// disable the use of typed arrays in interval-arithmetic to improve the performance
compile.policies.disableRounding();

function check(meta) {
  /* eslint-disable */
  // compile the function using interval arithmetic, cache the result
  // so that multiple calls with the same argument don't trigger the
  // compilation process
  if (meta.fn !== meta._intervalExpression) {
    meta._intervalExpression = meta.fn;
    meta._intervalFn = compile(meta.fn);
  }
  meta.scope = meta.scope || {};
  /* eslint-enable */
}

function evaluate(meta, variables) {
  check(meta);
  /* eslint-disable */
  var compiled = meta._intervalFn;
  /* eslint-enable */
  return compiled.eval(
    extend({}, meta.scope, variables)
  );
}

function interval1d(chart, meta, xCoords) {
  var xScale = chart.meta.xScale;
  var yScale = chart.meta.yScale;
  var yMin = yScale.domain()[0];
  var yMax = yScale.domain()[1];
  var samples = [];
  var i;
  for (i = 0; i < xCoords.length - 1; i += 1) {
    var x = {lo: xCoords[i], hi: xCoords[i + 1]};
    var y = evaluate(meta, {x: x});
    if (!Interval.empty(y) && !Interval.whole(y)) {
      samples.push([x, y]);
    }
    if (Interval.whole(y)) {
      // means that the next and prev intervals need to be fixed
      samples.push(null);
    }
  }

  // asymptote determination
  for (i = 1; i < samples.length - 1; i += 1) {
    if (!samples[i]) {
      var prev = samples[i - 1];
      var next = samples[i + 1];
      if (prev && next && !Interval.overlap(prev[1], next[1])) {
        if (prev[1].lo > next[1].hi) {
          prev[1].hi = Math.max(yMax, prev[1].hi);
          next[1].lo = Math.min(yMin, next[1].lo);
        }
        if (prev[1].hi < next[1].lo) {
          prev[1].lo = Math.min(yMin, prev[1].lo);
          next[1].hi = Math.max(yMax, next[1].hi);
        }
      }
    }
  }

  // transform +- Infinite to be inside the limit
  for (i = 0; i < samples.length; i += 1) {
    if (samples[i]) {
      if (!isFinite(samples[i][1].lo)) {
        samples[i][1].lo = yMin;
      }
      if (!isFinite(samples[i][1].hi)) {
        samples[i][1].hi = yMax;
      }
    }
  }

  samples.scaledDx = xScale(xCoords[1]) - xScale(xCoords[0]);
  return [samples];
}

var rectEps;
function smallRect(x, y) {
  return Interval.width(x) < rectEps;
}

function quadTree(x, y, meta) {
  var sample = evaluate(meta, {
    x: x,
    y: y
  });
  var fulfills = Interval.zeroIn(sample);
  if (!fulfills) { return this; }
  if (smallRect(x, y)) {
    this.push([x, y]);
    return this;
  }
  var midX = x.lo + (x.hi - x.lo) / 2;
  var midY = y.lo + (y.hi - y.lo) / 2;
  var east = {lo: midX, hi: x.hi};
  var west = {lo: x.lo, hi: midX};
  var north = {lo: midY, hi: y.hi};
  var south = {lo: y.lo, hi: midY};

  quadTree.call(this, east, north, meta);
  quadTree.call(this, east, south, meta);
  quadTree.call(this, west, north, meta);
  quadTree.call(this, west, south, meta);
}

function interval2d(chart, meta) {
  var xScale = chart.meta.xScale;
  var xDomain = chart.meta.xScale.domain();
  var yDomain = chart.meta.yScale.domain();
  var x = {lo: xDomain[0], hi: xDomain[1]};
  var y = {lo: yDomain[0], hi: yDomain[1]};
  var samples = [];
  // 1 px
  rectEps = xScale.invert(1) - xScale.invert(0);
  quadTree.call(samples, x, y, meta);
  samples.scaledDx = 1;
  return [samples];
}

var sampler = function (chart, meta, range, samples) {
  var xCoords = utils.linspace(range, samples);
  if (meta.implicit) {
    return interval2d.call(null, chart, meta, xCoords);
  } else {
    return interval1d.call(null, chart, meta, xCoords);
  }
};

module.exports = sampler;

},{"../utils":18,"extend":51,"interval-arithmetic-eval":52}],11:[function(require,module,exports){
'use strict';
module.exports = require('./scatter');

},{"./scatter":12}],12:[function(require,module,exports){
'use strict';
var utils = require('../utils');
var evaluate = require('../helpers/eval');

var sampler = function (chart, meta, range, n) {
  var allX = utils.linspace(range, n);
  var st = [];
  var samples = [];
  var i;
  for (i = 0; i < allX.length; i += 1) {
    var x = allX[i];
    var y = evaluate(meta, x);
    if (utils.isValidNumber(y)) {
      st.push([x, y]);
    } else {
      samples.push(st);
      st = [];
    }
  }
  if (st.length) {
    samples.push(st);
  }
  return samples;
};

module.exports = sampler;

},{"../helpers/eval":6,"../utils":18}],13:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict';
var d3 = window.d3;
var extend = require('extend');
var utils = require('./utils');
var Const = require('./constants');
var evaluate = require('./helpers/eval');

module.exports = function (config) {
  config = extend({
    xLine: false,
    yLine: false,
    renderer: function (x, y) {
      return '(' + x.toFixed(3) + ', ' + y.toFixed(3) + ')';
    },
    owner: null
  }, config);

  var MARGIN = 20;

  var line = d3.svg.line()
    .x(function (d) { return d[0]; })
    .y(function (d) { return d[1]; });

  function lineGenerator(el, data) {
    return el.append('path')
      .datum(data)
      .attr('stroke', 'grey')
      .attr('stroke-dasharray', '5,5')
      .attr('opacity', 0.5)
      .attr('d', line);
  }

  function tip(selection) {
    var innerSelection = selection.selectAll('g.tip')
        .data(function (d) { return [d]; });

    // enter
    innerSelection
      .enter().append('g')
        .attr('class', 'tip')
        .attr('clip-path', 'url(#function-plot-clip-' + config.owner.id + ')');

    // enter + update = enter inner tip
    tip.el = innerSelection.selectAll('g.inner-tip')
      .data(function (d) {
        //debugger;
        return [d];
      });

    tip.el.enter()
      .append('g')
      .attr('class', 'inner-tip')
      .style('display', 'none')
      .each(function () {
        var el = d3.select(this);
        lineGenerator(el, [[0, -config.owner.meta.height - MARGIN], [0, config.owner.meta.height + MARGIN]])
          .attr('class', 'tip-x-line')
          .style('display', 'none');
        lineGenerator(el, [[-config.owner.meta.width - MARGIN, 0], [config.owner.meta.width + MARGIN, 0]])
          .attr('class', 'tip-y-line')
          .style('display', 'none');
        el.append('circle').attr('r', 3);
        el.append('text').attr('transform', 'translate(5,-5)');
      });

    // enter + update
    selection.selectAll('.tip-x-line').style('display', config.xLine ? null : 'none');
    selection.selectAll('.tip-y-line').style('display', config.yLine ? null : 'none');
  }

  tip.move = function (x0, y0) {
    var i;
    var minDist = Infinity;
    var closestIndex = -1;
    var x, y;

    var el = tip.el;
    var inf = 1e8;
    var meta = config.owner.meta;
    var data = el.data()[0].data;
    var xScale = meta.xScale;
    var yScale = meta.yScale;
    var width = meta.width;
    var height = meta.height;

    for (i = 0; i < data.length; i += 1) {
      if (data[i].skipTip) {
        continue;
      }

      // implicit equations cannot be evaluated with a single point
      if (data[i].implicit) {
        continue;
      }

      var range = data[i].range || [-inf, inf];
      if (x0 > range[0] - Const.TIP_X_EPS && x0 < range[1] + Const.TIP_X_EPS) {
        var candidateY = evaluate(data[i], x0);
        if (utils.isValidNumber(candidateY)) {
          var tDist = Math.abs(candidateY - y0);
          if (tDist < minDist) {
            minDist = tDist;
            closestIndex = i;
          }
        }
      }
    }

    if (closestIndex !== -1) {
      x = x0;
      if (data[closestIndex].range) {
        x = Math.max(x, data[closestIndex].range[0]);
        x = Math.min(x, data[closestIndex].range[1]);
      }
      y = evaluate(data[closestIndex], x);

      tip.show();
      config.owner.emit('tip:update', x, y, closestIndex);
      var clampX = utils.clamp(x, xScale.invert(-MARGIN), xScale.invert(width + MARGIN));
      var clampY = utils.clamp(y, yScale.invert(height + MARGIN), yScale.invert(-MARGIN));
      el.attr('transform', 'translate(' + xScale( clampX ) + ',' + yScale( clampY ) + ')');
      el.select('circle')
        .attr('fill', Const.COLORS[closestIndex]);
      el.select('text')
        .attr('fill', Const.COLORS[closestIndex])
        .text(config.renderer(x, y));
    } else {
      tip.hide();
    }
  };

  tip.show = function () {
    this.el.style('display', null);
  };

  tip.hide = function () {
    this.el.style('display', 'none');
  };
  // generations of getters/setters
  Object.keys(config).forEach(function (option) {
    utils.getterSetter.call(tip, config, option);
  });

  return tip;
};


},{"./constants":2,"./helpers/eval":6,"./utils":18,"extend":51}],14:[function(require,module,exports){
/**
 * Created by mauricio on 4/5/15.
 */
'use strict';
module.exports = {
  line: require('./line'),
  interval: require('./interval'),
  scatter: require('./scatter')
};

},{"./interval":15,"./line":16,"./scatter":17}],15:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict';
var d3 = window.d3;

var Const = require('../constants');
var dataBuilder = require('../data');

module.exports = function (options) {
  var minWidthHeight;
  var xScale = options.owner.meta.xScale;
  var yScale = options.owner.meta.yScale;

  var line = function (points) {
    var path = '';
    for (var i = 0, length = points.length; i < length; i += 1) {
      if (points[i]) {
        var x = points[i][0];
        var y = points[i][1];
        var yLo = y.lo;
        var yHi = y.hi;
        // if options.closed is set to true then one of the bounds must be zero
        if (options.closed) {
          yLo = Math.min(yLo, 0);
          yHi = Math.max(yHi, 0);
        }
        // points.scaledDX is added because of the stroke-width
        var moveX = xScale(x.lo) + points.scaledDx / 2;
        var moveY = yScale(yHi);
        var diffY = Math.max(yScale(yLo) - yScale(yHi), minWidthHeight);
        path += ' M ' + moveX + ' ' + moveY;
        path += ' v ' + diffY;
      }
    }
    return path;
  };

  function plotLine(selection) {
    var index = options.index;

    selection.each(function (data) {
      var el = plotLine.el = d3.select(this);
      var evaluatedData = dataBuilder.eval(options.owner, data);
      var innerSelection = el.selectAll(':scope > path.line')
        .data(evaluatedData);

      // the min height/width of the rects drawn by the path generator
      minWidthHeight = Math.max(evaluatedData[0].scaledDx, 1.5);

      innerSelection.enter()
        .append('path')
        .attr('class', 'line line-' + index)
        .attr('stroke', Const.COLORS[index])
        .attr('fill', 'none');

      // enter + update
      innerSelection
        .each(function () {
          var path = d3.select(this);
          path
            .attr('stroke-width', minWidthHeight)
            .attr('opacity', options.closed ? 0.5 : 1)
            .attr('d', line);
        });

      innerSelection.exit().remove();
    });
  }

  return plotLine;
};

},{"../constants":2,"../data":3}],16:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict';
var d3 = window.d3;

var Const = require('../constants');
var dataBuilder = require('../data');

module.exports = function (options) {

  var xScale = options.owner.meta.xScale;
  var yScale = options.owner.meta.yScale;
  var line = d3.svg.line()
    .interpolate('linear')
    .x(function (d) { return xScale(d[0]); })
    .y(function (d) { return yScale(d[1]); });
  var area = d3.svg.area()
    .x(function (d) { return xScale(d[0]); })
    .y0(yScale(0))
    .y1(function (d) { return yScale(d[1]); });

  function plotLine(selection) {
    var index = options.index;

    selection.each(function (data) {
      var el = plotLine.el = d3.select(this);
      var evaluatedData = dataBuilder.eval(options.owner, data);
      var innerSelection = el.selectAll(':scope > path.line')
        .data(evaluatedData);

      innerSelection.enter()
        .append('path')
        .attr('class', 'line line-' + index)
        .attr('stroke-width', 1.5)
        .attr('stroke-linecap', 'round')
        .attr('stroke', Const.COLORS[index]);

      // enter + update
      innerSelection
        .each(function () {
          var path = d3.select(this);
          var d;
          if (options.closed) {
            path.attr('fill', Const.COLORS[index]);
            path.attr('fill-opacity', 0.3);
            d = area;
          } else {
            path.attr('fill', 'none');
            d = line;
          }
          path.attr('d', d);
        });

      innerSelection.exit().remove();
    });
  }

  return plotLine;
};

},{"../constants":2,"../data":3}],17:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict';
var d3 = window.d3;

var Const = require('../constants');
var dataBuilder = require('../data');

module.exports = function (options) {
  var xScale = options.owner.meta.xScale;
  var yScale = options.owner.meta.yScale;

  function scatter(selection) {
    var index = options.index;

    selection.each(function (data) {
      var i, j;
      var fill = d3.hsl(Const.COLORS[index].toString());
      var evaluatedData = dataBuilder.eval(options.owner, data);

      // scatter doesn't need groups, therefore each group is
      // flattened into a single array
      var joined = [];
      for (i = 0; i < evaluatedData.length; i += 1) {
        for (j = 0; j < evaluatedData[i].length; j += 1) {
          joined.push(evaluatedData[i][j]);
        }
      }

      var innerSelection = d3.select(this).selectAll(':scope > circle')
        .data(joined);

      innerSelection.enter()
        .append('circle')
        .attr('fill', d3.hsl(fill.toString()).brighter(1.5))
        .attr('stroke', fill);

      innerSelection
        .attr('opacity', 0.7)
        .attr('r', 1)
        .attr('cx', function (d) { return xScale(d[0]); })
        .attr('cy', function (d) { return yScale(d[1]); });

      innerSelection.exit().remove();
    });
  }

  return scatter;
};

},{"../constants":2,"../data":3}],18:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict';

module.exports = {
  isValidNumber: function (v) {
    return typeof v === 'number' && !isNaN(v);
  },

  linspace: function (range, n) {
    var samples = [];
    var delta = (range[1] - range[0]) / (n - 1);
    for (var i = 0; i < n; i += 1) {
      samples.push(range[0] + i * delta);
    }
    return samples;
  },

  getterSetter: function (config, option) {
    var me = this;
    this[option] = function (value) {
      if (!arguments.length) {
        return config[option];
      }
      config[option] = value;
      return me;
    };
  },

  clamp: function (v, min, max) {
    if (min > max) {
      var t = min;
      min = max;
      max = t;
    }
    if (v < min) {
      v = min;
    }
    if (v > max) {
      v = max;
    }
    return v;
  },

  sgn: function (v) {
    if (v < 0) { return -1; }
    if (v > 0) { return 1; }
    return 0;
  },

  bySign: function (v, min, max) {
    if (v < 0) {
      if (v < min) {
        return v;
      }
      return min;
    } else {
      if (v > max) {
        return v;
      }
      return max;
    }
  },

  assert: function (v, message) {
    message = message || 'assertion failed';
    if (!v) {
      throw new Error(message);
    }
  }
};

},{}],19:[function(require,module,exports){
/*
 * built-in-math-eval
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */

'use strict'

module.exports = require('./lib/eval')

},{"./lib/eval":21}],20:[function(require,module,exports){
'use strict'
module.exports = function () {
  var math = Object.create(Math)

  math.factory = function (a) {
    if (typeof a !== 'number') {
      throw new TypeError('built-in math factory only accepts numbers')
    }
    return Number(a)
  }

  math.add = function (a, b) {
    return a + b
  }
  math.sub = function (a, b) {
    return a - b
  }
  math.mul = function (a, b) {
    return a * b
  }
  math.div = function (a, b) {
    return a / b
  }
  math.mod = function (a, b) {
    return a % b
  }
  math.factorial = function (a) {
    var res = 1
    for (var i = 2; i <= a; i += 1) {
      res *= i
    }
    return res
  }

  // logical
  math.logicalOR = function (a, b) {
    return a || b
  }
  math.logicalXOR = function (a, b) {
    /* eslint-disable */
    return a != b
    /* eslint-enable*/
  }
  math.logicalAND = function (a, b) {
    return a && b
  }

  // bitwise
  math.bitwiseOR = function (a, b) {
    /* eslint-disable */
    return a | b
    /* eslint-enable*/
  }
  math.bitwiseXOR = function (a, b) {
    /* eslint-disable */
    return a ^ b
    /* eslint-enable*/
  }
  math.bitwiseAND = function (a, b) {
    /* eslint-disable */
    return a & b
    /* eslint-enable*/
  }

  // relational
  math.lessThan = function (a, b) {
    return a < b
  }
  math.lessEqualThan = function (a, b) {
    return a <= b
  }
  math.greaterThan = function (a, b) {
    return a > b
  }
  math.greaterEqualThan = function (a, b) {
    return a >= b
  }
  math.equal = function (a, b) {
    /* eslint-disable */
    return a == b
  /* eslint-enable*/
  }
  math.strictlyEqual = function (a, b) {
    return a === b
  }
  math.notEqual = function (a, b) {
    /* eslint-disable */
    return a != b
  /* eslint-enable*/
  }
  math.strictlyNotEqual = function (a, b) {
    return a !== b
  }

  // shift
  math.shiftRight = function (a, b) {
    return (a >> b)
  }
  math.shiftLeft = function (a, b) {
    return (a << b)
  }
  math.unsignedRightShift = function (a, b) {
    return (a >>> b)
  }

  // unary
  math.negative = function (a) {
    return -a
  }
  math.positive = function (a) {
    return a
  }

  return math
}

},{}],21:[function(require,module,exports){
'use strict'

var CodeGenerator = require('math-codegen')
var math = require('./adapter')()

function processScope (scope) {
  Object.keys(scope).forEach(function (k) {
    var value = scope[k]
    scope[k] = math.factory(value)
  })
}

module.exports = function (expression) {
  return new CodeGenerator()
    .setDefs({
      $$processScope: processScope
    })
    .parse(expression)
    .compile(math)
}

module.exports.math = math

},{"./adapter":20,"math-codegen":22}],22:[function(require,module,exports){
/*
 * math-codegen
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */
'use strict'
module.exports = require('./lib/CodeGenerator')

},{"./lib/CodeGenerator":23}],23:[function(require,module,exports){
'use strict'

var Parser = require('mr-parser').Parser
var Interpreter = require('./Interpreter')
var extend = require('extend')

function CodeGenerator (options, defs) {
  this.statements = []
  this.defs = defs || {}
  this.interpreter = new Interpreter(this, options)
}

CodeGenerator.prototype.setDefs = function (defs) {
  this.defs = extend(this.defs, defs)
  return this
}

CodeGenerator.prototype.compile = function (namespace) {
  if (!namespace || !(typeof namespace === 'object' || typeof namespace === 'function')) {
    throw TypeError('namespace must be an object')
  }
  if (typeof namespace.factory !== 'function') {
    throw TypeError('namespace.factory must be a function')
  }

  // definitions available in the function
  // each property under this.defs is mapped to local variables
  // e.g
  //
  //  function (defs) {
  //    var ns = defs['ns']
  //    // code generated for the expression
  //  }
  this.defs.ns = namespace
  this.defs.$$mathCodegen = {
    getProperty: function (symbol, scope, ns) {
      if (symbol in scope) {
        return scope[symbol]
      }
      if (symbol in ns) {
        return ns[symbol]
      }
      throw SyntaxError('symbol "' + symbol + '" is undefined')
    },
    functionProxy: function (fn, name) {
      if (typeof fn !== 'function') {
        throw SyntaxError('symbol "' + name + '" must be a function')
      }
      return fn
    }
  }
  this.defs.$$processScope = this.defs.$$processScope || function () {}

  var defsCode = Object.keys(this.defs).map(function (name) {
    return 'var ' + name + ' = defs["' + name + '"]'
  })

  // statement join
  if (!this.statements.length) {
    throw Error('there are no statements saved in this generator, make sure you parse an expression before compiling it')
  }

  // last statement is always a return statement
  this.statements[this.statements.length - 1] = 'return ' + this.statements[this.statements.length - 1]

  var code = this.statements.join(';')
  var factoryCode = defsCode.join('\n') + '\n' + [
    'return {',
    '  eval: function (scope) {',
    '    scope = scope || {}',
    '    $$processScope(scope)',
    '    ' + code,
    '  },',
    "  code: '" + code + "'",
    '}'
  ].join('\n')

  /* eslint-disable */
  var factory = new Function('defs', factoryCode)
  return factory(this.defs)
  /* eslint-enable */
}

CodeGenerator.prototype.parse = function (code) {
  var self = this
  var program = new Parser().parse(code)
  this.statements = program.blocks.map(function (statement) {
    return self.interpreter.next(statement)
  })
  return this
}

module.exports = CodeGenerator

},{"./Interpreter":24,"extend":35,"mr-parser":36}],24:[function(require,module,exports){
'use strict'
var extend = require('extend')

var types = {
  ArrayNode: require('./node/ArrayNode'),
  AssignmentNode: require('./node/AssignmentNode'),
  ConditionalNode: require('./node/ConditionalNode'),
  ConstantNode: require('./node/ConstantNode'),
  FunctionNode: require('./node/FunctionNode'),
  OperatorNode: require('./node/OperatorNode'),
  SymbolNode: require('./node/SymbolNode'),
  UnaryNode: require('./node/UnaryNode')
}

var Interpreter = function (owner, options) {
  this.owner = owner
  this.options = extend({
    factory: 'ns.factory',
    raw: false,
    rawArrayExpressionElements: true,
    rawCallExpressionElements: false
  }, options)
}

extend(Interpreter.prototype, types)

// main method which decides which expression to call
Interpreter.prototype.next = function (node) {
  if (!(node.type in this)) {
    throw new TypeError('the node type ' + node.type + ' is not implemented')
  }
  return this[node.type](node)
}

Interpreter.prototype.rawify = function (test, fn) {
  var oldRaw = this.options.raw
  if (test) {
    this.options.raw = true
  }
  fn()
  if (test) {
    this.options.raw = oldRaw
  }
}

module.exports = Interpreter

},{"./node/ArrayNode":27,"./node/AssignmentNode":28,"./node/ConditionalNode":29,"./node/ConstantNode":30,"./node/FunctionNode":31,"./node/OperatorNode":32,"./node/SymbolNode":33,"./node/UnaryNode":34,"extend":35}],25:[function(require,module,exports){
'use strict'

module.exports = {
  // arithmetic
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  '^': 'pow',
  '%': 'mod',
  '!': 'factorial',

  // misc operators
  '|': 'bitwiseOR',       // bitwise or
  '^|': 'bitwiseXOR',     // bitwise xor
  '&': 'bitwiseAND',      // bitwise and

  '||': 'logicalOR',      // logical or
  'xor': 'logicalXOR',    // logical xor
  '&&': 'logicalAND',     // logical and

  // comparison
  '<': 'lessThan',
  '>': 'greaterThan',
  '<=': 'lessEqualThan',
  '>=': 'greaterEqualThan',
  '===': 'strictlyEqual',
  '==': 'equal',
  '!==': 'strictlyNotEqual',
  '!=': 'notEqual',

  // shift
  '>>': 'shiftRight',
  '<<': 'shiftLeft',
  '>>>': 'unsignedRightShift'
}

},{}],26:[function(require,module,exports){
'use strict'

module.exports = {
  '+': 'positive',
  '-': 'negative',
  '~': 'oneComplement'
}

},{}],27:[function(require,module,exports){
'use strict'
module.exports = function (node) {
  var self = this
  var arr = []
  this.rawify(this.options.rawArrayExpressionElements, function () {
    arr = node.nodes.map(function (el) {
      return self.next(el)
    })
  })
  var arrString = '[' + arr.join(',') + ']'

  if (this.options.raw) {
    return arrString
  }
  return this.options.factory + '(' + arrString + ')'
}

},{}],28:[function(require,module,exports){
'use strict'

module.exports = function (node) {
  return 'scope["' + node.name + '"] = ' + this.next(node.expr)
}

},{}],29:[function(require,module,exports){
'use strict'

module.exports = function (node) {
  var condition = '!!(' + this.next(node.condition) + ')'
  var trueExpr = this.next(node.trueExpr)
  var falseExpr = this.next(node.falseExpr)
  return '(' + condition + ' ? (' + trueExpr + ') : (' + falseExpr + ') )'
}

},{}],30:[function(require,module,exports){
'use strict'
module.exports = function (node) {
  if (this.options.raw) {
    return node.value
  }
  return this.options.factory + '(' + node.value + ')'
}

},{}],31:[function(require,module,exports){
'use strict'
var SymbolNode = require('mr-parser').nodeTypes.SymbolNode

var functionProxy = function (node) {
  return '$$mathCodegen.functionProxy(' + this.next(new SymbolNode(node.name)) + ', "' + node.name + '")'
}

module.exports = function (node) {
  var self = this
  // wrap in a helper function to detect the type of symbol it must be a function
  // NOTE: if successful the wrapper returns the function itself
  // NOTE: node.name should be a symbol so that it's correctly represented as a string in SymbolNode
  var method = functionProxy.call(this, node)
  var args = []
  this.rawify(this.options.rawCallExpressionElements, function () {
    args = node.args.map(function (arg) {
      return self.next(arg)
    })
  })
  return method + '(' + args.join(', ') + ')'
}

module.exports.functionProxy = functionProxy

},{"mr-parser":36}],32:[function(require,module,exports){
'use strict'

var Operators = require('../misc/Operators')

module.exports = function (node) {
  if (this.options.raw) {
    return ['(' + this.next(node.args[0]), node.op, this.next(node.args[1]) + ')'].join(' ')
  }

  var namedOperator = Operators[node.op]

  if (!namedOperator) {
    throw TypeError('unidentified operator')
  }

  /* eslint-disable new-cap */
  return this.FunctionNode({
    name: namedOperator,
    args: node.args
  })
  /* eslint-enable new-cap */
}

},{"../misc/Operators":25}],33:[function(require,module,exports){
'use strict'

module.exports = function (node) {
  var id = node.name
  return '$$mathCodegen.getProperty("' + id + '", scope, ns)'
}

},{}],34:[function(require,module,exports){
'use strict'

var UnaryOperators = require('../misc/UnaryOperators')

module.exports = function (node) {
  if (this.options.raw) {
    return node.op + this.next(node.argument)
  }

  if (!(node.op in UnaryOperators)) {
    throw new SyntaxError(node.op + ' not implemented')
  }

  var namedOperator = UnaryOperators[node.op]
  /* eslint-disable new-cap */
  return this.FunctionNode({
    name: namedOperator,
    args: [node.argument]
  })
  /* eslint-enable new-cap */
}

},{"../misc/UnaryOperators":26}],35:[function(require,module,exports){
'use strict';

var hasOwn = Object.prototype.hasOwnProperty;
var toStr = Object.prototype.toString;

var isArray = function isArray(arr) {
	if (typeof Array.isArray === 'function') {
		return Array.isArray(arr);
	}

	return toStr.call(arr) === '[object Array]';
};

var isPlainObject = function isPlainObject(obj) {
	if (!obj || toStr.call(obj) !== '[object Object]') {
		return false;
	}

	var hasOwnConstructor = hasOwn.call(obj, 'constructor');
	var hasIsPrototypeOf = obj.constructor && obj.constructor.prototype && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
	// Not own constructor property must be Object
	if (obj.constructor && !hasOwnConstructor && !hasIsPrototypeOf) {
		return false;
	}

	// Own properties are enumerated firstly, so to speed up,
	// if last one is own, then all properties are own.
	var key;
	for (key in obj) {/**/}

	return typeof key === 'undefined' || hasOwn.call(obj, key);
};

module.exports = function extend() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0],
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if (typeof target === 'boolean') {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	} else if ((typeof target !== 'object' && typeof target !== 'function') || target == null) {
		target = {};
	}

	for (; i < length; ++i) {
		options = arguments[i];
		// Only deal with non-null/undefined values
		if (options != null) {
			// Extend the base object
			for (name in options) {
				src = target[name];
				copy = options[name];

				// Prevent never-ending loop
				if (target !== copy) {
					// Recurse if we're merging plain objects or arrays
					if (deep && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
						if (copyIsArray) {
							copyIsArray = false;
							clone = src && isArray(src) ? src : [];
						} else {
							clone = src && isPlainObject(src) ? src : {};
						}

						// Never move original objects, clone them
						target[name] = extend(deep, clone, copy);

					// Don't bring in undefined values
					} else if (typeof copy !== 'undefined') {
						target[name] = copy;
					}
				}
			}
		}
	}

	// Return the modified object
	return target;
};


},{}],36:[function(require,module,exports){
/*
 * mr-parser
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */

'use strict'

module.exports.Lexer = require('./lib/Lexer')
module.exports.Parser = require('./lib/Parser')
module.exports.nodeTypes = require('./lib/node/')

},{"./lib/Lexer":37,"./lib/Parser":38,"./lib/node/":49}],37:[function(require,module,exports){
// token types
var tokenType = require('./token-type')

var ESCAPES = {
  'n': '\n',
  'f': '\f',
  'r': '\r',
  't': '\t',
  'v': '\v',
  '\'': '\'',
  '"': '"'
}

var DELIMITERS = {
  ',': true,
  '(': true,
  ')': true,
  '[': true,
  ']': true,
  ';': true,

  // unary
  '~': true,

  // factorial
  '!': true,

  // arithmetic operators
  '+': true,
  '-': true,
  '*': true,
  '/': true,
  '%': true,
  '^': true,
  '**': true,     // python power like

  // misc operators
  '|': true,      // bitwise or
  '&': true,      // bitwise and
  '^|': true,     // bitwise xor
  '=': true,
  ':': true,
  '?': true,

  '||': true,      // logical or
  '&&': true,      // logical and
  'xor': true,     // logical xor

  // relational
  '==': true,
  '!=': true,
  '===': true,
  '!==': true,
  '<': true,
  '>': true,
  '>=': true,
  '<=': true,

  // shifts
  '>>>': true,
  '<<': true,
  '>>': true
}

// helpers

function isDigit (c) {
  return c >= '0' && c <= '9'
}

function isIdentifier (c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
    c === '$' || c === '_'
}

function isWhitespace (c) {
  return c === ' ' || c === '\r' || c === '\t' ||
    c === '\n' || c === '\v' || c === '\u00A0'
}

function isDelimiter (str) {
  return DELIMITERS[str]
}

function isQuote (c) {
  return c === '\'' || c === '"'
}

// lexer

function Lexer () {}

Lexer.prototype.throwError = function (message, index) {
  index = typeof index === 'undefined' ? this.index : index

  var error = new Error(message + ' at index ' + index)
  error.index = index
  error.description = message
  throw error
}

Lexer.prototype.lex = function (text) {
  this.text = text
  this.index = 0
  this.tokens = []

  while (this.index < this.text.length) {
    // skip whitespaces
    while (isWhitespace(this.peek())) {
      this.consume()
    }
    var c = this.peek()
    var c2 = c + this.peek(1)
    var c3 = c2 + this.peek(2)

    // order
    // - delimiter of 3 characters
    // - delimiter of 2 characters
    // - delimiter of 1 character
    // - number
    // - variables, functions and named operators
    if (isDelimiter(c3)) {
      this.tokens.push({
        type: tokenType.DELIMITER,
        value: c3
      })
      this.consume()
      this.consume()
      this.consume()
    } else if (isDelimiter(c2)) {
      this.tokens.push({
        type: tokenType.DELIMITER,
        value: c2
      })
      this.consume()
      this.consume()
    } else if (isDelimiter(c)) {
      this.tokens.push({
        type: tokenType.DELIMITER,
        value: c
      })
      this.consume()
    } else if (isDigit(c) ||
        (c === '.' && isDigit(this.peek(1)))) {
      this.tokens.push({
        type: tokenType.NUMBER,
        value: this.readNumber()
      })
    } else if (isQuote(c)) {
      this.tokens.push({
        type: tokenType.STRING,
        value: this.readString()
      })
    } else if (isIdentifier(c)) {
      this.tokens.push({
        type: tokenType.SYMBOL,
        value: this.readIdentifier()
      })
    } else {
      this.throwError('unexpected character ' + c)
    }
  }

  // end token
  this.tokens.push({ type: tokenType.EOF })

  return this.tokens
}

Lexer.prototype.peek = function (nth) {
  nth = nth || 0
  if (this.index + nth >= this.text.length) {
    return
  }
  return this.text.charAt(this.index + nth)
}

Lexer.prototype.consume = function () {
  var current = this.peek()
  this.index += 1
  return current
}

Lexer.prototype.readNumber = function () {
  var number = ''

  if (this.peek() === '.') {
    number += this.consume()
    if (!isDigit(this.peek())) {
      this.throwError('number expected')
    }
  } else {
    while (isDigit(this.peek())) {
      number += this.consume()
    }
    if (this.peek() === '.') {
      number += this.consume()
    }
  }

  // numbers after the decimal dot
  while (isDigit(this.peek())) {
    number += this.consume()
  }

  // exponent if available
  if ((this.peek() === 'e' || this.peek() === 'E')) {
    number += this.consume()

    if (!(isDigit(this.peek()) ||
        this.peek() === '+' ||
        this.peek() === '-')) {
      this.throwError()
    }

    if (this.peek() === '+' || this.peek() === '-') {
      number += this.consume()
    }

    if (!isDigit(this.peek())) {
      this.throwError('number expected')
    }

    while (isDigit(this.peek())) {
      number += this.consume()
    }
  }
  return number
}

Lexer.prototype.readIdentifier = function () {
  var text = ''
  while (isIdentifier(this.peek()) || isDigit(this.peek())) {
    text += this.consume()
  }
  return text
}

Lexer.prototype.readString = function () {
  var quote = this.consume()
  var string = ''
  var escape
  while (true) {
    var c = this.consume()
    if (!c) {
      this.throwError('string is not closed')
    }
    if (escape) {
      if (c === 'u') {
        var hex = this.text.substring(this.index + 1, this.index + 5)
        if (!hex.match(/[\da-f]{4}/i)) {
          this.throwError('invalid unicode escape')
        }
        this.index += 4
        string += String.fromCharCode(parseInt(hex, 16))
      } else {
        var replacement = ESCAPES[c]
        if (replacement) {
          string += replacement
        } else {
          string += c
        }
      }
      escape = false
    } else if (c === quote) {
      break
    } else if (c === '\\') {
      escape = true
    } else {
      string += c
    }
  }
  return string
}

module.exports = Lexer

},{"./token-type":50}],38:[function(require,module,exports){
var tokenType = require('./token-type')

var Lexer = require('./Lexer')
var ConstantNode = require('./node/ConstantNode')
var OperatorNode = require('./node/OperatorNode')
var UnaryNode = require('./node/UnaryNode')
var SymbolNode = require('./node/SymbolNode')
var FunctionNode = require('./node/FunctionNode')
var ArrayNode = require('./node/ArrayNode')
var ConditionalNode = require('./node/ConditionalNode')
var AssignmentNode = require('./node/AssignmentNode')
var BlockNode = require('./node/BlockNode')

/**
 * Grammar DSL:
 *
 * program          : block (; block)*
 *
 * block            : assignment
 *
 * assignment       : ternary
 *                  | symbol `=` assignment
 *
 * ternary          : logicalOR
 *                  | logicalOR `?` ternary `:` ternary
 *
 * logicalOR        : logicalXOR
 *                  | logicalXOR (`||`,`or`) logicalOR
 *
 * logicalXOR       : logicalAND
 *                  : logicalAND `xor` logicalXOR
 *
 * logicalAND       : bitwiseOR
 *                  | bitwiseOR (`&&`,`and`) logicalAND
 *
 * bitwiseOR        : bitwiseXOR
 *                  | bitwiseXOR `|` bitwiseOR
 *
 * bitwiseXOR       : bitwiseAND
 *                  | bitwiseAND `^|` bitwiseXOR
 *
 * bitwiseAND       : relational
 *                  | relational `&` bitwiseAND
 *
 * relational       : shift
 *                  | shift (`!=` | `==` | `>` | '<' | '<=' |'>=') shift)
 *
 * shift            : additive
 *                  | additive (`>>` | `<<` | `>>>`) shift
 *
 * additive         : multiplicative
 *                  | multiplicative (`+` | `-`) additive
 *
 * multiplicative   : unary
 *                  | unary (`*` | `/` | `%`) unary
 *                  | unary symbol
 *
 * unary            : pow
 *                  | (`-` | `+` | `~`) unary
 *
 * pow              : factorial
 *                  | factorial (`^`, '**') unary
 *
 * factorial        : symbol
 *                  | symbol (`!`)
 *
 * symbol           : symbolToken
 *                  | symbolToken functionCall
 *                  | string
 *
 * functionCall     : `(` `)`
 *                  | `(` ternary (, ternary)* `)`
 *
 * string           : `'` (character)* `'`
 *                  : `"` (character)* `"`
 *                  | array
 *
 * array            : `[` `]`
 *                  | `[` assignment (, assignment)* `]`
 *                  | number
 *
 * number           : number-token
 *                  | parentheses
 *
 * parentheses      : `(` assignment `)`
 *                  : end
 *
 * end              : NULL
 *
 * @param {[type]} lexer [description]
 */
function Parser () {
  this.lexer = new Lexer()
  this.tokens = null
}

Parser.prototype.current = function () {
  return this.tokens[0]
}

Parser.prototype.next = function () {
  return this.tokens[1]
}

Parser.prototype.peek = function () {
  if (this.tokens.length) {
    var first = this.tokens[0]
    for (var i = 0; i < arguments.length; i += 1) {
      if (first.value === arguments[i]) {
        return true
      }
    }
  }
}

Parser.prototype.consume = function (e) {
  return this.tokens.shift()
}

Parser.prototype.expect = function (e) {
  if (!this.peek(e)) {
    throw Error('expected ' + e)
  }
  return this.consume()
}

Parser.prototype.isEOF = function () {
  return this.current().type === tokenType.EOF
}

Parser.prototype.parse = function (text) {
  this.tokens = this.lexer.lex(text)
  return this.program()
}

Parser.prototype.program = function () {
  var blocks = []
  while (!this.isEOF()) {
    blocks.push(this.assignment())
    if (this.peek(';')) {
      this.consume()
    }
  }
  this.end()
  return new BlockNode(blocks)
}

Parser.prototype.assignment = function () {
  var left = this.ternary()
  if (left instanceof SymbolNode && this.peek('=')) {
    this.consume()
    return new AssignmentNode(left.name, this.assignment())
  }
  return left
}

Parser.prototype.ternary = function () {
  var predicate = this.logicalOR()
  if (this.peek('?')) {
    this.consume()
    var truthy = this.ternary()
    this.expect(':')
    var falsy = this.ternary()
    return new ConditionalNode(predicate, truthy, falsy)
  }
  return predicate
}

Parser.prototype.logicalOR = function () {
  var left = this.logicalXOR()
  if (this.peek('||')) {
    var op = this.consume()
    var right = this.logicalOR()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.logicalXOR = function () {
  var left = this.logicalAND()
  if (this.current().value === 'xor') {
    var op = this.consume()
    var right = this.logicalXOR()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.logicalAND = function () {
  var left = this.bitwiseOR()
  if (this.peek('&&')) {
    var op = this.consume()
    var right = this.logicalAND()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.bitwiseOR = function () {
  var left = this.bitwiseXOR()
  if (this.peek('|')) {
    var op = this.consume()
    var right = this.bitwiseOR()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.bitwiseXOR = function () {
  var left = this.bitwiseAND()
  if (this.peek('^|')) {
    var op = this.consume()
    var right = this.bitwiseXOR()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.bitwiseAND = function () {
  var left = this.relational()
  if (this.peek('&')) {
    var op = this.consume()
    var right = this.bitwiseAND()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.relational = function () {
  var left = this.shift()
  if (this.peek('==', '===', '!=', '!==', '>=', '<=', '>', '<')) {
    var op = this.consume()
    var right = this.shift()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.shift = function () {
  var left = this.additive()
  if (this.peek('>>', '<<', '>>>')) {
    var op = this.consume()
    var right = this.shift()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.additive = function () {
  var left = this.multiplicative()
  while (this.peek('+', '-')) {
    var op = this.consume()
    left = new OperatorNode(op.value, [left, this.multiplicative()])
  }
  return left
}

Parser.prototype.multiplicative = function () {
  var op, right
  var left = this.unary()
  while (this.peek('*', '/', '%')) {
    op = this.consume()
    left = new OperatorNode(op.value, [left, this.unary()])
  }

  // implicit multiplication
  // - 2 x
  // - 2(x)
  // - (2)2
  if (this.current().type === tokenType.SYMBOL ||
      this.peek('(') ||
      (!(left.type instanceof ConstantNode) && this.current().type === tokenType.NUMBER)
      ) {
    right = this.multiplicative()
    return new OperatorNode('*', [left, right])
  }

  return left
}

Parser.prototype.unary = function () {
  if (this.peek('-', '+', '~')) {
    var op = this.consume()
    var right = this.unary()
    return new UnaryNode(op.value, right)
  }
  return this.pow()
}

Parser.prototype.pow = function () {
  var left = this.factorial()
  if (this.peek('^', '**')) {
    var op = this.consume()
    var right = this.unary()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.factorial = function () {
  var left = this.symbol()
  if (this.peek('!')) {
    var op = this.consume()
    return new OperatorNode(op.value, [left])
  }
  return left
}

Parser.prototype.symbol = function () {
  var current = this.current()
  if (current.type === tokenType.SYMBOL) {
    var symbol = this.consume()
    var node = this.functionCall(symbol)
    return node
  }
  return this.string()
}

Parser.prototype.functionCall = function (symbolToken) {
  var name = symbolToken.value
  if (this.peek('(')) {
    this.consume()
    var params = []
    while (!this.peek(')') && !this.isEOF()) {
      params.push(this.assignment())
      if (this.peek(',')) {
        this.consume()
      }
    }
    this.expect(')')
    return new FunctionNode(name, params)
  }
  return new SymbolNode(name)
}

Parser.prototype.string = function () {
  if (this.current().type === tokenType.STRING) {
    return new ConstantNode(this.consume().value, 'string')
  }
  return this.array()
}

Parser.prototype.array = function () {
  if (this.peek('[')) {
    this.consume()
    var params = []
    while (!this.peek(']') && !this.isEOF()) {
      params.push(this.assignment())
      if (this.peek(',')) {
        this.consume()
      }
    }
    this.expect(']')
    return new ArrayNode(params)
  }
  return this.number()
}

Parser.prototype.number = function () {
  var token = this.current()
  if (token.type === tokenType.NUMBER) {
    return new ConstantNode(this.consume().value, 'number')
  }
  return this.parentheses()
}

Parser.prototype.parentheses = function () {
  var token = this.current()
  if (token.value === '(') {
    this.consume()
    var left = this.assignment()
    this.expect(')')
    return left
  }
  return this.end()
}

Parser.prototype.end = function () {
  var token = this.current()
  if (token.type !== tokenType.EOF) {
    throw Error('unexpected end of expression')
  }
}

module.exports = Parser

},{"./Lexer":37,"./node/ArrayNode":39,"./node/AssignmentNode":40,"./node/BlockNode":41,"./node/ConditionalNode":42,"./node/ConstantNode":43,"./node/FunctionNode":44,"./node/OperatorNode":46,"./node/SymbolNode":47,"./node/UnaryNode":48,"./token-type":50}],39:[function(require,module,exports){
var Node = require('./Node')

function ArrayNode (nodes) {
  this.nodes = nodes
}

ArrayNode.prototype = Object.create(Node.prototype)

ArrayNode.prototype.type = 'ArrayNode'

module.exports = ArrayNode

},{"./Node":45}],40:[function(require,module,exports){
var Node = require('./Node')

function AssignmentNode (name, expr) {
  this.name = name
  this.expr = expr
}

AssignmentNode.prototype = Object.create(Node.prototype)

AssignmentNode.prototype.type = 'AssignmentNode'

module.exports = AssignmentNode

},{"./Node":45}],41:[function(require,module,exports){
var Node = require('./Node')

function BlockNode (blocks) {
  this.blocks = blocks
}

BlockNode.prototype = Object.create(Node.prototype)

BlockNode.prototype.type = 'BlockNode'

module.exports = BlockNode

},{"./Node":45}],42:[function(require,module,exports){
var Node = require('./Node')

function ConditionalNode (predicate, truthy, falsy) {
  this.condition = predicate
  this.trueExpr = truthy
  this.falseExpr = falsy
}

ConditionalNode.prototype = Object.create(Node.prototype)

ConditionalNode.prototype.type = 'ConditionalNode'

module.exports = ConditionalNode

},{"./Node":45}],43:[function(require,module,exports){
var Node = require('./Node')

var SUPPORTED_TYPES = {
  number: true,
  string: true,
  'boolean': true,
  'undefined': true,
  'null': true
}

function ConstantNode (value, type) {
  if (!SUPPORTED_TYPES[type]) {
    throw Error('unsupported type \'' + type + '\'')
  }
  this.value = value
  this.valueType = type
}

ConstantNode.prototype = Object.create(Node.prototype)

ConstantNode.prototype.type = 'ConstantNode'

module.exports = ConstantNode

},{"./Node":45}],44:[function(require,module,exports){
var Node = require('./Node')

function FunctionNode (name, args) {
  this.name = name
  this.args = args
}

FunctionNode.prototype = Object.create(Node.prototype)

FunctionNode.prototype.type = 'FunctionNode'

module.exports = FunctionNode

},{"./Node":45}],45:[function(require,module,exports){
function Node () {

}

Node.prototype.type = 'Node'

module.exports = Node

},{}],46:[function(require,module,exports){
var Node = require('./Node')

function OperatorNode (op, args) {
  this.op = op
  this.args = args || []
}

OperatorNode.prototype = Object.create(Node.prototype)

OperatorNode.prototype.type = 'OperatorNode'

module.exports = OperatorNode

},{"./Node":45}],47:[function(require,module,exports){
var Node = require('./Node')

function SymbolNode (name) {
  this.name = name
}

SymbolNode.prototype = Object.create(Node.prototype)

SymbolNode.prototype.type = 'SymbolNode'

module.exports = SymbolNode

},{"./Node":45}],48:[function(require,module,exports){
var Node = require('./Node')

function UnaryNode (op, argument) {
  this.op = op
  this.argument = argument
}

UnaryNode.prototype = Object.create(Node.prototype)

UnaryNode.prototype.type = 'UnaryNode'

module.exports = UnaryNode

},{"./Node":45}],49:[function(require,module,exports){
module.exports = {
  ArrayNode: require('./ArrayNode'),
  AssignmentNode: require('./AssignmentNode'),
  BlockNode: require('./BlockNode'),
  ConditionalNode: require('./ConditionalNode'),
  ConstantNode: require('./ConstantNode'),
  FunctionNode: require('./FunctionNode'),
  Node: require('./Node'),
  OperatorNode: require('./OperatorNode'),
  SymbolNode: require('./SymbolNode'),
  UnaryNode: require('./UnaryNode')
}

},{"./ArrayNode":39,"./AssignmentNode":40,"./BlockNode":41,"./ConditionalNode":42,"./ConstantNode":43,"./FunctionNode":44,"./Node":45,"./OperatorNode":46,"./SymbolNode":47,"./UnaryNode":48}],50:[function(require,module,exports){
module.exports = {
  EOF: 0,
  DELIMITER: 1,
  NUMBER: 2,
  STRING: 3,
  SYMBOL: 4
}

},{}],51:[function(require,module,exports){
arguments[4][35][0].apply(exports,arguments)
},{"dup":35}],52:[function(require,module,exports){
/*
 * interval-arithmetic-eval
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */
'use strict'
module.exports = require('./lib/eval')

},{"./lib/eval":54}],53:[function(require,module,exports){
'use strict'
module.exports = function (ns) {
  // mod
  ns.mod = ns.fmod

  // relational
  ns.lessThan = ns.lt
  ns.lessEqualThan = ns.leq
  ns.greaterThan = ns.gt
  ns.greaterEqualThan = ns.geq

  ns.strictlyEqual = ns.equal
  ns.strictlyNotEqual = ns.notEqual

  ns.logicalAND = function (a, b) {
    return a && b
  }
  ns.logicalXOR = function (a, b) {
    return a ^ b
  }
  ns.logicalOR = function (a, b) {
    return a || b
  }
}

},{}],54:[function(require,module,exports){
/**
 * Created by mauricio on 5/12/15.
 */
'use strict'

var CodeGenerator = require('math-codegen')
var Interval = require('interval-arithmetic')
require('./adapter')(Interval)

function processScope (scope) {
  Object.keys(scope).forEach(function (k) {
    var value = scope[k]
    if (typeof value === 'number' || Array.isArray(value)) {
      scope[k] = Interval.factory(value)
    } else if (typeof value === 'object' && 'lo' in value && 'hi' in value) {
      scope[k] = Interval.factory(value.lo, value.hi)
    }
  })
}

module.exports = function (expression) {
  return new CodeGenerator()
    .setDefs({
      $$processScope: processScope
    })
    .parse(expression)
    .compile(Interval)
}

module.exports.policies = require('./policies')(Interval)
module.exports.Interval = Interval

},{"./adapter":53,"./policies":55,"interval-arithmetic":56,"math-codegen":69}],55:[function(require,module,exports){
/**
 * Created by mauricio on 5/12/15.
 */
'use strict'
module.exports = function (Interval) {
  return {
    disableRounding: function () {
      Interval.rmath.disable()
    },

    enableRounding: function () {
      Interval.rmath.enable()
    }
  }
}

},{}],56:[function(require,module,exports){
/*
 * interval-arithmetic
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */

'use strict';

function shallowExtend() {
  var dest = arguments[0];
  var p;
  for (var i = 1; i < arguments.length; i += 1) {
    for (p in arguments[i]) {
      if (arguments[i].hasOwnProperty(p)) {
        dest[p] = arguments[i][p];
      }
    }
  }
}

module.exports = require('./lib/interval');
module.exports.rmath = require('./lib/round-math');
module.exports.double = require('./lib/double');

shallowExtend(
  module.exports,
  require('./lib/constants'),
  require('./lib/operations/relational'),
  require('./lib/operations/arithmetic'),
  require('./lib/operations/algebra'),
  require('./lib/operations/trigonometric'),
  require('./lib/operations/misc'),
  require('./lib/operations/utils')
);

},{"./lib/constants":57,"./lib/double":58,"./lib/interval":59,"./lib/operations/algebra":60,"./lib/operations/arithmetic":61,"./lib/operations/misc":63,"./lib/operations/relational":64,"./lib/operations/trigonometric":65,"./lib/operations/utils":66,"./lib/round-math":68}],57:[function(require,module,exports){
/**
 * Created by mauricio on 5/11/15.
 */
'use strict';
var Interval = require('./interval');

var piLow = (3373259426.0 + 273688.0 / (1 << 21)) / (1 << 30);
var piHigh = (3373259426.0 + 273689.0 / (1 << 21)) / (1 << 30);

var constants = {};

constants.PI_LOW = piLow;
constants.PI_HIGH = piHigh;
constants.PI_HALF_LOW = piLow / 2;
constants.PI_HALF_HIGH = piHigh / 2;
constants.PI_TWICE_LOW = piLow * 2;
constants.PI_TWICE_HIGH = piHigh * 2;

// intervals
constants.PI = new Interval(piLow, piHigh);
constants.PI_HALF = new Interval(constants.PI_HALF_LOW, constants.PI_HALF_HIGH);
constants.PI_TWICE = new Interval(constants.PI_TWICE_LOW, constants.PI_TWICE_HIGH);
constants.ZERO = new Interval(0, 0);
constants.ONE = new Interval(1, 1);
constants.WHOLE = new Interval().setWhole();
constants.EMPTY = new Interval().setEmpty();

module.exports = constants;

},{"./interval":59}],58:[function(require,module,exports){
/**
 * Created by mauricio on 5/5/15.
 */
'use strict';

// iee754 double has 64 bits
// its binary representation explained in http://bartaz.github.io/ieee754-visualization/
// can be analyzed with the help of ArrayBuffer, since it has no mechanism to update its
// data a DataView is needed (the number is divided in 8 chunks of data each holding 8
// bits)
var buffer = new ArrayBuffer(8);
var dv = new DataView(buffer);
var array8 = new Uint8Array(buffer);

// from https://github.com/bartaz/ieee754-visualization/blob/master/src/ieee754.js
// float64ToOctets( 123.456 ) -> [ 64, 94, 221, 47, 26, 159, 190, 119 ]
function float64ToOctets(number) {
  dv.setFloat64(0, number, false);
  return [].slice.call( new Uint8Array(buffer) );
}

// from https://github.com/bartaz/ieee754-visualization/blob/master/src/ieee754.js
// octetsToFloat64( [ 64, 94, 221, 47, 26, 159, 190, 119 ] ) -> 123.456
function octetsToFloat64(octets) {
  array8.set(octets);
  return dv.getFloat64(0, false);
}

function add(bytes, n) {
  for (var i = 7; i >= 0; i -= 1) {
    bytes[i] += n;
    if (bytes[i] === 256) {
      n = 1;
      bytes[i] = 0;
    } else if (bytes[i] === -1) {
      n = -1;
      bytes[i] = 255;
    } else {
      n = 0;
    }
  }
}

function solve(a, b) {
  if (a === Number.POSITIVE_INFINITY || a === Number.NEGATIVE_INFINITY || isNaN(a)) {
    return a;
  }
  var bytes = float64ToOctets(a);
  add(bytes, b);
  return octetsToFloat64(bytes);
}

exports.doubleToOctetArray = float64ToOctets;

exports.ieee754NextDouble = function (n) {
  return solve(n, 1);
};

exports.ieee754PrevDouble = function (n) {
  return solve(n, -1);
};

},{}],59:[function(require,module,exports){
/**
 * Created by mauricio on 4/27/15.
 */
'use strict';
var utils = require('./operations/utils');
var rmath = require('./round-math');

function Interval(lo, hi) {


  switch (arguments.length) {
    case 1:
      if (typeof lo !== 'number') {
        throw new TypeError('lo must be a number');
      }

      this.set(lo, lo);
      if (isNaN(lo)) {
        this.setEmpty();
      }
      break;
    case 2:
      if (typeof lo !== 'number' || typeof hi !== 'number') {
        throw new TypeError('lo,hi must be numbers');
      }

      this.set(lo, hi);
      if (isNaN(lo) || isNaN(hi) || lo > hi) {
        this.setEmpty();
      }
      break;
    default:
      this.lo = 0;
      this.hi = 0;
      break;
  }
}

Interval.factory = function (a, b) {
  function assert(a, message) {
    /* istanbul ignore next */
    if (!a) {
      throw new Error(message || 'assertion failed');
    }
  }

  function singleton(x) {
    if (typeof x === 'object') {
      assert(typeof x.lo === 'number' && typeof x.hi === 'number', 'param must be an Interval');
      assert(utils.singleton(x), 'param needs to be a singleton');
    }
  }

  function getNumber(x) {
    if (typeof x === 'object') {
      singleton(x);
      return x.lo;
    }
    return x;
  }

  assert(arguments.length <= 2);

  var lo, hi;
  if (arguments.length === 2) {
    // handles:
    // - new Interval( 1, 2 )
    // - new Interval( new Interval(1, 1), new Interval(2, 2) )
    lo = getNumber(a);
    hi = getNumber(b);
  } else if (arguments.length === 1) {
    if (Array.isArray(a)) {
      // handles
      // - new Interval( [1, 2] )
      lo = a[0];
      hi = a[1];
    } else {
      lo = hi = getNumber(a);
    }
  } else {
    return new Interval();
  }
  return new Interval(lo, hi);
};

Interval.prototype.singleton = function (v) {
  return this.set(v, v);
};

Interval.prototype.bounded = function (lo, hi) {
  return this.set(rmath.prev(lo), rmath.next(hi));
};

Interval.prototype.boundedSingleton = function (v) {
  return this.bounded(v, v);
};

Interval.prototype.set = function (lo, hi) {
  this.lo = lo;
  this.hi = hi;
  return this;
};

Interval.prototype.assign = function (lo, hi) {
  if (isNaN(lo) || isNaN(hi) || lo > hi) {
    return this.setEmpty();
  }
  return this.set(lo, hi);
};

Interval.prototype.setEmpty = function () {
  return this.set(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY);
};

Interval.prototype.setWhole = function () {
  return this.set(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
};

Interval.prototype.toArray = function () {
  return [this.lo, this.hi];
};

// interval/interval comparisons
//Interval.prototype.lessThan = function (r) {
//  if (!this.isEmpty()) {
//    if (this.hi < r.lo) { return true; }
//    if (this.lo >= r.hi) { return false; }
//  }
//  throw Error('comparison error');
//};
//
//Interval.prototype.greaterThan = function (r) {
//  if (!this.isEmpty()) {
//    if (this.lo > r.hi) { return true; }
//    if (this.hi <= r.lo) { return false; }
//  }
//  throw Error('comparison error');
//};
//
//Interval.prototype.lessEqualThan = function (r) {
//  if (!this.isEmpty()) {
//    if (this.hi <= r.lo) { return true; }
//    if (this.lo > r.hi) { return false; }
//  }
//  throw Error('comparison error');
//};
//
//Interval.prototype.greaterEqualThan = function (r) {
//  if (!this.isEmpty()) {
//    if (this.lo >= r.hi) { return true; }
//    if (this.hi < r.lo) { return false; }
//  }
//  throw Error('comparison error');
//};

module.exports = Interval;

},{"./operations/utils":66,"./round-math":68}],60:[function(require,module,exports){
/**
 * Created by mauricio on 5/11/15.
 */
'use strict';
var Interval = require('../interval');
var rmath = require('../round-math');
var utils = require('./utils');
var arithmetic = require('./arithmetic');
var constants = require('../constants');

var algebra = {};

/**
 * Computes x mod y
 * @param x
 * @param y
 */
algebra.fmod = function (x, y) {
  if (utils.empty(x) || utils.empty(y)) {
    return constants.EMPTY;
  }
  var yb = x.lo < 0 ? y.lo : y.hi;
  var n = rmath.intLo(rmath.divLo(x.lo, yb));
  // x mod y = x - n * y
  return arithmetic.sub(x, arithmetic.mul(y, new Interval(n, n)));
};

/**
 * Computes 1 / x
 * @param {Interval} x
 * @returns {Interval}
 */
algebra.multiplicativeInverse = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }
  if (utils.zeroIn(x)) {
    if (x.lo !== 0) {
      if (x.hi !== 0) {
        return constants.WHOLE;
      } else {
        return new Interval(
          Number.NEGATIVE_INFINITY,
          rmath.divHi(1, x.lo)
        );
      }
    } else {
      if (x.hi !== 0) {
        return new Interval(
          rmath.divLo(1, x.hi),
          Number.POSITIVE_INFINITY
        );
      } else {
        return constants.EMPTY;
      }
    }
  } else {
    return new Interval(
      rmath.divLo(1, x.hi),
      rmath.divHi(1, x.lo)
    );
  }
};

/**
 * Computes x^power
 * @param {Interval} x
 * @param {number|Interval} power An integer power or a singleton interval
 * @returns {Interval}
 */
algebra.pow = function (x, power) {
  if (utils.empty(x)) {
    return constants.EMPTY;
  }
  if (typeof power === 'object') {
    if (!utils.singleton(power)) {
      return constants.EMPTY;
    }
    power = power.lo;
  }

  if (power === 0) {
    if (x.lo === 0 && x.hi === 0) {
      return constants.EMPTY;
    } else {
      return constants.ONE;
    }
  } else if (power < 0) {
    // compute 1 / x^-power if power is negative
    return algebra.multiplicativeInverse(algebra.pow(x, -power));
  }

  // power > 0
  if (x.hi < 0) {
    // [negative, negative]
    // assume that power is even so the operation will yield a positive interval
    // if not then just switch the sign and order of the interval bounds
    var yl = rmath.powLo(-x.hi, power);
    var yh = rmath.powHi(-x.lo, power);
    if (power & 1) {
      return new Interval(-yh, -yl);
    } else {
      return new Interval(yl, yh);
    }
  } else if (x.lo < 0) {
    // [negative, positive]
    if (power & 1) {
      return new Interval(
        -rmath.powLo(-x.lo, power),
        rmath.powHi(x.hi, power)
      );
    } else {
      // even power means that any negative number will be zero (min value = 0)
      // and the max value will be the max of x.lo^power, x.hi^power
      return new Interval(
        0,
        rmath.powHi(Math.max(-x.lo, x.hi), power)
      );
    }
  } else {
    // [positive, positive]
    return new Interval(
      rmath.powLo(x.lo, power),
      rmath.powHi(x.hi, power)
    );
  }
};

/**
 * Computes sqrt(x)
 * @param {Interval} x
 * @returns {Interval}
 */
algebra.sqrt = function (x) {
  if (utils.empty(x) || x.hi < 0) {
    return constants.EMPTY;
  }
  // lower bound min value can't be negative
  var t = x.lo <= 0 ? 0 : rmath.sqrtLo(x.lo);
  return new Interval(t, rmath.sqrtHi(x.hi));
};

// TODO: root finding

module.exports = algebra;

},{"../constants":57,"../interval":59,"../round-math":68,"./arithmetic":61,"./utils":66}],61:[function(require,module,exports){
/**
 * Created by mauricio on 5/10/15.
 */
'use strict';
var Interval = require('../interval');
var rmath = require('../round-math');
var utils = require('./utils');
var constants = require('../constants');
var division = require('./division');

var arithmetic = {};

// BINARY
arithmetic.add = function (a, b) {
  return new Interval(
    rmath.addLo(a.lo, b.lo),
    rmath.addHi(a.hi, b.hi)
  );
};

arithmetic.sub = function (a, b) {
  return new Interval(
    rmath.subLo(a.lo, b.hi),
    rmath.subHi(a.hi, b.lo)
  );
};

arithmetic.mul = function (a, b) {
  if (utils.empty(a) || utils.empty(b)) {
    return constants.EMPTY;
  }
  var al = a.lo;
  var ah = a.hi;
  var bl = b.lo;
  var bh = b.hi;
  var out = new Interval();
  if (al < 0) {
    if (ah > 0) {
      if (bl < 0) {
        if (bh > 0) {
          // mixed * mixed
          out.lo = Math.min( rmath.mulLo(al, bh), rmath.mulLo(ah, bl) );
          out.hi = Math.max( rmath.mulHi(al, bl), rmath.mulHi(ah, bh) );
        } else {
          // mixed * negative
          out.lo = rmath.mulLo(ah, bl);
          out.hi = rmath.mulHi(al, bl);
        }
      } else {
        if (bh > 0) {
          // mixed * positive
          out.lo = rmath.mulLo(al, bh);
          out.hi = rmath.mulHi(ah, bh);
        } else {
          // mixed * zero
          out.lo = 0;
          out.hi = 0;
        }
      }
    } else {
      if (bl < 0) {
        if (bh > 0) {
          // negative * mixed
          out.lo = rmath.mulLo(al, bh);
          out.hi = rmath.mulHi(al, bl);
        } else {
          // negative * negative
          out.lo = rmath.mulLo(ah, bh);
          out.hi = rmath.mulHi(al, bl);
        }
      } else {
        if (bh > 0) {
          // negative * positive
          out.lo = rmath.mulLo(al, bh);
          out.hi = rmath.mulHi(ah, bl);
        } else {
          // negative * zero
          out.lo = 0;
          out.hi = 0;
        }
      }
    }
  } else {
    if (ah > 0) {
      if (bl < 0) {
        if (bh > 0) {
          // positive * mixed
          out.lo = rmath.mulLo(ah, bl);
          out.hi = rmath.mulHi(ah, bh);
        } else {
          // positive * negative
          out.lo = rmath.mulLo(ah, bl);
          out.hi = rmath.mulHi(al, bh);
        }
      } else {
        if (bh > 0) {
          // positive * positive
          out.lo = rmath.mulLo(al, bl);
          out.hi = rmath.mulHi(ah, bh);
        } else {
          // positive * zero
          out.lo = 0;
          out.hi = 0;
        }
      }
    } else {
      // zero * any other value
      out.lo = 0;
      out.hi = 0;
    }
  }
  return out;
};

arithmetic.div = function (a, b) {
  if (utils.empty(a) || utils.empty(b)) {
    return constants.EMPTY;
  }
  if (utils.zeroIn(b)) {
    if (b.lo !== 0) {
      if (b.hi !== 0) {
        return division.zero(a);
      } else {
        return division.negative(a, b.lo);
      }
    } else {
      if (b.hi !== 0) {
        return division.positive(a, b.hi);
      } else {
        return constants.EMPTY;
      }
    }
  } else {
    return division.nonZero(a, b);
  }
};

// UNARY
arithmetic.positive = function (a) {
  return new Interval(a.lo, a.hi);
};

arithmetic.negative = function (a) {
  return new Interval(-a.hi, -a.lo);
};

module.exports = arithmetic;

},{"../constants":57,"../interval":59,"../round-math":68,"./division":62,"./utils":66}],62:[function(require,module,exports){
/**
 * Created by mauricio on 5/10/15.
 */
'use strict';
var Interval = require('../interval');
var rmath = require('../round-math');
var utils = require('./utils');
var constants = require('../constants');

var division = {
  /**
   * Division between intervals when `y` doesn't contain zero
   * @param {Interval} x
   * @param {Interval} y
   * @returns {Interval}
   */
  nonZero: function (x, y) {
    var xl = x.lo;
    var xh = x.hi;
    var yl = y.lo;
    var yh = y.hi;
    var out = new Interval();
    if (xh < 0) {
      if (yh < 0) {
        out.lo = rmath.divLo(xh, yl);
        out.hi = rmath.divHi(xl, yh);
      } else {
        out.lo = rmath.divLo(xl, yl);
        out.hi = rmath.divHi(xh, yh);
      }
    } else if (xl < 0) {
      if (yh < 0) {
        out.lo = rmath.divLo(xh, yh);
        out.hi = rmath.divHi(xl, yh);
      } else {
        out.lo = rmath.divLo(xl, yl);
        out.hi = rmath.divHi(xh, yl);
      }
    } else {
      if (yh < 0) {
        out.lo = rmath.divLo(xh, yh);
        out.hi = rmath.divHi(xl, yl);
      } else {
        out.lo = rmath.divLo(xl, yh);
        out.hi = rmath.divHi(xh, yl);
      }
    }
    return out;
  },

  /**
   * Division between an interval and a positive constant
   * @param {Interval} x
   * @param {number} v
   * @returns {Interval}
   */
  positive: function (x, v) {
    if (x.lo === 0 && x.hi === 0) {
      return x;
    }

    if (utils.zeroIn(x)) {
      // mixed considering zero in both ends
      return constants.WHOLE;
    }

    if (x.hi < 0) {
      // negative / v
      return new Interval(
        Number.NEGATIVE_INFINITY,
        rmath.divHi(x.hi, v)
      );
    } else {
      // positive / v
      return new Interval(
        rmath.divLo(x.lo, v),
        Number.POSITIVE_INFINITY
      );
    }
  },

  /**
   * Division between an interval and a negative constant
   * @param {Interval} x
   * @param {number} v
   * @returns {Interval}
   */
  negative: function (x, v) {
    if (x.lo === 0 && x.hi === 0) {
      return x;
    }

    if (utils.zeroIn(x)) {
      // mixed considering zero in both ends
      return constants.WHOLE;
    }

    if (x.hi < 0) {
      // negative / v
      return new Interval(
        rmath.divLo(x.hi, v),
        Number.POSITIVE_INFINITY
      );
    } else {
      // positive / v
      return new Interval(
        Number.NEGATIVE_INFINITY,
        rmath.divHi(x.lo, v)
      );
    }
  },

  /**
   * Division between an interval and zero
   * @param {Interval} x
   * @returns {Interval}
   */
  zero: function (x) {
    if (x.lo === 0 && x.hi === 0) {
      return x;
    }
    return constants.WHOLE;
  }
};

module.exports = division;

},{"../constants":57,"../interval":59,"../round-math":68,"./utils":66}],63:[function(require,module,exports){
/**
 * Created by mauricio on 5/11/15.
 */
'use strict';
var constants = require('../constants');
var Interval = require('../interval');
var rmath = require('../round-math');
var utils = require('./utils');
var arithmetic = require('./arithmetic');

var misc = {};

misc.exp = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }
  return new Interval(
    rmath.expLo(x.lo),
    rmath.expHi(x.hi)
  );
};

misc.log = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }
  var l = x.lo <= 0 ? Number.NEGATIVE_INFINITY : rmath.logLo(x.lo);
  return new Interval(l, rmath.logHi(x.hi));
};

misc.LOG_EXP_10 = misc.log( new Interval(10, 10) );

misc.log10 = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }
  return arithmetic.div(misc.log(x), misc.LOG_EXP_10);
};

misc.LOG_EXP_2 = misc.log( new Interval(2, 2) );

misc.log2 = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }
  return arithmetic.div(misc.log(x), misc.LOG_EXP_2);
};

// elementary
misc.hull = function (x, y) {
  var badX = utils.empty(x);
  var badY = utils.empty(y);
  if (badX) {
    if (badY) { return constants.EMPTY; }
    else { return y; }
  } else {
    if (badY) { return x; }
    else {
      return new Interval(
        Math.min(x.lo, y.lo),
        Math.max(x.hi, y.hi)
      );
    }
  }
};

misc.intersect = function (x, y) {
  if (utils.empty(x) || utils.empty(y)) { return constants.EMPTY; }
  var lo = Math.max(x.lo, y.lo);
  var hi = Math.min(x.hi, y.hi);
  if (lo <= hi) {
    return new Interval(lo, hi);
  }
  return constants.EMPTY;
};

misc.abs = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }
  if (x.lo >= 0) { return x; }
  if (x.hi <= 0) { return arithmetic.negative(x); }
  return new Interval(0, Math.max(-x.lo, x.hi));
};

misc.max = function (x, y) {
  if (utils.empty(x)) { return constants.EMPTY; }
  return new Interval(
    Math.max(x.lo, y.lo),
    Math.max(x.hi, y.hi)
  );
};

misc.min = function (x, y) {
  if (utils.empty(x)) { return constants.EMPTY; }
  return new Interval(
    Math.min(x.lo, y.lo),
    Math.min(x.hi, y.hi)
  );
};

misc.clone = function (x) {
  // no bound checking
  return new Interval().set(x.lo, x.hi);
};

module.exports = misc;

},{"../constants":57,"../interval":59,"../round-math":68,"./arithmetic":61,"./utils":66}],64:[function(require,module,exports){
/**
 * Created by mauricio on 5/14/15.
 */
'use strict';
var utils = require('./utils');

// boost/numeric/interval_lib/compare/certain
// certain package in boost
var relational = {};

/**
 * Checks if the intervals `x`, `y` are equal
 * @param {Interval} x
 * @param {Interval} y
 * @returns {boolean}
 */
relational.equal = function (x, y) {
  if (utils.empty(x)) {
    return utils.empty(y);
  }
  return !utils.empty(y) && x.lo === y.lo && x.hi === y.hi;
};

// <debug>
relational.almostEqual = function (x, y) {
  var EPS = 1e-7;
  function assert(a, message) {
    /* istanbul ignore next */
    if (!a) {
      throw new Error(message || 'assertion failed');
    }
  }

  function assertEps(a, b) {
    assert( Math.abs(a - b) < EPS );
  }

  x = Array.isArray(x) ? x : x.toArray();
  y = Array.isArray(y) ? y : y.toArray();
  assertEps(x[0], y[0]);
  assertEps(x[1], y[1]);
  assert(x[0] <= x[1], 'interval must not be empty');
};
// </debug>

/**
 * Checks if the intervals `x`, `y` are not equal
 * @param {Interval} x
 * @param {Interval} y
 * @returns {boolean}
 */
relational.notEqual = function (x, y) {
  if (utils.empty(x)) {
    return !utils.empty(y);
  }
  return utils.empty(y) || x.hi < y.lo || x.lo > y.hi;
};

/**
 * Checks if the interval x is less than y
 * @param {Interval} x
 * @param {Interval} y
 * @return {boolean}
 */
relational.lt = function (x, y) {
  if (utils.empty(x) || utils.empty(y)) {
    return false;
  }
  return x.hi < y.lo;
};

/**
 * Checks if the interval x is greater than y
 * @param {Interval} x
 * @param {Interval} y
 * @return {boolean}
 */
relational.gt = function (x, y) {
  if (utils.empty(x) || utils.empty(y)) {
    return false;
  }
  return x.lo > y.hi;
};

/**
 * Checks if the interval x is less or equal than y
 * @param {Interval} x
 * @param {Interval} y
 * @return {boolean}
 */
relational.leq = function (x, y) {
  if (utils.empty(x) || utils.empty(y)) {
    return false;
  }
  return x.hi <= y.lo;
};

/**
 * Checks if the interval x is greater or equal than y
 * @param {Interval} x
 * @param {Interval} y
 * @return {boolean}
 */
relational.geq = function (x, y) {
  if (utils.empty(x) || utils.empty(y)) {
    return false;
  }
  return x.lo >= y.hi;
};

module.exports = relational;

},{"./utils":66}],65:[function(require,module,exports){
/**
 * Created by mauricio on 5/10/15.
 */
'use strict';
var constants = require('../constants');
var Interval = require('../interval');
var rmath = require('../round-math');
var utils = require('./utils');
var algebra = require('./algebra');
var arithmetic = require('./arithmetic');

var trigonometric = {};

trigonometric.cos = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }

  // cos works with positive intervals only
  if (x.lo < 0) {
    var mult = Math.ceil(Math.abs(x.lo) / Math.PI);
    x.lo += 2 * Math.PI * mult;
    x.hi += 2 * Math.PI * mult;
  }

  var pi2 = constants.PI_TWICE;
  var t = algebra.fmod(x, pi2);
  if (utils.width(t) >= pi2.lo) {
    return new Interval(-1, 1);
  }
  if (t.lo >= constants.PI_HIGH) {
    var cos = trigonometric.cos(
      arithmetic.sub(t, constants.PI)
    );
    return arithmetic.negative(cos);
  }

  var lo = t.lo;
  var hi = t.hi;
  if (hi <= constants.PI_LOW) {
    var rlo = rmath.cosLo(hi);
    var rhi = rmath.cosHi(lo);
    return new Interval(rlo, rhi);
  } else if (hi <= pi2.lo) {
    return new Interval(
      -1,
      rmath.cosHi(Math.min(rmath.subLo(pi2.lo, hi), lo))
    );
  } else {
    return new Interval(-1, 1);
  }
};

trigonometric.sin = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }
  return trigonometric.cos(
    arithmetic.sub(x, constants.PI_HALF)
  );
};

trigonometric.tan = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }

  //// tan works with positive intervals only
  if (x.lo < 0) {
    var mult = Math.ceil(Math.abs(x.lo) / Math.PI);
    x.lo += 2 * Math.PI * mult;
    x.hi += 2 * Math.PI * mult;
  }

  var pi = constants.PI;
  var t = algebra.fmod(x, pi);
  if (t.lo >= constants.PI_HALF_LOW) {
    t = arithmetic.sub(t, pi);
  }
  if (t.lo <= -constants.PI_HALF_LOW || t.hi >= constants.PI_HALF_LOW) {
    return constants.WHOLE;
  }
  return new Interval(
    rmath.tanLo(t.lo),
    rmath.tanHi(t.hi)
  );
};

trigonometric.asin = function (x) {
  if (utils.empty(x) || x.hi < -1 || x.lo > 1) {
    return constants.EMPTY;
  }
  var lo = x.lo <= -1 ? -constants.PI_HALF_HIGH : rmath.asinLo(x.lo);
  var hi = x.hi >= 1 ? constants.PI_HALF_HIGH : rmath.asinHi(x.hi);
  return new Interval(lo, hi);
};

trigonometric.acos = function (x) {
  if (utils.empty(x) || x.hi < -1 || x.lo > 1) {
    return constants.EMPTY;
  }
  var lo = x.hi >= 1 ? 0 : rmath.acosLo(x.hi);
  var hi = x.lo <= -1 ? constants.PI_HIGH : rmath.acosHi(x.lo);
  return new Interval(lo, hi);
};

trigonometric.atan = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }
  return new Interval(rmath.atanLo(x.lo), rmath.atanHi(x.hi));
};

trigonometric.sinh = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }
  return new Interval(rmath.sinhLo(x.lo), rmath.sinhHi(x.hi));
};

trigonometric.cosh = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }
  if (x.hi < 0) {
    return new Interval(
      rmath.coshLo(x.hi),
      rmath.coshHi(x.lo)
    );
  } else if (x.lo >= 0) {
    return new Interval(
      rmath.coshLo(x.lo),
      rmath.coshHi(x.hi)
    );
  } else {
    return new Interval(
      1,
      rmath.coshHi(-x.lo > x.hi ? x.lo : x.hi)
    );
  }
};

trigonometric.tanh = function (x) {
  if (utils.empty(x)) { return constants.EMPTY; }
  return new Interval(rmath.tanhLo(x.lo), rmath.tanhHi(x.hi));
};

// TODO: inverse hyperbolic functions (asinh, acosh, atanh)

module.exports = trigonometric;

},{"../constants":57,"../interval":59,"../round-math":68,"./algebra":60,"./arithmetic":61,"./utils":66}],66:[function(require,module,exports){
/**
 * Created by mauricio on 5/10/15.
 */
'use strict';
var rmath = require('../round-math');

var utils = {};

/**
 * Checks if an interval is empty, it's empty whenever
 * the `lo` property has a higher value than the `hi` property
 * @param {Interval} a
 * @returns {boolean}
 */
utils.empty = function (a) {
  return a.lo > a.hi;
};

/**
 * Checks if an interval is a whole interval, that is it covers all
 * the real numbers
 * @param {Interval} a
 * @returns {boolean}
 */
utils.whole = function (a) {
  return a.lo === -Infinity && a.hi === Infinity;
};

/**
 * True if zero is included in the interval `a`
 * @param {Interval} a
 * @returns {boolean}
 */
utils.zeroIn = function (a) {
  return utils.in(a, 0);
};

/**
 * True if `v` is included in the interval `a`
 * @param {Interval} a
 * @param {number} v
 * @returns {boolean}
 */
utils.in = function (a, v) {
  if (utils.empty(a)) { return false; }
  return a.lo <= v && v <= a.hi;
};

/**
 * Checks if `a` is a subset of `b`
 * @param {Interval} a
 * @param {Interval} b
 * @returns {boolean}
 */
utils.subset = function (a, b) {
  if (utils.empty(a)) { return true; }
  return !utils.empty(b) && b.lo <= a.lo && a.hi <= b.hi;
};

/**
 * Checks if the intervals `a`, `b` overlap
 * @param {Interval} a
 * @param {Interval} b
 * @returns {boolean}
 */
utils.overlap = function (a, b) {
  if (utils.empty(a) || utils.empty(b)) { return false; }
  return (a.lo <= b.lo && b.lo <= a.hi) ||
    (b.lo <= a.lo && a.lo <= b.hi);
};

/**
 * Checks if the intervals `x` is a singleton (an interval representing a single value)
 * @param {Interval} x
 * @returns {boolean}
 */
utils.singleton = function (x) {
  return !utils.empty(x) && x.lo === x.hi;
};

/**
 * Computes the distance of the bounds of an interval
 * @param {Interval} x
 * @returns {number}
 */
utils.width = function (x) {
  if (utils.empty(x)) { return 0; }
  return rmath.subHi(x.hi, x.lo);
};

module.exports = utils;

},{"../round-math":68}],67:[function(require,module,exports){
/**
 * Created by mauricio on 5/11/15.
 */
'use strict';

// hyperbolic functions only present on es6
Math.sinh = Math.sinh || function (x) {
  var y = Math.exp(x);
  return (y - 1 / y) / 2;
};

Math.cosh = Math.cosh || function (x) {
  var y = Math.exp(x);
  return (y + 1 / y) / 2;
};

Math.tanh = Math.tanh || function (x) {
  if (x === Number.POSITIVE_INFINITY) {
    return 1;
  } else if (x === Number.NEGATIVE_INFINITY) {
    return -1;
  } else {
    var y = Math.exp(2 * x);
    return (y - 1) / (y + 1);
  }
};

},{}],68:[function(require,module,exports){
/**
 * Created by mauricio on 4/27/15.
 */
'use strict';
require('./polyfill');
var double = require('./double');

var round = {};
var MIN_VALUE = double.ieee754NextDouble(0);

round.POSITIVE_ZERO = +0;
round.NEGATIVE_ZERO = -0;

var oldNext;
var next = oldNext = round.next = function (v) {
  if (v === 0) {
    return MIN_VALUE;
  }
  if (Math.abs(v) < Number.POSITIVE_INFINITY) {
    if (v > 0) {
      return double.ieee754NextDouble(v);
    } else {
      // v can't be zero at this point, it's < 0
      return double.ieee754PrevDouble(v);
    }
  }
  return v;
};

var oldPrev;
var prev = oldPrev = round.prev = function (v) {
  return -next(-v);
};

round.addLo = function (x, y) { return prev(x + y); };
round.addHi = function (x, y) { return next(x + y); };

round.subLo = function (x, y) { return prev(x - y); };
round.subHi = function (x, y) { return next(x - y); };

round.mulLo = function (x, y) { return prev(x * y); };
round.mulHi = function (x, y) { return next(x * y); };

round.divLo = function (x, y) { return prev(x / y); };
round.divHi = function (x, y) { return next(x / y); };

function toInteger(x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
}

round.intLo = function (x) { return toInteger(prev(x)); };
round.intHi = function (x) { return toInteger(next(x)); };

round.logLo = function (x) { return prev(Math.log(x)); };
round.logHi = function (x) { return next(Math.log(x)); };

round.expLo = function (x) { return prev(Math.exp(x)); };
round.expHi = function (x) { return next(Math.exp(x)); };

round.sinLo = function (x) { return prev(Math.sin(x)); };
round.sinHi = function (x) { return next(Math.sin(x)); };

round.cosLo = function (x) { return prev(Math.cos(x)); };
round.cosHi = function (x) { return next(Math.cos(x)); };

round.tanLo = function (x) { return prev(Math.tan(x)); };
round.tanHi = function (x) { return next(Math.tan(x)); };

round.asinLo = function (x) { return prev(Math.asin(x)); };
round.asinHi = function (x) { return next(Math.asin(x)); };

round.acosLo = function (x) { return prev(Math.acos(x)); };
round.acosHi = function (x) { return next(Math.acos(x)); };

round.atanLo = function (x) { return prev(Math.atan(x)); };
round.atanHi = function (x) { return next(Math.atan(x)); };

// polyfill required for hyperbolic functions
round.sinhLo = function (x) { return prev(Math.sinh(x)); };
round.sinhHi = function (x) { return next(Math.sinh(x)); };

round.coshLo = function (x) { return prev(Math.cosh(x)); };
round.coshHi = function (x) { return next(Math.cosh(x)); };

round.tanhLo = function (x) { return prev(Math.tanh(x)); };
round.tanhHi = function (x) { return next(Math.tanh(x)); };

/**
 * ln(power) exponentiation of x
 * @param {number} x
 * @param {number} power
 * @returns {number}
 */
round.powLo = function (x, power) {
  var y = (power & 1) ? x : 1;
  power >>= 1;
  while (power > 0) {
    x = round.mulLo(x, x);
    if (power & 1) {
      y = round.mulLo(x, y);
    }
    power >>= 1;
  }
  return y;
};

/**
 * ln(power) exponentiation of x
 * @param {number} x
 * @param {number} power
 * @returns {number}
 */
round.powHi = function (x, power) {
  var y = (power & 1) ? x : 1;
  power >>= 1;
  while (power > 0) {
    x = round.mulHi(x, x);
    if (power & 1) {
      y = round.mulHi(x, y);
    }
    power >>= 1;
  }
  return y;
};

round.sqrtLo = function (x) { return prev(Math.sqrt(x)); };
round.sqrtHi = function (x) { return next(Math.sqrt(x)); };

round.disable = function () {
  next = prev = round.next = round.prev = function (v) {
    return v;
  };
};

round.enable = function () {
  prev = round.prev = oldPrev;
  next = round.next = oldNext;
};

module.exports = round;

},{"./double":58,"./polyfill":67}],69:[function(require,module,exports){
arguments[4][22][0].apply(exports,arguments)
},{"./lib/CodeGenerator":70,"dup":22}],70:[function(require,module,exports){
arguments[4][23][0].apply(exports,arguments)
},{"./Interpreter":71,"dup":23,"extend":82,"mr-parser":83}],71:[function(require,module,exports){
arguments[4][24][0].apply(exports,arguments)
},{"./node/ArrayNode":74,"./node/AssignmentNode":75,"./node/ConditionalNode":76,"./node/ConstantNode":77,"./node/FunctionNode":78,"./node/OperatorNode":79,"./node/SymbolNode":80,"./node/UnaryNode":81,"dup":24,"extend":82}],72:[function(require,module,exports){
arguments[4][25][0].apply(exports,arguments)
},{"dup":25}],73:[function(require,module,exports){
arguments[4][26][0].apply(exports,arguments)
},{"dup":26}],74:[function(require,module,exports){
arguments[4][27][0].apply(exports,arguments)
},{"dup":27}],75:[function(require,module,exports){
arguments[4][28][0].apply(exports,arguments)
},{"dup":28}],76:[function(require,module,exports){
arguments[4][29][0].apply(exports,arguments)
},{"dup":29}],77:[function(require,module,exports){
arguments[4][30][0].apply(exports,arguments)
},{"dup":30}],78:[function(require,module,exports){
arguments[4][31][0].apply(exports,arguments)
},{"dup":31,"mr-parser":83}],79:[function(require,module,exports){
arguments[4][32][0].apply(exports,arguments)
},{"../misc/Operators":72,"dup":32}],80:[function(require,module,exports){
arguments[4][33][0].apply(exports,arguments)
},{"dup":33}],81:[function(require,module,exports){
arguments[4][34][0].apply(exports,arguments)
},{"../misc/UnaryOperators":73,"dup":34}],82:[function(require,module,exports){
arguments[4][35][0].apply(exports,arguments)
},{"dup":35}],83:[function(require,module,exports){
arguments[4][36][0].apply(exports,arguments)
},{"./lib/Lexer":84,"./lib/Parser":85,"./lib/node/":96,"dup":36}],84:[function(require,module,exports){
arguments[4][37][0].apply(exports,arguments)
},{"./token-type":97,"dup":37}],85:[function(require,module,exports){
arguments[4][38][0].apply(exports,arguments)
},{"./Lexer":84,"./node/ArrayNode":86,"./node/AssignmentNode":87,"./node/BlockNode":88,"./node/ConditionalNode":89,"./node/ConstantNode":90,"./node/FunctionNode":91,"./node/OperatorNode":93,"./node/SymbolNode":94,"./node/UnaryNode":95,"./token-type":97,"dup":38}],86:[function(require,module,exports){
arguments[4][39][0].apply(exports,arguments)
},{"./Node":92,"dup":39}],87:[function(require,module,exports){
arguments[4][40][0].apply(exports,arguments)
},{"./Node":92,"dup":40}],88:[function(require,module,exports){
arguments[4][41][0].apply(exports,arguments)
},{"./Node":92,"dup":41}],89:[function(require,module,exports){
arguments[4][42][0].apply(exports,arguments)
},{"./Node":92,"dup":42}],90:[function(require,module,exports){
arguments[4][43][0].apply(exports,arguments)
},{"./Node":92,"dup":43}],91:[function(require,module,exports){
arguments[4][44][0].apply(exports,arguments)
},{"./Node":92,"dup":44}],92:[function(require,module,exports){
arguments[4][45][0].apply(exports,arguments)
},{"dup":45}],93:[function(require,module,exports){
arguments[4][46][0].apply(exports,arguments)
},{"./Node":92,"dup":46}],94:[function(require,module,exports){
arguments[4][47][0].apply(exports,arguments)
},{"./Node":92,"dup":47}],95:[function(require,module,exports){
arguments[4][48][0].apply(exports,arguments)
},{"./Node":92,"dup":48}],96:[function(require,module,exports){
arguments[4][49][0].apply(exports,arguments)
},{"./ArrayNode":86,"./AssignmentNode":87,"./BlockNode":88,"./ConditionalNode":89,"./ConstantNode":90,"./FunctionNode":91,"./Node":92,"./OperatorNode":93,"./SymbolNode":94,"./UnaryNode":95,"dup":49}],97:[function(require,module,exports){
arguments[4][50][0].apply(exports,arguments)
},{"dup":50}],98:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}]},{},[1])(1)
});