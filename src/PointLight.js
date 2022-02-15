import { Light } from "three";

export class PointLight extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.type = "PointLight";
  }
}
