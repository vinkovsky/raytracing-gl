import textureLinear from './chunks/textureLinear.glsl';

export default {
  outputs: ['light', 'momentLengthVariance'],
  includes: [textureLinear],
  source: `
        in vec2 vCoord;
       
        uniform mediump sampler2D lightTex;
        uniform mediump sampler2D positionTex;
        uniform mediump sampler2D colorTex;
        uniform mediump sampler2D previousLightTex;
        uniform mediump sampler2D previousPositionTex;
        uniform mediump sampler2D previousColorTex;
        uniform mediump sampler2D previousMomentLengthVarianceTex;
       
        uniform mat4 historyCamera;
       
        uniform float colorBlendFactor;
        uniform float momentBlendFactor;
        uniform float demodulateAlbedo;

        vec2 reproject(vec3 position) {
            vec4 historyCoord = historyCamera * vec4(position, 1.0);
            return 0.5 * historyCoord.xy / historyCoord.w + 0.5;
        }

        float getMeshId(sampler2D meshIdTex, vec2 vCoord) {
            return floor(texture(meshIdTex, vCoord).w);
        }

        float getValidMesh(float histMeshId, float currentMeshId, ivec2 coord, ivec2 size) {
            if (histMeshId != currentMeshId) {
                return 0.0;
            }

            if (any(greaterThanEqual(coord, size))) {
                return 0.0;
            }

            return 1.0;
        }

        void main() {
            vec3 currentPosition = textureLinear(positionTex, vCoord).xyz;
            float currentMeshId = getMeshId(positionTex, vCoord);
           
            vec4 accumulatedLight = texture(lightTex, vCoord);
            vec3 currentLight = accumulatedLight.rgb / accumulatedLight.a;
            vec2 hCoord = reproject(currentPosition);
            vec2 hSizef = vec2(textureSize(previousLightTex, 0));
            vec2 hSizeInv = 1.0 / hSizef;
            ivec2 hSize = ivec2(hSizef);
            vec2 hTexelf = hCoord * hSizef - 0.5;
            ivec2 hTexel = ivec2(hTexelf);
            vec2 f = fract(hTexelf);
            ivec2 texel[] = ivec2[] (hTexel + ivec2(0, 0), hTexel + ivec2(1, 0), hTexel + ivec2(0, 1), hTexel + ivec2(1, 1));
            float weights[] = float[] ((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
            vec4 historyLight = vec4(0.);;
            vec2 historyMoment = vec2(0.);
            float historyLength = 0.;
            float sum = 0.;
            float luminance = 0.2126 * currentLight.x + 0.7152 * currentLight.y + 0.0722 * currentLight.z;
            float h = texelFetch(previousMomentLengthVarianceTex, hTexel, 0).b;
           
            if (h > 0.0 && currentMeshId > 0.0) {
                 // bilinear sampling, rejecting samples that don't have a matching mesh id
                for (int i = 0; i < 4; i++) {
                    vec2 gCoord = (vec2(texel[i]) + 0.5) * hSizeInv;
                   
                    float histMeshId = getMeshId(previousPositionTex, gCoord);
                   
                    float isValid = getValidMesh(histMeshId, currentMeshId, texel[i], hSize);
                   
                    float weight = isValid * weights[i];
                    
                    historyLight += weight * texelFetch(previousLightTex, texel[i], 0);
                    historyMoment += weight * texelFetch(previousMomentLengthVarianceTex, texel[i], 0).rg;
                    sum += weight;
                }

                if (sum > 0.0) {
                    historyLight /= sum;
                    historyMoment /= sum;
                } else {
                     // If all samples of bilinear fail, try a 3x3 box filter
                    hTexel = ivec2(hTexelf + 0.5);

                    for (int x = -1; x <= 1; x++) {
                        for (int y = -1; y <= 1; y++) {
                            ivec2 texel = hTexel + ivec2(x, y);
                            vec2 gCoord = (vec2(texel) + 0.5) * hSizeInv;
                            float histMeshId = getMeshId(previousPositionTex, gCoord);
                            float isValid = getValidMesh(histMeshId, currentMeshId, texel, hSize);
                            float weight = isValid;
                            historyLight += weight * texelFetch(previousLightTex, texel, 0);
                            historyMoment += weight * texelFetch(previousMomentLengthVarianceTex, texel, 0).rg;
                            sum += weight;
                        }
                    }

                    historyLight = sum > 0.0 ? historyLight / sum : historyLight;
                    historyMoment = sum > 0.0 ? historyMoment / sum : historyMoment;
                }

                if (sum > 0.0) {
                    historyLength = h + 1.;
                    float color_alpha_min = colorBlendFactor;
                    float moment_alpha_min = momentBlendFactor;
                    float color_alpha = max(1.0 / historyLength, color_alpha_min);
                    float moment_alpha = max(1.0 / historyLength, moment_alpha_min);
                   
                    out_light = color_alpha * accumulatedLight + historyLight * (1. - color_alpha);
                   
                    float first_moment = moment_alpha * historyMoment.x + (1.0 - moment_alpha) * luminance;
                    float second_moment = moment_alpha * historyMoment.y + (1.0 - moment_alpha) * luminance * luminance;
                    float variance = second_moment - first_moment * first_moment;
                   
                    out_momentLengthVariance = vec4(first_moment, second_moment, historyLength, variance);
                   
                    return;
                }
            }
            
            out_light = accumulatedLight;
            out_momentLengthVariance = vec4(luminance, luminance * luminance, 1., 100.);
        }
    `
};
