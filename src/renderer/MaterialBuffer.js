import { interleave } from "./decomposeScene";
import { makeUniformBuffer } from "./UniformBuffer";
import { makeRenderPass } from "./RenderPass";
import { makeTexture } from "./Texture";
import {
  getTexturesFromMaterials,
  mergeTexturesFromMaterials,
} from "./texturesFromMaterials";

import materialBufferChunk from "./glsl/chunks/materialBuffer";

export function makeMaterialBuffer(gl, materials) {
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
