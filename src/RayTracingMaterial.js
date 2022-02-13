import { Material, Vector2, Color } from "../modules/three.js";

export class RayTracingMaterial extends Material {
  constructor(parameters) {
    super();

    this.materialType = "RayTracingMaterial";
    this.isRayTracingMaterial = true;

    this.workflow = "Metalness";
    this.color = new Color(16777215);
    this.roughness = 0.5;
    this.metalness = 0;
    this.map = null;
    this.emissive = new Color(0);
    this.emissiveMap = null;
    this.normalMap = null;
    this.normalScale = new Vector2(1, 1);
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
    this.extinction = new Color(16777215);
    this.anisotropic = 0;
    this.specularColor = new Color(16777215);
    this.glossiness = 1;
    this.specularMap = null;
    this.glossinessMap = null;

    this.setValues(parameters);
  }

  copy(source) {
    this.materialType = source.materialType;
    this.isRayTracingMaterial = source.isRayTracingMaterial;
    this.color = new Color().copy(source.color);
    this.roughness = source.roughness;
    this.metalness = source.metalness;
    this.map = source.map;
    this.emissive = new Color().copy(source.emissive);
    this.emissiveMap = source.emissiveMap;
    this.normalMap = source.normalMap;
    this.normalScale = new Vector2().copy(source.normalScale);
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
    this.extinction = new Color().copy(source.extinction);
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
