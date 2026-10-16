import * as THREE from "three";

export const LIGHTING = {
  // Direction from the scene toward the light source
  sunPosition: [-9, 4.5, -7],
  sunColor: "#FFE5B5",
  sunIntensity: 3.2,

  ambientColor: "#E8F2E2",
  ambientIntensity: 0.45,

  fillColor: "#C9E5FF",
  fillIntensity: 0.2,

  // Shared normalized sunlight direction for custom shaders
  get sunDirection() {
    return new THREE.Vector3(...this.sunPosition).normalize();
  },
};