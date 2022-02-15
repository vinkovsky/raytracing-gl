import { RayTracingRenderer } from "./RayTracingRenderer";
import { RayTracingMaterial } from "./RayTracingMaterial";
import { DirectionalLight } from "./DirectionalLight";
import { RectAreaLight } from "./RectAreaLight";
import { SphereAreaLight } from "./SphereAreaLight";
import { PointLight } from "./PointLight";
import { QuadLight } from "./QuadLight";

if (window.THREE) {
  /* global THREE */
  THREE.QuadLight = QuadLight;
  THREE.PointLight = PointLight;
  THREE.SphereAreaLight = SphereAreaLight;
  THREE.RectAreaLight = RectAreaLight;
  THREE.DirectionalLight = DirectionalLight;
  THREE.RayTracingMaterial = RayTracingMaterial;
  THREE.RayTracingRenderer = RayTracingRenderer;
}

export {
  QuadLight,
  PointLight,
  SphereAreaLight,
  RectAreaLight,
  DirectionalLight,
  RayTracingMaterial,
  RayTracingRenderer,
};
