import { createBvh } from "./bvhCreation";
import { generateBackgroundMapFromSceneBackground } from "./envMapCreation";
import { envMapDistribution } from "./envMapDistribution";
import { makeRenderPass } from "./RenderPass";
import { makeStratifiedSamplerCombined } from "./StratifiedSamplerCombined";
import { makeTexture } from "./Texture";
import { clamp } from "./util";

import { fragment } from "./glsl/rayTrace";

export async function makeRayTracePass(
  gl,
  {
    bounces, // number of global illumination bounces
    decomposedScene,
    fullscreenQuad,
    materialBuffer,
    mergedMesh,
    optionalExtensions,
    envMapIntensity,
    enviromentVisible,
    useWorker,
    loadingCallback,
  }
) {
  const renderPass = await makeRenderPassFromScene({
    bounces,
    decomposedScene,
    fullscreenQuad,
    gl,
    materialBuffer,
    mergedMesh,
    optionalExtensions,
    useWorker,
    loadingCallback,
  });

  const samplingDimensions = [];
  let samples;

  function updateBounces(bounces) {
    samplingDimensions.length = 0;
    bounces = clamp(bounces, 2, 8);

    for (let i = 1; i <= bounces; i++) {
      // specular or diffuse reflection, light importance sampling, next path direction
      samplingDimensions.push(2, 2, 2, 2);
      if (i >= 2) {
        // russian roulette sampling
        // this step is skipped on the first bounce
        samplingDimensions.push(1);
      }
    }

    renderPass.setUniform("bounces", bounces);

    if (samples) {
      samples.strataCount = -1;
    }
  }

  function updateEnvLight(decomposedScene) {
    const { OES_texture_float_linear } = optionalExtensions;
    const { environment, isTextureEnv } = decomposedScene;

    if (isTextureEnv) {
      let envImage;

      if (environment.data?.isTexture) {
        envImage = generateBackgroundMapFromSceneBackground(environment);
      } else {
        console.warn(`No support environment type: ${environment.data}`);
      }

      if (envImage) {
        const envImageTextureObject = makeTexture(gl, {
          data: envImage.data,
          storage: envImage.dataFormat,
          minFilter: OES_texture_float_linear ? gl.LINEAR : gl.NEAREST,
          magFilter: OES_texture_float_linear ? gl.LINEAR : gl.NEAREST,
          width: envImage.width,
          height: envImage.height,
        });

        renderPass.setTexture("envMap", envImageTextureObject);

        const distribution = envMapDistribution(envImage);

        renderPass.setTexture(
          "envMapDistribution",
          makeTexture(gl, {
            data: distribution.data,
            storage: "float",
            width: distribution.width,
            height: distribution.height,
          })
        );
        renderPass.setUniform("envMapIntensity", envMapIntensity);
      }
    } else {
      const backgroundColor = environment.data;

      if (backgroundColor && backgroundColor.isColor) {
        renderPass.setUniform("backgroundColor", [
          backgroundColor.r,
          backgroundColor.g,
          backgroundColor.b,
        ]);
      } else {
        renderPass.setUniform("backgroundColor", [0, 0, 0]);
      }
    }

    setEnviromentVisible(enviromentVisible);
  }

  function updateMeshLight(decomposedScene) {
    const { meshLights } = decomposedScene;

    if (meshLights) {
      renderPass.setUniform("lights.position[0]", meshLights.position);
      renderPass.setUniform("lights.emission[0]", meshLights.emission);
      renderPass.setUniform("lights.p1[0]", meshLights.p1);
      renderPass.setUniform("lights.p2[0]", meshLights.p2);
      renderPass.setUniform("lights.params[0]", meshLights.params);
    }
  }

  function setEnviromentVisible(visibility) {
    renderPass.setUniform("enviromentVisible", Number(visibility));
  }

  function nextSeed() {
    renderPass.setUniform("stratifiedSamples[0]", samples.next());
  }

  function setEnvMapIntensity(intensity) {
    renderPass.setUniform("envMapIntensity", intensity);
  }

  function setStrataCount(strataCount) {
    if (strataCount > 1 && strataCount !== samples.strataCount) {
      // reinitailizing random has a performance cost. we can skip it if
      // * strataCount is 1, since a strataCount of 1 works with any sized StratifiedRandomCombined
      // * random already has the same strata count as desired
      samples = makeStratifiedSamplerCombined(strataCount, samplingDimensions);
    } else {
      samples.restart();
    }

    renderPass.setUniform("strataSize", 1 / strataCount);
    nextSeed();
  }

  function bindTextures() {
    renderPass.bindTextures();
  }

  function draw() {
    renderPass.useProgram(false), fullscreenQuad.draw();
  }

  function setSize(width, height) {
    renderPass.setUniform("pixelSize", 1 / width, 1 / height);
  }

  function setCamera(camera) {
    renderPass.setUniform("camera.transform", camera.matrixWorld.elements);
    renderPass.setUniform("camera.aspect", camera.aspect);
    renderPass.setUniform(
      "camera.fov",
      0.5 / Math.tan((0.5 * Math.PI * camera.fov) / 180)
    );
    if (camera.isLensCamera) {
      renderPass.setUniform("camera.aperture", camera.aperture);
      renderPass.setUniform("camera.focus", camera.focus);
    }
  }

  function setGBuffers({ position }) {
    renderPass.setTexture("gPosition", position);
  }

  // noiseImage is a 32-bit PNG image
  function setNoise(noiseImage) {
    renderPass.setTexture(
      "noiseTex",
      makeTexture(gl, {
        data: noiseImage,
        wrapS: gl.REPEAT,
        wrapT: gl.REPEAT,
        storage: "halfFloat",
      })
    );
  }

  function setJitter(x, y) {
    renderPass.setUniform("jitter", x, y);
  }

  function setFrameCount(frameCount) {
    renderPass.setUniform("frameCount", frameCount);
  }

  updateBounces(bounces);
  updateEnvLight(decomposedScene);
  updateMeshLight(decomposedScene);

  samples = makeStratifiedSamplerCombined(1, samplingDimensions);

  return {
    bindTextures,
    draw,
    outputLocs: renderPass.outputLocs,
    textures: renderPass.textures,
    setSize,
    setCamera,
    setGBuffers,
    setNoise,
    setJitter,
    setFrameCount,
    setStrataCount,
    nextSeed,
    setEnvMapIntensity,
    setEnviromentVisible,
    updateBounces,
    updateEnvLight,
    updateMeshLight,
  };
}

