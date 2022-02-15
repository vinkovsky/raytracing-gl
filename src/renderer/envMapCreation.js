// Convert image data from the RGBE format to a 32-bit floating point format
// See https://www.cg.tuwien.ac.at/research/theses/matkovic/node84.html for a description of the RGBE format

import * as THREE from "three";

import { rgbeToFloat } from "./rgbeToFloat";

// Tools for generating and modify env maps for lighting from scene component data

export function generateBackgroundMapFromSceneBackground(background) {
  let backgroundImage;

  backgroundImage = {
    width: background.data.image.width,
    height: background.data.image.height,
    data: background.data.image.data,
    dataFormat: "float",
  };

  if (background.data.type === THREE.UnsignedByteType) {
    if (backgroundImage.data) {
      backgroundImage.data = rgbeToFloat(
        backgroundImage.data,
        background.intensity
      );
    } else {
      backgroundImage.data = clampedArrayFromImageData(background.data.image);
      backgroundImage.dataFormat = "byte";
    }
  } else if (
    background.data.type === THREE.FloatType &&
    background.data.format === THREE.RGBAFormat
  ) {
    const buffer = background.data.image.data;
    const texels = buffer.length / 4;
    const floatBuffer = new Float32Array(texels * 3);

    for (let i = 0; i < texels; i++) {
      floatBuffer[3 * i + 0] = buffer[4 * i + 0];
      floatBuffer[3 * i + 1] = buffer[4 * i + 1];
      floatBuffer[3 * i + 2] = buffer[4 * i + 2];
    }

    backgroundImage.data = floatBuffer;
  } else if (background.data.type == THREE.HalfFloatType) {
    console.error(
      "Please use 'new RGBELoader().setDataType(THREE.FloatType)' to load hdr env map. Half-Float type will loss of precision and have an impression of the effect."
    );
  } else if (background.data.type !== THREE.FloatType) {
    console.error(
      `No support environmentLight's data type: ${background.data.type.toString()}`
    );
  }

  return backgroundImage;
}

function clampedArrayFromImageData(image) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return data;
}
