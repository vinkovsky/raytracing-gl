import { Light } from "../modules/three.js";

export class SphereAreaLight extends Light {
  constructor(color, intensity, radius = 1) {
    super(color, intensity);
    this.type = "SphereAreaLight";
    this.radius = radius;
  }
}
