import { BufferGeometry, BufferAttribute } from "../../modules/three.js";

export function mergeMeshesToGeometry(meshes) {
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
      : new BufferGeometry().fromGeometry(mesh.geometry); // Geometry object

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
  const positionAttrib = new BufferAttribute(
    new Float32Array(3 * vertexCount),
    3,
    false
  );
  const normalAttrib = new BufferAttribute(
    new Float32Array(3 * vertexCount),
    3,
    false
  );
  const uvAttrib = new BufferAttribute(
    new Float32Array(2 * vertexCount),
    2,
    false
  );
  const materialMeshIndexAttrib = new BufferAttribute(
    new Int32Array(2 * vertexCount),
    2,
    false
  );
  const indexAttrib = new BufferAttribute(
    new Uint32Array(indexCount),
    1,
    false
  );
  const mergedGeometry = new BufferGeometry();

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

// Similar to buffergeometry.clone(), except we only copy
// specific attributes instead of everything
function cloneBufferGeometry(bufferGeometry, attributes) {
  const newGeometry = new BufferGeometry();

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
    console.warn("No position attribute");
    return;
  }

  const index = new Uint32Array(position.count);

  for (let i = 0; i < index.length; i++) {
    index[i] = i;
  }

  geometry.setIndex(new BufferAttribute(index, 1, false));

  return geometry;
}
