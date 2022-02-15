import { makeRenderPass } from "./RenderPass";

import { fragment } from "./glsl/fxaa";

export function makeFXAAPass(gl, params) {
  const { fullscreenQuad } = params;

  const renderPass = makeRenderPass(gl, {
    gl,
    vertex: fullscreenQuad.vertexShader,
    fragment,
  });

  function draw(params) {
    let { light } = params;

    renderPass.setTexture("inputBuffer", light);
    renderPass.useProgram();
    fullscreenQuad.draw();
  }

  function setSize(width, height) {
    renderPass.setUniform("resolution", 1 / width, 1 / height);
  }

  return {
    draw,
    setSize,
  };
}
