import * as THREE from "three";

import { makeRenderPass } from "./RenderPass";
import { makeFramebuffer } from "./FrameBuffer";
import { makeTexture } from "./Texture";

import { fragment } from "./glsl/toneMap";

const toneMapFunctions = {
  [THREE.LinearToneMapping]: 0,
  [THREE.ACESFilmicToneMapping]: 1,
  [THREE.ReinhardToneMapping]: 2,
  [THREE.CineonToneMapping]: 3,
};

export function makeToneMapPass(gl, params) {
  const { fullscreenQuad, toneMapping } = params;

  let frameBuffer;

  const renderPassConfig = {
    gl,
    vertex: fullscreenQuad.vertexShader,
    fragment,
  };

  const renderPass = makeRenderPass(gl, renderPassConfig);

  renderPass.setUniform("toneMappingFun", toneMapFunctions[toneMapping]);

  const defaultLightScale = new THREE.Vector2(1, 1);

  function draw(params, isDraw) {
    let { light, lightScale } = params;

    lightScale = lightScale || defaultLightScale;
    renderPass.setTexture("lightTex", light);
    renderPass.setUniform("lightScale", lightScale.x, lightScale.y);

    if (isDraw) {
      frameBuffer.bind();
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderPass.useProgram();
      fullscreenQuad.draw();
      frameBuffer.unbind();

      return frameBuffer;
    }

    renderPass.useProgram();
    fullscreenQuad.draw();
  }

  function setToneMapping(toneMapIndex) {
    renderPass.setUniform("toneMappingFun", toneMapFunctions[toneMapIndex]);
  }

  function setSize(width, height) {
    frameBuffer = makeFramebuffer(gl, {
      color: {
        0: makeTexture(gl, {
          width,
          height,
          storage: "byte",
          magFilter: gl.LINEAR,
          minFilter: gl.LINEAR,
        }),
      },
    });
  }

  return {
    draw,
    setToneMapping,
    setSize,
  };
}
