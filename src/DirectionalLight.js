import { Light, Vector3 } from "three";

export class DirectionalLight extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.type = "DirectionalLight";
    this.target = new Vector3();
  }
}
