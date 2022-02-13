import { Light } from "../modules/three.js";

export class QuadLight extends Light {
  constructor(color, intensity, v1, v2) {
    super(color, intensity);
    this.type = "QuadLight";
    this.v1 = v1;
    this.v2 = v2;
  }
}
