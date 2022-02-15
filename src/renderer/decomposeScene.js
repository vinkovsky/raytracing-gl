import { Vector3, PlaneGeometry } from "three";

import { RayTracingMaterial } from "../RayTracingMaterial";

export function decomposeScene(scene, camera) {
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
    meshLights = mergeLightsFromScene(
      lights.map((light) => {
        const meshLight = {};

        meshLight.position = light.position;
        meshLight.emission = light.color.multiplyScalar(light.intensity);
        meshLight.radius = light.radius || 0;
        meshLight.area = 0;
        meshLight.visible = Number(light.visible);
        meshLight.p1 = new Vector3();
        meshLight.p2 = new Vector3();

        switch (light.type) {
          case "RectAreaLight":
            meshLight.type = 0;

            if (light.width && light.height) {
              const planeGeometry = new PlaneGeometry(
                light.width,
                light.height
              );

              const targetPosition = new Vector3();

              if (light.target) {
                targetPosition.copy(light.target);
              }

              const planeGeometryPosition = new Vector3().subVectors(
                light.position,
                targetPosition
              );

              const lookAtPosition = new Vector3()
                .copy(planeGeometryPosition)
                .negate();

              planeGeometry.lookAt(lookAtPosition);

              const positionAttributes =
                planeGeometry.attributes.position.array;

              const v1 = new Vector3(
                positionAttributes[0],
                positionAttributes[1],
                positionAttributes[2]
              ).add(light.position);

              // Unused v2 vertex

              // const v2 = new Vector3(
              //   positionAttributes[3],
              //   positionAttributes[4],
              //   positionAttributes[5]
              // ).add(light.position);

              const v3 = new Vector3(
                positionAttributes[6],
                positionAttributes[7],
                positionAttributes[8]
              ).add(light.position);

              const v4 = new Vector3(
                positionAttributes[9],
                positionAttributes[10],
                positionAttributes[11]
              ).add(light.position);

              meshLight.position.copy(v3);

              meshLight.p1 = v4.sub(v3);
              meshLight.p2 = v1.sub(v3);
              meshLight.area = new Vector3()
                .crossVectors(meshLight.p1, meshLight.p2)
                .length();
            }
            break;

          case "QuadLight":
            meshLight.type = 1;
            meshLight.p1 = light.v1.sub(light.position);
            meshLight.p2 = light.v2.sub(light.position);
            meshLight.area = new Vector3()
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

export function interleave(...arrays) {
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
