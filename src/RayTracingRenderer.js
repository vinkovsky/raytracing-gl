import * as THREE from "../modules/three.js";

import { makeRenderingPipeline } from "./renderer/RenderingPipeline.js";
import { loadExtensions } from "./renderer/glUtil.js";

//RayTracingRenderer
const glRequiredExtensions = [
  "EXT_color_buffer_float", // enables rendering to float buffers
  "EXT_float_blend",
];
const glOptionalExtensions = [
  "OES_texture_float_linear", // enables gl.LINEAR texture filtering for float textures,
];

export class RayTracingRenderer {
  constructor(params = {}) {
    this.canvas = params.canvas || document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl2", {
      alpha: params.canvasAlpha || false,
      depth: true,
      stencil: false,
      antialias: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });

    loadExtensions(this.gl, glRequiredExtensions);

    this.optionalExtensions = loadExtensions(this.gl, glOptionalExtensions);
    this._bounces = 2;
    this._envMapIntensity = 1;
    this._toneMapping = THREE.LinearToneMapping;
    this._movingDownsampling = false;
    this._enableDenoise = false;
    this._enableTemporalDenoise = true;
    this._enableSpatialDenoise = true;
    this._fullSampleCallback = null;
    this._enviromentVisible = true;
    this.useTileRender = false;
    this.renderWhenOffFocus = true;
    this.useWorker = params.useWorker || true;
    this.loadingCallback = params.loadingCallback || {
      onProgress: (e) => console.log(e),
      onComplete: (e) => console.log(e),
    };
    this._isBuilding = true;
    this.needsUpdate = false;
    this.size = new THREE.Vector2(this.canvas.width, this.canvas.height);
    this.pixelRatio = 1;
    this.pipeline = null;
    this.currentTime = NaN;
    this.isValidTime = 1;
    this.lastFocus = false;
    this.domElement = this.canvas;
  }

  static isSupported() {
    const gl = document
      .createElement("canvas")
      .getContext("webgl2", { failIfMajorPerformanceCaveat: true });

    if (!gl) {
      return false;
    }

    const extensions = loadExtensions(gl, glRequiredExtensions);

    for (let e in extensions) {
      if (!extensions[e]) {
        return false;
      }
    }

    return true;
  }

  async buildScene(scene, camera) {
    const {
      gl,
      optionalExtensions,
      bounces,
      size,
      toneMapping,
      envMapIntensity,
      enviromentVisible,
      movingDownsampling,
      enableDenoise,
      enableTemporalDenoise,
      enableSpatialDenoise,
      useWorker,
      loadingCallback,
    } = this;

    this._isBuilding = true;

    scene.updateMatrixWorld();

    this.pipeline = await makeRenderingPipeline({
      gl,
      optionalExtensions,
      scene,
      camera,
      toneMapping,
      bounces,
      envMapIntensity,
      enviromentVisible,
      movingDownsampling,
      enableDenoise,
      enableTemporalDenoise,
      enableSpatialDenoise,
      useWorker,
      loadingCallback,
    });

    this.setSize(size.width, size.height);

    this._isBuilding = false;

    if (typeof loadingCallback?.onComplete == "function") {
      loadingCallback.onComplete("Complete!");
    }
  }

  set bounces(bounces) {
    this._bounces = bounces;
    this.pipeline?.updateBounces(bounces);
  }

  get bounces() {
    return this._bounces;
  }

  set envMapIntensity(envMapIntensity) {
    envMapIntensity = Number(envMapIntensity);
    this._envMapIntensity = envMapIntensity;
    this.pipeline?.setEnvMapIntensity(envMapIntensity);
  }

  get envMapIntensity() {
    return this._envMapIntensity;
  }

  set toneMapping(toneMapping) {
    this._toneMapping = toneMapping;
    this.pipeline?.setToneMapping(toneMapping);
  }

  get toneMapping() {
    return this._toneMapping;
  }

  set enviromentVisible(enviromentVisible) {
    this._enviromentVisible = enviromentVisible;
    this.pipeline?.setEnviromentVisible(enviromentVisible);
  }

  get enviromentVisible() {
    return this._enviromentVisible;
  }

  set movingDownsampling(movingDownsampling) {
    movingDownsampling = !!movingDownsampling;
    this._movingDownsampling = movingDownsampling;
    this.pipeline?.setMovingDownsampling(movingDownsampling);
  }

  get movingDownsampling() {
    return this._movingDownsampling;
  }

  set enableDenoise(enableDenoise) {
    enableDenoise = !!enableDenoise;
    this._enableDenoise = enableDenoise;
    this.pipeline?.setDenoiseStatus(enableDenoise);
  }

  get enableDenoise() {
    return this._enableDenoise;
  }

  set enableTemporalDenoise(enableTemporalDenoise) {
    enableTemporalDenoise = !!enableTemporalDenoise;
    this._enableTemporalDenoise = enableTemporalDenoise;
    this.pipeline?.setTemporalDenoiseStatus(enableTemporalDenoise);
  }

  get enableTemporalDenoise() {
    return this._enableTemporalDenoise;
  }

  set enableSpatialDenoise(enableSpatialDenoise) {
    enableSpatialDenoise = !!enableSpatialDenoise;
    this._enableSpatialDenoise = enableSpatialDenoise;
    this.pipeline?.setSpatialDenoiseStatus(enableSpatialDenoise);
  }

  get enableSpatialDenoise() {
    return this._enableSpatialDenoise;
  }

  set fullSampleCallback(fullSampleCallback) {
    if (typeof fullSampleCallback == "function") {
      this._fullSampleCallback = fullSampleCallback;
      this.pipeline?.setfullSampleCallbackCallBack(fullSampleCallback);
    }
  }

  get fullSampleCallback() {
    return this._fullSampleCallback;
  }

  updateEnvLight() {
    this.pipeline?.updateEnvLight();
  }

  updateMeshLight() {
    this.pipeline?.updateMeshLight();
  }

  setDenoiseColorBlendFactor(value) {
    this.pipeline?.setDenoiseColorBlendFactor(value);
  }

  setDenoiseMomentBlendFactor(value) {
    this.pipeline?.setDenoiseMomentBlendFactor(value);
  }

  setDenoiseColorFactor(value) {
    this.pipeline?.setDenoiseColorFactor(value);
  }

  setDenoiseNormalFactor(value) {
    this.pipeline?.setDenoiseNormalFactor(value);
  }

  setDenoisePositionFactor(value) {
    this.pipeline?.setDenoisePositionFactor(value);
  }

  setDemodulateAlbedo(value) {
    this.pipeline?.setDemodulateAlbedo(value);

    this.needsUpdate = true;
  }

  getDenoiseFactors() {
    return this.pipeline?.getDenoiseFactors();
  }

  setSize(width, height, updateStyle = true) {
    const { size, canvas, pipeline, pixelRatio } = this;
    size.set(width, height);
    canvas.width = size.width * pixelRatio;
    canvas.height = size.height * pixelRatio;

    if (updateStyle) {
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
    }

    if (this.pipeline) {
      pipeline.setSize(size.width * pixelRatio, size.height * pixelRatio);
    }
  }

  getSize(target) {
    const { size } = this;

    if (!target) {
      target = new THREE.Vector2();
    }

    return target.copy(size);
  }

  setPixelRatio(x) {
    const { size } = this;
    if (x) {
      this.pixelRatio = x;
      this.setSize(size.width, size.height, false);
    }
  }

  getPixelRatio() {
    return this.pixelRatio;
  }

  getTotalSamples() {
    return this.pipeline?.getTotalSamplesRendered();
  }

  restartTimer() {
    this.isValidTime = NaN;
  }

  render(scene, camera) {
    if (this._isBuilding) {
      return;
    }

    if (this.pipeline) {
      if (!this.renderWhenOffFocus) {
        const hasFocus = document.hasFocus();
        if (!hasFocus) {
          this.lastFocus = hasFocus;
          return this.lastFocus;
        } else if (hasFocus && !this.lastFocus) {
          this.lastFocus = hasFocus;
          this.restartTimer();
        }
      }

      if (this.needsUpdate) {
        this.needsUpdate = false;
        this.pipeline.reset();
      }

      this.currentTime = performance.now();
      this.pipeline.time(this.isValidTime * this.currentTime);
      this.isValidTime = 1;
      this.currentTime = NaN;

      camera.updateMatrixWorld();

      if (this.useTileRender) {
        // render new sample for a tiled subset of the screen
        this.pipeline.draw(camera);
      } else {
        // render new sample for the entire screen
        this.pipeline.fullDraw(camera);
      }
    } else {
      console.error("The scene needs to be built first!");
    }
  }

  dispose() {
    this.pipeline = null;
    this.domElement.remove();
  }
}
