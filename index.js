/*
 * function-plot
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */
'use strict'
require('./lib/polyfills')

var d3 = window.d3

var events = require('events')
var extend = require('extend')

var mousetip = require('./lib/tip')
var utils = require('./lib/utils')
var helpers = require('./lib/helpers/')
var annotations = require('./lib/helpers/annotations')

var assert = utils.assert

var Const
var types
var cache = []

module.exports = function (options) {
  options = options || {}
  options.data = options.data || []

  // globals
  var width, height
  var margin
  var zoomBehavior
  var xScale, yScale
  var line = d3.svg.line()
    .x(function (d) { return xScale(d[0]) })
    .y(function (d) { return yScale(d[1]) })

  function Chart () {
    var n = Math.random()
    var letter = String.fromCharCode(Math.floor(n * 26) + 97)
    this.id = letter + n.toString(16).substr(2)
    this.linkedGraphs = [this]
    this.options = options

    options.id = this.id
    cache[this.id] = this
    this.setUpEventListeners()
  }

  Chart.prototype = Object.create(events.prototype)

  /**
   * Rebuilds the entire graph from scratch recomputing
   *
   * - the inner width/height
   * - scales/axes
   *
   * After this is done it does a complete redraw of all the datums,
   * if only the datums need to be redrawn call `instance.draw()` instead
   *
   * @returns {Chart}
   */
  Chart.prototype.build = function () {
    this.internalVars()
    this.drawGraphWrapper()
    return this
  }

  Chart.prototype.updateScaleAxes = function () {
    var xDomain = this.meta.xDomain
    var yDomain = this.meta.yDomain

    var integerFormat = d3.format('s')
    var format = function (scale) {
      return function (d) {
        var decimalFormat = scale.tickFormat(10)
        var isInteger = d === +d && d === (d | 0)
        // integers: d3.format('s'), see https://github.com/mbostock/d3/wiki/Formatting
        // decimals: default d3.scale.linear() formatting see
        //    https://github.com/mbostock/d3/blob/master/src/svg/axis.js#L29
        return isInteger ? integerFormat(d) : decimalFormat(d)
      }
    }

    xScale = this.meta.xScale = d3.scale.linear()
      .domain(xDomain)
      .range([0, width])
    yScale = this.meta.yScale = d3.scale.linear()
      .domain(yDomain)
      .range([height, 0])
    this.meta.xAxis = d3.svg.axis()
      .scale(xScale)
      .tickSize(options.grid ? -height : 0)
      .tickFormat(format(xScale))
      .orient('bottom')
    this.meta.yAxis = d3.svg.axis()
      .scale(yScale)
      .tickSize(options.grid ? -width : 0)
      .tickFormat(format(yScale))
      .orient('left')
  }

  Chart.prototype.internalVars = function () {

    // measurements and other derived data
    this.meta = {}

    margin = this.meta.margin = {left: 30, right: 30, top: 20, bottom: 20}
    zoomBehavior = this.meta.zoomBehavior = d3.behavior.zoom()

    // inner width/height
    width = this.meta.width = (options.width || Const.DEFAULT_WIDTH) -
      margin.left - margin.right
    height = this.meta.height = (options.height || Const.DEFAULT_HEIGHT) -
      margin.top - margin.bottom

    function computeYScale (xScale) {
      var xDiff = xScale[1] - xScale[0]
      return height * xDiff / width
    }

    var xLimit = 14
    var xDomain = this.meta.xDomain = options.xDomain || [-xLimit / 2, xLimit / 2]
    var yLimit = computeYScale(xDomain)
    var yDomain = this.meta.yDomain = options.yDomain || [-yLimit / 2, yLimit / 2]

    assert(xDomain[0] < xDomain[1])
    assert(yDomain[0] < yDomain[1])

    if (options.title) {
      this.meta.margin.top = 40
    }

    // scale/axes
    this.updateScaleAxes()
  }

  Chart.prototype.drawGraphWrapper = function () {
    var root = this.root = d3.select(options.target).selectAll('svg')
      .data([options])

    // enter
    this.root.enter = root.enter()
      .append('svg')
      .attr('class', 'function-plot')
      .attr('font-size', this.getFontSize())

    // merge
    root
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)

    this.buildTitle()
    this.buildLegend()
    this.buildCanvas()
    this.buildClip()
    this.buildAxis()
    this.buildAxisLabel()

    // draw each datum after the wrapper was set up
    this.draw()

    // helper to detect the closest fn to the cursor's current abscissa
    var tip = this.tip = mousetip(extend(options.tip, { owner: this }))
    this.canvas
      .call(tip)

    this.buildZoomHelper()
    this.setUpPlugins()
  }

  Chart.prototype.buildTitle = function () {
    // join
    var selection = this.root.selectAll('text.title')
      .data(function (d) {
        return [d.title].filter(Boolean)
      })

    // enter
    selection.enter()
      .append('text')
      .attr('class', 'title')
      .attr('y', margin.top / 2)
      .attr('x', margin.left + width / 2)
      .attr('font-size', 25)
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .text(options.title)

    // exit
    selection.exit().remove()
  }

  Chart.prototype.buildLegend = function () {
    // enter
    this.root.enter
      .append('text')
      .attr('class', 'top-right-legend')
      .attr('text-anchor', 'end')

    // update + enter
    this.root.select('.top-right-legend')
      .attr('y', margin.top / 2)
      .attr('x', width + margin.left)
  }

  Chart.prototype.buildCanvas = function () {
    var self = this

    this.meta.zoomBehavior
      .x(xScale)
      .y(yScale)
      .scaleExtent([0.00001, Infinity])
      .on('zoom', function onZoom () {
        self.emit('all:zoom', xScale, yScale)
      })

    // enter
    var canvas = this.canvas = this.root
      .selectAll('.canvas')
      .data(function (d) { return [d] })

    this.canvas.enter = canvas.enter()
      .append('g')
      .attr('class', 'canvas')

    // enter + update
  }

  Chart.prototype.buildClip = function () {
    // (so that the functions don't overflow on zoom or drag)
    var id = this.id
    var defs = this.canvas.enter.append('defs')
    defs.append('clipPath')
      .attr('id', 'function-plot-clip-' + id)
      .append('rect')
      .attr('class', 'clip static-clip')

    // enter + update
    this.canvas.selectAll('.clip')
      .attr('width', width)
      .attr('height', height)

    // marker clip (for vectors)
    this.markerId = this.id + '-marker'
    defs.append('clipPath')
      .append('marker')
      .attr('id', this.markerId)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 10)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('svg:path')
      .attr('d', 'M0,-5L10,0L0,5L0,0')
      .attr('stroke-width', '0px')
      .attr('fill-opacity', 1)
      .attr('fill', '#777')
  }

  Chart.prototype.buildAxis = function () {
    // axis creation
    var canvasEnter = this.canvas.enter
    canvasEnter.append('g')
      .attr('class', 'x axis')
    canvasEnter.append('g')
      .attr('class', 'y axis')

    // update
    this.canvas.select('.x.axis')
      .attr('transform', 'translate(0,' + height + ')')
      .call(this.meta.xAxis)
    this.canvas.select('.y.axis')
      .call(this.meta.yAxis)

  }

  Chart.prototype.buildAxisLabel = function () {
    // axis labeling
    var xLabel, yLabel
    var canvas = this.canvas

    xLabel = canvas.selectAll('text.x.axis-label')
      .data(function (d) {
        return [d.xLabel].filter(Boolean)
      })
    xLabel.enter()
      .append('text')
      .attr('class', 'x axis-label')
      .attr('text-anchor', 'end')
    xLabel
      .attr('x', width)
      .attr('y', height - 6)
      .text(function (d) { return d })
    xLabel.exit().remove()

    yLabel = canvas.selectAll('text.y.axis-label')
      .data(function (d) {
        return [d.yLabel].filter(Boolean)
      })
    yLabel.enter()
      .append('text')
      .attr('class', 'y axis-label')
      .attr('y', 6)
      .attr('dy', '.75em')
      .attr('text-anchor', 'end')
      .attr('transform', 'rotate(-90)')
    yLabel
      .text(function (d) { return d })
    yLabel.exit().remove()
  }

  /**
   * @private
   *
   * Draws each of the datums stored in data.options, to do a full
   * redraw call `instance.draw()`
   */
  Chart.prototype.buildContent = function () {
    var self = this
    var canvas = this.canvas

    canvas
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
      .call(zoomBehavior)
      .each(function () {
        var el = d3.select(this)
        // make a copy of all the listeners available to be removed/added later
        var listeners = ['mousedown', 'mousewheel', 'mouseover', 'DOMMouseScroll', 'dblclick', 'wheel', 'MozMousePixelScroll']
        listeners = listeners.map(function (l) { return l + '.zoom' })
        if (!el._hasZoomListeners) {
          listeners.forEach(function (l) {
            el['_' + l] = el.on(l)
          })
        }
        function setState (state) {
          listeners.forEach(function (l) {
            state ? el.on(l, el['_' + l]) : el.on(l, null)
          })
        }
        setState(!options.disableZoom)
      })

    var content = this.content = canvas.selectAll(':scope > g.content')
      .data(function (d) { return [d] })

    // g tag clipped to hold the data
    content.enter()
      .append('g')
      .attr('clip-path', 'url(#function-plot-clip-' + this.id + ')')
      .attr('class', 'content')

    // helper line, x = 0
    var yOrigin = content.selectAll(':scope > path.y.origin')
      .data([ [[0, yScale.domain()[0]], [0, yScale.domain()[1]]] ])
    yOrigin.enter()
      .append('path')
      .attr('class', 'y origin')
      .attr('stroke', 'black')
      .attr('opacity', 0.2)
    yOrigin.attr('d', line)

    // helper line y = 0
    var xOrigin = content.selectAll(':scope > path.x.origin')
      .data([ [[xScale.domain()[0], 0], [xScale.domain()[1], 0]] ])
    xOrigin.enter()
      .append('path')
      .attr('class', 'x origin')
      .attr('stroke', 'black')
      .attr('opacity', 0.2)
    xOrigin.attr('d', line)

    // annotations (parallel to the y-axis)
    content
      .call(annotations({ owner: self }))

    // content construction (based on graphOptions)
    // join
    var graphs = content.selectAll(':scope > g.graph')
      .data(function (d) { return d.data })
    // enter
    graphs
      .enter()
      .append('g')
      .attr('class', 'graph')
    // enter + update
    graphs
      .each(function (data, index) {
        data.graphOptions = extend({
          type: 'interval'
        }, data.graphOptions)

        // if the type of graph chosen is not `interval` then default the sampler to `mathjs`
        var sampler = data.graphOptions.type !== 'interval'
          ? 'builtIn'
          : 'interval'
        data.graphOptions = extend({
          sampler: sampler
        }, data.graphOptions)

        var options = extend({
          owner: self,
          index: index
        }, data.graphOptions)

        // shortcuts
        // - vector needs the builtIn evaluator
        if (data.vector) {
          data.graphOptions.sampler = 'builtIn'
          data.graphOptions.type = 'line'
        }

        d3.select(this)
          .call(types[options.type](options))
        d3.select(this)
          .call(helpers(options))
      })
  }

  Chart.prototype.buildZoomHelper = function () {
    // dummy rect (detects the zoom + drag)
    var self = this

    // enter
    this.canvas.enter
      .append('rect')
      .attr('class', 'zoom-and-drag')
      .style('fill', 'none')
      .style('pointer-events', 'all')

    // update
    this.canvas.select('.zoom-and-drag')
      .attr('width', width)
      .attr('height', height)
      .on('mouseover', function () {
        self.emit('all:mouseover')
      })
      .on('mouseout', function () {
        self.emit('all:mouseout')
      })
      .on('mousemove', function () {
        self.emit('all:mousemove')
      })
  }

  Chart.prototype.setUpPlugins = function () {
    var plugins = options.plugins || []
    var self = this
    plugins.forEach(function (plugin) {
      plugin(self)
    })
  }

  Chart.prototype.addLink = function () {
    for (var i = 0; i < arguments.length; i += 1) {
      this.linkedGraphs.push(arguments[i])
    }
  }

  Chart.prototype.updateAxes = function () {
    var instance = this
    var canvas = instance.canvas
    canvas.select('.x.axis').call(instance.meta.xAxis)
    canvas.select('.y.axis').call(instance.meta.yAxis)

    // updates the style of the axes
    canvas.selectAll('.axis path, .axis line')
      .attr('fill', 'none')
      .attr('stroke', 'black')
      .attr('shape-rendering', 'crispedges')
      .attr('opacity', 0.1)
  }

  Chart.prototype.syncOptions = function () {
    // update the original options yDomain and xDomain
    this.options.xDomain = this.meta.xScale.domain()
    this.options.yDomain = this.meta.yScale.domain()
  }

  Chart.prototype.programmaticZoom = function (xDomain, yDomain) {
    var instance = this
    d3.transition()
      .duration(750)
      .tween('zoom', function () {
        var ix = d3.interpolate(xScale.domain(), xDomain)
        var iy = d3.interpolate(yScale.domain(), yDomain)
        return function (t) {
          zoomBehavior
            .x(xScale.domain(ix(t)))
            .y(yScale.domain(iy(t)))
          instance.draw()
        }
      })
      .each('end', function () {
        instance.emit('programmatic-zoom')
      })
  }

  Chart.prototype.getFontSize = function () {
    return Math.max(Math.max(width, height) / 50, 8)
  }

  Chart.prototype.draw = function () {
    var instance = this
    instance.emit('before:draw')
    instance.syncOptions()
    instance.updateAxes()
    instance.buildContent()
    instance.emit('after:draw')
  }

  Chart.prototype.setUpEventListeners = function () {
    var instance = this

    var events = {
      mousemove: function (x, y) {
        instance.tip.move(x, y)
      },
      mouseover: function () {
        instance.tip.show()
      },
      mouseout: function () {
        instance.tip.hide()
      },
      'zoom:scaleUpdate': function (xOther, yOther) {
        zoomBehavior
          .x(xScale.domain(xOther.domain()))
          .y(yScale.domain(yOther.domain()))
      },
      'tip:update': function (x, y, index) {
        var meta = instance.root.datum().data[index]
        var title = meta.title || ''
        var format = meta.renderer || function (x, y) {
            return x.toFixed(3) + ', ' + y.toFixed(3)
          }

        var text = []
        title && text.push(title)
        text.push(format(x, y))

        instance.root.select('.top-right-legend')
          .attr('fill', Const.COLORS[index])
          // .text(x.toFixed(3) + ', ' + y.toFixed(3))
          .text(text.join(' '))
      }
    }

    var all = {
      mousemove: function () {
        var mouse = d3.mouse(instance.root.select('rect.zoom-and-drag').node())
        var x = xScale.invert(mouse[0])
        var y = yScale.invert(mouse[1])
        instance.linkedGraphs.forEach(function (graph) {
          graph.emit('mousemove', x, y)
        })
      },

      zoom: function (xScale, yScale) {
        instance.linkedGraphs.forEach(function (graph, i) {
          // since its scale was updated through d3.behavior.zoom
          // we don't need to do it again
          if (i) {
            graph.emit('zoom:scaleUpdate', xScale, yScale)
          }
          // the first element is the instance who fired the event,
          // content draw
          graph.draw()
        })

        // emit the position of the mouse to all the registered graphs
        instance.emit('all:mousemove')
      }
    }

    Object.keys(events).forEach(function (e) {
      instance.on(e, events[e])
      // create an event for each event existing on `events` in the form 'all:' event
      // e.g. all:mouseover all:mouseout
      // the objective is that all the linked graphs receive the same event as the current graph
      !all[e] && instance.on('all:' + e, function () {
        var args = Array.prototype.slice.call(arguments)
        instance.linkedGraphs.forEach(function (graph) {
          var localArgs = args.slice()
          localArgs.unshift(e)
          graph.emit.apply(graph, localArgs)
        })
      })
    })

    Object.keys(all).forEach(function (e) {
      instance.on('all:' + e, all[e])
    })
  }

  var instance = cache[options.id]
  if (!instance) {
    instance = new Chart()
  }
  return instance.build()
}
Const = module.exports.globals = require('./lib/globals')
types = module.exports.types = require('./lib/types/')
module.exports.plugins = require('./lib/plugins/')
module.exports.eval = require('./lib/helpers/eval')
