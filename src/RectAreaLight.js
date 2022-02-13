import { Light, Vector3 } from "../modules/three.js";

export class RectAreaLight extends Light {
  constructor(color, intensity, width = 10, height = 10) {
    super(color, intensity);
    this.type = "RectAreaLight";
    this.width = width;
    this.height = height;
    this.target = new Vector3();
  }
  copy(source) {
    super.copy(source);
    this.width = source.width;
    this.height = source.height;
  }
}
