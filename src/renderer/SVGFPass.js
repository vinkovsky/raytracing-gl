import { makeRenderPass } from "./RenderPass";
import { makeFramebuffer } from "./FrameBuffer";
import { makeTexture } from "./Texture";

import { fragment } from "./glsl/svgf";

export function makeSVGFPass(gl, params) {
  const { fullscreenQuad } = params;

  let SVGFBuffer;
  let SVGFBufferBack;

  let colorFactor = 0.5;
  let normalFactor = 0.2;
  let positionFactor = 0.35;

  function swapSVGFBuffer() {
    let temp = SVGFBuffer;
    SVGFBuffer = SVGFBufferBack;
    SVGFBufferBack = temp;
  }

  const renderPassConfig = {
    gl,
    vertex: fullscreenQuad.vertexShader,
    fragment,
  };

  const renderPass = makeRenderPass(gl, renderPassConfig);

  function draw(params) {
    let { light, reprojectData } = params;

    for (let i = 0; i < 3; i++) {
      renderPass.setUniform("level", i);
      renderPass.setUniform("colorFactor", (1 / (1 << i)) * colorFactor);
      renderPass.setUniform("normalFactor", (1 / (1 << i)) * normalFactor);
      renderPass.setUniform("positionFactor", (1 / (1 << i)) * positionFactor);

      renderPass.setUniform("stepwidth", (1 << (i + 1)) - 1);

      if (i === 0) {
        renderPass.setTexture("lightTex", light);
      } else {
        renderPass.setTexture("lightTex", SVGFBufferBack.color[0]);
      }

      if (reprojectData) {
        renderPass.setUniform("useMomentVariance", 1);
        renderPass.setTexture("reprojectDataTex", reprojectData);
      } else {
        renderPass.setUniform("useMomentVariance", 0);
        renderPass.setTexture("reprojectDataTex", null);
      }

      SVGFBuffer.bind();

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderPass.useProgram();
      fullscreenQuad.draw();

      SVGFBuffer.unbind();

      swapSVGFBuffer();
    }

    return SVGFBufferBack;
  }

  function setGBuffers({ position, normal, color }) {
    renderPass.setTexture("gPosition", position);
    renderPass.setTexture("gNormal", normal);
    renderPass.setTexture("gColor", color);
  }

  function setColorFactor(value) {
    colorFactor = value;
  }

  function setNormalFactor(value) {
    normalFactor = value;
  }

  function setPositionFactor(value) {
    positionFactor = value;
  }

  function setDemodulateAlbedo(value) {
    renderPass.setUniform("demodulateAlbedo", value);
  }

  function getDenoiseFactors() {
    return {
      colorFactor,
      normalFactor,
      positionFactor,
    };
  }

  function initFrameBuffer(width, height) {
    const makeSVGFBuffer = () =>
      makeFramebuffer(gl, {
        color: {
          0: makeTexture(gl, {
            width,
            height,
            storage: "float",
            magFilter: gl.NEAREST,
            minFilter: gl.NEAREST,
          }),
        },
      });

    SVGFBuffer = makeSVGFBuffer();
    SVGFBufferBack = makeSVGFBuffer();
  }

  function setSize(width, height) {
    initFrameBuffer(width, height);
  }

  return {
    draw,
    setGBuffers,
    setColorFactor,
    setNormalFactor,
    setPositionFactor,
    setDemodulateAlbedo,
    getDenoiseFactors,
    setSize,
  };
}
