import * as THREE from "../modules/three.js";

//fullscreenQuad.vert
var fullscreenQuad = {
  source: `
      layout(location = 0) in vec2 a_position;

      out vec2 vCoord;

      void main() {
        vCoord = a_position;
        gl_Position = vec4(2. * a_position - 1., 0, 1);
      }
      `,
};

//glUtils
function loadExtensions(gl, extensions) {
  const supported = {};
  for (const name of extensions) supported[name] = gl.getExtension(name);
  return supported;
}

function getAttributes(gl, program) {
  const attributes = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < count; i++) {
    const { name } = gl.getActiveAttrib(program, i);
    if (name) {
      attributes[name] = gl.getAttribLocation(program, name);
    }
  }
  return attributes;
}

function getUniforms(gl, program) {
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const { name, type } = gl.getActiveUniform(program, i);
    const location = gl.getUniformLocation(program, name);
    if (location) {
      uniforms[name] = { type, location };
    }
  }
  return uniforms;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);

  if (success) {
    return shader;
  }

  const output = source
    .split("\n")
    .map((x, i) => `${i + 1}: ${x}`)
    .join("\n");

  throw (console.log(output), gl.getShaderInfoLog(shader));
}

function createProgram(
  gl,
  vertexShader,
  fragmentShader,
  transformVaryings,
  transformBufferMode
) {
  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  if (transformVaryings) {
    gl.transformFeedbackVaryings(
      program,
      transformVaryings,
      transformBufferMode
    );
  }

  gl.linkProgram(program);

  gl.detachShader(program, vertexShader);
  gl.detachShader(program, fragmentShader);

  const success = gl.getProgramParameter(program, gl.LINK_STATUS);

  if (success) {
    return program;
  }

  throw gl.getProgramInfoLog(program);
}

//RayTracingRenderer
const glRequiredExtensions = ["EXT_color_buffer_float", "EXT_float_blend"];
const glOptionalExtensions = ["OES_texture_float_linear"];

//FrameBuffer
function makeFramebuffer(gl, { color, depth }) {
  const framebuffer = gl.createFramebuffer();

  function bind() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  }
  function unbind() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function init() {
    bind();

    const drawBuffers = [];

    for (let location in color) {
      location = Number(location);

      if (location === undefined) {
        console.error("invalid location");
      }

      const tex = color[location];

      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0 + location,
        tex.target,
        tex.texture,
        0
      ),
        drawBuffers.push(gl.COLOR_ATTACHMENT0 + location);
    }

    gl.drawBuffers(drawBuffers);
    if (depth) {
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        depth.target,
        depth.texture
      );
    }
    unbind();
  }

  init();

  return { color, bind, unbind };
}

//UniformSetter
function glName(numComponents, type) {
  return {
    values: `uniform${numComponents}${type}`,
    array: `uniform${numComponents}${type}v`,
  };
}

function glNameMatrix(rows, columns) {
  return {
    matrix:
      rows === columns
        ? `uniformMatrix${rows}fv`
        : `uniformMatrix${rows}x${columns}fv`,
  };
}

let typeMap;

function initTypeMap(gl) {
  return {
    [gl.FLOAT]: glName(1, "f"),
    [gl.FLOAT_VEC2]: glName(2, "f"),
    [gl.FLOAT_VEC3]: glName(3, "f"),
    [gl.FLOAT_VEC4]: glName(4, "f"),
    [gl.INT]: glName(1, "i"),
    [gl.INT_VEC2]: glName(2, "i"),
    [gl.INT_VEC3]: glName(3, "i"),
    [gl.INT_VEC4]: glName(4, "i"),
    [gl.SAMPLER_2D]: glName(1, "i"),
    [gl.SAMPLER_2D_ARRAY]: glName(1, "i"),
    [gl.FLOAT_MAT2]: glNameMatrix(2, 2),
    [gl.FLOAT_MAT3]: glNameMatrix(3, 3),
    [gl.FLOAT_MAT4]: glNameMatrix(4, 4),
  };
}

function makeUniformSetter(gl, program) {
  const uniformInfo = getUniforms(gl, program);
  const uniforms = {};
  const needsUpload = [];

  for (let name in uniformInfo) {
    const { type, location } = uniformInfo[name];

    const uniform = {
      type,
      location,
      v0: 0,
      v1: 0,
      v2: 0,
      v3: 0,
    };

    uniforms[name] = uniform;
  }

  const failedUnis = new Set();

  function setUniform(name, v0, v1, v2, v3) {
    // v0 - v4 are the values to be passed to the uniform
    // v0 can either be a number or an array, and v1-v3 are optional
    const uni = uniforms[name];

    if (uni) {
      uni.v0 = v0;
      uni.v1 = v1;
      uni.v2 = v2;
      uni.v3 = v3;
      needsUpload.push(uni);
    } else {
      failedUnis.has(name) || failedUnis.add(name);
    }
  }

  typeMap = typeMap || initTypeMap(gl);

  function upload() {
    while (needsUpload.length > 0) {
      const { type, location, v0, v1, v2, v3 } = needsUpload.pop();
      const glMethod = typeMap[type];

      if (v0.length) {
        if (glMethod.matrix) {
          const array = v0;
          const transpose = v1 || false;
          gl[glMethod.matrix](location, transpose, array);
        } else {
          gl[glMethod.array](location, v0);
        }
      } else {
        gl[glMethod.values](location, v0, v1, v2, v3);
      }
    }
  }

  return {
    setUniform,
    upload,
  };
}

// RenderPass
function getOutputLocations(outputs) {
  let locations = {};

  for (let i = 0; i < outputs.length; i++) {
    locations[outputs[i]] = i;
  }

  return locations;
}

function addDefines(defines) {
  let str = "";

  for (const name in defines) {
    const value = defines[name];

    // don't define falsy values such as false, 0, and ''.
    // this adds support for #ifdef on falsy values
    if (value) {
      str += `#define ${name} ${value}\n`;
    }
  }

  return str;
}

function addOutputs(outputs) {
  let str = "";
  const locations = getOutputLocations(outputs);

  for (let name in locations) {
    const location = locations[name];
    str += `layout(location = ${location}) out vec4 out_${name};\n`;
  }
  return str;
}

function addIncludes(includes, defines) {
  let str = "";

  for (let include of includes) {
    if (typeof include === "function") {
      str += include(defines);
    } else {
      str += include;
    }
  }

  return str;
}

function makeShaderStage(gl, type, shader, defines) {
  let str =
    "#version 300 es\nprecision mediump float;\nprecision mediump int;\nprecision lowp isampler2D;\n";

  if (defines) {
    str += addDefines(defines);
  }

  if (type === gl.FRAGMENT_SHADER && shader.outputs) {
    str += addOutputs(shader.outputs);
  }

  if (shader.includes) {
    str += addIncludes(shader.includes, defines);
  }

  if (typeof shader.source === "function") {
    str += shader.source(defines);
  } else {
    str += shader.source;
  }

  return compileShader(gl, type, str);
}

function makeVertexShader(gl, { defines, vertex }) {
  return makeShaderStage(gl, gl.VERTEX_SHADER, vertex, defines);
}

function makeFragmentShader(gl, { defines, fragment }) {
  return makeShaderStage(gl, gl.FRAGMENT_SHADER, fragment, defines);
}

function makeRenderPassFromProgram(gl, program) {
  const uniformSetter = makeUniformSetter(gl, program);

  const textures = {};
  let nextTexUnit = 1;

  function setTexture(name, texture) {
    if (texture) {
      if (textures[name]) {
        textures[name].tex = texture;
      } else {
        const unit = nextTexUnit++;
        uniformSetter.setUniform(name, unit);
        textures[name] = { unit, tex: texture };
      }
    }
  }

  function bindTextures() {
    for (let name in textures) {
      const { tex, unit } = textures[name];
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(tex.target, tex.texture);
    }
  }

  function useProgram(autoBindTextures = true) {
    gl.useProgram(program);
    uniformSetter.upload();
    if (autoBindTextures) {
      bindTextures();
    }
  }

  return {
    attribLocs: getAttributes(gl, program),
    bindTextures,
    program,
    setTexture,
    setUniform: uniformSetter.setUniform,
    textures,
    useProgram,
  };
}

function makeRenderPass(gl, params) {
  const { fragment, vertex } = params;
  const vertexCompiled =
    vertex instanceof WebGLShader ? vertex : makeVertexShader(gl, params);
  const fragmentCompiled =
    fragment instanceof WebGLShader ? fragment : makeFragmentShader(gl, params);

  const program = createProgram(gl, vertexCompiled, fragmentCompiled);

  return {
    ...makeRenderPassFromProgram(gl, program),
    outputLocs: fragment.outputs ? getOutputLocations(fragment.outputs) : {},
  };
}

//util
function clamp(x, min, max) {
  return Math.min(Math.max(x, min), max);
}

//Texture
function getFormat(gl, channels) {
  const map = {
    1: gl.RED,
    2: gl.RG,
    3: gl.RGB,
    4: gl.RGBA,
  };
  return map[channels];
}

function getTextureFormat(gl, channels, storage, data, gammaCorrection) {
  let type;
  let internalFormat;

  const isByteArray =
    data instanceof Uint8Array ||
    data instanceof HTMLImageElement ||
    data instanceof HTMLCanvasElement ||
    data instanceof ImageData ||
    data instanceof ImageBitmap;

  const isFloatArray = data instanceof Float32Array;

  if (storage === "byte" || (!storage && isByteArray)) {
    internalFormat = {
      1: gl.R8,
      2: gl.RG8,
      3: gammaCorrection ? gl.SRGB8 : gl.RGB8,
      4: gammaCorrection ? gl.SRGB8_ALPHA8 : gl.RGBA8,
    }[channels];

    type = gl.UNSIGNED_BYTE;
  } else if (storage === "float" || (!storage && isFloatArray)) {
    internalFormat = {
      1: gl.R32F,
      2: gl.RG32F,
      3: gl.RGB32F,
      4: gl.RGBA32F,
    }[channels];

    type = gl.FLOAT;
  } else if (storage === "halfFloat") {
    internalFormat = {
      1: gl.R16F,
      2: gl.RG16F,
      3: gl.RGB16F,
      4: gl.RGBA16F,
    }[channels];

    type = gl.HALF_FLOAT;
  } else if (storage === "snorm") {
    internalFormat = {
      1: gl.R8_SNORM,
      2: gl.RG8_SNORM,
      3: gl.RGB8_SNORM,
      4: gl.RGBA8_SNORM,
    }[channels];

    type = gl.UNSIGNED_BYTE;
  }

  const format = getFormat(gl, channels);

  return { format, internalFormat, type };
}

function makeTexture(gl, params) {
  let {
    width = null,
    height = null,

    // A single HTMLImageElement, ImageData, or TypedArray,
    // Or an array of any of these objects. In this case an Array Texture will be created
    data = null,

    // If greater than 1, create an Array Texture of this length
    length = 1,

    // Number of channels, [1-4]. If left blank, the the function will decide the number of channels automatically from the data
    channels = null,

    // Either 'byte' or 'float'
    // If left empty, the function will decide the format automatically from the data
    storage = null,

    // Reverse the texture across the y-axis.
    flipY = false,

    // sampling properties
    gammaCorrection = false,
    wrapS = gl.CLAMP_TO_EDGE,
    wrapT = gl.CLAMP_TO_EDGE,
    minFilter = gl.NEAREST,
    magFilter = gl.NEAREST,
  } = params;

  width = width || data.width || 0;
  height = height || data.height || 0;

  const texture = gl.createTexture();

  let target;
  let dataArray;

  // if data is a JS array but not a TypedArray, assume data is an array of images and create a GL Array Texture
  if (Array.isArray(data)) {
    dataArray = data;
    data = dataArray[0];
  }

  target = dataArray || length > 1 ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(target, texture);

  gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrapS);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrapT);
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, magFilter);

  if (!channels) {
    if (data && data.length) {
      channels = data.length / (width * height); // infer number of channels from data size
    } else {
      channels = 4;
    }
  }

  channels = clamp(channels, 1, 4);

  const { type, format, internalFormat } = getTextureFormat(
    gl,
    channels,
    storage,
    data,
    gammaCorrection
  );

  if (dataArray) {
    gl.texStorage3D(target, 1, internalFormat, width, height, dataArray.length);
    for (let i = 0; i < dataArray.length; i++) {
      // if layer is an HTMLImageElement, use the .width and .height properties of each layer
      // otherwise use the max size of the array texture
      const layerWidth = dataArray[i].width || width;
      const layerHeight = dataArray[i].height || height;

      gl.pixelStorei(
        gl.UNPACK_FLIP_Y_WEBGL,
        Array.isArray(flipY) ? flipY[i] : flipY
      ),
        gl.texSubImage3D(
          target,
          0,
          0,
          0,
          i,
          layerWidth,
          layerHeight,
          1,
          format,
          type,
          dataArray[i]
        );
    }
  } else if (length > 1) {
    // create empty array texture
    gl.texStorage3D(target, 1, internalFormat, width, height, length);
  } else {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
    gl.texStorage2D(target, 1, internalFormat, width, height);

    if (data) {
      gl.texSubImage2D(target, 0, 0, 0, width, height, format, type, data);
    }
  }
  // return state to default
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  return { target, texture };
}

// class RayTracingMaterial extends THREE.Material {
//   constructor() {
//     super();
//     this.materialType = null;
//     this.isRayTracingMaterial = true;
//   }

//   copy(source) {
//     super.copy(source);
//     this.materialType = source.materialType;
//     this.isRayTracingMaterial = source.isRayTracingMaterial;
//   }
// }

//RayTracingMaterial
class RayTracingMaterial extends THREE.Material {
  constructor(parameters) {
    super();

    this.materialType = "RayTracingMaterial";
    this.isRayTracingMaterial = true;

    this.workflow = "Metalness";
    this.color = new THREE.Color(16777215);
    this.roughness = 0.5;
    this.metalness = 0;
    this.map = null;
    this.emissive = new THREE.Color(0);
    this.emissiveMap = null;
    this.normalMap = null;
    this.normalScale = new THREE.Vector2(1, 1);
    this.roughnessMap = null;
    this.metalnessMap = null;
    this.specularTint = 0;
    this.sheen = 0;
    this.sheenTint = 0.5;
    this.clearcoat = 0;
    this.clearcoatRoughness = 0;
    this.subsurface = 0;
    this.alpha = 1;
    this.ior = 1.5;
    this.transmission = 0;
    this.atDistance = 1;
    this.extinction = new THREE.Color(16777215);
    this.anisotropic = 0;
    this.specularColor = new THREE.Color(16777215);
    this.glossiness = 1;
    this.specularMap = null;
    this.glossinessMap = null;

    this.setValues(parameters);
  }

  copy(source) {
    this.materialType = source.materialType;
    this.isRayTracingMaterial = source.isRayTracingMaterial;
    this.color = new THREE.Color().copy(source.color);
    this.roughness = source.roughness;
    this.metalness = source.metalness;
    this.map = source.map;
    this.emissive = new THREE.Color().copy(source.emissive);
    this.emissiveMap = source.emissiveMap;
    this.normalMap = source.normalMap;
    this.normalScale = new THREE.Vector2().copy(source.normalScale);
    this.roughnessMap = source.roughnessMap;
    this.metalnessMap = source.metalnessMap;
    this.specularTint = source.specularTint;
    this.sheen = source.sheen;
    this.sheenTint = source.sheenTint;
    this.clearcoat = source.clearcoat;
    this.clearcoatRoughness = source.clearcoatRoughness;
    this.subsurface = source.subsurface;
    this.transmission = source.transmission;
    this.ior = source.ior;
    this.atDistance = source.atDistance;
    this.anisotropic = source.anisotropic;
    this.extinction = new THREE.Color().copy(source.extinction);
    this.alpha = source.alpha;

    return this;
  }

  clone() {
    return new this.constructor().copy(this);
  }

  fromBasicMaterial(source) {
    const RayTracingMaterial = new this.constructor();

    RayTracingMaterial.name = source.name;

    if (source.color) {
      RayTracingMaterial.color.copy(source.color);
    }
    if (source.map) {
      RayTracingMaterial.map = source.map;
    }

    return RayTracingMaterial;
  }

  fromStandardMaterial(source) {
    const RayTracingMaterial = new this.constructor();

    RayTracingMaterial.name = source.name;
    RayTracingMaterial.color.copy(source.color);
    RayTracingMaterial.roughness = source.roughness;
    RayTracingMaterial.metalness = source.metalness;
    RayTracingMaterial.transmission = source.transmission || 0;
    RayTracingMaterial.ior = source.ior || 1.5;
    RayTracingMaterial.clearcoat = source.clearcoat || 0;
    RayTracingMaterial.clearcoatRoughness = source.clearcoatRoughness || 0;
    RayTracingMaterial.sheen = source.sheen || 0;
    RayTracingMaterial.sheenTint = source.sheenTint || 0.5;
    RayTracingMaterial.alpha = source.opacity;
    RayTracingMaterial.map = source.map;
    RayTracingMaterial.emissive.copy(source.emissive);
    RayTracingMaterial.emissiveMap = source.emissiveMap;
    RayTracingMaterial.normalMap = source.normalMap;
    RayTracingMaterial.normalScale.copy(source.normalScale);
    RayTracingMaterial.roughnessMap = source.roughnessMap;
    RayTracingMaterial.metalnessMap = source.metalnessMap;

    if (source.isGLTFSpecularGlossinessMaterial) {
      RayTracingMaterial.workflow = "Specular";
      RayTracingMaterial.specularColor.copy(source.specular);
      RayTracingMaterial.glossiness = source.glossiness;
      RayTracingMaterial.specularMap = source.specularMap;
      RayTracingMaterial.glossinessMap = source.glossinessMap;
    }

    return RayTracingMaterial;
  }
}

//MaterialBuffer
function interleave(...arrays) {
  let maxLength = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    const l = a.data ? a.data.length / a.channels : 0;
    maxLength = Math.max(maxLength, l);
  }

  const interleaved = [];

  for (let i = 0; i < maxLength; i++) {
    for (let j = 0; j < arrays.length; j++) {
      const { data = [], channels } = arrays[j];

      for (let c = 0; c < channels; c++) {
        interleaved.push(data[i * channels + c]);
      }
    }
  }

  return interleaved;
}

function mergeLightsFromScene(lights) {
  const light = {};

  light.position = lights.map((l) => l.position);
  light.emission = lights.map((l) => l.emission);
  light.p1 = lights.map((l) => l.p1);
  light.p2 = lights.map((l) => l.p2);
  light.radius = lights.map((l) => l.radius);
  light.area = lights.map((l) => l.area);
  light.type = lights.map((l) => l.type);
  light.visible = lights.map((l) => l.visible);
  light.position = [].concat(...light.position.map((l) => l.toArray()));
  light.emission = [].concat(...light.emission.map((l) => l.toArray()));
  light.p1 = [].concat(...light.p1.map((l) => l.toArray()));
  light.p2 = [].concat(...light.p2.map((l) => l.toArray()));
  light.params = interleave(
    { data: light.radius, channels: 1 },
    { data: light.area, channels: 1 },
    { data: light.type, channels: 1 },
    { data: light.visible, channels: 1 }
  );

  return light;
}

function decomposeScene(scene, camera) {
  const meshes = [];
  const lights = [];

  scene.traverse((child) => {
    if (child.isMesh) {
      if (!child.geometry) {
        console.warn(child, "must have a geometry property.");
      } else if (!child.material) {
        console.warn(child, "must have a material property.");
      } else {
        if (child.material.isMeshStandardMaterial) {
          child.material = new RayTracingMaterial().fromStandardMaterial(
            child.material
          );
        } else {
          child.material.isRayTracingMaterial ||
            (child.material = new RayTracingMaterial().fromBasicMaterial(
              child.material
            ));
        }
        meshes.push(child);
      }
    } else if (child.isLight) {
      lights.push(child);
    }
  });

  const environment = {
    data: scene.environment,
    intensity: scene.envMapIntensity || 1,
  };
  const isTextureEnv = environment.data && environment.data.isTexture;
  const meshLightsNum = lights.length || 0;

  let meshLights = null;

  if (meshLightsNum) {
    // This function looks very cumbersome

    meshLights = mergeLightsFromScene(
      lights.map((light) => {
        const meshLight = {};

        meshLight.position = light.position;
        meshLight.emission = light.color.multiplyScalar(light.intensity);
        meshLight.radius = light.radius || 0;
        meshLight.area = 0;
        meshLight.visible = Number(light.visible);
        meshLight.p1 = new THREE.Vector3();
        meshLight.p2 = new THREE.Vector3();

        switch (light.type) {
          case "RectAreaLight":
            meshLight.type = 0;

            if (light.width && light.height) {
              const planeGeometry = new THREE.PlaneGeometry(
                light.width,
                light.height
              );

              const targetPosition = new THREE.Vector3();

              if (light.target) {
                targetPosition.copy(light.target);
              }

              const planeGeometryPosition = new THREE.Vector3().subVectors(
                light.position,
                targetPosition
              );

              const lookAtPosition = new THREE.Vector3()
                .copy(planeGeometryPosition)
                .negate();

              planeGeometry.lookAt(lookAtPosition);

              const positionAttributes =
                planeGeometry.attributes.position.array;

              const v1 = new THREE.Vector3(
                positionAttributes[0],
                positionAttributes[1],
                positionAttributes[2]
              ).add(light.position);

              // Unused v2 vertex

              // const v2 = new THREE.Vector3(
              //   positionAttributes[3],
              //   positionAttributes[4],
              //   positionAttributes[5]
              // ).add(light.position);

              const v3 = new THREE.Vector3(
                positionAttributes[6],
                positionAttributes[7],
                positionAttributes[8]
              ).add(light.position);

              const v4 = new THREE.Vector3(
                positionAttributes[9],
                positionAttributes[10],
                positionAttributes[11]
              ).add(light.position);

              meshLight.position.copy(v3);

              meshLight.p1 = v4.sub(v3);
              meshLight.p2 = v1.sub(v3);
              meshLight.area = new THREE.Vector3()
                .crossVectors(meshLight.p1, meshLight.p2)
                .length();
            }
            break;
          // Works like RectAreaLight without target but
          // i have no idea wtf this is for

          case "QuadLight":
            meshLight.type = 1;
            meshLight.p1 = light.v1.sub(light.position);
            meshLight.p2 = light.v2.sub(light.position);
            meshLight.area = new THREE.Vector3()
              .crossVectors(meshLight.p1, meshLight.p2)
              .length();
            break;
          case "SphereAreaLight":
            meshLight.type = 2;
            meshLight.area = 4 * Math.PI * light.radius ** 2;
            break;
          case "PointLight":
            meshLight.type = 4;
            meshLight.area = 0;
            break;
          case "DirectionalLight":
            meshLight.type = 3;
            if (light.target) {
              meshLight.p1.copy(light.target);
            }
            meshLight.area = 0;
            break;
          default:
            console.warn(`Unsupported lighting type: ${light.type}.`);
        }

        return meshLight;
      })
    );
  }

  return {
    environment,
    isTextureEnv,
    camera,
    meshes,
    meshLights,
    meshLightsNum,
  };
}

// mergeMeshesToGeometry

// Similar to buffergeometry.clone(), except we only copy
// specific attributes instead of everything

function cloneBufferGeometry(bufferGeometry, attributes) {
  const newGeometry = new THREE.BufferGeometry();

  for (const name of attributes) {
    const attrib = bufferGeometry.getAttribute(name);

    if (attrib) {
      //.addAttribute() has been renamed to .setAttribute()

      if (typeof newGeometry.setAttribute !== "function") {
        newGeometry.setAttribute = newGeometry.addAttribute;
      }

      newGeometry.setAttribute(name, attrib.clone());
    }
  }

  const index = bufferGeometry.getIndex();

  if (index) {
    newGeometry.setIndex(index);
  }

  return newGeometry;
}

function addFlatGeometryIndices(geometry) {
  const position = geometry.getAttribute("position");

  if (!position) {
    return void console.warn("No position attribute");
  }

  const index = new Uint32Array(position.count);

  for (let i = 0; i < index.length; i++) {
    index[i] = i;
  }

  geometry.setIndex(new THREE.BufferAttribute(index, 1, false));

  return geometry;
}

function mergeMeshesToGeometry(meshes) {
  let vertexCount = 0;
  let indexCount = 0;

  const geometryAndMaterialIndex = [];
  const materialIndexMap = new Map();

  for (const mesh of meshes) {
    if (!mesh.visible) {
      continue;
    }

    const geometry = mesh.geometry.isBufferGeometry
      ? cloneBufferGeometry(mesh.geometry, ["position", "normal", "uv"]) // BufferGeometry object
      : new THREE.BufferGeometry().fromGeometry(mesh.geometry); // Geometry object

    const index = geometry.getIndex();

    if (!index) {
      addFlatGeometryIndices(geometry);
    }

    if (geometry.applyMatrix4) {
      geometry.applyMatrix4(mesh.matrixWorld);
    } else {
      geometry.applyMatrix(mesh.matrixWorld);
    }

    if (geometry.getAttribute("normal")) {
      geometry.normalizeNormals();
    } else {
      geometry.computeVertexNormals();
    }

    vertexCount += geometry.getAttribute("position").count;
    indexCount += geometry.getIndex().count;

    const material = mesh.material;

    let materialIndex = materialIndexMap.get(material);

    if (materialIndex === undefined) {
      materialIndex = materialIndexMap.size;
      materialIndexMap.set(material, materialIndex);
    }

    geometryAndMaterialIndex.push({ geometry, materialIndex });
  }

  const geometry = mergeGeometry(
    geometryAndMaterialIndex,
    vertexCount,
    indexCount
  );

  const materials = Array.from(materialIndexMap.keys());

  return { geometry, materials };
}

function mergeGeometry(geometryAndMaterialIndex, vertexCount, indexCount) {
  const positionAttrib = new THREE.BufferAttribute(
    new Float32Array(3 * vertexCount),
    3,
    false
  );
  const normalAttrib = new THREE.BufferAttribute(
    new Float32Array(3 * vertexCount),
    3,
    false
  );
  const uvAttrib = new THREE.BufferAttribute(
    new Float32Array(2 * vertexCount),
    2,
    false
  );
  const materialMeshIndexAttrib = new THREE.BufferAttribute(
    new Int32Array(2 * vertexCount),
    2,
    false
  );
  const indexAttrib = new THREE.BufferAttribute(
    new Uint32Array(indexCount),
    1,
    false
  );
  const mergedGeometry = new THREE.BufferGeometry();

  if (typeof mergedGeometry.setAttribute !== "function") {
    mergedGeometry.setAttribute = mergedGeometry.addAttribute;
  }

  mergedGeometry.setAttribute("position", positionAttrib);
  mergedGeometry.setAttribute("normal", normalAttrib);
  mergedGeometry.setAttribute("uv", uvAttrib);
  mergedGeometry.setAttribute("materialMeshIndex", materialMeshIndexAttrib);
  mergedGeometry.setIndex(indexAttrib);

  let currentVertex = 0;
  let currentIndex = 0;
  let currentMesh = 1;

  for (const { geometry, materialIndex } of geometryAndMaterialIndex) {
    const vertexCount = geometry.getAttribute("position").count;
    mergedGeometry.merge(geometry, currentVertex);

    const a = geometry.getIndex();

    for (let i = 0; i < a.count; i++) {
      indexAttrib.setX(currentIndex + i, currentVertex + a.getX(i));
    }

    for (let i = 0; i < vertexCount; i++) {
      materialMeshIndexAttrib.setXY(
        currentVertex + i,
        materialIndex,
        currentMesh
      );
    }

    currentVertex += vertexCount;
    currentIndex += a.count;
    currentMesh++;
  }
  return mergedGeometry;
}

// UniformBuffer
function setData(dataView, setter, size, offset, stride, components, value) {
  const l = Math.min(value.length / components, size);

  for (let i = 0; i < l; i++) {
    for (let k = 0; k < components; k++) {
      dataView[setter](
        offset + i * stride + 4 * k,
        value[components * i + k],
        true
      );
    }
  }
}

// texturesFromMaterials

// retrieve textures used by meshes, grouping textures from meshes shared *across all* mesh properties

function mergeTexturesFromMaterials(materials, textureNames) {
  const textureMap = { textures: [], indices: {} };

  for (const name of textureNames) {
    textureMap.indices[name] = texturesFromMaterials(
      materials,
      name,
      textureMap.textures
    );
  }

  return textureMap;
}

function texturesFromMaterials(materials, textureName, textures) {
  const indices = [];

  for (const material of materials) {
    const isTextureLoaded =
      material[textureName] && material[textureName].image;
    if (isTextureLoaded) {
      let index = textures.length;

      for (let i = 0; i < textures.length; i++) {
        if (textures[i] === material[textureName]) {
          // Reuse existing duplicate texture.
          index = i;
          break;
        }
      }

      if (index === textures.length) {
        // New texture. Add texture to list.
        textures.push(material[textureName]);
      }

      indices.push(index);
    } else {
      indices.push(-1);
    }
  }
  return indices;
}

// RayTracingRenderer

function getUniformBlockInfo(gl, program, blockIndex) {
  const indices = gl.getActiveUniformBlockParameter(
    program,
    blockIndex,
    gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES
  );

  const offset = gl.getActiveUniforms(program, indices, gl.UNIFORM_OFFSET);

  const stride = gl.getActiveUniforms(
    program,
    indices,
    gl.UNIFORM_ARRAY_STRIDE
  );

  const uniforms = {};

  for (let i = 0; i < indices.length; i++) {
    const { name, type, size } = gl.getActiveUniform(program, indices[i]);

    uniforms[name] = {
      type,
      size,
      offset: offset[i],
      stride: stride[i],
    };
  }

  return uniforms;
}

function makeUniformBuffer(gl, program, blockName) {
  const blockIndex = gl.getUniformBlockIndex(program, blockName);
  const blockSize = gl.getActiveUniformBlockParameter(
    program,
    blockIndex,
    gl.UNIFORM_BLOCK_DATA_SIZE
  );

  const uniforms = getUniformBlockInfo(gl, program, blockIndex);

  const buffer = gl.createBuffer();

  gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
  gl.bufferData(gl.UNIFORM_BUFFER, blockSize, gl.STATIC_DRAW);

  const data = new DataView(new ArrayBuffer(blockSize));

  function set(name, value) {
    if (!uniforms[name]) {
      // console.warn('No uniform property with name ', name);
      return;
    }

    const { type, size, offset, stride } = uniforms[name];

    switch (type) {
      case gl.FLOAT:
        setData(data, "setFloat32", size, offset, stride, 1, value);
        break;
      case gl.FLOAT_VEC2:
        setData(data, "setFloat32", size, offset, stride, 2, value);
        break;
      case gl.FLOAT_VEC3:
        setData(data, "setFloat32", size, offset, stride, 3, value);
        break;
      case gl.FLOAT_VEC4:
        setData(data, "setFloat32", size, offset, stride, 4, value);
        break;
      case gl.INT:
        setData(data, "setInt32", size, offset, stride, 1, value);
        break;
      case gl.INT_VEC2:
        setData(data, "setInt32", size, offset, stride, 2, value);
        break;
      case gl.INT_VEC3:
        setData(data, "setInt32", size, offset, stride, 3, value);
        break;
      case gl.INT_VEC4:
        setData(data, "setInt32", size, offset, stride, 4, value);
        break;
      case gl.BOOL:
        setData(data, "setUint32", size, offset, stride, 1, value);
        break;
      default:
        console.warn("UniformBuffer: Unsupported type");
    }
  }

  function bind(index) {
    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, index, buffer);
  }

  return {
    set,
    bind,
  };
}

// Upload arrays to uniform buffer objects
// Packs different arrays into vec4's to take advantage of GLSL's std140 memory layout

function uploadToUniformBuffer(gl, program, bufferData) {
  const materialBuffer = makeUniformBuffer(gl, program, "Materials");

  materialBuffer.set(
    "Materials.colorAndMaterialType[0]",
    interleave(
      {
        data: [].concat(...bufferData.color.map((d) => d.toArray())),
        channels: 3,
      },
      { data: bufferData.type, channels: 1 }
    )
  );

  materialBuffer.set(
    "Materials.roughnessMetalnessNormalScale[0]",
    interleave(
      { data: bufferData.roughness, channels: 1 },
      { data: bufferData.metalness, channels: 1 },
      {
        data: [].concat(...bufferData.normalScale.map((d) => d.toArray())),
        channels: 2,
      }
    )
  );

  materialBuffer.set(
    "Materials.alphaSpecularTintSheenSheenTint[0]",
    interleave(
      { data: bufferData.alpha, channels: 1 },
      { data: bufferData.specularTint, channels: 1 },
      { data: bufferData.sheen, channels: 1 },
      { data: bufferData.sheenTint, channels: 1 }
    )
  );

  materialBuffer.set(
    "Materials.clearcoaRoughnessSubfaceTransmission[0]",
    interleave(
      { data: bufferData.clearcoat, channels: 1 },
      { data: bufferData.clearcoatRoughness, channels: 1 },
      { data: bufferData.subsurface, channels: 1 },
      { data: bufferData.transmission, channels: 1 }
    )
  );

  materialBuffer.set(
    "Materials.iorAtDistanceAnisotropicWorkflow[0]",
    interleave(
      { data: bufferData.ior, channels: 1 },
      { data: bufferData.atDistance, channels: 1 },
      { data: bufferData.anisotropic, channels: 1 },
      { data: bufferData.workflow, channels: 1 }
    )
  );

  materialBuffer.set(
    "Materials.specularColorGlossiness[0]",
    interleave(
      {
        data: [].concat(...bufferData.specularColor.map((d) => d.toArray())),
        channels: 3,
      },
      { data: bufferData.glossiness, channels: 1 }
    )
  );

  materialBuffer.set(
    "Materials.extinction[0]",
    interleave(
      {
        data: [].concat(...bufferData.extinction.map((d) => d.toArray())),
        channels: 3,
      },
      { data: bufferData.anisotropic, channels: 1 }
    )
  );

  materialBuffer.set(
    "Materials.diffuseNormalRoughnessMetalnessMapIndex[0]",
    interleave(
      { data: bufferData.diffuseMapIndex, channels: 1 },
      { data: bufferData.normalMapIndex, channels: 1 },
      { data: bufferData.roughnessMapIndex, channels: 1 },
      { data: bufferData.metalnessMapIndex, channels: 1 }
    )
  );

  materialBuffer.set(
    "Materials.emissiveSpecularGlossinessMapIndex[0]",
    interleave(
      { data: bufferData.emissiveMapIndex, channels: 1 },
      { data: bufferData.specularMapIndex, channels: 1 },
      { data: bufferData.glossinessMapIndex, channels: 1 },
      { data: bufferData.emissiveMapIndex, channels: 1 }
    )
  );

  materialBuffer.set(
    "Materials.diffuseNormalMapSize[0]",
    interleave(
      { data: bufferData.diffuseMapSize, channels: 2 },
      { data: bufferData.normalMapSize, channels: 2 }
    )
  );

  materialBuffer.set("Materials.pbrMapSize[0]", bufferData.pbrMapSize);

  materialBuffer.bind(0);
}

function maxImageSize(images) {
  const maxSize = { width: 0, height: 0 };
  for (const image of images) {
    maxSize.width = Math.max(maxSize.width, image.width);
    maxSize.height = Math.max(maxSize.height, image.height);
  }

  const relativeSizes = [];

  for (const image of images) {
    relativeSizes.push(image.width / maxSize.width);
    relativeSizes.push(image.height / maxSize.height);
  }

  return { maxSize, relativeSizes };
}

function makeTextureArray(gl, textures, gammaCorrection = false, channels = 3) {
  const images = textures.map((t) => t.image);
  const flipY = textures.map((t) => t.flipY);

  const { maxSize, relativeSizes } = maxImageSize(images);

  // create GL Array Texture from individual textures
  const texture = makeTexture(gl, {
    width: maxSize.width,
    height: maxSize.height,
    gammaCorrection,
    data: images,
    flipY,
    channels,
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR,
  });

  return {
    texture,
    relativeSizes,
  };
}

// texturesFromMaterials

// retrieve textures used by meshes, grouping textures from meshes shared by *the same* mesh property
function getTexturesFromMaterials(materials, textureNames) {
  const textureMap = {};

  for (const name of textureNames) {
    const textures = [];
    const indices = texturesFromMaterials(materials, name, textures);

    textureMap[name] = { indices, textures };
  }

  return textureMap;
}

// MaterialBuffer

// var materialBufferChunk =
//   "uniform Materials {\n\tvec4 colorAndMaterialType[NUM_MATERIALS];\n\tvec4 roughnessMetalnessNormalScale[NUM_MATERIALS];\n\tvec4 alphaSpecularTintSheenSheenTint[NUM_MATERIALS];\n\tvec4 clearcoaRoughnessSubfaceTransmission[NUM_MATERIALS];\n\tvec4 iorAtDistanceAnisotropicWorkflow[NUM_MATERIALS];\n\tvec4 extinction[NUM_MATERIALS];\n\tvec4 specularColorGlossiness[NUM_MATERIALS];\n\n\t#if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS) || defined(NUM_PBR_MAPS)\n\t\tivec4 diffuseNormalRoughnessMetalnessMapIndex[NUM_MATERIALS];\n\t#endif\n\n\t#if defined(NUM_EMISSIVE_MAPS) || defined(NUM_PBR_SG_MAPS)\n\t\tivec4 emissiveSpecularGlossinessMapIndex[NUM_MATERIALS];\n\t#endif\n\n\t#if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS)\n\t\tvec4 diffuseNormalMapSize[NUM_DIFFUSE_NORMAL_MAPS];\n\t#endif\n\n\t#if defined(NUM_PBR_MAPS)\n\t\tvec2 pbrMapSize[NUM_PBR_MAPS];\n\t#else\n\t\t#if defined(NUM_PBR_SG_MAPS)\n\t\t\tvec2 pbrMapSize[NUM_PBR_SG_MAPS];\n\t\t#else\n\t\t\t#if defined(NUM_EMISSIVE_MAPS)\n\t\t\t\tvec2 pbrMapSize[NUM_EMISSIVE_MAPS];\n\t\t\t#endif\n\t\t#endif\n\t#endif\n} materials;\n\n#ifdef NUM_DIFFUSE_MAPS\n\tuniform mediump sampler2DArray diffuseMap;\n#endif\n\n#ifdef NUM_NORMAL_MAPS\n\tuniform mediump sampler2DArray normalMap;\n#endif\n\n#ifdef NUM_PBR_MAPS\n\tuniform mediump sampler2DArray pbrMap;\n#endif\n\n#ifdef NUM_PBR_SG_MAPS\n\tuniform mediump sampler2DArray pbrSGMap;\n#endif\n\n#ifdef NUM_EMISSIVE_MAPS\n\tuniform mediump sampler2DArray emissiveMap;\n#endif\n\nfloat getMatType(int materialIndex) {\n\treturn materials.colorAndMaterialType[materialIndex].w;\n}\n\nfloat getMatWorkflow(int materialIndex) {\n\treturn materials.iorAtDistanceAnisotropicWorkflow[materialIndex].w;\n}\n\nvec3 getMatEmissive(int materialIndex, vec2 uv) {\n\t// Todo: emissive Intensity\n\tvec3 emissive = vec3(0.0);\n\n\t#ifdef NUM_EMISSIVE_MAPS\n\t\tint emissiveMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].x;\n\t\tif (emissiveMapIndex >= 0) {\n\t\t\temissive = texture(emissiveMap, vec3(uv * materials.pbrMapSize[emissiveMapIndex].xy, emissiveMapIndex)).rgb;\n\t\t}\n\t#endif\n\t\n\treturn emissive;\n}\n\nvec3 getMatSpecularColor(int materialIndex, vec2 uv) {\n\tvec3 specularColor = materials.specularColorGlossiness[materialIndex].rgb;\n\n\t#ifdef NUM_PBR_SG_MAPS\n\t\tint specularMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].y;\n\t\tif (specularMapIndex >= 0) {\n\t\t\tvec3 texelSpecular = texture(pbrSGMap, vec3(uv * materials.pbrMapSize[specularMapIndex].xy, specularMapIndex)).rgb;\n\t\t\ttexelSpecular = pow(texelSpecular, vec3(2.2));\n\t\t\tspecularColor *= texelSpecular;\n\t\t}\n\t#endif\n\n\treturn specularColor;\n}\n\nfloat getMatGlossiness(int materialIndex, vec2 uv) {\n\tfloat glossiness = materials.specularColorGlossiness[materialIndex].a;\n\t#ifdef NUM_PBR_SG_MAPS\n\t\tint glossinessMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].z;\n\t\tif (glossinessMapIndex >= 0) {\n\t\t\tfloat texelGlossiness = texture(pbrSGMap, vec3(uv * materials.pbrMapSize[glossinessMapIndex].xy, glossinessMapIndex)).a;\n\t\t\tglossiness *= texelGlossiness;\n\t\t}\n\t#endif\n\treturn glossiness;\n}\n\nfloat getMatRoughness(int materialIndex, vec2 uv) {\n\tfloat workflow = getMatWorkflow(materialIndex);\n\tfloat roughness = 0.0;\n\tif (workflow > 0.1) {\n\t\troughness = 1.0 - getMatGlossiness(materialIndex, uv);\n\t} else {\n\t\troughness = materials.roughnessMetalnessNormalScale[materialIndex].x;\n\n\t\t#ifdef NUM_PBR_MAPS\n\t\t\tint roughnessMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].z;\n\t\t\tif (roughnessMapIndex >= 0) {\n\t\t\t\troughness *= texture(pbrMap, vec3(uv * materials.pbrMapSize[roughnessMapIndex].xy, roughnessMapIndex)).g;\n\t\t\t}\n\t\t#endif\n\t}\n\t// Remap\n\treturn roughness * roughness;\n}\n\nfloat max3(const vec3 v) {\n\treturn max(v.x, max(v.y, v.z));\n}\n\nfloat computeMetallicFromSpecularColor(const vec3 specularColor) {\n\treturn max3(specularColor);\n}\n\nvec3 computeDiffuseColor(const vec3 baseColor, float metallic) {\n\treturn baseColor * (1.0 - metallic);\n}\n\nfloat getMatMetalness(int materialIndex, vec2 uv) {\n\tfloat workflow = getMatWorkflow(materialIndex);\n\tfloat metalness = 0.0;\n\tif (workflow > 0.1) {\n\t\tvec3 specularFactor = getMatSpecularColor(materialIndex, uv);\n\t\tmetalness = computeMetallicFromSpecularColor(specularFactor);\n\t} else {\n\t\tmetalness = materials.roughnessMetalnessNormalScale[materialIndex].y;\n\n\t\t#ifdef NUM_PBR_MAPS\n\t\t\tint metalnessMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].w;\n\t\t\tif (metalnessMapIndex >= 0) {\n\t\t\t\tmetalness *= texture(pbrMap, vec3(uv * materials.pbrMapSize[metalnessMapIndex].xy, metalnessMapIndex)).b;\n\t\t\t}\n\t\t#endif\n\t}\n\n\treturn metalness;\n}\n\nvec3 getMatColor(int materialIndex, vec2 uv) {\n\t// if (enableAlbedo && bounce == 0) return vec3(1.);\n\tvec3 color = materials.colorAndMaterialType[materialIndex].rgb;\n\t#ifdef NUM_DIFFUSE_MAPS\n\t\tint diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;\n\t\tif (diffuseMapIndex >= 0) {\n\t\t\tcolor *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).rgb;\n\t\t}\n\t#endif\n\n\tfloat workflow = getMatWorkflow(materialIndex);\n\tif (workflow > 0.1) {\n\t\tvec3 specularFactor = getMatSpecularColor(materialIndex, uv);\n\t\tcolor = computeDiffuseColor(color, computeMetallicFromSpecularColor(specularFactor));\n\t}\n\n\treturn color;\n}\n\nvec3 getMatNormal(int materialIndex, vec2 uv, vec3 normal, vec3 dp1, vec3 dp2, vec2 duv1, vec2 duv2, inout vec3 tangent, inout vec3 bitangent) {\n\t// http://www.thetenthplanet.de/archives/1180\n\t// Compute co-tangent and co-bitangent vectors\n\tvec3 dp2perp = cross(dp2, normal);\n\tvec3 dp1perp = cross(normal, dp1);\n\tvec3 dpdu = dp2perp * duv1.x + dp1perp * duv2.x;\n\tvec3 dpdv = dp2perp * duv1.y + dp1perp * duv2.y;\n\tfloat invmax = inversesqrt(max(dot(dpdu, dpdu), dot(dpdv, dpdv)));\n\tdpdu *= invmax;\n\tdpdv *= invmax;\n\n\t// All world space\n\t// Todo: /3ed-2018/Materials/BSDFs => WorldToLocal/LocalToWorld\n\ttangent = normalize(dpdu);\n\tbitangent = normalize(dpdv);\n\n#ifdef NUM_NORMAL_MAPS\n\tint normalMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].y;\n\tif (normalMapIndex >= 0) {\n\t\tvec3 n = 2.0 * texture(normalMap, vec3(uv * materials.diffuseNormalMapSize[normalMapIndex].zw, normalMapIndex)).rgb - 1.0;\n\t\tn.xy *= materials.roughnessMetalnessNormalScale[materialIndex].zw;\n\n\t\tmat3 tbn = mat3(dpdu, dpdv, normal);\n\n\t\treturn normalize(tbn * n);\n\t} else {\n\t\treturn normal;\n\t}\n#endif\n\n\treturn normal;\n}\n\n// alphaSpecularTintSheenSheenTint\nfloat getMatAlpha(int materialIndex, vec2 uv) {\n\tfloat alpha =  materials.alphaSpecularTintSheenSheenTint[materialIndex].x;\n\t#ifdef NUM_DIFFUSE_MAPS\n\t\tint diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;\n\t\tif (diffuseMapIndex >= 0) {\n\t\t\talpha *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).a;\n\t\t}\n\t#endif\n\treturn alpha;\n}\n\nfloat getMatSpecularTint(int materialIndex) {\n\treturn materials.alphaSpecularTintSheenSheenTint[materialIndex].y;\n}\n\nfloat getMatSheen(int materialIndex) {\n\treturn materials.alphaSpecularTintSheenSheenTint[materialIndex].z;\n}\n\nfloat getMatSheenTint(int materialIndex) {\n\treturn materials.alphaSpecularTintSheenSheenTint[materialIndex].w;\n}\n\n// clearcoaRoughnessSubfaceTransmission\nfloat getMatClearcoat(int materialIndex) {\n\treturn materials.clearcoaRoughnessSubfaceTransmission[materialIndex].x;\n}\n\nfloat getMatClearcoatRoughness(int materialIndex) {\n\treturn materials.clearcoaRoughnessSubfaceTransmission[materialIndex].y;\n}\n\nfloat getMatSubface(int materialIndex) {\n\treturn materials.clearcoaRoughnessSubfaceTransmission[materialIndex].z;\n}\n\nfloat getMatTransmission(int materialIndex) {\n\treturn materials.clearcoaRoughnessSubfaceTransmission[materialIndex].w;\n}\n\n// iorAtDistanceAnisotropicWorkflow\nfloat getMatIOR(int materialIndex) {\n\treturn materials.iorAtDistanceAnisotropicWorkflow[materialIndex].x;\n}\n\nfloat getMatAtDistance(int materialIndex) {\n\treturn materials.iorAtDistanceAnisotropicWorkflow[materialIndex].y;\n}\n\nfloat getMatAnisotropic(int materialIndex) {\n\treturn materials.iorAtDistanceAnisotropicWorkflow[materialIndex].z;\n}\n\nvec3 getMatExtinction(int materialIndex) {\n\treturn materials.extinction[materialIndex].rgb;\n}";

var materialBufferChunk = `uniform Materials {
    vec4 colorAndMaterialType[NUM_MATERIALS];
    vec4 roughnessMetalnessNormalScale[NUM_MATERIALS];
    vec4 alphaSpecularTintSheenSheenTint[NUM_MATERIALS];
    vec4 clearcoaRoughnessSubfaceTransmission[NUM_MATERIALS];
    vec4 iorAtDistanceAnisotropicWorkflow[NUM_MATERIALS];
    vec4 extinction[NUM_MATERIALS];
    vec4 specularColorGlossiness[NUM_MATERIALS];
  
    #if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS) || defined(NUM_PBR_MAPS)
    ivec4 diffuseNormalRoughnessMetalnessMapIndex[NUM_MATERIALS];
    #endif
  
    #if defined(NUM_EMISSIVE_MAPS) || defined(NUM_PBR_SG_MAPS)
    ivec4 emissiveSpecularGlossinessMapIndex[NUM_MATERIALS];
    #endif
  
    #if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS)
    vec4 diffuseNormalMapSize[NUM_DIFFUSE_NORMAL_MAPS];
    #endif
  
    #if defined(NUM_PBR_MAPS)
    vec2 pbrMapSize[NUM_PBR_MAPS];
    #else
      #if defined(NUM_PBR_SG_MAPS)
    vec2 pbrMapSize[NUM_PBR_SG_MAPS];
      #else
        #if defined(NUM_EMISSIVE_MAPS)
    vec2 pbrMapSize[NUM_EMISSIVE_MAPS];
        #endif
      #endif
    #endif
  } materials;
  
  #ifdef NUM_DIFFUSE_MAPS
  uniform mediump sampler2DArray diffuseMap;
  #endif
  
  #ifdef NUM_NORMAL_MAPS
  uniform mediump sampler2DArray normalMap;
  #endif
  
  #ifdef NUM_PBR_MAPS
  uniform mediump sampler2DArray pbrMap;
  #endif
  
  #ifdef NUM_PBR_SG_MAPS
  uniform mediump sampler2DArray pbrSGMap;
  #endif
  
  #ifdef NUM_EMISSIVE_MAPS
  uniform mediump sampler2DArray emissiveMap;
  #endif
  
  float getMatType(int materialIndex) {
    return materials.colorAndMaterialType[materialIndex].w;
  }
  
  float getMatWorkflow(int materialIndex) {
    return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].w;
  }
  
  vec3 getMatEmissive(int materialIndex, vec2 uv) {
    // Todo: emissive Intensity
    vec3 emissive = vec3(0.0);
  
    #ifdef NUM_EMISSIVE_MAPS
    int emissiveMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].x;
    if(emissiveMapIndex >= 0) {
      emissive = texture(emissiveMap, vec3(uv * materials.pbrMapSize[emissiveMapIndex].xy, emissiveMapIndex)).rgb;
    }
    #endif
  
    return emissive;
  }
  
  vec3 getMatSpecularColor(int materialIndex, vec2 uv) {
    vec3 specularColor = materials.specularColorGlossiness[materialIndex].rgb;
  
    #ifdef NUM_PBR_SG_MAPS
    int specularMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].y;
    if(specularMapIndex >= 0) {
      vec3 texelSpecular = texture(pbrSGMap, vec3(uv * materials.pbrMapSize[specularMapIndex].xy, specularMapIndex)).rgb;
      texelSpecular = pow(texelSpecular, vec3(2.2));
      specularColor *= texelSpecular;
    }
    #endif
  
    return specularColor;
  }
  
  float getMatGlossiness(int materialIndex, vec2 uv) {
    float glossiness = materials.specularColorGlossiness[materialIndex].a;
    #ifdef NUM_PBR_SG_MAPS
    int glossinessMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].z;
    if(glossinessMapIndex >= 0) {
      float texelGlossiness = texture(pbrSGMap, vec3(uv * materials.pbrMapSize[glossinessMapIndex].xy, glossinessMapIndex)).a;
      glossiness *= texelGlossiness;
    }
    #endif
    return glossiness;
  }
  
  float getMatRoughness(int materialIndex, vec2 uv) {
    float workflow = getMatWorkflow(materialIndex);
    float roughness = 0.0;
    if(workflow > 0.1) {
      roughness = 1.0 - getMatGlossiness(materialIndex, uv);
    } else {
      roughness = materials.roughnessMetalnessNormalScale[materialIndex].x;
  
      #ifdef NUM_PBR_MAPS
      int roughnessMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].z;
      if(roughnessMapIndex >= 0) {
        roughness *= texture(pbrMap, vec3(uv * materials.pbrMapSize[roughnessMapIndex].xy, roughnessMapIndex)).g;
      }
      #endif
    }
    // Remap
    return roughness * roughness;
  }
  
  float max3(const vec3 v) {
    return max(v.x, max(v.y, v.z));
  }
  
  float computeMetallicFromSpecularColor(const vec3 specularColor) {
    return max3(specularColor);
  }
  
  vec3 computeDiffuseColor(const vec3 baseColor, float metallic) {
    return baseColor * (1.0 - metallic);
  }
  
  float getMatMetalness(int materialIndex, vec2 uv) {
    float workflow = getMatWorkflow(materialIndex);
    float metalness = 0.0;
    if(workflow > 0.1) {
      vec3 specularFactor = getMatSpecularColor(materialIndex, uv);
      metalness = computeMetallicFromSpecularColor(specularFactor);
    } else {
      metalness = materials.roughnessMetalnessNormalScale[materialIndex].y;
  
      #ifdef NUM_PBR_MAPS
      int metalnessMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].w;
      if(metalnessMapIndex >= 0) {
        metalness *= texture(pbrMap, vec3(uv * materials.pbrMapSize[metalnessMapIndex].xy, metalnessMapIndex)).b;
      }
      #endif
    }
  
    return metalness;
  }
  
  vec3 getMatColor(int materialIndex, vec2 uv) {
    // if (enableAlbedo && bounce == 0) return vec3(1.);
    vec3 color = materials.colorAndMaterialType[materialIndex].rgb;
    #ifdef NUM_DIFFUSE_MAPS
    int diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;
    if(diffuseMapIndex >= 0) {
      color *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).rgb;
    }
    #endif
  
    float workflow = getMatWorkflow(materialIndex);
    if(workflow > 0.1) {
      vec3 specularFactor = getMatSpecularColor(materialIndex, uv);
      color = computeDiffuseColor(color, computeMetallicFromSpecularColor(specularFactor));
    }
  
    return color;
  }
  
  vec3 getMatNormal(int materialIndex, vec2 uv, vec3 normal, vec3 dp1, vec3 dp2, vec2 duv1, vec2 duv2, inout vec3 tangent, inout vec3 bitangent) {
    // http://www.thetenthplanet.de/archives/1180
    // Compute co-tangent and co-bitangent vectors
    vec3 dp2perp = cross(dp2, normal);
    vec3 dp1perp = cross(normal, dp1);
    vec3 dpdu = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 dpdv = dp2perp * duv1.y + dp1perp * duv2.y;
    float invmax = inversesqrt(max(dot(dpdu, dpdu), dot(dpdv, dpdv)));
    dpdu *= invmax;
    dpdv *= invmax;
  
    // All world space
    // Todo: /3ed-2018/Materials/BSDFs => WorldToLocal/LocalToWorld
    tangent = normalize(dpdu);
    bitangent = normalize(dpdv);
  
  #ifdef NUM_NORMAL_MAPS
    int normalMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].y;
    if(normalMapIndex >= 0) {
      vec3 n = 2.0 * texture(normalMap, vec3(uv * materials.diffuseNormalMapSize[normalMapIndex].zw, normalMapIndex)).rgb - 1.0;
      n.xy *= materials.roughnessMetalnessNormalScale[materialIndex].zw;
  
      mat3 tbn = mat3(dpdu, dpdv, normal);
  
      return normalize(tbn * n);
    } else {
      return normal;
    }
  #endif
  
    return normal;
  }
  
  // alphaSpecularTintSheenSheenTint
  float getMatAlpha(int materialIndex, vec2 uv) {
    float alpha = materials.alphaSpecularTintSheenSheenTint[materialIndex].x;
    #ifdef NUM_DIFFUSE_MAPS
    int diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;
    if(diffuseMapIndex >= 0) {
      alpha *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).a;
    }
    #endif
    return alpha;
  }
  
  float getMatSpecularTint(int materialIndex) {
    return materials.alphaSpecularTintSheenSheenTint[materialIndex].y;
  }
  
  float getMatSheen(int materialIndex) {
    return materials.alphaSpecularTintSheenSheenTint[materialIndex].z;
  }
  
  float getMatSheenTint(int materialIndex) {
    return materials.alphaSpecularTintSheenSheenTint[materialIndex].w;
  }
  
  // clearcoaRoughnessSubfaceTransmission
  float getMatClearcoat(int materialIndex) {
    return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].x;
  }
  
  float getMatClearcoatRoughness(int materialIndex) {
    return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].y;
  }
  
  float getMatSubface(int materialIndex) {
    return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].z;
  }
  
  float getMatTransmission(int materialIndex) {
    return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].w;
  }
  
  // iorAtDistanceAnisotropicWorkflow
  float getMatIOR(int materialIndex) {
    return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].x;
  }
  
  float getMatAtDistance(int materialIndex) {
    return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].y;
  }
  
  float getMatAnisotropic(int materialIndex) {
    return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].z;
  }
  
  vec3 getMatExtinction(int materialIndex) {
    return materials.extinction[materialIndex].rgb;
  }`;

function makeMaterialBuffer(gl, materials) {
  const maps = getTexturesFromMaterials(materials, [
    "map",
    "normalMap",
    "emissiveMap",
  ]);

  const pbrMap = mergeTexturesFromMaterials(materials, [
    "roughnessMap",
    "metalnessMap",
  ]);

  const pbrSgMap = mergeTexturesFromMaterials(materials, [
    "specularMap",
    "glossinessMap",
  ]);

  const textures = {};
  const bufferData = {};

  bufferData.color = materials.map((m) => m.color);
  bufferData.roughness = materials.map((m) => m.roughness);
  bufferData.metalness = materials.map((m) => m.metalness);
  bufferData.normalScale = materials.map((m) => m.normalScale);
  bufferData.specularTint = materials.map((m) => m.specularTint);
  bufferData.sheen = materials.map((m) => m.sheen);
  bufferData.sheenTint = materials.map((m) => m.sheenTint);
  bufferData.clearcoat = materials.map((m) => m.clearcoat);
  bufferData.clearcoatRoughness = materials.map((m) => m.clearcoatRoughness);
  bufferData.transmission = materials.map((m) => m.transmission);
  bufferData.subsurface = materials.map((m) => m.subsurface);
  bufferData.ior = materials.map((m) => m.ior);
  bufferData.atDistance = materials.map((m) => m.atDistance);
  bufferData.extinction = materials.map((m) => m.extinction);
  bufferData.alpha = materials.map((m) => m.alpha);
  bufferData.workflow = materials.map((m) =>
    "Metalness" === m.workflow ? 0 : 1
  );
  bufferData.specularColor = materials.map((m) => m.specularColor);
  bufferData.glossiness = materials.map((m) => m.glossiness);
  bufferData.type = materials.map(() => 0);

  if (maps.map.textures.length > 0) {
    const { relativeSizes, texture } = makeTextureArray(
      gl,
      maps.map.textures,
      true,
      4
    );

    bufferData.diffuseMap = texture;
    bufferData.diffuseMapSize = relativeSizes;
    bufferData.diffuseMapIndex = maps.map.indices;
  }

  if (maps.normalMap.textures.length > 0) {
    const { relativeSizes, texture } = makeTextureArray(
      gl,
      maps.normalMap.textures,
      false
    );

    textures.normalMap = texture;
    bufferData.normalMapSize = relativeSizes;
    bufferData.normalMapIndex = maps.normalMap.indices;
  }

  if (pbrMap.textures.length > 0) {
    const { relativeSizes, texture } = makeTextureArray(
      gl,
      pbrMap.textures,
      false
    );

    textures.pbrMap = texture;
    bufferData.pbrMapSize = relativeSizes;
    bufferData.roughnessMapIndex = pbrMap.indices.roughnessMap;
    bufferData.metalnessMapIndex = pbrMap.indices.metalnessMap;
  }

  if (pbrSgMap.textures.length > 0) {
    const { relativeSizes, texture } = makeTextureArray(
      gl,
      pbrSgMap.textures,
      false,
      4
    );

    textures.pbrSGMap = texture;
    bufferData.pbrMapSize = relativeSizes;
    bufferData.specularMapIndex = pbrSgMap.indices.specularMap;
    bufferData.glossinessMapIndex = pbrSgMap.indices.glossinessMap;
  }

  if (maps.emissiveMap.textures.length > 0) {
    const { relativeSizes, texture } = makeTextureArray(
      gl,
      maps.emissiveMap.textures,
      true
    );

    textures.emissiveMap = texture;
    bufferData.pbrMapSize || (bufferData.pbrMapSize = relativeSizes);
    bufferData.emissiveMapIndex = maps.emissiveMap.indices;
  }

  const defines = {
    NUM_MATERIALS: materials.length,
    NUM_DIFFUSE_MAPS: maps.map.textures.length,
    NUM_NORMAL_MAPS: maps.normalMap.textures.length,
    NUM_DIFFUSE_NORMAL_MAPS: Math.max(
      maps.map.textures.length,
      maps.normalMap.textures.length
    ),
    NUM_PBR_MAPS: pbrMap.textures.length,
    NUM_PBR_SG_MAPS: pbrSgMap.textures.length,
    NUM_EMISSIVE_MAPS: maps.emissiveMap.textures.length,
  };

  // create temporary shader program including the Material uniform buffer
  // used to query the compiled structure of the uniform buffer

  const { program } = makeRenderPass(gl, {
    vertex: { source: "void main() {}" },
    fragment: {
      includes: [materialBufferChunk],
      source: "void main() {}",
    },
    defines,
  });

  uploadToUniformBuffer(gl, program, bufferData);

  return { defines, textures };
}

function swap(array, a, b) {
  const x = array[b];

  array[b] = array[a];
  array[a] = x;
}

const size = new THREE.Vector3();

function makeLeafNode(primitives, bounds) {
  return {
    primitives,
    bounds,
  };
}

function boxOffset(box3, dim, v) {
  let offset = v[dim] - box3.min[dim];

  if (box3.max[dim] > box3.min[dim]) {
    offset /= box3.max[dim] - box3.min[dim];
  }

  return offset;
}

function surfaceArea(box3) {
  box3.getSize(size);

  return 2 * (size.x * size.z + size.x * size.y + size.z * size.y);
}

function maximumExtent(box3) {
  box3.getSize(size);

  if (size.x > size.z) {
    return size.x > size.y ? "x" : "y";
  } else {
    return size.z > size.y ? "z" : "y";
  }
}

// nth_element is a partial sorting algorithm that rearranges elements in [first, last) such that:
// The element pointed at by nth is changed to whatever element would occur in that position if [first, last) were sorted.
// All of the elements before this new nth element compare to true with elements after the nth element

function nthElement(
  array,
  compare,
  left = 0,
  right = array.length,
  k = Math.floor((left + right) / 2)
) {
  for (let i = left; i <= k; i++) {
    let minIndex = i;
    let minValue = array[i];

    for (let j = i + 1; j < right; j++) {
      if (!compare(minValue, array[j])) {
        minIndex = j;
        minValue = array[j];
        swap(array, i, minIndex);
      }
    }
  }
}

// Reorders the elements in the range [first, last) in such a way that
// all elements for which the comparator c returns true
// precede the elements for which comparator c returns false.

function partition(array, compare, left = 0, right = array.length) {
  while (left !== right) {
    while (compare(array[left])) {
      left++;
      if (left === right) {
        return left;
      }
    }

    do {
      right--;
      if (left === right) {
        return left;
      }
    } while (!compare(array[right]));

    swap(array, left, right);
    left++;
  }

  return left;
}

function makeInteriorNode(splitAxis, child0, child1) {
  return {
    child0,
    child1,
    bounds: new THREE.Box3().union(child0.bounds).union(child1.bounds),
    splitAxis,
  };
}

function recursiveBuild(primitiveInfo, start, end) {
  const bounds = new THREE.Box3();

  for (let i = start; i < end; i++) {
    bounds.union(primitiveInfo[i].bounds);
  }

  const nPrimitives = end - start;

  if (nPrimitives === 1) {
    return makeLeafNode(primitiveInfo.slice(start, end), bounds);
  } else {
    const centroidBounds = new THREE.Box3();

    for (let i = start; i < end; i++) {
      centroidBounds.expandByPoint(primitiveInfo[i].center);
    }

    const dim = maximumExtent(centroidBounds);

    let mid = Math.floor((start + end) / 2);

    // middle split method
    // const dimMid = (centroidBounds.max[dim] + centroidBounds.min[dim]) / 2;
    // mid = partition(primitiveInfo, p => p.center[dim] < dimMid, start, end);

    // if (mid === start || mid === end) {
    //   mid = Math.floor((start + end) / 2);
    //   nthElement(primitiveInfo, (a, b) => a.center[dim] < b.center[dim], start, end, mid);
    // }

    // surface area heuristic method

    if (nPrimitives <= 4) {
      nthElement(
        primitiveInfo,
        (a, b) => a.center[dim] < b.center[dim],
        start,
        end,
        mid
      );
    } else if (centroidBounds.max[dim] === centroidBounds.min[dim]) {
      // can't split primitives based on centroid bounds. terminate.

      return makeLeafNode(primitiveInfo.slice(start, end), bounds);
    } else {
      const buckets = [];

      for (let i = 0; i < 12; i++) {
        buckets.push({ bounds: new THREE.Box3(), count: 0 });
      }

      for (let i = start; i < end; i++) {
        let b = Math.floor(
          buckets.length *
            boxOffset(centroidBounds, dim, primitiveInfo[i].center)
        );

        if (b === buckets.length) {
          b = buckets.length - 1;
        }

        buckets[b].count++;
        buckets[b].bounds.union(primitiveInfo[i].bounds);
      }

      const cost = [];

      for (let i = 0; i < buckets.length - 1; i++) {
        const b0 = new THREE.Box3();
        const b1 = new THREE.Box3();

        let count0 = 0;
        let count1 = 0;

        for (let j = 0; j <= i; j++) {
          b0.union(buckets[j].bounds);
          count0 += buckets[j].count;
        }

        for (let j = i + 1; j < buckets.length; j++) {
          b1.union(buckets[j].bounds);
          count1 += buckets[j].count;
        }

        cost.push(
          0.1 +
            (count0 * surfaceArea(b0) + count1 * surfaceArea(b1)) /
              surfaceArea(bounds)
        );
      }

      let minCost = cost[0];
      let minCostSplitBucket = 0;

      for (let i = 1; i < cost.length; i++) {
        if (cost[i] < minCost) {
          minCost = cost[i];
          minCostSplitBucket = i;
        }
      }

      mid = partition(
        primitiveInfo,
        (p) => {
          let b = Math.floor(
            buckets.length * boxOffset(centroidBounds, dim, p.center)
          );
          if (b === buckets.length) {
            b = buckets.length - 1;
          }
          return b <= minCostSplitBucket;
        },
        start,
        end
      );
    }

    return makeInteriorNode(
      dim,
      recursiveBuild(primitiveInfo, start, mid),
      recursiveBuild(primitiveInfo, mid, end)
    );
  }
}

function makePrimitiveInfo(geometry) {
  const primitiveInfo = [];

  const indices = geometry.getIndex
    ? geometry.getIndex().array
    : geometry.index.array;

  const position = geometry.getAttribute
    ? geometry.getAttribute("position")
    : geometry.attributes.position;

  const materialMeshIndex = geometry.getAttribute
    ? geometry.getAttribute("materialMeshIndex")
    : geometry.attributes.materialMeshIndex;

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const e0 = new THREE.Vector3();
  const e1 = new THREE.Vector3();

  for (let d = 0; d < indices.length; d += 3) {
    const i0 = indices[d];
    const i1 = indices[d + 1];
    const i2 = indices[d + 2];

    const bounds = new THREE.Box3();

    if (position.getX) {
      v0.fromBufferAttribute(position, i0);
      v1.fromBufferAttribute(position, i1);
      v2.fromBufferAttribute(position, i2);
    } else {
      v0.x = position.array[i0 * position.itemSize];
      v0.y = position.array[i0 * position.itemSize + 1];
      v0.z = position.array[i0 * position.itemSize + 2];
      v1.x = position.array[i1 * position.itemSize];
      v1.y = position.array[i1 * position.itemSize + 1];
      v1.z = position.array[i1 * position.itemSize + 2];
      v2.x = position.array[i2 * position.itemSize];
      v2.y = position.array[i2 * position.itemSize + 1];
      v2.z = position.array[i2 * position.itemSize + 2];
    }

    e0.subVectors(v2, v0);
    e1.subVectors(v1, v0);

    bounds.expandByPoint(v0);
    bounds.expandByPoint(v1);
    bounds.expandByPoint(v2);

    const center = bounds.getCenter(new THREE.Vector3());

    const faceNormal = new THREE.Vector3().crossVectors(e1, e0).normalize();

    const materialIndex = materialMeshIndex.getX
      ? materialMeshIndex.getX(i0)
      : materialMeshIndex.array[i0 * materialMeshIndex.itemSize];

    const info = {
      bounds,
      center,
      indices: [i0, i1, i2],
      faceNormal,
      materialIndex,
    };

    primitiveInfo.push(info);
  }
  return primitiveInfo;
}

function bvhAccel(geometry) {
  const primitiveInfo = makePrimitiveInfo(geometry);
  const node = recursiveBuild(primitiveInfo, 0, primitiveInfo.length);

  return node;
}

function rgbeToFloat(buffer, intensity = 1) {
  const texels = buffer.length / 4;
  const floatBuffer = new Float32Array(texels * 3);
  const expTable = [];

  for (let i = 0; i < 255; i++) {
    expTable[i] = (intensity * Math.pow(2, i - 128)) / 255;
  }

  for (let i = 0; i < texels; i++) {
    const r = buffer[4 * i];
    const g = buffer[4 * i + 1];
    const b = buffer[4 * i + 2];
    const a = buffer[4 * i + 3];

    const e = expTable[a];

    floatBuffer[3 * i] = r * e;
    floatBuffer[3 * i + 1] = g * e;
    floatBuffer[3 * i + 2] = b * e;
  }

  return floatBuffer;
}

function clampedArrayFromImageData(image) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return data;
}

function generateBackgroundMapFromSceneBackground(background) {
  let backgroundImage;

  backgroundImage = {
    width: background.data.image.width,
    height: background.data.image.height,
    data: background.data.image.data,
    dataFormat: "float",
  };

  if (background.data.type === THREE.UnsignedByteType) {
    if (backgroundImage.data) {
      backgroundImage.data = rgbeToFloat(
        backgroundImage.data,
        background.intensity
      );
    } else {
      backgroundImage.data = clampedArrayFromImageData(background.data.image);
      backgroundImage.dataFormat = "byte";
    }
  } else if (
    background.data.type === THREE.FloatType &&
    background.data.format === THREE.RGBAFormat
  ) {
    const buffer = background.data.image.data;
    const texels = buffer.length / 4;
    const floatBuffer = new Float32Array(texels * 3);

    for (let i = 0; i < texels; i++) {
      floatBuffer[3 * i + 0] = buffer[4 * i + 0];
      floatBuffer[3 * i + 1] = buffer[4 * i + 1];
      floatBuffer[3 * i + 2] = buffer[4 * i + 2];
    }

    backgroundImage.data = floatBuffer;
  } else if (background.data.type == THREE.HalfFloatType) {
    console.error(
      "Please use 'new RGBELoader().setDataType(THREE.FloatType)' to load hdr env map. Half-Float type will loss of precision and have an impression of the effect."
    );
  } else if (background.data.type !== THREE.FloatType) {
    console.error(
      `No support environmentLight's data type: ${background.data.type.toString()}`
    );
  }

  return backgroundImage;
}

function makeEnvTextureArray(width, height, channels) {
  const array = new Float32Array(channels * width * height);

  return {
    set(x, y, channel, val) {
      array[channels * (y * width + x) + channel] = val;
    },
    get(x, y, channel) {
      return array[channels * (y * width + x) + channel];
    },
    width,
    height,
    channels,
    array,
  };
}

function envMapDistribution(image) {
  const data = image.data;
  const cdfImage = { width: image.width + 2, height: image.height + 1 };

  const cdf = makeEnvTextureArray(cdfImage.width, cdfImage.height, 2);

  for (let y = 0; y < image.height; y++) {
    const sinTheta = Math.sin((Math.PI * (y + 0.5)) / image.height);

    for (let x = 0; x < image.width; x++) {
      const i = 3 * (y * image.width + x);
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luminance *= sinTheta;
      cdf.set(x + 2, y, 0, cdf.get(x + 1, y, 0) + luminance / image.width);
      cdf.set(x + 1, y, 1, luminance);
    }

    const rowIntegral = cdf.get(cdfImage.width - 1, y, 0);

    for (let x = 1; x < cdf.width; x++) {
      cdf.set(x, y, 0, cdf.get(x, y, 0) / rowIntegral);
      cdf.set(x, y, 1, cdf.get(x, y, 1) / rowIntegral);
    }

    cdf.set(0, y + 1, 0, cdf.get(0, y, 0) + rowIntegral / image.height);
    cdf.set(0, y, 1, rowIntegral);
  }

  const integral = cdf.get(0, cdf.height - 1, 0);

  for (let y = 0; y < cdf.height; y++) {
    cdf.set(0, y, 0, cdf.get(0, y, 0) / integral);
    cdf.set(0, y, 1, cdf.get(0, y, 1) / integral);
  }

  cdfImage.data = cdf.array;

  return cdfImage;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const x = arr[i];

    arr[i] = arr[j];
    arr[j] = x;
  }
  return arr;
}

function makeStratifiedSampler(strataCount, dimensions) {
  const strata = [];
  const l = strataCount ** dimensions;

  for (let i = 0; i < l; i++) {
    strata[i] = i;
  }

  let index = strata.length;

  const sample = [];

  function restart() {
    index = 0;
  }

  function next() {
    if (index >= strata.length) {
      shuffle(strata);
      restart();
    }

    let stratum = strata[index++];

    for (let i = 0; i < dimensions; i++) {
      sample[i] = (stratum % strataCount) + Math.random();
      stratum = Math.floor(stratum / strataCount);
    }

    return sample;
  }

  return {
    next,
    restart,
    strataCount,
  };
}

function makeStratifiedSamplerCombined(strataCount, listOfDimensions) {
  const strataObjs = [];

  for (const dim of listOfDimensions) {
    strataObjs.push(makeStratifiedSampler(strataCount, dim));
  }

  const combined = [];

  function next() {
    let i = 0;

    for (const strata of strataObjs) {
      const nums = strata.next();

      for (const num of nums) {
        combined[i++] = num;
      }
    }

    return combined;
  }

  function restart() {
    for (const strata of strataObjs) {
      strata.restart();
    }
  }

  return {
    next,
    restart,
    strataCount,
  };
}

const bvhUtil =
  "IWZ1bmN0aW9uKCl7InVzZSBzdHJpY3QiO2NsYXNzIHR7Y29uc3RydWN0b3IodD0wLGU9MCxpPTApe3RoaXMueD10LHRoaXMueT1lLHRoaXMuej1pfWxlbmd0aCgpe3JldHVybiBNYXRoLnNxcnQodGhpcy54KnRoaXMueCt0aGlzLnkqdGhpcy55K3RoaXMueip0aGlzLnopfWFkZFZlY3RvcnModCxlKXtyZXR1cm4gdGhpcy54PXQueCtlLngsdGhpcy55PXQueStlLnksdGhpcy56PXQueitlLnosdGhpc31zdWJWZWN0b3JzKHQsZSl7cmV0dXJuIHRoaXMueD10LngtZS54LHRoaXMueT10LnktZS55LHRoaXMuej10LnotZS56LHRoaXN9bXVsdGlwbHlTY2FsYXIodCl7cmV0dXJuIHRoaXMueCo9dCx0aGlzLnkqPXQsdGhpcy56Kj10LHRoaXN9ZGl2aWRlKHQpe3JldHVybiB0aGlzLngvPXQueCx0aGlzLnkvPXQueSx0aGlzLnovPXQueix0aGlzfWRpdmlkZVNjYWxhcih0KXtyZXR1cm4gdGhpcy5tdWx0aXBseVNjYWxhcigxL3QpfW1pbih0KXtyZXR1cm4gdGhpcy54PU1hdGgubWluKHRoaXMueCx0LngpLHRoaXMueT1NYXRoLm1pbih0aGlzLnksdC55KSx0aGlzLno9TWF0aC5taW4odGhpcy56LHQueiksdGhpc31tYXgodCl7cmV0dXJuIHRoaXMueD1NYXRoLm1heCh0aGlzLngsdC54KSx0aGlzLnk9TWF0aC5tYXgodGhpcy55LHQueSksdGhpcy56PU1hdGgubWF4KHRoaXMueix0LnopLHRoaXN9ZG90KHQpe3JldHVybiB0aGlzLngqdC54K3RoaXMueSp0LnkrdGhpcy56KnQuen1ub3JtYWxpemUoKXtyZXR1cm4gdGhpcy5kaXZpZGVTY2FsYXIodGhpcy5sZW5ndGgoKXx8MSl9Y3Jvc3NWZWN0b3JzKHQsZSl7Y29uc3QgaT10Lngsbj10Lnkscj10Lnoscz1lLngsbz1lLnksaD1lLno7cmV0dXJuIHRoaXMueD1uKmgtcipvLHRoaXMueT1yKnMtaSpoLHRoaXMuej1pKm8tbipzLHRoaXN9ZnJvbUJ1ZmZlckF0dHJpYnV0ZSh0LGUsaSl7cmV0dXJuIHZvaWQgMCE9PWkmJmNvbnNvbGUud2FybigiVEhSRUUuVmVjdG9yMzogb2Zmc2V0IGhhcyBiZWVuIHJlbW92ZWQgZnJvbSAuZnJvbUJ1ZmZlckF0dHJpYnV0ZSgpLiIpLHRoaXMueD10LmdldFgoZSksdGhpcy55PXQuZ2V0WShlKSx0aGlzLno9dC5nZXRaKGUpLHRoaXN9fWNsYXNzIGV7Y29uc3RydWN0b3IoZT1uZXcgdCgxLzAsMS8wLDEvMCksaT1uZXcgdCgtMS8wLC0xLzAsLTEvMCkpe3RoaXMubWluPWUsdGhpcy5tYXg9aX1pc0VtcHR5KCl7cmV0dXJuIHRoaXMubWF4Lng8dGhpcy5taW4ueHx8dGhpcy5tYXgueTx0aGlzLm1pbi55fHx0aGlzLm1heC56PHRoaXMubWluLnp9Z2V0Q2VudGVyKHQpe3JldHVybiB0aGlzLmlzRW1wdHkoKT90LnNldCgwLDAsMCk6dC5hZGRWZWN0b3JzKHRoaXMubWluLHRoaXMubWF4KS5tdWx0aXBseVNjYWxhciguNSl9Z2V0U2l6ZSh0KXtyZXR1cm4gdGhpcy5pc0VtcHR5KCk/dC5zZXQoMCwwLDApOnQuc3ViVmVjdG9ycyh0aGlzLm1heCx0aGlzLm1pbil9ZXhwYW5kQnlQb2ludCh0KXtyZXR1cm4gdGhpcy5taW4ubWluKHQpLHRoaXMubWF4Lm1heCh0KSx0aGlzfXVuaW9uKHQpe3JldHVybiB0aGlzLm1pbi5taW4odC5taW4pLHRoaXMubWF4Lm1heCh0Lm1heCksdGhpc319ZnVuY3Rpb24gaSh0LGUsaSl7Y29uc3Qgbj10W2ldO3RbaV09dFtlXSx0W2VdPW59Y29uc3Qgbj1uZXcgdDtmdW5jdGlvbiByKHQsZSl7cmV0dXJue3ByaW1pdGl2ZXM6dCxib3VuZHM6ZX19ZnVuY3Rpb24gcyh0LGUsaSl7bGV0IG49aVtlXS10Lm1pbltlXTtyZXR1cm4gdC5tYXhbZV0+dC5taW5bZV0mJihuLz10Lm1heFtlXS10Lm1pbltlXSksbn1mdW5jdGlvbiBvKHQpe3JldHVybiB0LmdldFNpemUobiksMioobi54Km4ueituLngqbi55K24ueipuLnkpfWZ1bmN0aW9uIGgodCxhLHUpe2NvbnN0IGw9bmV3IGU7Zm9yKGxldCBlPWE7ZTx1O2UrKylsLnVuaW9uKHRbZV0uYm91bmRzKTtjb25zdCBjPXUtYTtpZigxPT09YylyZXR1cm4gcih0LnNsaWNlKGEsdSksbCk7e2NvbnN0IHk9bmV3IGU7Zm9yKGxldCBlPWE7ZTx1O2UrKyl5LmV4cGFuZEJ5UG9pbnQodFtlXS5jZW50ZXIpO2NvbnN0IHo9KHkuZ2V0U2l6ZShuKSxuLng+bi56P24ueD5uLnk/IngiOiJ5IjpuLno+bi55PyJ6IjoieSIpO2xldCBkPU1hdGguZmxvb3IoKGErdSkvMik7aWYoYzw9NCkhZnVuY3Rpb24odCxlLG49MCxyPXQubGVuZ3RoLHM9TWF0aC5mbG9vcigobityKS8yKSl7Zm9yKGxldCBvPW47bzw9cztvKyspe2xldCBuPW8scz10W29dO2ZvcihsZXQgaD1vKzE7aDxyO2grKyllKHMsdFtoXSl8fChuPWgscz10W2hdLGkodCxvLG4pKX19KHQsKCh0LGUpPT50LmNlbnRlclt6XTxlLmNlbnRlclt6XSksYSx1LGQpO2Vsc2V7aWYoeS5tYXhbel09PT15Lm1pblt6XSlyZXR1cm4gcih0LnNsaWNlKGEsdSksbCk7e2NvbnN0IG49MTIscj1bXTtmb3IobGV0IHQ9MDt0PG47dCsrKXIucHVzaCh7Ym91bmRzOm5ldyBlLGNvdW50OjB9KTtmb3IobGV0IGU9YTtlPHU7ZSsrKXtsZXQgaT1NYXRoLmZsb29yKG4qcyh5LHosdFtlXS5jZW50ZXIpKTtpPT09ci5sZW5ndGgmJihpPXIubGVuZ3RoLTEpLHJbaV0uY291bnQrKyxyW2ldLmJvdW5kcy51bmlvbih0W2VdLmJvdW5kcyl9Y29uc3QgaD1bXTtmb3IobGV0IHQ9MDt0PHIubGVuZ3RoLTE7dCsrKXtjb25zdCBpPW5ldyBlLG49bmV3IGU7bGV0IHM9MCxhPTA7Zm9yKGxldCBlPTA7ZTw9dDtlKyspaS51bmlvbihyW2VdLmJvdW5kcykscys9cltlXS5jb3VudDtmb3IobGV0IGU9dCsxO2U8ci5sZW5ndGg7ZSsrKW4udW5pb24ocltlXS5ib3VuZHMpLGErPXJbZV0uY291bnQ7aC5wdXNoKC4xKyhzKm8oaSkrYSpvKG4pKS9vKGwpKX1sZXQgYz1oWzBdLG09MDtmb3IobGV0IHQ9MTt0PGgubGVuZ3RoO3QrKyloW3RdPGMmJihjPWhbdF0sbT10KTtkPWZ1bmN0aW9uKHQsZSxuPTAscj10Lmxlbmd0aCl7Zm9yKDtuIT09cjspe2Zvcig7ZSh0W25dKTspaWYoKytuPT09cilyZXR1cm4gbjtkb3tpZihuPT09LS1yKXJldHVybiBufXdoaWxlKCFlKHRbcl0pKTtpKHQsbixyKSxuKyt9cmV0dXJuIG59KHQsKHQ9PntsZXQgZT1NYXRoLmZsb29yKHIubGVuZ3RoKnMoeSx6LHQuY2VudGVyKSk7cmV0dXJuIGU9PT1yLmxlbmd0aCYmKGU9ci5sZW5ndGgtMSksZTw9bX0pLGEsdSl9fXJldHVybiBtPXoseD1oKHQsYSxkKSxmPWgodCxkLHUpLHtjaGlsZDA6eCxjaGlsZDE6Zixib3VuZHM6KG5ldyBlKS51bmlvbih4LmJvdW5kcykudW5pb24oZi5ib3VuZHMpLHNwbGl0QXhpczptfX12YXIgbSx4LGZ9ZnVuY3Rpb24gYShpKXtjb25zdCBuPWZ1bmN0aW9uKGkpe2NvbnN0IG49W10scj1pLmdldEluZGV4P2kuZ2V0SW5kZXgoKS5hcnJheTppLmluZGV4LmFycmF5LHM9aS5nZXRBdHRyaWJ1dGU/aS5nZXRBdHRyaWJ1dGUoInBvc2l0aW9uIik6aS5hdHRyaWJ1dGVzLnBvc2l0aW9uLG89aS5nZXRBdHRyaWJ1dGU/aS5nZXRBdHRyaWJ1dGUoIm1hdGVyaWFsTWVzaEluZGV4Iik6aS5hdHRyaWJ1dGVzLm1hdGVyaWFsTWVzaEluZGV4LGg9bmV3IHQsYT1uZXcgdCx1PW5ldyB0LGw9bmV3IHQsYz1uZXcgdDtmb3IobGV0IG09MDttPHIubGVuZ3RoO20rPTMpe2NvbnN0IGk9clttXSx4PXJbbSsxXSxmPXJbbSsyXSx5PW5ldyBlO3MuZ2V0WD8oaC5mcm9tQnVmZmVyQXR0cmlidXRlKHMsaSksYS5mcm9tQnVmZmVyQXR0cmlidXRlKHMseCksdS5mcm9tQnVmZmVyQXR0cmlidXRlKHMsZikpOihoLng9cy5hcnJheVtpKnMuaXRlbVNpemVdLGgueT1zLmFycmF5W2kqcy5pdGVtU2l6ZSsxXSxoLno9cy5hcnJheVtpKnMuaXRlbVNpemUrMl0sYS54PXMuYXJyYXlbeCpzLml0ZW1TaXplXSxhLnk9cy5hcnJheVt4KnMuaXRlbVNpemUrMV0sYS56PXMuYXJyYXlbeCpzLml0ZW1TaXplKzJdLHUueD1zLmFycmF5W2Yqcy5pdGVtU2l6ZV0sdS55PXMuYXJyYXlbZipzLml0ZW1TaXplKzFdLHUuej1zLmFycmF5W2Yqcy5pdGVtU2l6ZSsyXSkseS5leHBhbmRCeVBvaW50KGgpLHkuZXhwYW5kQnlQb2ludChhKSx5LmV4cGFuZEJ5UG9pbnQodSksbC5zdWJWZWN0b3JzKHUsaCksYy5zdWJWZWN0b3JzKGEsaCk7Y29uc3Qgej0obmV3IHQpLmNyb3NzVmVjdG9ycyhjLGwpLm5vcm1hbGl6ZSgpLGQ9e2JvdW5kczp5LGNlbnRlcjp5LmdldENlbnRlcihuZXcgdCksaW5kaWNlczpbaSx4LGZdLGZhY2VOb3JtYWw6eixtYXRlcmlhbEluZGV4Om8uZ2V0WD9vLmdldFgoaSk6by5hcnJheVtpKm8uaXRlbVNpemVdfTtuLnB1c2goZCl9cmV0dXJuIG59KGkpO3JldHVybiBoKG4sMCxuLmxlbmd0aCl9c2VsZi5vbm1lc3NhZ2U9ZnVuY3Rpb24oe2RhdGE6dH0pe2NvbnN0e2dlb21ldHJ5OmV9PXQ7dHJ5e2NvbnN0IHQ9ZnVuY3Rpb24odCl7Y29uc3QgZT1bXSxpPVtdLG49e3g6MCx5OjEsejoyfTtsZXQgcj0xO2NvbnN0IHM9KHQsbz0xKT0+e2lmKHI9TWF0aC5tYXgobyxyKSx0LnByaW1pdGl2ZXMpZm9yKGxldCBuPTA7bjx0LnByaW1pdGl2ZXMubGVuZ3RoO24rKyl7Y29uc3Qgcj10LnByaW1pdGl2ZXNbbl07ZS5wdXNoKHIuaW5kaWNlc1swXSxyLmluZGljZXNbMV0sci5pbmRpY2VzWzJdLHQucHJpbWl0aXZlcy5sZW5ndGgsci5mYWNlTm9ybWFsLngsci5mYWNlTm9ybWFsLnksci5mYWNlTm9ybWFsLnosci5tYXRlcmlhbEluZGV4KSxpLnB1c2goITEpfWVsc2V7Y29uc3Qgcj10LmJvdW5kcztlLnB1c2goci5taW4ueCxyLm1pbi55LHIubWluLnosblt0LnNwbGl0QXhpc10sci5tYXgueCxyLm1heC55LHIubWF4LnosbnVsbCk7Y29uc3QgaD1lLmxlbmd0aC0xO2kucHVzaCghMCkscyh0LmNoaWxkMCxvKzEpLGVbaF09ZS5sZW5ndGgvNCxzKHQuY2hpbGQxLG8rMSl9fTtzKHQpO2NvbnN0IG89bmV3IEFycmF5QnVmZmVyKDQqZS5sZW5ndGgpLGg9bmV3IEZsb2F0MzJBcnJheShvKSxhPW5ldyBJbnQzMkFycmF5KG8pO2ZvcihsZXQgdT0wO3U8aS5sZW5ndGg7dSsrKXtsZXQgdD04KnU7aVt1XT8oaFt0XT1lW3RdLGhbdCsxXT1lW3QrMV0saFt0KzJdPWVbdCsyXSxhW3QrM109ZVt0KzNdKTooYVt0XT1lW3RdLGFbdCsxXT1lW3QrMV0sYVt0KzJdPWVbdCsyXSxhW3QrM109LWVbdCszXSksaFt0KzRdPWVbdCs0XSxoW3QrNV09ZVt0KzVdLGhbdCs2XT1lW3QrNl0sYVt0KzddPWVbdCs3XX1yZXR1cm57bWF4RGVwdGg6cixjb3VudDplLmxlbmd0aC80LGJ1ZmZlcjpofX0oYShlKSk7c2VsZi5wb3N0TWVzc2FnZSh7ZXJyb3I6bnVsbCxmbGF0dGVuZWRCdmg6dH0pfWNhdGNoKGkpe3NlbGYucG9zdE1lc3NhZ2Uoe2Vycm9yOmksZmxhdHRlbmVkQnZoOm51bGx9KX19fSgpOwo=";

const blob =
  "undefined" != typeof window &&
  window.Blob &&
  new Blob([atob(bvhUtil)], { type: "text/javascript;charset=utf-8" });

function webWorker() {
  const objectUrl =
    blob && (window.URL || window.webkitURL).createObjectURL(blob);

  try {
    return objectUrl
      ? new Worker(objectUrl)
      : new Worker("data:application/javascript;base64," + bvhUtil, {
          type: "module",
        });
  } finally {
    objectUrl && (window.URL || window.webkitURL).revokeObjectURL(objectUrl);
  }
}

class BVHWorker {
  constructor() {
    this.worker = webWorker();
    this.building = false;
  }

  build(geometry) {
    if (this.building) {
      throw new Error("BVHWorker is building");
    }

    this.building = true;

    return new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        this.building = false;
        this.worker.onmessage = null;

        const { flattenedBvh, error } = e.data;

        if (error) {
          reject(new Error(error));
        } else {
          resolve(flattenedBvh);
        }
      };

      this.worker.postMessage({ geometry });
    });
  }
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

function flattenBvh(bvh) {
  const flat = [];
  const isBounds = [];
  const splitAxisMap = { x: 0, y: 1, z: 2 };

  let maxDepth = 1;

  const traverse = (node, depth = 1) => {
    maxDepth = Math.max(depth, maxDepth);

    if (node.primitives) {
      for (let i = 0; i < node.primitives.length; i++) {
        const p = node.primitives[i];
        flat.push(
          p.indices[0],
          p.indices[1],
          p.indices[2],
          node.primitives.length,
          p.faceNormal.x,
          p.faceNormal.y,
          p.faceNormal.z,
          p.materialIndex
        );
        isBounds.push(false);
      }
    } else {
      const bounds = node.bounds;

      flat.push(
        bounds.min.x,
        bounds.min.y,
        bounds.min.z,
        splitAxisMap[node.splitAxis],
        bounds.max.x,
        bounds.max.y,
        bounds.max.z,
        null // pointer to second shild
      );

      const i = flat.length - 1;

      isBounds.push(true);

      traverse(node.child0, depth + 1);
      flat[i] = flat.length / 4; // pointer to second child
      traverse(node.child1, depth + 1);
    }
  };

  traverse(bvh);

  const buffer = new ArrayBuffer(4 * flat.length);
  const floatView = new Float32Array(buffer);
  const intView = new Int32Array(buffer);

  for (let i = 0; i < isBounds.length; i++) {
    let k = 8 * i;

    if (isBounds[i]) {
      floatView[k] = flat[k];
      floatView[k + 1] = flat[k + 1];
      floatView[k + 2] = flat[k + 2];
      intView[k + 3] = flat[k + 3];
    } else {
      intView[k] = flat[k];
      intView[k + 1] = flat[k + 1];
      intView[k + 2] = flat[k + 2];
      intView[k + 3] = -flat[k + 3];
    }

    floatView[k + 4] = flat[k + 4];
    floatView[k + 5] = flat[k + 5];
    floatView[k + 6] = flat[k + 6];
    intView[k + 7] = flat[k + 7];
  }

  return { maxDepth, count: flat.length / 4, buffer: floatView };
}

function createBvh(geometry, useWorker = true) {
  if (useWorker && window.Worker) {
    return new BVHWorker().build(geometry);
  }

  return new Promise((resolve) => {
    const bvh = bvhAccel(geometry);
    const flattenedBvh = flattenBvh(bvh);

    resolve(flattenedBvh);
  });
}

// var fragment = {
//   source: (e) =>
//     "\n#define PI 3.14159265359\n#define TWOPI 6.28318530718\n#define INVPI 0.31830988618\n#define INVPI2 0.10132118364\n#define EPS 0.0001\n#define ONE_MINUS_EPS 0.999999\n#define INF 1000000.0\n#define ROUGHNESS_MIN 0.001\n#define DISNEY 0\nconst vec3 luminance=vec3(0.2126,0.7152,0.0722);float LGL_AV(vec3 color){return dot(color,luminance);}\n#define RAY_MAX_DISTANCE 9999.0\nstruct Ray{vec3 o;vec3 d;vec3 LGL_BN;float LGL_BO;};struct Path{Ray ray;vec3 li;float alpha;vec3 beta;bool LGL_BQ;float LGL_BR;vec3 LGL_BS;};struct Camera{mat4 transform;float aspect;float fov;float focus;float aperture;};\n#if defined(NUM_LIGHTS)\nstruct Lights{vec3 position[NUM_LIGHTS];vec3 emission[NUM_LIGHTS];vec3 p1[NUM_LIGHTS];vec3 p2[NUM_LIGHTS];vec4 params[NUM_LIGHTS];};struct Light{vec3 position;vec3 emission;vec3 p1;vec3 p2;float radius;float area;float type;float visible;};\n#endif\nstruct SurfaceInteraction{bool LGL_BK;bool LGL_BI;float t;vec3 position;vec3 normal;vec3 LGL_BM;vec3 LGL_BL;vec3 tangent;vec3 bitangent;vec3 color;vec3 extinction;vec3 emissive;int LGL_BH;float roughness;float metalness;float LGL_BF;float LGL_BB;float LGL_Ay;float sheen;float LGL_Az;float clearcoat;float LGL_BA;float LGL_BC;float ior;float LGL_BE;float eta;float LGL_BD;vec3 specularColor;float LGL_BG;};struct BsdfSampleRec{vec3 L;vec3 f;float pdf;};struct LightSampleRec{vec3 normal;vec3 emission;vec3 direction;float dist;float pdf;};void LGL_AW(inout Ray ray,vec3 origin,vec3 direction){ray.o=origin;ray.d=direction;ray.LGL_BN=1.0/ray.d;ray.LGL_BO=RAY_MAX_DISTANCE;}void LGL_AW(inout Ray ray,vec3 origin,vec3 direction,float rMax){ray.o=origin;ray.d=direction;ray.LGL_BN=1.0/ray.d;ray.LGL_BO=rMax;}ivec2 LGL_AX(int i,int LGL_BT){ivec2 u;u.y=i>>LGL_BT;u.x=i-(u.y<<LGL_BT);return u;}vec4 LGL_AY(sampler2D s,int i,int LGL_BT){return texelFetch(s,LGL_AX(i,LGL_BT),0);}ivec4 LGL_AY(isampler2D s,int i,int LGL_BT){return texelFetch(s,LGL_AX(i,LGL_BT),0);}uniform Camera camera;uniform vec2 pixelSize;uniform vec2 jitter;uniform float frameCount;in vec2 vCoord;\n#if defined(NUM_LIGHTS)\nuniform Lights lights;\n#endif\nuniform int bounces;uniform vec3 backgroundColor;uniform float envMapIntensity;uniform float enviromentVisible;uniform sampler2D noiseTex;uniform float stratifiedSamples[71];uniform float strataSize;float pixelSeed;float LGL_AN(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}uvec4 seed;ivec2 pixel;void LGL_AO(float frame){pixel=ivec2(vCoord/pixelSize);seed=uvec4(pixel,int(frame),pixel.x+pixel.y);}void LGL_AP(inout uvec4 v){v=v*1664525u+1013904223u;v.x+=v.y*v.w;v.y+=v.z*v.x;v.z+=v.x*v.y;v.w+=v.y*v.z;v=v ^(v>>16u);v.x+=v.y*v.w;v.y+=v.z*v.x;v.z+=v.x*v.y;v.w+=v.y*v.z;}float LGL_AQ(){LGL_AP(seed);return float(seed.x)/float(0xffffffffu);}vec2 LGL_AQ2(){LGL_AP(seed);return vec2(seed.xy)/float(0xffffffffu);}void LGL_AS(float frame){vec2 noiseSize=vec2(textureSize(noiseTex,0));pixelSeed=texture(noiseTex,vCoord/(pixelSize*noiseSize)).r;LGL_AO(frame);}int sampleIndex=0;float LGL_AQomSample(){float stratifiedSample=stratifiedSamples[sampleIndex++];float LGL_AQom=fract((stratifiedSample+pixelSeed)*strataSize);return EPS+(1.0-2.0*EPS)*LGL_AQom;}vec2 LGL_AQomSampleVec2(){return vec2(LGL_AQomSample(),LGL_AQomSample());}struct MaterialSamples{vec2 s1;vec2 s2;vec2 s3;vec2 s4;};MaterialSamples getRandomMaterialSamples(){MaterialSamples samples;samples.s1=LGL_AQomSampleVec2();samples.s2=LGL_AQomSampleVec2();samples.s3=LGL_AQomSampleVec2();samples.s4=LGL_AQomSampleVec2();return samples;}vec4 LGL_An(sampler2D map,vec2 uv){\n#ifdef OES_texture_float_linear\nreturn texture(map,uv);\n#else\nvec2 size=vec2(textureSize(map,0));vec2 texelSize=1.0/size;uv=uv*size-0.5;vec2 f=fract(uv);uv=floor(uv)+0.5;vec4 s1=texture(map,(uv+vec2(0,0))*texelSize);vec4 s2=texture(map,(uv+vec2(1,0))*texelSize);vec4 s3=texture(map,(uv+vec2(0,1))*texelSize);vec4 s4=texture(map,(uv+vec2(1,1))*texelSize);return mix(mix(s1,s2,f.x),mix(s3,s4,f.x),f.y);\n#endif\n}uniform Materials{vec4 colorAndMaterialType[NUM_MATERIALS];vec4 roughnessMetalnessNormalScale[NUM_MATERIALS];vec4 alphaSpecularTintSheenSheenTint[NUM_MATERIALS];vec4 clearcoaRoughnessSubfaceTransmission[NUM_MATERIALS];vec4 iorAtDistanceAnisotropicWorkflow[NUM_MATERIALS];vec4 extinction[NUM_MATERIALS];vec4 specularColorGlossiness[NUM_MATERIALS];\n#if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS) || defined(NUM_PBR_MAPS)\nivec4 diffuseNormalRoughnessMetalnessMapIndex[NUM_MATERIALS];\n#endif\n#if defined(NUM_EMISSIVE_MAPS) || defined(NUM_PBR_SG_MAPS)\nivec4 emissiveSpecularGlossinessMapIndex[NUM_MATERIALS];\n#endif\n#if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS)\nvec4 diffuseNormalMapSize[NUM_DIFFUSE_NORMAL_MAPS];\n#endif\n#if defined(NUM_PBR_MAPS)\nvec2 pbrMapSize[NUM_PBR_MAPS];\n#else\n#if defined(NUM_PBR_SG_MAPS)\nvec2 pbrMapSize[NUM_PBR_SG_MAPS];\n#else\n#if defined(NUM_EMISSIVE_MAPS)\nvec2 pbrMapSize[NUM_EMISSIVE_MAPS];\n#endif\n#endif\n#endif\n}materials;\n#ifdef NUM_DIFFUSE_MAPS\nuniform mediump sampler2DArray diffuseMap;\n#endif\n#ifdef NUM_NORMAL_MAPS\nuniform mediump sampler2DArray normalMap;\n#endif\n#ifdef NUM_PBR_MAPS\nuniform mediump sampler2DArray pbrMap;\n#endif\n#ifdef NUM_PBR_SG_MAPS\nuniform mediump sampler2DArray pbrSGMap;\n#endif\n#ifdef NUM_EMISSIVE_MAPS\nuniform mediump sampler2DArray emissiveMap;\n#endif\nfloat LGL_p(int materialIndex){return materials.colorAndMaterialType[materialIndex].w;}float LGL_q(int materialIndex){return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].w;}vec3 LGL_r(int materialIndex,vec2 uv){vec3 emissive=vec3(0.0);\n#ifdef NUM_EMISSIVE_MAPS\nint emissiveMapIndex=materials.emissiveSpecularGlossinessMapIndex[materialIndex].x;if(emissiveMapIndex>=0){emissive=texture(emissiveMap,vec3(uv*materials.pbrMapSize[emissiveMapIndex].xy,emissiveMapIndex)).rgb;}\n#endif\nreturn emissive;}vec3 LGL_s(int materialIndex,vec2 uv){vec3 specularColor=materials.specularColorGlossiness[materialIndex].rgb;\n#ifdef NUM_PBR_SG_MAPS\nint specularMapIndex=materials.emissiveSpecularGlossinessMapIndex[materialIndex].y;if(specularMapIndex>=0){vec3 texelSpecular=texture(pbrSGMap,vec3(uv*materials.pbrMapSize[specularMapIndex].xy,specularMapIndex)).rgb;texelSpecular=pow(texelSpecular,vec3(2.2));specularColor*=texelSpecular;}\n#endif\nreturn specularColor;}float LGL_t(int materialIndex,vec2 uv){float glossiness=materials.specularColorGlossiness[materialIndex].a;\n#ifdef NUM_PBR_SG_MAPS\nint glossinessMapIndex=materials.emissiveSpecularGlossinessMapIndex[materialIndex].z;if(glossinessMapIndex>=0){float texelGlossiness=texture(pbrSGMap,vec3(uv*materials.pbrMapSize[glossinessMapIndex].xy,glossinessMapIndex)).a;glossiness*=texelGlossiness;}\n#endif\nreturn glossiness;}float LGL_u(int materialIndex,vec2 uv){float LGL_BG=LGL_q(materialIndex);float roughness=0.0;if(LGL_BG>0.1){roughness=1.0-LGL_t(materialIndex,uv);}else{roughness=materials.roughnessMetalnessNormalScale[materialIndex].x;\n#ifdef NUM_PBR_MAPS\nint roughnessMapIndex=materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].z;if(roughnessMapIndex>=0){roughness*=texture(pbrMap,vec3(uv*materials.pbrMapSize[roughnessMapIndex].xy,roughnessMapIndex)).g;}\n#endif\n}return roughness*roughness;}float LGL_v(const vec3 v){return max(v.x,max(v.y,v.z));}float LGL_w(const vec3 specularColor){return LGL_v(specularColor);}vec3 LGL_x(const vec3 baseColor,float metallic){return baseColor*(1.0-metallic);}float LGL_y(int materialIndex,vec2 uv){float LGL_BG=LGL_q(materialIndex);float metalness=0.0;if(LGL_BG>0.1){vec3 specularFactor=LGL_s(materialIndex,uv);metalness=LGL_w(specularFactor);}else{metalness=materials.roughnessMetalnessNormalScale[materialIndex].y;\n#ifdef NUM_PBR_MAPS\nint metalnessMapIndex=materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].w;if(metalnessMapIndex>=0){metalness*=texture(pbrMap,vec3(uv*materials.pbrMapSize[metalnessMapIndex].xy,metalnessMapIndex)).b;}\n#endif\n}return metalness;}vec3 LGL_z(int materialIndex,vec2 uv){vec3 color=materials.colorAndMaterialType[materialIndex].rgb;\n#ifdef NUM_DIFFUSE_MAPS\nint diffuseMapIndex=materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;if(diffuseMapIndex>=0){color*=texture(diffuseMap,vec3(uv*materials.diffuseNormalMapSize[diffuseMapIndex].xy,diffuseMapIndex)).rgb;}\n#endif\nfloat LGL_BG=LGL_q(materialIndex);if(LGL_BG>0.1){vec3 specularFactor=LGL_s(materialIndex,uv);color=LGL_x(color,LGL_w(specularFactor));}return color;}vec3 LGL_AA(int materialIndex,vec2 uv,vec3 normal,vec3 dp1,vec3 dp2,vec2 duv1,vec2 duv2,inout vec3 tangent,inout vec3 bitangent){vec3 dp2perp=cross(dp2,normal);vec3 dp1perp=cross(normal,dp1);vec3 dpdu=dp2perp*duv1.x+dp1perp*duv2.x;vec3 dpdv=dp2perp*duv1.y+dp1perp*duv2.y;float invmax=inversesqrt(max(dot(dpdu,dpdu),dot(dpdv,dpdv)));dpdu*=invmax;dpdv*=invmax;tangent=normalize(dpdu);bitangent=normalize(dpdv);\n#ifdef NUM_NORMAL_MAPS\nint normalMapIndex=materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].y;if(normalMapIndex>=0){vec3 n=2.0*texture(normalMap,vec3(uv*materials.diffuseNormalMapSize[normalMapIndex].zw,normalMapIndex)).rgb-1.0;n.xy*=materials.roughnessMetalnessNormalScale[materialIndex].zw;mat3 tbn=mat3(dpdu,dpdv,normal);return normalize(tbn*n);}else{return normal;}\n#endif\nreturn normal;}float LGL_AD(int materialIndex,vec2 uv){float alpha=materials.alphaSpecularTintSheenSheenTint[materialIndex].x;\n#ifdef NUM_DIFFUSE_MAPS\nint diffuseMapIndex=materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;if(diffuseMapIndex>=0){alpha*=texture(diffuseMap,vec3(uv*materials.diffuseNormalMapSize[diffuseMapIndex].xy,diffuseMapIndex)).a;}\n#endif\nreturn alpha;}float LGL_AB(int materialIndex){return materials.alphaSpecularTintSheenSheenTint[materialIndex].y;}float LGL_AC(int materialIndex){return materials.alphaSpecularTintSheenSheenTint[materialIndex].z;}float LGL_ACTint(int materialIndex){return materials.alphaSpecularTintSheenSheenTint[materialIndex].w;}float LGL_AF(int materialIndex){return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].x;}float LGL_AFRoughness(int materialIndex){return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].y;}float LGL_AH(int materialIndex){return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].z;}float LGL_AI(int materialIndex){return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].w;}float LGL_AJ(int materialIndex){return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].x;}float LGL_AK(int materialIndex){return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].y;}float LGL_AL(int materialIndex){return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].z;}vec3 LGL_AM(int materialIndex){return materials.extinction[materialIndex].rgb;}uniform sampler2D positionBuffer;uniform sampler2D normalBuffer;uniform sampler2D uvBuffer;uniform sampler2D bvhBuffer;struct Triangle{vec3 p0;vec3 p1;vec3 p2;};struct Box{vec3 min;vec3 max;};struct TriangleIntersect{float t;vec3 barycentric;};float LGL_f(float rad,vec3 pos,Ray r){vec3 op=pos-r.o;float eps=0.001;float b=dot(op,r.d);float det=b*b-dot(op,op)+rad*rad;if(det<0.0)return INF;det=sqrt(det);float t1=b-det;if(t1>eps)return t1;float t2=b+det;if(t2>eps)return t2;return INF;}float LGL_g(in vec3 pos,in vec3 u,in vec3 v,in vec4 plane,in Ray r){vec3 n=vec3(plane);float dt=dot(r.d,n);float t=(plane.w-dot(n,r.o))/dt;if(t>EPS){vec3 p=r.o+r.d*t;vec3 vi=p-pos;float a1=dot(u,vi);if(a1>=0.&&a1<=1.){float a2=dot(v,vi);if(a2>=0.&&a2<=1.)return t;}}return INF;}float LGL_h(vec3 v0,vec3 v1,vec3 v2,Ray r,bool isDoubleSided){vec3 edge1=v1-v0;vec3 edge2=v2-v0;vec3 pvec=cross(r.d,edge2);float det=1.0/dot(edge1,pvec);if(!isDoubleSided&&det<0.0)return INF;vec3 tvec=r.o-v0;float u=dot(tvec,pvec)*det;vec3 qvec=cross(tvec,edge1);float v=dot(r.d,qvec)*det;float t=dot(edge2,qvec)*det;return(u<0.0||u>1.0||v<0.0||u+v>1.0||t<=0.0)? INF : t;}float LGL_gClassic(vec3 v1,vec3 v2,vec3 v3,vec3 v4,Ray r,bool isDoubleSided){return min(LGL_h(v1,v3,v2,r,isDoubleSided),LGL_h(v2,v3,v4,r,isDoubleSided));}void LGL_j(inout SurfaceInteraction si,Triangle tri,vec3 barycentric,ivec3 index,vec3 LGL_BM,int materialIndex){si.LGL_BK=true;si.LGL_BM=LGL_BM;si.position=barycentric.x*tri.p0+barycentric.y*tri.p1+barycentric.z*tri.p2;ivec2 i0=LGL_AX(index.x,VERTEX_COLUMNS);ivec2 i1=LGL_AX(index.y,VERTEX_COLUMNS);ivec2 i2=LGL_AX(index.z,VERTEX_COLUMNS);vec3 n0=texelFetch(normalBuffer,i0,0).xyz;vec3 n1=texelFetch(normalBuffer,i1,0).xyz;vec3 n2=texelFetch(normalBuffer,i2,0).xyz;vec3 normal=normalize(barycentric.x*n0+barycentric.y*n1+barycentric.z*n2);vec2 uv0=texelFetch(uvBuffer,i0,0).xy;vec2 uv1=texelFetch(uvBuffer,i1,0).xy;vec2 uv2=texelFetch(uvBuffer,i2,0).xy;\n#if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS) || defined(NUM_PBR_MAPS)\nvec2 uv=fract(barycentric.x*uv0+barycentric.y*uv1+barycentric.z*uv2);\n#else\nvec2 uv=vec2(0.0);\n#endif\nsi.LGL_BH=int(LGL_p(materialIndex));si.color=LGL_z(materialIndex,uv);si.roughness=LGL_u(materialIndex,uv);si.metalness=LGL_y(materialIndex,uv);si.specularColor=LGL_s(materialIndex,uv);si.LGL_BG=LGL_q(materialIndex);si.emissive=LGL_r(materialIndex,uv);vec3 dp1=tri.p0-tri.p2;vec3 dp2=tri.p1-tri.p2;vec2 duv1=uv0-uv2;vec2 duv2=uv1-uv2;si.normal=LGL_AA(materialIndex,uv,normal,dp1,dp2,duv1,duv2,si.tangent,si.bitangent);si.LGL_Ay=LGL_AB(materialIndex);si.sheen=LGL_AC(materialIndex);si.LGL_Az=LGL_ACTint(materialIndex);si.clearcoat=LGL_AF(materialIndex);si.LGL_BA=LGL_AFRoughness(materialIndex);si.LGL_BB=LGL_AH(materialIndex);si.LGL_BC=LGL_AI(materialIndex);si.LGL_BD=LGL_AD(materialIndex,uv);si.ior=LGL_AJ(materialIndex);si.LGL_BE=LGL_AK(materialIndex);si.LGL_BF=LGL_AL(materialIndex);si.extinction=LGL_AM(materialIndex);}TriangleIntersect LGL_k(Ray r,Triangle tri){vec3 v0=tri.p0;vec3 v1=tri.p1;vec3 v2=tri.p2;TriangleIntersect ti;vec3 e0=v1-v0;vec3 e1=v2-v0;vec3 pv=cross(r.d,e1);float det=dot(e0,pv);vec3 tv=r.o-v0;vec3 qv=cross(tv,e0);vec4 uvt;uvt.x=dot(tv,pv);uvt.y=dot(r.d,qv);uvt.z=dot(e1,qv);uvt.xyz=uvt.xyz/det;uvt.w=1.0-uvt.x-uvt.y;if(uvt.z>=r.LGL_BO){return ti;}if(all(greaterThanEqual(uvt,vec4(0.0)))&&uvt.z<INF){ti.t=uvt.z;ti.barycentric=uvt.wxy;}return ti;}float LGL_l(Ray r,Box b){vec3 tBot=(b.min-r.o)*r.LGL_BN;vec3 tTop=(b.max-r.o)*r.LGL_BN;vec3 tNear=min(tBot,tTop);vec3 tFar=max(tBot,tTop);float t0=max(tNear.x,max(tNear.y,tNear.z));float t1=min(tFar.x,min(tFar.y,tFar.z));return(t0>t1||t0>r.LGL_BO)?-1.0 :(t0>0.0 ? t0 : t1);}bool LGL_m(inout Ray ray,float maxDist){\n#if defined(NUM_LIGHTS)\nfor(int i=0;i<NUM_LIGHTS;i++){vec3 position=lights.position[i];vec3 emission=lights.emission[i];vec3 p1=lights.p1[i];vec3 p2=lights.p2[i];vec4 params=lights.params[i];float radius=params.x;float area=params.y;float type=params.z;float visible=params.w;if(type==0.||type==1.){vec3 normal=normalize(cross(p1,p2));if(dot(normal,ray.d)>0.)continue;vec4 plane=vec4(normal,dot(normal,position));p1*=1.0/dot(p1,p1);p2*=1.0/dot(p2,p2);float d=LGL_g(position,p1,p2,plane,ray);if(d>0.&&d<maxDist)return true;}if(type==1.){float d=LGL_f(radius,position,ray);if(d>0.&&d<maxDist)return true;}}\n#endif\nint nodesToVisit[STACK_SIZE];nodesToVisit[0]=0;int stack=0;while(stack>=0){int i=nodesToVisit[stack--];vec4 r1=LGL_AY(bvhBuffer,i,BVH_COLUMNS);vec4 r2=LGL_AY(bvhBuffer,i+1,BVH_COLUMNS);int splitAxisOrNumPrimitives=floatBitsToInt(r1.w);if(splitAxisOrNumPrimitives>=0){int splitAxis=splitAxisOrNumPrimitives;Box bbox=Box(r1.xyz,r2.xyz);if(LGL_l(ray,bbox)>0.0){if(ray.d[splitAxis]>0.0){nodesToVisit[++stack]=floatBitsToInt(r2.w);nodesToVisit[++stack]=i+2;}else{nodesToVisit[++stack]=i+2;nodesToVisit[++stack]=floatBitsToInt(r2.w);}}}else{ivec3 index=floatBitsToInt(r1.xyz);Triangle tri=Triangle(LGL_AY(positionBuffer,index.x,VERTEX_COLUMNS).xyz,LGL_AY(positionBuffer,index.y,VERTEX_COLUMNS).xyz,LGL_AY(positionBuffer,index.z,VERTEX_COLUMNS).xyz);TriangleIntersect LGL_BK=LGL_k(ray,tri);if(LGL_BK.t>0.0&&LGL_BK.t<maxDist){return true;}}}return false;}void LGL_n(inout Ray ray,inout SurfaceInteraction si,inout LightSampleRec lightSampleRec,int bounce){si.LGL_BK=false;float t=INF;float d;\n#if defined(NUM_LIGHTS)\nfor(int i=0;i<NUM_LIGHTS;i++){vec4 params=lights.params[i];float radius=params.x;float area=params.y;float type=params.z;float visible=params.w;if(bounce==0&&visible<0.1)continue;vec3 position=lights.position[i];vec3 emission=lights.emission[i];vec3 p1=lights.p1[i];vec3 p2=lights.p2[i];if(type==0.||type==1.){vec3 normal=normalize(cross(p1,p2));if(dot(normal,ray.d)>0.)continue;vec4 plane=vec4(normal,dot(normal,position));p1*=1.0/dot(p1,p1);p2*=1.0/dot(p2,p2);d=LGL_g(position,p1,p2,plane,ray);if(d<0.)d=INF;if(d<t){t=d;float cosTheta=dot(-ray.d,normal);float pdf=(t*t)/(area*cosTheta);lightSampleRec.emission=emission;lightSampleRec.pdf=pdf;si.LGL_BK=true;si.LGL_BI=true;ray.LGL_BO=t;}}if(type==2.){d=LGL_f(radius,position,ray);if(d<0.)d=INF;if(d<t){t=d;float pdf=(t*t)/area;lightSampleRec.emission=emission;lightSampleRec.pdf=pdf;si.LGL_BK=true;si.LGL_BI=true;ray.LGL_BO=t;}}}\n#endif\nint nodesToVisit[STACK_SIZE];nodesToVisit[0]=0;int stack=0;while(stack>=0){int i=nodesToVisit[stack--];vec4 r1=LGL_AY(bvhBuffer,i,BVH_COLUMNS);vec4 r2=LGL_AY(bvhBuffer,i+1,BVH_COLUMNS);int splitAxisOrNumPrimitives=floatBitsToInt(r1.w);if(splitAxisOrNumPrimitives>=0){int splitAxis=splitAxisOrNumPrimitives;Box bbox=Box(r1.xyz,r2.xyz);if(LGL_l(ray,bbox)>0.0){if(ray.d[splitAxis]>0.0){nodesToVisit[++stack]=floatBitsToInt(r2.w);nodesToVisit[++stack]=i+2;}else{nodesToVisit[++stack]=i+2;nodesToVisit[++stack]=floatBitsToInt(r2.w);}}}else{ivec3 index=floatBitsToInt(r1.xyz);Triangle tri=Triangle(LGL_AY(positionBuffer,index.x,VERTEX_COLUMNS).xyz,LGL_AY(positionBuffer,index.y,VERTEX_COLUMNS).xyz,LGL_AY(positionBuffer,index.z,VERTEX_COLUMNS).xyz);TriangleIntersect LGL_BK=LGL_k(ray,tri);if(LGL_BK.t>0.0){int materialIndex=floatBitsToInt(r2.w);vec3 LGL_BM=r2.xyz;si.t=LGL_BK.t;si.LGL_BI=false;ray.LGL_BO=LGL_BK.t;LGL_j(si,tri,LGL_BK.barycentric,index,LGL_BM,materialIndex);si.LGL_BL=dot(si.LGL_BM,ray.d)<=0.0 ? si.normal :-si.normal;}}}si.roughness=clamp(si.roughness,ROUGHNESS_MIN,1.0);si.metalness=clamp(si.metalness,0.0,1.0);}void LGL_o(inout Ray ray,inout SurfaceInteraction si,inout LightSampleRec lightSampleRec,int depth){if(si.LGL_BK&&!si.LGL_BI&&si.LGL_BD<1.0){float LGL_BJ=LGL_AQ();while(si.LGL_BK&&!si.LGL_BI&&LGL_BJ>si.LGL_BD){LGL_AW(ray,si.position+EPS*ray.d,ray.d);LGL_n(ray,si,lightSampleRec,depth);}}}\n#ifndef CONST_COLOR_ENV\nuniform sampler2D envMap;uniform sampler2D envMapDistribution;vec2 LGL_Y(vec3 pointOnSphere){float phi=mod(atan(-pointOnSphere.z,-pointOnSphere.x),TWOPI);float theta=acos(pointOnSphere.y);return vec2(phi*0.5*INVPI,theta*INVPI);}vec3 LGL_Z(vec3 d){vec2 uv=LGL_Y(d);return LGL_An(envMap,uv).rgb;}float LGL_a(float u,out int vOffset,out float pdf){ivec2 size=textureSize(envMap,0);int left=0;int right=size.y+1;while(left<right){int mid=(left+right)>>1;float s=texelFetch(envMapDistribution,ivec2(0,mid),0).x;if(s<=u){left=mid+1;}else{right=mid;}}vOffset=left-1;vec2 s0=texelFetch(envMapDistribution,ivec2(0,vOffset),0).xy;vec2 s1=texelFetch(envMapDistribution,ivec2(0,vOffset+1),0).xy;pdf=s0.y;return(float(vOffset)+(u-s0.x)/(s1.x-s0.x))/float(size.y);}float LGL_b(float u,int vOffset,out float pdf){ivec2 size=textureSize(envMap,0);int left=0;int right=size.x+1;while(left<right){int mid=(left+right)>>1;float s=texelFetch(envMapDistribution,ivec2(1+mid,vOffset),0).x;if(s<=u){left=mid+1;}else{right=mid;}}int uOffset=left-1;vec2 s0=texelFetch(envMapDistribution,ivec2(1+uOffset,vOffset),0).xy;vec2 s1=texelFetch(envMapDistribution,ivec2(1+uOffset+1,vOffset),0).xy;pdf=s0.y;return(float(uOffset)+(u-s0.x)/(s1.x-s0.x))/float(size.x);}float LGL_c(vec2 uv){vec2 size=vec2(textureSize(envMap,0));float sinTheta=sin(uv.y*PI);uv*=size;float partialX=texelFetch(envMapDistribution,ivec2(1.0+uv.x,uv.y),0).y;float partialY=texelFetch(envMapDistribution,ivec2(0,uv.y),0).y;return partialX*partialY*INVPI2/(2.0*sinTheta);}vec3 LGL_d(vec2 LGL_AQom,out vec2 uv,out float pdf){vec2 partialPdf;int vOffset;uv.y=LGL_a(LGL_AQom.x,vOffset,partialPdf.y);uv.x=LGL_b(LGL_AQom.y,vOffset,partialPdf.x);float phi=uv.x*TWOPI;float theta=uv.y*PI;float cosTheta=cos(theta);float sinTheta=sin(theta);float cosPhi=cos(phi);float sinPhi=sin(phi);vec3 dir=vec3(-sinTheta*cosPhi,cosTheta,-sinTheta*sinPhi);pdf=partialPdf.x*partialPdf.y*INVPI2/(2.0*sinTheta);return dir;}\n#endif\nvoid LGL_AZ(in vec3 N,inout vec3 T,inout vec3 B){if(N.z<-0.999999){T=vec3(0.,-1.,0.);B=vec3(-1.,0.,0.);}else{float a=1.0/(1.+N.z);float b=-N.x*N.y*a;T=vec3(1.0-N.x*N.x*a,b,-N.x);B=vec3(b,1.-N.y*N.y*a,-N.y);}}vec3 LGL_Am(vec3 V,float rgh,float r1,float r2){vec3 Vh=normalize(vec3(rgh*V.x,rgh*V.y,V.z));float lensq=Vh.x*Vh.x+Vh.y*Vh.y;vec3 T1=lensq>0. ? vec3(-Vh.y,Vh.x,0)*inversesqrt(lensq): vec3(1.,0.,0.);vec3 T2=cross(Vh,T1);float r=sqrt(r1);float phi=2.0*PI*r2;float t1=r*cos(phi);float t2=r*sin(phi);float s=0.5*(1.0+Vh.z);t2=(1.0-s)*sqrt(1.0-t1*t1)+s*t2;vec3 Nh=t1*T1+t2*T2+sqrt(max(0.0,1.0-t1*t1-t2*t2))*Vh;return normalize(vec3(rgh*Nh.x,rgh*Nh.y,max(0.0,Nh.z)));}vec2 LGL_Aa(vec2 p){p=2.0*p-1.0;bool greater=abs(p.x)>abs(p.y);float r=greater ? p.x : p.y;float theta=greater ? 0.25*PI*p.y/p.x : PI*(0.5-0.25*p.x/p.y);return r*vec2(cos(theta),sin(theta));}vec3 LGL_Ab(vec2 p){vec2 h=LGL_Aa(p);float z=sqrt(max(0.0,1.0-h.x*h.x-h.y*h.y));return vec3(h,z);}vec3 LGL_Ac(float r1,float r2){float z=1.0-2.0*r1;float r=sqrt(max(0.0,1.0-z*z));float phi=TWOPI*r2;return vec3(r*cos(phi),r*sin(phi),z);}vec3 LGL_Ad(vec3 LGL_BM,vec3 viewDir,mat3 basis,float roughness,vec2 LGL_AQom){float phi=TWOPI*LGL_AQom.y;float alpha=roughness*roughness;float cosTheta=sqrt((1.0-LGL_AQom.x)/(1.0+(alpha*alpha-1.0)*LGL_AQom.x));float sinTheta=sqrt(1.0-cosTheta*cosTheta);vec3 halfVector=basis*sign(dot(LGL_BM,viewDir))*vec3(sinTheta*cos(phi),sinTheta*sin(phi),cosTheta);vec3 lightDir=reflect(-viewDir,halfVector);return lightDir;}vec3 LGL_Ae(vec3 LGL_BM,vec3 viewDir,mat3 basis,vec2 LGL_AQom){return basis*sign(dot(LGL_BM,viewDir))*LGL_Ab(LGL_AQom);}float LGL_Af(float f,float g){return(f*f)/(f*f+g*g);}vec3 LGL_Ag(in Ray r,int depth,in LightSampleRec lightSampleRec,in BsdfSampleRec bsdfSampleRec){vec3 Le;if(depth==0){Le=lightSampleRec.emission;}else{Le=LGL_Af(bsdfSampleRec.pdf,lightSampleRec.pdf)*lightSampleRec.emission;}return Le;}\n#if defined(NUM_LIGHTS)\nvoid LGL_Ah(in Light light,in vec3 surfacePos,inout LightSampleRec lightSampleRec,vec2 LGL_AQom){float r1=LGL_AQom.x;float r2=LGL_AQom.y;vec3 lightSurfacePos=light.position+LGL_Ac(r1,r2)*light.radius;lightSampleRec.direction=lightSurfacePos-surfacePos;lightSampleRec.dist=length(lightSampleRec.direction);float distSq=lightSampleRec.dist*lightSampleRec.dist;lightSampleRec.direction/=lightSampleRec.dist;lightSampleRec.normal=normalize(lightSurfacePos-light.position);lightSampleRec.emission=light.emission*float(NUM_LIGHTS);lightSampleRec.pdf=distSq/(light.area*abs(dot(lightSampleRec.normal,lightSampleRec.direction)));}void LGL_Aj(in Light light,in vec3 surfacePos,inout LightSampleRec lightSampleRec,vec2 LGL_AQom){float r1=LGL_AQom.x;float r2=LGL_AQom.y;vec3 lightSurfacePos=light.position+light.p1*r1+light.p2*r2;lightSampleRec.direction=lightSurfacePos-surfacePos;lightSampleRec.dist=length(lightSampleRec.direction);float distSq=lightSampleRec.dist*lightSampleRec.dist;lightSampleRec.direction/=lightSampleRec.dist;lightSampleRec.normal=normalize(cross(light.p1,light.p2));lightSampleRec.emission=light.emission*float(NUM_LIGHTS);lightSampleRec.pdf=distSq/(light.area*abs(dot(lightSampleRec.normal,lightSampleRec.direction)));}void LGL_Ak(in Light light,in vec3 surfacePos,inout LightSampleRec lightSampleRec){lightSampleRec.direction=normalize(light.position-light.p1);lightSampleRec.normal=normalize(surfacePos-light.position);if(dot(lightSampleRec.direction,lightSampleRec.normal)>0.0){lightSampleRec.normal=-lightSampleRec.normal;}lightSampleRec.emission=light.emission*float(NUM_LIGHTS);lightSampleRec.dist=INF;lightSampleRec.pdf=1.0;}void samplePointLight(in Light light,in vec3 surfacePos,inout LightSampleRec lightSampleRec){lightSampleRec.direction=light.position-surfacePos;lightSampleRec.dist=length(lightSampleRec.direction);float distSq=lightSampleRec.dist*lightSampleRec.dist;lightSampleRec.direction=normalize(lightSampleRec.direction);lightSampleRec.normal=normalize(surfacePos-light.position);lightSampleRec.emission=light.emission*float(NUM_LIGHTS)/distSq;lightSampleRec.pdf=1.0;}void LGL_Al(in Light light,in vec3 surfacePos,inout LightSampleRec lightSampleRec,vec2 LGL_AQom){int type=int(light.type);if(type==0||type==1){LGL_Aj(light,surfacePos,lightSampleRec,LGL_AQom);}else if(type==2){LGL_Ah(light,surfacePos,lightSampleRec,LGL_AQom);}else if(type==3){LGL_Ak(light,surfacePos,lightSampleRec);}else if(type==4){samplePointLight(light,surfacePos,lightSampleRec);}}\n#endif\nvec3 LocalToWorld(vec3 X,vec3 Y,vec3 Z,vec3 V){return vec3(X.x*V.x+Y.x*V.y+Z.x*V.z,X.y*V.x+Y.y*V.y+Z.y*V.z,X.z*V.x+Y.z*V.y+Z.z*V.z);}vec3 WorldToLocal(vec3 X,vec3 Y,vec3 Z,vec3 V){return vec3(dot(V,X),dot(V,Y),dot(V,Z));}vec3 LGL_A(float r1,float r2){vec3 dir;float r=sqrt(r1);float phi=TWOPI*r2;dir.x=r*cos(phi);dir.y=r*sin(phi);dir.z=sqrt(max(0.0,1.0-dir.x*dir.x-dir.y*dir.y));return dir;}float LGL_B(float eta){float sqrtR0=(eta-1.)/(eta+1.);return sqrtR0*sqrtR0;}vec3 LGL_C(vec3 baseColor){float luminance=LGL_AV(baseColor);return(luminance>0.0)? baseColor/luminance : vec3(1.);}void LGL_D(SurfaceInteraction si,out vec3 Cspec0,out vec3 Csheen){vec3 tint=LGL_C(si.color);if(si.LGL_BG>0.1){Cspec0=si.specularColor;}else{Cspec0=mix(LGL_B(si.ior)*mix(vec3(1.0),tint,min(si.LGL_Ay,0.99)),si.color,si.metalness);}Csheen=mix(vec3(1.0),tint,si.LGL_Az);}float LGL_E(float u){float m=clamp(1.0-u,0.0,1.0);float m2=m*m;return m2*m2*m;}float LGL_F(float F0,float cosTheta){return mix(F0,1.0,LGL_E(cosTheta));}vec3 LGL_F(vec3 F0,float cosTheta){return mix(F0,vec3(1.),LGL_E(cosTheta));}float LGL_G(float cosThetaI,float eta){float sinThetaTSq=eta*eta*(1.0f-cosThetaI*cosThetaI);if(sinThetaTSq>1.0)return 1.0;float cosThetaT=sqrt(max(1.0-sinThetaTSq,0.0));float rs=(eta*cosThetaT-cosThetaI)/(eta*cosThetaT+cosThetaI);float rp=(eta*cosThetaI-cosThetaT)/(eta*cosThetaI+cosThetaT);return 0.5*(rs*rs+rp*rp);}vec3 LGL_H(vec3 F0,float metalness,float eta,float cosThetaI){vec3 FrSchlick=LGL_F(F0,cosThetaI);float FrDielectric=LGL_G(cosThetaI,eta);return mix(vec3(FrDielectric),FrSchlick,metalness);}float LGL_H(float metalness,float eta,float cosThetaI){float FrSchlick=LGL_E(cosThetaI);float FrDielectric=LGL_G(cosThetaI,eta);return mix(FrDielectric,FrSchlick,metalness);}float LGL_I(float NDotV,float alphaG){float a=alphaG*alphaG;float b=NDotV*NDotV;return 1.0/(NDotV+sqrt(a+b-a*b));}float LGL_J(float NDotH,float alpha){float alpha2=alpha*alpha;float t=1.0+(alpha2-1.0)*NDotH*NDotH;return(alpha2-1.0)/(PI*log(alpha2)*t);}float LGL_K(float NDotH,float a){float a2=a*a;float t=1.0+(a2-1.0)*NDotH*NDotH;return a2/(PI*t*t);}vec3 ImportanceSampleLGL_J(float rgh,float r1,float r2){float a=max(0.001,rgh);float a2=a*a;float phi=r1*TWOPI;float cosTheta=sqrt((1.0-pow(a2,1.0-r1))/(1.0-a2));float sinTheta=clamp(sqrt(1.0-(cosTheta*cosTheta)),0.0,1.0);float sinPhi=sin(phi);float cosPhi=cos(phi);return vec3(sinTheta*cosPhi,sinTheta*sinPhi,cosTheta);}vec3 ImportanceSampleLGL_K(float rgh,float r1,float r2){float a=max(0.001,rgh);float phi=r1*TWOPI;float cosTheta=sqrt((1.0-r2)/(1.0+(a*a-1.0)*r2));float sinTheta=clamp(sqrt(1.0-(cosTheta*cosTheta)),0.0,1.0);float sinPhi=sin(phi);float cosPhi=cos(phi);return vec3(sinTheta*cosPhi,sinTheta*sinPhi,cosTheta);}vec3 LGL_N(SurfaceInteraction si,vec3 Csheen,vec3 V,vec3 L,vec3 H,out float pdf){pdf=0.0;if(L.z<=0.0)return vec3(0.0);pdf=L.z*INVPI;float LDotH=dot(L,H);float FL=LGL_E(L.z);float FV=LGL_E(V.z);float Fh=LGL_E(LDotH);float Fd90=0.5+2.0*LDotH*LDotH*si.roughness;float Fd=mix(1.0,Fd90,FL)*mix(1.0,Fd90,FV);float Fss90=LDotH*LDotH*si.roughness;float Fss=mix(1.0,Fss90,FL)*mix(1.0,Fss90,FV);float DisneyFakeSS=1.25*(Fss*(1.0/(L.z+V.z)-0.5)+0.5);vec3 Fsheen=Fh*si.sheen*Csheen;return(INVPI*mix(Fd,DisneyFakeSS,si.LGL_BB)*si.color+Fsheen)*(1.0-si.metalness)*(1.0-si.LGL_BC);}vec3 LGL_O(SurfaceInteraction si,vec3 Cspec0,vec3 V,vec3 L,vec3 H,out float pdf){pdf=0.0;if(L.z<=0.0)return vec3(0.0);float LDotH=dot(L,H);float D=LGL_K(H.z,si.roughness);pdf=D*H.z/(4.0*LDotH);vec3 F=LGL_H(Cspec0,si.metalness,si.eta,LDotH);float G=LGL_I(abs(L.z),si.roughness)*LGL_I(abs(V.z),si.roughness);return F*D*G;}vec3 LGL_P(SurfaceInteraction si,vec3 Cspec0,vec3 V,vec3 L,vec3 H,out float pdf){pdf=0.0;if(L.z>=0.0)return vec3(0.0);float F=LGL_G(abs(dot(V,H)),si.eta);float D=LGL_K(H.z,si.roughness);float denomSqrt=dot(L,H)+dot(V,H)*si.eta;pdf=D*H.z*abs(dot(L,H))/(denomSqrt*denomSqrt);float G=LGL_I(abs(L.z),si.roughness)*LGL_I(abs(V.z),si.roughness);vec3 specColor=pow(si.color,vec3(0.5));return specColor*(1.0-si.metalness)*si.LGL_BC*(1.0-F)*D*G*abs(dot(V,H))*abs(dot(L,H))*4.0*si.eta*si.eta/(denomSqrt*denomSqrt);}vec3 LGL_Q(SurfaceInteraction si,vec3 V,vec3 L,vec3 H,out float pdf){pdf=0.0;if(L.z<=0.0)return vec3(0.0);float LDotH=dot(L,H);float F=LGL_F(.04,LDotH);float D=LGL_J(H.z,mix(0.1,0.001,1.-si.LGL_BA));pdf=D*H.z/(4.0*LDotH);float G=LGL_I(L.z,0.25)*LGL_I(V.z,0.25);return vec3(0.25*si.clearcoat*F*D*G);}void LGL_R(SurfaceInteraction si,vec3 Cspec0,float fresnelWeight,out float LGL_S,out float LGL_T,out float LGL_U,out float LGL_V){LGL_S=max(LGL_AV(si.color),si.sheen)*(1.0-si.metalness)*(1.0-si.LGL_BC);LGL_T=LGL_AV(mix(Cspec0,vec3(1.0),fresnelWeight));LGL_U=(1.0-fresnelWeight)*(1.0-si.metalness)*si.LGL_BC*LGL_AV(si.color);LGL_V=si.clearcoat*(1.0-si.metalness);float weightSum=LGL_S+LGL_T+LGL_U+LGL_V;LGL_S/=weightSum;LGL_T/=weightSum;LGL_U/=weightSum;LGL_V/=weightSum;}vec3 LGL_W(SurfaceInteraction si,vec3 V,vec3 N,out vec3 L,out float pdf,MaterialSamples LGL_AQomSamples){pdf=0.0;vec3 f=vec3(0.0);vec2 bounceDirSample=LGL_AQomSamples.s3;vec2 diffuseOrSpecular=LGL_AQomSamples.s4;float r1=bounceDirSample.x;float r2=bounceDirSample.y;vec3 Cspec0,Csheen;LGL_D(si,Cspec0,Csheen);vec3 T,B;LGL_AZ(N,T,B);V=WorldToLocal(T,B,N,V);float LGL_S,LGL_T,LGL_U,LGL_V;float fresnelWeight=LGL_H(si.metalness,si.eta,V.z);LGL_R(si,Cspec0,fresnelWeight,LGL_S,LGL_T,LGL_U,LGL_V);float cdf[4];cdf[0]=LGL_S;cdf[1]=cdf[0]+LGL_T;cdf[2]=cdf[1]+LGL_U;cdf[3]=cdf[2]+LGL_V;if(r1<cdf[0]){r1/=cdf[0];L=LGL_A(r1,r2);vec3 H=normalize(L+V);f=LGL_N(si,Csheen,V,L,H,pdf);pdf*=LGL_S;}else if(r1<cdf[1]){r1=(r1-cdf[0])/(cdf[1]-cdf[0]);vec3 H=ImportanceSampleLGL_K(si.roughness,r1,r2);if(dot(V,H)<0.0)H=-H;L=normalize(reflect(-V,H));f=LGL_O(si,Cspec0,V,L,H,pdf);pdf*=LGL_T;}else if(r1<cdf[2]){r1=(r1-cdf[1])/(cdf[2]-cdf[1]);vec3 H=ImportanceSampleLGL_K(si.roughness,r1,r2);if(dot(V,H)<0.0)H=-H;vec3 R=reflect(-V,H);L=normalize(refract(-V,H,si.eta));f=LGL_P(si,Cspec0,V,L,H,pdf);pdf*=LGL_U;}else{r1=(r1-cdf[2])/(1.0-cdf[2]);vec3 H=ImportanceSampleLGL_J(mix(0.1,0.001,1.-si.LGL_BA),r1,r2);if(dot(V,H)<0.0)H=-H;L=normalize(reflect(-V,H));f=LGL_Q(si,V,L,H,pdf);pdf*=LGL_V;}L=LocalToWorld(T,B,N,L);return f*abs(dot(N,L));}vec3 LGL_X(inout SurfaceInteraction si,vec3 V,vec3 L,out float bsdfPdf){bsdfPdf=0.0;vec3 f=vec3(0.0);vec3 N=si.LGL_BL;vec3 T,B;LGL_AZ(N,T,B);V=WorldToLocal(T,B,N,V);L=WorldToLocal(T,B,N,L);vec3 H;if(L.z>0.0){H=normalize(L+V);}else{H=normalize(L+V*si.eta);}if(dot(V,H)<0.0){H=-H;}vec3 Cspec0,Csheen;LGL_D(si,Cspec0,Csheen);float LGL_S,LGL_T,LGL_U,LGL_V;float fresnelWeight=LGL_H(si.metalness,si.eta,abs(dot(L,H)));LGL_R(si,Cspec0,fresnelWeight,LGL_S,LGL_T,LGL_U,LGL_V);float pdf;if(LGL_S>0.0&&L.z>0.0){f+=LGL_N(si,Csheen,V,L,H,pdf);bsdfPdf+=pdf*LGL_S;}if(LGL_T>0.0&&L.z>0.0&&V.z>0.0){f+=LGL_O(si,Cspec0,V,L,H,pdf);bsdfPdf+=pdf*LGL_T;}if(LGL_U>0.0&&L.z<0.0){f+=LGL_P(si,Cspec0,V,L,H,pdf);bsdfPdf+=pdf*LGL_U;}if(LGL_V>0.0&&L.z>0.0&&V.z>0.0){f+=LGL_Q(si,V,L,H,pdf);bsdfPdf+=pdf*LGL_V;}return f*abs(L.z);}vec3 LGL_e(inout SurfaceInteraction si,in Path path,in vec2 s1,in vec2 s2){si.eta=dot(si.normal,si.LGL_BL)>0.0 ?(1.0/si.ior): si.ior;vec3 viewDir=-path.ray.d;vec3 surfacePos=si.position+EPS*si.normal;vec3 Li=vec3(0.0);BsdfSampleRec bsdfSampleRec;vec2 lightDirSample=s1;vec2 envDirSample=s2;vec3 lightDir;vec2 uv;float lightPdf;bool brdfSample=false;\n#ifndef CONST_COLOR_ENV\nlightDir=LGL_d(envDirSample,uv,lightPdf);LGL_AW(path.ray,surfacePos,lightDir);if(!LGL_m(path.ray,INF-EPS)){vec3 irr=LGL_An(envMap,uv).rgb*envMapIntensity;bsdfSampleRec.f=LGL_X(si,viewDir,lightDir,bsdfSampleRec.pdf);if(bsdfSampleRec.pdf>0.0){float LGL_BR=LGL_Af(lightPdf,bsdfSampleRec.pdf);if(LGL_BR>0.0){Li+=LGL_BR*bsdfSampleRec.f*irr/lightPdf;}}}\n#endif\n#if defined(NUM_LIGHTS)\nLightSampleRec lightSampleRec;Light light;int i=int(lightDirSample.x*float(NUM_LIGHTS));vec3 position=lights.position[i];vec3 emission=lights.emission[i];vec3 p1=lights.p1[i];vec3 p2=lights.p2[i];vec4 params=lights.params[i];float radius=params.x;float area=params.y;float type=params.z;float visible=params.w;light=Light(position,emission,p1,p2,radius,area,type,visible);LGL_Al(light,surfacePos,lightSampleRec,lightDirSample);if(dot(lightSampleRec.direction,lightSampleRec.normal)<0.0){LGL_AW(path.ray,surfacePos,lightSampleRec.direction);if(!LGL_m(path.ray,lightSampleRec.dist-EPS)){bsdfSampleRec.f=LGL_X(si,viewDir,lightSampleRec.direction,bsdfSampleRec.pdf);float LGL_BR=1.0;if(light.area>0.0&&bsdfSampleRec.pdf>0.0){LGL_BR=LGL_Af(lightSampleRec.pdf,bsdfSampleRec.pdf);}if(LGL_BR>0.0){Li+=LGL_BR*bsdfSampleRec.f*lightSampleRec.emission/lightSampleRec.pdf;}}}\n#endif\nreturn Li;}layout(location=0)out vec4 out_light;void bounce(inout Path path,int depth,inout SurfaceInteraction si,inout BsdfSampleRec bsdfSampleRec,in LightSampleRec lightSampleRec){if(!si.LGL_BK){if(depth==0&&enviromentVisible==0.){path.alpha=0.0;path.LGL_BQ=true;return;}\n#ifdef CONST_COLOR_ENV\npath.li+=backgroundColor*path.beta;path.LGL_BQ=true;return;\n#else\nfloat LGL_BR=1.0;if(depth>0){float lightPdf=LGL_c(LGL_Y(path.ray.d));LGL_BR=LGL_Af(bsdfSampleRec.pdf,lightPdf);}vec3 irr=LGL_Z(path.ray.d)*envMapIntensity;path.li+=LGL_BR*path.beta*irr;path.LGL_BQ=true;return;\n#endif\n}if(si.LGL_BI){path.li+=LGL_Ag(path.ray,depth,lightSampleRec,bsdfSampleRec)*path.beta;path.LGL_BQ=true;return;}if(dot(si.normal,si.LGL_BL)>0.0){path.LGL_BS=vec3(0.0);}path.li+=path.beta*si.emissive;path.beta*=exp(-path.LGL_BS*si.t);MaterialSamples LGL_AQomSamples=getRandomMaterialSamples();if(si.LGL_BH==DISNEY){path.li+=LGL_e(si,path,LGL_AQomSamples.s1,LGL_AQomSamples.s2)*path.beta;}bsdfSampleRec.f=LGL_W(si,-path.ray.d,si.LGL_BL,bsdfSampleRec.L,bsdfSampleRec.pdf,LGL_AQomSamples);if(dot(si.LGL_BL,bsdfSampleRec.L)<0.0){path.LGL_BS=-log(si.extinction)/si.LGL_BE;}if(bsdfSampleRec.pdf>0.0){path.beta*=bsdfSampleRec.f/bsdfSampleRec.pdf;}else{path.LGL_BQ=true;return;}if(depth>=2){float q=1.0-LGL_AV(path.beta);if(LGL_AQomSample()<q){path.LGL_BQ=true;return;}path.beta/=1.0-q;}LGL_AW(path.ray,si.position+EPS*bsdfSampleRec.L,bsdfSampleRec.L);}vec4 LGL_Ao(inout Ray ray){SurfaceInteraction si;Path path;BsdfSampleRec bsdfSampleRec;LightSampleRec lightSampleRec;path.ray=ray;path.li=vec3(0);path.alpha=1.0;path.LGL_BQ=false;path.LGL_BR=1.0;path.LGL_BS=vec3(0.0);path.beta=vec3(1.0);for(int i=0;i<bounces;i++){if(path.LGL_BQ){return vec4(path.li,path.alpha);}LGL_n(path.ray,si,lightSampleRec,i);LGL_o(path.ray,si,lightSampleRec,i);bounce(path,i,si,bsdfSampleRec,lightSampleRec);}return vec4(path.li,path.alpha);}void main(){LGL_AS(frameCount);vec2 vCoordAntiAlias=vCoord+jitter;vec3 direction=normalize(vec3(vCoordAntiAlias-0.5,-1.0)*vec3(camera.aspect,1.0,camera.fov));\n#ifdef USE_LENS_CAMERA\nvec2 lensPoint=camera.aperture*LGL_Aa(vec2(LGL_AN(vCoordAntiAlias)));vec3 focusPoint=-direction*camera.focus/direction.z;vec3 origin=vec3(lensPoint,0.0);direction=normalize(focusPoint-origin);origin=vec3(camera.transform*vec4(origin,1.0));direction=mat3(camera.transform)*direction;\n#else\nvec3 origin=camera.transform[3].xyz;direction=mat3(camera.transform)*direction;\n#endif\nRay cam;LGL_AW(cam,origin,direction);vec4 liAndAlpha=LGL_Ao(cam);if(!(liAndAlpha.x<INF&&liAndAlpha.x>-EPS)){liAndAlpha=vec4(0,0,0,1);}out_light=liAndAlpha;}",
// };

var fragment = {
  source: (e) => `#define PI 3.14159265359
    #define TWOPI 6.28318530718
    #define INVPI 0.31830988618
    #define INVPI2 0.10132118364
    #define EPS 0.0001
    #define ONE_MINUS_EPS 0.999999
    #define INF 1000000.0
    #define ROUGHNESS_MIN 0.001
    #define DISNEY 0
    const vec3 luminance = vec3(0.2126, 0.7152, 0.0722);
    float LGL_AV(vec3 color) {
        return dot(color, luminance);
    }
    #define RAY_MAX_DISTANCE 9999.0
    struct Ray {
        vec3 o;
        vec3 d;
        vec3 LGL_BN;
        float LGL_BO;
    };
    struct Path {
        Ray ray;
        vec3 li;
        float alpha;
        vec3 beta;
        bool LGL_BQ;
        float LGL_BR;
        vec3 LGL_BS;
    };
    struct Camera {
        mat4 transform;
        float aspect;
        float fov;
        float focus;
        float aperture;
    };
    #if defined(NUM_LIGHTS)
    struct Lights {
        vec3 position[NUM_LIGHTS];
        vec3 emission[NUM_LIGHTS];
        vec3 p1[NUM_LIGHTS];
        vec3 p2[NUM_LIGHTS];
        vec4 params[NUM_LIGHTS];
    };
    struct Light {
        vec3 position;
        vec3 emission;
        vec3 p1;
        vec3 p2;
        float radius;
        float area;
        float type;
        float visible;
    };
    #endif
    struct SurfaceInteraction {
        bool LGL_BK;
        bool LGL_BI;
        float t;
        vec3 position;
        vec3 normal;
        vec3 LGL_BM;
        vec3 LGL_BL;
        vec3 tangent;
        vec3 bitangent;
        vec3 color;
        vec3 extinction;
        vec3 emissive;
        int LGL_BH;
        float roughness;
        float metalness;
        float LGL_BF;
        float LGL_BB;
        float LGL_Ay;
        float sheen;
        float LGL_Az;
        float clearcoat;
        float LGL_BA;
        float LGL_BC;
        float ior;
        float LGL_BE;
        float eta;
        float LGL_BD;
        vec3 specularColor;
        float LGL_BG;
    };
    struct BsdfSampleRec {
        vec3 L;
        vec3 f;
        float pdf;
    };
    struct LightSampleRec {
        vec3 normal;
        vec3 emission;
        vec3 direction;
        float dist;
        float pdf;
    };
    void LGL_AW(inout Ray ray, vec3 origin, vec3 direction) {
        ray.o = origin;
        ray.d = direction;
        ray.LGL_BN = 1.0 / ray.d;
        ray.LGL_BO = RAY_MAX_DISTANCE;
    }
    void LGL_AW(inout Ray ray, vec3 origin, vec3 direction, float rMax) {
        ray.o = origin;
        ray.d = direction;
        ray.LGL_BN = 1.0 / ray.d;
        ray.LGL_BO = rMax;
    }
    ivec2 LGL_AX(int i, int LGL_BT) {
        ivec2 u;
        u.y = i >> LGL_BT;
        u.x = i - (u.y << LGL_BT);
        return u;
    }
    vec4 LGL_AY(sampler2D s, int i, int LGL_BT) {
        return texelFetch(s, LGL_AX(i, LGL_BT), 0);
    }
    ivec4 LGL_AY(isampler2D s, int i, int LGL_BT) {
        return texelFetch(s, LGL_AX(i, LGL_BT), 0);
    }
    uniform Camera camera;
    uniform vec2 pixelSize;
    uniform vec2 jitter;
    uniform float frameCount;
    in vec2 vCoord;
    #if defined(NUM_LIGHTS)
    uniform Lights lights;
    #endif
    uniform int bounces;
    uniform vec3 backgroundColor;
    uniform float envMapIntensity;
    uniform float enviromentVisible;
    uniform sampler2D noiseTex;
    uniform float stratifiedSamples[71];
    uniform float strataSize;
    float pixelSeed;
    float LGL_AN(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    uvec4 seed;
    ivec2 pixel;
    void LGL_AO(float frame) {
        pixel = ivec2(vCoord / pixelSize);
        seed = uvec4(pixel, int(frame), pixel.x + pixel.y);
    }
    void LGL_AP(inout uvec4 v) {
        v = v * 1664525u + 1013904223u;
        v.x += v.y * v.w;
        v.y += v.z * v.x;
        v.z += v.x * v.y;
        v.w += v.y * v.z;
        v = v ^ (v >> 16u);
        v.x += v.y * v.w;
        v.y += v.z * v.x;
        v.z += v.x * v.y;
        v.w += v.y * v.z;
    }
    float LGL_AQ() {
        LGL_AP(seed);
        return float(seed.x) / float(0xffffffffu);
    }
    vec2 LGL_AQ2() {
        LGL_AP(seed);
        return vec2(seed.xy) / float(0xffffffffu);
    }
    void LGL_AS(float frame) {
        vec2 noiseSize = vec2(textureSize(noiseTex, 0));
        pixelSeed = texture(noiseTex, vCoord / (pixelSize * noiseSize)).r;
        LGL_AO(frame);
    }
    int sampleIndex = 0;
    float LGL_AQomSample() {
        float stratifiedSample = stratifiedSamples[sampleIndex++];
        float LGL_AQom = fract((stratifiedSample + pixelSeed) * strataSize);
        return EPS + (1.0 - 2.0 * EPS) * LGL_AQom;
    }
    vec2 LGL_AQomSampleVec2() {
        return vec2(LGL_AQomSample(), LGL_AQomSample());
    }
    struct MaterialSamples {
        vec2 s1;
        vec2 s2;
        vec2 s3;
        vec2 s4;
    };
    MaterialSamples getRandomMaterialSamples() {
        MaterialSamples samples;
        samples.s1 = LGL_AQomSampleVec2();
        samples.s2 = LGL_AQomSampleVec2();
        samples.s3 = LGL_AQomSampleVec2();
        samples.s4 = LGL_AQomSampleVec2();
        return samples;
    }
    vec4 LGL_An(sampler2D map, vec2 uv) {
    #ifdef OES_texture_float_linear
        return texture(map, uv);
    #else
        vec2 size = vec2(textureSize(map, 0));
        vec2 texelSize = 1.0 / size;
        uv = uv * size - 0.5;
        vec2 f = fract(uv);
        uv = floor(uv) + 0.5;
        vec4 s1 = texture(map, (uv + vec2(0, 0)) * texelSize);
        vec4 s2 = texture(map, (uv + vec2(1, 0)) * texelSize);
        vec4 s3 = texture(map, (uv + vec2(0, 1)) * texelSize);
        vec4 s4 = texture(map, (uv + vec2(1, 1)) * texelSize);
        return mix(mix(s1, s2, f.x), mix(s3, s4, f.x), f.y);
    #endif
    }
    uniform Materials {
        vec4 colorAndMaterialType[NUM_MATERIALS];
        vec4 roughnessMetalnessNormalScale[NUM_MATERIALS];
        vec4 alphaSpecularTintSheenSheenTint[NUM_MATERIALS];
        vec4 clearcoaRoughnessSubfaceTransmission[NUM_MATERIALS];
        vec4 iorAtDistanceAnisotropicWorkflow[NUM_MATERIALS];
        vec4 extinction[NUM_MATERIALS];
        vec4 specularColorGlossiness[NUM_MATERIALS];
    #if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS) || defined(NUM_PBR_MAPS)
        ivec4 diffuseNormalRoughnessMetalnessMapIndex[NUM_MATERIALS];
    #endif
    #if defined(NUM_EMISSIVE_MAPS) || defined(NUM_PBR_SG_MAPS)
        ivec4 emissiveSpecularGlossinessMapIndex[NUM_MATERIALS];
    #endif
    #if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS)
        vec4 diffuseNormalMapSize[NUM_DIFFUSE_NORMAL_MAPS];
    #endif
    #if defined(NUM_PBR_MAPS)
        vec2 pbrMapSize[NUM_PBR_MAPS];
    #else
    #if defined(NUM_PBR_SG_MAPS)
        vec2 pbrMapSize[NUM_PBR_SG_MAPS];
    #else
    #if defined(NUM_EMISSIVE_MAPS)
        vec2 pbrMapSize[NUM_EMISSIVE_MAPS];
    #endif
    #endif
    #endif
    } materials;
    #ifdef NUM_DIFFUSE_MAPS
    uniform mediump sampler2DArray diffuseMap;
    #endif
    #ifdef NUM_NORMAL_MAPS
    uniform mediump sampler2DArray normalMap;
    #endif
    #ifdef NUM_PBR_MAPS
    uniform mediump sampler2DArray pbrMap;
    #endif
    #ifdef NUM_PBR_SG_MAPS
    uniform mediump sampler2DArray pbrSGMap;
    #endif
    #ifdef NUM_EMISSIVE_MAPS
    uniform mediump sampler2DArray emissiveMap;
    #endif
    float LGL_p(int materialIndex) {
        return materials.colorAndMaterialType[materialIndex].w;
    }
    float LGL_q(int materialIndex) {
        return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].w;
    }
    vec3 LGL_r(int materialIndex, vec2 uv) {
        vec3 emissive = vec3(0.0);
    #ifdef NUM_EMISSIVE_MAPS
        int emissiveMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].x;
        if(emissiveMapIndex >= 0) {
            emissive = texture(emissiveMap, vec3(uv * materials.pbrMapSize[emissiveMapIndex].xy, emissiveMapIndex)).rgb;
        }
    #endif
        return emissive;
    }
    vec3 LGL_s(int materialIndex, vec2 uv) {
        vec3 specularColor = materials.specularColorGlossiness[materialIndex].rgb;
    #ifdef NUM_PBR_SG_MAPS
        int specularMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].y;
        if(specularMapIndex >= 0) {
            vec3 texelSpecular = texture(pbrSGMap, vec3(uv * materials.pbrMapSize[specularMapIndex].xy, specularMapIndex)).rgb;
            texelSpecular = pow(texelSpecular, vec3(2.2));
            specularColor *= texelSpecular;
        }
    #endif
        return specularColor;
    }
    float LGL_t(int materialIndex, vec2 uv) {
        float glossiness = materials.specularColorGlossiness[materialIndex].a;
    #ifdef NUM_PBR_SG_MAPS
        int glossinessMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].z;
        if(glossinessMapIndex >= 0) {
            float texelGlossiness = texture(pbrSGMap, vec3(uv * materials.pbrMapSize[glossinessMapIndex].xy, glossinessMapIndex)).a;
            glossiness *= texelGlossiness;
        }
    #endif
        return glossiness;
    }
    float LGL_u(int materialIndex, vec2 uv) {
        float LGL_BG = LGL_q(materialIndex);
        float roughness = 0.0;
        if(LGL_BG > 0.1) {
            roughness = 1.0 - LGL_t(materialIndex, uv);
        } else {
            roughness = materials.roughnessMetalnessNormalScale[materialIndex].x;
    #ifdef NUM_PBR_MAPS
            int roughnessMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].z;
            if(roughnessMapIndex >= 0) {
                roughness *= texture(pbrMap, vec3(uv * materials.pbrMapSize[roughnessMapIndex].xy, roughnessMapIndex)).g;
            }
    #endif
        }
        return roughness * roughness;
    }
    float LGL_v(const vec3 v) {
        return max(v.x, max(v.y, v.z));
    }
    float LGL_w(const vec3 specularColor) {
        return LGL_v(specularColor);
    }
    vec3 LGL_x(const vec3 baseColor, float metallic) {
        return baseColor * (1.0 - metallic);
    }
    float LGL_y(int materialIndex, vec2 uv) {
        float LGL_BG = LGL_q(materialIndex);
        float metalness = 0.0;
        if(LGL_BG > 0.1) {
            vec3 specularFactor = LGL_s(materialIndex, uv);
            metalness = LGL_w(specularFactor);
        } else {
            metalness = materials.roughnessMetalnessNormalScale[materialIndex].y;
    #ifdef NUM_PBR_MAPS
            int metalnessMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].w;
            if(metalnessMapIndex >= 0) {
                metalness *= texture(pbrMap, vec3(uv * materials.pbrMapSize[metalnessMapIndex].xy, metalnessMapIndex)).b;
            }
    #endif
        }
        return metalness;
    }
    vec3 LGL_z(int materialIndex, vec2 uv) {
        vec3 color = materials.colorAndMaterialType[materialIndex].rgb;
    #ifdef NUM_DIFFUSE_MAPS
        int diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;
        if(diffuseMapIndex >= 0) {
            color *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).rgb;
        }
    #endif
        float LGL_BG = LGL_q(materialIndex);
        if(LGL_BG > 0.1) {
            vec3 specularFactor = LGL_s(materialIndex, uv);
            color = LGL_x(color, LGL_w(specularFactor));
        }
        return color;
    }
    vec3 LGL_AA(int materialIndex, vec2 uv, vec3 normal, vec3 dp1, vec3 dp2, vec2 duv1, vec2 duv2, inout vec3 tangent, inout vec3 bitangent) {
        vec3 dp2perp = cross(dp2, normal);
        vec3 dp1perp = cross(normal, dp1);
        vec3 dpdu = dp2perp * duv1.x + dp1perp * duv2.x;
        vec3 dpdv = dp2perp * duv1.y + dp1perp * duv2.y;
        float invmax = inversesqrt(max(dot(dpdu, dpdu), dot(dpdv, dpdv)));
        dpdu *= invmax;
        dpdv *= invmax;
        tangent = normalize(dpdu);
        bitangent = normalize(dpdv);
    #ifdef NUM_NORMAL_MAPS
        int normalMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].y;
        if(normalMapIndex >= 0) {
            vec3 n = 2.0 * texture(normalMap, vec3(uv * materials.diffuseNormalMapSize[normalMapIndex].zw, normalMapIndex)).rgb - 1.0;
            n.xy *= materials.roughnessMetalnessNormalScale[materialIndex].zw;
            mat3 tbn = mat3(dpdu, dpdv, normal);
            return normalize(tbn * n);
        } else {
            return normal;
        }
    #endif
        return normal;
    }
    float LGL_AD(int materialIndex, vec2 uv) {
        float alpha = materials.alphaSpecularTintSheenSheenTint[materialIndex].x;
    #ifdef NUM_DIFFUSE_MAPS
        int diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;
        if(diffuseMapIndex >= 0) {
            alpha *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).a;
        }
    #endif
        return alpha;
    }
    float LGL_AB(int materialIndex) {
        return materials.alphaSpecularTintSheenSheenTint[materialIndex].y;
    }
    float LGL_AC(int materialIndex) {
        return materials.alphaSpecularTintSheenSheenTint[materialIndex].z;
    }
    float LGL_ACTint(int materialIndex) {
        return materials.alphaSpecularTintSheenSheenTint[materialIndex].w;
    }
    float LGL_AF(int materialIndex) {
        return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].x;
    }
    float LGL_AFRoughness(int materialIndex) {
        return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].y;
    }
    float LGL_AH(int materialIndex) {
        return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].z;
    }
    float LGL_AI(int materialIndex) {
        return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].w;
    }
    float LGL_AJ(int materialIndex) {
        return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].x;
    }
    float LGL_AK(int materialIndex) {
        return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].y;
    }
    float LGL_AL(int materialIndex) {
        return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].z;
    }
    vec3 LGL_AM(int materialIndex) {
        return materials.extinction[materialIndex].rgb;
    }
    uniform sampler2D positionBuffer;
    uniform sampler2D normalBuffer;
    uniform sampler2D uvBuffer;
    uniform sampler2D bvhBuffer;
    struct Triangle {
        vec3 p0;
        vec3 p1;
        vec3 p2;
    };
    struct Box {
        vec3 min;
        vec3 max;
    };
    struct TriangleIntersect {
        float t;
        vec3 barycentric;
    };
    float LGL_f(float rad, vec3 pos, Ray r) {
        vec3 op = pos - r.o;
        float eps = 0.001;
        float b = dot(op, r.d);
        float det = b * b - dot(op, op) + rad * rad;
        if(det < 0.0)
            return INF;
        det = sqrt(det);
        float t1 = b - det;
        if(t1 > eps)
            return t1;
        float t2 = b + det;
        if(t2 > eps)
            return t2;
        return INF;
    }
    float LGL_g(in vec3 pos, in vec3 u, in vec3 v, in vec4 plane, in Ray r) {
        vec3 n = vec3(plane);
        float dt = dot(r.d, n);
        float t = (plane.w - dot(n, r.o)) / dt;
        if(t > EPS) {
            vec3 p = r.o + r.d * t;
            vec3 vi = p - pos;
            float a1 = dot(u, vi);
            if(a1 >= 0. && a1 <= 1.) {
                float a2 = dot(v, vi);
                if(a2 >= 0. && a2 <= 1.)
                    return t;
            }
        }
        return INF;
    }
    float LGL_h(vec3 v0, vec3 v1, vec3 v2, Ray r, bool isDoubleSided) {
        vec3 edge1 = v1 - v0;
        vec3 edge2 = v2 - v0;
        vec3 pvec = cross(r.d, edge2);
        float det = 1.0 / dot(edge1, pvec);
        if(!isDoubleSided && det < 0.0)
            return INF;
        vec3 tvec = r.o - v0;
        float u = dot(tvec, pvec) * det;
        vec3 qvec = cross(tvec, edge1);
        float v = dot(r.d, qvec) * det;
        float t = dot(edge2, qvec) * det;
        return (u < 0.0 || u > 1.0 || v < 0.0 || u + v > 1.0 || t <= 0.0) ? INF : t;
    }
    float LGL_gClassic(vec3 v1, vec3 v2, vec3 v3, vec3 v4, Ray r, bool isDoubleSided) {
        return min(LGL_h(v1, v3, v2, r, isDoubleSided), LGL_h(v2, v3, v4, r, isDoubleSided));
    }
    void LGL_j(inout SurfaceInteraction si, Triangle tri, vec3 barycentric, ivec3 index, vec3 LGL_BM, int materialIndex) {
        si.LGL_BK = true;
        si.LGL_BM = LGL_BM;
        si.position = barycentric.x * tri.p0 + barycentric.y * tri.p1 + barycentric.z * tri.p2;
        ivec2 i0 = LGL_AX(index.x, VERTEX_COLUMNS);
        ivec2 i1 = LGL_AX(index.y, VERTEX_COLUMNS);
        ivec2 i2 = LGL_AX(index.z, VERTEX_COLUMNS);
        vec3 n0 = texelFetch(normalBuffer, i0, 0).xyz;
        vec3 n1 = texelFetch(normalBuffer, i1, 0).xyz;
        vec3 n2 = texelFetch(normalBuffer, i2, 0).xyz;
        vec3 normal = normalize(barycentric.x * n0 + barycentric.y * n1 + barycentric.z * n2);
        vec2 uv0 = texelFetch(uvBuffer, i0, 0).xy;
        vec2 uv1 = texelFetch(uvBuffer, i1, 0).xy;
        vec2 uv2 = texelFetch(uvBuffer, i2, 0).xy;
    #if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS) || defined(NUM_PBR_MAPS)
        vec2 uv = fract(barycentric.x * uv0 + barycentric.y * uv1 + barycentric.z * uv2);
    #else
        vec2 uv = vec2(0.0);
    #endif
        si.LGL_BH = int(LGL_p(materialIndex));
        si.color = LGL_z(materialIndex, uv);
        si.roughness = LGL_u(materialIndex, uv);
        si.metalness = LGL_y(materialIndex, uv);
        si.specularColor = LGL_s(materialIndex, uv);
        si.LGL_BG = LGL_q(materialIndex);
        si.emissive = LGL_r(materialIndex, uv);
        vec3 dp1 = tri.p0 - tri.p2;
        vec3 dp2 = tri.p1 - tri.p2;
        vec2 duv1 = uv0 - uv2;
        vec2 duv2 = uv1 - uv2;
        si.normal = LGL_AA(materialIndex, uv, normal, dp1, dp2, duv1, duv2, si.tangent, si.bitangent);
        si.LGL_Ay = LGL_AB(materialIndex);
        si.sheen = LGL_AC(materialIndex);
        si.LGL_Az = LGL_ACTint(materialIndex);
        si.clearcoat = LGL_AF(materialIndex);
        si.LGL_BA = LGL_AFRoughness(materialIndex);
        si.LGL_BB = LGL_AH(materialIndex);
        si.LGL_BC = LGL_AI(materialIndex);
        si.LGL_BD = LGL_AD(materialIndex, uv);
        si.ior = LGL_AJ(materialIndex);
        si.LGL_BE = LGL_AK(materialIndex);
        si.LGL_BF = LGL_AL(materialIndex);
        si.extinction = LGL_AM(materialIndex);
    }
    TriangleIntersect LGL_k(Ray r, Triangle tri) {
        vec3 v0 = tri.p0;
        vec3 v1 = tri.p1;
        vec3 v2 = tri.p2;
        TriangleIntersect ti;
        vec3 e0 = v1 - v0;
        vec3 e1 = v2 - v0;
        vec3 pv = cross(r.d, e1);
        float det = dot(e0, pv);
        vec3 tv = r.o - v0;
        vec3 qv = cross(tv, e0);
        vec4 uvt;
        uvt.x = dot(tv, pv);
        uvt.y = dot(r.d, qv);
        uvt.z = dot(e1, qv);
        uvt.xyz = uvt.xyz / det;
        uvt.w = 1.0 - uvt.x - uvt.y;
        if(uvt.z >= r.LGL_BO) {
            return ti;
        }
        if(all(greaterThanEqual(uvt, vec4(0.0))) && uvt.z < INF) {
            ti.t = uvt.z;
            ti.barycentric = uvt.wxy;
        }
        return ti;
    }
    float LGL_l(Ray r, Box b) {
        vec3 tBot = (b.min - r.o) * r.LGL_BN;
        vec3 tTop = (b.max - r.o) * r.LGL_BN;
        vec3 tNear = min(tBot, tTop);
        vec3 tFar = max(tBot, tTop);
        float t0 = max(tNear.x, max(tNear.y, tNear.z));
        float t1 = min(tFar.x, min(tFar.y, tFar.z));
        return (t0 > t1 || t0 > r.LGL_BO) ? -1.0 : (t0 > 0.0 ? t0 : t1);
    }
    bool LGL_m(inout Ray ray, float maxDist) {
    #if defined(NUM_LIGHTS)
        for(int i = 0; i < NUM_LIGHTS; i++) {
            vec3 position = lights.position[i];
            vec3 emission = lights.emission[i];
            vec3 p1 = lights.p1[i];
            vec3 p2 = lights.p2[i];
            vec4 params = lights.params[i];
            float radius = params.x;
            float area = params.y;
            float type = params.z;
            float visible = params.w;
            if(type == 0. || type == 1.) {
                vec3 normal = normalize(cross(p1, p2));
                if(dot(normal, ray.d) > 0.)
                    continue;
                vec4 plane = vec4(normal, dot(normal, position));
                p1 *= 1.0 / dot(p1, p1);
                p2 *= 1.0 / dot(p2, p2);
                float d = LGL_g(position, p1, p2, plane, ray);
                if(d > 0. && d < maxDist)
                    return true;
            }
            if(type == 1.) {
                float d = LGL_f(radius, position, ray);
                if(d > 0. && d < maxDist)
                    return true;
            }
        }
    #endif
        int nodesToVisit[STACK_SIZE];
        nodesToVisit[0] = 0;
        int stack = 0;
        while(stack >= 0) {
            int i = nodesToVisit[stack--];
            vec4 r1 = LGL_AY(bvhBuffer, i, BVH_COLUMNS);
            vec4 r2 = LGL_AY(bvhBuffer, i + 1, BVH_COLUMNS);
            int splitAxisOrNumPrimitives = floatBitsToInt(r1.w);
            if(splitAxisOrNumPrimitives >= 0) {
                int splitAxis = splitAxisOrNumPrimitives;
                Box bbox = Box(r1.xyz, r2.xyz);
                if(LGL_l(ray, bbox) > 0.0) {
                    if(ray.d[splitAxis] > 0.0) {
                        nodesToVisit[++stack] = floatBitsToInt(r2.w);
                        nodesToVisit[++stack] = i + 2;
                    } else {
                        nodesToVisit[++stack] = i + 2;
                        nodesToVisit[++stack] = floatBitsToInt(r2.w);
                    }
                }
            } else {
                ivec3 index = floatBitsToInt(r1.xyz);
                Triangle tri = Triangle(LGL_AY(positionBuffer, index.x, VERTEX_COLUMNS).xyz, LGL_AY(positionBuffer, index.y, VERTEX_COLUMNS).xyz, LGL_AY(positionBuffer, index.z, VERTEX_COLUMNS).xyz);
                TriangleIntersect LGL_BK = LGL_k(ray, tri);
                if(LGL_BK.t > 0.0 && LGL_BK.t < maxDist) {
                    return true;
                }
            }
        }
        return false;
    }
    void LGL_n(inout Ray ray, inout SurfaceInteraction si, inout LightSampleRec lightSampleRec, int bounce) {
        si.LGL_BK = false;
        float t = INF;
        float d;
    #if defined(NUM_LIGHTS)
        for(int i = 0; i < NUM_LIGHTS; i++) {
            vec4 params = lights.params[i];
            float radius = params.x;
            float area = params.y;
            float type = params.z;
            float visible = params.w;
            if(bounce == 0 && visible < 0.1)
                continue;
            vec3 position = lights.position[i];
            vec3 emission = lights.emission[i];
            vec3 p1 = lights.p1[i];
            vec3 p2 = lights.p2[i];
            if(type == 0. || type == 1.) {
                vec3 normal = normalize(cross(p1, p2));
                if(dot(normal, ray.d) > 0.)
                    continue;
                vec4 plane = vec4(normal, dot(normal, position));
                p1 *= 1.0 / dot(p1, p1);
                p2 *= 1.0 / dot(p2, p2);
                d = LGL_g(position, p1, p2, plane, ray);
                if(d < 0.)
                    d = INF;
                if(d < t) {
                    t = d;
                    float cosTheta = dot(-ray.d, normal);
                    float pdf = (t * t) / (area * cosTheta);
                    lightSampleRec.emission = emission;
                    lightSampleRec.pdf = pdf;
                    si.LGL_BK = true;
                    si.LGL_BI = true;
                    ray.LGL_BO = t;
                }
            }
            if(type == 2.) {
                d = LGL_f(radius, position, ray);
                if(d < 0.)
                    d = INF;
                if(d < t) {
                    t = d;
                    float pdf = (t * t) / area;
                    lightSampleRec.emission = emission;
                    lightSampleRec.pdf = pdf;
                    si.LGL_BK = true;
                    si.LGL_BI = true;
                    ray.LGL_BO = t;
                }
            }
        }
    #endif
        int nodesToVisit[STACK_SIZE];
        nodesToVisit[0] = 0;
        int stack = 0;
        while(stack >= 0) {
            int i = nodesToVisit[stack--];
            vec4 r1 = LGL_AY(bvhBuffer, i, BVH_COLUMNS);
            vec4 r2 = LGL_AY(bvhBuffer, i + 1, BVH_COLUMNS);
            int splitAxisOrNumPrimitives = floatBitsToInt(r1.w);
            if(splitAxisOrNumPrimitives >= 0) {
                int splitAxis = splitAxisOrNumPrimitives;
                Box bbox = Box(r1.xyz, r2.xyz);
                if(LGL_l(ray, bbox) > 0.0) {
                    if(ray.d[splitAxis] > 0.0) {
                        nodesToVisit[++stack] = floatBitsToInt(r2.w);
                        nodesToVisit[++stack] = i + 2;
                    } else {
                        nodesToVisit[++stack] = i + 2;
                        nodesToVisit[++stack] = floatBitsToInt(r2.w);
                    }
                }
            } else {
                ivec3 index = floatBitsToInt(r1.xyz);
                Triangle tri = Triangle(LGL_AY(positionBuffer, index.x, VERTEX_COLUMNS).xyz, LGL_AY(positionBuffer, index.y, VERTEX_COLUMNS).xyz, LGL_AY(positionBuffer, index.z, VERTEX_COLUMNS).xyz);
                TriangleIntersect LGL_BK = LGL_k(ray, tri);
                if(LGL_BK.t > 0.0) {
                    int materialIndex = floatBitsToInt(r2.w);
                    vec3 LGL_BM = r2.xyz;
                    si.t = LGL_BK.t;
                    si.LGL_BI = false;
                    ray.LGL_BO = LGL_BK.t;
                    LGL_j(si, tri, LGL_BK.barycentric, index, LGL_BM, materialIndex);
                    si.LGL_BL = dot(si.LGL_BM, ray.d) <= 0.0 ? si.normal : -si.normal;
                }
            }
        }
        si.roughness = clamp(si.roughness, ROUGHNESS_MIN, 1.0);
        si.metalness = clamp(si.metalness, 0.0, 1.0);
    }
    void LGL_o(inout Ray ray, inout SurfaceInteraction si, inout LightSampleRec lightSampleRec, int depth) {
        if(si.LGL_BK && !si.LGL_BI && si.LGL_BD < 1.0) {
            float LGL_BJ = LGL_AQ();
            while(si.LGL_BK && !si.LGL_BI && LGL_BJ > si.LGL_BD) {
                LGL_AW(ray, si.position + EPS * ray.d, ray.d);
                LGL_n(ray, si, lightSampleRec, depth);
            }
        }
    }
    #ifndef CONST_COLOR_ENV
    uniform sampler2D envMap;
    uniform sampler2D envMapDistribution;
    vec2 LGL_Y(vec3 pointOnSphere) {
        float phi = mod(atan(-pointOnSphere.z, -pointOnSphere.x), TWOPI);
        float theta = acos(pointOnSphere.y);
        return vec2(phi * 0.5 * INVPI, theta * INVPI);
    }
    vec3 LGL_Z(vec3 d) {
        vec2 uv = LGL_Y(d);
        return LGL_An(envMap, uv).rgb;
    }
    float LGL_a(float u, out int vOffset, out float pdf) {
        ivec2 size = textureSize(envMap, 0);
        int left = 0;
        int right = size.y + 1;
        while(left < right) {
            int mid = (left + right) >> 1;
            float s = texelFetch(envMapDistribution, ivec2(0, mid), 0).x;
            if(s <= u) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        vOffset = left - 1;
        vec2 s0 = texelFetch(envMapDistribution, ivec2(0, vOffset), 0).xy;
        vec2 s1 = texelFetch(envMapDistribution, ivec2(0, vOffset + 1), 0).xy;
        pdf = s0.y;
        return (float(vOffset) + (u - s0.x) / (s1.x - s0.x)) / float(size.y);
    }
    float LGL_b(float u, int vOffset, out float pdf) {
        ivec2 size = textureSize(envMap, 0);
        int left = 0;
        int right = size.x + 1;
        while(left < right) {
            int mid = (left + right) >> 1;
            float s = texelFetch(envMapDistribution, ivec2(1 + mid, vOffset), 0).x;
            if(s <= u) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        int uOffset = left - 1;
        vec2 s0 = texelFetch(envMapDistribution, ivec2(1 + uOffset, vOffset), 0).xy;
        vec2 s1 = texelFetch(envMapDistribution, ivec2(1 + uOffset + 1, vOffset), 0).xy;
        pdf = s0.y;
        return (float(uOffset) + (u - s0.x) / (s1.x - s0.x)) / float(size.x);
    }
    float LGL_c(vec2 uv) {
        vec2 size = vec2(textureSize(envMap, 0));
        float sinTheta = sin(uv.y * PI);
        uv *= size;
        float partialX = texelFetch(envMapDistribution, ivec2(1.0 + uv.x, uv.y), 0).y;
        float partialY = texelFetch(envMapDistribution, ivec2(0, uv.y), 0).y;
        return partialX * partialY * INVPI2 / (2.0 * sinTheta);
    }
    vec3 LGL_d(vec2 LGL_AQom, out vec2 uv, out float pdf) {
        vec2 partialPdf;
        int vOffset;
        uv.y = LGL_a(LGL_AQom.x, vOffset, partialPdf.y);
        uv.x = LGL_b(LGL_AQom.y, vOffset, partialPdf.x);
        float phi = uv.x * TWOPI;
        float theta = uv.y * PI;
        float cosTheta = cos(theta);
        float sinTheta = sin(theta);
        float cosPhi = cos(phi);
        float sinPhi = sin(phi);
        vec3 dir = vec3(-sinTheta * cosPhi, cosTheta, -sinTheta * sinPhi);
        pdf = partialPdf.x * partialPdf.y * INVPI2 / (2.0 * sinTheta);
        return dir;
    }
    #endif
    void LGL_AZ(in vec3 N, inout vec3 T, inout vec3 B) {
        if(N.z < -0.999999) {
            T = vec3(0., -1., 0.);
            B = vec3(-1., 0., 0.);
        } else {
            float a = 1.0 / (1. + N.z);
            float b = -N.x * N.y * a;
            T = vec3(1.0 - N.x * N.x * a, b, -N.x);
            B = vec3(b, 1. - N.y * N.y * a, -N.y);
        }
    }
    vec3 LGL_Am(vec3 V, float rgh, float r1, float r2) {
        vec3 Vh = normalize(vec3(rgh * V.x, rgh * V.y, V.z));
        float lensq = Vh.x * Vh.x + Vh.y * Vh.y;
        vec3 T1 = lensq > 0. ? vec3(-Vh.y, Vh.x, 0) * inversesqrt(lensq) : vec3(1., 0., 0.);
        vec3 T2 = cross(Vh, T1);
        float r = sqrt(r1);
        float phi = 2.0 * PI * r2;
        float t1 = r * cos(phi);
        float t2 = r * sin(phi);
        float s = 0.5 * (1.0 + Vh.z);
        t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;
        vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * Vh;
        return normalize(vec3(rgh * Nh.x, rgh * Nh.y, max(0.0, Nh.z)));
    }
    vec2 LGL_Aa(vec2 p) {
        p = 2.0 * p - 1.0;
        bool greater = abs(p.x) > abs(p.y);
        float r = greater ? p.x : p.y;
        float theta = greater ? 0.25 * PI * p.y / p.x : PI * (0.5 - 0.25 * p.x / p.y);
        return r * vec2(cos(theta), sin(theta));
    }
    vec3 LGL_Ab(vec2 p) {
        vec2 h = LGL_Aa(p);
        float z = sqrt(max(0.0, 1.0 - h.x * h.x - h.y * h.y));
        return vec3(h, z);
    }
    vec3 LGL_Ac(float r1, float r2) {
        float z = 1.0 - 2.0 * r1;
        float r = sqrt(max(0.0, 1.0 - z * z));
        float phi = TWOPI * r2;
        return vec3(r * cos(phi), r * sin(phi), z);
    }
    vec3 LGL_Ad(vec3 LGL_BM, vec3 viewDir, mat3 basis, float roughness, vec2 LGL_AQom) {
        float phi = TWOPI * LGL_AQom.y;
        float alpha = roughness * roughness;
        float cosTheta = sqrt((1.0 - LGL_AQom.x) / (1.0 + (alpha * alpha - 1.0) * LGL_AQom.x));
        float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
        vec3 halfVector = basis * sign(dot(LGL_BM, viewDir)) * vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
        vec3 lightDir = reflect(-viewDir, halfVector);
        return lightDir;
    }
    vec3 LGL_Ae(vec3 LGL_BM, vec3 viewDir, mat3 basis, vec2 LGL_AQom) {
        return basis * sign(dot(LGL_BM, viewDir)) * LGL_Ab(LGL_AQom);
    }
    float LGL_Af(float f, float g) {
        return (f * f) / (f * f + g * g);
    }
    vec3 LGL_Ag(in Ray r, int depth, in LightSampleRec lightSampleRec, in BsdfSampleRec bsdfSampleRec) {
        vec3 Le;
        if(depth == 0) {
            Le = lightSampleRec.emission;
        } else {
            Le = LGL_Af(bsdfSampleRec.pdf, lightSampleRec.pdf) * lightSampleRec.emission;
        }
        return Le;
    }
    #if defined(NUM_LIGHTS)
    void LGL_Ah(in Light light, in vec3 surfacePos, inout LightSampleRec lightSampleRec, vec2 LGL_AQom) {
        float r1 = LGL_AQom.x;
        float r2 = LGL_AQom.y;
        vec3 lightSurfacePos = light.position + LGL_Ac(r1, r2) * light.radius;
        lightSampleRec.direction = lightSurfacePos - surfacePos;
        lightSampleRec.dist = length(lightSampleRec.direction);
        float distSq = lightSampleRec.dist * lightSampleRec.dist;
        lightSampleRec.direction /= lightSampleRec.dist;
        lightSampleRec.normal = normalize(lightSurfacePos - light.position);
        lightSampleRec.emission = light.emission * float(NUM_LIGHTS);
        lightSampleRec.pdf = distSq / (light.area * abs(dot(lightSampleRec.normal, lightSampleRec.direction)));
    }
    void LGL_Aj(in Light light, in vec3 surfacePos, inout LightSampleRec lightSampleRec, vec2 LGL_AQom) {
        float r1 = LGL_AQom.x;
        float r2 = LGL_AQom.y;
        vec3 lightSurfacePos = light.position + light.p1 * r1 + light.p2 * r2;
        lightSampleRec.direction = lightSurfacePos - surfacePos;
        lightSampleRec.dist = length(lightSampleRec.direction);
        float distSq = lightSampleRec.dist * lightSampleRec.dist;
        lightSampleRec.direction /= lightSampleRec.dist;
        lightSampleRec.normal = normalize(cross(light.p1, light.p2));
        lightSampleRec.emission = light.emission * float(NUM_LIGHTS);
        lightSampleRec.pdf = distSq / (light.area * abs(dot(lightSampleRec.normal, lightSampleRec.direction)));
    }
    void LGL_Ak(in Light light, in vec3 surfacePos, inout LightSampleRec lightSampleRec) {
        lightSampleRec.direction = normalize(light.position - light.p1);
        lightSampleRec.normal = normalize(surfacePos - light.position);
        if(dot(lightSampleRec.direction, lightSampleRec.normal) > 0.0) {
            lightSampleRec.normal = -lightSampleRec.normal;
        }
        lightSampleRec.emission = light.emission * float(NUM_LIGHTS);
        lightSampleRec.dist = INF;
        lightSampleRec.pdf = 1.0;
    }
    void samplePointLight(in Light light, in vec3 surfacePos, inout LightSampleRec lightSampleRec) {
        lightSampleRec.direction = light.position - surfacePos;
        lightSampleRec.dist = length(lightSampleRec.direction);
        float distSq = lightSampleRec.dist * lightSampleRec.dist;
        lightSampleRec.direction = normalize(lightSampleRec.direction);
        lightSampleRec.normal = normalize(surfacePos - light.position);
        lightSampleRec.emission = light.emission * float(NUM_LIGHTS) / distSq;
        lightSampleRec.pdf = 1.0;
    }
    void LGL_Al(in Light light, in vec3 surfacePos, inout LightSampleRec lightSampleRec, vec2 LGL_AQom) {
        int type = int(light.type);
        if(type == 0 || type == 1) {
            LGL_Aj(light, surfacePos, lightSampleRec, LGL_AQom);
        } else if(type == 2) {
            LGL_Ah(light, surfacePos, lightSampleRec, LGL_AQom);
        } else if(type == 3) {
            LGL_Ak(light, surfacePos, lightSampleRec);
        } else if(type == 4) {
            samplePointLight(light, surfacePos, lightSampleRec);
        }
    }
    #endif
    vec3 LocalToWorld(vec3 X, vec3 Y, vec3 Z, vec3 V) {
        return vec3(X.x * V.x + Y.x * V.y + Z.x * V.z, X.y * V.x + Y.y * V.y + Z.y * V.z, X.z * V.x + Y.z * V.y + Z.z * V.z);
    }
    vec3 WorldToLocal(vec3 X, vec3 Y, vec3 Z, vec3 V) {
        return vec3(dot(V, X), dot(V, Y), dot(V, Z));
    }
    vec3 LGL_A(float r1, float r2) {
        vec3 dir;
        float r = sqrt(r1);
        float phi = TWOPI * r2;
        dir.x = r * cos(phi);
        dir.y = r * sin(phi);
        dir.z = sqrt(max(0.0, 1.0 - dir.x * dir.x - dir.y * dir.y));
        return dir;
    }
    float LGL_B(float eta) {
        float sqrtR0 = (eta - 1.) / (eta + 1.);
        return sqrtR0 * sqrtR0;
    }
    vec3 LGL_C(vec3 baseColor) {
        float luminance = LGL_AV(baseColor);
        return (luminance > 0.0) ? baseColor / luminance : vec3(1.);
    }
    void LGL_D(SurfaceInteraction si, out vec3 Cspec0, out vec3 Csheen) {
        vec3 tint = LGL_C(si.color);
        if(si.LGL_BG > 0.1) {
            Cspec0 = si.specularColor;
        } else {
            Cspec0 = mix(LGL_B(si.ior) * mix(vec3(1.0), tint, min(si.LGL_Ay, 0.99)), si.color, si.metalness);
        }
        Csheen = mix(vec3(1.0), tint, si.LGL_Az);
    }
    float LGL_E(float u) {
        float m = clamp(1.0 - u, 0.0, 1.0);
        float m2 = m * m;
        return m2 * m2 * m;
    }
    float LGL_F(float F0, float cosTheta) {
        return mix(F0, 1.0, LGL_E(cosTheta));
    }
    vec3 LGL_F(vec3 F0, float cosTheta) {
        return mix(F0, vec3(1.), LGL_E(cosTheta));
    }
    float LGL_G(float cosThetaI, float eta) {
        float sinThetaTSq = eta * eta * (1.0f - cosThetaI * cosThetaI);
        if(sinThetaTSq > 1.0)
            return 1.0;
        float cosThetaT = sqrt(max(1.0 - sinThetaTSq, 0.0));
        float rs = (eta * cosThetaT - cosThetaI) / (eta * cosThetaT + cosThetaI);
        float rp = (eta * cosThetaI - cosThetaT) / (eta * cosThetaI + cosThetaT);
        return 0.5 * (rs * rs + rp * rp);
    }
    vec3 LGL_H(vec3 F0, float metalness, float eta, float cosThetaI) {
        vec3 FrSchlick = LGL_F(F0, cosThetaI);
        float FrDielectric = LGL_G(cosThetaI, eta);
        return mix(vec3(FrDielectric), FrSchlick, metalness);
    }
    float LGL_H(float metalness, float eta, float cosThetaI) {
        float FrSchlick = LGL_E(cosThetaI);
        float FrDielectric = LGL_G(cosThetaI, eta);
        return mix(FrDielectric, FrSchlick, metalness);
    }
    float LGL_I(float NDotV, float alphaG) {
        float a = alphaG * alphaG;
        float b = NDotV * NDotV;
        return 1.0 / (NDotV + sqrt(a + b - a * b));
    }
    float LGL_J(float NDotH, float alpha) {
        float alpha2 = alpha * alpha;
        float t = 1.0 + (alpha2 - 1.0) * NDotH * NDotH;
        return (alpha2 - 1.0) / (PI * log(alpha2) * t);
    }
    float LGL_K(float NDotH, float a) {
        float a2 = a * a;
        float t = 1.0 + (a2 - 1.0) * NDotH * NDotH;
        return a2 / (PI * t * t);
    }
    vec3 ImportanceSampleLGL_J(float rgh, float r1, float r2) {
        float a = max(0.001, rgh);
        float a2 = a * a;
        float phi = r1 * TWOPI;
        float cosTheta = sqrt((1.0 - pow(a2, 1.0 - r1)) / (1.0 - a2));
        float sinTheta = clamp(sqrt(1.0 - (cosTheta * cosTheta)), 0.0, 1.0);
        float sinPhi = sin(phi);
        float cosPhi = cos(phi);
        return vec3(sinTheta * cosPhi, sinTheta * sinPhi, cosTheta);
    }
    vec3 ImportanceSampleLGL_K(float rgh, float r1, float r2) {
        float a = max(0.001, rgh);
        float phi = r1 * TWOPI;
        float cosTheta = sqrt((1.0 - r2) / (1.0 + (a * a - 1.0) * r2));
        float sinTheta = clamp(sqrt(1.0 - (cosTheta * cosTheta)), 0.0, 1.0);
        float sinPhi = sin(phi);
        float cosPhi = cos(phi);
        return vec3(sinTheta * cosPhi, sinTheta * sinPhi, cosTheta);
    }
    vec3 LGL_N(SurfaceInteraction si, vec3 Csheen, vec3 V, vec3 L, vec3 H, out float pdf) {
        pdf = 0.0;
        if(L.z <= 0.0)
            return vec3(0.0);
        pdf = L.z * INVPI;
        float LDotH = dot(L, H);
        float FL = LGL_E(L.z);
        float FV = LGL_E(V.z);
        float Fh = LGL_E(LDotH);
        float Fd90 = 0.5 + 2.0 * LDotH * LDotH * si.roughness;
        float Fd = mix(1.0, Fd90, FL) * mix(1.0, Fd90, FV);
        float Fss90 = LDotH * LDotH * si.roughness;
        float Fss = mix(1.0, Fss90, FL) * mix(1.0, Fss90, FV);
        float DisneyFakeSS = 1.25 * (Fss * (1.0 / (L.z + V.z) - 0.5) + 0.5);
        vec3 Fsheen = Fh * si.sheen * Csheen;
        return (INVPI * mix(Fd, DisneyFakeSS, si.LGL_BB) * si.color + Fsheen) * (1.0 - si.metalness) * (1.0 - si.LGL_BC);
    }
    vec3 LGL_O(SurfaceInteraction si, vec3 Cspec0, vec3 V, vec3 L, vec3 H, out float pdf) {
        pdf = 0.0;
        if(L.z <= 0.0)
            return vec3(0.0);
        float LDotH = dot(L, H);
        float D = LGL_K(H.z, si.roughness);
        pdf = D * H.z / (4.0 * LDotH);
        vec3 F = LGL_H(Cspec0, si.metalness, si.eta, LDotH);
        float G = LGL_I(abs(L.z), si.roughness) * LGL_I(abs(V.z), si.roughness);
        return F * D * G;
    }
    vec3 LGL_P(SurfaceInteraction si, vec3 Cspec0, vec3 V, vec3 L, vec3 H, out float pdf) {
        pdf = 0.0;
        if(L.z >= 0.0)
            return vec3(0.0);
        float F = LGL_G(abs(dot(V, H)), si.eta);
        float D = LGL_K(H.z, si.roughness);
        float denomSqrt = dot(L, H) + dot(V, H) * si.eta;
        pdf = D * H.z * abs(dot(L, H)) / (denomSqrt * denomSqrt);
        float G = LGL_I(abs(L.z), si.roughness) * LGL_I(abs(V.z), si.roughness);
        vec3 specColor = pow(si.color, vec3(0.5));
        return specColor * (1.0 - si.metalness) * si.LGL_BC * (1.0 - F) * D * G * abs(dot(V, H)) * abs(dot(L, H)) * 4.0 * si.eta * si.eta / (denomSqrt * denomSqrt);
    }
    vec3 LGL_Q(SurfaceInteraction si, vec3 V, vec3 L, vec3 H, out float pdf) {
        pdf = 0.0;
        if(L.z <= 0.0)
            return vec3(0.0);
        float LDotH = dot(L, H);
        float F = LGL_F(.04, LDotH);
        float D = LGL_J(H.z, mix(0.1, 0.001, 1. - si.LGL_BA));
        pdf = D * H.z / (4.0 * LDotH);
        float G = LGL_I(L.z, 0.25) * LGL_I(V.z, 0.25);
        return vec3(0.25 * si.clearcoat * F * D * G);
    }
    void LGL_R(SurfaceInteraction si, vec3 Cspec0, float fresnelWeight, out float LGL_S, out float LGL_T, out float LGL_U, out float LGL_V) {
        LGL_S = max(LGL_AV(si.color), si.sheen) * (1.0 - si.metalness) * (1.0 - si.LGL_BC);
        LGL_T = LGL_AV(mix(Cspec0, vec3(1.0), fresnelWeight));
        LGL_U = (1.0 - fresnelWeight) * (1.0 - si.metalness) * si.LGL_BC * LGL_AV(si.color);
        LGL_V = si.clearcoat * (1.0 - si.metalness);
        float weightSum = LGL_S + LGL_T + LGL_U + LGL_V;
        LGL_S /= weightSum;
        LGL_T /= weightSum;
        LGL_U /= weightSum;
        LGL_V /= weightSum;
    }
    vec3 LGL_W(SurfaceInteraction si, vec3 V, vec3 N, out vec3 L, out float pdf, MaterialSamples LGL_AQomSamples) {
        pdf = 0.0;
        vec3 f = vec3(0.0);
        vec2 bounceDirSample = LGL_AQomSamples.s3;
        vec2 diffuseOrSpecular = LGL_AQomSamples.s4;
        float r1 = bounceDirSample.x;
        float r2 = bounceDirSample.y;
        vec3 Cspec0, Csheen;
        LGL_D(si, Cspec0, Csheen);
        vec3 T, B;
        LGL_AZ(N, T, B);
        V = WorldToLocal(T, B, N, V);
        float LGL_S, LGL_T, LGL_U, LGL_V;
        float fresnelWeight = LGL_H(si.metalness, si.eta, V.z);
        LGL_R(si, Cspec0, fresnelWeight, LGL_S, LGL_T, LGL_U, LGL_V);
        float cdf[4];
        cdf[0] = LGL_S;
        cdf[1] = cdf[0] + LGL_T;
        cdf[2] = cdf[1] + LGL_U;
        cdf[3] = cdf[2] + LGL_V;
        if(r1 < cdf[0]) {
            r1 /= cdf[0];
            L = LGL_A(r1, r2);
            vec3 H = normalize(L + V);
            f = LGL_N(si, Csheen, V, L, H, pdf);
            pdf *= LGL_S;
        } else if(r1 < cdf[1]) {
            r1 = (r1 - cdf[0]) / (cdf[1] - cdf[0]);
            vec3 H = ImportanceSampleLGL_K(si.roughness, r1, r2);
            if(dot(V, H) < 0.0)
                H = -H;
            L = normalize(reflect(-V, H));
            f = LGL_O(si, Cspec0, V, L, H, pdf);
            pdf *= LGL_T;
        } else if(r1 < cdf[2]) {
            r1 = (r1 - cdf[1]) / (cdf[2] - cdf[1]);
            vec3 H = ImportanceSampleLGL_K(si.roughness, r1, r2);
            if(dot(V, H) < 0.0)
                H = -H;
            vec3 R = reflect(-V, H);
            L = normalize(refract(-V, H, si.eta));
            f = LGL_P(si, Cspec0, V, L, H, pdf);
            pdf *= LGL_U;
        } else {
            r1 = (r1 - cdf[2]) / (1.0 - cdf[2]);
            vec3 H = ImportanceSampleLGL_J(mix(0.1, 0.001, 1. - si.LGL_BA), r1, r2);
            if(dot(V, H) < 0.0)
                H = -H;
            L = normalize(reflect(-V, H));
            f = LGL_Q(si, V, L, H, pdf);
            pdf *= LGL_V;
        }
        L = LocalToWorld(T, B, N, L);
        return f * abs(dot(N, L));
    }
    vec3 LGL_X(inout SurfaceInteraction si, vec3 V, vec3 L, out float bsdfPdf) {
        bsdfPdf = 0.0;
        vec3 f = vec3(0.0);
        vec3 N = si.LGL_BL;
        vec3 T, B;
        LGL_AZ(N, T, B);
        V = WorldToLocal(T, B, N, V);
        L = WorldToLocal(T, B, N, L);
        vec3 H;
        if(L.z > 0.0) {
            H = normalize(L + V);
        } else {
            H = normalize(L + V * si.eta);
        }
        if(dot(V, H) < 0.0) {
            H = -H;
        }
        vec3 Cspec0, Csheen;
        LGL_D(si, Cspec0, Csheen);
        float LGL_S, LGL_T, LGL_U, LGL_V;
        float fresnelWeight = LGL_H(si.metalness, si.eta, abs(dot(L, H)));
        LGL_R(si, Cspec0, fresnelWeight, LGL_S, LGL_T, LGL_U, LGL_V);
        float pdf;
        if(LGL_S > 0.0 && L.z > 0.0) {
            f += LGL_N(si, Csheen, V, L, H, pdf);
            bsdfPdf += pdf * LGL_S;
        }
        if(LGL_T > 0.0 && L.z > 0.0 && V.z > 0.0) {
            f += LGL_O(si, Cspec0, V, L, H, pdf);
            bsdfPdf += pdf * LGL_T;
        }
        if(LGL_U > 0.0 && L.z < 0.0) {
            f += LGL_P(si, Cspec0, V, L, H, pdf);
            bsdfPdf += pdf * LGL_U;
        }
        if(LGL_V > 0.0 && L.z > 0.0 && V.z > 0.0) {
            f += LGL_Q(si, V, L, H, pdf);
            bsdfPdf += pdf * LGL_V;
        }
        return f * abs(L.z);
    }
    vec3 LGL_e(inout SurfaceInteraction si, in Path path, in vec2 s1, in vec2 s2) {
        si.eta = dot(si.normal, si.LGL_BL) > 0.0 ? (1.0 / si.ior) : si.ior;
        vec3 viewDir = -path.ray.d;
        vec3 surfacePos = si.position + EPS * si.normal;
        vec3 Li = vec3(0.0);
        BsdfSampleRec bsdfSampleRec;
        vec2 lightDirSample = s1;
        vec2 envDirSample = s2;
        vec3 lightDir;
        vec2 uv;
        float lightPdf;
        bool brdfSample = false;
    #ifndef CONST_COLOR_ENV
        lightDir = LGL_d(envDirSample, uv, lightPdf);
        LGL_AW(path.ray, surfacePos, lightDir);
        if(!LGL_m(path.ray, INF - EPS)) {
            vec3 irr = LGL_An(envMap, uv).rgb * envMapIntensity;
            bsdfSampleRec.f = LGL_X(si, viewDir, lightDir, bsdfSampleRec.pdf);
            if(bsdfSampleRec.pdf > 0.0) {
                float LGL_BR = LGL_Af(lightPdf, bsdfSampleRec.pdf);
                if(LGL_BR > 0.0) {
                    Li += LGL_BR * bsdfSampleRec.f * irr / lightPdf;
                }
            }
        }
    #endif
    #if defined(NUM_LIGHTS)
        LightSampleRec lightSampleRec;
        Light light;
        int i = int(lightDirSample.x * float(NUM_LIGHTS));
        vec3 position = lights.position[i];
        vec3 emission = lights.emission[i];
        vec3 p1 = lights.p1[i];
        vec3 p2 = lights.p2[i];
        vec4 params = lights.params[i];
        float radius = params.x;
        float area = params.y;
        float type = params.z;
        float visible = params.w;
        light = Light(position, emission, p1, p2, radius, area, type, visible);
        LGL_Al(light, surfacePos, lightSampleRec, lightDirSample);
        if(dot(lightSampleRec.direction, lightSampleRec.normal) < 0.0) {
            LGL_AW(path.ray, surfacePos, lightSampleRec.direction);
            if(!LGL_m(path.ray, lightSampleRec.dist - EPS)) {
                bsdfSampleRec.f = LGL_X(si, viewDir, lightSampleRec.direction, bsdfSampleRec.pdf);
                float LGL_BR = 1.0;
                if(light.area > 0.0 && bsdfSampleRec.pdf > 0.0) {
                    LGL_BR = LGL_Af(lightSampleRec.pdf, bsdfSampleRec.pdf);
                }
                if(LGL_BR > 0.0) {
                    Li += LGL_BR * bsdfSampleRec.f * lightSampleRec.emission / lightSampleRec.pdf;
                }
            }
        }
    #endif
        return Li;
    }
    layout(location = 0) out vec4 out_light;
    void bounce(inout Path path, int depth, inout SurfaceInteraction si, inout BsdfSampleRec bsdfSampleRec, in LightSampleRec lightSampleRec) {
        if(!si.LGL_BK) {
            if(depth == 0 && enviromentVisible == 0.) {
                path.alpha = 0.0;
                path.LGL_BQ = true;
                return;
            }
    #ifdef CONST_COLOR_ENV
            path.li += backgroundColor * path.beta;
            path.LGL_BQ = true;
            return;
    #else
            float LGL_BR = 1.0;
            if(depth > 0) {
                float lightPdf = LGL_c(LGL_Y(path.ray.d));
                LGL_BR = LGL_Af(bsdfSampleRec.pdf, lightPdf);
            }
            vec3 irr = LGL_Z(path.ray.d) * envMapIntensity;
            path.li += LGL_BR * path.beta * irr;
            path.LGL_BQ = true;
            return;
    #endif
        }
        if(si.LGL_BI) {
            path.li += LGL_Ag(path.ray, depth, lightSampleRec, bsdfSampleRec) * path.beta;
            path.LGL_BQ = true;
            return;
        }
        if(dot(si.normal, si.LGL_BL) > 0.0) {
            path.LGL_BS = vec3(0.0);
        }
        path.li += path.beta * si.emissive;
        path.beta *= exp(-path.LGL_BS * si.t);
        MaterialSamples LGL_AQomSamples = getRandomMaterialSamples();
        if(si.LGL_BH == DISNEY) {
            path.li += LGL_e(si, path, LGL_AQomSamples.s1, LGL_AQomSamples.s2) * path.beta;
        }
        bsdfSampleRec.f = LGL_W(si, -path.ray.d, si.LGL_BL, bsdfSampleRec.L, bsdfSampleRec.pdf, LGL_AQomSamples);
        if(dot(si.LGL_BL, bsdfSampleRec.L) < 0.0) {
            path.LGL_BS = -log(si.extinction) / si.LGL_BE;
        }
        if(bsdfSampleRec.pdf > 0.0) {
            path.beta *= bsdfSampleRec.f / bsdfSampleRec.pdf;
        } else {
            path.LGL_BQ = true;
            return;
        }
        if(depth >= 2) {
            float q = 1.0 - LGL_AV(path.beta);
            if(LGL_AQomSample() < q) {
                path.LGL_BQ = true;
                return;
            }
            path.beta /= 1.0 - q;
        }
        LGL_AW(path.ray, si.position + EPS * bsdfSampleRec.L, bsdfSampleRec.L);
    }
    vec4 LGL_Ao(inout Ray ray) {
        SurfaceInteraction si;
        Path path;
        BsdfSampleRec bsdfSampleRec;
        LightSampleRec lightSampleRec;
        path.ray = ray;
        path.li = vec3(0);
        path.alpha = 1.0;
        path.LGL_BQ = false;
        path.LGL_BR = 1.0;
        path.LGL_BS = vec3(0.0);
        path.beta = vec3(1.0);
        for(int i = 0; i < bounces; i++) {
            if(path.LGL_BQ) {
                return vec4(path.li, path.alpha);
            }
            LGL_n(path.ray, si, lightSampleRec, i);
            LGL_o(path.ray, si, lightSampleRec, i);
            bounce(path, i, si, bsdfSampleRec, lightSampleRec);
        }
        return vec4(path.li, path.alpha);
    }
    void main() {
        LGL_AS(frameCount);
        vec2 vCoordAntiAlias = vCoord + jitter;
        vec3 direction = normalize(vec3(vCoordAntiAlias - 0.5, -1.0) * vec3(camera.aspect, 1.0, camera.fov));
    #ifdef USE_LENS_CAMERA
        vec2 lensPoint = camera.aperture * LGL_Aa(vec2(LGL_AN(vCoordAntiAlias)));
        vec3 focusPoint = -direction * camera.focus / direction.z;
        vec3 origin = vec3(lensPoint, 0.0);
        direction = normalize(focusPoint - origin);
        origin = vec3(camera.transform * vec4(origin, 1.0));
        direction = mat3(camera.transform) * direction;
    #else
        vec3 origin = camera.transform[3].xyz;
        direction = mat3(camera.transform) * direction;
    #endif
        Ray cam;
        LGL_AW(cam, origin, direction);
        vec4 liAndAlpha = LGL_Ao(cam);
        if(!(liAndAlpha.x < INF && liAndAlpha.x > -EPS)) {
            liAndAlpha = vec4(0, 0, 0, 1);
        }
        out_light = liAndAlpha;
    }`,
};

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

async function makeRayTracePass(
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

// var ie = {
//     source:
//       "in vec3 aPosition;in vec3 aNormal;in vec2 aUv;in ivec2 aMaterialMeshIndex;uniform mat4 projView;out vec3 vPosition;out vec3 vNormal;out vec2 vUv;flat out ivec2 vMaterialMeshIndex;void main(){vPosition=aPosition;vNormal=aNormal;vUv=aUv;vMaterialMeshIndex=aMaterialMeshIndex;gl_Position=projView*vec4(aPosition,1);}",
//   }
var ie = {
  source: `in vec3 aPosition;
      in vec3 aNormal;
      in vec2 aUv;
      in ivec2 aMaterialMeshIndex;
      uniform mat4 projView;
      out vec3 vPosition;
      out vec3 vNormal;
      out vec2 vUv;
      flat out ivec2 vMaterialMeshIndex;
      void main() {
          vPosition = aPosition;
          vNormal = aNormal;
          vUv = aUv;
          vMaterialMeshIndex = aMaterialMeshIndex;
          gl_Position = projView * vec4(aPosition, 1);
      }
      `,
};

// var oe = {
//   source:
//     "\n#define PI 3.14159265359\n#define TWOPI 6.28318530718\n#define INVPI 0.31830988618\n#define INVPI2 0.10132118364\n#define EPS 0.0001\n#define ONE_MINUS_EPS 0.999999\n#define INF 1000000.0\n#define ROUGHNESS_MIN 0.001\nuniform Materials{vec4 colorAndMaterialType[NUM_MATERIALS];vec4 roughnessMetalnessNormalScale[NUM_MATERIALS];vec4 alphaSpecularTintSheenSheenTint[NUM_MATERIALS];vec4 clearcoaRoughnessSubfaceTransmission[NUM_MATERIALS];vec4 iorAtDistanceAnisotropicWorkflow[NUM_MATERIALS];vec4 extinction[NUM_MATERIALS];vec4 specularColorGlossiness[NUM_MATERIALS];\n#if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS) || defined(NUM_PBR_MAPS)\nivec4 diffuseNormalRoughnessMetalnessMapIndex[NUM_MATERIALS];\n#endif\n#if defined(NUM_EMISSIVE_MAPS) || defined(NUM_PBR_SG_MAPS)\nivec4 emissiveSpecularGlossinessMapIndex[NUM_MATERIALS];\n#endif\n#if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS)\nvec4 diffuseNormalMapSize[NUM_DIFFUSE_NORMAL_MAPS];\n#endif\n#if defined(NUM_PBR_MAPS)\nvec2 pbrMapSize[NUM_PBR_MAPS];\n#else\n#if defined(NUM_PBR_SG_MAPS)\nvec2 pbrMapSize[NUM_PBR_SG_MAPS];\n#else\n#if defined(NUM_EMISSIVE_MAPS)\nvec2 pbrMapSize[NUM_EMISSIVE_MAPS];\n#endif\n#endif\n#endif\n}materials;\n#ifdef NUM_DIFFUSE_MAPS\nuniform mediump sampler2DArray diffuseMap;\n#endif\n#ifdef NUM_NORMAL_MAPS\nuniform mediump sampler2DArray normalMap;\n#endif\n#ifdef NUM_PBR_MAPS\nuniform mediump sampler2DArray pbrMap;\n#endif\n#ifdef NUM_PBR_SG_MAPS\nuniform mediump sampler2DArray pbrSGMap;\n#endif\n#ifdef NUM_EMISSIVE_MAPS\nuniform mediump sampler2DArray emissiveMap;\n#endif\nfloat LGL_p(int materialIndex){return materials.colorAndMaterialType[materialIndex].w;}float LGL_q(int materialIndex){return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].w;}vec3 LGL_r(int materialIndex,vec2 uv){vec3 emissive=vec3(0.0);\n#ifdef NUM_EMISSIVE_MAPS\nint emissiveMapIndex=materials.emissiveSpecularGlossinessMapIndex[materialIndex].x;if(emissiveMapIndex>=0){emissive=texture(emissiveMap,vec3(uv*materials.pbrMapSize[emissiveMapIndex].xy,emissiveMapIndex)).rgb;}\n#endif\nreturn emissive;}vec3 LGL_s(int materialIndex,vec2 uv){vec3 specularColor=materials.specularColorGlossiness[materialIndex].rgb;\n#ifdef NUM_PBR_SG_MAPS\nint specularMapIndex=materials.emissiveSpecularGlossinessMapIndex[materialIndex].y;if(specularMapIndex>=0){vec3 texelSpecular=texture(pbrSGMap,vec3(uv*materials.pbrMapSize[specularMapIndex].xy,specularMapIndex)).rgb;texelSpecular=pow(texelSpecular,vec3(2.2));specularColor*=texelSpecular;}\n#endif\nreturn specularColor;}float LGL_t(int materialIndex,vec2 uv){float glossiness=materials.specularColorGlossiness[materialIndex].a;\n#ifdef NUM_PBR_SG_MAPS\nint glossinessMapIndex=materials.emissiveSpecularGlossinessMapIndex[materialIndex].z;if(glossinessMapIndex>=0){float texelGlossiness=texture(pbrSGMap,vec3(uv*materials.pbrMapSize[glossinessMapIndex].xy,glossinessMapIndex)).a;glossiness*=texelGlossiness;}\n#endif\nreturn glossiness;}float LGL_u(int materialIndex,vec2 uv){float LGL_BG=LGL_q(materialIndex);float roughness=0.0;if(LGL_BG>0.1){roughness=1.0-LGL_t(materialIndex,uv);}else{roughness=materials.roughnessMetalnessNormalScale[materialIndex].x;\n#ifdef NUM_PBR_MAPS\nint roughnessMapIndex=materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].z;if(roughnessMapIndex>=0){roughness*=texture(pbrMap,vec3(uv*materials.pbrMapSize[roughnessMapIndex].xy,roughnessMapIndex)).g;}\n#endif\n}return roughness*roughness;}float LGL_v(const vec3 v){return max(v.x,max(v.y,v.z));}float LGL_w(const vec3 specularColor){return LGL_v(specularColor);}vec3 LGL_x(const vec3 baseColor,float metallic){return baseColor*(1.0-metallic);}float LGL_y(int materialIndex,vec2 uv){float LGL_BG=LGL_q(materialIndex);float metalness=0.0;if(LGL_BG>0.1){vec3 specularFactor=LGL_s(materialIndex,uv);metalness=LGL_w(specularFactor);}else{metalness=materials.roughnessMetalnessNormalScale[materialIndex].y;\n#ifdef NUM_PBR_MAPS\nint metalnessMapIndex=materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].w;if(metalnessMapIndex>=0){metalness*=texture(pbrMap,vec3(uv*materials.pbrMapSize[metalnessMapIndex].xy,metalnessMapIndex)).b;}\n#endif\n}return metalness;}vec3 LGL_z(int materialIndex,vec2 uv){vec3 color=materials.colorAndMaterialType[materialIndex].rgb;\n#ifdef NUM_DIFFUSE_MAPS\nint diffuseMapIndex=materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;if(diffuseMapIndex>=0){color*=texture(diffuseMap,vec3(uv*materials.diffuseNormalMapSize[diffuseMapIndex].xy,diffuseMapIndex)).rgb;}\n#endif\nfloat LGL_BG=LGL_q(materialIndex);if(LGL_BG>0.1){vec3 specularFactor=LGL_s(materialIndex,uv);color=LGL_x(color,LGL_w(specularFactor));}return color;}vec3 LGL_AA(int materialIndex,vec2 uv,vec3 normal,vec3 dp1,vec3 dp2,vec2 duv1,vec2 duv2,inout vec3 tangent,inout vec3 bitangent){vec3 dp2perp=cross(dp2,normal);vec3 dp1perp=cross(normal,dp1);vec3 dpdu=dp2perp*duv1.x+dp1perp*duv2.x;vec3 dpdv=dp2perp*duv1.y+dp1perp*duv2.y;float invmax=inversesqrt(max(dot(dpdu,dpdu),dot(dpdv,dpdv)));dpdu*=invmax;dpdv*=invmax;tangent=normalize(dpdu);bitangent=normalize(dpdv);\n#ifdef NUM_NORMAL_MAPS\nint normalMapIndex=materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].y;if(normalMapIndex>=0){vec3 n=2.0*texture(normalMap,vec3(uv*materials.diffuseNormalMapSize[normalMapIndex].zw,normalMapIndex)).rgb-1.0;n.xy*=materials.roughnessMetalnessNormalScale[materialIndex].zw;mat3 tbn=mat3(dpdu,dpdv,normal);return normalize(tbn*n);}else{return normal;}\n#endif\nreturn normal;}float LGL_AD(int materialIndex,vec2 uv){float alpha=materials.alphaSpecularTintSheenSheenTint[materialIndex].x;\n#ifdef NUM_DIFFUSE_MAPS\nint diffuseMapIndex=materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;if(diffuseMapIndex>=0){alpha*=texture(diffuseMap,vec3(uv*materials.diffuseNormalMapSize[diffuseMapIndex].xy,diffuseMapIndex)).a;}\n#endif\nreturn alpha;}float LGL_AB(int materialIndex){return materials.alphaSpecularTintSheenSheenTint[materialIndex].y;}float LGL_AC(int materialIndex){return materials.alphaSpecularTintSheenSheenTint[materialIndex].z;}float LGL_ACTint(int materialIndex){return materials.alphaSpecularTintSheenSheenTint[materialIndex].w;}float LGL_AF(int materialIndex){return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].x;}float LGL_AFRoughness(int materialIndex){return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].y;}float LGL_AH(int materialIndex){return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].z;}float LGL_AI(int materialIndex){return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].w;}float LGL_AJ(int materialIndex){return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].x;}float LGL_AK(int materialIndex){return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].y;}float LGL_AL(int materialIndex){return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].z;}vec3 LGL_AM(int materialIndex){return materials.extinction[materialIndex].rgb;}layout(location=0)out vec4 out_position;layout(location=1)out vec4 out_normal;layout(location=2)out vec4 out_color;in vec3 vPosition;in vec3 vNormal;in vec2 vUv;flat in ivec2 vMaterialMeshIndex;vec3 LGL_BMs(vec3 pos){vec3 fdx=dFdx(pos);vec3 fdy=dFdy(pos);return cross(fdx,fdy);}void main(){int materialIndex=vMaterialMeshIndex.x;int meshIndex=vMaterialMeshIndex.y;vec2 uv=fract(vUv);vec3 color=LGL_z(materialIndex,uv);float LGL_BH=LGL_p(materialIndex);vec3 normal=normalize(vNormal);vec3 LGL_BM=normalize(LGL_BMs(vPosition));normal*=sign(dot(normal,LGL_BM));\n#ifdef NUM_NORMAL_MAPS\nvec3 dp1=dFdx(vPosition);vec3 dp2=dFdy(vPosition);vec2 duv1=dFdx(vUv);vec2 duv2=dFdy(vUv);vec3 tangent,bitangent;normal=LGL_AA(materialIndex,uv,normal,dp1,dp2,duv1,duv2,tangent,bitangent);\n#endif\nout_position=vec4(vPosition,float(meshIndex)+EPS);out_normal=vec4(normal,LGL_BH);out_color=vec4(color,0.);}",
// };

var oe = {
  source: `#define PI 3.14159265359
      #define TWOPI 6.28318530718
      #define INVPI 0.31830988618
      #define INVPI2 0.10132118364
      #define EPS 0.0001
      #define ONE_MINUS_EPS 0.999999
      #define INF 1000000.0
      #define ROUGHNESS_MIN 0.001
      uniform Materials {
          vec4 colorAndMaterialType[NUM_MATERIALS];
          vec4 roughnessMetalnessNormalScale[NUM_MATERIALS];
          vec4 alphaSpecularTintSheenSheenTint[NUM_MATERIALS];
          vec4 clearcoaRoughnessSubfaceTransmission[NUM_MATERIALS];
          vec4 iorAtDistanceAnisotropicWorkflow[NUM_MATERIALS];
          vec4 extinction[NUM_MATERIALS];
          vec4 specularColorGlossiness[NUM_MATERIALS];
      #if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS) || defined(NUM_PBR_MAPS)
          ivec4 diffuseNormalRoughnessMetalnessMapIndex[NUM_MATERIALS];
      #endif
      #if defined(NUM_EMISSIVE_MAPS) || defined(NUM_PBR_SG_MAPS)
          ivec4 emissiveSpecularGlossinessMapIndex[NUM_MATERIALS];
      #endif
      #if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS)
          vec4 diffuseNormalMapSize[NUM_DIFFUSE_NORMAL_MAPS];
      #endif
      #if defined(NUM_PBR_MAPS)
          vec2 pbrMapSize[NUM_PBR_MAPS];
      #else
      #if defined(NUM_PBR_SG_MAPS)
          vec2 pbrMapSize[NUM_PBR_SG_MAPS];
      #else
      #if defined(NUM_EMISSIVE_MAPS)
          vec2 pbrMapSize[NUM_EMISSIVE_MAPS];
      #endif
      #endif
      #endif
      } materials;
      #ifdef NUM_DIFFUSE_MAPS
      uniform mediump sampler2DArray diffuseMap;
      #endif
      #ifdef NUM_NORMAL_MAPS
      uniform mediump sampler2DArray normalMap;
      #endif
      #ifdef NUM_PBR_MAPS
      uniform mediump sampler2DArray pbrMap;
      #endif
      #ifdef NUM_PBR_SG_MAPS
      uniform mediump sampler2DArray pbrSGMap;
      #endif
      #ifdef NUM_EMISSIVE_MAPS
      uniform mediump sampler2DArray emissiveMap;
      #endif
      float LGL_p(int materialIndex) {
          return materials.colorAndMaterialType[materialIndex].w;
      }
      float LGL_q(int materialIndex) {
          return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].w;
      }
      vec3 LGL_r(int materialIndex, vec2 uv) {
          vec3 emissive = vec3(0.0);
      #ifdef NUM_EMISSIVE_MAPS
          int emissiveMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].x;
          if(emissiveMapIndex >= 0) {
              emissive = texture(emissiveMap, vec3(uv * materials.pbrMapSize[emissiveMapIndex].xy, emissiveMapIndex)).rgb;
          }
      #endif
          return emissive;
      }
      vec3 LGL_s(int materialIndex, vec2 uv) {
          vec3 specularColor = materials.specularColorGlossiness[materialIndex].rgb;
      #ifdef NUM_PBR_SG_MAPS
          int specularMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].y;
          if(specularMapIndex >= 0) {
              vec3 texelSpecular = texture(pbrSGMap, vec3(uv * materials.pbrMapSize[specularMapIndex].xy, specularMapIndex)).rgb;
              texelSpecular = pow(texelSpecular, vec3(2.2));
              specularColor *= texelSpecular;
          }
      #endif
          return specularColor;
      }
      float LGL_t(int materialIndex, vec2 uv) {
          float glossiness = materials.specularColorGlossiness[materialIndex].a;
      #ifdef NUM_PBR_SG_MAPS
          int glossinessMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].z;
          if(glossinessMapIndex >= 0) {
              float texelGlossiness = texture(pbrSGMap, vec3(uv * materials.pbrMapSize[glossinessMapIndex].xy, glossinessMapIndex)).a;
              glossiness *= texelGlossiness;
          }
      #endif
          return glossiness;
      }
      float LGL_u(int materialIndex, vec2 uv) {
          float LGL_BG = LGL_q(materialIndex);
          float roughness = 0.0;
          if(LGL_BG > 0.1) {
              roughness = 1.0 - LGL_t(materialIndex, uv);
          } else {
              roughness = materials.roughnessMetalnessNormalScale[materialIndex].x;
      #ifdef NUM_PBR_MAPS
              int roughnessMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].z;
              if(roughnessMapIndex >= 0) {
                  roughness *= texture(pbrMap, vec3(uv * materials.pbrMapSize[roughnessMapIndex].xy, roughnessMapIndex)).g;
              }
      #endif
          }
          return roughness * roughness;
      }
      float LGL_v(const vec3 v) {
          return max(v.x, max(v.y, v.z));
      }
      float LGL_w(const vec3 specularColor) {
          return LGL_v(specularColor);
      }
      vec3 LGL_x(const vec3 baseColor, float metallic) {
          return baseColor * (1.0 - metallic);
      }
      float LGL_y(int materialIndex, vec2 uv) {
          float LGL_BG = LGL_q(materialIndex);
          float metalness = 0.0;
          if(LGL_BG > 0.1) {
              vec3 specularFactor = LGL_s(materialIndex, uv);
              metalness = LGL_w(specularFactor);
          } else {
              metalness = materials.roughnessMetalnessNormalScale[materialIndex].y;
      #ifdef NUM_PBR_MAPS
              int metalnessMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].w;
              if(metalnessMapIndex >= 0) {
                  metalness *= texture(pbrMap, vec3(uv * materials.pbrMapSize[metalnessMapIndex].xy, metalnessMapIndex)).b;
              }
      #endif
          }
          return metalness;
      }
      vec3 LGL_z(int materialIndex, vec2 uv) {
          vec3 color = materials.colorAndMaterialType[materialIndex].rgb;
      #ifdef NUM_DIFFUSE_MAPS
          int diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;
          if(diffuseMapIndex >= 0) {
              color *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).rgb;
          }
      #endif
          float LGL_BG = LGL_q(materialIndex);
          if(LGL_BG > 0.1) {
              vec3 specularFactor = LGL_s(materialIndex, uv);
              color = LGL_x(color, LGL_w(specularFactor));
          }
          return color;
      }
      vec3 LGL_AA(int materialIndex, vec2 uv, vec3 normal, vec3 dp1, vec3 dp2, vec2 duv1, vec2 duv2, inout vec3 tangent, inout vec3 bitangent) {
          vec3 dp2perp = cross(dp2, normal);
          vec3 dp1perp = cross(normal, dp1);
          vec3 dpdu = dp2perp * duv1.x + dp1perp * duv2.x;
          vec3 dpdv = dp2perp * duv1.y + dp1perp * duv2.y;
          float invmax = inversesqrt(max(dot(dpdu, dpdu), dot(dpdv, dpdv)));
          dpdu *= invmax;
          dpdv *= invmax;
          tangent = normalize(dpdu);
          bitangent = normalize(dpdv);
      #ifdef NUM_NORMAL_MAPS
          int normalMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].y;
          if(normalMapIndex >= 0) {
              vec3 n = 2.0 * texture(normalMap, vec3(uv * materials.diffuseNormalMapSize[normalMapIndex].zw, normalMapIndex)).rgb - 1.0;
              n.xy *= materials.roughnessMetalnessNormalScale[materialIndex].zw;
              mat3 tbn = mat3(dpdu, dpdv, normal);
              return normalize(tbn * n);
          } else {
              return normal;
          }
      #endif
          return normal;
      }
      float LGL_AD(int materialIndex, vec2 uv) {
          float alpha = materials.alphaSpecularTintSheenSheenTint[materialIndex].x;
      #ifdef NUM_DIFFUSE_MAPS
          int diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;
          if(diffuseMapIndex >= 0) {
              alpha *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).a;
          }
      #endif
          return alpha;
      }
      float LGL_AB(int materialIndex) {
          return materials.alphaSpecularTintSheenSheenTint[materialIndex].y;
      }
      float LGL_AC(int materialIndex) {
          return materials.alphaSpecularTintSheenSheenTint[materialIndex].z;
      }
      float LGL_ACTint(int materialIndex) {
          return materials.alphaSpecularTintSheenSheenTint[materialIndex].w;
      }
      float LGL_AF(int materialIndex) {
          return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].x;
      }
      float LGL_AFRoughness(int materialIndex) {
          return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].y;
      }
      float LGL_AH(int materialIndex) {
          return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].z;
      }
      float LGL_AI(int materialIndex) {
          return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].w;
      }
      float LGL_AJ(int materialIndex) {
          return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].x;
      }
      float LGL_AK(int materialIndex) {
          return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].y;
      }
      float LGL_AL(int materialIndex) {
          return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].z;
      }
      vec3 LGL_AM(int materialIndex) {
          return materials.extinction[materialIndex].rgb;
      }
      layout(location = 0) out vec4 out_position;
      layout(location = 1) out vec4 out_normal;
      layout(location = 2) out vec4 out_color;
      in vec3 vPosition;
      in vec3 vNormal;
      in vec2 vUv;
      flat in ivec2 vMaterialMeshIndex;
      vec3 LGL_BMs(vec3 pos) {
          vec3 fdx = dFdx(pos);
          vec3 fdy = dFdy(pos);
          return cross(fdx, fdy);
      }
      void main() {
          int materialIndex = vMaterialMeshIndex.x;
          int meshIndex = vMaterialMeshIndex.y;
          vec2 uv = fract(vUv);
          vec3 color = LGL_z(materialIndex, uv);
          float LGL_BH = LGL_p(materialIndex);
          vec3 normal = normalize(vNormal);
          vec3 LGL_BM = normalize(LGL_BMs(vPosition));
          normal *= sign(dot(normal, LGL_BM));
      #ifdef NUM_NORMAL_MAPS
          vec3 dp1 = dFdx(vPosition);
          vec3 dp2 = dFdy(vPosition);
          vec2 duv1 = dFdx(vUv);
          vec2 duv2 = dFdy(vUv);
          vec3 tangent, bitangent;
          normal = LGL_AA(materialIndex, uv, normal, dp1, dp2, duv1, duv2, tangent, bitangent);
      #endif
          out_position = vec4(vPosition, float(meshIndex) + EPS);
          out_normal = vec4(normal, LGL_BH);
          out_color = vec4(color, 0.);
      }`,
};

function setAttribute(gl, location, bufferAttribute) {
  if (location === undefined) {
    return;
  }

  const { itemSize, array } = bufferAttribute;

  gl.enableVertexAttribArray(location);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);

  if (array instanceof Float32Array) {
    gl.vertexAttribPointer(location, itemSize, gl.FLOAT, false, 0, 0);
  } else if (array instanceof Int32Array) {
    gl.vertexAttribIPointer(location, itemSize, gl.INT, 0, 0);
  } else {
    throw "Unsupported buffer type";
  }
}

function uploadAttributes(gl, renderPass, geometry) {
  setAttribute(
    gl,
    renderPass.attribLocs.aPosition,
    geometry.getAttribute("position")
  );
  setAttribute(
    gl,
    renderPass.attribLocs.aNormal,
    geometry.getAttribute("normal")
  );
  setAttribute(gl, renderPass.attribLocs.aUv, geometry.getAttribute("uv"));
  setAttribute(
    gl,
    renderPass.attribLocs.aMaterialMeshIndex,
    geometry.getAttribute("materialMeshIndex")
  );
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    geometry.getIndex().array,
    gl.STATIC_DRAW
  );
}

function makeGBufferPass(gl, { materialBuffer, mergedMesh }) {
  const renderPass = makeRenderPass(gl, {
    defines: materialBuffer.defines,
    vertex: ie,
    fragment: oe,
  });

  renderPass.setTexture("diffuseMap", materialBuffer.textures.diffuseMap);
  renderPass.setTexture("normalMap", materialBuffer.textures.normalMap);

  const geometry = mergedMesh.geometry;

  const elementCount = geometry.getIndex().count;

  const vao = gl.createVertexArray();

  gl.bindVertexArray(vao);
  uploadAttributes(gl, renderPass, geometry);
  gl.bindVertexArray(null);

  let jitterX = 0;
  let jitterY = 0;

  function setJitter(x, t) {
    jitterX = x;
    jitterY = t;
  }

  let currentCamera;

  function setCamera(camera) {
    currentCamera = camera;
  }

  function calcCamera() {
    projView.copy(currentCamera.projectionMatrix);

    projView.elements[8] += 2 * jitterX;
    projView.elements[9] += 2 * jitterY;

    projView.multiply(currentCamera.matrixWorldInverse);
  }

  let projView = new THREE.Matrix4();

  function draw() {
    calcCamera();
    renderPass.setUniform("projView", projView.elements);
    gl.bindVertexArray(vao);
    renderPass.useProgram();
    gl.enable(gl.DEPTH_TEST);
    gl.drawElements(gl.TRIANGLES, elementCount, gl.UNSIGNED_INT, 0);
    gl.disable(gl.DEPTH_TEST);
  }

  return {
    draw,
    outputLocs: renderPass.outputLocs,
    setCamera,
    setJitter,
  };
}

// var le = {
//   source:
//     "vec4 LGL_An(sampler2D map,vec2 uv){\n#ifdef OES_texture_float_linear\nreturn texture(map,uv);\n#else\nvec2 size=vec2(textureSize(map,0));vec2 texelSize=1.0/size;uv=uv*size-0.5;vec2 f=fract(uv);uv=floor(uv)+0.5;vec4 s1=texture(map,(uv+vec2(0,0))*texelSize);vec4 s2=texture(map,(uv+vec2(1,0))*texelSize);vec4 s3=texture(map,(uv+vec2(0,1))*texelSize);vec4 s4=texture(map,(uv+vec2(1,1))*texelSize);return mix(mix(s1,s2,f.x),mix(s3,s4,f.x),f.y);\n#endif\n}layout(location=0)out vec4 out_color;in vec2 vCoord;uniform sampler2D lightTex;uniform vec2 lightScale;uniform int toneMappingFun;vec3 linear(vec3 color){return color;}vec3 LGL_Av(vec3 color){return clamp(color/(vec3(1.0)+color),vec3(0.0),vec3(1.0));}vec3 LGL_Aw(vec3 color){color=max(vec3(0.0),color-0.004);return pow((color*(6.2*color+0.5))/(color*(6.2*color+1.7)+0.06),vec3(2.2));}vec3 LGL_Ax(vec3 color){return clamp((color*(2.51*color+0.03))/(color*(2.43*color+0.59)+0.14),vec3(0.0),vec3(1.0));}void main(){vec4 upscaledLight=texture(lightTex,lightScale*vCoord);vec3 light=upscaledLight.rgb/upscaledLight.a;if(toneMappingFun==0){light=linear(light);}if(toneMappingFun==1){light=LGL_Ax(light);}if(toneMappingFun==2){light=LGL_Av(light);}if(toneMappingFun==3){light=LGL_Aw(light);}light=pow(light,vec3(1.0/2.2));if(upscaledLight.a==0.){out_color=vec4(light,0.0);}else{out_color=vec4(light,1.0);}}",
// };

var le = {
  source: `vec4 LGL_An(sampler2D map, vec2 uv) {
        #ifdef OES_texture_float_linear
            return texture(map, uv);
        #else
            vec2 size = vec2(textureSize(map, 0));
            vec2 texelSize = 1.0 / size;
            uv = uv * size - 0.5;
            vec2 f = fract(uv);
            uv = floor(uv) + 0.5;
            vec4 s1 = texture(map, (uv + vec2(0, 0)) * texelSize);
            vec4 s2 = texture(map, (uv + vec2(1, 0)) * texelSize);
            vec4 s3 = texture(map, (uv + vec2(0, 1)) * texelSize);
            vec4 s4 = texture(map, (uv + vec2(1, 1)) * texelSize);
            return mix(mix(s1, s2, f.x), mix(s3, s4, f.x), f.y);
        #endif
        }
        layout(location = 0) out vec4 out_color;
        in vec2 vCoord;
        uniform sampler2D lightTex;
        uniform vec2 lightScale;
        uniform int toneMappingFun;
        vec3 linear(vec3 color) {
            return color;
        }
        vec3 LGL_Av(vec3 color) {
            return clamp(color / (vec3(1.0) + color), vec3(0.0), vec3(1.0));
        }
        vec3 LGL_Aw(vec3 color) {
            color = max(vec3(0.0), color - 0.004);
            return pow((color * (6.2 * color + 0.5)) / (color * (6.2 * color + 1.7) + 0.06), vec3(2.2));
        }
        vec3 LGL_Ax(vec3 color) {
            return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
        }
        void main() {
            vec4 upscaledLight = texture(lightTex, lightScale * vCoord);
            vec3 light = upscaledLight.rgb / upscaledLight.a;
            if(toneMappingFun == 0) {
                light = linear(light);
            }
            if(toneMappingFun == 1) {
                light = LGL_Ax(light);
            }
            if(toneMappingFun == 2) {
                light = LGL_Av(light);
            }
            if(toneMappingFun == 3) {
                light = LGL_Aw(light);
            }
            light = pow(light, vec3(1.0 / 2.2));
            if(upscaledLight.a == 0.) {
                out_color = vec4(light, 0.0);
            } else {
                out_color = vec4(light, 1.0);
            }
        }`,
};

const toneMapFunctions = {
  [THREE.LinearToneMapping]: 0,
  [THREE.ACESFilmicToneMapping]: 1,
  [THREE.ReinhardToneMapping]: 2,
  [THREE.CineonToneMapping]: 3,
};

function makeToneMapPass(gl, params) {
  const { fullscreenQuad, toneMapping } = params;

  let frameBuffer;

  const renderPassConfig = {
    gl,
    vertex: fullscreenQuad.vertexShader,
    fragment: le,
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

// var ce = {
//   source:
//     "layout(location=0)out vec4 out_color;uniform sampler2D inputBuffer;uniform vec2 resolution;in vec2 vCoord;\n#define FXAA_PC 1\n#define FXAA_GLSL_100 1\n#define FXAA_QUALITY_PRESET 12\n#define FXAA_GREEN_AS_LUMA 1\n#ifndef FXAA_PC_CONSOLE\n#define FXAA_PC_CONSOLE 0\n#endif\n#ifndef FXAA_GLSL_120\n#define FXAA_GLSL_120 0\n#endif\n#ifndef FXAA_GLSL_130\n#define FXAA_GLSL_130 0\n#endif\n#ifndef FXAA_HLSL_3\n#define FXAA_HLSL_3 0\n#endif\n#ifndef FXAA_HLSL_4\n#define FXAA_HLSL_4 0\n#endif\n#ifndef FXAA_HLSL_5\n#define FXAA_HLSL_5 0\n#endif\n#ifndef FXAA_GREEN_AS_LUMA\n#define FXAA_GREEN_AS_LUMA 0\n#endif\n#ifndef FXAA_EARLY_EXIT\n#define FXAA_EARLY_EXIT 1\n#endif\n#ifndef FXAA_DISCARD\n#define FXAA_DISCARD 0\n#endif\n#ifndef FXAA_FAST_PIXEL_OFFSET\n#ifdef GL_EXT_gpu_shader4\n#define FXAA_FAST_PIXEL_OFFSET 1\n#endif\n#ifdef GL_NV_gpu_shader5\n#define FXAA_FAST_PIXEL_OFFSET 1\n#endif\n#ifdef GL_ARB_gpu_shader5\n#define FXAA_FAST_PIXEL_OFFSET 1\n#endif\n#ifndef FXAA_FAST_PIXEL_OFFSET\n#define FXAA_FAST_PIXEL_OFFSET 0\n#endif\n#endif\n#ifndef FXAA_GATHER4_ALPHA\n#if (FXAA_HLSL_5 == 1)\n#define FXAA_GATHER4_ALPHA 1\n#endif\n#ifdef GL_ARB_gpu_shader5\n#define FXAA_GATHER4_ALPHA 1\n#endif\n#ifdef GL_NV_gpu_shader5\n#define FXAA_GATHER4_ALPHA 1\n#endif\n#ifndef FXAA_GATHER4_ALPHA\n#define FXAA_GATHER4_ALPHA 0\n#endif\n#endif\n/*============================================================================FXAA QUALITY-TUNING KNOBS------------------------------------------------------------------------------NOTE the other tuning knobs are now in the shader function inputs!============================================================================*/\n#ifndef FXAA_QUALITY_PRESET\n#define FXAA_QUALITY_PRESET 12\n#endif\n/*============================================================================FXAA QUALITY-PRESETS============================================================================*//*============================================================================FXAA QUALITY-MEDIUM DITHER PRESETS============================================================================*/\n#if (FXAA_QUALITY_PRESET == 10)\n#define FXAA_QUALITY_PS 3\n#define FXAA_QUALITY_P0 1.5\n#define FXAA_QUALITY_P1 3.0\n#define FXAA_QUALITY_P2 12.0\n#endif\n#if (FXAA_QUALITY_PRESET == 11)\n#define FXAA_QUALITY_PS 4\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 3.0\n#define FXAA_QUALITY_P3 12.0\n#endif\n#if (FXAA_QUALITY_PRESET == 12)\n#define FXAA_QUALITY_PS 5\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 4.0\n#define FXAA_QUALITY_P4 12.0\n#endif\n#if (FXAA_QUALITY_PRESET == 13)\n#define FXAA_QUALITY_PS 6\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 2.0\n#define FXAA_QUALITY_P4 4.0\n#define FXAA_QUALITY_P5 12.0\n#endif\n#if (FXAA_QUALITY_PRESET == 14)\n#define FXAA_QUALITY_PS 7\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 2.0\n#define FXAA_QUALITY_P4 2.0\n#define FXAA_QUALITY_P5 4.0\n#define FXAA_QUALITY_P6 12.0\n#endif\n#if (FXAA_QUALITY_PRESET == 15)\n#define FXAA_QUALITY_PS 8\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 2.0\n#define FXAA_QUALITY_P4 2.0\n#define FXAA_QUALITY_P5 2.0\n#define FXAA_QUALITY_P6 4.0\n#define FXAA_QUALITY_P7 12.0\n#endif\n/*============================================================================FXAA QUALITY-LOW DITHER PRESETS============================================================================*/\n#if (FXAA_QUALITY_PRESET == 20)\n#define FXAA_QUALITY_PS 3\n#define FXAA_QUALITY_P0 1.5\n#define FXAA_QUALITY_P1 2.0\n#define FXAA_QUALITY_P2 8.0\n#endif\n#if (FXAA_QUALITY_PRESET == 21)\n#define FXAA_QUALITY_PS 4\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 8.0\n#endif\n#if (FXAA_QUALITY_PRESET == 22)\n#define FXAA_QUALITY_PS 5\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 2.0\n#define FXAA_QUALITY_P4 8.0\n#endif\n#if (FXAA_QUALITY_PRESET == 23)\n#define FXAA_QUALITY_PS 6\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 2.0\n#define FXAA_QUALITY_P4 2.0\n#define FXAA_QUALITY_P5 8.0\n#endif\n#if (FXAA_QUALITY_PRESET == 24)\n#define FXAA_QUALITY_PS 7\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 2.0\n#define FXAA_QUALITY_P4 2.0\n#define FXAA_QUALITY_P5 3.0\n#define FXAA_QUALITY_P6 8.0\n#endif\n#if (FXAA_QUALITY_PRESET == 25)\n#define FXAA_QUALITY_PS 8\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 2.0\n#define FXAA_QUALITY_P4 2.0\n#define FXAA_QUALITY_P5 2.0\n#define FXAA_QUALITY_P6 4.0\n#define FXAA_QUALITY_P7 8.0\n#endif\n#if (FXAA_QUALITY_PRESET == 26)\n#define FXAA_QUALITY_PS 9\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 2.0\n#define FXAA_QUALITY_P4 2.0\n#define FXAA_QUALITY_P5 2.0\n#define FXAA_QUALITY_P6 2.0\n#define FXAA_QUALITY_P7 4.0\n#define FXAA_QUALITY_P8 8.0\n#endif\n#if (FXAA_QUALITY_PRESET == 27)\n#define FXAA_QUALITY_PS 10\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 2.0\n#define FXAA_QUALITY_P4 2.0\n#define FXAA_QUALITY_P5 2.0\n#define FXAA_QUALITY_P6 2.0\n#define FXAA_QUALITY_P7 2.0\n#define FXAA_QUALITY_P8 4.0\n#define FXAA_QUALITY_P9 8.0\n#endif\n#if (FXAA_QUALITY_PRESET == 28)\n#define FXAA_QUALITY_PS 11\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 2.0\n#define FXAA_QUALITY_P4 2.0\n#define FXAA_QUALITY_P5 2.0\n#define FXAA_QUALITY_P6 2.0\n#define FXAA_QUALITY_P7 2.0\n#define FXAA_QUALITY_P8 2.0\n#define FXAA_QUALITY_P9 4.0\n#define FXAA_QUALITY_P10 8.0\n#endif\n#if (FXAA_QUALITY_PRESET == 29)\n#define FXAA_QUALITY_PS 12\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.5\n#define FXAA_QUALITY_P2 2.0\n#define FXAA_QUALITY_P3 2.0\n#define FXAA_QUALITY_P4 2.0\n#define FXAA_QUALITY_P5 2.0\n#define FXAA_QUALITY_P6 2.0\n#define FXAA_QUALITY_P7 2.0\n#define FXAA_QUALITY_P8 2.0\n#define FXAA_QUALITY_P9 2.0\n#define FXAA_QUALITY_P10 4.0\n#define FXAA_QUALITY_P11 8.0\n#endif\n/*============================================================================FXAA QUALITY-EXTREME QUALITY============================================================================*/\n#if (FXAA_QUALITY_PRESET == 39)\n#define FXAA_QUALITY_PS 12\n#define FXAA_QUALITY_P0 1.0\n#define FXAA_QUALITY_P1 1.0\n#define FXAA_QUALITY_P2 1.0\n#define FXAA_QUALITY_P3 1.0\n#define FXAA_QUALITY_P4 1.0\n#define FXAA_QUALITY_P5 1.5\n#define FXAA_QUALITY_P6 2.0\n#define FXAA_QUALITY_P7 2.0\n#define FXAA_QUALITY_P8 2.0\n#define FXAA_QUALITY_P9 2.0\n#define FXAA_QUALITY_P10 4.0\n#define FXAA_QUALITY_P11 8.0\n#endif\n/*============================================================================API PORTING============================================================================*/\n#if (FXAA_GLSL_100 == 1) || (FXAA_GLSL_120 == 1) || (FXAA_GLSL_130 == 1)\n#define FxaaBool bool\n#define FxaaDiscard discard\n#define FxaaFloat float\n#define FxaaFloat2 vec2\n#define FxaaFloat3 vec3\n#define FxaaFloat4 vec4\n#define FxaaHalf float\n#define FxaaHalf2 vec2\n#define FxaaHalf3 vec3\n#define FxaaHalf4 vec4\n#define FxaaInt2 ivec2\n#define FxaaSat(x) clamp(x, 0.0, 1.0)\n#define FxaaTex sampler2D\n#else\n#define FxaaBool bool\n#define FxaaDiscard clip(-1)\n#define FxaaFloat float\n#define FxaaFloat2 float2\n#define FxaaFloat3 float3\n#define FxaaFloat4 float4\n#define FxaaHalf half\n#define FxaaHalf2 half2\n#define FxaaHalf3 half3\n#define FxaaHalf4 half4\n#define FxaaSat(x) saturate(x)\n#endif\n#if (FXAA_GLSL_100 == 1)\n#define FxaaTexTop(t, p) texture(t, p, 0.0)\n#define FxaaTexOff(t, p, o, r) texture(t, p + (o * r), 0.0)\n#endif\n#if (FXAA_GLSL_120 == 1)\n#define FxaaTexTop(t, p) textureLod(t, p, 0.0)\n#if (FXAA_FAST_PIXEL_OFFSET == 1)\n#define FxaaTexOff(t, p, o, r) textureLodOffset(t, p, 0.0, o)\n#else\n#define FxaaTexOff(t, p, o, r) textureLod(t, p + (o * r), 0.0)\n#endif\n#if (FXAA_GATHER4_ALPHA == 1)\n#define FxaaTexAlpha4(t, p) textureGather(t, p, 3)\n#define FxaaTexOffAlpha4(t, p, o) textureGatherOffset(t, p, o, 3)\n#define FxaaTexGreen4(t, p) textureGather(t, p, 1)\n#define FxaaTexOffGreen4(t, p, o) textureGatherOffset(t, p, o, 1)\n#endif\n#endif\n#if (FXAA_GLSL_130 == 1)\n#define FxaaTexTop(t, p) textureLod(t, p, 0.0)\n#define FxaaTexOff(t, p, o, r) textureLodOffset(t, p, 0.0, o)\n#if (FXAA_GATHER4_ALPHA == 1)\n#define FxaaTexAlpha4(t, p) textureGather(t, p, 3)\n#define FxaaTexOffAlpha4(t, p, o) textureGatherOffset(t, p, o, 3)\n#define FxaaTexGreen4(t, p) textureGather(t, p, 1)\n#define FxaaTexOffGreen4(t, p, o) textureGatherOffset(t, p, o, 1)\n#endif\n#endif\n#if (FXAA_HLSL_3 == 1)\n#define FxaaInt2 float2\n#define FxaaTex sampler2D\n#define FxaaTexTop(t, p) tex2Dlod(t, float4(p, 0.0, 0.0))\n#define FxaaTexOff(t, p, o, r) tex2Dlod(t, float4(p + (o * r), 0, 0))\n#endif\n#if (FXAA_HLSL_4 == 1)\n#define FxaaInt2 int2\nstruct FxaaTex{SamplerState smpl;texture tex;};\n#define FxaaTexTop(t, p) t.tex.SampleLevel(t.smpl, p, 0.0)\n#define FxaaTexOff(t, p, o, r) t.tex.SampleLevel(t.smpl, p, 0.0, o)\n#endif\n#if (FXAA_HLSL_5 == 1)\n#define FxaaInt2 int2\nstruct FxaaTex{SamplerState smpl;texture tex;};\n#define FxaaTexTop(t, p) t.tex.SampleLevel(t.smpl, p, 0.0)\n#define FxaaTexOff(t, p, o, r) t.tex.SampleLevel(t.smpl, p, 0.0, o)\n#define FxaaTexAlpha4(t, p) t.tex.GatherAlpha(t.smpl, p)\n#define FxaaTexOffAlpha4(t, p, o) t.tex.GatherAlpha(t.smpl, p, o)\n#define FxaaTexGreen4(t, p) t.tex.GatherGreen(t.smpl, p)\n#define FxaaTexOffGreen4(t, p, o) t.tex.GatherGreen(t.smpl, p, o)\n#endif\n/*============================================================================GREEN AS LUMA OPTION SUPPORT FUNCTION============================================================================*/\n#if (FXAA_GREEN_AS_LUMA == 0)\nFxaaFloat FxaaLuma(FxaaFloat4 rgba){return rgba.w;}\n#else\nFxaaFloat FxaaLuma(FxaaFloat4 rgba){return rgba.y;}\n#endif\n/*============================================================================FXAA3 QUALITY-PC============================================================================*/\n#if (FXAA_PC == 1)\nFxaaFloat4 FxaaPixelShader(FxaaFloat2 pos,FxaaFloat4 fxaaConsolePosPos,FxaaTex tex,FxaaTex fxaaConsole360TexExpBiasNegOne,FxaaTex fxaaConsole360TexExpBiasNegTwo,FxaaFloat2 fxaaQualityRcpFrame,FxaaFloat4 fxaaConsoleRcpFrameOpt,FxaaFloat4 fxaaConsoleRcpFrameOpt2,FxaaFloat4 fxaaConsole360RcpFrameOpt2,FxaaFloat fxaaQualitySubpix,FxaaFloat fxaaQualityEdgeThreshold,FxaaFloat fxaaQualityEdgeThresholdMin,FxaaFloat fxaaConsoleEdgeSharpness,FxaaFloat fxaaConsoleEdgeThreshold,FxaaFloat fxaaConsoleEdgeThresholdMin,FxaaFloat4 fxaaConsole360ConstDir){FxaaFloat2 posM;posM.x=pos.x;posM.y=pos.y;\n#if (FXAA_GATHER4_ALPHA == 1)\n#if (FXAA_DISCARD == 0)\nFxaaFloat4 rgbyM=FxaaTexTop(tex,posM);\n#if (FXAA_GREEN_AS_LUMA == 0)\n#define lumaM rgbyM.w\n#else\n#define lumaM rgbyM.y\n#endif\n#endif\n#if (FXAA_GREEN_AS_LUMA == 0)\nFxaaFloat4 luma4A=FxaaTexAlpha4(tex,posM);FxaaFloat4 luma4B=FxaaTexOffAlpha4(tex,posM,FxaaInt2(-1,-1));\n#else\nFxaaFloat4 luma4A=FxaaTexGreen4(tex,posM);FxaaFloat4 luma4B=FxaaTexOffGreen4(tex,posM,FxaaInt2(-1,-1));\n#endif\n#if (FXAA_DISCARD == 1)\n#define lumaM luma4A.w\n#endif\n#define lumaE luma4A.z\n#define lumaS luma4A.x\n#define lumaSE luma4A.y\n#define lumaNW luma4B.w\n#define lumaN luma4B.z\n#define lumaW luma4B.x\n#else\nFxaaFloat4 rgbyM=FxaaTexTop(tex,posM);\n#if (FXAA_GREEN_AS_LUMA == 0)\n#define lumaM rgbyM.w\n#else\n#define lumaM rgbyM.y\n#endif\n#if (FXAA_GLSL_100 == 1)\nFxaaFloat lumaS=FxaaLuma(FxaaTexOff(tex,posM,FxaaFloat2(0.0,1.0),fxaaQualityRcpFrame.xy));FxaaFloat lumaE=FxaaLuma(FxaaTexOff(tex,posM,FxaaFloat2(1.0,0.0),fxaaQualityRcpFrame.xy));FxaaFloat lumaN=FxaaLuma(FxaaTexOff(tex,posM,FxaaFloat2(0.0,-1.0),fxaaQualityRcpFrame.xy));FxaaFloat lumaW=FxaaLuma(FxaaTexOff(tex,posM,FxaaFloat2(-1.0,0.0),fxaaQualityRcpFrame.xy));\n#else\nFxaaFloat lumaS=FxaaLuma(FxaaTexOff(tex,posM,FxaaInt2(0,1),fxaaQualityRcpFrame.xy));FxaaFloat lumaE=FxaaLuma(FxaaTexOff(tex,posM,FxaaInt2(1,0),fxaaQualityRcpFrame.xy));FxaaFloat lumaN=FxaaLuma(FxaaTexOff(tex,posM,FxaaInt2(0,-1),fxaaQualityRcpFrame.xy));FxaaFloat lumaW=FxaaLuma(FxaaTexOff(tex,posM,FxaaInt2(-1,0),fxaaQualityRcpFrame.xy));\n#endif\n#endif\nFxaaFloat maxSM=max(lumaS,lumaM);FxaaFloat minSM=min(lumaS,lumaM);FxaaFloat maxESM=max(lumaE,maxSM);FxaaFloat minESM=min(lumaE,minSM);FxaaFloat maxWN=max(lumaN,lumaW);FxaaFloat minWN=min(lumaN,lumaW);FxaaFloat rangeMax=max(maxWN,maxESM);FxaaFloat rangeMin=min(minWN,minESM);FxaaFloat rangeMaxScaled=rangeMax*fxaaQualityEdgeThreshold;FxaaFloat range=rangeMax-rangeMin;FxaaFloat rangeMaxClamped=max(fxaaQualityEdgeThresholdMin,rangeMaxScaled);FxaaBool earlyExit=range<rangeMaxClamped;if(earlyExit)\n#if (FXAA_DISCARD == 1)\nFxaaDiscard;\n#else\nreturn rgbyM;\n#endif\n#if (FXAA_GATHER4_ALPHA == 0)\n#if (FXAA_GLSL_100 == 1)\nFxaaFloat lumaNW=FxaaLuma(FxaaTexOff(tex,posM,FxaaFloat2(-1.0,-1.0),fxaaQualityRcpFrame.xy));FxaaFloat lumaSE=FxaaLuma(FxaaTexOff(tex,posM,FxaaFloat2(1.0,1.0),fxaaQualityRcpFrame.xy));FxaaFloat lumaNE=FxaaLuma(FxaaTexOff(tex,posM,FxaaFloat2(1.0,-1.0),fxaaQualityRcpFrame.xy));FxaaFloat lumaSW=FxaaLuma(FxaaTexOff(tex,posM,FxaaFloat2(-1.0,1.0),fxaaQualityRcpFrame.xy));\n#else\nFxaaFloat lumaNW=FxaaLuma(FxaaTexOff(tex,posM,FxaaInt2(-1,-1),fxaaQualityRcpFrame.xy));FxaaFloat lumaSE=FxaaLuma(FxaaTexOff(tex,posM,FxaaInt2(1,1),fxaaQualityRcpFrame.xy));FxaaFloat lumaNE=FxaaLuma(FxaaTexOff(tex,posM,FxaaInt2(1,-1),fxaaQualityRcpFrame.xy));FxaaFloat lumaSW=FxaaLuma(FxaaTexOff(tex,posM,FxaaInt2(-1,1),fxaaQualityRcpFrame.xy));\n#endif\n#else\nFxaaFloat lumaNE=FxaaLuma(FxaaTexOff(tex,posM,FxaaInt2(1,-1),fxaaQualityRcpFrame.xy));FxaaFloat lumaSW=FxaaLuma(FxaaTexOff(tex,posM,FxaaInt2(-1,1),fxaaQualityRcpFrame.xy));\n#endif\nFxaaFloat lumaNS=lumaN+lumaS;FxaaFloat lumaWE=lumaW+lumaE;FxaaFloat subpixRcpRange=1.0/range;FxaaFloat subpixNSWE=lumaNS+lumaWE;FxaaFloat edgeHorz1=(-2.0*lumaM)+lumaNS;FxaaFloat edgeVert1=(-2.0*lumaM)+lumaWE;FxaaFloat lumaNESE=lumaNE+lumaSE;FxaaFloat lumaNWNE=lumaNW+lumaNE;FxaaFloat edgeHorz2=(-2.0*lumaE)+lumaNESE;FxaaFloat edgeVert2=(-2.0*lumaN)+lumaNWNE;FxaaFloat lumaNWSW=lumaNW+lumaSW;FxaaFloat lumaSWSE=lumaSW+lumaSE;FxaaFloat edgeHorz4=(abs(edgeHorz1)*2.0)+abs(edgeHorz2);FxaaFloat edgeVert4=(abs(edgeVert1)*2.0)+abs(edgeVert2);FxaaFloat edgeHorz3=(-2.0*lumaW)+lumaNWSW;FxaaFloat edgeVert3=(-2.0*lumaS)+lumaSWSE;FxaaFloat edgeHorz=abs(edgeHorz3)+edgeHorz4;FxaaFloat edgeVert=abs(edgeVert3)+edgeVert4;FxaaFloat subpixNWSWNESE=lumaNWSW+lumaNESE;FxaaFloat lengthSign=fxaaQualityRcpFrame.x;FxaaBool horzSpan=edgeHorz>=edgeVert;FxaaFloat subpixA=subpixNSWE*2.0+subpixNWSWNESE;if(!horzSpan)lumaN=lumaW;if(!horzSpan)lumaS=lumaE;if(horzSpan)lengthSign=fxaaQualityRcpFrame.y;FxaaFloat subpixB=(subpixA*(1.0/12.0))-lumaM;FxaaFloat gradientN=lumaN-lumaM;FxaaFloat gradientS=lumaS-lumaM;FxaaFloat lumaNN=lumaN+lumaM;FxaaFloat lumaSS=lumaS+lumaM;FxaaBool pairN=abs(gradientN)>=abs(gradientS);FxaaFloat gradient=max(abs(gradientN),abs(gradientS));if(pairN)lengthSign=-lengthSign;FxaaFloat subpixC=FxaaSat(abs(subpixB)*subpixRcpRange);FxaaFloat2 posB;posB.x=posM.x;posB.y=posM.y;FxaaFloat2 offNP;offNP.x=(!horzSpan)? 0.0 : fxaaQualityRcpFrame.x;offNP.y=(horzSpan)? 0.0 : fxaaQualityRcpFrame.y;if(!horzSpan)posB.x+=lengthSign*0.5;if(horzSpan)posB.y+=lengthSign*0.5;FxaaFloat2 posN;posN.x=posB.x-offNP.x*FXAA_QUALITY_P0;posN.y=posB.y-offNP.y*FXAA_QUALITY_P0;FxaaFloat2 posP;posP.x=posB.x+offNP.x*FXAA_QUALITY_P0;posP.y=posB.y+offNP.y*FXAA_QUALITY_P0;FxaaFloat subpixD=((-2.0)*subpixC)+3.0;FxaaFloat lumaEndN=FxaaLuma(FxaaTexTop(tex,posN));FxaaFloat subpixE=subpixC*subpixC;FxaaFloat lumaEndP=FxaaLuma(FxaaTexTop(tex,posP));if(!pairN)lumaNN=lumaSS;FxaaFloat gradientScaled=gradient*1.0/4.0;FxaaFloat lumaMM=lumaM-lumaNN*0.5;FxaaFloat subpixF=subpixD*subpixE;FxaaBool lumaMLTZero=lumaMM<0.0;lumaEndN-=lumaNN*0.5;lumaEndP-=lumaNN*0.5;FxaaBool doneN=abs(lumaEndN)>=gradientScaled;FxaaBool doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P1;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P1;FxaaBool doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P1;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P1;if(doneNP){if(!doneN)lumaEndN=FxaaLuma(FxaaTexTop(tex,posN.xy));if(!doneP)lumaEndP=FxaaLuma(FxaaTexTop(tex,posP.xy));if(!doneN)lumaEndN=lumaEndN-lumaNN*0.5;if(!doneP)lumaEndP=lumaEndP-lumaNN*0.5;doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P2;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P2;doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P2;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P2;\n#if (FXAA_QUALITY_PS > 3)\nif(doneNP){if(!doneN)lumaEndN=FxaaLuma(FxaaTexTop(tex,posN.xy));if(!doneP)lumaEndP=FxaaLuma(FxaaTexTop(tex,posP.xy));if(!doneN)lumaEndN=lumaEndN-lumaNN*0.5;if(!doneP)lumaEndP=lumaEndP-lumaNN*0.5;doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P3;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P3;doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P3;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P3;\n#if (FXAA_QUALITY_PS > 4)\nif(doneNP){if(!doneN)lumaEndN=FxaaLuma(FxaaTexTop(tex,posN.xy));if(!doneP)lumaEndP=FxaaLuma(FxaaTexTop(tex,posP.xy));if(!doneN)lumaEndN=lumaEndN-lumaNN*0.5;if(!doneP)lumaEndP=lumaEndP-lumaNN*0.5;doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P4;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P4;doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P4;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P4;\n#if (FXAA_QUALITY_PS > 5)\nif(doneNP){if(!doneN)lumaEndN=FxaaLuma(FxaaTexTop(tex,posN.xy));if(!doneP)lumaEndP=FxaaLuma(FxaaTexTop(tex,posP.xy));if(!doneN)lumaEndN=lumaEndN-lumaNN*0.5;if(!doneP)lumaEndP=lumaEndP-lumaNN*0.5;doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P5;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P5;doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P5;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P5;\n#if (FXAA_QUALITY_PS > 6)\nif(doneNP){if(!doneN)lumaEndN=FxaaLuma(FxaaTexTop(tex,posN.xy));if(!doneP)lumaEndP=FxaaLuma(FxaaTexTop(tex,posP.xy));if(!doneN)lumaEndN=lumaEndN-lumaNN*0.5;if(!doneP)lumaEndP=lumaEndP-lumaNN*0.5;doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P6;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P6;doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P6;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P6;\n#if (FXAA_QUALITY_PS > 7)\nif(doneNP){if(!doneN)lumaEndN=FxaaLuma(FxaaTexTop(tex,posN.xy));if(!doneP)lumaEndP=FxaaLuma(FxaaTexTop(tex,posP.xy));if(!doneN)lumaEndN=lumaEndN-lumaNN*0.5;if(!doneP)lumaEndP=lumaEndP-lumaNN*0.5;doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P7;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P7;doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P7;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P7;\n#if (FXAA_QUALITY_PS > 8)\nif(doneNP){if(!doneN)lumaEndN=FxaaLuma(FxaaTexTop(tex,posN.xy));if(!doneP)lumaEndP=FxaaLuma(FxaaTexTop(tex,posP.xy));if(!doneN)lumaEndN=lumaEndN-lumaNN*0.5;if(!doneP)lumaEndP=lumaEndP-lumaNN*0.5;doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P8;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P8;doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P8;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P8;\n#if (FXAA_QUALITY_PS > 9)\nif(doneNP){if(!doneN)lumaEndN=FxaaLuma(FxaaTexTop(tex,posN.xy));if(!doneP)lumaEndP=FxaaLuma(FxaaTexTop(tex,posP.xy));if(!doneN)lumaEndN=lumaEndN-lumaNN*0.5;if(!doneP)lumaEndP=lumaEndP-lumaNN*0.5;doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P9;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P9;doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P9;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P9;\n#if (FXAA_QUALITY_PS > 10)\nif(doneNP){if(!doneN)lumaEndN=FxaaLuma(FxaaTexTop(tex,posN.xy));if(!doneP)lumaEndP=FxaaLuma(FxaaTexTop(tex,posP.xy));if(!doneN)lumaEndN=lumaEndN-lumaNN*0.5;if(!doneP)lumaEndP=lumaEndP-lumaNN*0.5;doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P10;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P10;doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P10;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P10;\n#if (FXAA_QUALITY_PS > 11)\nif(doneNP){if(!doneN)lumaEndN=FxaaLuma(FxaaTexTop(tex,posN.xy));if(!doneP)lumaEndP=FxaaLuma(FxaaTexTop(tex,posP.xy));if(!doneN)lumaEndN=lumaEndN-lumaNN*0.5;if(!doneP)lumaEndP=lumaEndP-lumaNN*0.5;doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P11;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P11;doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P11;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P11;\n#if (FXAA_QUALITY_PS > 12)\nif(doneNP){if(!doneN)lumaEndN=FxaaLuma(FxaaTexTop(tex,posN.xy));if(!doneP)lumaEndP=FxaaLuma(FxaaTexTop(tex,posP.xy));if(!doneN)lumaEndN=lumaEndN-lumaNN*0.5;if(!doneP)lumaEndP=lumaEndP-lumaNN*0.5;doneN=abs(lumaEndN)>=gradientScaled;doneP=abs(lumaEndP)>=gradientScaled;if(!doneN)posN.x-=offNP.x*FXAA_QUALITY_P12;if(!doneN)posN.y-=offNP.y*FXAA_QUALITY_P12;doneNP=(!doneN)||(!doneP);if(!doneP)posP.x+=offNP.x*FXAA_QUALITY_P12;if(!doneP)posP.y+=offNP.y*FXAA_QUALITY_P12;}\n#endif\n}\n#endif\n}\n#endif\n}\n#endif\n}\n#endif\n}\n#endif\n}\n#endif\n}\n#endif\n}\n#endif\n}\n#endif\n}FxaaFloat dstN=posM.x-posN.x;FxaaFloat dstP=posP.x-posM.x;if(!horzSpan)dstN=posM.y-posN.y;if(!horzSpan)dstP=posP.y-posM.y;FxaaBool goodSpanN=(lumaEndN<0.0)!=lumaMLTZero;FxaaFloat spanLength=(dstP+dstN);FxaaBool goodSpanP=(lumaEndP<0.0)!=lumaMLTZero;FxaaFloat spanLengthRcp=1.0/spanLength;FxaaBool directionN=dstN<dstP;FxaaFloat dst=min(dstN,dstP);FxaaBool goodSpan=directionN ? goodSpanN : goodSpanP;FxaaFloat subpixG=subpixF*subpixF;FxaaFloat pixelOffset=(dst*(-spanLengthRcp))+0.5;FxaaFloat subpixH=subpixG*fxaaQualitySubpix;FxaaFloat pixelOffsetGood=goodSpan ? pixelOffset : 0.0;FxaaFloat pixelOffsetSubpix=max(pixelOffsetGood,subpixH);if(!horzSpan)posM.x+=pixelOffsetSubpix*lengthSign;if(horzSpan)posM.y+=pixelOffsetSubpix*lengthSign;\n#if (FXAA_DISCARD == 1)\nreturn FxaaTexTop(tex,posM);\n#else\nreturn FxaaFloat4(FxaaTexTop(tex,posM).xyz,lumaM);\n#endif\n}\n#endif\nvoid main(){out_color=FxaaPixelShader(vCoord,vec4(0.0),inputBuffer,inputBuffer,inputBuffer,resolution,vec4(0.0),vec4(0.0),vec4(0.0),0.75,0.166,0.0833,0.0,0.0,0.0,vec4(0.0));out_color.a=texture(inputBuffer,vCoord).a;}",
// };
var ce = {
  source: `layout(location = 0) out vec4 out_color;
      uniform sampler2D inputBuffer;
      uniform vec2 resolution;
      in vec2 vCoord;
      #define FXAA_PC 1
      #define FXAA_GLSL_100 1
      #define FXAA_QUALITY_PRESET 12
      #define FXAA_GREEN_AS_LUMA 1
      #ifndef FXAA_PC_CONSOLE
      #define FXAA_PC_CONSOLE 0
      #endif
      #ifndef FXAA_GLSL_120
      #define FXAA_GLSL_120 0
      #endif
      #ifndef FXAA_GLSL_130
      #define FXAA_GLSL_130 0
      #endif
      #ifndef FXAA_HLSL_3
      #define FXAA_HLSL_3 0
      #endif
      #ifndef FXAA_HLSL_4
      #define FXAA_HLSL_4 0
      #endif
      #ifndef FXAA_HLSL_5
      #define FXAA_HLSL_5 0
      #endif
      #ifndef FXAA_GREEN_AS_LUMA
      #define FXAA_GREEN_AS_LUMA 0
      #endif
      #ifndef FXAA_EARLY_EXIT
      #define FXAA_EARLY_EXIT 1
      #endif
      #ifndef FXAA_DISCARD
      #define FXAA_DISCARD 0
      #endif
      #ifndef FXAA_FAST_PIXEL_OFFSET
      #ifdef GL_EXT_gpu_shader4
      #define FXAA_FAST_PIXEL_OFFSET 1
      #endif
      #ifdef GL_NV_gpu_shader5
      #define FXAA_FAST_PIXEL_OFFSET 1
      #endif
      #ifdef GL_ARB_gpu_shader5
      #define FXAA_FAST_PIXEL_OFFSET 1
      #endif
      #ifndef FXAA_FAST_PIXEL_OFFSET
      #define FXAA_FAST_PIXEL_OFFSET 0
      #endif
      #endif
      #ifndef FXAA_GATHER4_ALPHA
      #if (FXAA_HLSL_5 == 1)
      #define FXAA_GATHER4_ALPHA 1
      #endif
      #ifdef GL_ARB_gpu_shader5
      #define FXAA_GATHER4_ALPHA 1
      #endif
      #ifdef GL_NV_gpu_shader5
      #define FXAA_GATHER4_ALPHA 1
      #endif
      #ifndef FXAA_GATHER4_ALPHA
      #define FXAA_GATHER4_ALPHA 0
      #endif
      #endif
      /*============================================================================FXAA QUALITY-TUNING KNOBS------------------------------------------------------------------------------NOTE the other tuning knobs are now in the shader function inputs!============================================================================*/
      #ifndef FXAA_QUALITY_PRESET
      #define FXAA_QUALITY_PRESET 12
      #endif
      /*============================================================================FXAA QUALITY-PRESETS============================================================================*//*============================================================================FXAA QUALITY-MEDIUM DITHER PRESETS============================================================================*/
      #if (FXAA_QUALITY_PRESET == 10)
      #define FXAA_QUALITY_PS 3
      #define FXAA_QUALITY_P0 1.5
      #define FXAA_QUALITY_P1 3.0
      #define FXAA_QUALITY_P2 12.0
      #endif
      #if (FXAA_QUALITY_PRESET == 11)
      #define FXAA_QUALITY_PS 4
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 3.0
      #define FXAA_QUALITY_P3 12.0
      #endif
      #if (FXAA_QUALITY_PRESET == 12)
      #define FXAA_QUALITY_PS 5
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 4.0
      #define FXAA_QUALITY_P4 12.0
      #endif
      #if (FXAA_QUALITY_PRESET == 13)
      #define FXAA_QUALITY_PS 6
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 2.0
      #define FXAA_QUALITY_P4 4.0
      #define FXAA_QUALITY_P5 12.0
      #endif
      #if (FXAA_QUALITY_PRESET == 14)
      #define FXAA_QUALITY_PS 7
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 2.0
      #define FXAA_QUALITY_P4 2.0
      #define FXAA_QUALITY_P5 4.0
      #define FXAA_QUALITY_P6 12.0
      #endif
      #if (FXAA_QUALITY_PRESET == 15)
      #define FXAA_QUALITY_PS 8
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 2.0
      #define FXAA_QUALITY_P4 2.0
      #define FXAA_QUALITY_P5 2.0
      #define FXAA_QUALITY_P6 4.0
      #define FXAA_QUALITY_P7 12.0
      #endif
      /*============================================================================FXAA QUALITY-LOW DITHER PRESETS============================================================================*/
      #if (FXAA_QUALITY_PRESET == 20)
      #define FXAA_QUALITY_PS 3
      #define FXAA_QUALITY_P0 1.5
      #define FXAA_QUALITY_P1 2.0
      #define FXAA_QUALITY_P2 8.0
      #endif
      #if (FXAA_QUALITY_PRESET == 21)
      #define FXAA_QUALITY_PS 4
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 8.0
      #endif
      #if (FXAA_QUALITY_PRESET == 22)
      #define FXAA_QUALITY_PS 5
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 2.0
      #define FXAA_QUALITY_P4 8.0
      #endif
      #if (FXAA_QUALITY_PRESET == 23)
      #define FXAA_QUALITY_PS 6
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 2.0
      #define FXAA_QUALITY_P4 2.0
      #define FXAA_QUALITY_P5 8.0
      #endif
      #if (FXAA_QUALITY_PRESET == 24)
      #define FXAA_QUALITY_PS 7
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 2.0
      #define FXAA_QUALITY_P4 2.0
      #define FXAA_QUALITY_P5 3.0
      #define FXAA_QUALITY_P6 8.0
      #endif
      #if (FXAA_QUALITY_PRESET == 25)
      #define FXAA_QUALITY_PS 8
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 2.0
      #define FXAA_QUALITY_P4 2.0
      #define FXAA_QUALITY_P5 2.0
      #define FXAA_QUALITY_P6 4.0
      #define FXAA_QUALITY_P7 8.0
      #endif
      #if (FXAA_QUALITY_PRESET == 26)
      #define FXAA_QUALITY_PS 9
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 2.0
      #define FXAA_QUALITY_P4 2.0
      #define FXAA_QUALITY_P5 2.0
      #define FXAA_QUALITY_P6 2.0
      #define FXAA_QUALITY_P7 4.0
      #define FXAA_QUALITY_P8 8.0
      #endif
      #if (FXAA_QUALITY_PRESET == 27)
      #define FXAA_QUALITY_PS 10
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 2.0
      #define FXAA_QUALITY_P4 2.0
      #define FXAA_QUALITY_P5 2.0
      #define FXAA_QUALITY_P6 2.0
      #define FXAA_QUALITY_P7 2.0
      #define FXAA_QUALITY_P8 4.0
      #define FXAA_QUALITY_P9 8.0
      #endif
      #if (FXAA_QUALITY_PRESET == 28)
      #define FXAA_QUALITY_PS 11
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 2.0
      #define FXAA_QUALITY_P4 2.0
      #define FXAA_QUALITY_P5 2.0
      #define FXAA_QUALITY_P6 2.0
      #define FXAA_QUALITY_P7 2.0
      #define FXAA_QUALITY_P8 2.0
      #define FXAA_QUALITY_P9 4.0
      #define FXAA_QUALITY_P10 8.0
      #endif
      #if (FXAA_QUALITY_PRESET == 29)
      #define FXAA_QUALITY_PS 12
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.5
      #define FXAA_QUALITY_P2 2.0
      #define FXAA_QUALITY_P3 2.0
      #define FXAA_QUALITY_P4 2.0
      #define FXAA_QUALITY_P5 2.0
      #define FXAA_QUALITY_P6 2.0
      #define FXAA_QUALITY_P7 2.0
      #define FXAA_QUALITY_P8 2.0
      #define FXAA_QUALITY_P9 2.0
      #define FXAA_QUALITY_P10 4.0
      #define FXAA_QUALITY_P11 8.0
      #endif
      /*============================================================================FXAA QUALITY-EXTREME QUALITY============================================================================*/
      #if (FXAA_QUALITY_PRESET == 39)
      #define FXAA_QUALITY_PS 12
      #define FXAA_QUALITY_P0 1.0
      #define FXAA_QUALITY_P1 1.0
      #define FXAA_QUALITY_P2 1.0
      #define FXAA_QUALITY_P3 1.0
      #define FXAA_QUALITY_P4 1.0
      #define FXAA_QUALITY_P5 1.5
      #define FXAA_QUALITY_P6 2.0
      #define FXAA_QUALITY_P7 2.0
      #define FXAA_QUALITY_P8 2.0
      #define FXAA_QUALITY_P9 2.0
      #define FXAA_QUALITY_P10 4.0
      #define FXAA_QUALITY_P11 8.0
      #endif
      /*============================================================================API PORTING============================================================================*/
      #if (FXAA_GLSL_100 == 1) || (FXAA_GLSL_120 == 1) || (FXAA_GLSL_130 == 1)
      #define FxaaBool bool
      #define FxaaDiscard discard
      #define FxaaFloat float
      #define FxaaFloat2 vec2
      #define FxaaFloat3 vec3
      #define FxaaFloat4 vec4
      #define FxaaHalf float
      #define FxaaHalf2 vec2
      #define FxaaHalf3 vec3
      #define FxaaHalf4 vec4
      #define FxaaInt2 ivec2
      #define FxaaSat(x) clamp(x, 0.0, 1.0)
      #define FxaaTex sampler2D
      #else
      #define FxaaBool bool
      #define FxaaDiscard clip(-1)
      #define FxaaFloat float
      #define FxaaFloat2 float2
      #define FxaaFloat3 float3
      #define FxaaFloat4 float4
      #define FxaaHalf half
      #define FxaaHalf2 half2
      #define FxaaHalf3 half3
      #define FxaaHalf4 half4
      #define FxaaSat(x) saturate(x)
      #endif
      #if (FXAA_GLSL_100 == 1)
      #define FxaaTexTop(t, p) texture(t, p, 0.0)
      #define FxaaTexOff(t, p, o, r) texture(t, p + (o * r), 0.0)
      #endif
      #if (FXAA_GLSL_120 == 1)
      #define FxaaTexTop(t, p) textureLod(t, p, 0.0)
      #if (FXAA_FAST_PIXEL_OFFSET == 1)
      #define FxaaTexOff(t, p, o, r) textureLodOffset(t, p, 0.0, o)
      #else
      #define FxaaTexOff(t, p, o, r) textureLod(t, p + (o * r), 0.0)
      #endif
      #if (FXAA_GATHER4_ALPHA == 1)
      #define FxaaTexAlpha4(t, p) textureGather(t, p, 3)
      #define FxaaTexOffAlpha4(t, p, o) textureGatherOffset(t, p, o, 3)
      #define FxaaTexGreen4(t, p) textureGather(t, p, 1)
      #define FxaaTexOffGreen4(t, p, o) textureGatherOffset(t, p, o, 1)
      #endif
      #endif
      #if (FXAA_GLSL_130 == 1)
      #define FxaaTexTop(t, p) textureLod(t, p, 0.0)
      #define FxaaTexOff(t, p, o, r) textureLodOffset(t, p, 0.0, o)
      #if (FXAA_GATHER4_ALPHA == 1)
      #define FxaaTexAlpha4(t, p) textureGather(t, p, 3)
      #define FxaaTexOffAlpha4(t, p, o) textureGatherOffset(t, p, o, 3)
      #define FxaaTexGreen4(t, p) textureGather(t, p, 1)
      #define FxaaTexOffGreen4(t, p, o) textureGatherOffset(t, p, o, 1)
      #endif
      #endif
      #if (FXAA_HLSL_3 == 1)
      #define FxaaInt2 float2
      #define FxaaTex sampler2D
      #define FxaaTexTop(t, p) tex2Dlod(t, float4(p, 0.0, 0.0))
      #define FxaaTexOff(t, p, o, r) tex2Dlod(t, float4(p + (o * r), 0, 0))
      #endif
      #if (FXAA_HLSL_4 == 1)
      #define FxaaInt2 int2
      struct FxaaTex {
          SamplerState smpl;
          texture tex;
      };
      #define FxaaTexTop(t, p) t.tex.SampleLevel(t.smpl, p, 0.0)
      #define FxaaTexOff(t, p, o, r) t.tex.SampleLevel(t.smpl, p, 0.0, o)
      #endif
      #if (FXAA_HLSL_5 == 1)
      #define FxaaInt2 int2
      struct FxaaTex {
          SamplerState smpl;
          texture tex;
      };
      #define FxaaTexTop(t, p) t.tex.SampleLevel(t.smpl, p, 0.0)
      #define FxaaTexOff(t, p, o, r) t.tex.SampleLevel(t.smpl, p, 0.0, o)
      #define FxaaTexAlpha4(t, p) t.tex.GatherAlpha(t.smpl, p)
      #define FxaaTexOffAlpha4(t, p, o) t.tex.GatherAlpha(t.smpl, p, o)
      #define FxaaTexGreen4(t, p) t.tex.GatherGreen(t.smpl, p)
      #define FxaaTexOffGreen4(t, p, o) t.tex.GatherGreen(t.smpl, p, o)
      #endif
      /*============================================================================GREEN AS LUMA OPTION SUPPORT FUNCTION============================================================================*/
      #if (FXAA_GREEN_AS_LUMA == 0)
      FxaaFloat FxaaLuma(FxaaFloat4 rgba) {
          return rgba.w;
      }
      #else
      FxaaFloat FxaaLuma(FxaaFloat4 rgba) {
          return rgba.y;
      }
      #endif
      /*============================================================================FXAA3 QUALITY-PC============================================================================*/
      #if (FXAA_PC == 1)
      FxaaFloat4 FxaaPixelShader(FxaaFloat2 pos, FxaaFloat4 fxaaConsolePosPos, FxaaTex tex, FxaaTex fxaaConsole360TexExpBiasNegOne, FxaaTex fxaaConsole360TexExpBiasNegTwo, FxaaFloat2 fxaaQualityRcpFrame, FxaaFloat4 fxaaConsoleRcpFrameOpt, FxaaFloat4 fxaaConsoleRcpFrameOpt2, FxaaFloat4 fxaaConsole360RcpFrameOpt2, FxaaFloat fxaaQualitySubpix, FxaaFloat fxaaQualityEdgeThreshold, FxaaFloat fxaaQualityEdgeThresholdMin, FxaaFloat fxaaConsoleEdgeSharpness, FxaaFloat fxaaConsoleEdgeThreshold, FxaaFloat fxaaConsoleEdgeThresholdMin, FxaaFloat4 fxaaConsole360ConstDir) {
          FxaaFloat2 posM;
          posM.x = pos.x;
          posM.y = pos.y;
      #if (FXAA_GATHER4_ALPHA == 1)
      #if (FXAA_DISCARD == 0)
          FxaaFloat4 rgbyM = FxaaTexTop(tex, posM);
      #if (FXAA_GREEN_AS_LUMA == 0)
      #define lumaM rgbyM.w
      #else
      #define lumaM rgbyM.y
      #endif
      #endif
      #if (FXAA_GREEN_AS_LUMA == 0)
          FxaaFloat4 luma4A = FxaaTexAlpha4(tex, posM);
          FxaaFloat4 luma4B = FxaaTexOffAlpha4(tex, posM, FxaaInt2(-1, -1));
      #else
          FxaaFloat4 luma4A = FxaaTexGreen4(tex, posM);
          FxaaFloat4 luma4B = FxaaTexOffGreen4(tex, posM, FxaaInt2(-1, -1));
      #endif
      #if (FXAA_DISCARD == 1)
      #define lumaM luma4A.w
      #endif
      #define lumaE luma4A.z
      #define lumaS luma4A.x
      #define lumaSE luma4A.y
      #define lumaNW luma4B.w
      #define lumaN luma4B.z
      #define lumaW luma4B.x
      #else
          FxaaFloat4 rgbyM = FxaaTexTop(tex, posM);
      #if (FXAA_GREEN_AS_LUMA == 0)
      #define lumaM rgbyM.w
      #else
      #define lumaM rgbyM.y
      #endif
      #if (FXAA_GLSL_100 == 1)
          FxaaFloat lumaS = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(0.0, 1.0), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaE = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(1.0, 0.0), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaN = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(0.0, -1.0), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaW = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(-1.0, 0.0), fxaaQualityRcpFrame.xy));
      #else
          FxaaFloat lumaS = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(0, 1), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(1, 0), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaN = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(0, -1), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1, 0), fxaaQualityRcpFrame.xy));
      #endif
      #endif
          FxaaFloat maxSM = max(lumaS, lumaM);
          FxaaFloat minSM = min(lumaS, lumaM);
          FxaaFloat maxESM = max(lumaE, maxSM);
          FxaaFloat minESM = min(lumaE, minSM);
          FxaaFloat maxWN = max(lumaN, lumaW);
          FxaaFloat minWN = min(lumaN, lumaW);
          FxaaFloat rangeMax = max(maxWN, maxESM);
          FxaaFloat rangeMin = min(minWN, minESM);
          FxaaFloat rangeMaxScaled = rangeMax * fxaaQualityEdgeThreshold;
          FxaaFloat range = rangeMax - rangeMin;
          FxaaFloat rangeMaxClamped = max(fxaaQualityEdgeThresholdMin, rangeMaxScaled);
          FxaaBool earlyExit = range < rangeMaxClamped;
          if(earlyExit)
      #if (FXAA_DISCARD == 1)
              FxaaDiscard;
      #else
          return rgbyM;
      #endif
      #if (FXAA_GATHER4_ALPHA == 0)
      #if (FXAA_GLSL_100 == 1)
          FxaaFloat lumaNW = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(-1.0, -1.0), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaSE = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(1.0, 1.0), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaNE = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(1.0, -1.0), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaSW = FxaaLuma(FxaaTexOff(tex, posM, FxaaFloat2(-1.0, 1.0), fxaaQualityRcpFrame.xy));
      #else
          FxaaFloat lumaNW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1, -1), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaSE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(1, 1), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaNE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(1, -1), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaSW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1, 1), fxaaQualityRcpFrame.xy));
      #endif
      #else
          FxaaFloat lumaNE = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(1, -1), fxaaQualityRcpFrame.xy));
          FxaaFloat lumaSW = FxaaLuma(FxaaTexOff(tex, posM, FxaaInt2(-1, 1), fxaaQualityRcpFrame.xy));
      #endif
          FxaaFloat lumaNS = lumaN + lumaS;
          FxaaFloat lumaWE = lumaW + lumaE;
          FxaaFloat subpixRcpRange = 1.0 / range;
          FxaaFloat subpixNSWE = lumaNS + lumaWE;
          FxaaFloat edgeHorz1 = (-2.0 * lumaM) + lumaNS;
          FxaaFloat edgeVert1 = (-2.0 * lumaM) + lumaWE;
          FxaaFloat lumaNESE = lumaNE + lumaSE;
          FxaaFloat lumaNWNE = lumaNW + lumaNE;
          FxaaFloat edgeHorz2 = (-2.0 * lumaE) + lumaNESE;
          FxaaFloat edgeVert2 = (-2.0 * lumaN) + lumaNWNE;
          FxaaFloat lumaNWSW = lumaNW + lumaSW;
          FxaaFloat lumaSWSE = lumaSW + lumaSE;
          FxaaFloat edgeHorz4 = (abs(edgeHorz1) * 2.0) + abs(edgeHorz2);
          FxaaFloat edgeVert4 = (abs(edgeVert1) * 2.0) + abs(edgeVert2);
          FxaaFloat edgeHorz3 = (-2.0 * lumaW) + lumaNWSW;
          FxaaFloat edgeVert3 = (-2.0 * lumaS) + lumaSWSE;
          FxaaFloat edgeHorz = abs(edgeHorz3) + edgeHorz4;
          FxaaFloat edgeVert = abs(edgeVert3) + edgeVert4;
          FxaaFloat subpixNWSWNESE = lumaNWSW + lumaNESE;
          FxaaFloat lengthSign = fxaaQualityRcpFrame.x;
          FxaaBool horzSpan = edgeHorz >= edgeVert;
          FxaaFloat subpixA = subpixNSWE * 2.0 + subpixNWSWNESE;
          if(!horzSpan)
              lumaN = lumaW;
          if(!horzSpan)
              lumaS = lumaE;
          if(horzSpan)
              lengthSign = fxaaQualityRcpFrame.y;
          FxaaFloat subpixB = (subpixA * (1.0 / 12.0)) - lumaM;
          FxaaFloat gradientN = lumaN - lumaM;
          FxaaFloat gradientS = lumaS - lumaM;
          FxaaFloat lumaNN = lumaN + lumaM;
          FxaaFloat lumaSS = lumaS + lumaM;
          FxaaBool pairN = abs(gradientN) >= abs(gradientS);
          FxaaFloat gradient = max(abs(gradientN), abs(gradientS));
          if(pairN)
              lengthSign = -lengthSign;
          FxaaFloat subpixC = FxaaSat(abs(subpixB) * subpixRcpRange);
          FxaaFloat2 posB;
          posB.x = posM.x;
          posB.y = posM.y;
          FxaaFloat2 offNP;
          offNP.x = (!horzSpan) ? 0.0 : fxaaQualityRcpFrame.x;
          offNP.y = (horzSpan) ? 0.0 : fxaaQualityRcpFrame.y;
          if(!horzSpan)
              posB.x += lengthSign * 0.5;
          if(horzSpan)
              posB.y += lengthSign * 0.5;
          FxaaFloat2 posN;
          posN.x = posB.x - offNP.x * FXAA_QUALITY_P0;
          posN.y = posB.y - offNP.y * FXAA_QUALITY_P0;
          FxaaFloat2 posP;
          posP.x = posB.x + offNP.x * FXAA_QUALITY_P0;
          posP.y = posB.y + offNP.y * FXAA_QUALITY_P0;
          FxaaFloat subpixD = ((-2.0) * subpixC) + 3.0;
          FxaaFloat lumaEndN = FxaaLuma(FxaaTexTop(tex, posN));
          FxaaFloat subpixE = subpixC * subpixC;
          FxaaFloat lumaEndP = FxaaLuma(FxaaTexTop(tex, posP));
          if(!pairN)
              lumaNN = lumaSS;
          FxaaFloat gradientScaled = gradient * 1.0 / 4.0;
          FxaaFloat lumaMM = lumaM - lumaNN * 0.5;
          FxaaFloat subpixF = subpixD * subpixE;
          FxaaBool lumaMLTZero = lumaMM < 0.0;
          lumaEndN -= lumaNN * 0.5;
          lumaEndP -= lumaNN * 0.5;
          FxaaBool doneN = abs(lumaEndN) >= gradientScaled;
          FxaaBool doneP = abs(lumaEndP) >= gradientScaled;
          if(!doneN)
              posN.x -= offNP.x * FXAA_QUALITY_P1;
          if(!doneN)
              posN.y -= offNP.y * FXAA_QUALITY_P1;
          FxaaBool doneNP = (!doneN) || (!doneP);
          if(!doneP)
              posP.x += offNP.x * FXAA_QUALITY_P1;
          if(!doneP)
              posP.y += offNP.y * FXAA_QUALITY_P1;
          if(doneNP) {
              if(!doneN)
                  lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
              if(!doneP)
                  lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
              if(!doneN)
                  lumaEndN = lumaEndN - lumaNN * 0.5;
              if(!doneP)
                  lumaEndP = lumaEndP - lumaNN * 0.5;
              doneN = abs(lumaEndN) >= gradientScaled;
              doneP = abs(lumaEndP) >= gradientScaled;
              if(!doneN)
                  posN.x -= offNP.x * FXAA_QUALITY_P2;
              if(!doneN)
                  posN.y -= offNP.y * FXAA_QUALITY_P2;
              doneNP = (!doneN) || (!doneP);
              if(!doneP)
                  posP.x += offNP.x * FXAA_QUALITY_P2;
              if(!doneP)
                  posP.y += offNP.y * FXAA_QUALITY_P2;
      #if (FXAA_QUALITY_PS > 3)
              if(doneNP) {
                  if(!doneN)
                      lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                  if(!doneP)
                      lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                  if(!doneN)
                      lumaEndN = lumaEndN - lumaNN * 0.5;
                  if(!doneP)
                      lumaEndP = lumaEndP - lumaNN * 0.5;
                  doneN = abs(lumaEndN) >= gradientScaled;
                  doneP = abs(lumaEndP) >= gradientScaled;
                  if(!doneN)
                      posN.x -= offNP.x * FXAA_QUALITY_P3;
                  if(!doneN)
                      posN.y -= offNP.y * FXAA_QUALITY_P3;
                  doneNP = (!doneN) || (!doneP);
                  if(!doneP)
                      posP.x += offNP.x * FXAA_QUALITY_P3;
                  if(!doneP)
                      posP.y += offNP.y * FXAA_QUALITY_P3;
      #if (FXAA_QUALITY_PS > 4)
                  if(doneNP) {
                      if(!doneN)
                          lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                      if(!doneP)
                          lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                      if(!doneN)
                          lumaEndN = lumaEndN - lumaNN * 0.5;
                      if(!doneP)
                          lumaEndP = lumaEndP - lumaNN * 0.5;
                      doneN = abs(lumaEndN) >= gradientScaled;
                      doneP = abs(lumaEndP) >= gradientScaled;
                      if(!doneN)
                          posN.x -= offNP.x * FXAA_QUALITY_P4;
                      if(!doneN)
                          posN.y -= offNP.y * FXAA_QUALITY_P4;
                      doneNP = (!doneN) || (!doneP);
                      if(!doneP)
                          posP.x += offNP.x * FXAA_QUALITY_P4;
                      if(!doneP)
                          posP.y += offNP.y * FXAA_QUALITY_P4;
      #if (FXAA_QUALITY_PS > 5)
                      if(doneNP) {
                          if(!doneN)
                              lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                          if(!doneP)
                              lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                          if(!doneN)
                              lumaEndN = lumaEndN - lumaNN * 0.5;
                          if(!doneP)
                              lumaEndP = lumaEndP - lumaNN * 0.5;
                          doneN = abs(lumaEndN) >= gradientScaled;
                          doneP = abs(lumaEndP) >= gradientScaled;
                          if(!doneN)
                              posN.x -= offNP.x * FXAA_QUALITY_P5;
                          if(!doneN)
                              posN.y -= offNP.y * FXAA_QUALITY_P5;
                          doneNP = (!doneN) || (!doneP);
                          if(!doneP)
                              posP.x += offNP.x * FXAA_QUALITY_P5;
                          if(!doneP)
                              posP.y += offNP.y * FXAA_QUALITY_P5;
      #if (FXAA_QUALITY_PS > 6)
                          if(doneNP) {
                              if(!doneN)
                                  lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                              if(!doneP)
                                  lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                              if(!doneN)
                                  lumaEndN = lumaEndN - lumaNN * 0.5;
                              if(!doneP)
                                  lumaEndP = lumaEndP - lumaNN * 0.5;
                              doneN = abs(lumaEndN) >= gradientScaled;
                              doneP = abs(lumaEndP) >= gradientScaled;
                              if(!doneN)
                                  posN.x -= offNP.x * FXAA_QUALITY_P6;
                              if(!doneN)
                                  posN.y -= offNP.y * FXAA_QUALITY_P6;
                              doneNP = (!doneN) || (!doneP);
                              if(!doneP)
                                  posP.x += offNP.x * FXAA_QUALITY_P6;
                              if(!doneP)
                                  posP.y += offNP.y * FXAA_QUALITY_P6;
      #if (FXAA_QUALITY_PS > 7)
                              if(doneNP) {
                                  if(!doneN)
                                      lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                                  if(!doneP)
                                      lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                                  if(!doneN)
                                      lumaEndN = lumaEndN - lumaNN * 0.5;
                                  if(!doneP)
                                      lumaEndP = lumaEndP - lumaNN * 0.5;
                                  doneN = abs(lumaEndN) >= gradientScaled;
                                  doneP = abs(lumaEndP) >= gradientScaled;
                                  if(!doneN)
                                      posN.x -= offNP.x * FXAA_QUALITY_P7;
                                  if(!doneN)
                                      posN.y -= offNP.y * FXAA_QUALITY_P7;
                                  doneNP = (!doneN) || (!doneP);
                                  if(!doneP)
                                      posP.x += offNP.x * FXAA_QUALITY_P7;
                                  if(!doneP)
                                      posP.y += offNP.y * FXAA_QUALITY_P7;
      #if (FXAA_QUALITY_PS > 8)
                                  if(doneNP) {
                                      if(!doneN)
                                          lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                                      if(!doneP)
                                          lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                                      if(!doneN)
                                          lumaEndN = lumaEndN - lumaNN * 0.5;
                                      if(!doneP)
                                          lumaEndP = lumaEndP - lumaNN * 0.5;
                                      doneN = abs(lumaEndN) >= gradientScaled;
                                      doneP = abs(lumaEndP) >= gradientScaled;
                                      if(!doneN)
                                          posN.x -= offNP.x * FXAA_QUALITY_P8;
                                      if(!doneN)
                                          posN.y -= offNP.y * FXAA_QUALITY_P8;
                                      doneNP = (!doneN) || (!doneP);
                                      if(!doneP)
                                          posP.x += offNP.x * FXAA_QUALITY_P8;
                                      if(!doneP)
                                          posP.y += offNP.y * FXAA_QUALITY_P8;
      #if (FXAA_QUALITY_PS > 9)
                                      if(doneNP) {
                                          if(!doneN)
                                              lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                                          if(!doneP)
                                              lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                                          if(!doneN)
                                              lumaEndN = lumaEndN - lumaNN * 0.5;
                                          if(!doneP)
                                              lumaEndP = lumaEndP - lumaNN * 0.5;
                                          doneN = abs(lumaEndN) >= gradientScaled;
                                          doneP = abs(lumaEndP) >= gradientScaled;
                                          if(!doneN)
                                              posN.x -= offNP.x * FXAA_QUALITY_P9;
                                          if(!doneN)
                                              posN.y -= offNP.y * FXAA_QUALITY_P9;
                                          doneNP = (!doneN) || (!doneP);
                                          if(!doneP)
                                              posP.x += offNP.x * FXAA_QUALITY_P9;
                                          if(!doneP)
                                              posP.y += offNP.y * FXAA_QUALITY_P9;
      #if (FXAA_QUALITY_PS > 10)
                                          if(doneNP) {
                                              if(!doneN)
                                                  lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                                              if(!doneP)
                                                  lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                                              if(!doneN)
                                                  lumaEndN = lumaEndN - lumaNN * 0.5;
                                              if(!doneP)
                                                  lumaEndP = lumaEndP - lumaNN * 0.5;
                                              doneN = abs(lumaEndN) >= gradientScaled;
                                              doneP = abs(lumaEndP) >= gradientScaled;
                                              if(!doneN)
                                                  posN.x -= offNP.x * FXAA_QUALITY_P10;
                                              if(!doneN)
                                                  posN.y -= offNP.y * FXAA_QUALITY_P10;
                                              doneNP = (!doneN) || (!doneP);
                                              if(!doneP)
                                                  posP.x += offNP.x * FXAA_QUALITY_P10;
                                              if(!doneP)
                                                  posP.y += offNP.y * FXAA_QUALITY_P10;
      #if (FXAA_QUALITY_PS > 11)
                                              if(doneNP) {
                                                  if(!doneN)
                                                      lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                                                  if(!doneP)
                                                      lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                                                  if(!doneN)
                                                      lumaEndN = lumaEndN - lumaNN * 0.5;
                                                  if(!doneP)
                                                      lumaEndP = lumaEndP - lumaNN * 0.5;
                                                  doneN = abs(lumaEndN) >= gradientScaled;
                                                  doneP = abs(lumaEndP) >= gradientScaled;
                                                  if(!doneN)
                                                      posN.x -= offNP.x * FXAA_QUALITY_P11;
                                                  if(!doneN)
                                                      posN.y -= offNP.y * FXAA_QUALITY_P11;
                                                  doneNP = (!doneN) || (!doneP);
                                                  if(!doneP)
                                                      posP.x += offNP.x * FXAA_QUALITY_P11;
                                                  if(!doneP)
                                                      posP.y += offNP.y * FXAA_QUALITY_P11;
      #if (FXAA_QUALITY_PS > 12)
                                                  if(doneNP) {
                                                      if(!doneN)
                                                          lumaEndN = FxaaLuma(FxaaTexTop(tex, posN.xy));
                                                      if(!doneP)
                                                          lumaEndP = FxaaLuma(FxaaTexTop(tex, posP.xy));
                                                      if(!doneN)
                                                          lumaEndN = lumaEndN - lumaNN * 0.5;
                                                      if(!doneP)
                                                          lumaEndP = lumaEndP - lumaNN * 0.5;
                                                      doneN = abs(lumaEndN) >= gradientScaled;
                                                      doneP = abs(lumaEndP) >= gradientScaled;
                                                      if(!doneN)
                                                          posN.x -= offNP.x * FXAA_QUALITY_P12;
                                                      if(!doneN)
                                                          posN.y -= offNP.y * FXAA_QUALITY_P12;
                                                      doneNP = (!doneN) || (!doneP);
                                                      if(!doneP)
                                                          posP.x += offNP.x * FXAA_QUALITY_P12;
                                                      if(!doneP)
                                                          posP.y += offNP.y * FXAA_QUALITY_P12;
                                                  }
      #endif
                                              }
      #endif
                                          }
      #endif
                                      }
      #endif
                                  }
      #endif
                              }
      #endif
                          }
      #endif
                      }
      #endif
                  }
      #endif
              }
      #endif
          }
          FxaaFloat dstN = posM.x - posN.x;
          FxaaFloat dstP = posP.x - posM.x;
          if(!horzSpan)
              dstN = posM.y - posN.y;
          if(!horzSpan)
              dstP = posP.y - posM.y;
          FxaaBool goodSpanN = (lumaEndN < 0.0) != lumaMLTZero;
          FxaaFloat spanLength = (dstP + dstN);
          FxaaBool goodSpanP = (lumaEndP < 0.0) != lumaMLTZero;
          FxaaFloat spanLengthRcp = 1.0 / spanLength;
          FxaaBool directionN = dstN < dstP;
          FxaaFloat dst = min(dstN, dstP);
          FxaaBool goodSpan = directionN ? goodSpanN : goodSpanP;
          FxaaFloat subpixG = subpixF * subpixF;
          FxaaFloat pixelOffset = (dst * (-spanLengthRcp)) + 0.5;
          FxaaFloat subpixH = subpixG * fxaaQualitySubpix;
          FxaaFloat pixelOffsetGood = goodSpan ? pixelOffset : 0.0;
          FxaaFloat pixelOffsetSubpix = max(pixelOffsetGood, subpixH);
          if(!horzSpan)
              posM.x += pixelOffsetSubpix * lengthSign;
          if(horzSpan)
              posM.y += pixelOffsetSubpix * lengthSign;
      #if (FXAA_DISCARD == 1)
          return FxaaTexTop(tex, posM);
      #else
          return FxaaFloat4(FxaaTexTop(tex, posM).xyz, lumaM);
      #endif
      }
      #endif
      void main() {
          out_color = FxaaPixelShader(vCoord, vec4(0.0), inputBuffer, inputBuffer, inputBuffer, resolution, vec4(0.0), vec4(0.0), vec4(0.0), 0.75, 0.166, 0.0833, 0.0, 0.0, 0.0, vec4(0.0));
          out_color.a = texture(inputBuffer, vCoord).a;
      }`,
};

// var ue = {
//   source:
//     "vec4 LGL_An(sampler2D map,vec2 uv){\n#ifdef OES_texture_float_linear\nreturn texture(map,uv);\n#else\nvec2 size=vec2(textureSize(map,0));vec2 texelSize=1.0/size;uv=uv*size-0.5;vec2 f=fract(uv);uv=floor(uv)+0.5;vec4 s1=texture(map,(uv+vec2(0,0))*texelSize);vec4 s2=texture(map,(uv+vec2(1,0))*texelSize);vec4 s3=texture(map,(uv+vec2(0,1))*texelSize);vec4 s4=texture(map,(uv+vec2(1,1))*texelSize);return mix(mix(s1,s2,f.x),mix(s3,s4,f.x),f.y);\n#endif\n}layout(location=0)out vec4 out_light;layout(location=1)out vec4 out_momentLengthVariance;in vec2 vCoord;uniform mediump sampler2D lightTex;uniform mediump sampler2D positionTex;uniform mediump sampler2D colorTex;uniform mediump sampler2D previousLightTex;uniform mediump sampler2D previousPositionTex;uniform mediump sampler2D previousColorTex;uniform mediump sampler2D previousMomentLengthVarianceTex;uniform mat4 historyCamera;uniform float colorBlendFactor;uniform float momentBlendFactor;uniform float demodulateAlbedo;vec2 LGL_As(vec3 position){vec4 historyCoord=historyCamera*vec4(position,1.0);return 0.5*historyCoord.xy/historyCoord.w+0.5;}float LGL_At(sampler2D meshIdTex,vec2 vCoord){return floor(texture(meshIdTex,vCoord).w);}float LGL_Au(float histMeshId,float currentMeshId,ivec2 coord,ivec2 size){if(histMeshId!=currentMeshId){return 0.0;}if(any(greaterThanEqual(coord,size))){return 0.0;}return 1.0;}void main(){vec3 currentPosition=LGL_An(positionTex,vCoord).xyz;float currentMeshId=LGL_At(positionTex,vCoord);vec4 accumulatedLight=texture(lightTex,vCoord);vec3 currentLight=accumulatedLight.rgb/accumulatedLight.a;vec2 hCoord=LGL_As(currentPosition);vec2 hSizef=vec2(textureSize(previousLightTex,0));vec2 hSizeInv=1.0/hSizef;ivec2 hSize=ivec2(hSizef);vec2 hTexelf=hCoord*hSizef-0.5;ivec2 hTexel=ivec2(hTexelf);vec2 f=fract(hTexelf);ivec2 texel[]=ivec2[](hTexel+ivec2(0,0),hTexel+ivec2(1,0),hTexel+ivec2(0,1),hTexel+ivec2(1,1));float weights[]=float[]((1.0-f.x)*(1.0-f.y),f.x*(1.0-f.y),(1.0-f.x)*f.y,f.x*f.y);vec4 historyLight=vec4(0.);;vec2 historyMoment=vec2(0.);float historyLength=0.;float sum=0.;float luminance=0.2126*currentLight.x+0.7152*currentLight.y+0.0722*currentLight.z;float N=texelFetch(previousMomentLengthVarianceTex,hTexel,0).b;if(N>0.0&&currentMeshId>0.0){for(int i=0;i<4;i++){vec2 gCoord=(vec2(texel[i])+0.5)*hSizeInv;float histMeshId=LGL_At(previousPositionTex,gCoord);float isValid=LGL_Au(histMeshId,currentMeshId,texel[i],hSize);float weight=isValid*weights[i];historyLight+=weight*texelFetch(previousLightTex,texel[i],0);historyMoment+=weight*texelFetch(previousMomentLengthVarianceTex,texel[i],0).rg;sum+=weight;}if(sum>0.0){historyLight/=sum;historyMoment/=sum;}else{hTexel=ivec2(hTexelf+0.5);for(int x=-1;x<=1;x++){for(int y=-1;y<=1;y++){ivec2 texel=hTexel+ivec2(x,y);vec2 gCoord=(vec2(texel)+0.5)*hSizeInv;float histMeshId=LGL_At(previousPositionTex,gCoord);float isValid=LGL_Au(histMeshId,currentMeshId,texel,hSize);float weight=isValid;historyLight+=weight*texelFetch(previousLightTex,texel,0);historyMoment+=weight*texelFetch(previousMomentLengthVarianceTex,texel,0).rg;sum+=weight;}}historyLight=sum>0.0 ? historyLight/sum : historyLight;historyMoment=sum>0.0 ? historyMoment/sum : historyMoment;}if(sum>0.0){historyLength=N+1.;float color_alpha_min=colorBlendFactor;float moment_alpha_min=momentBlendFactor;float color_alpha=max(1.0/historyLength,color_alpha_min);float moment_alpha=max(1.0/historyLength,moment_alpha_min);out_light=color_alpha*accumulatedLight+historyLight*(1.-color_alpha);float first_moment=moment_alpha*historyMoment.x+(1.0-moment_alpha)*luminance;float second_moment=moment_alpha*historyMoment.y+(1.0-moment_alpha)*luminance*luminance;float variance=second_moment-first_moment*first_moment;out_momentLengthVariance=vec4(first_moment,second_moment,historyLength,variance);return;}}out_light=accumulatedLight;out_momentLengthVariance=vec4(luminance,luminance*luminance,1.,100.);}",
// };

var ue = {
  source: `vec4 LGL_An(sampler2D map, vec2 uv) {
      #ifdef OES_texture_float_linear
          return texture(map, uv);
      #else
          vec2 size = vec2(textureSize(map, 0));
          vec2 texelSize = 1.0 / size;
          uv = uv * size - 0.5;
          vec2 f = fract(uv);
          uv = floor(uv) + 0.5;
          vec4 s1 = texture(map, (uv + vec2(0, 0)) * texelSize);
          vec4 s2 = texture(map, (uv + vec2(1, 0)) * texelSize);
          vec4 s3 = texture(map, (uv + vec2(0, 1)) * texelSize);
          vec4 s4 = texture(map, (uv + vec2(1, 1)) * texelSize);
          return mix(mix(s1, s2, f.x), mix(s3, s4, f.x), f.y);
      #endif
      }
      layout(location = 0) out vec4 out_light;
      layout(location = 1) out vec4 out_momentLengthVariance;
      in vec2 vCoord;
      uniform mediump sampler2D lightTex;
      uniform mediump sampler2D positionTex;
      uniform mediump sampler2D colorTex;
      uniform mediump sampler2D previousLightTex;
      uniform mediump sampler2D previousPositionTex;
      uniform mediump sampler2D previousColorTex;
      uniform mediump sampler2D previousMomentLengthVarianceTex;
      uniform mat4 historyCamera;
      uniform float colorBlendFactor;
      uniform float momentBlendFactor;
      uniform float demodulateAlbedo;
      vec2 LGL_As(vec3 position) {
          vec4 historyCoord = historyCamera * vec4(position, 1.0);
          return 0.5 * historyCoord.xy / historyCoord.w + 0.5;
      }
      float LGL_At(sampler2D meshIdTex, vec2 vCoord) {
          return floor(texture(meshIdTex, vCoord).w);
      }
      float LGL_Au(float histMeshId, float currentMeshId, ivec2 coord, ivec2 size) {
          if(histMeshId != currentMeshId) {
              return 0.0;
          }
          if(any(greaterThanEqual(coord, size))) {
              return 0.0;
          }
          return 1.0;
      }
      void main() {
          vec3 currentPosition = LGL_An(positionTex, vCoord).xyz;
          float currentMeshId = LGL_At(positionTex, vCoord);
          vec4 accumulatedLight = texture(lightTex, vCoord);
          vec3 currentLight = accumulatedLight.rgb / accumulatedLight.a;
          vec2 hCoord = LGL_As(currentPosition);
          vec2 hSizef = vec2(textureSize(previousLightTex, 0));
          vec2 hSizeInv = 1.0 / hSizef;
          ivec2 hSize = ivec2(hSizef);
          vec2 hTexelf = hCoord * hSizef - 0.5;
          ivec2 hTexel = ivec2(hTexelf);
          vec2 f = fract(hTexelf);
          ivec2 texel[] = ivec2[] (hTexel + ivec2(0, 0), hTexel + ivec2(1, 0), hTexel + ivec2(0, 1), hTexel + ivec2(1, 1));
          float weights[] = float[] ((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
          vec4 historyLight = vec4(0.);;
          vec2 historyMoment = vec2(0.);
          float historyLength = 0.;
          float sum = 0.;
          float luminance = 0.2126 * currentLight.x + 0.7152 * currentLight.y + 0.0722 * currentLight.z;
          float N = texelFetch(previousMomentLengthVarianceTex, hTexel, 0).b;
          if(N > 0.0 && currentMeshId > 0.0) {
              for(int i = 0; i < 4; i++) {
                  vec2 gCoord = (vec2(texel[i]) + 0.5) * hSizeInv;
                  float histMeshId = LGL_At(previousPositionTex, gCoord);
                  float isValid = LGL_Au(histMeshId, currentMeshId, texel[i], hSize);
                  float weight = isValid * weights[i];
                  historyLight += weight * texelFetch(previousLightTex, texel[i], 0);
                  historyMoment += weight * texelFetch(previousMomentLengthVarianceTex, texel[i], 0).rg;
                  sum += weight;
              }
              if(sum > 0.0) {
                  historyLight /= sum;
                  historyMoment /= sum;
              } else {
                  hTexel = ivec2(hTexelf + 0.5);
                  for(int x = -1; x <= 1; x++) {
                      for(int y = -1; y <= 1; y++) {
                          ivec2 texel = hTexel + ivec2(x, y);
                          vec2 gCoord = (vec2(texel) + 0.5) * hSizeInv;
                          float histMeshId = LGL_At(previousPositionTex, gCoord);
                          float isValid = LGL_Au(histMeshId, currentMeshId, texel, hSize);
                          float weight = isValid;
                          historyLight += weight * texelFetch(previousLightTex, texel, 0);
                          historyMoment += weight * texelFetch(previousMomentLengthVarianceTex, texel, 0).rg;
                          sum += weight;
                      }
                  }
                  historyLight = sum > 0.0 ? historyLight / sum : historyLight;
                  historyMoment = sum > 0.0 ? historyMoment / sum : historyMoment;
              }
              if(sum > 0.0) {
                  historyLength = N + 1.;
                  float color_alpha_min = colorBlendFactor;
                  float moment_alpha_min = momentBlendFactor;
                  float color_alpha = max(1.0 / historyLength, color_alpha_min);
                  float moment_alpha = max(1.0 / historyLength, moment_alpha_min);
                  out_light = color_alpha * accumulatedLight + historyLight * (1. - color_alpha);
                  float first_moment = moment_alpha * historyMoment.x + (1.0 - moment_alpha) * luminance;
                  float second_moment = moment_alpha * historyMoment.y + (1.0 - moment_alpha) * luminance * luminance;
                  float variance = second_moment - first_moment * first_moment;
                  out_momentLengthVariance = vec4(first_moment, second_moment, historyLength, variance);
                  return;
              }
          }
          out_light = accumulatedLight;
          out_momentLengthVariance = vec4(luminance, luminance * luminance, 1., 100.);
      }`,
};

// var pe = {
//   source:
//     "vec4 LGL_An(sampler2D map,vec2 uv){\n#ifdef OES_texture_float_linear\nreturn texture(map,uv);\n#else\nvec2 size=vec2(textureSize(map,0));vec2 texelSize=1.0/size;uv=uv*size-0.5;vec2 f=fract(uv);uv=floor(uv)+0.5;vec4 s1=texture(map,(uv+vec2(0,0))*texelSize);vec4 s2=texture(map,(uv+vec2(1,0))*texelSize);vec4 s3=texture(map,(uv+vec2(0,1))*texelSize);vec4 s4=texture(map,(uv+vec2(1,1))*texelSize);return mix(mix(s1,s2,f.x),mix(s3,s4,f.x),f.y);\n#endif\n}layout(location=0)out vec4 out_color;in vec2 vCoord;uniform sampler2D lightTex;uniform sampler2D LGL_AsDataTex;uniform sampler2D gPosition;uniform sampler2D gNormal;uniform sampler2D gColor;uniform float colorFactor;uniform float normalFactor;uniform float positionFactor;uniform float stepwidth;uniform int level;uniform float useMomentVariance;uniform float demodulateAlbedo;float LGL_Ap(float v){return acos(min(max(v,0.0),1.0));}float LGL_Aq(vec2 uv){return max(texture(LGL_AsDataTex,uv).a,0.);}vec4 LGL_Ar(){vec4 upscaledLight=texture(lightTex,vCoord);float sampleFrame=upscaledLight.a;float sf2=sampleFrame*sampleFrame;vec3 color=upscaledLight.rgb/upscaledLight.a;vec3 normal=texture(gNormal,vCoord).rgb;vec4 positionAndMeshIndex=texture(gPosition,vCoord);vec3 position=positionAndMeshIndex.rgb;float meshIndex=positionAndMeshIndex.w;bool isBG=meshIndex>0.0 ? false : true;if(isBG){return upscaledLight;}vec2 size=vec2(textureSize(lightTex,0));int kernelRadius=9;float dx=1./size.x;float dy=1./size.y;float kernel[9]=float[9](1.0/16.0,1.0/8.0,1.0/16.0,1.0/8.0,1.0/4.0,1.0/8.0,1.0/16.0,1.0/8.0,1.0/16.0);vec2 offset[9]=vec2[9](vec2(-dx,-dy),vec2(0,-dy),vec2(dx,-dy),vec2(-dx,0),vec2(0,0),vec2(dx,0),vec2(-dx,dy),vec2(0,dy),vec2(dx,dy));vec3 colorSum=vec3(0.);float weightSum=0.;float var;float varSum;float varSumWeight;if(useMomentVariance>0.){for(int i=0;i<kernelRadius;i++){vec2 uv=vCoord+offset[i];if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){continue;}vec4 positionAndMeshIndex=texture(gPosition,uv);float meshIndex=positionAndMeshIndex.w;bool isBG=meshIndex>0.0 ? false : true;if(isBG){continue;}varSum+=kernel[i]*LGL_Aq(uv);varSumWeight+=kernel[i];}if(varSumWeight>0.0){var=max(varSum/varSumWeight,0.0);}else{var=max(LGL_Aq(vCoord),0.0);}}for(int i=0;i<kernelRadius;i++){vec2 uv=vCoord+offset[i]*float(stepwidth);if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){continue;}vec4 positionAndMeshIndex=texture(gPosition,uv);float meshIndex=positionAndMeshIndex.w;bool isBG=meshIndex>0.0 ? false : true;if(isBG){continue;}vec4 upscaledLight=texture(lightTex,uv);vec3 kernelColor=upscaledLight.rgb/upscaledLight.a;float Dc=distance(color,kernelColor);float Wc;if(useMomentVariance>0.){Wc=min(exp(-Dc/((1.+sqrt(var))*colorFactor+1e-6)),1.0);}else{Wc=min(exp(-Dc/(colorFactor+1e-6)),1.0);}vec3 kernelNormal=texture(gNormal,uv).rgb;float Dn=dot(normal,kernelNormal);Dn=Dn/float(stepwidth*stepwidth+1e-6);if(Dn<1e-3){continue;}float Wn=Dn;vec3 kernelPosition=positionAndMeshIndex.rgb;float Dp=distance(position,kernelPosition);float Wp=min(exp(-Dp/(positionFactor+1e-6)),1.0);float weight=Wc*Wn*Wp*kernel[i];weightSum+=weight;colorSum+=kernelColor*weight;}colorSum=colorSum/weightSum;return vec4(colorSum*sampleFrame,sampleFrame);}void main(){vec4 light=LGL_Ar();out_color=light;}",
// };

var pe = {
  source: `vec4 LGL_An(sampler2D map, vec2 uv) {
      #ifdef OES_texture_float_linear
          return texture(map, uv);
      #else
          vec2 size = vec2(textureSize(map, 0));
          vec2 texelSize = 1.0 / size;
          uv = uv * size - 0.5;
          vec2 f = fract(uv);
          uv = floor(uv) + 0.5;
          vec4 s1 = texture(map, (uv + vec2(0, 0)) * texelSize);
          vec4 s2 = texture(map, (uv + vec2(1, 0)) * texelSize);
          vec4 s3 = texture(map, (uv + vec2(0, 1)) * texelSize);
          vec4 s4 = texture(map, (uv + vec2(1, 1)) * texelSize);
          return mix(mix(s1, s2, f.x), mix(s3, s4, f.x), f.y);
      #endif
      }
      layout(location = 0) out vec4 out_color;
      in vec2 vCoord;
      uniform sampler2D lightTex;
      uniform sampler2D LGL_AsDataTex;
      uniform sampler2D gPosition;
      uniform sampler2D gNormal;
      uniform sampler2D gColor;
      uniform float colorFactor;
      uniform float normalFactor;
      uniform float positionFactor;
      uniform float stepwidth;
      uniform int level;
      uniform float useMomentVariance;
      uniform float demodulateAlbedo;
      float LGL_Ap(float v) {
          return acos(min(max(v, 0.0), 1.0));
      }
      float LGL_Aq(vec2 uv) {
          return max(texture(LGL_AsDataTex, uv).a, 0.);
      }
      vec4 LGL_Ar() {
          vec4 upscaledLight = texture(lightTex, vCoord);
          float sampleFrame = upscaledLight.a;
          float sf2 = sampleFrame * sampleFrame;
          vec3 color = upscaledLight.rgb / upscaledLight.a;
          vec3 normal = texture(gNormal, vCoord).rgb;
          vec4 positionAndMeshIndex = texture(gPosition, vCoord);
          vec3 position = positionAndMeshIndex.rgb;
          float meshIndex = positionAndMeshIndex.w;
          bool isBG = meshIndex > 0.0 ? false : true;
          if(isBG) {
              return upscaledLight;
          }
          vec2 size = vec2(textureSize(lightTex, 0));
          int kernelRadius = 9;
          float dx = 1. / size.x;
          float dy = 1. / size.y;
          float kernel[9] = float[9] (1.0 / 16.0, 1.0 / 8.0, 1.0 / 16.0, 1.0 / 8.0, 1.0 / 4.0, 1.0 / 8.0, 1.0 / 16.0, 1.0 / 8.0, 1.0 / 16.0);
          vec2 offset[9] = vec2[9] (vec2(-dx, -dy), vec2(0, -dy), vec2(dx, -dy), vec2(-dx, 0), vec2(0, 0), vec2(dx, 0), vec2(-dx, dy), vec2(0, dy), vec2(dx, dy));
          vec3 colorSum = vec3(0.);
          float weightSum = 0.;
          float var;
          float varSum;
          float varSumWeight;
          if(useMomentVariance > 0.) {
              for(int i = 0; i < kernelRadius; i++) {
                  vec2 uv = vCoord + offset[i];
                  if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                      continue;
                  }
                  vec4 positionAndMeshIndex = texture(gPosition, uv);
                  float meshIndex = positionAndMeshIndex.w;
                  bool isBG = meshIndex > 0.0 ? false : true;
                  if(isBG) {
                      continue;
                  }
                  varSum += kernel[i] * LGL_Aq(uv);
                  varSumWeight += kernel[i];
              }
              if(varSumWeight > 0.0) {
                  var = max(varSum / varSumWeight, 0.0);
              } else {
                  var = max(LGL_Aq(vCoord), 0.0);
              }
          }
          for(int i = 0; i < kernelRadius; i++) {
              vec2 uv = vCoord + offset[i] * float(stepwidth);
              if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                  continue;
              }
              vec4 positionAndMeshIndex = texture(gPosition, uv);
              float meshIndex = positionAndMeshIndex.w;
              bool isBG = meshIndex > 0.0 ? false : true;
              if(isBG) {
                  continue;
              }
              vec4 upscaledLight = texture(lightTex, uv);
              vec3 kernelColor = upscaledLight.rgb / upscaledLight.a;
              float Dc = distance(color, kernelColor);
              float Wc;
              if(useMomentVariance > 0.) {
                  Wc = min(exp(-Dc / ((1. + sqrt(var)) * colorFactor + 1e-6)), 1.0);
              } else {
                  Wc = min(exp(-Dc / (colorFactor + 1e-6)), 1.0);
              }
              vec3 kernelNormal = texture(gNormal, uv).rgb;
              float Dn = dot(normal, kernelNormal);
              Dn = Dn / float(stepwidth * stepwidth + 1e-6);
              if(Dn < 1e-3) {
                  continue;
              }
              float Wn = Dn;
              vec3 kernelPosition = positionAndMeshIndex.rgb;
              float Dp = distance(position, kernelPosition);
              float Wp = min(exp(-Dp / (positionFactor + 1e-6)), 1.0);
              float weight = Wc * Wn * Wp * kernel[i];
              weightSum += weight;
              colorSum += kernelColor * weight;
          }
          colorSum = colorSum / weightSum;
          return vec4(colorSum * sampleFrame, sampleFrame);
      }
      void main() {
          vec4 light = LGL_Ar();
          out_color = light;
      }`,
};

function makeSVGFPass(gl, params) {
  const { fullscreenQuad } = params;

  let SVGFBuffer;
  let SVGFBufferBack;

  function swapSVGFBuffer() {
    let temp = SVGFBuffer;
    SVGFBuffer = SVGFBufferBack;
    SVGFBufferBack = temp;
  }

  const renderPassConfig = {
    gl,
    vertex: fullscreenQuad.vertexShader,
    fragment: pe,
  };

  const renderPass = makeRenderPass(gl, renderPassConfig);

  let colorFactor = 0.5;
  let normalFactor = 0.2;
  let positionFactor = 0.35;

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
    const makeDBuffer = () =>
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

    SVGFBuffer = makeDBuffer();
    SVGFBufferBack = makeDBuffer();
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

function pixelsPerTileEstimate(gl) {
  const maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);

  if (maxRenderbufferSize <= 8192) {
    return 2e5;
  } else if (maxRenderbufferSize === 16384) {
    return 4e5;
  } else if (maxRenderbufferSize >= 32768) {
    return 6e5;
  }
}

function makeTileRender(gl) {
  const desiredMsPerTile = 21;

  let currentTile = -1;
  let numTiles = 1;

  let tileWidth;
  let tileHeight;

  let columns;
  let rows;

  let width = 0;
  let height = 0;

  let totalElapsedMs;

  // initial number of pixels per rendered tile
  // based on correlation between system performance and max supported render buffer size
  // adjusted dynamically according to system performance
  let pixelsPerTile = pixelsPerTileEstimate(gl);

  function calcTileDimensions() {
    const aspectRatio = width / height;

    // quantize the width of the tile so that it evenly divides the entire window
    tileWidth = Math.ceil(
      width / Math.round(width / Math.sqrt(pixelsPerTile * aspectRatio))
    );
    tileHeight = Math.ceil(tileWidth / aspectRatio);

    columns = Math.ceil(width / tileWidth);
    rows = Math.ceil(height / tileHeight);
    numTiles = columns * rows;
  }

  function reset() {
    currentTile = -1;
    totalElapsedMs = NaN;
  }

  function updatePixelsPerTile() {
    const msPerTile = totalElapsedMs / numTiles;

    const error = desiredMsPerTile - msPerTile;

    // tweak to find balance. higher = faster convergence, lower = less fluctuations to microstutters
    const strength = 5e3;

    // sqrt prevents massive fluctuations in pixelsPerTile for the occasional stutter
    pixelsPerTile +=
      strength * Math.sign(error) * Math.sqrt(Math.abs(msPerTile));
    pixelsPerTile = clamp(pixelsPerTile, 8192, width * height);
  }

  function nextTile(elapsedFrameMs) {
    currentTile++;
    totalElapsedMs += elapsedFrameMs;

    if (currentTile % numTiles == 0) {
      if (totalElapsedMs) {
        updatePixelsPerTile();
        calcTileDimensions();
      }

      totalElapsedMs = 0;
      currentTile = 0;
    }

    const isLastTile = currentTile === numTiles - 1;

    const x = currentTile % columns;
    const y = Math.floor(currentTile / columns) % rows;

    return {
      x: x * tileWidth,
      y: y * tileHeight,
      tileWidth,
      tileHeight,
      isFirstTile: currentTile === 0,
      isLastTile,
    };
  }

  function setSize(w, h) {
    width = w;
    height = h;
    reset();
    calcTileDimensions();
  }

  return {
    nextTile,
    reset,
    setSize,
  };
}

function pixelsPerFrameEstimate(gl) {
  const maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);

  if (maxRenderbufferSize <= 8192) {
    return 8e4;
  } else if (maxRenderbufferSize === 16384) {
    return 15e4;
  } else if (maxRenderbufferSize >= 32768) {
    return 4e5;
  }
}

function makeRenderSize(gl) {
  const desiredMsPerFrame = 20;

  let fullWidth;
  let fullHeight;

  let renderWidth;
  let renderHeight;

  const scale = new THREE.Vector2(1, 1);

  let pixelsPerFrame = pixelsPerFrameEstimate(gl);

  function calcDimensions() {
    const aspectRatio = fullWidth / fullHeight;

    renderWidth = Math.round(
      clamp(Math.sqrt(pixelsPerFrame * aspectRatio), 1, fullWidth)
    );

    renderHeight = Math.round(clamp(renderWidth / aspectRatio, 1, fullHeight));

    scale.set(renderWidth / fullWidth, renderHeight / fullHeight);
  }

  function adjustSize(elapsedFrameMs) {
    if (elapsedFrameMs) {
      // tweak to find balance. higher = faster convergence, lower = less fluctuations to microstutters
      const strength = 600;

      const error = desiredMsPerFrame - elapsedFrameMs;

      pixelsPerFrame += strength * error;
      pixelsPerFrame = clamp(pixelsPerFrame, 8192, fullWidth * fullHeight);
      calcDimensions();
    }
  }

  function setSize(w, h) {
    fullWidth = w;
    fullHeight = h;
    calcDimensions();
  }

  return {
    adjustSize,
    setSize,
    scale,
    get width() {
      return renderWidth;
    },
    get height() {
      return renderHeight;
    },
  };
}

function makeFullscreenQuad(gl) {
  const vao = gl.createVertexArray();

  gl.bindVertexArray(vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
    gl.STATIC_DRAW
  );

  // vertex shader should set layout(location = 0) on position attribute
  const posLoc = 0;

  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  const vertexShader = makeVertexShader(gl, { vertex: fullscreenQuad });

  function draw() {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return {
    draw,
    vertexShader,
  };
}

function makeReprojectPass(e, params) {
  const { fullscreenQuad, maxReprojectedSamples } = params;

  const renderPass = makeRenderPass(e, {
    defines: { MAX_SAMPLES: maxReprojectedSamples.toFixed(1) },
    vertex: fullscreenQuad.vertexShader,
    fragment: ue,
  });

  const historyCamera = new THREE.Matrix4();

  let colorBlendFactor = 0.2;
  let momentBlendFactor = 0.2;

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

  function setPreviousCamera(camera) {
    historyCamera.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    renderPass.setUniform("historyCamera", historyCamera.elements);
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

function makeFXAAPass(gl, params) {
  const { fullscreenQuad } = params;

  const renderPass = makeRenderPass(gl, {
    gl,
    vertex: fullscreenQuad.vertexShader,
    fragment: ce,
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

function numberArraysEqual(a, b, eps = 1e-4) {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > eps) {
      return false;
    }
  }

  return true;
}

function makeDepthTarget(gl, width, height) {
  const texture = gl.createRenderbuffer();
  const target = gl.RENDERBUFFER;

  gl.bindRenderbuffer(target, texture);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
  gl.bindRenderbuffer(target, null);

  return {
    target,
    texture,
  };
}

async function makeRenderingPipeline({
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

  const lastCamera = new THREE.PerspectiveCamera();

  let frameTime;
  let elapsedFrameTime;

  let ready = false;

  let setStrataCount = 0;

  let firstFrame = true;

  let sampleRenderedCallback = () => {};

  let screenWidth = 0;
  let screenHeight = 0;

  let gBuffer;
  let gBufferBack;
  let hdrBuffer;
  let reprojectBuffer;
  let reprojectBackBuffer;
  let lastToneMappedTexture;

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

  const noiseImage = new Image();
  noiseImage.src =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABAEAAAAADfkvJBAAAbsklEQVR4nA3UhQIIvBoA0E830810M91MN9PNdDPd/ulmupluppvpZrqZbqabe89DHCiDv5GzaossZGYBp2PFIFqKdmMXIKW85edCB/RT11SD3JMQidRlL7n2ufRH1jVkFUNVc3NaZ7DP0T7/112kM1Qc3RDG0K/4uN7CPC7OmtFRZK3Jy3fhSSySKIZXopTsnIhN69JjLHJYYnfpZu44hnV+UkhG/lPd/D+fIVwWtdhhupVPJmtsLFIhjHA7UUqY4fPIQ2qdKxviqH2sugJ2nC+1ZdV0vEF3RGNcMd4KdvIXaJnujdPrKj4ifkeX2f04avjEbqO0ogI/rD7zhmy6GKG/2w32IetIX5vE9DbrS+CNy4sbmgXoiaug48lV4bVKZgluwPujd+Ioa+KjuntypepEEvl/YYCYTq6w4aaReGMShwLkC4nvq7jFKJmLpoepHJTag/h2aMklShou+tyip5wm67P2/CnvH7K6zuq+KGvy2rkkrR4mc4dpUNTEFHDId9TXQiST3RxHO0lHNgNFIA/Ub1kC0pOlNBf77EtyZ0ejxvikzySL8C8hNWyyc1GvcBCusv/otvBO3YSj+KvvRlKgoNaF/GEB64prsx8qFRwVJcRmMk8l5E5swfHMPuhlr9DmtrLeqs7KOrCMQSpeGW/zH5F2dc0AXZhcp9IthLZyuxpHrkNnp0JfnsY+55XkAtgSOvsWzps8uoJ5GtpAXRWZ5TK9cEM1WVRWC81ZUstPZHHkC7GDjZfl7BJ+VcXkI8RfVIMW0Jq95oxE0R+MDQnMX97DPhYjEXzHM0LvUNyODhdDCvJdNmXlfFp0RsbBNclTj8hpXofsCgVYsAnwPRTNTiTLxZkQW43BmK6wHk7Y0iSdXIfyK8/aQULdx1/hJc0JkRE/UgNDc/dGZWanTCs2WQ0W6Xh7PZGuDMXEaLtIRMZcZAM4ieOwO661Qf4xVyhLOOA2mLe0JyvIDrBhUA42ioUiMmrHJ9te6jwtbQ6xWrKf/ED3qKJ0qvzO2of57KkcyMBvNZndbLTX/iWNaWTezm9E8cleKOSEXK1B3LDfeGk4yx/b7L5+uAvp6UVC/UYAhvPLvSwTWm+qqO5saYjh79LadBJaAR90ct9S/GGZ7Q1zhKyTOUJ9MzT85IldVjLLduUOqovEaASJbXeZ37oFv0w/sOGhvMzpVrL/2MeQx8+ldfQU/QBXIqn8NtHAHjCzaTJk+CDS0e6Wk8N7GEDgoR4rG5M/Zig/LD6hEr6VHmxzmijoKu/oZ+p84oEeiwegquE7pBZPYXEoyLeQ66wRicLXmOzWoib6mq6KUoWxuriq62OQh647TUmn0RuuIjtPfuEkcMQtwJ/IaJabRRe9fRX2Q8Z1L2UNlMclpfMFdKYr+XkVEeb6vChZuOBfhNl+l/hly9L0/mzYIxPhBq4oimlnB273mkgwnr+S7Vnp8Fff8/3VC7IJCtqZ9AxZRnujo3wjmQ9n7WtayxwgvUhUNtJ0UjlEU9vPFhePxDLfkl6z43hhdQSW+xbyKooJEEwqTOkL1VHWc1vReFaVxbcnTGM2Uq1XNXRPos0bdtI8VBKXcZdCV1dNpLcL3DE7Cqfmi2w5JGhGFqATTUhzy7sG2+a0II4ZtupikC488mt9abdTvpYXVALXBU6wNzYLXUTPQwTxH/nNttjKDA7pQT47mopOQmxzW/f3GVhXWoguEUl5EHcUoKm8LdpiMoZV9JONpzZa7wa7hG4XzxvquHj2s5lsIrFbtrbew3+SKbiK6Ry+whAyXrTBC0kgDfwZHNOMNRnwOjHVVICdOGVo6LuFsn6GTKN6u4IeZqtN7B6vzlegD7ioW8i/u430kbtO2pABrgTPwb+xchSZ7jK/V6KxPEWK+K+oBXFmeuikt+HzrIU66KQsI9bRaGqQfKqSkMNumbnN4/ljkFsPxqnDElSF32L17D8UhxbUI8xnuwk/0znwXXcGGmD4QpPo5n6kTod70Zb2oI8Y6pFJKiuLoab7bXBEj+CXFTOH4A4kV/1JNjNRLrexaEX5Ht0xQ1RRskzmhCd+rmnFi9hLeqHe7svy7Lq+/+Mq6am+A/X8e+iptvqcbIjzqCOfbW6SpKQ22gPt8HgTFUMPd9kWgKd2O45Pr0EuOlK8waXFfriga7sXrLlKZZbrgeaPnmsrurd+n2H8hugjc+i1OCpJj2vYPyQ27+lT6/f4JM0c6sJIHwm/8AJS4tXuuo6g9qOCjvOZIrI9ZpaaauQAjwb9eTG0RMYPr2y5AHv8YhZLHvZl+DdQqrI5Z1L4QawT/FOLoQCOLR+EyTIrjcqb6YtiA4mg0/L27reYYg7JpvSVOM7G+p2uIb1iJ0hE+/DvvLW+qqfL034nLU5GQh02j8aHi/aDLS2b4ncYk/OcE+V+hhNqmF2rs1j4a1qziXYgaaDWQRetSbOwC60J8VhFSIf62k2osy7FXqpdrDAdZbuQxf5ZOCGLy6Reago9xBydmN9HBdUqX9VtUYdIKZOGbGAFxEDXjLxDmeVXsd5WIOmlhN0kqe2r84o1upy+z9KLRjY/ui5qGkhNiqoL5iXN6hPbeyGa+ckKwRM6l51Ao+EG/yKruXNsrWvHkuDPKKctS4bYRnq7eIQX+at4s8lD2ovy+D/xlXUWuf2jsNiNQx9xDRwjLAgJUSd5AvfTD80U0Qk91fP8DTkBfaXx1Qhv7FMXifZRMw0MlxtxVFVNzoOTrnjoK9ObCZy5HOwjbWgTib1kFo3BJa9t7oojdJK5RpGcifO66LQ2xuIHBvxcnMcLdEoUWc0QjVhs0k3f4dnoXvREODRB5KWJ2UFTX60WcXERxFQ7uo9mDz1YVbzQddDBHQ3QxD0MPfBnsdX+p9+xg+Sybmtum4hKoJW+CG0NGSQxP/TC0AulZ1tozfATr9Ld/QfURp1kg2FqaOQ2QBZ9JNyCoeQfO0eS+SOCa0lLshW6hnulWqHi/qrMTj6Z03gzB/LMzuaXmZXJSUm7nSKACjQDVzafbiNTqUayYpjDNpqhqIzf4SfRU/KF6S+vo0MhAS/v36BoolU4JbKQO3S3nmAL88puH0GoN6tF3vg2rCzscLVcUbmKzHS/dFroBdGk8bP4Hx8DRotKtJdMa4YZKhvR2OgbnULv+lzYUfjhFusD6KaLR8aHFSSPjYmT2MP6tU1L76u4uqJYrqawEqqpW+Onm4G6KIw2CU0Z29/EIc9gKVwjH3wxNV5v8fmxVunIGB94PxYBV+I3RRM4IO8x7Ab6ZXi3aoEeoUXmtzqHVrGCsrUYpOvIFXSMgX4YQp1Qmp6xf/Ae8gR1U19NUzEdSOjApK9nPuoItqt5HE7TXPIm3sff2fm+SbioN9GcPLltyTLKeeGBjGr668sYsfuymdjM8uHjYqL5BLn4SFqRdjbnZJKgyFHIA51lEjEebtEMfqN7LlORlgreiM3B26G2g82iqssbZBQq6k+rGn5J+MMvsVRus95vMpFR9K9K4errLmJFSMO/iepoBu6CfptR4QzqxpOYH6ERP4xmqS4uKzz3V2RS0SnMNwnYKvdW5Bd16FdS0kWlDeQ2VIMEJtgeVJ7GZIdDYQldWQ6UVK2mM1l000/MRyn5GpGZDkRbQ1RUCs/HLcMDV4hV1/OkEZFpRX+f5zfSHGQR7W2obdeiMnK3qQarTK7wEiq5vTqWXayqhyF4By5l6+HDPKK4AZtVRnoHjVBv8Syd1VocyY2UP9g8c15PpXBNVIET8MnVd8/oNlaGcnZJBZoQ7uAe4SjJAWNdX3AkNrQTQ+ClmMxO23i4nXseStC+4agkPDYeChdcOzLRJ2f/2S+ukJqsW/tvKoN4bP5/sOpHxuN5qC3p5VbaizIefWBKkKWkCc+DO5paPAHAP7wQj+VFRVp/zhPy3Ufw+8I4VsE1QVPtS1ZLf6eJ5Qr3Se3GxfURld71EhvEHJXVbLdJzUL/2nk6nX1mGcxdXUpvIg2gt7rADrkoYq0ogKbYXyK1pOwljuEO0rykAh5k2pMp6hR7rVO7h3IY2Y6gOYpsBqhWfp/sQcbbZa6m7uge0dx8pUgjd9GY5CyUldNEXX3L5JRLaHP2G5UhDtfnn8Qk3sak8Y1dUR5BatyTnyTR2PWwnCVCZe09NdwLG8tpvl3nJCd8dfzPNFMp1Wb4YuuihKIPWkP2k5I0o4OVJB96wDby2Oy2TAwv9VAxh8dFJ9EvU1S390Pdekx8d0jrxgik35GaLDoeZR7ZhH4IqyzO+/WiNzkkGNrOm8MvN4dmom9kbtuCzgy14K097SrhJuoeDEMJ7CI5Tjwn+3AmfjkUQpXUTR+DzdDPKVRgh23w1c0MUoI1EYchky6st4hefmS4bhZhr5vJ9/QYfUpbywukv9iib4S8msMqOE6iqH86px6L3oubJike6fJBB1ODDTZb6V+fAvapLL6DTGQ+2hm2k1svL8litoeKxZaRIXq2/U3HsDb6ghQBJqP4OB29iP4Lv/FaVZlctV9QM5tC1UGRbCWRBSfQs/UOFAGtlhX8VJJMLTD7VQY6HRU23ehdXAYlJHN5FlkRvXQHdDzx2I8Lx1A3sxTd8MXdOjVKH4BCOp2pIx6zrHwar6qO6uYB3FaXXdYNycNXCUNlY9TFLwq5SFuemg60UdhieVa8hml4v/2sHOsDNV1JGM5zmx/U2qKhk/lq+7jXaCuuYxaTPba1OuMHhY16GiuJVonzKBUtjEDVtwPxJP+cXUaRfD/1w5zS0Ulr9DXcQPnIK39Xdgkn+WJahGzGkI1cda/xFhfNn6KP1R7c2Y4JZSBnWK26kkJhs51E/tGk8m5oInvSjOI5risjuorqlI8X0oZh+JmKQeuhn7KLjKmvmd6iCVnIKtMH5KOM6zGu5nP5hmixMLo8Ge0P6jWyD0ukR7F0lqIPEMc/gv0OIsqZvCSug8eZ964gnYXr+LsqPmojHrG0apiIzg6TtkyHc7BHIDzTXuL/yQ38Dhsnm5OPfCorYK/LFTKPOU4xr+m/6WzydVCmPWwM5+UuN9e1Ce/8TRbfdJVzbCrWQJTUO+R8V5Ouh6m6T2jpqllYDfew5Ylcb1teraRxUFb8xxp6zFWH+eqtbIhzomc+DRunqvv3doVoKfOEJGoRKilzmAt4B69k+0FyN0m2ED5ss6NkNLTbn1LDAmHU/QDBj5oU8j9cxLxi2dUd+z5E8RfNT9NUHvApzRU/Bv1R0MEPlER9Nzuhpb/lhmsLxUJfP8EkYWdUCbyW3QzlbTco4AfhKEDNUfeY7pLt8U/a063mUaGD+4wtofwtmo0L2WWqlSxHErH0aDltYsbwqHqNq2CnuJ3qdKjJh/hlYYrsKLKwwTy2eOnzyrIMB1A0rmhiNc3Iz9tkvJt44ZqhJQ70F+jhW8CIgNQuO49/Q8bcJ5NxWlaVj6Yx/VVIZWeY2uK+zuw3hSEhIu2hE5NLfiC9p//I7vq6i6+fioJwF2Uyf2lzHoGt521FPlUJrH+AioQzvJtcJnaGEwHewSXxGFExyX7y81hVsQGng6shr9lG74TM5KdX/LyLIevpKyin6sz/Qj/0MjTQh2g594Yct6NVPL5QNUC3QlX/RR3hOXE9th5Nhf2hBswWfdVZVJsvMQNoGnOVfvNx6Qudgo9Ra/hMVJV8wdF1XQwFSYqwzgxjkVQ9kS+cZjHEhzAK6qMKYlZIjg+ZGqIvykCWBy4T0dlkBykCq33WsIAOAoJaQjH/V5w1uekes5plQOPRfBuTFmGvWRueVX9VW2V7GcccoE90CTSW7cXzaU+9hdflUeUTkk001/PDCAnbTRXb2h4jPeCZ2O0Gh1JuOu2M97PnZjBd6QrJDuqBL60+kuH4BK+Fo8uzLjmaoO4Z4DvsCpZM9DJtlWKvUEnVmTVVj/SOUFmOxBHCZV7CJJETIKA8rIuZKavxzKaxvQSlxD/exg9g130ifoH20pBJPKAz2F+bwyVUq2Qrd98mshdVNhVTtjJXSFx4wzegSfhAKECfcY1u4Wamu3pPqogO+Fu4bifDU1MZRfepxAh8EeLYn0i4Ey6NWwYD4Yhp6hfK8uiGimFPubcsYXiI/nO58QmN5V4+zm1kpdl3AtoeFLF0MT0Wbqk5KJ37rmqFTWYR+4vLsGN4BM3uGoYUJgLv5irINGiw+upKhA3qOIxkiQjVGfR+uo7dRAv4B1WLbqApcD472903Hz2T6/0jmR6G0xWmEWz2g3U7uYZF1FNgKX7PK5p85lXoGMBAMzzA17Kb+EnZmFfk/eghNI4W9r1pGjGZ14YvbIHcHQbYy/Cbb0FTcW61x83ySGRGjc0SOC/qqKE+p28MfV0hfJhNV0P4VdGQdICcYrKPz/Lb306IfSKl+66z83LiKPokGeuq4pI5oqFMzY6FSQC50RXxgifnnckXEUfkZS9kFNJCn0b38Q4aWXRRt2Rl/pLMkll4fdwuPNaRXW11xT1lBdE2KfBblwAdDz/dNhIJtSZZzFtdWq+BqHZPKB8ukbZwCkf0Ne19X1hMFAvsLZIWFyPGnTe36TC9Ej8U5Tkk8J/0Ai9JpnCJ7iLz+VWzFqqEdyaXGqSWk8I4vYovWonifKW2Iok7p8boFaozGsinis86MpknWoeJoazD4OW5UEXvcxNoUvdDdDdP5Ag7V2xypbHy/eGcjY56yF2qGQwUz1xSaE2jit++h9mpYZpqYwuYyrAGT+QlXDsjVSrUXcwiiaCxfsYOm2lmszyrh4tY/LbrY9+GQqK8+SdSyYO2qsmqbvEi+old7nrCaL1Ed7Gx8B05gJ82C1FGFds3FM9tDvUJa9E4vNJVZTLzy89i2dg4sLQmFMGZ8TkH61lUf4Q94D1xRPTYMZst/IK9vjhskJdJeTdKfXNMdOfvVR5eDS3STUlGczIYHEvdhxZ2LR1ud/NYpqYIMqEs7P6yTbIpz8eru61QjH4mg1AybF17mgESqAN4PRnl8uvTsBpT9SlsJ4tgBKtjIZXua36TRmirSIo+iqX8FIol7pKx5CNEox1EdpGC3WWR5C4/Qf+wm3Rc9Z+fhdraPGi8KsWdT0Y7idMylzVwldSXGf1MeGZSiFGe+1tin67kr6ixag26TYYaSi771i5ueEjr+U4+neqPY6H37KaEFzBGFqfpuZIXUEsyIJST01xd2walDwvtGd0Xr7al/ALSXKbRNHSh1/xe9cHVDs+1hv7ul6xPX5ppZAjlZm446vuIsuiiW+rf8Yhmil+Bc0N3Ej3UxAXcTzWdZxEhaN3HRJaX5VMyyR3jLXxZDTnkbrsM3cA1eD52UGL2imx3xA7FB2wN+c9Opo3UG3rZDeIn9Wz2kCfTRVwEesH2oCn0MRHFzZWZcHm4y8GmVp/4BBzd7pXZbBd+3Kehjfw/N0duh2e4hTmuouCuvjrbo4uZaX5DqOyT+PxsJXTBMIOfstFd2/BF/8fnyximG1rFk/Bb6AWOywqHHSYhPhjy0zjuOWSndcUAMwVVtGtDZrFT1FCF+Bboxaz+wYujXVBNPSRt3TBel3xHhVk/9xASyFLqjEhr+/FFxMh7YiKktkftn5CDNDW7xTd7kcU1MJRWMm9Vb55YbVIl5D36BxqFk6osFmqjl8GTjLp7qCnHWMPa24NoufkdWuo7+j/zxUx0N+hbaBqQW6VGia52kcsnkb1p1/I5vgo26CIertrZgMfT8jqxrkeJfAMtwmAWX95Uo/g814vXll5BStHMzzG50EN8RE4g1WgWNNwtUpG10jl8S1zZvvfT7Urzi5eCKOEtweoMJWKejoFKoTY0TliqpCCU+WsqI7ywhpzipVFyeKKikfE+o63t11qguWAP/Wau6OEQE52l5dkq3BGeqwimFMnktyn4J4uoS3aNakAj8XbqStjpC/nXpL354q/zo3SxATjjuEtpr7H5uiodjVHoivbLhvoxnCDdMdZn/RMz0x/k0UIz3lv/EdN0K3pYdrO72VeeH24La2aqJ7wjWeFLhjlus/jC89FaKC05oN6biWqpgGjYshGQTpdTP8ggEQ9mkuTmgqglsFkrE4UBUNreIbnEMHcE9xRN8P2wlZTjr0xKv1HOEvn531ApJFLt1WdXRk/UKSyjmdxIkke903Ftc7EEC1PVDiaNfToRT/c2j0km6I6mKqcW44GqobuOOyp4goU26hWewpfxE/QZaoo2+L50vx5N8rmG/IefiDeJeuqDiAUFwjqeWX3VU11fdoFn04N9PVhNJoSdZoDMztbZ42YhfaMvueW4Irkmp+sS+hlJLmL5y6aI2KYvhGr6kG1kopid1vuiNlY4aXO5KhJmmTo8AWmF8/qUugcq5rLxb7gCiunu2jnQhZ2C2CGD6gw71CMzw13kQ0xEVogsZdVtHHjLD4j7LiIvxpxswLwYRguoCG6H7isSi/qwwQ0Rp8U4/IeuNq/oSDsDfto8dJx9ExJJyVqwX3S9Hi2TazjLCsNtu1984NXMdnbPLbaTdCv1Xpf02+UTqMZe8QWquBlDKoeEtp3e6+qTa7gV+SnG+VIhOeWop/0g56o0EFf+QC1wOdwRPyJH1U/AvgPJYffZMqEtzo4jhfoiKdOyrT7uqqA1NIvricqK3ei1gBW8DwE5zM8Jl3CCUC8MRpH0EbscEoihOptLBntDP+/CH5RWLkfvQhn1TCahR/w201XcYEvUGZbJbnajXRWyh/Xgt/TqkIBOcEXkPBsZHtiaaKlMbWbDSdGf7ab3aSl51fe3qf3nMM3e9vF5W5/BwQT/21ZQ611W2YGPtb8hHbuuiBP+nG6Op6HVqJUlEMUexs1YH5qbTBILRCY2nORVUeh0V1X/hwrwJuy5u2KWupx0Bj1NXtBsuKkezra58+Ez9NGN1R3x0VRindg7mRGZMA8XNOd4jXCIL+IfXYMAN3RSbVUT+oTFdmfMOl1R72SvPQtpwl95zZUxn+g9MtnVMOvDbXVcRnOd+Hr6iDcWH0g6/xRvD99FYtwJR/YlbD05AmFUneyl71x3W17k8xNRMrnJR1djaUGxlsThY6ARjgBPUSc7kkeH/GQIKilgG+8KRCv8mVLcW+Z300I7NBzNJ0XZZhSR1OPSLmHdMOJF8Wf5HzD9K5zFFXG/sFIewu1RPFSOrULH1JTwUR1UMdUvNQAv5jHwTb3KxuWt8StXkuz3mfklNIcc0z3DPyhn9opkrClsVI/xqRBbwytYQq7gQTYNXi4bmGPyjk+CYuiHfj8fp3vDMZ+QZSRvzW6Yq7OilGQHFMfx3GyZXBa2DMa7S2YeuWeHyMy6p3lo29LNtDR3rq5Ljf+RI2guPkcHy9rkF2mJEvvqNI+4jRUs50FfgWy+u5uDaynIAq15dF4tPIB9KIp8L7PDUv1NVoWWJht6iQrIdfgcLu05vsbHBkGc5mECeyC2spv8F4rG++C80ICkoNXwOlIwXEOJzSyX23UIU0h/mklVoY9lfNdVL/E36VD20u4QbVxm6GeKyfGkEvrFUqPR/H9s/XjiBWp1EAAAAABJRU5ErkJggg==";

  noiseImage.onload = () => {
    rayTracePass.setNoise(noiseImage);
    ready = true;
  };

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

  function fullDraw(camera) {
    if (ready) {
      swapGBuffer();
      swapReprojectBuffer();

      if (areCamerasEqual(camera, lastCamera)) {
        setStrataCount++;
      } else if (movingDownsampling) {
        setCameras(camera, lastCamera);
        setStrataCount = 0;

        return drawPreview();
      } else {
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

class RectAreaLight extends THREE.Light {
  constructor(color, intensity, width = 10, height = 10) {
    super(color, intensity);
    this.type = "RectAreaLight";
    this.width = width;
    this.height = height;
    this.target = new THREE.Vector3();
  }
  copy(source) {
    super.copy(source);
    this.width = source.width;
    this.height = source.height;
  }
}

class QuadLight extends THREE.Light {
  constructor(color, intensity, v1, v2) {
    super(color, intensity);
    this.type = "QuadLight";
    this.v1 = v1;
    this.v2 = v2;
  }
}

class SphereAreaLight extends THREE.Light {
  constructor(color, intensity, radius = 1) {
    super(color, intensity);
    this.type = "SphereAreaLight";
    this.radius = radius;
  }
}

class PointLight extends THREE.Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.type = "PointLight";
  }
}

class DirectionalLight extends THREE.Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.type = "DirectionalLight";
    this.target = new THREE.Vector3();
  }
}

class RayTracingRenderer {
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

export {
  RayTracingRenderer,
  RayTracingMaterial,
  DirectionalLight,
  PointLight,
  QuadLight,
  RectAreaLight,
  SphereAreaLight,
};
