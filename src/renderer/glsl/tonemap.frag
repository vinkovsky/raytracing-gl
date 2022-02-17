import textureLinear from './chunks/textureLinear.glsl';

export default {
    includes: [textureLinear],
    outputs: ['color'],
    source: `
        in vec2 vCoord;

        uniform sampler2D lightTex;
        uniform vec2 lightScale;
        uniform int toneMappingFun;

        // Tonemapping functions from THREE.js

        vec3 linear(vec3 color) {
            return color;
        }

        // https://www.cs.utah.edu/~reinhard/cdrom/
        vec3 reinhard(vec3 color) {
            return clamp(color / (vec3(1.0) + color), vec3(0.0), vec3(1.0));
        }

        // http://filmicworlds.com/blog/filmic-tonemapping-operators/
        vec3 cineon(vec3 color) {
            // optimized filmic operator by Jim Hejl and Richard Burgess-Dawson
            color = max(vec3(0.0), color - 0.004);
            return pow((color * (6.2 * color + 0.5)) / (color * (6.2 * color + 1.7) + 0.06), vec3(2.2));
        }

        // https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
        vec3 acesFilmic(vec3 color) {
            return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
        }

        void main() {
            vec4 upscaledLight = texture(lightTex, lightScale * vCoord);
            
            // alpha channel stores the number of samples progressively rendered
            // divide the sum of light by alpha to obtain average contribution of light

            // in addition, alpha contains a scale factor for the shadow catcher material
            // dividing by alpha normalizes the brightness of the shadow catcher to match the background env map.
            vec3 light = upscaledLight.rgb / upscaledLight.a;
            
            if (toneMappingFun == 0) {
                light = linear(light);
            }
            
            if (toneMappingFun == 1) {
                light = acesFilmic(light);
            }
            
            if (toneMappingFun == 2) {
                light = reinhard(light);
            }
            
            if (toneMappingFun == 3) {
                light = cineon(light);
            }
            
            light = pow(light, vec3(1.0 / 2.2)); // gamma correction
            
            if (upscaledLight.a == 0.) {
                out_color = vec4(light, 0.0);
            } else {
                out_color = vec4(light, 1.0);
            }
        }
    `
};
