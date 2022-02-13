// retrieve textures used by meshes, grouping textures from meshes shared by *the same* mesh property
export function getTexturesFromMaterials(materials, textureNames) {
  const textureMap = {};

  for (const name of textureNames) {
    const textures = [];
    const indices = texturesFromMaterials(materials, name, textures);

    textureMap[name] = { indices, textures };
  }

  return textureMap;
}

// retrieve textures used by meshes, grouping textures from meshes shared *across all* mesh properties
export function mergeTexturesFromMaterials(materials, textureNames) {
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
