import { Light } from "../modules/three.js";

export class PointLight extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.type = "PointLight";
  }
}
