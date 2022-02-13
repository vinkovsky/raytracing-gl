import { PerspectiveCamera } from "../../modules/three.js";

import { decomposeScene } from "./decomposeScene.js";
import { mergeMeshesToGeometry } from "./mergeMeshesToGeometry.js";

import { makeDepthTarget, makeTexture } from "./Texture.js";
import { makeTileRender } from "./TileRender.js";
import { makeFullscreenQuad } from "./FullscreenQuad.js";
import { makeRenderSize } from "./RenderSize.js";
import { makeFXAAPass } from "./FXAAPass.js";
import { makeSVGFPass } from "./SVGFPass.js";
import { makeRayTracePass } from "./RayTracePass.js";
import { makeReprojectPass } from "./ReprojectPass.js";
import { makeToneMapPass } from "./ToneMapPass.js";
import { makeGBufferPass } from "./GBufferPass.js";
import { makeFramebuffer } from "./Framebuffer.js";
import { makeMaterialBuffer } from "./MaterialBuffer.js";

import noiseBase64 from "./texture/noise.js";
import { numberArraysEqual } from "./util.js";

export async function makeRenderingPipeline({
  gl,
  optionalExtensions,
  scene,
  camera,
  toneMapping,
  bounces, // number of global illumination bounces
  envMapIntensity,
  enviromentVisible,
  movingDownsampling,
  enableDenoise,
  enableTemporalDenoise,
  enableSpatialDenoise,
  useWorker,
  loadingCallback,
}) {
  const maxReprojectedSamples = 20;

  // how many samples to render with uniform noise before switching to stratified noise
  const numUniformSamples = 4;

  // used to sample only a portion of the scene to the HDR Buffer to prevent the GPU from locking up from excessive computation
  const tileRender = makeTileRender(gl);

  const previewSize = makeRenderSize(gl);

  const decomposedScene = decomposeScene(scene, camera);

  const mergedMesh = mergeMeshesToGeometry(decomposedScene.meshes);

  const materialBuffer = makeMaterialBuffer(gl, mergedMesh.materials);

  const fullscreenQuad = makeFullscreenQuad(gl);

  const gBufferPass = makeGBufferPass(gl, { materialBuffer, mergedMesh });

  const toneMapPass = makeToneMapPass(gl, { fullscreenQuad, toneMapping });

  const fxaaPass = makeFXAAPass(gl, { fullscreenQuad });

  const reprojectPass = makeReprojectPass(gl, {
    fullscreenQuad,
    maxReprojectedSamples,
  });

  const svgfPass = makeSVGFPass(gl, { fullscreenQuad, toneMapping });

  const rayTracePass = await makeRayTracePass(gl, {
    bounces,
    decomposedScene,
    fullscreenQuad,
    materialBuffer,
    mergedMesh,
    optionalExtensions,
    scene,
    envMapIntensity,
    enviromentVisible,
    useWorker,
    loadingCallback,
  });

  const lastCamera = new PerspectiveCamera();

  const noiseImage = new Image();
  noiseImage.src = noiseBase64;
  noiseImage.onload = () => {
    rayTracePass.setNoise(noiseImage);
    ready = true;
  };

  let frameTime;
  let elapsedFrameTime;

  let ready = false;

  // how many partitions of stratified noise should be created
  // higher number results in faster convergence over time, but with lower quality initial samples
  let setStrataCount = 0;

  let firstFrame = true;

  let screenWidth = 0;
  let screenHeight = 0;

  let gBuffer;
  let gBufferBack;
  let hdrBuffer;
  let reprojectBuffer;
  let reprojectBackBuffer;
  let lastToneMappedTexture;

  let sampleRenderedCallback = () => {};

  function initFrameBuffers(width, height) {
    hdrBuffer = makeFramebuffer(gl, {
      color: {
        0: makeTexture(gl, {
          width,
          height,
          storage: "float",
          magFilter: gl.LINEAR,
          minFilter: gl.LINEAR,
        }),
      },
    });

    lastToneMappedTexture = hdrBuffer.color[0];

    const makeReprojectBuffer = () =>
      makeFramebuffer(gl, {
        color: {
          0: makeTexture(gl, {
            width,
            height,
            storage: "float",
            magFilter: gl.LINEAR,
            minFilter: gl.LINEAR,
          }),
          1: makeTexture(gl, {
            width,
            height,
            storage: "float",
            channels: 4,
            magFilter: gl.LINEAR,
            minFilter: gl.LINEAR,
          }),
        },
      });

    reprojectBuffer = makeReprojectBuffer();
    reprojectBackBuffer = makeReprojectBuffer();

    const normalBuffer = makeTexture(gl, {
      width,
      height,
      storage: "halfFloat",
    });

    const faceNormalBuffer = makeTexture(gl, {
      width,
      height,
      storage: "float",
    });

    const depthTarget = makeDepthTarget(gl, width, height);

    const makeGBuffer = () =>
      makeFramebuffer(gl, {
        color: {
          0: makeTexture(gl, {
            width,
            height,
            storage: "float",
          }),
          1: normalBuffer,
          2: faceNormalBuffer,
        },
        depth: depthTarget,
      });

    gBuffer = makeGBuffer();
    gBufferBack = makeGBuffer();
  }

  function swapReprojectBuffer() {
    let temp = reprojectBuffer;
    reprojectBuffer = reprojectBackBuffer;
    reprojectBackBuffer = temp;
  }

  function swapGBuffer() {
    let temp = gBuffer;
    gBuffer = gBufferBack;
    gBufferBack = temp;
  }

  function setDemodulateAlbedo(value = true) {
    const val = Number(value && enableTemporalDenoise && enableSpatialDenoise);

    reprojectPass.setDemodulateAlbedo(val);
    svgfPass.setDemodulateAlbedo(val);
  }

  setDemodulateAlbedo(false);

  function setCameras(camera, lastCamera) {
    rayTracePass.setCamera(camera);
    gBufferPass.setCamera(camera);
    reprojectPass.setPreviousCamera(lastCamera);
    lastCamera.copy(camera);
  }

  function updateSeed(width, height, useJitter = true) {
    rayTracePass.setSize(width, height);
    rayTracePass.setFrameCount(setStrataCount);

    const jitterX = useJitter ? (Math.random() - 0.5) / width : 0;
    const jitterY = useJitter ? (Math.random() - 0.5) / height : 0;

    enableDenoise || rayTracePass.setJitter(jitterX, jitterY);

    if (setStrataCount === 0) {
      rayTracePass.setStrataCount(1);
    } else if (setStrataCount === numUniformSamples) {
      rayTracePass.setStrataCount(6);
    } else {
      rayTracePass.nextSeed();
    }
  }

  function areCamerasEqual(cam1, cam2) {
    return (
      numberArraysEqual(cam1.matrixWorld.elements, cam2.matrixWorld.elements) &&
      cam1.aspect === cam2.aspect &&
      cam1.fov === cam2.fov
    );
  }

  function clearBuffer(buffer) {
    buffer.bind();
    gl.clear(gl.COLOR_BUFFER_BIT);
    buffer.unbind();
  }

  function addSampleToBuffer(buffer, width, height) {
    buffer.bind();

    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    gl.viewport(0, 0, width, height);
    rayTracePass.draw();

    gl.disable(gl.BLEND);
    buffer.unbind();
  }

  function toneMapToScreen(lightTexture, lightScale) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    toneMapPass.draw({ light: lightTexture, lightScale });

    lastToneMappedTexture = lightTexture;
  }

  function spatialDenoiseToScreen(light) {
    let lightTexture = toneMapPass.draw({ light }, true);
    fxaaPass.draw({ light: lightTexture.color[0] });
  }

  function renderGBuffer() {
    gBuffer.bind();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, screenWidth, screenHeight);
    gBufferPass.draw();
    gBuffer.unbind();

    svgfPass.setGBuffers({
      position: gBuffer.color[0],
      normal: gBuffer.color[1],
      color: gBuffer.color[2],
    });
  }

  function denoiseToneMapToScreen() {
    if (enableTemporalDenoise) {
      reprojectBuffer.bind();

      gl.viewport(0, 0, screenWidth, screenHeight);
      reprojectPass.draw({
        light: hdrBuffer.color[0],
        position: gBuffer.color[0],
        color: gBuffer.color[2],
        previousLight: lastToneMappedTexture,
        previousPosition: gBufferBack.color[0],
        previousColor: gBufferBack.color[2],
        previousMomentLengthVariance: reprojectBackBuffer.color[1],
      });

      reprojectBuffer.unbind();

      if (!enableSpatialDenoise) {
        spatialDenoiseToScreen(reprojectBuffer.color[0]);
        lastToneMappedTexture = reprojectBuffer.color[0];
      }
    }

    if (enableSpatialDenoise)
      if (enableTemporalDenoise) {
        spatialDenoiseToScreen(
          svgfPass.draw({
            light: reprojectBuffer.color[0],
            reprojectData: reprojectBackBuffer.color[1],
          }).color[0]
        );

        lastToneMappedTexture = reprojectBuffer.color[0];
      } else {
        spatialDenoiseToScreen(
          svgfPass.draw({ light: hdrBuffer.color[0], reprojectData: null })
            .color[0]
        );

        lastToneMappedTexture = hdrBuffer.color[0];
      }
  }

  function renderTile(buffer, x, y, width, height) {
    gl.scissor(x, y, width, height);
    gl.enable(gl.SCISSOR_TEST);
    addSampleToBuffer(buffer, screenWidth, screenHeight);
    gl.disable(gl.SCISSOR_TEST);
  }

  function drawTile(draw = false) {
    const { x, y, tileWidth, tileHeight, isFirstTile, isLastTile } =
      tileRender.nextTile(elapsedFrameTime);

    if (isFirstTile) {
      if (0 === setStrataCount) {
        clearBuffer(hdrBuffer);
        reprojectPass.setPreviousCamera(lastCamera);
      }

      updateSeed(screenWidth, screenHeight, true);
      renderGBuffer();
      rayTracePass.bindTextures();
    }

    renderTile(hdrBuffer, x, y, tileWidth, tileHeight);

    if (draw && !isLastTile) {
      toneMapToScreen(hdrBuffer.color[0]);
    }

    if (isLastTile) {
      if (enableDenoise && (enableTemporalDenoise || enableSpatialDenoise)) {
        lastToneMappedTexture = hdrBuffer.color[0];
        denoiseToneMapToScreen();
        lastToneMappedTexture = hdrBuffer.color[0];
      } else {
        toneMapToScreen(hdrBuffer.color[0]);
      }

      swapReprojectBuffer();
      swapGBuffer();
      setStrataCount++;
      sampleRenderedCallback();
    }
  }

  function drawPreview() {
    let buffer, screenWidth, screenHeight;
    updateSeed(previewSize.width, previewSize.height, false);
    rayTracePass.bindTextures();

    buffer = hdrBuffer;

    screenWidth = previewSize.width;
    screenHeight = previewSize.height;

    buffer.bind();
    gl.viewport(0, 0, screenWidth, screenHeight);
    rayTracePass.draw();
    buffer.unbind();

    toneMapToScreen(hdrBuffer.color[0], previewSize.scale);
    clearBuffer(hdrBuffer);
  }

  function getDenoiseFactors() {
    return Object.assign(
      svgfPass.getDenoiseFactors(),
      reprojectPass.getDenoiseFactors()
    );
  }

  function draw(camera) {
    if (ready) {
      if (areCamerasEqual(camera, lastCamera)) {
        drawTile();
      } else {
        setCameras(camera, lastCamera);

        if (firstFrame) {
          firstFrame = false;
        } else if (movingDownsampling) {
          drawPreview();
        } else {
          drawTile(true);
        }

        setStrataCount = 0;
        tileRender.reset();
      }
    }
  }

  // debug draw call to measure performance
  // use full resolution buffers every frame
  // reproject every frame
  function fullDraw(camera) {
    if (ready) {
      // Shaders will read from the back buffer and draw to the front buffer
      // Buffers are swapped after every render
      swapGBuffer();
      swapReprojectBuffer();

      if (areCamerasEqual(camera, lastCamera)) {
        setStrataCount++;
      } else if (movingDownsampling) {
        setCameras(camera, lastCamera);
        setStrataCount = 0;

        return drawPreview();
      } else {
        // previous rendered image was a preview image
        setStrataCount = 0;
        clearBuffer(hdrBuffer);
      }

      setCameras(camera, lastCamera);

      updateSeed(screenWidth, screenHeight, true);

      renderGBuffer();

      rayTracePass.bindTextures();
      addSampleToBuffer(hdrBuffer, screenWidth, screenHeight);

      if (enableDenoise && (enableTemporalDenoise || enableSpatialDenoise)) {
        denoiseToneMapToScreen();
      } else {
        toneMapToScreen(hdrBuffer.color[0]);
      }

      sampleRenderedCallback();
    }
  }

  function setSize(width, height) {
    screenWidth = width;
    screenHeight = height;

    tileRender.setSize(width, height);
    previewSize.setSize(width, height);

    initFrameBuffers(width, height);

    svgfPass.setSize(width, height);
    toneMapPass.setSize(width, height);
    fxaaPass.setSize(width, height);

    firstFrame = true;
  }

  // called every frame to update clock
  function time(newTime) {
    elapsedFrameTime = newTime - frameTime;
    frameTime = newTime;
  }

  function reset() {
    setStrataCount = 0;
    tileRender.reset();

    clearBuffer(hdrBuffer);
    clearBuffer(reprojectBuffer);
    clearBuffer(reprojectBackBuffer);
  }

  const getTotalSamplesRendered = () => setStrataCount;

  function setfullSampleCallbackCallBack(cb) {
    sampleRenderedCallback = cb;
  }

  function updateBounces(bounces) {
    rayTracePass.updateBounces(bounces);
  }
  function updateEnvLight() {
    const decomposedScene = decomposeScene(scene, camera);
    rayTracePass.updateEnvLight(decomposedScene);
  }

  function updateMeshLight() {
    const decomposedScene = decomposeScene(scene, camera);
    rayTracePass.updateMeshLight(decomposedScene);
  }

  function setEnvMapIntensity(envMapIntensity) {
    rayTracePass.setEnvMapIntensity(envMapIntensity);
  }

  function setEnviromentVisible(enviromentVisible) {
    rayTracePass.setEnviromentVisible(enviromentVisible);
  }

  function setToneMapping(toneMapping) {
    toneMapPass.setToneMapping(toneMapping);
  }

  function setMovingDownsampling(downsampling) {
    movingDownsampling = downsampling;
  }

  function setDenoiseStatus(denoise) {
    enableDenoise = denoise;
  }

  function setTemporalDenoiseStatus(temporalDenoise) {
    enableTemporalDenoise = temporalDenoise;
    setDemodulateAlbedo();
  }

  function setDenoiseColorBlendFactor(value) {
    reprojectPass.setDenoiseColorBlendFactor(value);
  }

  function setDenoiseMomentBlendFactor(value) {
    reprojectPass.setDenoiseMomentBlendFactor(value);
  }

  function setSpatialDenoiseStatus(spatialDenoise) {
    enableSpatialDenoise = spatialDenoise;
    setDemodulateAlbedo();
  }

  function setDenoiseColorFactor(value) {
    svgfPass.setColorFactor(value);
  }

  function setDenoiseNormalFactor(value) {
    svgfPass.setNormalFactor(value);
  }

  function setDenoisePositionFactor(value) {
    svgfPass.setPositionFactor(value);
  }

  return {
    draw,
    fullDraw,
    setSize,
    time,
    reset,
    getTotalSamplesRendered,
    setfullSampleCallbackCallBack,
    updateBounces,
    updateEnvLight,
    updateMeshLight,
    setEnvMapIntensity,
    setEnviromentVisible,
    setToneMapping,
    setMovingDownsampling,
    setDenoiseStatus,
    setTemporalDenoiseStatus,
    setDenoiseColorBlendFactor,
    setDenoiseMomentBlendFactor,
    setSpatialDenoiseStatus,
    setDenoiseColorFactor,
    setDenoiseNormalFactor,
    setDenoisePositionFactor,
    getDenoiseFactors,
    setDemodulateAlbedo,
  };
}
