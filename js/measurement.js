var Measurement = (function() {

  var Vector3 = THREE.Vector3;
  var Plane = THREE.Plane;

  // utility functions

  // clamp a number to two boundary values
  function clamp(x, minVal, maxVal) {
    if (x < minVal) x = minVal;
    else if (x > maxVal) x = maxVal;
    return x;
  }
  // compute acos, but clamp the input
  function acos(a) { return Math.acos(clamp(a, -1, 1)); }
  // compute asin, but clamp the input
  function asin(a) { return Math.asin(clamp(a, -1, 1)); }

  function axisToVector3(axis) {
    var v = new Vector3();
    v[axis] = 1;
    return v;
  }

  // push b's terms onto a without using concat - jsperf testing indicates that
  // this is faster
  function arrayAppend(target, source) {
    var sourceLength = source.length;

    for (var i = 0; i < sourceLength; i++) target.push(source[i]);
  }



  // Measurement constructor

  function Measurement(pointer, scene) {
    this.pointer = pointer;
    this.scene = scene;

    // unique id for managing the markers
    this.uuid = THREE.Math.generateUUID();

    this.active = false;
    this.params = null;

    this.result = this.makeResult(false);

    // index of the point due to be set
    this.pidx = 0;
    // number of active primary markers
    this.pnumactive = 0;

    // primary and secondary markers; primary markers are placed by the user,
    // while secondary markers are derived from the configuration of the
    // primary markers
    this.pmarkers = [];
    this.smarkers = [];

    // total numbers of primary/secondary markers
    this.pnum = 0;
    this.snum = 0;

    // type of primary/secondary markers
    this.ptype = Markers.Types.none;
    this.stype = Markers.Types.none;

    this.mesh = null;

    this.pointerCallbackIdx = -1;

    // optionally called when a result has been calculated
    this.onResultChange = null;
  }

  Measurement.Types = {
    none: "none",
    length: "length",
    angle: "angle",
    circle: "circle",
    crossSection: "crossSection",
    orientedCrossSection: "orientedCrossSection"
  };

  Object.assign(Measurement.prototype, {

    constructor: Measurement,

    // prototype material for line markers
    lineMarkerMaterial: new THREE.LineBasicMaterial({
      color: 0xffffff,
      // if marker has z-fighting with a surface, prioritize the marker
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 1
    }),

    meshMarkerMaterial: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      // if marker has z-fighting with a surface, prioritize the marker
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 1
    }),

    start: function(params) {
      this.params = params || {};
      this.params.type = this.params.type || Measurement.Types.length;

      if (!this.params.hasOwnProperty("color")) this.params.color =  0x2adeff;

      // if true, don't automatically calculate the measurement when there are
      // enough points - necessiatates a manual call to .calculate()
      this.params.calculateManually = this.params.calculateManually || false;

      this.pmarkers.length = 0;
      this.smarkers.length = 0;

      this.pidx = 0;
      this.pnum = 0;
      this.snum = 0;
      this.pnumactive = 0;

      this.ptype = Markers.Types.none;
      this.stype = Markers.Types.none;

      this.result = this.makeResult(false);

      var pparams = { name: "measurementMarker" + this.uuid };
      var sparams = { name: "measurementMarker" + this.uuid };

      var scene = this.scene;
      var type = this.params.type;

      // set the correct number and types of markers
      if (type === Measurement.Types.length) {
        this.pnum = 2; // 2 sphere markers
        this.snum = 1; // 1 line marker
        this.ptype = Markers.Types.sphere;
        this.stype = Markers.Types.line;
        pparams.material = this.meshMarkerMaterial.clone();
        sparams.material = this.lineMarkerMaterial.clone();
      }
      else if (type === Measurement.Types.angle) {
        this.pnum = 3; // 3 sphere markers
        this.snum = 2; // 2 line marker
        this.ptype = Markers.Types.sphere;
        this.stype = Markers.Types.line;
        pparams.material = this.meshMarkerMaterial.clone();
        sparams.material = this.lineMarkerMaterial.clone();
      }
      else if (type === Measurement.Types.circle) {
        this.pnum = 3; // 3 sphere markers
        this.snum = 1; // 1 circle marker
        this.ptype = Markers.Types.sphere;
        this.stype = Markers.Types.circle;
        pparams.material = this.meshMarkerMaterial.clone();
        sparams.material = this.lineMarkerMaterial.clone();
      }
      else if (type === Measurement.Types.crossSection) {
        this.pnum = 1; // 1 plane marker
        this.snum = 1; // 1 contour marker
        this.ptype = Markers.Types.plane;
        this.stype = Markers.Types.contour;

        this.params.axis = this.params.axis || "z";
        // normal of the axis-oriented plane denoting the cross-section
        this.params.normal = this.params.normal || axisToVector3(this.params.axis);
        // true if selecting only the closest contour to the center of the circle
        // subtended by the markers
        this.params.nearestContour = this.params.nearestContour || false;
        // true if splitting the segment soup into an array of contiguous loops,
        // and necessarily true if finding the nearest contour
        this.params.splitContours = this.params.nearestContour || this.params.splitContours || false;

        // use this normal to create the plane marker
        pparams.axis = this.params.axis;
        pparams.normal = this.params.normal;
        pparams.material = this.meshMarkerMaterial.clone();
        pparams.material.setValues({
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide
        });
        sparams.material = this.lineMarkerMaterial.clone();
      }
      else if (type === Measurement.Types.orientedCrossSection) {
        this.pnum = 3; // 3 sphere markers
        this.snum = 1; // 1 contour Marker
        this.ptype = Markers.Types.sphere;
        this.stype = Markers.Types.contour;

        // true if selecting only the closest contour to the center of the circle
        // subtended by the markers
        this.params.nearestContour = this.params.nearestContour || false;
        // true if splitting the segment soup into an array of contiguous loops,
        // and necessarily true if finding the nearest contour
        this.params.splitContours = this.params.nearestContour || this.params.splitContours || false;

        pparams.material = this.meshMarkerMaterial.clone();
        sparams.material = this.lineMarkerMaterial.clone();
      }
      else return;

      // generate the markers and add them to the scene
      for (var ip = 0; ip < this.pnum; ip++) {
        var marker = Markers.create(this.ptype, pparams);
        marker.setColor(this.params.color);
        marker.addToScene(scene);
        this.pmarkers.push(marker);
      }
      for (var is = 0; is < this.snum; is++) {
        var marker = Markers.create(this.stype, sparams);
        marker.setColor(this.params.color);
        marker.addToScene(scene);
        this.smarkers.push(marker);
      }

      // if the params already contain the points necessary to compute the
      // measurement, place the markers and compute the measurement
      if (this.isFullyDetermined()) {
        this.pnumactive = this.pnum;
        this.pidx = 0;

        this.calculate();

        this.positionMarkers();
      }
      // else, initialize the points
      else {
        this.params.p = [];

        for (var p = 0; p < this.pnum; p++) this.params.p.push(null);
      }

      this.activate();
    },

    dispose: function() {
      this.deactivate();

      removeMeshByName(this.scene, "measurementMarker" + this.uuid);

      this.onResultChange = null;
    },

    activate: function() {
      this.pointer.activate();

      this.pointerCallbackIdx = this.pointer.addClickCallback(this.placePoint.bind(this));

      this.active = true;
    },

    deactivate: function() {
      this.pointer.deactivate();

      this.pointerCallbackIdx = -1;

      this.active = false;
    },

    getType: function() {
      return this.params.type;
    },

    placePoint: function(intersection) {
      var point = intersection.point;
      var mesh = intersection.object;

      this.mesh = mesh;

      this.params.p[this.pidx] = point;
      this.pnumactive = Math.min(this.pnum, this.pnumactive + 1);
      this.pidx = (this.pidx + 1) % this.pnum;

      this.calculate();

      this.positionMarkers();
    },

    getParams: function() {
      return this.params;
    },

    // return true if a sufficient number of points is given
    isFullyDetermined: function() {
      if (!this.params.p) return false;

      var type = this.params.type;

      if (type === Measurement.Types.length) {
        // need 2 constraining points
        return this.params.p[0] && this.params.p[1];
      }
      else if (type === Measurement.Types.angle) {
        // need 3 constraining points
        return this.params.p[0] && this.params.p[1] && this.params.p[2];
      }
      else if (type === Measurement.Types.circle) {
        // need 3 constraining points
        return this.params.p[0] && this.params.p[1] && this.params.p[2];
      }
      else if (type === Measurement.Types.crossSection) {
        // need 1 constraining point
        return this.params.p[0];
      }
      else if (type === Measurement.Types.orientedCrossSection) {
        // need 3 constraining points
        return this.params.p[0] && this.params.p[1] && this.params.p[2];
      }
      else return true;
    },

    calculate: function() {
      // if not enough points, do nothing
      if (!this.isFullyDetermined()) return;

      this.result = this.makeResult(false);

      var type = this.params.type;

      if (type === Measurement.Types.length) {
        var p0 = this.params.p[0];
        var p1 = this.params.p[1];

        if (p0 === null || p1 === null) return;

        this.result.length = p0.distanceTo(p1);
        this.result.ready = true;
      }
      else if (type === Measurement.Types.angle) {
        var p0 = this.params.p[0];
        var p1 = this.params.p[1];
        var p2 = this.params.p[2];

        if (p0 === null || p1 === null || p2 === null) return;

        var d10 = new Vector3().subVectors(p0, p1).normalize();
        var d12 = new Vector3().subVectors(p2, p1).normalize();
        var dot = d10.dot(d12);

        this.result.angle = acos(dot);
        this.result.angleDegrees = this.result.angle * 180.0 / Math.PI;
        this.result.ready = true;
      }
      else if (type === Measurement.Types.circle) {
        var p0 = this.params.p[0];
        var p1 = this.params.p[1];
        var p2 = this.params.p[2];

        var circle = (p0 && p1 && p2) ? Calculate.circleFromThreePoints(p0, p1, p2) : null;

        if (!circle) return;

        var center = circle.center;
        var normal = circle.normal;
        var radius = circle.radius;

        this.result.radius = radius;
        this.result.diameter = radius * 2;
        this.result.circumference = radius * 2 * Math.PI;
        this.result.area = radius * radius * Math.PI;
        this.result.center = center;
        this.result.normal = normal;
        this.result.ready = true;
      }
      else if (type === Measurement.Types.crossSection || type === Measurement.Types.orientedCrossSection) {
        // variables that determine the plane
        var normal, point;

        // if normal cross-section, set the plane from point and normal
        if (type === Measurement.Types.crossSection) {
          normal = this.params.normal;
          point = this.params.p[0];

          if (normal === null || point === null) return;
        }
        // else, compute circle and set from its center and normal
        else {
          var p0 = this.params.p[0];
          var p1 = this.params.p[1];
          var p2 = this.params.p[2];

          // compute the circle parameters from three points
          var circle = Calculate.circleFromThreePoints(p0, p1, p2);

          if (!circle) return;

          normal = circle.normal;
          point = circle.center;
        }

        var plane = new Plane();

        // set the plane
        plane.setFromNormalAndCoplanarPoint(normal, point);

        // having the plane, we can compute the cross-section
        var contours = Calculate.crossSection(plane, this.mesh, this.params.splitContours);

        // if getting the nearest contour, retrieve it and use it as the measurement result
        if (this.params.nearestContour) {
          contours = [Calculate.nearestContourToPoints(contours, this.params.p)];
        }

        // final quantities
        var segments = [];
        var area = 0;
        var length = 0;
        var boundingBox = new THREE.Box3();

        // accumulate the segment array
        for (var c = 0, lc = contours.length; c < lc; c++) {
          arrayAppend(segments, contours[c].segments);
        }

        // if computing the convex hull, get the result from that
        if (this.params.convexHull) {
          var hull = Calculate.planarConvexHull(plane, segments);

          if (hull) {
            segments = hull.segments;
            area = hull.area;
            length = hull.length;
            boundingBox = hull.boundingBox;
          }
        }
        // else, just accumulate the final bounding box, area, and length
        else {
          for (var c = 0, lc = contours.length; c < lc; c++) {
            var contour = contours[c];

            boundingBox.expandByPoint(contour.boundingBox.min);
            boundingBox.expandByPoint(contour.boundingBox.max);

            area += contour.area;
            length += contour.length;
          }
        }

        // set the contour marker from the segment array
        this.smarkers[0].setFromSegments(segments);

        // fill the measurement result
        this.result.area = area;
        this.result.boundingBox = boundingBox;
        this.result.length = length;
        this.result.contours = contours;
        this.result.ready = true;
      }

      if (this.onResultChange) {
        this.onResultChange(this.result);
      }
    },

    positionMarkers: function() {
      // position primary markers

      if (this.ptype === Markers.Types.sphere) {
        for (var m = 0; m < this.pnum; m++) {
          var pos = this.params.p[m];

          if (pos !== null) {
            var marker = this.pmarkers[(this.pidx + m) % this.pnum];

            marker.setPosition(pos);
            marker.activate();
          }
        }
      }
      else if (this.ptype === Markers.Types.plane) {
        var marker = this.pmarkers[0];

        // if no valid bounding box to which to size the marker, deactivate
        if (Math.abs(this.result.boundingBox.min.length()) === Infinity) {
          marker.deactivate();
        }

        marker.setFromBoundingBox(this.result.boundingBox, 1.5);

        marker.activate();
      }

      // position secondary markers

      if (this.stype === Markers.Types.line) {
        for (var m = 0; m < this.snum; m++) {
          var ps = this.params.p[(this.pidx + m) % this.pnum];
          var pt = this.params.p[(this.pidx + 1 + m) % this.pnum];

          if (ps && pt) {
            this.smarkers[m].setFromPointPair(ps, pt);
            this.smarkers[m].activate();
          }
          else {
            this.smarkers[m].deactivate();
          }
        }
      }
      else if (this.stype === Markers.Types.circle) {
        var marker = this.smarkers[0];

        // if result is valid, position the marker and turn it on
        if (this.result.ready) {
          var normal = this.result.normal;
          var center = this.result.center;
          var radius = this.result.radius;

          marker.setCenter(this.result.center);
          marker.setNormal(this.result.normal);
          marker.setScale(this.result.radius);

          marker.activate();
        }
        // else, turn off the marker because its parameters are invalid
        else {
          marker.deactivate();
        }
      }
      else if (this.stype === Markers.Types.contour) {
        if (this.result.ready) {
          this.smarkers[0].activate();
        }
      }
      else {
        this.smarkers[0].activate();
      }
    },

    makeResult: function(ready) {
      return {
        ready: ready || false
      };
    },

    updateFromCamera: function(camera) {
      // only update if measurement uses non-plane markers
      if (this.ptype !== Markers.Types.sphere) return;

      for (var m = 0; m < this.pnum; m++) {
        var marker = this.pmarkers[m];

        if (marker.type !== Markers.Types.sphere) continue;

        var dist = camera.position.distanceTo(marker.getPosition());

        marker.setRadius(dist * 0.005);
      }
    },

    scaleFromPoint: function(factor, point) {
      // scale measurement constraints
      for (var i = 0; i < this.params.p.length; i++) {
        var p = this.params.p[i];

        if (p !== null) {
          // if factor is a 3-vector
          if (factor.isVector3) p.sub(point).multiply(factor).add(point);
          // else, it's a scalar
          else p.sub(point).multiplyScalar(factor).add(point);
        }
      }

      // scale primary markers
      for (var m = 0; m < this.pnum; m++) {
        this.pmarkers[m].scaleFromPoint(factor, point);
      }

      // scale secondary markers
      for (var m = 0; m < this.snum; m++) {
        this.smarkers[m].scaleFromPoint(factor, point);
      }

      // copy the current result
      var result = Object.assign({}, this.result);

      if (!result.ready) return;

      // adjust the result values given the factor

      // all three components of factor are assumed to be the same (if factor
      // is a vector), so pick one
      var f = factor.isVector3 ? factor.x : factor;

      if (this.params.type === Measurement.Types.length) {
        result.length *= f;
      }
      else if (this.params.type === Measurement.Types.circle) {
        result.radius *= f;
        result.diameter *= f;
        result.circumference *= f;
        result.area *= f * f;
        result.center.sub(point).multiplyScalar(f).add(point);
      }
      else if (this.params.type === Measurement.Types.crossSection
        || this.params.type === Measurement.Types.orientedCrossSection) {
        result.area *= f * f;
        result.boundingBox.min.sub(point).multiplyScalar(f).add(point);
        result.boundingBox.max.sub(point).multiplyScalar(f).add(point);
        result.length *= f;
      }

      // update result
      this.result = result;

      if (this.onResultChange) {
        this.onResultChange(this.result);
      }
    },

    translate: function(delta) {
      // translate measurement constraints
      for (var i = 0; i < this.params.p.length; i++) {
        var p = this.params.p[i];

        if (p !== null) p.add(delta);
      }

      // translate primary markers
      for (var m = 0; m < this.pnum; m++) {
        this.pmarkers[m].translate(delta);
      }

      // translate secondary markers
      for (var c = 0; c < this.snum; c++) {
        this.smarkers[c].translate(delta);
      }

      // translate relevant quantities in the computed result

      if (!this.result.ready) return;

      if (this.params.type === Measurement.Types.circle) {
        this.result.center.add(delta);
      }
      else if (this.params.type === Measurement.Types.crossSection
        || this.params.type === Measurement.Types.orientedCrossSection) {
        this.result.boundingBox.translate(delta);
      }
    }

  });



  return Measurement;

})();
