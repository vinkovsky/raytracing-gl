import { Matrix4 } from "three";

import { makeRenderPass } from "./RenderPass";

import fragment from "./glsl/reproject.frag";

export function makeReprojectPass(e, params) {
  const { fullscreenQuad, maxReprojectedSamples } = params;

  let colorBlendFactor = 0.2;
  let momentBlendFactor = 0.2;

  const renderPass = makeRenderPass(e, {
    defines: { MAX_SAMPLES: maxReprojectedSamples.toFixed(1) },
    vertex: fullscreenQuad.vertexShader,
    fragment,
  });

  const historyCamera = new Matrix4();

  function setPreviousCamera(camera) {
    historyCamera.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    renderPass.setUniform("historyCamera", historyCamera.elements);
  }

  function draw(params) {
    const {
      light,
      position,
      color,
      previousColor,
      previousLight,
      previousPosition,
      previousMomentLengthVariance,
    } = params;

    renderPass.setTexture("lightTex", light);
    renderPass.setTexture("positionTex", position);
    renderPass.setTexture("colorTex", color);
    renderPass.setTexture("previousLightTex", previousLight);
    renderPass.setTexture("previousPositionTex", previousPosition);
    renderPass.setTexture("previousColorTex", previousColor);
    renderPass.setTexture(
      "previousMomentLengthVarianceTex",
      previousMomentLengthVariance
    );

    renderPass.setUniform("colorBlendFactor", colorBlendFactor);
    renderPass.setUniform("momentBlendFactor", momentBlendFactor);

    renderPass.useProgram();
    fullscreenQuad.draw();
  }

  function setJitter(x, y) {
    renderPass.setUniform("jitter", x, y);
  }

  function setDenoiseColorBlendFactor(value) {
    colorBlendFactor = value;
  }

  function setDenoiseMomentBlendFactor(value) {
    momentBlendFactor = value;
  }

  function setDemodulateAlbedo(value) {
    renderPass.setUniform("demodulateAlbedo", value);
  }

  function getDenoiseFactors() {
    return {
      colorBlendFactor,
      momentBlendFactor,
    };
  }

  return {
    draw,
    setJitter,
    setPreviousCamera,
    setDenoiseColorBlendFactor,
    setDenoiseMomentBlendFactor,
    setDemodulateAlbedo,
    getDenoiseFactors,
  };
}