async function makeRenderPassFromScene({
  decomposedScene,
  fullscreenQuad,
  gl,
  materialBuffer,
  mergedMesh,
  optionalExtensions,
  useWorker,
  loadingCallback,
}) {
  const { OES_texture_float_linear } = optionalExtensions,
    { camera, meshLightsNum, isTextureEnv } = decomposedScene,
    { geometry /*, materials */ } = mergedMesh;

  if ("function" == typeof loadingCallback?.onProgress) {
    loadingCallback.onProgress("Building BVH...");
  }

  // create bounding volume hierarchy from a static scene
  const flattenedBvh = await createBvh(geometry, useWorker);
  const numTris = geometry.index.count / 3;

  const renderPass = makeRenderPass(gl, {
    defines: {
      OES_texture_float_linear,
      BVH_COLUMNS: textureDimensionsFromArray(flattenedBvh.count).columnsLog,
      INDEX_COLUMNS: textureDimensionsFromArray(numTris).columnsLog,
      VERTEX_COLUMNS: textureDimensionsFromArray(
        geometry.attributes.position.count
      ).columnsLog,
      STACK_SIZE: flattenedBvh.maxDepth,
      USE_LENS_CAMERA: camera.isLensCamera,
      NUM_LIGHTS: meshLightsNum,
      CONST_COLOR_ENV: !isTextureEnv,
      ...materialBuffer.defines,
    },
    fragment,
    vertex: fullscreenQuad.vertexShader,
  });

  renderPass.setTexture("diffuseMap", materialBuffer.textures.diffuseMap);

  renderPass.setTexture("normalMap", materialBuffer.textures.normalMap);

  renderPass.setTexture("pbrMap", materialBuffer.textures.pbrMap);

  renderPass.setTexture("pbrSGMap", materialBuffer.textures.pbrSGMap);

  if (materialBuffer.textures.emissiveMap) {
    renderPass.setTexture("emissiveMap", materialBuffer.textures.emissiveMap);
  }

  renderPass.setTexture(
    "positionBuffer",
    makeDataTexture(gl, geometry.getAttribute("position").array, 3)
  );

  renderPass.setTexture(
    "normalBuffer",
    makeDataTexture(gl, geometry.getAttribute("normal").array, 3)
  );

  renderPass.setTexture(
    "uvBuffer",
    makeDataTexture(gl, geometry.getAttribute("uv").array, 2)
  );

  renderPass.setTexture(
    "bvhBuffer",
    makeDataTexture(gl, flattenedBvh.buffer, 4)
  );

  return renderPass;
}

function textureDimensionsFromArray(count) {
  const columnsLog = Math.round(Math.log2(Math.sqrt(count)));
  const columns = 2 ** columnsLog;
  const rows = Math.ceil(count / columns);
  return {
    columnsLog,
    columns,
    rows,
    size: rows * columns,
  };
}

function makeDataTexture(gl, dataArray, channels) {
  const textureDim = textureDimensionsFromArray(dataArray.length / channels);
  return makeTexture(gl, {
    data: padArray(dataArray, channels * textureDim.size),
    width: textureDim.columns,
    height: textureDim.rows,
  });
}

// expand array to the given length
function padArray(typedArray, length) {
  const newArray = new typedArray.constructor(length);
  newArray.set(typedArray);
  return newArray;
}
