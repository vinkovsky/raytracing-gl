export const fragment = {
  source: `
        vec4 LGL_An(sampler2D map, vec2 uv) {
        #ifdef OES_texture_float_linear
            return texture(map, uv);
        #else
            vec2 size = vec2(textureSize(map, 0));
            vec2 texelSize = 1.0 / size;
            uv = uv * size - 0.5;
            vec2 f = fract(uv);
            uv = floor(uv) + 0.5;
            vec4 s1 = texture(map, (uv + vec2(0, 0)) * texelSize);
            vec4 s2 = texture(map, (uv + vec2(1, 0)) * texelSize);
            vec4 s3 = texture(map, (uv + vec2(0, 1)) * texelSize);
            vec4 s4 = texture(map, (uv + vec2(1, 1)) * texelSize);
            return mix(mix(s1, s2, f.x), mix(s3, s4, f.x), f.y);
        #endif
        }
        layout(location = 0) out vec4 out_light;
        layout(location = 1) out vec4 out_momentLengthVariance;
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
        vec2 LGL_As(vec3 position) {
            vec4 historyCoord = historyCamera * vec4(position, 1.0);
            return 0.5 * historyCoord.xy / historyCoord.w + 0.5;
        }
        float LGL_At(sampler2D meshIdTex, vec2 vCoord) {
            return floor(texture(meshIdTex, vCoord).w);
        }
        float LGL_Au(float histMeshId, float currentMeshId, ivec2 coord, ivec2 size) {
            if(histMeshId != currentMeshId) {
                return 0.0;
            }
            if(any(greaterThanEqual(coord, size))) {
                return 0.0;
            }
            return 1.0;
        }
        void main() {
            vec3 currentPosition = LGL_An(positionTex, vCoord).xyz;
            float currentMeshId = LGL_At(positionTex, vCoord);
            vec4 accumulatedLight = texture(lightTex, vCoord);
            vec3 currentLight = accumulatedLight.rgb / accumulatedLight.a;
            vec2 hCoord = LGL_As(currentPosition);
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
            float N = texelFetch(previousMomentLengthVarianceTex, hTexel, 0).b;
            if(N > 0.0 && currentMeshId > 0.0) {
                for(int i = 0; i < 4; i++) {
                    vec2 gCoord = (vec2(texel[i]) + 0.5) * hSizeInv;
                    float histMeshId = LGL_At(previousPositionTex, gCoord);
                    float isValid = LGL_Au(histMeshId, currentMeshId, texel[i], hSize);
                    float weight = isValid * weights[i];
                    historyLight += weight * texelFetch(previousLightTex, texel[i], 0);
                    historyMoment += weight * texelFetch(previousMomentLengthVarianceTex, texel[i], 0).rg;
                    sum += weight;
                }
                if(sum > 0.0) {
                    historyLight /= sum;
                    historyMoment /= sum;
                } else {
                    hTexel = ivec2(hTexelf + 0.5);
                    for(int x = -1; x <= 1; x++) {
                        for(int y = -1; y <= 1; y++) {
                            ivec2 texel = hTexel + ivec2(x, y);
                            vec2 gCoord = (vec2(texel) + 0.5) * hSizeInv;
                            float histMeshId = LGL_At(previousPositionTex, gCoord);
                            float isValid = LGL_Au(histMeshId, currentMeshId, texel, hSize);
                            float weight = isValid;
                            historyLight += weight * texelFetch(previousLightTex, texel, 0);
                            historyMoment += weight * texelFetch(previousMomentLengthVarianceTex, texel, 0).rg;
                            sum += weight;
                        }
                    }
                    historyLight = sum > 0.0 ? historyLight / sum : historyLight;
                    historyMoment = sum > 0.0 ? historyMoment / sum : historyMoment;
                }
                if(sum > 0.0) {
                    historyLength = N + 1.;
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
    `,
};
